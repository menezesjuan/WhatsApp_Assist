/**
 * WhatsApp Assist - Tasks (kanban) view
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

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

