const express = require('express');
const router = express.Router();
const dbService = require('../../database/database');
const AutomationEngine = require('../../automation/AutomationEngine');
const SanitizedLogger = require('../../utils/SanitizedLogger');

const logger = new SanitizedLogger('AutomationRoutes');

// GET /api/automations - list all flows
router.get('/', (req, res) => {
  const flows = dbService.prepare(`
    SELECT a.*, 
      (SELECT COUNT(*) FROM automation_steps WHERE automation_id = a.id) as step_count
    FROM automations a
    ORDER BY a.is_default DESC, a.id ASC
  `).all();
  res.json({ success: true, flows });
});

// GET /api/automations/:id - full flow with steps and options
router.get('/:id', (req, res) => {
  const flowId = parseInt(req.params.id, 10);
  const flow = dbService.prepare('SELECT * FROM automations WHERE id = ?').get(flowId);

  if (!flow) {
    return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  }

  const steps = dbService.prepare(`
    SELECT * FROM automation_steps WHERE automation_id = ? ORDER BY order_index ASC, id ASC
  `).all(flowId);

  for (const step of steps) {
    step.options = dbService.prepare(`
      SELECT * FROM automation_options WHERE step_id = ? ORDER BY order_index ASC, id ASC
    `).all(step.id);
  }

  res.json({ success: true, flow, steps });
});

// POST /api/automations - create new flow
router.post('/', (req, res) => {
  const { name, description = '', is_active = 1, is_default = 0 } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Nome do fluxo é obrigatório e deve ser texto.' });
  }

  if (is_default) {
    dbService.prepare('UPDATE automations SET is_default = 0').run();
  }

  const stmt = dbService.prepare(`
    INSERT INTO automations (name, description, is_active, is_default)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(name.trim(), description, is_active ? 1 : 0, is_default ? 1 : 0);
  const newId = Number(result.lastInsertRowid);

  logger.info(`Automation flow created: ID=${newId} name="${name}"`);
  res.status(201).json({ success: true, id: newId, message: 'Fluxo criado com sucesso.' });
});

// PUT /api/automations/:id - update flow
router.put('/:id', (req, res) => {
  const flowId = parseInt(req.params.id, 10);
  const { name, description, is_active, is_default, initial_step_id } = req.body;

  const existing = dbService.prepare('SELECT * FROM automations WHERE id = ?').get(flowId);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  }

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Nome do fluxo é obrigatório e deve ser texto não vazio.' });
    }
  }

  if (is_default) {
    dbService.prepare('UPDATE automations SET is_default = 0 WHERE id != ?').run(flowId);
  }

  const updatedName = name !== undefined ? name.trim() : existing.name;
  const updatedDesc = description !== undefined ? description : existing.description;
  const updatedActive = is_active !== undefined ? (is_active ? 1 : 0) : existing.is_active;
  const updatedDefault = is_default !== undefined ? (is_default ? 1 : 0) : existing.is_default;
  const updatedInitStep = initial_step_id !== undefined ? initial_step_id : existing.initial_step_id;

  dbService.prepare(`
    UPDATE automations 
    SET name = ?, description = ?, is_active = ?, is_default = ?, initial_step_id = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(updatedName, updatedDesc, updatedActive, updatedDefault, updatedInitStep, flowId);

  res.json({ success: true, message: 'Fluxo atualizado com sucesso.' });
});

// DELETE /api/automations/:id - delete flow
router.delete('/:id', (req, res) => {
  const flowId = parseInt(req.params.id, 10);
  const existing = dbService.prepare('SELECT * FROM automations WHERE id = ?').get(flowId);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  }

  // Cascading deletes on SQLite
  dbService.prepare('DELETE FROM automations WHERE id = ?').run(flowId);
  logger.info(`Automation flow deleted: ID=${flowId}`);
  res.json({ success: true, message: 'Fluxo excluído com sucesso.' });
});

