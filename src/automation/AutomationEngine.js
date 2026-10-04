const dbService = require('../database/database');
const StateMachine = require('./StateMachine');
const RuleEngine = require('./RuleEngine');
const ActionExecutor = require('./ActionExecutor');
const BusinessHoursChecker = require('./BusinessHoursChecker');
const TaskManager = require('../tasks/TaskManager');
const EventBus = require('../utils/EventBus');
const IdempotencyGuard = require('../utils/IdempotencyGuard');
const SanitizedLogger = require('../utils/SanitizedLogger');
const config = require('../config/config');

const logger = new SanitizedLogger('AutomationEngine');

class AutomationEngine {
  constructor() {
    this.stateMachine = new StateMachine();
    this.idempotencyGuard = new IdempotencyGuard(config.safety.idempotencyTtlMs);
    this.contactCooldown = new Map();
    this.isProcessing = false;
    this._initListeners();
  }

  _initListeners() {
    // Listen to incoming messages emitted by WhatsAppManager
    EventBus.subscribe(EventBus.EVENTS.MESSAGE_RECEIVED, async (msgPayload) => {
      try {
        await this.handleIncomingMessage(msgPayload);
      } catch (err) {
        logger.error(`Error processing incoming message: ${err.message}`, {
          contactId: msgPayload?.from
        });
      }
    });

    // When operator sends a message or handoff occurs, ensure stateMachine pauses automation for that contact
    EventBus.subscribe(EventBus.EVENTS.HUMAN_HANDOFF, (payload) => {
      if (payload && payload.contactId) {
        this.stateMachine.takeover(payload.contactId);
      }
    });
  }

  /**
   * Main entry point for processing incoming customer messages
   * Principle: PROCESS -> DECIDE -> DISCARD
   * @param {object} msg
   * @param {string} msg.id
   * @param {string} msg.from JID/Phone
   * @param {string} [msg.fromName]
   * @param {string} msg.body Message text (in-memory ONLY)
   * @param {boolean} [msg.isGroup]
   */
  async handleIncomingMessage(msg) {
    if (!msg || !msg.from) return;

    // Discard group messages initially (first customer contact is private 1-to-1)
    if (msg.isGroup) {
      return;
    }

    const contactId = msg.from;
    const contactName = msg.fromName || 'Cliente';

    // 1. Idempotency Check (in-memory with TTL)
    if (this.idempotencyGuard.isDuplicate(msg.id)) {
      logger.info('Duplicate message detected within TTL; discarding.', { contactId });
      return;
    }

    // Contact flood debounce: avoid processing rapid burst messages within 500ms from same contact
    const now = Date.now();
    const lastTime = this.contactCooldown.get(contactId) || 0;
    if (now - lastTime < 500) {
      logger.debug('Mensagem recebida em sequência rápida; ignorando disparo repetido.', { contactId });
      return;
    }
    this.contactCooldown.set(contactId, now);

    // 2. Fetch system settings
    const settings = this._getSettings();
    if (settings.automation_enabled === 'false') {
      logger.info('Automation is globally disabled; ignoring message.', { contactId });
      return;
    }

    // 3. State Machine: retrieve current contact session
    const session = this.stateMachine.getOrCreateSession(contactId, contactName);

    // 4. If contact is already waiting for human intervention or operator took over, HALT
    if (session.status === StateMachine.STATES.WAITING_HUMAN || session.status === StateMachine.STATES.HANDOFF) {
      logger.info('Contact is currently in WAITING_HUMAN / HANDOFF; automation halted.', { contactId });
      // Notify operator of new incoming activity without storing message
      EventBus.publish(EventBus.EVENTS.HUMAN_HANDOFF, {
        contactId,
        contactName,
        status: session.status,
        info: 'Nova mensagem recebida de contato aguardando operador'
      });
      // Immediately discard text
      return;
    }

    // 5. Business Hours Check
    const hoursCheck = BusinessHoursChecker.isWithinBusinessHours(settings);
    if (!hoursCheck.isWithinHours) {
      logger.info('Message arrived outside business hours', { contactId });
      const action = settings.out_of_hours_action || 'reply_and_task';

      if (action.includes('reply')) {
        await ActionExecutor.sendOutOfHoursMessage(contactId, settings.out_of_hours_message);
      }

      if (action.includes('task')) {
        TaskManager.createTask({
          contactId,
          contactName,
          title: 'Atendimento fora do horário de expediente',
          priority: 'MEDIUM',
          lastMessage: msg.body
        });
      }

      this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
      return; // Discard content
    }

    // 6. If contact is NEW or has completed previous flow
    if (session.status === StateMachine.STATES.NEW || session.status === StateMachine.STATES.COMPLETED) {
      session.lastMessage = msg.body;
      await this._startDefaultFlow(session, contactId, contactName, settings);
      return; // Discard content
    }

    // 7. If contact is in WAITING_INPUT
    if (session.status === StateMachine.STATES.WAITING_INPUT) {
      session.lastMessage = msg.body;
      await this._processStepInput(session, msg.body, settings);
      return; // Discard content
    }

    // 8. If in any other state, fallback
    logger.info(`Session in state [${session.status}], no action taken.`, { contactId });
  }

