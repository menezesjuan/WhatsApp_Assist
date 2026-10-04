const WhatsAppAdapter = require('../whatsapp/WhatsAppAdapter');
const WhatsAppManager = require('../whatsapp/WhatsAppManager');
const TaskManager = require('../tasks/TaskManager');
const EventBus = require('../utils/EventBus');
const StateMachine = require('./StateMachine');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('ActionExecutor');

class ActionExecutor {
  /**
   * Executes step actions and outbound reply
   * @param {object} step Step record from database
   * @param {object} session Contact session from StateMachine
   * @param {object} [flow] Automation flow record
   * @returns {Promise<{ replySent: boolean, error?: string }>}
   */
  static async executeStep(step, session, flow = {}, settings = {}) {
    const contactId = session.contactId;
    let replySent = false;

    // 1. Check if an automatic message should be sent
    // Principle: "Não responder é melhor" -> if auto_reply is 0 or false, do NOT send text!
    // Principle: If reply_mode is 'manual_click', NEVER send automatically, only when operator clicks!
    const isManualClickMode = settings && settings.reply_mode === 'manual_click';
    const shouldSend = !isManualClickMode && Boolean(step.auto_reply) && Boolean(step.message_text && step.message_text.trim());

    if (isManualClickMode && Boolean(step.message_text && step.message_text.trim())) {
      logger.info('Modo de envio manual ativo: mensagem retida aguardando clique de autorização do operador.', {
        contactId,
        stepId: step.id
      });
    }

    if (shouldSend) {
      const waStatus = WhatsAppManager.getStatus();
      if (waStatus !== WhatsAppAdapter.STATUS.CONNECTED) {
        logger.warn(`Cannot send automatic message: WhatsApp status is [${waStatus}]`, { contactId });
        EventBus.publish(EventBus.EVENTS.AUTOMATION_ERROR, {
          contactId,
          error: `WhatsApp não conectado (${waStatus})`
        });
      } else {
        try {
          const sendRes = await WhatsAppManager.sendMessage(contactId, step.message_text);
          if (sendRes.success) {
            replySent = true;
            logger.info('Outbound automatic reply dispatched successfully', { contactId, stepId: step.id });
          } else {
            logger.error('Failed to dispatch outbound reply', { contactId, error: sendRes.error });
          }
        } catch (err) {
          logger.error(`Exception dispatching outbound reply: ${err.message}`, { contactId });
        }
      }
    } else {
      logger.info('Princípio "Não responder é melhor": Nenhuma mensagem automática enviada para esta etapa.', {
        contactId,
        stepId: step.id
      });
    }

    // 2. Create Task if configured
    if (step.create_task || step.is_final || step.handoff_human) {
      try {
        TaskManager.createTask({
          contactId: session.contactId,
          contactName: session.contactName,
          title: step.task_title || `Atendimento: ${step.name}`,
          type: step.handoff_human ? 'HANDOFF' : 'FLOW_COMPLETED',
          priority: step.task_priority || 'MEDIUM',
          flowId: flow.id || session.flowId,
          flowName: flow.name || session.flowName,
          stepId: step.id,
          stepName: step.name,
          lastMessage: session.lastMessage || step.message_text || ''
        });
      } catch (taskErr) {
        logger.error(`Error creating task for step: ${taskErr.message}`, { contactId });
      }
    }

    return { replySent };
  }

  /**
   * Dispatches invalid input response message
   */
  static async sendInvalidResponse(contactId, invalidReplyText) {
    if (!invalidReplyText) return false;

    const waStatus = WhatsAppManager.getStatus();
    if (waStatus !== WhatsAppAdapter.STATUS.CONNECTED) {
      logger.warn('WhatsApp not connected; skipping invalid response message.', { contactId });
      return false;
    }

    try {
      await WhatsAppManager.sendMessage(contactId, invalidReplyText);
      logger.info('Invalid response guidance sent to contact', { contactId });
      return true;
    } catch (err) {
      logger.error(`Failed to send invalid response text: ${err.message}`, { contactId });
      return false;
    }
  }

  /**
   * Dispatches out of business hours message
   */
  static async sendOutOfHoursMessage(contactId, messageText) {
    if (!messageText) return false;
    const waStatus = WhatsAppManager.getStatus();
    if (waStatus !== WhatsAppAdapter.STATUS.CONNECTED) return false;

    try {
      await WhatsAppManager.sendMessage(contactId, messageText);
      logger.info('Out of hours message sent to contact', { contactId });
      return true;
    } catch (err) {
      logger.error(`Failed to send out of hours message: ${err.message}`, { contactId });
      return false;
    }
  }
}

module.exports = ActionExecutor;
