/**
 * WhatsApp Assist - Application boot (must be loaded last)
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

// Boot Application
window.api.getSettings().then(data => {
  const s = data.settings || {};
  updateOperationalModeUI(s.reply_mode || 'auto_reply');
}).catch(() => {});

switchView('dashboard');
