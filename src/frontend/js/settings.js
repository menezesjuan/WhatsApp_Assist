/**
 * WhatsApp Assist - Settings view and test mode simulator
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

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

