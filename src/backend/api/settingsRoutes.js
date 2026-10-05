const express = require('express');
const router = express.Router();
const dbService = require('../../database/database');
const SanitizedLogger = require('../../utils/SanitizedLogger');

const logger = new SanitizedLogger('SettingsRoutes');

// GET /api/settings - retrieve all system settings
router.get('/', (req, res) => {
  const rows = dbService.prepare('SELECT key, value, updated_at FROM settings').all();
  const settings = {};
  for (const r of rows) {
    if (r.key === 'business_hours_schedule') {
      try {
        settings[r.key] = JSON.parse(r.value);
      } catch {
        settings[r.key] = r.value;
      }
    } else {
      settings[r.key] = r.value;
    }
  }
  res.json({ success: true, settings });
});

// PUT /api/settings - update system settings
router.put('/', (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ success: false, error: 'Dados de configuração inválidos.' });
  }

  const upsert = dbService.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `);

  dbService.exec('BEGIN');
  try {
    for (const [key, val] of Object.entries(updates)) {
      const stringVal = typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val);
      upsert.run(key, stringVal);
    }
    dbService.exec('COMMIT');
  } catch (err) {
    dbService.exec('ROLLBACK');
    logger.error(`Failed to save settings: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
  require('../../automation/AutomationEngine').invalidateSettingsCache();

  logger.info('System settings updated successfully.');
  res.json({ success: true, message: 'Configurações salvas com sucesso.' });
});

module.exports = router;
