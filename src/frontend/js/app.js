/**
 * WhatsApp Assist — Main Application Frontend Logic
 * Bootstrap 5 Framework, Bootstrap Icons & Modern SaaS Theme
 */

document.addEventListener('DOMContentLoaded', () => {
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
    loadDashboard();
  });

  window.realtime.on('WHATSAPP_CONNECTED', () => {
    showToast('WhatsApp conectado com sucesso!', 'success');
    loadWhatsAppStatus();
    loadDashboard();
  });

  window.realtime.on('WHATSAPP_DISCONNECTED', () => {
    showToast('WhatsApp desconectado.', 'warning');
    loadWhatsAppStatus();
    loadDashboard();
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
    loadDashboard();
  });

  window.realtime.on('AUTOMATION_COMPLETED', () => {
    loadDashboard();
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

  // --- 1. DASHBOARD VIEW ---
  async function loadDashboard() {
    try {
      const data = await window.api.getDashboardStats();
      const stats = data.stats || {};

      const kpiWaStatus = document.getElementById('kpiWaStatus');
      if (kpiWaStatus) kpiWaStatus.textContent = stats.whatsappStatus;

      const kpiWaDetail = document.getElementById('kpiWaDetail');
      if (kpiWaDetail) kpiWaDetail.textContent = stats.adapterType === 'mock' ? 'Modo Simulador' : 'Sessão WhatsApp Web';

      document.getElementById('kpiActiveFlows').textContent = stats.activeFlowsCount || 0;
      document.getElementById('kpiPendingTasks').textContent = stats.pendingTasksCount || 0;
      document.getElementById('kpiInProgress').textContent = stats.inProgressCount || 0;
      document.getElementById('kpiWaitingHuman').textContent = stats.waitingHumanCount || 0;
      document.getElementById('kpiErrors').textContent = stats.errorsCount || 0;

      updateTasksBadge(stats.pendingTasksCount || 0);

      // Pending Tasks Queue on Dashboard
      const pendingTasks = data.pendingTasks || [];
      const dashTasksBadge = document.getElementById('dashPendingTasksBadge');
      if (dashTasksBadge) dashTasksBadge.textContent = `${pendingTasks.length} pendente${pendingTasks.length === 1 ? '' : 's'}`;

      const dashTasksBody = document.getElementById('dashPendingTasksTableBody');
      if (dashTasksBody) {
        if (pendingTasks.length === 0) {
          dashTasksBody.innerHTML = `
            <tr>
              <td colspan="6" class="text-center text-muted py-4">
                <i class="bi bi-check2-circle text-success fs-4 d-block mb-1"></i>
                Nenhuma task pendente de operador no momento. Todas as conversas estão no fluxo ou resolvidas.
              </td>
            </tr>
          `;
        } else {
          dashTasksBody.innerHTML = pendingTasks.map(t => {
            const time = formatDateTime(t.created_at);
            const initials = getInitials(t.contact_name || t.contact_id);
            const avatarHtml = t.photo_url
              ? `<img src="${t.photo_url}" class="rounded-circle border" style="width: 36px; height: 36px; object-fit: cover;">`
              : `<div class="rounded-circle d-flex align-items-center justify-content-center text-white fw-bold small" style="width: 36px; height: 36px; background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%); flex-shrink: 0;">${initials}</div>`;

            return `
              <tr>
                <td><span class="badge bg-secondary-subtle text-secondary font-monospace">#${t.id}</span></td>
                <td>
                  <div class="d-flex align-items-center gap-2">
                    ${avatarHtml}
                    <div>
                      <div class="fw-bold text-dark">${escapeHtml(t.contact_name || 'Cliente')}</div>
                      <div class="text-muted small font-monospace">${escapeHtml(formatPhone(t.contact_id))}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div class="p-2 rounded bg-light border-start border-3 border-success small mb-1">
                    <i class="bi bi-chat-left-quote text-success me-1"></i> "${escapeHtml(t.last_message || t.title)}"
                  </div>
                  <div class="text-muted small" style="font-size: 0.75rem;">${escapeHtml(t.title)}</div>
                </td>
                <td><span class="${getPriorityBadgeClass(t.priority)}">${t.priority}</span></td>
                <td class="small text-muted font-monospace">${time}</td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-success fw-semibold" onclick="window.openChatWithCustomer('${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', ${t.id})" title="Falar com o cliente no WhatsApp Web">
                      <i class="bi bi-chat-text-fill me-1"></i> Falar com Cliente
                    </button>
                    <button class="btn btn-outline-primary" onclick="window.openTaskReplyModal(${t.id}, '${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', '${escapeHtml(t.title)}')" title="Resposta Rápida">
                      <i class="bi bi-chat-dots"></i>
                    </button>
                    <a class="btn btn-outline-success" href="${t.whatsappWebUrl}" target="_blank" title="Abrir WhatsApp Externo">
                      <i class="bi bi-whatsapp"></i>
                    </a>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Active Sessions Table
      const sessions = data.activeSessions || [];
      const tbody = document.getElementById('activeSessionsTableBody');
      const countEl = document.getElementById('activeSessionsCount');
      if (countEl) countEl.textContent = `${sessions.length} contatos`;

      if (tbody) {
        if (sessions.length === 0) {
          tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-5">Nenhum contato em atendimento no momento.</td></tr>';
        } else {
          tbody.innerHTML = sessions.map(s => `
            <tr>
              <td>
                <div class="fw-bold">${escapeHtml(s.contactName || 'Cliente')}</div>
                <div class="text-muted small font-monospace">${escapeHtml(s.contactId)}</div>
              </td>
              <td>
                <div>${escapeHtml(s.flowName || '—')}</div>
                <div class="text-muted small">${escapeHtml(s.stepName || '—')}</div>
              </td>
              <td>
                <span class="${getStatusBadgeClass(s.status)}">${s.status}</span>
              </td>
              <td>
                <button class="btn btn-sm btn-success fw-semibold" onclick="window.openChatWithCustomer('${escapeHtml(s.contactId)}', '${escapeHtml(s.contactName || '')}')" title="Falar com cliente no WhatsApp Web Integrado">
                  <i class="bi bi-chat-text-fill me-1"></i> Falar
                </button>
              </td>
            </tr>
          `).join('');
        }
      }

      // Recent Events Timeline
      const timeline = document.getElementById('eventsTimeline');
      const events = data.recentEvents || [];
      if (timeline) {
        if (events.length === 0) {
          timeline.innerHTML = '<div class="text-center text-muted py-5">Nenhum evento registrado ainda.</div>';
        } else {
          timeline.innerHTML = events.map(ev => {
            const time = ev.created_at ? ev.created_at.split(' ')[1] || ev.created_at : '';
            return `
              <div class="d-flex align-items-start gap-3 p-2 mb-2 rounded bg-light border-0">
                <span class="badge bg-secondary-subtle text-secondary small font-monospace mt-1">${time}</span>
                <div>
                  <div class="fw-bold small text-dark">${escapeHtml(ev.event_type)}</div>
                  <div class="text-secondary small">${escapeHtml(ev.summary)}</div>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (err) {
      console.error('Error loading dashboard:', err);
    }
  }

  const refreshDashboardBtn = document.getElementById('refreshDashboardBtn');
  if (refreshDashboardBtn) {
    refreshDashboardBtn.addEventListener('click', loadDashboard);
  }

  window.takeoverSession = async (contactId) => {
    window.openChatWithCustomer(contactId, null, null);
  };

  // =========================================================================
  // --- 1.5. WHATSAPP WEB CONSOLE CONTROLLER (LIVE CHAT INTEGRADO) ---
  // =========================================================================
  let activeChatContactId = null;
  let activeChatContactName = null;
  let activeChatTaskId = null;
  let allChatsList = [];

  async function loadLiveChatView() {
    try {
      const waStatus = await window.api.getWhatsAppStatus();
      const statusPill = document.getElementById('waChatStatusPill');
      const opNameEl = document.getElementById('waWebOperatorName');
      const opPhoneEl = document.getElementById('waWebOperatorPhone');

      if (statusPill) {
        if (waStatus.status === 'Conectado') {
          statusPill.className = 'badge bg-success-subtle text-success border border-success-subtle px-3 py-2 rounded-pill';
          statusPill.innerHTML = '<i class="bi bi-check-circle-fill me-1"></i> WhatsApp Conectado';
        } else {
          statusPill.className = 'badge bg-warning-subtle text-warning border border-warning-subtle px-3 py-2 rounded-pill';
          statusPill.innerHTML = `<i class="bi bi-exclamation-triangle-fill me-1"></i> ${waStatus.status || 'Desconectado'}`;
        }
      }

      if (opNameEl && waStatus.clientInfo) {
        opNameEl.textContent = waStatus.clientInfo.pushname || 'Operador Conectado';
      }
      if (opPhoneEl && waStatus.clientInfo) {
        opPhoneEl.textContent = waStatus.clientInfo.wid?.user ? `+${waStatus.clientInfo.wid.user}` : 'Sessão Ativa';
      }

      await refreshChatsList();
    } catch (err) {
      console.error('Error loading live chat view:', err);
    }
  }

  async function refreshChatsList() {
    const listEl = document.getElementById('waWebChatList');
    if (!listEl) return;

    try {
      const res = await window.api.getChats();
      allChatsList = res.chats || [];
      renderChatsList();
    } catch (err) {
      console.error('Error fetching chats:', err);
      listEl.innerHTML = `<div class="text-center text-danger py-4 small"><i class="bi bi-exclamation-circle me-1"></i> Erro ao carregar conversas.</div>`;
    }
  }

  function renderChatsList() {
    const listEl = document.getElementById('waWebChatList');
    const searchInput = document.getElementById('waSearchChatInput');
    if (!listEl) return;

    const searchTerm = (searchInput?.value || '').trim().toLowerCase();
    const filtered = allChatsList.filter(c => {
      if (!searchTerm) return true;
      const name = (c.name || '').toLowerCase();
      const phone = (c.contactId || '').toLowerCase();
      const lastMsg = (c.lastMessage || '').toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm) || lastMsg.includes(searchTerm);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="text-center text-muted py-5 small">
          <i class="bi bi-chat-square-text fs-3 d-block mb-1 text-secondary"></i>
          ${searchTerm ? 'Nenhuma conversa encontrada na busca.' : 'Nenhuma conversa ativa no momento.'}
        </div>
      `;
      return;
    }

    listEl.innerHTML = filtered.map(c => {
      const isActive = c.contactId === activeChatContactId;
      const initials = getInitials(c.name || c.contactId);
      const timeStr = c.timestamp ? formatTimeOnly(c.timestamp) : '';
      const formattedPhone = formatPhone(c.contactId);

      const colors = [
        'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
        'linear-gradient(135deg, #10b981 0%, #059669 100%)',
        'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
        'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
        'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
      ];
      const colorIndex = Math.abs((c.contactId || '').split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % colors.length;
      const avatarGradient = colors[colorIndex];

      const avatarHtml = c.photoUrl
        ? `<img src="${c.photoUrl}" class="wa-chat-list-avatar" alt="${escapeHtml(c.name)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
           <div class="wa-chat-list-avatar fallback" style="display: none; background: ${avatarGradient};">${initials}</div>`
        : `<div class="wa-chat-list-avatar fallback" style="background: ${avatarGradient};">${initials}</div>`;

      return `
        <div class="wa-chat-item ${isActive ? 'active' : ''}" onclick="window.selectChatContact('${escapeHtml(c.contactId)}', '${escapeHtml(c.name || '')}', ${c.taskId || 'null'})">
          <div class="wa-chat-list-avatar-wrapper">
            ${avatarHtml}
          </div>
          <div class="wa-chat-item-info">
            <div class="wa-chat-item-name">
              <span class="text-truncate">${escapeHtml(c.name || formattedPhone)}</span>
              <span class="wa-chat-item-time">${timeStr}</span>
            </div>
            <div class="wa-chat-item-sub">
              <span class="wa-chat-item-preview text-truncate">
                ${escapeHtml(c.lastMessage || 'Conversa')}
              </span>
              ${c.status === 'PENDING' ? '<span class="badge bg-warning text-dark font-monospace" style="font-size: 0.65rem;">PENDENTE</span>' : ''}
              ${c.status === 'IN_PROGRESS' ? '<span class="badge bg-success-subtle text-success border border-success-subtle font-monospace" style="font-size: 0.65rem;">EM ATENDIMENTO</span>' : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  function formatTimeOnly(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  async function selectChatContact(contactId, contactName, taskId) {
    activeChatContactId = contactId;
    activeChatContactName = contactName || contactId;
    activeChatTaskId = taskId || null;

    // Show chat pane, hide empty state
    const emptyState = document.getElementById('waWebEmptyState');
    const activeChat = document.getElementById('waWebActiveChat');
    if (emptyState) emptyState.style.display = 'none';
    if (activeChat) {
      activeChat.style.removeProperty('display');
      activeChat.style.display = 'flex';
    }

    // Set contact header details
    const nameEl = document.getElementById('waActiveChatName');
    const phoneEl = document.getElementById('waActiveChatPhone');
    const avatarEl = document.getElementById('waActiveChatAvatar');
    const avatarFallback = document.getElementById('waActiveChatAvatarFallback');
    const externalLink = document.getElementById('btnExternalWaActiveLink');

    if (nameEl) nameEl.textContent = activeChatContactName;
    if (phoneEl) phoneEl.textContent = formatPhone(contactId);

    const initials = getInitials(activeChatContactName);
    if (avatarFallback) avatarFallback.textContent = initials;
    if (avatarEl) {
      avatarEl.style.display = 'none';
      if (avatarFallback) avatarFallback.style.display = 'flex';
    }

    if (externalLink) {
      const cleanDigits = (contactId || '').replace(/\D/g, '');
      const num = cleanDigits.startsWith('55') ? cleanDigits : `55${cleanDigits}`;
      externalLink.href = `https://web.whatsapp.com/send?phone=${num}`;
    }

    // Update active highlight in left list
    document.querySelectorAll('.wa-chat-item').forEach(item => {
      const isCur = item.getAttribute('onclick')?.includes(`'${contactId}'`);
      item.classList.toggle('active', Boolean(isCur));
    });

    // Focus input
    const inputEl = document.getElementById('waActiveChatInput');
    if (inputEl) {
      inputEl.focus();
    }

    // Load messages
    await loadConversationMessages(contactId);
  }

  window.selectChatContact = selectChatContact;

  async function loadConversationMessages(contactId) {
    const messagesEl = document.getElementById('waActiveChatMessages');
    if (!messagesEl) return;

    messagesEl.innerHTML = `
      <div class="text-center text-muted py-5 small">
        <div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>
        Carregando mensagens da conversa...
      </div>
    `;

    try {
      const res = await window.api.getChatMessages(contactId, 60);
      if (res.photoUrl) {
        const avatarEl = document.getElementById('waActiveChatAvatar');
        const avatarFallback = document.getElementById('waActiveChatAvatarFallback');
        if (avatarEl) {
          avatarEl.src = res.photoUrl;
          avatarEl.style.display = 'block';
          if (avatarFallback) avatarFallback.style.display = 'none';
        }
      }
      renderConversationMessages(res.messages || []);
    } catch (err) {
      console.error('Error loading chat messages:', err);
      messagesEl.innerHTML = `
        <div class="text-center text-danger py-4 small">
          <i class="bi bi-exclamation-triangle me-1"></i> Não foi possível carregar o histórico de mensagens.
        </div>
      `;
    }
  }

  function renderConversationMessages(messages) {
    const messagesEl = document.getElementById('waActiveChatMessages');
    if (!messagesEl) return;

    if (!messages || messages.length === 0) {
      messagesEl.innerHTML = `
        <div class="text-center text-muted py-5 small">
          <i class="bi bi-chat-heart text-success fs-3 d-block mb-2"></i>
          Nenhuma mensagem registrada nesta conversa ainda.<br>
          Digite uma mensagem abaixo para iniciar o atendimento pelo WhatsApp Web.
        </div>
      `;
      return;
    }

    messagesEl.innerHTML = messages.map(m => {
      const isInbound = m.direction === 'inbound';
      const timeStr = m.timestamp ? formatTimeOnly(m.timestamp) : '';
      const text = escapeHtml(m.body || m.text || '').replace(/\n/g, '<br>');
      const statusIcon = !isInbound ? '<span class="wa-bubble-status"><i class="bi bi-check2-all text-primary"></i></span>' : '';

      return `
        <div class="wa-bubble-row ${isInbound ? 'inbound' : 'outbound'}">
          <div class="wa-bubble ${isInbound ? 'inbound' : 'outbound'}">
            ${text}
            <div class="wa-bubble-meta">
              <span>${timeStr}</span>
              ${statusIcon}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function sendActiveChatMessage() {
    const inputEl = document.getElementById('waActiveChatInput');
    const sendBtn = document.getElementById('btnSendActiveChatMessage');
    if (!inputEl || !activeChatContactId) return;

    const message = inputEl.value.trim();
    if (!message) return;

    inputEl.value = '';
    if (sendBtn) sendBtn.disabled = true;

    try {
      // Optimistically append outgoing bubble
      appendOutgoingBubble(message);

      const res = await window.api.sendChatMessage(activeChatContactId, message);
      if (res && res.success) {
        showToast('Mensagem enviada com sucesso ao cliente!', 'success');
        refreshChatsList();
      } else {
        showToast(res.error || 'Erro ao enviar mensagem via WhatsApp Web.', 'danger');
      }
    } catch (err) {
      showToast(`Falha no envio: ${err.message}`, 'danger');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      inputEl.focus();
    }
  }

  function appendOutgoingBubble(text) {
    const messagesEl = document.getElementById('waActiveChatMessages');
    if (!messagesEl) return;

    const row = document.createElement('div');
    row.className = 'wa-bubble-row outbound';
    const nowTime = formatTimeOnly(Date.now());
    const formattedText = escapeHtml(text).replace(/\n/g, '<br>');

    row.innerHTML = `
      <div class="wa-bubble outbound">
        ${formattedText}
        <div class="wa-bubble-meta">
          <span>${nowTime}</span>
          <span class="wa-bubble-status"><i class="bi bi-check2 text-secondary"></i></span>
        </div>
      </div>
    `;
    messagesEl.appendChild(row);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function onRealtimeChatMessage(data) {
    if (!data) return;
    if (activeChatContactId && data.contactId === activeChatContactId) {
      const messagesEl = document.getElementById('waActiveChatMessages');
      if (messagesEl) {
        const isInbound = data.direction === 'inbound';
        const timeStr = data.timestamp ? formatTimeOnly(data.timestamp) : formatTimeOnly(Date.now());
        const formattedText = escapeHtml(data.body || data.text || '').replace(/\n/g, '<br>');
        const statusIcon = !isInbound ? '<span class="wa-bubble-status"><i class="bi bi-check2-all text-primary"></i></span>' : '';

        const row = document.createElement('div');
        row.className = `wa-bubble-row ${isInbound ? 'inbound' : 'outbound'}`;
        row.innerHTML = `
          <div class="wa-bubble ${isInbound ? 'inbound' : 'outbound'}">
            ${formattedText}
            <div class="wa-bubble-meta">
              <span>${timeStr}</span>
              ${statusIcon}
            </div>
          </div>
        `;
        messagesEl.appendChild(row);
        messagesEl.scrollTop = messagesEl.scrollHeight;
      }
    }

    if (currentView === 'chat') {
      refreshChatsList();
    }
  }

  // Global entry point: click "Falar com Cliente" from any task or card
  window.openChatWithCustomer = async (contactId, contactName, taskId) => {
    try {
      // 1. Switch to WhatsApp Web view
      switchView('chat');

      // 2. If task is provided, takeover task (transitions to IN_PROGRESS & pauses automation)
      if (taskId) {
        try {
          await window.api.takeoverTask(taskId, 'Operador');
        } catch (err) {
          console.warn('Could not auto-takeover task:', err);
        }
      }

      // 3. Select contact and open conversation
      await selectChatContact(contactId, contactName, taskId);

      // 4. Update tasks in background
      loadTasks();
    } catch (err) {
      showToast(`Erro ao abrir chat com o cliente: ${err.message}`, 'danger');
    }
  };

  // Wire up Live Chat buttons & inputs
  const btnRefreshChats = document.getElementById('btnRefreshChats');
  if (btnRefreshChats) {
    btnRefreshChats.addEventListener('click', refreshChatsList);
  }

  const waSearchChatInput = document.getElementById('waSearchChatInput');
  if (waSearchChatInput) {
    waSearchChatInput.addEventListener('input', () => {
      renderChatsList();
    });
  }

  const btnSendActiveChatMessage = document.getElementById('btnSendActiveChatMessage');
  if (btnSendActiveChatMessage) {
    btnSendActiveChatMessage.addEventListener('click', sendActiveChatMessage);
  }

  const waActiveChatInput = document.getElementById('waActiveChatInput');
  if (waActiveChatInput) {
    waActiveChatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendActiveChatMessage();
      }
    });
  }

  const btnCompleteActiveChatTask = document.getElementById('btnCompleteActiveChatTask');
  if (btnCompleteActiveChatTask) {
    btnCompleteActiveChatTask.addEventListener('click', async () => {
      if (!activeChatTaskId) {
        showToast('Nenhuma task vinculada diretamente a este chat para concluir.', 'info');
        return;
      }
      try {
        await window.api.updateTaskStatus(activeChatTaskId, 'RESOLVED', 'Operador');
        showToast('Atendimento concluído! Task movida para "Serviço Concluído".', 'success');
        refreshChatsList();
        loadTasks();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  // --- 2. WHATSAPP VIEW ---
  async function loadWhatsAppStatus() {
    try {
      const data = await window.api.getWhatsAppStatus();
      updateWhatsAppUI(data.status, data.qr, data.clientInfo, data.adapterType);
    } catch (err) {
      console.error('Error loading WA status:', err);
    }
  }

  function updateWhatsAppUI(status, qr, clientInfo, adapterType) {
    if (headerStatusText) headerStatusText.textContent = status;
    if (headerStatusDot) {
      headerStatusDot.className = 'wa-dot';
      if (status === 'Conectado') headerStatusDot.classList.add('connected');
      else if (status.includes('Conectando') || status.includes('Aguardando')) headerStatusDot.classList.add('connecting');
    }

    const waBadge = document.getElementById('waStatusBadge');
    if (waBadge) {
      waBadge.textContent = status;
      waBadge.className = getStatusBadgeClass(status) + ' fs-6 px-3 py-2 rounded-pill';
    }

    const detailEl = document.getElementById('waStatusDetail');
    if (detailEl) detailEl.textContent = status;

    const infoEl = document.getElementById('waClientInfo');
    if (infoEl) {
      infoEl.textContent = (clientInfo && clientInfo.pushname)
        ? `${clientInfo.pushname} (${clientInfo.phone || 'Web'})`
        : '—';
    }

    const selectAdapter = document.getElementById('selectAdapterType');
    if (selectAdapter && adapterType) selectAdapter.value = adapterType;

    // QR Code Frame
    const qrPlaceholder = document.getElementById('qrPlaceholder');
    const qrImage = document.getElementById('qrImage');

    if (qrImage && qrPlaceholder) {
      if (qr && (status === 'Aguardando QR Code' || status.includes('Aguardando'))) {
        qrImage.src = qr;
        qrImage.style.display = 'block';
        qrPlaceholder.style.display = 'none';
      } else if (status === 'Conectado') {
        qrImage.style.display = 'none';
        qrPlaceholder.style.display = 'block';
        qrPlaceholder.innerHTML = `
          <div class="text-success fs-1 mb-2"><i class="bi bi-check-circle-fill"></i></div>
          <div class="fw-bold text-dark">WhatsApp Conectado e Operando</div>
        `;
      } else if (status === 'Conectando') {
        qrImage.style.display = 'none';
        qrPlaceholder.style.display = 'block';
        qrPlaceholder.innerHTML = `
          <div class="spinner-border text-primary mb-2" role="status"></div>
          <div>Inicializando navegador... Aguarde o QR Code.</div>
        `;
      } else {
        qrImage.style.display = 'none';
        qrPlaceholder.style.display = 'block';
        qrPlaceholder.innerHTML = `
          <i class="bi bi-phone fs-1 d-block mb-2 text-secondary"></i>
          Clique em <strong>"Iniciar / Conectar"</strong> para gerar o QR Code.
        `;
      }
    }
  }

  const btnConnectWA = document.getElementById('btnConnectWA');
  if (btnConnectWA) {
    btnConnectWA.addEventListener('click', async () => {
      try {
        showToast('Iniciando conexão com WhatsApp...', 'info');
        await window.api.connectWhatsApp();
        loadWhatsAppStatus();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  const btnDisconnectWA = document.getElementById('btnDisconnectWA');
  if (btnDisconnectWA) {
    btnDisconnectWA.addEventListener('click', async () => {
      try {
        showToast('Desconectando WhatsApp...', 'info');
        await window.api.disconnectWhatsApp();
        loadWhatsAppStatus();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  const selectAdapterType = document.getElementById('selectAdapterType');
  if (selectAdapterType) {
    selectAdapterType.addEventListener('change', async (e) => {
      try {
        const type = e.target.value;
        await window.api.switchAdapter(type);
        showToast(`Adaptador alterado para: ${type === 'mock' ? 'Simulador Sandbox' : 'WhatsApp Web Real'}`, 'success');
        loadWhatsAppStatus();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  // Sandbox incoming message simulator
  const btnSendSandboxMsg = document.getElementById('btnSendSandboxMsg');
  if (btnSendSandboxMsg) {
    btnSendSandboxMsg.addEventListener('click', async () => {
      const phone = document.getElementById('sandboxPhone').value.trim();
      const text = document.getElementById('sandboxMessage').value.trim();

      if (!text) {
        showToast('Digite a opção ou texto da mensagem simulada.', 'warning');
        return;
      }

      try {
        showToast('Injetando mensagem de teste no motor...', 'info');
        const res = await window.api.simulateMessage(phone, 'Cliente Teste', text);
        showToast(res.message || 'Mensagem processada pelo fluxo!', 'success');
        loadDashboard();
        if (currentView === 'tasks') loadTasks();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

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

  // --- 4. TASKS VIEW (KANBAN BOARD) ---
  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr.replace(' ', 'T'));
      if (isNaN(d.getTime())) return dateStr;
      const today = new Date();
      const isToday = d.getDate() === today.getDate() &&
                      d.getMonth() === today.getMonth() &&
                      d.getFullYear() === today.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      if (isToday) {
        return `Hoje às ${hours}:${mins}`;
      }
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year} às ${hours}:${mins}`;
    } catch (_) {
      return dateStr;
    }
  }

  function getInitials(name) {
    if (!name) return 'WA';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatPhone(contactId) {
    if (!contactId) return '';
    const digits = contactId.replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('55')) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12 && digits.startsWith('55')) {
      return `+55 (${digits.slice(2, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    return contactId.replace('@c.us', '');
  }

  function renderKanbanCard(t) {
    const initials = getInitials(t.contact_name || t.contact_id);
    const formattedPhone = formatPhone(t.contact_id);
    const timeFormatted = formatDateTime(t.created_at);

    // Color gradient based on contact ID hash
    const colors = [
      'linear-gradient(135deg, #0284c7 0%, #2563eb 100%)',
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)'
    ];
    const colorIndex = Math.abs((t.contact_id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)) % colors.length;
    const avatarGradient = colors[colorIndex];

    const avatarHtml = t.photo_url
      ? `
        <img src="${t.photo_url}" class="kanban-client-avatar" alt="${escapeHtml(t.contact_name || 'Cliente')}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <div class="kanban-client-avatar fallback" style="display: none; background: ${avatarGradient};">${initials}</div>
      `
      : `<div class="kanban-client-avatar fallback" style="background: ${avatarGradient};">${initials}</div>`;

    let actionsHtml = '';
    if (t.status === 'PENDING') {
      actionsHtml = `
        <button class="btn btn-sm btn-success py-1 px-2 fw-semibold" style="font-size: 0.76rem;" onclick="window.openChatWithCustomer('${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', ${t.id})" title="Falar com o cliente no WhatsApp Web">
          <i class="bi bi-chat-text-fill me-1"></i> Falar com Cliente
        </button>
        <button class="btn btn-sm btn-outline-primary py-1 px-2 fw-semibold" style="font-size: 0.76rem;" onclick="window.kanbanMoveTask(${t.id}, 'IN_PROGRESS')" title="Iniciar Atendimento (Mover para Em atendimento)">
          <i class="bi bi-play-fill me-1"></i> Atender
        </button>
        <button class="btn btn-sm btn-outline-primary py-1 px-2" style="font-size: 0.76rem;" onclick="window.openTaskReplyModal(${t.id}, '${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', '${escapeHtml(t.title)}')" title="Resposta Rápida">
          <i class="bi bi-chat-dots"></i>
        </button>
        <a class="btn btn-sm btn-outline-success py-1 px-2" style="font-size: 0.76rem;" href="${t.whatsappWebUrl}" target="_blank" title="Abrir conversa no WhatsApp Web Externo">
          <i class="bi bi-whatsapp"></i>
        </a>
      `;
    } else if (t.status === 'IN_PROGRESS') {
      actionsHtml = `
        <button class="btn btn-sm btn-success py-1 px-2 fw-semibold" style="font-size: 0.76rem;" onclick="window.openChatWithCustomer('${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', ${t.id})" title="Abrir conversa no WhatsApp Web Integrado">
          <i class="bi bi-chat-text-fill me-1"></i> Abrir Chat
        </button>
        <button class="btn btn-sm btn-outline-success py-1 px-2 fw-semibold" style="font-size: 0.76rem;" onclick="window.kanbanMoveTask(${t.id}, 'RESOLVED')" title="Concluir Atendimento (Mover para Serviço concluído)">
          <i class="bi bi-check-lg me-1"></i> Concluir
        </button>
        <button class="btn btn-sm btn-outline-warning py-1 px-2" style="font-size: 0.76rem;" onclick="window.kanbanMoveTask(${t.id}, 'PENDING')" title="Retornar para Mensagem pendente">
          <i class="bi bi-arrow-left"></i>
        </button>
      `;
    } else { // RESOLVED
      actionsHtml = `
        <button class="btn btn-sm btn-outline-secondary py-1 px-2 fw-semibold" style="font-size: 0.76rem;" onclick="window.openChatWithCustomer('${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', ${t.id})" title="Ver histórico no chat integrado">
          <i class="bi bi-chat-text me-1"></i> Ver Chat
        </button>
        <button class="btn btn-sm btn-outline-primary py-1 px-2 fw-semibold" style="font-size: 0.76rem;" onclick="window.kanbanMoveTask(${t.id}, 'IN_PROGRESS')" title="Reabrir atendimento">
          <i class="bi bi-arrow-counterclockwise me-1"></i> Reabrir
        </button>
      `;
    }

    return `
      <div class="kanban-card" draggable="true" ondragstart="window.kanbanDragStart(event, ${t.id})" ondragend="window.kanbanDragEnd(event)" id="kanban-card-${t.id}">
        <!-- Top Profile & Priority -->
        <div class="kanban-card-top">
          <div class="kanban-client-profile">
            <div class="kanban-avatar-wrapper">
              ${avatarHtml}
              <span class="kanban-avatar-badge" title="WhatsApp Ativo"><i class="bi bi-whatsapp"></i></span>
            </div>
            <div class="kanban-client-meta">
              <h6>${escapeHtml(t.contact_name || 'Cliente')}</h6>
              <div class="phone">${escapeHtml(formattedPhone)}</div>
            </div>
          </div>
          <div class="d-flex align-items-center gap-1">
            <span class="${getPriorityBadgeClass(t.priority)}" style="font-size: 0.68rem;">${t.priority}</span>
            <span class="badge bg-light text-secondary border font-monospace" style="font-size: 0.68rem;">#${t.id}</span>
          </div>
        </div>

        <!-- Inbound Message / Chat Bubble -->
        <div class="kanban-card-message" title="Mensagem recebida do cliente">
          <i class="bi bi-chat-left-quote-fill text-success me-1"></i>
          "${escapeHtml(t.last_message || t.title)}"
        </div>

        <!-- Flow / Context Info -->
        <div class="kanban-card-context">
          <i class="bi bi-diagram-3 text-secondary"></i>
          <span>${escapeHtml(t.flow_name || 'Atendimento')} › <strong>${escapeHtml(t.step_name || 'Triagem')}</strong></span>
        </div>

        <!-- Footer: Date, Time & Actions -->
        <div class="kanban-card-footer">
          <div class="kanban-card-datetime" title="Data e hora da mensagem">
            <i class="bi bi-calendar3"></i>
            <span>${timeFormatted}</span>
          </div>
          <div class="kanban-card-actions">
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  }

  // Lazy-load contact profile photo if not already cached
  function tryFetchContactPhoto(taskId) {
    window.api.getTaskPhoto(taskId).then(res => {
      if (res && res.photoUrl) {
        const card = document.getElementById(`kanban-card-${taskId}`);
        if (card) {
          const wrapper = card.querySelector('.kanban-avatar-wrapper');
          if (wrapper) {
            const fallback = wrapper.querySelector('.fallback');
            let img = wrapper.querySelector('img.kanban-client-avatar');
            if (!img) {
              img = document.createElement('img');
              img.className = 'kanban-client-avatar';
              wrapper.prepend(img);
            }
            img.src = res.photoUrl;
            img.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
          }
        }
      }
    }).catch(() => {});
  }

  // Drag and drop state
  let draggedTaskId = null;

  window.kanbanDragStart = (e, taskId) => {
    draggedTaskId = taskId;
    e.dataTransfer.setData('text/plain', String(taskId));
    e.target.classList.add('is-dragging');
  };

  window.kanbanDragEnd = (e) => {
    draggedTaskId = null;
    e.target.classList.remove('is-dragging');
    document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
  };

  window.kanbanDragOver = (e) => {
    e.preventDefault();
    const col = e.currentTarget;
    if (!col.classList.contains('drag-over')) {
      col.classList.add('drag-over');
    }
  };

  window.kanbanDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
  };

  window.kanbanDrop = async (e, targetStatus) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const taskId = draggedTaskId || parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (!taskId) return;
    await window.kanbanMoveTask(taskId, targetStatus);
  };

  window.kanbanMoveTask = async (taskId, newStatus) => {
    try {
      if (newStatus === 'IN_PROGRESS') {
        await window.api.takeoverTask(taskId, 'Operador');
        showToast('Chat movido para: Em atendimento!', 'info');
      } else if (newStatus === 'RESOLVED') {
        await window.api.updateTaskStatus(taskId, 'RESOLVED', 'Operador');
        showToast('Atendimento finalizado: Serviço concluído!', 'success');
      } else if (newStatus === 'PENDING') {
        await window.api.updateTaskStatus(taskId, 'PENDING', null);
        showToast('Chat retornado para: Mensagem pendente.', 'warning');
      }
      await loadTasks();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // Toggle Kanban / Table view
  const btnViewKanban = document.getElementById('btnViewKanban');
  const btnViewTable = document.getElementById('btnViewTable');
  const kanbanBoardView = document.getElementById('kanbanBoardView');
  const tasksTableView = document.getElementById('tasksTableView');

  if (btnViewKanban && btnViewTable) {
    btnViewKanban.addEventListener('click', () => {
      btnViewKanban.className = 'btn btn-primary';
      btnViewTable.className = 'btn btn-outline-secondary';
      if (kanbanBoardView) kanbanBoardView.style.display = 'grid';
      if (tasksTableView) tasksTableView.style.display = 'none';
    });

    btnViewTable.addEventListener('click', () => {
      btnViewTable.className = 'btn btn-primary';
      btnViewKanban.className = 'btn btn-outline-secondary';
      if (kanbanBoardView) kanbanBoardView.style.display = 'none';
      if (tasksTableView) tasksTableView.style.display = 'block';
    });
  }

  async function loadTasks() {
    try {
      const priorityFilterEl = document.getElementById('taskPriorityFilter');
      const priorityFilter = priorityFilterEl ? priorityFilterEl.value : 'ALL';

      const filterParams = {};
      if (priorityFilter && priorityFilter !== 'ALL') filterParams.priority = priorityFilter;

      const data = await window.api.getTasks(filterParams);
      const tasks = data.tasks || [];

      if (data.pendingCount !== undefined) updateTasksBadge(data.pendingCount);

      // Separate into Kanban columns: Mensagem pendente >> Em atendimento >> Serviço concluído
      const pendingList = tasks.filter(t => t.status === 'PENDING');
      const inProgressList = tasks.filter(t => t.status === 'IN_PROGRESS');
      const resolvedList = tasks.filter(t => t.status === 'RESOLVED');

      // Update Column Badges
      const badgePending = document.getElementById('kanbanBadgePending');
      if (badgePending) badgePending.textContent = pendingList.length;

      const badgeInProgress = document.getElementById('kanbanBadgeInProgress');
      if (badgeInProgress) badgeInProgress.textContent = inProgressList.length;

      const badgeResolved = document.getElementById('kanbanBadgeResolved');
      if (badgeResolved) badgeResolved.textContent = resolvedList.length;

      // Render Coluna 1: Mensagem pendente
      const listPendingEl = document.getElementById('kanbanListPending');
      if (listPendingEl) {
        if (pendingList.length === 0) {
          listPendingEl.innerHTML = `
            <div class="kanban-empty-state">
              <i class="bi bi-check2-circle fs-3 text-success d-block mb-1"></i>
              Nenhuma mensagem pendente.
            </div>
          `;
        } else {
          listPendingEl.innerHTML = pendingList.map(t => renderKanbanCard(t)).join('');
        }
      }

      // Render Coluna 2: Em atendimento
      const listInProgressEl = document.getElementById('kanbanListInProgress');
      if (listInProgressEl) {
        if (inProgressList.length === 0) {
          listInProgressEl.innerHTML = `
            <div class="kanban-empty-state">
              <i class="bi bi-inbox fs-3 text-secondary d-block mb-1"></i>
              Nenhum chat em atendimento no momento.
            </div>
          `;
        } else {
          listInProgressEl.innerHTML = inProgressList.map(t => renderKanbanCard(t)).join('');
        }
      }

      // Render Coluna 3: Serviço concluído
      const listResolvedEl = document.getElementById('kanbanListResolved');
      if (listResolvedEl) {
        if (resolvedList.length === 0) {
          listResolvedEl.innerHTML = `
            <div class="kanban-empty-state">
              <i class="bi bi-archive fs-3 text-secondary d-block mb-1"></i>
              Nenhum serviço concluído nesta lista.
            </div>
          `;
        } else {
          listResolvedEl.innerHTML = resolvedList.map(t => renderKanbanCard(t)).join('');
        }
      }

      // Render Optional Table View
      const tbody = document.getElementById('tasksTableBody');
      if (tbody) {
        if (tasks.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-5">Nenhuma task encontrada.</td></tr>';
        } else {
          tbody.innerHTML = tasks.map(t => {
            const time = formatDateTime(t.created_at);
            return `
              <tr>
                <td><span class="badge bg-secondary-subtle text-secondary font-monospace">#${t.id}</span></td>
                <td>
                  <div class="fw-bold">${escapeHtml(t.contact_name || 'Cliente')}</div>
                  <div class="text-muted small font-monospace">${escapeHtml(formatPhone(t.contact_id))}</div>
                </td>
                <td>
                  <div class="fw-bold text-dark">${escapeHtml(t.last_message || t.title)}</div>
                  <div class="text-muted small">${escapeHtml(t.title)}</div>
                </td>
                <td><span class="${getPriorityBadgeClass(t.priority)}">${t.priority}</span></td>
                <td>
                  <div>${escapeHtml(t.flow_name || '—')}</div>
                  <div class="text-muted small">${escapeHtml(t.step_name || '—')}</div>
                </td>
                <td class="small text-muted">${time}</td>
                <td><span class="${getStatusBadgeClass(t.status)}">${t.status}</span></td>
                <td>
                  <div class="btn-group btn-group-sm">
                    <button class="btn btn-success fw-semibold" onclick="window.openChatWithCustomer('${escapeHtml(t.contact_id)}', '${escapeHtml(t.contact_name || 'Cliente')}', ${t.id})" title="Falar com cliente no WhatsApp Web">
                      <i class="bi bi-chat-text-fill me-1"></i> Falar
                    </button>
                    ${t.status === 'PENDING' ? `
                      <button class="btn btn-outline-primary" onclick="window.kanbanMoveTask(${t.id}, 'IN_PROGRESS')" title="Atender">
                        <i class="bi bi-play-fill me-1"></i> Atender
                      </button>
                    ` : ''}
                    ${t.status === 'IN_PROGRESS' ? `
                      <button class="btn btn-outline-success" onclick="window.kanbanMoveTask(${t.id}, 'RESOLVED')" title="Concluir">
                        <i class="bi bi-check-lg me-1"></i> Concluir
                      </button>
                    ` : ''}
                    ${t.status === 'RESOLVED' ? `
                      <button class="btn btn-outline-secondary" onclick="window.kanbanMoveTask(${t.id}, 'IN_PROGRESS')" title="Reabrir">
                        <i class="bi bi-arrow-counterclockwise"></i>
                      </button>
                    ` : ''}
                    <a class="btn btn-outline-success" href="${t.whatsappWebUrl}" target="_blank" title="Abrir WhatsApp Web Externo">
                      <i class="bi bi-whatsapp"></i>
                    </a>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }

      // Check tasks without photos and try to lazy-fetch from WhatsApp Web
      tasks.forEach(t => {
        if (!t.photo_url) {
          tryFetchContactPhoto(t.id);
        }
      });

    } catch (err) {
      console.error('Error loading tasks:', err);
    }
  }

  const taskPriorityFilter = document.getElementById('taskPriorityFilter');
  if (taskPriorityFilter) taskPriorityFilter.addEventListener('change', loadTasks);
  const refreshTasksBtn = document.getElementById('refreshTasksBtn');
  if (refreshTasksBtn) refreshTasksBtn.addEventListener('click', loadTasks);

  // Task Reply Modal Handler
  window.openTaskReplyModal = (taskId, contactId, contactName, title) => {
    document.getElementById('taskReplyIdInput').value = taskId;
    document.getElementById('taskReplyContactDisplay').textContent = `${contactName || 'Cliente'} (${contactId})`;
    document.getElementById('taskReplyReasonDisplay').textContent = title || 'Atendimento Humano';
    document.getElementById('taskReplyTextInput').value = '';
    document.getElementById('taskReplyResolveCheck').checked = true;
    openModal('taskReplyModal');
  };

  const taskReplyModalClose = document.getElementById('taskReplyModalClose');
  if (taskReplyModalClose) taskReplyModalClose.addEventListener('click', () => closeModal('taskReplyModal'));
  const taskReplyModalCancel = document.getElementById('taskReplyModalCancel');
  if (taskReplyModalCancel) taskReplyModalCancel.addEventListener('click', () => closeModal('taskReplyModal'));

  const taskReplyModalSend = document.getElementById('taskReplyModalSend');
  if (taskReplyModalSend) {
    taskReplyModalSend.addEventListener('click', async () => {
      const taskId = document.getElementById('taskReplyIdInput').value;
      const message = document.getElementById('taskReplyTextInput').value.trim();
      const resolve = document.getElementById('taskReplyResolveCheck').checked;

      if (!message) {
        showToast('Digite a mensagem a ser enviada.', 'warning');
        return;
      }

      try {
        showToast('Enviando resposta autorizada via WhatsApp...', 'info');
        const res = await window.api.sendTaskReply(taskId, message, 'Operador', resolve);
        showToast(res.message || 'Resposta enviada com sucesso!', 'success');
        closeModal('taskReplyModal');
        loadTasks();
        loadDashboard();
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  window.takeoverTask = async (taskId) => {
    try {
      const res = await window.api.takeoverTask(taskId, 'Operador');
      showToast(res.message, 'success');
      loadTasks();
      loadDashboard();
      if (res.whatsappWebUrl) {
        window.open(res.whatsappWebUrl, '_blank');
      }
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  window.resolveTask = async (taskId) => {
    try {
      await window.api.updateTaskStatus(taskId, 'RESOLVED');
      showToast('Task marcada como resolvida!', 'success');
      loadTasks();
      loadDashboard();
    } catch (err) {
      showToast(err.message, 'danger');
    }
  };

  // --- 5. SETTINGS VIEW ---
  async function loadSettings() {
    try {
      const data = await window.api.getSettings();
      const s = data.settings || {};

      const currentMode = s.reply_mode || 'auto_reply';
      updateOperationalModeUI(currentMode);

      document.getElementById('setting_max_invalid_attempts').value = s.max_invalid_attempts || 3;
      document.getElementById('setting_fallback_message').value = s.fallback_message || 'Limite de tentativas atingido. Um atendente humano irá continuar seu atendimento.';
      document.getElementById('setting_notification_sound_enabled').checked = s.notification_sound_enabled === 'true';
      document.getElementById('setting_automation_enabled').checked = s.automation_enabled === 'true';
      window.realtime.setSoundEnabled(s.notification_sound_enabled === 'true');
    } catch (err) {
      console.error('Error loading settings:', err);
    }
  }

  const btnSaveSettings = document.getElementById('btnSaveSettings');
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const payload = {
        reply_mode: document.getElementById('setting_reply_mode').value,
        max_invalid_attempts: document.getElementById('setting_max_invalid_attempts').value,
        fallback_message: document.getElementById('setting_fallback_message').value.trim(),
        notification_sound_enabled: String(document.getElementById('setting_notification_sound_enabled').checked),
        automation_enabled: String(document.getElementById('setting_automation_enabled').checked)
      };

      try {
        await window.api.updateSettings(payload);
        updateOperationalModeUI(payload.reply_mode);
        window.realtime.setSoundEnabled(payload.notification_sound_enabled === 'true');
        showToast('Configurações salvas com sucesso!', 'success');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  // --- Test Mode Simulator Modal ---
  const testFlowSelect = document.getElementById('testFlowSelect');
  const testStepSelect = document.getElementById('testStepSelect');

  async function openTestMode(preferredFlowId = null) {
    try {
      const data = await window.api.getAutomations();
      const flows = data.flows || [];
      if (flows.length === 0) {
        showToast('Crie ao menos um fluxo antes de testar.', 'warning');
        return;
      }

      testFlowSelect.innerHTML = flows.map(f => `
        <option value="${f.id}" ${f.id === (preferredFlowId || selectedFlowId || flows[0].id) ? 'selected' : ''}>
          ${escapeHtml(f.name)}
        </option>
      `).join('');

      await onTestFlowChange();
      openModal('testModeModal');
    } catch (err) {
      showToast(err.message, 'danger');
    }
  }

  async function onTestFlowChange() {
    const flowId = testFlowSelect.value;
    if (!flowId) return;
    try {
      const data = await window.api.getAutomation(flowId);
      const steps = data.steps || [];
      testStepSelect.innerHTML = steps.map(s => `
        <option value="${s.id}">${escapeHtml(s.name)}</option>
      `).join('');
      document.getElementById('testResultBox').style.display = 'none';
    } catch (err) {
      console.error(err);
    }
  }

  if (testFlowSelect) testFlowSelect.addEventListener('change', onTestFlowChange);
  const btnOpenTestMode = document.getElementById('btnOpenTestMode');
  if (btnOpenTestMode) btnOpenTestMode.addEventListener('click', () => openTestMode());
  const quickTestBtn = document.getElementById('quickTestBtn');
  if (quickTestBtn) quickTestBtn.addEventListener('click', () => openTestMode());
  const testModeClose = document.getElementById('testModeClose');
  if (testModeClose) testModeClose.addEventListener('click', () => closeModal('testModeModal'));
  const testModeDismiss = document.getElementById('testModeDismiss');
  if (testModeDismiss) testModeDismiss.addEventListener('click', () => closeModal('testModeModal'));

  const btnRunTestStep = document.getElementById('btnRunTestStep');
  if (btnRunTestStep) {
    btnRunTestStep.addEventListener('click', async () => {
      const flowId = parseInt(testFlowSelect.value, 10);
      const stepId = parseInt(testStepSelect.value, 10);
      const input = document.getElementById('testMessageInput').value;

      try {
        const res = await window.api.simulateTestMode({ flowId, stepId, input });
        const r = res.result;

        document.getElementById('testResultBox').style.display = 'block';
        document.getElementById('resMatchedRule').textContent = r.matched
          ? `${r.matchedOption ? r.matchedOption.label : 'Etapa Inicial'} (${r.reason})`
          : `Nenhuma regra correspondente (${r.reason})`;

        document.getElementById('resNextStep').textContent = r.nextStep ? r.nextStep.name : '(Nenhuma / Encerramento)';
        document.getElementById('resIsFinal').textContent = r.isFinal ? 'Sim' : 'Não';
        document.getElementById('resWillTask').textContent = r.willCreateTask ? 'Sim' : 'Não';
        document.getElementById('resOutboundMessage').textContent = r.outboundReply || '(Nenhuma resposta configurada)';
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });
  }

  // --- Badge Helpers with Bootstrap 5 ---
  function getStatusBadgeClass(status) {
    if (!status) return 'badge bg-secondary-subtle text-secondary';
    if (['Conectado', 'RESOLVED', 'AUTOMATION_ACTIVE'].includes(status)) {
      return 'badge bg-success-subtle text-success border border-success-subtle';
    }
    if (['Aguardando QR Code', 'Aguardando autenticação', 'WAITING_INPUT', 'IN_PROGRESS'].includes(status)) {
      return 'badge bg-warning-subtle text-warning border border-warning-subtle';
    }
    if (['Desconectado', 'Sessão perdida', 'CANCELLED', 'WAITING_HUMAN', 'HANDOFF'].includes(status)) {
      return 'badge bg-danger-subtle text-danger border border-danger-subtle';
    }
    return 'badge bg-info-subtle text-info border border-info-subtle';
  }

  function getPriorityBadgeClass(priority) {
    if (priority === 'URGENT') return 'badge bg-danger text-white';
    if (priority === 'HIGH') return 'badge bg-danger-subtle text-danger border border-danger-subtle';
    if (priority === 'MEDIUM') return 'badge bg-warning-subtle text-warning border border-warning-subtle';
    return 'badge bg-light text-secondary border';
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Boot Application
  window.api.getSettings().then(data => {
    const s = data.settings || {};
    updateOperationalModeUI(s.reply_mode || 'auto_reply');
  }).catch(() => {});

  switchView('dashboard');
});
