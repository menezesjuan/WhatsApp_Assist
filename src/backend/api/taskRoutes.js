const express = require('express');
const router = express.Router();
const TaskManager = require('../../tasks/TaskManager');
const AutomationEngine = require('../../automation/AutomationEngine');
const WhatsAppManager = require('../../whatsapp/WhatsAppManager');
const WhatsAppAdapter = require('../../whatsapp/WhatsAppAdapter');
const SanitizedLogger = require('../../utils/SanitizedLogger');

const logger = new SanitizedLogger('TaskRoutes');

// GET /api/tasks - list tasks
router.get('/', (req, res) => {
  let { status, priority, limit = 100, offset = 0 } = req.query;
  if (status === 'undefined' || status === 'null' || status === 'ALL' || status === '') status = undefined;
  if (priority === 'undefined' || priority === 'null' || priority === 'ALL' || priority === '') priority = undefined;

  const tasks = TaskManager.getTasks({
    status,
    priority,
    limit: parseInt(limit, 10),
    offset: parseInt(offset, 10)
  });
  res.json({ success: true, tasks, pendingCount: TaskManager.getPendingCount() });
});

// GET /api/tasks/stats - summary numbers
router.get('/stats', (req, res) => {
  const pending = TaskManager.getPendingCount();
  res.json({
    success: true,
    pending,
    total: TaskManager.getTasks().length
  });
});

// GET /api/tasks/:id/photo - retrieve photo for contact
router.get('/:id/photo', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const task = TaskManager.getTaskById(taskId);
  if (!task) return res.status(404).json({ success: false, error: 'Task não encontrada.' });

  if (task.photo_url) {
    return res.json({ success: true, photoUrl: task.photo_url });
  }

  try {
    const pic = await WhatsAppManager.getProfilePicUrl(task.contact_id);
    if (pic) {
      TaskManager.updateTaskPhoto(task.contact_id, pic);
      return res.json({ success: true, photoUrl: pic });
    }
  } catch (_) {}

  res.json({ success: true, photoUrl: null });
});

// PATCH /api/tasks/:id/status - update task status
router.patch('/:id/status', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { status, assigned_to } = req.body;

  if (!status) {
    return res.status(400).json({ success: false, error: 'Status é obrigatório.' });
  }

  try {
    const updated = TaskManager.updateTaskStatus(taskId, status, assigned_to);
    res.json({ success: true, task: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/tasks/:id/takeover - operator takes over conversation
router.post('/:id/takeover', (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { operator_name = 'Operador' } = req.body;

  const task = TaskManager.getTaskById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task não encontrada.' });
  }

  // Update task to IN_PROGRESS
  TaskManager.updateTaskStatus(taskId, 'IN_PROGRESS', operator_name);

  // Transition state machine for that contact to HANDOFF
  if (task.contact_id) {
    AutomationEngine.stateMachine.takeover(task.contact_id);
    logger.info(`Operator took over contact ${task.contact_id} via task ${taskId}`);
  }

  res.json({
    success: true,
    message: 'Atendimento assumido pelo operador. A automação neste chat foi pausada.',
    whatsappWebUrl: task.whatsappWebUrl,
    whatsappAppUrl: task.whatsappAppUrl
  });
});

// POST /api/tasks/:id/send-reply - operator sends message directly to task contact via button click
router.post('/:id/send-reply', async (req, res) => {
  const taskId = parseInt(req.params.id, 10);
  const { message, operator_name = 'Operador', resolve = false } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Texto da resposta é obrigatório.' });
  }

  const task = TaskManager.getTaskById(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task não encontrada.' });
  }

  const currentStatus = WhatsAppManager.getStatus();
  if (currentStatus !== WhatsAppAdapter.STATUS.CONNECTED) {
    return res.status(400).json({
      success: false,
      error: `WhatsApp não conectado (Status: ${currentStatus}). Conecte a sessão para enviar.`
    });
  }

  try {
    const sendResult = await WhatsAppManager.sendMessage(task.contact_id, message.trim());
    if (!sendResult.success) {
      return res.status(500).json({ success: false, error: sendResult.error || 'Falha ao enviar resposta via WhatsApp.' });
    }

    const newStatus = resolve ? 'RESOLVED' : 'IN_PROGRESS';
    const updatedTask = TaskManager.updateTaskStatus(taskId, newStatus, operator_name);

    if (task.contact_id) {
      AutomationEngine.stateMachine.takeover(task.contact_id);
    }

    logger.info(`Operator sent reply to contact ${task.contact_id} for task ${taskId}`);
    return res.json({
      success: true,
      message: 'Resposta enviada com sucesso ao cliente!',
      task: updatedTask
    });
  } catch (err) {
    logger.error(`Error sending task reply: ${err.message}`, { taskId });
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
