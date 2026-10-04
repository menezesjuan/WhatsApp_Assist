const express = require('express');
const router = express.Router();
const dbService = require('../../database/database');
const WhatsAppManager = require('../../whatsapp/WhatsAppManager');
const AutomationEngine = require('../../automation/AutomationEngine');
const TaskManager = require('../../tasks/TaskManager');

// GET /api/stats/dashboard
router.get('/dashboard', (req, res) => {
  // 1. WhatsApp status
  const waStatus = WhatsAppManager.getStatus();
  const adapterType = WhatsAppManager.getAdapterType();
  const clientInfo = WhatsAppManager.getClientInfo();

  // 2. Active automations count
  const activeFlowsRes = dbService.prepare('SELECT count(*) as count FROM automations WHERE is_active = 1').get();
  const activeFlowsCount = activeFlowsRes ? activeFlowsRes.count : 0;

  // 3. Pending tasks count & list
  const pendingTasksCount = TaskManager.getPendingCount();
  const pendingTasks = TaskManager.getTasks({ status: 'PENDING', limit: 10 });

  // 4. In-progress automations and waiting human count from StateMachine
  const activeSessions = AutomationEngine.stateMachine.getActiveSessions();
  const inProgressCount = activeSessions.filter(s => s.status === 'AUTOMATION_ACTIVE' || s.status === 'WAITING_INPUT' || s.status === 'PROCESSING_INPUT').length;
  const waitingHumanCount = activeSessions.filter(s => s.status === 'WAITING_HUMAN' || s.status === 'HANDOFF').length;

  // 5. Technical errors count
  const errorsRes = dbService.prepare("SELECT count(*) as count FROM event_metadata WHERE event_type LIKE '%ERROR%'").get();
  const errorsCount = errorsRes ? errorsRes.count : 0;

  // 6. Recent technical events (sanitized timeline, no message content!)
  const recentEvents = TaskManager.getRecentEvents(25);

  res.json({
    success: true,
    stats: {
      whatsappStatus: waStatus,
      adapterType,
      clientInfo,
      activeFlowsCount,
      pendingTasksCount,
      inProgressCount,
      waitingHumanCount,
      errorsCount
    },
    pendingTasks,
    activeSessions,
    recentEvents
  });
});

module.exports = router;
