/**
 * WhatsApp Assist - Live chat console view
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

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

