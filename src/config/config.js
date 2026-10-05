const path = require('path');
const os = require('os');

const dataDir = path.resolve(__dirname, '../../data');

module.exports = {
  get port() { return parseInt(process.env.PORT, 10) || 3000; },
  get host() { return process.env.HOST || '127.0.0.1'; },
  dataDir,
  get dbPath() { return process.env.DB_PATH || path.join(dataDir, 'whatsapp_assist.sqlite'); },
  
  // WhatsApp settings
  whatsapp: {
    adapterType: process.env.WA_ADAPTER || 'web', // 'web' or 'mock'
    // Isolated temporary directory for Puppeteer/session files (never committed, never in SQLite)
    tempSessionDir: process.env.WA_TEMP_DIR || path.join(os.tmpdir(), 'wa-assist-session-temp'),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--mute-audio',
        '--metrics-recording-only',
        '--js-flags=--max-old-space-size=384'
      ]
    }
  },

  // State machine & loop safety
  safety: {
    maxTransitionsPerContact: 15,
    maxInvalidAttempts: 3,
    idempotencyTtlMs: 60 * 1000, // 60 seconds
    contactSessionTtlMs: 2 * 60 * 60 * 1000 // 2 hours
  },

  // Default system settings
  defaultSettings: {
    company_name: 'WhatsApp Assist',
    attendant_name: 'Equipe de Atendimento',
    timezone: 'America/Sao_Paulo',
    automation_enabled: 'true',
    reply_mode: 'auto_reply', // 'auto_reply' (responde só quando recebe mensagem) ou 'manual_click' (exige clique do operador)
    notification_sound_enabled: 'true',
    session_timeout_minutes: '30',
    fallback_message: 'Desculpe, não conseguimos compreender sua resposta. Um atendente humano irá auxiliá-lo em instantes.',
    max_invalid_attempts: '3',
    invalid_response_behavior: 'retry_then_handoff', // 'retry_then_handoff', 'handoff_immediately', 'end_flow'
    out_of_flow_behavior: 'start_default_flow', // 'start_default_flow', 'create_task', 'ignore'
    business_hours_enabled: 'false',
    business_hours_schedule: JSON.stringify({
      1: { open: '08:00', close: '18:00', enabled: true }, // Seg
      2: { open: '08:00', close: '18:00', enabled: true }, // Ter
      3: { open: '08:00', close: '18:00', enabled: true }, // Qua
      4: { open: '08:00', close: '18:00', enabled: true }, // Qui
      5: { open: '08:00', close: '18:00', enabled: true }, // Sex
      6: { open: '08:00', close: '12:00', enabled: false }, // Sab
      0: { open: '00:00', close: '00:00', enabled: false }  // Dom
    }),
    out_of_hours_action: 'reply_and_task', // 'reply_and_task', 'reply_and_end', 'task_only'
    out_of_hours_message: 'Olá! Nosso horário de atendimento é das 08h às 18h de segunda a sexta. Deixe sua mensagem e retornaremos assim que possível.'
  }
};
