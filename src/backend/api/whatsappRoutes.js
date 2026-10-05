const express = require('express');
const router = express.Router();
const WhatsAppManager = require('../../whatsapp/WhatsAppManager');
const WhatsAppAdapter = require('../../whatsapp/WhatsAppAdapter');
const SanitizedLogger = require('../../utils/SanitizedLogger');

const logger = new SanitizedLogger('WhatsAppRoutes');

// GET /api/whatsapp/status
router.get('/status', (req, res) => {
  res.json({
    status: WhatsAppManager.getStatus(),
    adapterType: WhatsAppManager.getAdapterType(),
    qr: WhatsAppManager.getQRCode(),
    clientInfo: WhatsAppManager.getClientInfo(),
    statuses: WhatsAppAdapter.STATUS
  });
});

// POST /api/whatsapp/connect
router.post('/connect', async (req, res) => {
  try {
    logger.info('Received connect request');
    // Connect in background so endpoint returns quickly
    WhatsAppManager.connect().catch(err => {
      logger.error(`Error connecting WhatsApp: ${err.message}`);
    });

    res.json({
      success: true,
      message: 'Conexão iniciada. Aguarde o QR Code ou status Conectado.',
      status: WhatsAppManager.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/disconnect
router.post('/disconnect', async (req, res) => {
  try {
    logger.info('Received disconnect request');
    await WhatsAppManager.disconnect();
    res.json({
      success: true,
      message: 'WhatsApp desconectado com sucesso.',
      status: WhatsAppManager.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/adapter
router.post('/adapter', (req, res) => {
  const { type } = req.body;
  try {
    const result = WhatsAppManager.switchAdapter(type);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/simulate (Sandbox simulator for testing without real phone)
router.post('/simulate', (req, res) => {
  const { phone = '5511999998888', text = '1', name = 'Cliente Teste' } = req.body;
  if (!text) {
    return res.status(400).json({ success: false, error: 'Texto da mensagem simulada é obrigatório.' });
  }
  const result = WhatsAppManager.simulateIncoming(phone, text, name);
  res.json({
    success: true,
    message: 'Mensagem simulada enviada para o Automation Engine.',
    note: 'Princípio de Privacidade: O texto será processado em memória e descartado imediatamente.'
  });
});

// POST /api/whatsapp/send-manual (Operator explicit click-to-send)
router.post('/send-manual', async (req, res) => {
  const { contactId, message } = req.body;
  if (!contactId || !message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Identificador do contato e mensagem são obrigatórios.' });
  }

  const currentStatus = WhatsAppManager.getStatus();
  if (currentStatus !== WhatsAppAdapter.STATUS.CONNECTED) {
    return res.status(400).json({
      success: false,
      error: `WhatsApp não está conectado (Status atual: ${currentStatus}). Conecte a sessão antes de enviar.`
    });
  }

  try {
    const sendResult = await WhatsAppManager.sendMessage(contactId, message.trim());
    if (sendResult.success) {
      logger.info('Manual message sent by operator via UI click', { contactId });
      return res.json({
        success: true,
        message: 'Mensagem autorizada e enviada com sucesso ao contato.'
      });
    } else {
      return res.status(500).json({ success: false, error: sendResult.error || 'Falha ao enviar mensagem.' });
    }
  } catch (err) {
    logger.error(`Error sending manual message: ${err.message}`, { contactId });
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp/chats - list active conversation contacts
router.get('/chats', async (req, res) => {
  try {
    const TaskManager = require('../../tasks/TaskManager');
    const AutomationEngine = require('../../automation/AutomationEngine');

    const tasks = TaskManager.getTasks({ limit: 50 });
    const activeSessions = AutomationEngine.stateMachine.getActiveSessions();
    const chatsMap = new Map();

    for (const t of tasks) {
      if (!chatsMap.has(t.contact_id)) {
        chatsMap.set(t.contact_id, {
          contactId: t.contact_id,
          name: t.contact_name || t.contact_id,
          lastMessage: t.last_message || t.title,
          timestamp: new Date(t.updated_at || t.created_at).getTime(),
          status: t.status,
          priority: t.priority,
          taskId: t.id,
          photoUrl: t.photo_url || null,
          whatsappWebUrl: t.whatsappWebUrl
        });
      }
    }

    for (const s of activeSessions) {
      if (!chatsMap.has(s.contactId)) {
        const rawDigits = (s.contactId || '').replace(/\D/g, '');
        const cleanNumber = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
        chatsMap.set(s.contactId, {
          contactId: s.contactId,
          name: s.contactName || s.contactId,
          lastMessage: s.lastMessage || s.stepName || 'Em atendimento',
          timestamp: s.lastActivity || Date.now(),
          status: s.status,
          priority: 'MEDIUM',
          taskId: null,
          photoUrl: null,
          whatsappWebUrl: `https://web.whatsapp.com/send?phone=${cleanNumber}`
        });
      }
    }

    const chatsList = Array.from(chatsMap.values());
    chatsList.sort((a, b) => b.timestamp - a.timestamp);

    res.json({ success: true, chats: chatsList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/whatsapp/chats/:contactId/messages - get conversation history
router.get('/chats/:contactId/messages', async (req, res) => {
  const { contactId } = req.params;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);

  try {
    const messages = await WhatsAppManager.getChatMessages(contactId, limit);
    const photoUrl = await WhatsAppManager.getProfilePicUrl(contactId);

    res.json({
      success: true,
      contactId,
      photoUrl,
      messages
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/whatsapp/chats/:contactId/messages - send operator message
router.post('/chats/:contactId/messages', async (req, res) => {
  const { contactId } = req.params;
  const { message } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Mensagem não pode ser vazia.' });
  }

  const currentStatus = WhatsAppManager.getStatus();
  if (currentStatus !== WhatsAppAdapter.STATUS.CONNECTED) {
    return res.status(400).json({
      success: false,
      error: `WhatsApp não conectado (Status: ${currentStatus}). Conecte para enviar.`
    });
  }

  try {
    const AutomationEngine = require('../../automation/AutomationEngine');
    const sendResult = await WhatsAppManager.sendMessage(contactId, message.trim());
    if (!sendResult.success) {
      return res.status(500).json({ success: false, error: sendResult.error || 'Erro ao enviar mensagem.' });
    }

    // Also pause automation for this contact (handoff)
    AutomationEngine.stateMachine.takeover(contactId);

    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso ao cliente!',
      id: sendResult.id
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
