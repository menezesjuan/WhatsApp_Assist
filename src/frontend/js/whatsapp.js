/**
 * WhatsApp Assist - WhatsApp connection view
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

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