// POST /api/automations/:id/duplicate - duplicate flow
router.post('/:id/duplicate', (req, res) => {
  const flowId = parseInt(req.params.id, 10);
  const flow = dbService.prepare('SELECT * FROM automations WHERE id = ?').get(flowId);
  if (!flow) {
    return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  }

  const newFlowRes = dbService.prepare(`
    INSERT INTO automations (name, description, is_active, is_default)
    VALUES (?, ?, 0, 0)
  `).run(`${flow.name} (Cópia)`, flow.description);
  const newFlowId = Number(newFlowRes.lastInsertRowid);

  const steps = dbService.prepare('SELECT * FROM automation_steps WHERE automation_id = ? ORDER BY order_index ASC').all(flowId);
  const stepIdMap = new Map();

  for (const step of steps) {
    const newStepRes = dbService.prepare(`
      INSERT INTO automation_steps (
        automation_id, name, order_index, message_text, wait_input,
        auto_reply, invalid_reply_text, max_attempts, on_max_attempts_action,
        is_final, create_task, task_title, task_priority, handoff_human
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newFlowId, step.name, step.order_index, step.message_text, step.wait_input,
      step.auto_reply, step.invalid_reply_text, step.max_attempts, step.on_max_attempts_action,
      step.is_final, step.create_task, step.task_title, step.task_priority, step.handoff_human
    );
    stepIdMap.set(step.id, Number(newStepRes.lastInsertRowid));
  }

  // Duplicate options with mapped new step IDs
  for (const step of steps) {
    const newStepId = stepIdMap.get(step.id);
    const options = dbService.prepare('SELECT * FROM automation_options WHERE step_id = ?').all(step.id);
    for (const opt of options) {
      const targetNextStepId = opt.next_step_id ? stepIdMap.get(opt.next_step_id) || null : null;
      dbService.prepare(`
        INSERT INTO automation_options (step_id, condition_type, condition_value, next_step_id, action_type, label, order_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(newStepId, opt.condition_type, opt.condition_value, targetNextStepId, opt.action_type, opt.label, opt.order_index);
    }
  }

  // Update initial step if mapped
  if (flow.initial_step_id && stepIdMap.has(flow.initial_step_id)) {
    dbService.prepare('UPDATE automations SET initial_step_id = ? WHERE id = ?')
      .run(stepIdMap.get(flow.initial_step_id), newFlowId);
  }

  logger.info(`Duplicated flow ID=${flowId} to new ID=${newFlowId}`);
  res.status(201).json({ success: true, id: newFlowId, message: 'Fluxo duplicado com sucesso.' });
});

// --- Steps Management ---

// --- Steps Management ---

// POST /api/automations/:id/steps - create step
router.post('/:id/steps', (req, res) => {
  const flowId = parseInt(req.params.id, 10);
  const flow = dbService.prepare('SELECT id FROM automations WHERE id = ?').get(flowId);
  if (!flow) {
    return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  }

  const {
    name, order_index = 0, message_text = '', wait_input = 1, auto_reply = 1,
    invalid_reply_text = 'Opção não reconhecida.', max_attempts = 3,
    on_max_attempts_action = 'handoff', is_final = 0, create_task = 0,
    task_title = '', task_priority = 'MEDIUM', handoff_human = 0
  } = req.body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Nome da etapa é obrigatório e deve ser texto.' });
  }

  if (max_attempts !== undefined && (typeof max_attempts !== 'number' || !Number.isInteger(max_attempts) || max_attempts <= 0)) {
    return res.status(400).json({ success: false, error: 'max_attempts deve ser um número inteiro maior que zero.' });
  }

  const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  if (task_priority && !validPriorities.includes(task_priority)) {
    return res.status(400).json({ success: false, error: 'Prioridade da tarefa inválida.' });
  }

  const result = dbService.prepare(`
    INSERT INTO automation_steps (
      automation_id, name, order_index, message_text, wait_input,
      auto_reply, invalid_reply_text, max_attempts, on_max_attempts_action,
      is_final, create_task, task_title, task_priority, handoff_human
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    flowId, name.trim(), order_index, message_text, wait_input ? 1 : 0,
    auto_reply ? 1 : 0, invalid_reply_text, max_attempts, on_max_attempts_action,
    is_final ? 1 : 0, create_task ? 1 : 0, task_title, task_priority, handoff_human ? 1 : 0
  );

  const stepId = Number(result.lastInsertRowid);

  // If flow has no initial_step_id, set this one
  const currentFlow = dbService.prepare('SELECT initial_step_id FROM automations WHERE id = ?').get(flowId);
  if (currentFlow && !currentFlow.initial_step_id) {
    dbService.prepare('UPDATE automations SET initial_step_id = ? WHERE id = ?').run(stepId, flowId);
  }

  res.status(201).json({ success: true, stepId, message: 'Etapa criada com sucesso.' });
});

// PUT /api/automations/steps/:stepId - update step
router.put('/steps/:stepId', (req, res) => {
  const stepId = parseInt(req.params.stepId, 10);
  const step = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(stepId);
  if (!step) {
    return res.status(404).json({ success: false, error: 'Etapa não encontrada.' });
  }

  const {
    name, order_index, message_text, wait_input, auto_reply,
    invalid_reply_text, max_attempts, on_max_attempts_action,
    is_final, create_task, task_title, task_priority, handoff_human
  } = req.body;

  if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
    return res.status(400).json({ success: false, error: 'Nome da etapa deve ser texto não vazio.' });
  }

  if (max_attempts !== undefined && (typeof max_attempts !== 'number' || !Number.isInteger(max_attempts) || max_attempts <= 0)) {
    return res.status(400).json({ success: false, error: 'max_attempts deve ser um número inteiro maior que zero.' });
  }

  const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  if (task_priority !== undefined && !validPriorities.includes(task_priority)) {
    return res.status(400).json({ success: false, error: 'Prioridade da tarefa inválida.' });
  }

  dbService.prepare(`
    UPDATE automation_steps SET
      name = COALESCE(?, name),
      order_index = COALESCE(?, order_index),
      message_text = COALESCE(?, message_text),
      wait_input = COALESCE(?, wait_input),
      auto_reply = COALESCE(?, auto_reply),
      invalid_reply_text = COALESCE(?, invalid_reply_text),
      max_attempts = COALESCE(?, max_attempts),
      on_max_attempts_action = COALESCE(?, on_max_attempts_action),
      is_final = COALESCE(?, is_final),
      create_task = COALESCE(?, create_task),
      task_title = COALESCE(?, task_title),
      task_priority = COALESCE(?, task_priority),
      handoff_human = COALESCE(?, handoff_human)
    WHERE id = ?
  `).run(
    name !== undefined ? name.trim() : null,
    order_index !== undefined ? order_index : null,
    message_text !== undefined ? message_text : null,
    wait_input !== undefined ? (wait_input ? 1 : 0) : null,
    auto_reply !== undefined ? (auto_reply ? 1 : 0) : null,
    invalid_reply_text !== undefined ? invalid_reply_text : null,
    max_attempts !== undefined ? max_attempts : null,
    on_max_attempts_action !== undefined ? on_max_attempts_action : null,
    is_final !== undefined ? (is_final ? 1 : 0) : null,
    create_task !== undefined ? (create_task ? 1 : 0) : null,
    task_title !== undefined ? task_title : null,
    task_priority !== undefined ? task_priority : null,
    handoff_human !== undefined ? (handoff_human ? 1 : 0) : null,
    stepId
  );

  res.json({ success: true, message: 'Etapa atualizada com sucesso.' });
});

// DELETE /api/automations/steps/:stepId - delete step
router.delete('/steps/:stepId', (req, res) => {
  const stepId = parseInt(req.params.stepId, 10);
  const step = dbService.prepare('SELECT * FROM automation_steps WHERE id = ?').get(stepId);
  if (!step) {
    return res.status(404).json({ success: false, error: 'Etapa não encontrada.' });
  }

  // Clear references from options and flow initial step
  dbService.prepare('UPDATE automation_options SET next_step_id = NULL WHERE next_step_id = ?').run(stepId);
  dbService.prepare('UPDATE automations SET initial_step_id = NULL WHERE initial_step_id = ?').run(stepId);

  dbService.prepare('DELETE FROM automation_steps WHERE id = ?').run(stepId);
  res.json({ success: true, message: 'Etapa excluída com sucesso.' });
});

// --- Options Management ---

// POST /api/automations/steps/:stepId/options - add option
router.post('/steps/:stepId/options', (req, res) => {
  const stepId = parseInt(req.params.stepId, 10);
  const step = dbService.prepare('SELECT id FROM automation_steps WHERE id = ?').get(stepId);
  if (!step) {
    return res.status(404).json({ success: false, error: 'Etapa não encontrada.' });
  }

  let { condition_type, condition_value, next_step_id = null, action_type = 'TRANSITION', label = '', order_index = 0 } = req.body;

  const validTypes = ['EXACT_MATCH', 'KEYWORD', 'NUMERIC_OPTION', 'ANY_TEXT', 'EMPTY'];
  if (!condition_type || !validTypes.includes(condition_type)) {
    return res.status(400).json({ success: false, error: 'Tipo da condição é obrigatório e deve ser válido.' });
  }

  const validActions = ['TRANSITION', 'END_FLOW', 'HANDOFF'];
  if (action_type && !validActions.includes(action_type)) {
    return res.status(400).json({ success: false, error: 'Tipo de ação inválido.' });
  }

  if (next_step_id) {
    const nextStep = dbService.prepare('SELECT id FROM automation_steps WHERE id = ?').get(next_step_id);
    if (!nextStep) {
      return res.status(400).json({ success: false, error: 'Etapa de destino inexistente.' });
    }
  }

  // ANY_TEXT matches any message, no expected value is required
  if (condition_type === 'ANY_TEXT') {
    condition_value = (condition_value && String(condition_value).trim()) ? String(condition_value).trim() : '*';
  } else if (condition_type === 'EMPTY') {
    condition_value = '';
  } else if (condition_value === undefined || condition_value === null || !String(condition_value).trim()) {
    return res.status(400).json({ success: false, error: 'Valor esperado é obrigatório para este tipo de condição.' });
  }

  const result = dbService.prepare(`
    INSERT INTO automation_options (step_id, condition_type, condition_value, next_step_id, action_type, label, order_index)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(stepId, condition_type, condition_value, next_step_id || null, action_type, label, order_index);

  res.status(201).json({ success: true, optionId: Number(result.lastInsertRowid), message: 'Opção adicionada com sucesso.' });
});

// PUT /api/automations/options/:optionId - update option
router.put('/options/:optionId', (req, res) => {
  const optionId = parseInt(req.params.optionId, 10);
  const opt = dbService.prepare('SELECT * FROM automation_options WHERE id = ?').get(optionId);
  if (!opt) {
    return res.status(404).json({ success: false, error: 'Opção não encontrada.' });
  }

  let { condition_type, condition_value, next_step_id, action_type, label, order_index } = req.body;

  const validTypes = ['EXACT_MATCH', 'KEYWORD', 'NUMERIC_OPTION', 'ANY_TEXT', 'EMPTY'];
  if (condition_type !== undefined && !validTypes.includes(condition_type)) {
    return res.status(400).json({ success: false, error: 'Tipo de condição inválido.' });
  }

  const validActions = ['TRANSITION', 'END_FLOW', 'HANDOFF'];
  if (action_type !== undefined && !validActions.includes(action_type)) {
    return res.status(400).json({ success: false, error: 'Tipo de ação inválido.' });
  }

  if (next_step_id) {
    const nextStep = dbService.prepare('SELECT id FROM automation_steps WHERE id = ?').get(next_step_id);
    if (!nextStep) {
      return res.status(400).json({ success: false, error: 'Etapa de destino inexistente.' });
    }
  }

  const targetType = condition_type || opt.condition_type;
  if (targetType === 'ANY_TEXT') {
    condition_value = (condition_value && String(condition_value).trim()) ? String(condition_value).trim() : '*';
  } else if (targetType === 'EMPTY') {
    condition_value = '';
  }

  dbService.prepare(`
    UPDATE automation_options SET
      condition_type = COALESCE(?, condition_type),
      condition_value = COALESCE(?, condition_value),
      next_step_id = ?,
      action_type = COALESCE(?, action_type),
      label = COALESCE(?, label),
      order_index = COALESCE(?, order_index)
    WHERE id = ?
  `).run(
    condition_type || null,
    condition_value !== undefined ? condition_value : null,
    next_step_id !== undefined ? (next_step_id || null) : opt.next_step_id,
    action_type || null,
    label !== undefined ? label : null,
    order_index !== undefined ? order_index : null,
    optionId
  );

  res.json({ success: true, message: 'Opção atualizada com sucesso.' });
});

// DELETE /api/automations/options/:optionId - delete option
router.delete('/options/:optionId', (req, res) => {
  const optionId = parseInt(req.params.optionId, 10);
  const opt = dbService.prepare('SELECT id FROM automation_options WHERE id = ?').get(optionId);
  if (!opt) {
    return res.status(404).json({ success: false, error: 'Opção não encontrada.' });
  }

  dbService.prepare('DELETE FROM automation_options WHERE id = ?').run(optionId);
  res.json({ success: true, message: 'Opção excluída com sucesso.' });
});

// POST /api/automations/test-simulate (Test Mode Simulator - Deterministic, Ephemeral)
router.post('/test-simulate', (req, res) => {
  const { flowId, stepId, input } = req.body;
  if (!flowId) {
    return res.status(400).json({ success: false, error: 'ID do fluxo é obrigatório.' });
  }

  const flow = dbService.prepare('SELECT id FROM automations WHERE id = ?').get(flowId);
  if (!flow) {
    return res.status(404).json({ success: false, error: 'Fluxo não encontrado.' });
  }

  if (stepId) {
    const step = dbService.prepare('SELECT id FROM automation_steps WHERE id = ? AND automation_id = ?').get(stepId, flowId);
    if (!step) {
      return res.status(404).json({ success: false, error: 'Etapa não encontrada no fluxo.' });
    }
  }

  try {
    const simulationResult = AutomationEngine.simulateStep({ flowId, stepId, input });
    res.json({
      success: true,
      result: simulationResult,
      note: 'Simulação determinística executada em memória. Conteúdo descartado.'
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
