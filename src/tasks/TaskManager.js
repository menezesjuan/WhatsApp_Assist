const dbService = require('../database/database');
const EventBus = require('../utils/EventBus');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('TaskManager');

class TaskManager {
  /**
   * Creates a new human task
   * @param {object} params
   * @param {string} params.contactId
   * @param {string} [params.contactName]
   * @param {string} [params.title]
   * @param {string} [params.type]
   * @param {string} [params.priority]
   * @param {number} [params.flowId]
   * @param {string} [params.flowName]
   * @param {number} [params.stepId]
   * @param {string} [params.stepName]
   * @returns {object} Created task
   */
  createTask({
    contactId,
    contactName = '',
    title = 'Atendimento aguardando intervenção humana',
    type = 'HUMAN_INTERVENTION',
    priority = 'MEDIUM',
    flowId = null,
    flowName = null,
    stepId = null,
    stepName = null,
    lastMessage = '',
    photoUrl = null
  }) {
    const cleanPhone = (contactId || '').replace(/\D/g, '');
    const stmt = dbService.prepare(`
      INSERT INTO tasks (
        contact_id, contact_name, type, status, priority, title,
        flow_id, flow_name, step_id, step_name, last_message, photo_url, created_at, updated_at
      ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);

    const result = stmt.run(
      contactId,
      contactName,
      type,
      priority,
      title,
      flowId,
      flowName,
      stepId,
      stepName,
      lastMessage,
      photoUrl
    );

    const taskId = Number(result.lastInsertRowid);
    const task = this.getTaskById(taskId);

    logger.info(`Task created: ID=${taskId} for contact=${contactId} title="${title}"`);

    // Log technical event (NO message content!)
    this._logEvent('TASK_CREATED', contactId, flowId, stepId, taskId, `Task criada: ${title} (${priority})`);

    // Publish event for real-time frontend notification
    EventBus.publish(EventBus.EVENTS.TASK_CREATED, {
      task,
      pendingCount: this.getPendingCount()
    });

    return task;
  }

  getTaskById(id) {
    const row = dbService.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!row) return null;
    return this._formatTask(row);
  }

  getTasks({ status, priority, limit = 100, offset = 0 } = {}) {
    let sql = 'SELECT * FROM tasks WHERE 1=1';
    const params = [];

    if (status && status !== 'ALL' && status !== 'undefined' && status !== 'null') {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (priority && priority !== 'ALL' && priority !== 'undefined' && priority !== 'null') {
      sql += ' AND priority = ?';
      params.push(priority);
    }

    sql += " ORDER BY CASE status WHEN 'PENDING' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END, id DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const rows = dbService.prepare(sql).all(...params);
    return rows.map(r => this._formatTask(r));
  }

  getPendingCount() {
    const res = dbService.prepare("SELECT count(*) as count FROM tasks WHERE status = 'PENDING'").get();
    return res ? res.count : 0;
  }

  updateTaskStatus(id, newStatus, assignedTo = null) {
    const valid = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'];
    if (!valid.includes(newStatus)) {
      throw new Error(`Invalid task status: ${newStatus}`);
    }

    let sql = "UPDATE tasks SET status = ?, updated_at = datetime('now')";
    const params = [newStatus];

    if (assignedTo !== null) {
      sql += ', assigned_to = ?';
      params.push(assignedTo);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    dbService.prepare(sql).run(...params);
    const updatedTask = this.getTaskById(id);

    logger.info(`Task ${id} status updated to: ${newStatus}`);

    this._logEvent(
      newStatus === 'RESOLVED' ? 'TASK_COMPLETED' : 'TASK_UPDATED',
      updatedTask?.contact_id,
      updatedTask?.flow_id,
      updatedTask?.step_id,
      id,
      `Task ${id} atualizada para ${newStatus}`
    );

    EventBus.publish(newStatus === 'RESOLVED' ? EventBus.EVENTS.TASK_COMPLETED : EventBus.EVENTS.TASK_UPDATED, {
      task: updatedTask,
      pendingCount: this.getPendingCount()
    });

    return updatedTask;
  }

  updateTaskPhoto(contactId, photoUrl) {
    if (!photoUrl || !contactId) return;
    try {
      dbService.prepare('UPDATE tasks SET photo_url = ? WHERE contact_id = ?').run(photoUrl, contactId);
    } catch (_) {}
  }

  _formatTask(row) {
    const rawDigits = (row.contact_id || '').replace(/\D/g, '');
    const cleanNumber = rawDigits.startsWith('55') ? rawDigits : `55${rawDigits}`;
    return {
      ...row,
      last_message: row.last_message || row.title || 'Solicitação de atendimento',
      photo_url: row.photo_url || null,
      // Helper URL for operator to jump directly into the WhatsApp Web conversation
      whatsappWebUrl: `https://web.whatsapp.com/send?phone=${cleanNumber}`,
      whatsappAppUrl: `https://api.whatsapp.com/send?phone=${cleanNumber}`
    };
  }

  _logEvent(eventType, contactId, flowId, stepId, taskId, summary) {
    try {
      dbService.prepare(`
        INSERT INTO event_metadata (event_type, contact_id, flow_id, step_id, task_id, summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventType, contactId || null, flowId || null, stepId || null, taskId || null, summary);
    } catch (err) {
      logger.error('Failed to log event metadata', { err: err.message });
    }
  }

  getRecentEvents(limit = 30) {
    return dbService.prepare(`
      SELECT * FROM event_metadata ORDER BY id DESC LIMIT ?
    `).all(limit);
  }
}

const instance = new TaskManager();
module.exports = instance;