  async _startDefaultFlow(session, contactId, contactName, settings = {}) {
    // Find active default flow
    const flow = dbService.prepare(`
      SELECT * FROM automations WHERE is_active = 1 ORDER BY is_default DESC, id ASC LIMIT 1
    `).get();

    if (!flow) {
      logger.warn('No active automation flow found in system.');
      TaskManager.createTask({
        contactId,
        contactName,
        title: 'Novo contato sem fluxo ativo configurado',
        priority: 'HIGH',
        lastMessage: session.lastMessage || ''
      });
      this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
      return;
    }

    // Get initial step
    let step = null;
    if (flow.initial_step_id) {
      step = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(flow.initial_step_id);
    }
    if (!step) {
      step = dbService.prepare('SELECT * FROM automation_steps WHERE automation_id = ? ORDER BY order_index ASC LIMIT 1').get(flow.id);
    }

    if (!step) {
      logger.warn(`Flow ${flow.id} has no configured steps.`);
      this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
      return;
    }

    logger.info(`Starting flow "${flow.name}" (ID ${flow.id}) for contact`, { contactId });
    this.stateMachine.transition(contactId, StateMachine.STATES.AUTOMATION_ACTIVE, {
      flowId: flow.id,
      flowName: flow.name,
      stepId: step.id,
      stepName: step.name
    });

    // Execute step action
    await ActionExecutor.executeStep(step, session, flow, settings);

    // If step expects user input, wait for input; otherwise check if final
    if (step.wait_input && !step.is_final && !step.handoff_human) {
      this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_INPUT, {
        stepId: step.id,
        stepName: step.name
      });
    } else {
      const targetState = (step.is_final || step.handoff_human)
        ? StateMachine.STATES.WAITING_HUMAN
        : StateMachine.STATES.COMPLETED;
      this.stateMachine.transition(contactId, targetState, {
        stepId: step.id,
        stepName: step.name
      });
    }

