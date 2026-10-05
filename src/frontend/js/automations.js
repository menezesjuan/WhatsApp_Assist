/**
 * WhatsApp Assist - Automations / flow editor view
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

// --- 3. AUTOMATIONS & TIMELINE VIEW ---
async function loadAutomations(selectFlowId = null) {
  try {
    const data = await window.api.getAutomations();
    flowsList = data.flows || [];

    const dropdown = document.getElementById('flowSelectDropdown');
    if (!dropdown) return;

    if (flowsList.length === 0) {
      dropdown.innerHTML = '<option value="">Nenhum fluxo encontrado</option>';
      return;
    }

    const activeFlow = flowsList.find(f => f.id === selectFlowId) ||
      flowsList.find(f => f.is_default) ||
      flowsList[0];

    selectedFlowId = activeFlow ? activeFlow.id : null;

    dropdown.innerHTML = flowsList.map(f => `
      <option value="${f.id}" ${f.id === selectedFlowId ? 'selected' : ''}>
        ${escapeHtml(f.name)} ${f.is_default ? '★ (Padrão)' : ''}
      </option>
    `).join('');

    if (selectedFlowId) {
      await loadAndRenderMindMap(selectedFlowId);
    }
  } catch (err) {
    console.error('Error loading automations:', err);
  }
}

const flowSelectDropdown = document.getElementById('flowSelectDropdown');
if (flowSelectDropdown) {
  flowSelectDropdown.addEventListener('change', async (e) => {
    selectedFlowId = parseInt(e.target.value, 10);
    await loadAndRenderMindMap(selectedFlowId);
  });
}

window.addStepToCurrentFlow = () => {
  if (!currentEditingFlow || !currentEditingFlow.flow) return;
  document.getElementById('btnAddStepBtn').click();
};

async function loadAndRenderMindMap(flowId) {
  try {
    const data = await window.api.getAutomation(flowId);
    currentEditingFlow = data;
    const flow = data.flow;

    const titleEl = document.getElementById('timelineFlowTitle');
    if (titleEl) {
      titleEl.innerHTML = `<i class="bi bi-clock-history text-primary me-2"></i> ${escapeHtml(flow.name)}`;
    }

    const descEl = document.getElementById('currentFlowDescDisplay');
    if (descEl) descEl.textContent = flow.description || 'Fluxo de triagem determinístico.';

    const activeBadge = document.getElementById('currentFlowActiveBadge');
    if (activeBadge) {
      activeBadge.textContent = flow.is_active ? 'Ativo' : 'Inativo';
      activeBadge.className = `badge ${flow.is_active ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-secondary-subtle text-secondary'}`;
    }

    const defaultBadge = document.getElementById('currentFlowDefaultBadge');
    if (defaultBadge) {
      defaultBadge.style.display = flow.is_default ? 'inline-block' : 'none';
    }

    renderHorizontalStepper(data.steps || [], flow);
    renderMindMapCanvas(data);
    renderStructuredStepsList(data.steps || []);
  } catch (err) {
    console.error('Error loading mind map:', err);
  }
}

// Renders the horizontal stepper timeline matching the reference image
function renderHorizontalStepper(steps, flow) {
  const track = document.getElementById('visualStepperTrack');
  if (!track) return;

  if (steps.length === 0) {
    track.innerHTML = '<div class="text-center text-muted py-4 w-100">Nenhuma etapa configurada ainda. Clique em "Nova Etapa" para começar.</div>';
    return;
  }

  const total = steps.length;
  const progressPct = total > 1 ? Math.min(100, Math.round(((total - 1) / total) * 100)) : 25;

  let html = `<div class="stepper-timeline-progress" style="width: ${progressPct}%;"></div>`;

  steps.forEach((step, idx) => {
    const isInitial = idx === 0;
    const isFinal = step.is_final || step.handoff_human;
    const circleClass = isInitial ? 'rocket' : (isFinal ? 'percentage' : 'completed');
    const icon = isInitial
      ? '<i class="bi bi-rocket-takeoff-fill"></i>'
      : (isFinal ? '<i class="bi bi-headset"></i>' : '<i class="bi bi-check-lg"></i>');

    html += `
      <div class="stepper-node-item">
        <span class="stepper-node-date ${idx <= 1 ? 'active' : ''}">Etapa ${idx + 1}</span>
        <div class="stepper-node-circle ${circleClass}">
          ${icon}
        </div>
        <div class="stepper-node-title">${escapeHtml(step.name)}</div>
        <div class="stepper-node-desc">${step.is_final ? 'Finaliza ciclo' : (step.wait_input ? 'Aguarda resposta' : 'Automática')}</div>
        ${isInitial ? `
          <div class="stepper-milestone-flag green">
            <i class="bi bi-flag-fill"></i>
            <span>Início</span>
          </div>
        ` : (step.create_task || step.handoff_human ? `
          <div class="stepper-milestone-flag red">
            <i class="bi bi-flag-fill"></i>
            <span>Gera Task</span>
          </div>
        ` : '')}
      </div>
    `;
  });

  track.innerHTML = html;
}

function renderMindMapCanvas(data) {
  const tree = document.getElementById('mindmapTree');
  if (!tree) return;
  const flow = data.flow;
  const steps = data.steps || [];

  if (steps.length === 0) {
    tree.innerHTML = `
      <div class="text-center text-muted py-5 w-100">
        <h5 class="text-dark fw-bold mb-2">Este fluxo ainda não possui etapas</h5>
        <p class="small mb-3">Comece adicionando a primeira etapa (o menu inicial de primeiro atendimento).</p>
        <button class="btn btn-primary btn-sm" onclick="window.addStepToCurrentFlow()">
          <i class="bi bi-plus-lg me-1"></i> Criar Etapa Inicial
        </button>
      </div>
    `;
    return;
  }

  const rootStep = steps.find(s => s.id === flow.initial_step_id) || steps[0];
  const rootOptions = rootStep.options || [];
  const childSteps = steps.filter(s => s.id !== rootStep.id);

  // Level 1: Root Node
  const level1Html = `
    <div class="mindmap-level" id="mm-level-1">
      <div class="mindmap-node root-node" id="mm-node-${rootStep.id}">
        <div class="mindmap-node-header">
          <span class="badge bg-success-subtle text-success border border-success-subtle">
            <i class="bi bi-lightning-fill me-1"></i> ETAPA INICIAL
          </span>
          <button class="btn btn-sm btn-outline-secondary p-1" onclick="window.editStep(${rootStep.id})" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
        </div>
        <div class="mindmap-node-title">${escapeHtml(rootStep.name)}</div>
        <div class="mindmap-node-bubble">${escapeHtml(rootStep.message_text || '(Sem mensagem)')}</div>
        <div class="mindmap-node-footer">
          <span>${rootOptions.length} opções</span>
          <button class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size: 0.75rem;" onclick="window.addOption(${rootStep.id})">
            + Regra
          </button>
        </div>
      </div>
    </div>
  `;

  // Level 2: Decision Branches
  const level2Html = `
    <div class="mindmap-level" id="mm-level-2">
      ${rootOptions.map(opt => `
        <div class="mindmap-branch-card" id="mm-branch-${opt.id}" onclick="window.editOptionModal(${opt.id}, ${rootStep.id})">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-primary-subtle text-primary border border-primary-subtle" style="font-size: 0.75rem;">
              ${opt.condition_type === 'ANY_TEXT' ? '⚡ Qualquer Texto' : (opt.condition_type === 'EMPTY' ? '∅ Vazio' : escapeHtml(opt.condition_value))}
            </span>
            <strong>${escapeHtml(opt.label || (opt.condition_type === 'ANY_TEXT' ? 'Qualquer Resposta' : opt.condition_value))}</strong>
          </div>
          <button type="button" class="btn-close" style="font-size: 0.65rem;" onclick="event.stopPropagation(); window.deleteOption(${opt.id})" title="Excluir regra"></button>
        </div>
      `).join('')}
      <button type="button" class="btn btn-sm btn-outline-primary w-100 py-2 border-dashed" onclick="window.addOption(${rootStep.id})">
        + Nova Regra de Opção
      </button>
    </div>
  `;

  // Level 3: Target Steps
  const level3Html = `
    <div class="mindmap-level" id="mm-level-3">
      ${childSteps.map(step => `
        <div class="mindmap-node" id="mm-node-${step.id}">
          <div class="mindmap-node-header">
            <span class="badge ${step.is_final ? 'bg-danger-subtle text-danger' : 'bg-info-subtle text-info'}">
              ${step.is_final ? '🏁 FINAL' : 'ETAPA'}
            </span>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-secondary p-1" onclick="window.editStep(${step.id})" title="Editar">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-sm btn-outline-danger p-1" onclick="window.deleteStep(${step.id})" title="Excluir">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>
          <div class="mindmap-node-title">${escapeHtml(step.name)}</div>
          <div class="mindmap-node-bubble">${escapeHtml(step.message_text || (step.auto_reply ? '(Vazio)' : 'Princípio: Não Responder (Silencioso)'))}</div>
          <div class="mindmap-node-footer">
            ${step.create_task ? `<span class="badge bg-warning-subtle text-warning">👤 Task: ${escapeHtml(step.task_title || 'Atendimento')}</span>` : '<span></span>'}
            <button class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size: 0.75rem;" onclick="window.addOption(${step.id})">+ Regra</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  tree.innerHTML = level1Html + level2Html + level3Html;

  setTimeout(() => drawMindMapConnections(rootStep), 50);
}

function drawMindMapConnections(rootStep) {
  const svg = document.getElementById('mindmapSvgCanvas');
  const tree = document.getElementById('mindmapTree');
  if (!svg || !tree) return;

  svg.innerHTML = '';
  const treeRect = tree.getBoundingClientRect();
  if (!rootStep) return;

  const rootEl = document.getElementById(`mm-node-${rootStep.id}`);
  if (!rootEl) return;

  const rootRect = rootEl.getBoundingClientRect();
  const rootX = (rootRect.right - treeRect.left) + tree.offsetLeft;
  const rootY = (rootRect.top + rootRect.height / 2 - treeRect.top) + tree.offsetTop;

  const options = rootStep.options || [];

  for (const opt of options) {
    const branchEl = document.getElementById(`mm-branch-${opt.id}`);
    if (!branchEl) continue;

    const branchRect = branchEl.getBoundingClientRect();
    const branchLeftX = (branchRect.left - treeRect.left) + tree.offsetLeft;
    const branchLeftY = (branchRect.top + branchRect.height / 2 - treeRect.top) + tree.offsetTop;
    const branchRightX = (branchRect.right - treeRect.left) + tree.offsetLeft;
    const branchRightY = branchLeftY;

    // 1. Root to Branch
    const dx1 = Math.abs(branchLeftX - rootX) * 0.5;
    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', `M ${rootX},${rootY} C ${rootX + dx1},${rootY} ${branchLeftX - dx1},${branchLeftY} ${branchLeftX},${branchLeftY}`);
    path1.setAttribute('class', 'mindmap-path');
    svg.appendChild(path1);

    // 2. Branch to Target Step
    if (opt.next_step_id) {
      const targetStepEl = document.getElementById(`mm-node-${opt.next_step_id}`);
      if (targetStepEl) {
        const targetRect = targetStepEl.getBoundingClientRect();
        const targetX = (targetRect.left - treeRect.left) + tree.offsetLeft;
        const targetY = (targetRect.top + targetRect.height / 2 - treeRect.top) + tree.offsetTop;

        const dx2 = Math.abs(targetX - branchRightX) * 0.5;
        const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path2.setAttribute('d', `M ${branchRightX},${branchRightY} C ${branchRightX + dx2},${branchRightY} ${targetX - dx2},${targetY} ${targetX},${targetY}`);
        path2.setAttribute('class', 'mindmap-path option-line');
        svg.appendChild(path2);
      }
    }
  }
}

function renderStructuredStepsList(steps) {
  const container = document.getElementById('flowStepsContainer');
  if (!container) return;

  if (steps.length === 0) {
    container.innerHTML = '<div class="text-center text-muted py-4">Nenhuma etapa criada neste fluxo ainda.</div>';
    return;
  }

  container.innerHTML = steps.map((s, idx) => `
    <div class="card border mb-3 shadow-sm rounded-3">
      <div class="card-header bg-light d-flex align-items-center justify-content-between py-2 px-3 border-0">
        <div class="d-flex align-items-center gap-2">
          <span class="badge bg-primary rounded-pill">${idx + 1}</span>
          <span class="fw-bold text-dark">${escapeHtml(s.name)}</span>
          ${s.is_final ? '<span class="badge bg-danger-subtle text-danger">Final</span>' : ''}
          ${s.handoff_human ? '<span class="badge bg-warning-subtle text-warning">Handoff</span>' : ''}
          ${s.create_task ? '<span class="badge bg-info-subtle text-info">Cria Task</span>' : ''}
        </div>
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary" onclick="window.editStep(${s.id})">
            <i class="bi bi-pencil me-1"></i> Editar
          </button>
          <button type="button" class="btn btn-outline-danger" onclick="window.deleteStep(${s.id})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
      <div class="card-body p-3">
        <div class="p-2 bg-light rounded text-secondary small mb-3">
          ${s.message_text ? escapeHtml(s.message_text).replace(/\n/g, '<br>') : '<em class="text-muted">(Sem mensagem automática)</em>'}
        </div>

        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="small fw-bold text-uppercase text-muted">Regras de Decisão (${(s.options || []).length})</span>
          <button type="button" class="btn btn-sm btn-outline-primary py-0 px-2" style="font-size: 0.75rem;" onclick="window.addOption(${s.id})">
            + Regra
          </button>
        </div>

        ${(s.options || []).map(opt => `
          <div class="d-flex align-items-center justify-content-between p-2 mb-1 bg-white rounded border small">
            <div>
              <strong>${escapeHtml(opt.label || (opt.condition_type === 'ANY_TEXT' ? 'Qualquer Resposta' : opt.condition_value))}</strong>
              <span class="badge bg-info-subtle text-info ms-2">
                ${opt.condition_type === 'ANY_TEXT' ? '⚡ Qualquer Texto' : (opt.condition_type === 'EMPTY' ? '∅ Mensagem Vazia' : `${opt.condition_type}: "${escapeHtml(opt.condition_value)}"`)}
              </span>
              ${opt.action_type === 'HANDOFF' ? '<span class="badge bg-warning-subtle text-warning ms-1">Handoff</span>' : ''}
            </div>
            <button type="button" class="btn-close" style="font-size: 0.65rem;" onclick="window.deleteOption(${opt.id})"></button>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// --- New Flow Modal ---
const btnNewFlow = document.getElementById('btnNewFlow');
if (btnNewFlow) {
  btnNewFlow.addEventListener('click', () => {
    document.getElementById('flowEditId').value = '';
    document.getElementById('flowNameInput').value = '';
    document.getElementById('flowDescInput').value = '';
    document.getElementById('flowIsActive').checked = true;
    document.getElementById('flowIsDefault').checked = false;
    document.getElementById('flowModalTitle').textContent = 'Novo Fluxo de Atendimento';
    openModal('flowModal');
  });
}

const btnOpenFlowModalTop = document.getElementById('btnOpenFlowModalTop');
if (btnOpenFlowModalTop) {
  btnOpenFlowModalTop.addEventListener('click', () => {
    if (btnNewFlow) btnNewFlow.click();
  });
}

const btnEditFlowMetadata = document.getElementById('btnEditFlowMetadata');
if (btnEditFlowMetadata) {
  btnEditFlowMetadata.addEventListener('click', () => {
    if (!currentEditingFlow || !currentEditingFlow.flow) return;
    const f = currentEditingFlow.flow;
    document.getElementById('flowEditId').value = f.id;
    document.getElementById('flowNameInput').value = f.name;
    document.getElementById('flowDescInput').value = f.description || '';
    document.getElementById('flowIsActive').checked = Boolean(f.is_active);
    document.getElementById('flowIsDefault').checked = Boolean(f.is_default);
    document.getElementById('flowModalTitle').textContent = `Editar Fluxo: ${f.name}`;
    openModal('flowModal');
  });
}

const flowModalSave = document.getElementById('flowModalSave');
if (flowModalSave) {
  flowModalSave.addEventListener('click', async () => {
    const id = document.getElementById('flowEditId').value;
    const name = document.getElementById('flowNameInput').value.trim();
    const description = document.getElementById('flowDescInput').value.trim();
    const is_active = document.getElementById('flowIsActive').checked;
    const is_default = document.getElementById('flowIsDefault').checked;

    if (!name) {
      showToast('Nome do fluxo é obrigatório.', 'warning');
      return;
    }

    try {
      if (id) {
        await window.api.updateAutomation(id, { name, description, is_active, is_default });
        showToast('Fluxo atualizado!', 'success');
      } else {
        const res = await window.api.createAutomation({ name, description, is_active, is_default });
        showToast('Fluxo criado!', 'success');
        closeModal('flowModal');
        await loadAutomations(res.id);
        return;
      }
      closeModal('flowModal');
      await loadAutomations(id);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}

const flowModalCancel = document.getElementById('flowModalCancel');
if (flowModalCancel) flowModalCancel.addEventListener('click', () => closeModal('flowModal'));
const flowModalClose = document.getElementById('flowModalClose');
if (flowModalClose) flowModalClose.addEventListener('click', () => closeModal('flowModal'));

const btnDuplicateFlow = document.getElementById('btnDuplicateFlow');
if (btnDuplicateFlow) {
  btnDuplicateFlow.addEventListener('click', async () => {
    if (!selectedFlowId) return;
    try {
      const res = await window.api.duplicateAutomation(selectedFlowId);
      showToast('Fluxo duplicado com sucesso!', 'success');
      await loadAutomations(res.id);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}

// --- Step Modal Handlers ---
const btnAddStepBtn = document.getElementById('btnAddStepBtn');
if (btnAddStepBtn) {
  btnAddStepBtn.addEventListener('click', () => {
    if (!currentEditingFlow || !currentEditingFlow.flow) return;
    document.getElementById('stepEditId').value = '';
    document.getElementById('stepFlowId').value = currentEditingFlow.flow.id;
    document.getElementById('stepNameInput').value = '';
    document.getElementById('stepMessageInput').value = '';
    document.getElementById('stepWaitInput').checked = true;
    document.getElementById('stepAutoReply').checked = true;
    document.getElementById('stepInvalidReplyInput').value = 'Não consegui identificar sua opção. Digite uma opção válida.';
    document.getElementById('stepMaxAttemptsInput').value = 3;
    document.getElementById('stepIsFinal').checked = false;
    document.getElementById('stepCreateTask').checked = false;
    document.getElementById('stepHandoff').checked = false;
    document.getElementById('stepTaskTitleInput').value = '';
    document.getElementById('stepTaskPriorityInput').value = 'MEDIUM';
    document.getElementById('stepModalTitle').textContent = 'Nova Etapa';
    openModal('stepModal');
  });
}

window.editStep = (stepId) => {
  if (!currentEditingFlow) return;
  const step = currentEditingFlow.steps.find(s => s.id === stepId);
  if (!step) return;

  currentEditingStep = step;
  document.getElementById('stepEditId').value = step.id;
  document.getElementById('stepFlowId').value = step.automation_id;
  document.getElementById('stepNameInput').value = step.name;
  document.getElementById('stepMessageInput').value = step.message_text || '';
  document.getElementById('stepWaitInput').checked = Boolean(step.wait_input);
  document.getElementById('stepAutoReply').checked = Boolean(step.auto_reply);
  document.getElementById('stepInvalidReplyInput').value = step.invalid_reply_text || '';
  document.getElementById('stepMaxAttemptsInput').value = step.max_attempts || 3;
  document.getElementById('stepIsFinal').checked = Boolean(step.is_final);
  document.getElementById('stepCreateTask').checked = Boolean(step.create_task);
  document.getElementById('stepHandoff').checked = Boolean(step.handoff_human);
  document.getElementById('stepTaskTitleInput').value = step.task_title || '';
  document.getElementById('stepTaskPriorityInput').value = step.task_priority || 'MEDIUM';
  document.getElementById('stepModalTitle').textContent = `Editar Etapa: ${step.name}`;
  openModal('stepModal');
};

const stepModalSave = document.getElementById('stepModalSave');
if (stepModalSave) {
  stepModalSave.addEventListener('click', async () => {
    const flowId = document.getElementById('stepFlowId').value;
    const stepId = document.getElementById('stepEditId').value;
    const name = document.getElementById('stepNameInput').value.trim();

    if (!name) {
      showToast('Nome da etapa é obrigatório.', 'warning');
      return;
    }

    const payload = {
      name,
      message_text: document.getElementById('stepMessageInput').value.trim(),
      wait_input: document.getElementById('stepWaitInput').checked ? 1 : 0,
      auto_reply: document.getElementById('stepAutoReply').checked ? 1 : 0,
      invalid_reply_text: document.getElementById('stepInvalidReplyInput').value.trim(),
      max_attempts: parseInt(document.getElementById('stepMaxAttemptsInput').value, 10) || 3,
      is_final: document.getElementById('stepIsFinal').checked ? 1 : 0,
      create_task: document.getElementById('stepCreateTask').checked ? 1 : 0,
      handoff_human: document.getElementById('stepHandoff').checked ? 1 : 0,
      task_title: document.getElementById('stepTaskTitleInput').value.trim(),
      task_priority: document.getElementById('stepTaskPriorityInput').value
    };

    try {
      if (stepId) {
        await window.api.updateStep(stepId, payload);
        showToast('Etapa atualizada!', 'success');
      } else {
        await window.api.createStep(flowId, payload);
        showToast('Etapa adicionada!', 'success');
      }
      closeModal('stepModal');
      await loadAndRenderMindMap(selectedFlowId);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}

const stepModalCancel = document.getElementById('stepModalCancel');
if (stepModalCancel) stepModalCancel.addEventListener('click', () => closeModal('stepModal'));
const stepModalClose = document.getElementById('stepModalClose');
if (stepModalClose) stepModalClose.addEventListener('click', () => closeModal('stepModal'));

window.deleteStep = async (stepId) => {
  if (!confirm('Deseja realmente remover esta etapa do fluxo?')) return;
  try {
    await window.api.deleteStep(stepId);
    showToast('Etapa excluída.', 'info');
    await loadAndRenderMindMap(selectedFlowId);
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

// --- Option Modal Handlers ---
const optionConditionType = document.getElementById('optionConditionType');
const optionConditionHelp = document.getElementById('optionConditionHelp');
const optionConditionValueCol = document.getElementById('optionConditionValueCol');
const optionConditionNoticeCol = document.getElementById('optionConditionNoticeCol');
const optionConditionNoticeText = document.getElementById('optionConditionNoticeText');
const optionConditionValue = document.getElementById('optionConditionValue');

function updateOptionConditionFields(type) {
  if (type === 'ANY_TEXT') {
    if (optionConditionValueCol) optionConditionValueCol.style.display = 'none';
    if (optionConditionNoticeCol) optionConditionNoticeCol.style.display = 'block';
    if (optionConditionNoticeText) {
      optionConditionNoticeText.innerHTML = '💬 <strong>Qualquer Texto:</strong> Não é necessário valor esperado. Qualquer mensagem enviada pelo cliente acionará esta regra.';
    }
    if (optionConditionValue) optionConditionValue.value = '*';
  } else if (type === 'EMPTY') {
    if (optionConditionValueCol) optionConditionValueCol.style.display = 'none';
    if (optionConditionNoticeCol) optionConditionNoticeCol.style.display = 'block';
    if (optionConditionNoticeText) {
      optionConditionNoticeText.innerHTML = '💬 <strong>Mensagem Vazia:</strong> Esta regra é acionada quando o cliente envia uma mensagem sem conteúdo textual.';
    }
    if (optionConditionValue) optionConditionValue.value = '';
  } else {
    if (optionConditionValueCol) optionConditionValueCol.style.display = 'block';
    if (optionConditionNoticeCol) optionConditionNoticeCol.style.display = 'none';
    if (optionConditionValue && (optionConditionValue.value === '*' || optionConditionValue.value === '')) {
      optionConditionValue.value = type === 'NUMERIC_OPTION' ? '1' : '';
    }
    const hints = {
      NUMERIC_OPTION: 'Número esperado que o cliente irá digitar (ex: 1, 2, 3).',
      KEYWORD: 'Palavras-chave separadas por vírgula (ex: orcamento, orcar, preco).',
      EXACT_MATCH: 'O cliente deve digitar exatamente este texto.'
    };
    if (optionConditionHelp) {
      optionConditionHelp.textContent = hints[type] || 'Critério determinístico para transição de etapa.';
    }
  }
}

if (optionConditionType) {
  optionConditionType.addEventListener('change', (e) => {
    updateOptionConditionFields(e.target.value);
  });
}

window.addOption = (stepId) => {
  if (!currentEditingFlow) return;
  document.getElementById('optionEditId').value = '';
  document.getElementById('optionStepId').value = stepId;
  document.getElementById('optionLabelInput').value = '';
  document.getElementById('optionConditionType').value = 'NUMERIC_OPTION';
  document.getElementById('optionConditionValue').value = '1';
  document.getElementById('optionActionType').value = 'TRANSITION';
  updateOptionConditionFields('NUMERIC_OPTION');

  const select = document.getElementById('optionNextStepSelect');
  select.innerHTML = '<option value="">(Nenhuma / Finalizar)</option>' +
    (currentEditingFlow.steps || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  document.getElementById('optionModalTitle').textContent = 'Nova Regra de Opção';
  openModal('optionModal');
};

window.editOptionModal = (optionId, stepId) => {
  if (!currentEditingFlow) return;
  const step = currentEditingFlow.steps.find(s => s.id === stepId);
  const opt = (step?.options || []).find(o => o.id === optionId);
  if (!opt) return;

  document.getElementById('optionEditId').value = opt.id;
  document.getElementById('optionStepId').value = stepId;
  document.getElementById('optionLabelInput').value = opt.label || '';
  document.getElementById('optionConditionType').value = opt.condition_type;
  document.getElementById('optionConditionValue').value = opt.condition_value;
  document.getElementById('optionActionType').value = opt.action_type || 'TRANSITION';
  updateOptionConditionFields(opt.condition_type);

  const select = document.getElementById('optionNextStepSelect');
  select.innerHTML = '<option value="">(Nenhuma / Finalizar)</option>' +
    (currentEditingFlow.steps || []).map(s => `<option value="${s.id}" ${opt.next_step_id === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');

  document.getElementById('optionModalTitle').textContent = `Editar Regra: ${opt.label || opt.condition_value}`;
  openModal('optionModal');
};

const optionModalSave = document.getElementById('optionModalSave');
if (optionModalSave) {
  optionModalSave.addEventListener('click', async () => {
    const editId = document.getElementById('optionEditId').value;
    const stepId = document.getElementById('optionStepId').value;
    const label = document.getElementById('optionLabelInput').value.trim();
    const condition_type = document.getElementById('optionConditionType').value;
    let condition_value = document.getElementById('optionConditionValue').value.trim();
    const action_type = document.getElementById('optionActionType').value;
    const next_step_id = document.getElementById('optionNextStepSelect').value || null;

    if (condition_type === 'ANY_TEXT') {
      condition_value = '*';
    } else if (condition_type === 'EMPTY') {
      condition_value = '';
    } else if (!condition_value) {
      showToast('Por favor, informe o valor esperado para esta condição.', 'warning');
      return;
    }

    try {
      if (editId) {
        await window.api.updateOption(editId, {
          label,
          condition_type,
          condition_value,
          action_type,
          next_step_id
        });
        showToast('Regra atualizada!', 'success');
      } else {
        await window.api.createOption(stepId, {
          label,
          condition_type,
          condition_value,
          action_type,
          next_step_id
        });
        showToast('Regra adicionada!', 'success');
      }
      closeModal('optionModal');
      await loadAndRenderMindMap(selectedFlowId);
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}

const optionModalClose = document.getElementById('optionModalClose');
if (optionModalClose) optionModalClose.addEventListener('click', () => closeModal('optionModal'));
const optionModalCancel = document.getElementById('optionModalCancel');
if (optionModalCancel) optionModalCancel.addEventListener('click', () => closeModal('optionModal'));

window.deleteOption = async (optionId) => {
  if (!confirm('Deseja remover esta regra da etapa?')) return;
  try {
    await window.api.deleteOption(optionId);
    showToast('Regra removida.', 'info');
    await loadAndRenderMindMap(selectedFlowId);
  } catch (err) {
    showToast(err.message, 'danger');
  }
};

