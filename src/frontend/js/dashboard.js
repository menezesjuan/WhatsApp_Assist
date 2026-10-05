/**
 * WhatsApp Assist - Dashboard view
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

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