    EventBus.publish(EventBus.EVENTS.AUTOMATION_STARTED, {
      contactId,
      flowId: flow.id,
      flowName: flow.name,
      stepId: step.id,
      stepName: step.name
    });
  }

  async _processStepInput(session, rawInput, settings) {
    const contactId = session.contactId;
    const currentStepId = session.stepId;

    if (!currentStepId) {
      logger.warn('No stepId found for session in WAITING_INPUT', { contactId });
      this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
      return;
    }

    const step = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(currentStepId);
    if (!step) {
      logger.error(`Step ${currentStepId} not found in database.`, { contactId });
      this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
      return;
    }

    // Fetch options for current step
    const options = dbService.prepare('SELECT * FROM automation_options WHERE step_id = ? ORDER BY order_index ASC').all(currentStepId);

    this.stateMachine.transition(contactId, StateMachine.STATES.PROCESSING_INPUT);

    // Evaluate input deterministically using RuleEngine
    const matchResult = RuleEngine.evaluate(options, rawInput);

    if (matchResult.matchedOption) {
      const option = matchResult.matchedOption;
      this.stateMachine.resetInvalidAttempts(contactId);

      logger.info(`Option matched: "${option.label || option.condition_value}" (Reason: ${matchResult.reason})`, {
        contactId,
        stepId: currentStepId
      });

      // Handle next step or handoff
      if (option.action_type === 'HANDOFF' || !option.next_step_id) {
        TaskManager.createTask({
          contactId: session.contactId,
          contactName: session.contactName,
          title: `Encaminhado para humano: ${step.name}`,
          type: 'HANDOFF',
          priority: 'HIGH',
          flowId: session.flowId,
          flowName: session.flowName,
          stepId: step.id,
          stepName: step.name,
          lastMessage: input
        });
        this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
        return;
      }

      // Transition to next configured step
      const nextStep = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(option.next_step_id);
      if (!nextStep) {
        logger.error(`Next step ${option.next_step_id} not found!`, { contactId });
        this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
        return;
      }

      // Loop detection and transition
      const transResult = this.stateMachine.transition(contactId, StateMachine.STATES.AUTOMATION_ACTIVE, {
        stepId: nextStep.id,
        stepName: nextStep.name
      });

      if (transResult.hasLoop) {
        TaskManager.createTask({
          contactId: session.contactId,
          contactName: session.contactName,
          title: `Alerta: Loop detectado no fluxo (${transResult.reason})`,
          type: 'LOOP_PROTECTION',
          priority: 'URGENT',
          flowId: session.flowId,
          flowName: session.flowName,
          stepId: nextStep.id,
          stepName: nextStep.name,
          lastMessage: input
        });
        return;
      }

      // Execute next step action
      await ActionExecutor.executeStep(nextStep, session, { id: session.flowId, name: session.flowName }, settings);

      // Determine next state
      if (nextStep.is_final || nextStep.handoff_human) {
        this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN, {
          stepId: nextStep.id,
          stepName: nextStep.name
        });
        EventBus.publish(EventBus.EVENTS.AUTOMATION_COMPLETED, {
          contactId,
          flowId: session.flowId,
          stepId: nextStep.id
        });
      } else if (nextStep.wait_input) {
        this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_INPUT, {
          stepId: nextStep.id,
          stepName: nextStep.name
        });
      } else {
        this.stateMachine.transition(contactId, StateMachine.STATES.COMPLETED, {
          stepId: nextStep.id,
          stepName: nextStep.name
        });
      }

    } else {
      // No option matched: handle invalid response
      const attempts = this.stateMachine.incrementInvalidAttempts(contactId);
      const maxAttempts = step.max_attempts || parseInt(settings.max_invalid_attempts, 10) || 3;

      logger.info(`Invalid response from contact (Attempt ${attempts}/${maxAttempts})`, { contactId });

      if (attempts >= maxAttempts) {
        // Exceeded maximum invalid attempts: end cycle or handoff to human
        logger.warn('Max invalid attempts reached. Handing off to human operator.', { contactId });
        await ActionExecutor.sendInvalidResponse(
          contactId,
          settings.fallback_message || 'Limite de tentativas atingido. Um atendente humano irá assumir o seu atendimento.'
        );

        TaskManager.createTask({
          contactId: session.contactId,
          contactName: session.contactName,
          title: `Tentativas esgotadas em: ${step.name}`,
          type: 'MAX_ATTEMPTS_EXCEEDED',
          priority: 'HIGH',
          flowId: session.flowId,
          flowName: session.flowName,
          stepId: step.id,
          stepName: step.name,
          lastMessage: input
        });

        this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_HUMAN);
      } else {
        // Send guidance message and remain in WAITING_INPUT
        const invalidText = step.invalid_reply_text || settings.fallback_message || 'Opção não reconhecida. Por favor, tente novamente.';
        await ActionExecutor.sendInvalidResponse(contactId, invalidText);
        this.stateMachine.transition(contactId, StateMachine.STATES.WAITING_INPUT);
      }
    }
  }

  /**
   * Test Mode simulator: executes simulation without physical WhatsApp
   * Pure in-memory deterministic dry-run
   */
  simulateStep({ flowId, stepId, input }) {
    const flow = dbService.prepare('SELECT * FROM automations WHERE id = ?').get(flowId);
    if (!flow) throw new Error('Fluxo não encontrado.');

    let currentStep = null;
    if (stepId) {
      currentStep = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(stepId);
    } else {
      currentStep = dbService.prepare('SELECT * FROM automation_steps WHERE automation_id = ? ORDER BY order_index ASC LIMIT 1').get(flowId);
    }
    if (!currentStep) throw new Error('Etapa não encontrada no fluxo.');

    // If input is empty and this is the initial step invocation
    if (input === undefined || input === null) {
      return {
        matched: true,
        reason: 'INITIAL_STEP',
        currentStep: { id: currentStep.id, name: currentStep.name },
        outboundReply: currentStep.auto_reply ? currentStep.message_text : null,
        nextStep: null,
        isFinal: Boolean(currentStep.is_final),
        willCreateTask: Boolean(currentStep.create_task || currentStep.is_final)
      };
    }

    const options = dbService.prepare('SELECT * FROM automation_options WHERE step_id = ? ORDER BY order_index ASC').all(currentStep.id);
    const evalRes = RuleEngine.evaluate(options, input);

    if (evalRes.matchedOption) {
      const opt = evalRes.matchedOption;
      let nextStep = null;
      if (opt.next_step_id) {
        nextStep = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(opt.next_step_id);
      }

      return {
        matched: true,
        reason: evalRes.reason,
        matchedOption: {
          label: opt.label,
          type: opt.condition_type,
          value: opt.condition_value
        },
        currentStep: { id: currentStep.id, name: currentStep.name },
        nextStep: nextStep ? { id: nextStep.id, name: nextStep.name } : null,
        outboundReply: nextStep && nextStep.auto_reply ? nextStep.message_text : '(Princípio Não Responder: Nenhuma mensagem enviada)',
        isFinal: nextStep ? Boolean(nextStep.is_final) : true,
        willCreateTask: nextStep ? Boolean(nextStep.create_task || nextStep.is_final) : true
      };
    } else {
      return {
        matched: false,
        reason: evalRes.reason,
        currentStep: { id: currentStep.id, name: currentStep.name },
        outboundReply: currentStep.invalid_reply_text || 'Opção não reconhecida.',
        nextStep: null,
        isFinal: false,
        willCreateTask: false
      };
    }
  }

  _getSettings() {
    const rows = dbService.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return map;
  }
}

const instance = new AutomationEngine();
module.exports = instance;
