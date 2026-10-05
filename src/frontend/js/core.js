/**
 * WhatsApp Assist - Core state, modals, router, toasts and realtime handlers
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

// Application State
let currentView = 'dashboard';
let flowsList = [];
let currentEditingFlow = null;
let currentEditingStep = null;
let selectedFlowId = null;
let currentReplyMode = 'auto_reply';

// Core DOM Elements
const navItems = document.querySelectorAll('.sidebar-nav-item, .subnav-tab');
const viewSections = document.querySelectorAll('.view-section');
const breadcrumbSection = document.getElementById('breadcrumbSection');
const breadcrumbCurrent = document.getElementById('breadcrumbCurrent');
const tasksBadge = document.getElementById('tasksBadge');
const headerStatusDot = document.getElementById('headerStatusDot');
const headerStatusText = document.getElementById('headerStatusText');

// Modal Helpers (Bootstrap 5 Native & Fallback)
function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  if (window.bootstrap && window.bootstrap.Modal) {
    const modalInstance = window.bootstrap.Modal.getOrCreateInstance(el);
    modalInstance.show();
  } else {
    el.classList.add('show');
    el.style.display = 'block';
  }
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (!el) return;
  if (window.bootstrap && window.bootstrap.Modal) {
    const modalInstance = window.bootstrap.Modal.getInstance(el);
    if (modalInstance) modalInstance.hide();
  }
  el.classList.remove('show');
  el.style.display = 'none';
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) backdrop.remove();
  document.body.classList.remove('modal-open');
  document.body.style.removeProperty('padding-right');
}

// Bind close buttons for all modals
document.querySelectorAll('.btn-close, [data-bs-dismiss="modal"]').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const modal = e.target.closest('.modal');
    if (modal) closeModal(modal.id);
  });
});

// Init Realtime WebSocket
window.realtime.init();

// --- Router / View Switching ---
function switchView(viewName) {
  currentView = viewName;

  // Update left sidebar items
  document.querySelectorAll('.sidebar-nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });

  // Update subnav tabs
  document.querySelectorAll('.subnav-tab').forEach(tab => {
    const target = tab.getAttribute('onclick') || '';
    tab.classList.toggle('active', target.includes(viewName));
  });

  // Update active section
  viewSections.forEach(sec => {
    sec.classList.toggle('active', sec.id === `view-${viewName}`);
  });

  const titles = {
    dashboard: { section: 'Operação', current: 'Dashboard' },
    chat: { section: 'Atendimento', current: 'WhatsApp Web Integrado' },
    tasks: { section: 'Atendimento', current: 'Central de Tasks (Kanban)' },
    automations: { section: 'Fluxos', current: 'Linha do Tempo & Automações' },
    leads: { section: 'Prospecção', current: 'Captação Google Maps' },
    whatsapp: { section: 'Canais', current: 'Sessão WhatsApp Web' },
    settings: { section: 'Sistema', current: 'Configurações' }
  };

  if (breadcrumbSection) breadcrumbSection.textContent = titles[viewName]?.section || 'Operação';
  if (breadcrumbCurrent) breadcrumbCurrent.textContent = titles[viewName]?.current || 'WhatsApp Assist';

  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'chat') loadLiveChatView();
  if (viewName === 'whatsapp') loadWhatsAppStatus();
  if (viewName === 'automations') loadAutomations();
  if (viewName === 'tasks') loadTasks();
  if (viewName === 'leads') loadLeadsView();
  if (viewName === 'settings') loadSettings();
}

window.switchView = switchView;

document.querySelectorAll('.sidebar-nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    switchView(item.dataset.view);
  });
});

// --- Toast Notifications ---
function showToast(message, type = 'info', action = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `saas-toast ${type} d-flex align-items-center justify-content-between`;
  const icon = type === 'success' ? 'check-circle-fill' : (type === 'danger' ? 'x-circle-fill' : 'info-circle-fill');

  let actionBtnHtml = '';
  if (action && action.text) {
    actionBtnHtml = `<button class="btn btn-sm btn-light border py-1 px-2 fw-semibold ms-2 text-dark shadow-sm" style="font-size: 0.75rem; white-space: nowrap;" id="toastActionBtn">${escapeHtml(action.text)}</button>`;
  }

  toast.innerHTML = `
    <div class="d-flex align-items-center gap-2">
      <i class="bi bi-${icon} fs-5"></i>
      <span>${escapeHtml(message)}</span>
    </div>
    ${actionBtnHtml}
  `;

  if (action && action.onClick) {
    const btn = toast.querySelector('#toastActionBtn');
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        action.onClick();
        toast.remove();
      });
    }
  }

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 5500);
}

// --- Operational Mode Management ("NUNCA ENVIA SOZINHO") ---
function updateOperationalModeUI(mode) {
  currentReplyMode = mode;
  const modeBtn = document.getElementById('btnToggleMode');
  const modeIcon = document.getElementById('modeIcon');
  const modeText = document.getElementById('modeLabelText');
  const safetyBadge = document.getElementById('safetyBadgeStatus');
  const settingSelect = document.getElementById('setting_reply_mode');

  if (settingSelect) settingSelect.value = mode;

  if (mode === 'manual_click') {
    if (modeBtn) modeBtn.className = 'mode-pill-btn manual-mode';
    if (modeIcon) modeIcon.textContent = '🟡';
    if (modeText) modeText.textContent = 'Supervisão Total (Exige Clique)';
    if (safetyBadge) {
      safetyBadge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle px-3 py-2 rounded-pill';
      safetyBadge.innerHTML = '<i class="bi bi-hand-index-thumb-fill me-1"></i> Supervisão Ativa (Envio c/ Clique)';
    }
  } else {
    if (modeBtn) modeBtn.className = 'mode-pill-btn auto-mode';
    if (modeIcon) modeIcon.textContent = '🟢';
    if (modeText) modeText.textContent = 'Resposta Automática ao Receber';
    if (safetyBadge) {
      safetyBadge.className = 'badge bg-success-subtle text-success border border-success-subtle px-3 py-2 rounded-pill';
      safetyBadge.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> Envio Seguro Ativo';
    }
  }
}

const btnToggleMode = document.getElementById('btnToggleMode');
if (btnToggleMode) {
  btnToggleMode.addEventListener('click', async () => {
    const nextMode = currentReplyMode === 'auto_reply' ? 'manual_click' : 'auto_reply';
    try {
      await window.api.updateSettings({ reply_mode: nextMode });
      updateOperationalModeUI(nextMode);
      showToast(
        nextMode === 'manual_click'
          ? 'Modo Supervisão ativado: nenhuma mensagem será enviada sem seu clique.'
          : 'Modo Resposta Automática ativado: o robô responde unicamente ao receber mensagens de clientes.',
        'info'
      );
    } catch (err) {
      showToast(err.message, 'danger');
    }
  });
}

// --- Realtime WebSocket Event Handlers ---
window.realtime.on('SESSION_STATUS_CHANGED', (data) => {
  updateWhatsAppUI(data.status, data.qr, data.clientInfo, data.adapterType);
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('WHATSAPP_CONNECTED', () => {
  showToast('WhatsApp conectado com sucesso!', 'success');
  loadWhatsAppStatus();
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('WHATSAPP_DISCONNECTED', () => {
  showToast('WhatsApp desconectado.', 'warning');
  loadWhatsAppStatus();
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('TASK_CREATED', (data) => {
  showToast(
    `Nova Task #${data.task?.id || ''}: ${data.task?.title || 'Atendimento aguardando operador'}`,
    'danger',
    {
      text: 'Ver Fila',
      onClick: () => switchView('tasks')
    }
  );
  updateTasksBadge(data.pendingCount);
  if (currentView === 'tasks') loadTasks();
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('TASK_UPDATED', (data) => {
  updateTasksBadge(data.pendingCount);
  if (currentView === 'tasks') loadTasks();
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('TASK_COMPLETED', (data) => {
  updateTasksBadge(data.pendingCount);
  if (currentView === 'tasks') loadTasks();
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('HUMAN_HANDOFF', (data) => {
  showToast(`Contato ${data.contactId} transferido para operador humano.`, 'warning');
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('AUTOMATION_COMPLETED', () => {
  if (currentView === 'dashboard') loadDashboard();
});

window.realtime.on('CHAT_MESSAGE_RECEIVED', (data) => {
  onRealtimeChatMessage(data);
});

window.realtime.on('CHAT_MESSAGE_SENT', (data) => {
  onRealtimeChatMessage(data);
});

function updateTasksBadge(count) {
  if (tasksBadge) {
    if (count > 0) {
      tasksBadge.textContent = count;
      tasksBadge.style.display = 'inline-block';
    } else {
      tasksBadge.style.display = 'none';
    }
  }
}

