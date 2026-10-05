const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const config = require('../config/config');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('Database');

class DatabaseService {
  constructor(customPath) {
    this.dbPath = customPath || config.dbPath;
    this.db = null;
    this._stmtCache = new Map();
  }

  init() {
    this.dbPath = config.dbPath;
    if (this.db) return this;

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.info(`Initializing SQLite database at: ${this.dbPath}`);
    this.db = new DatabaseSync(this.dbPath);

    // Enforce WAL mode and foreign keys for performance and integrity
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');

    this.runMigrations();
    this.seedDefaults();

    return this;
  }

  runMigrations() {
    logger.info('Running database schema migrations...');

    // Users table for local access control
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'operator',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Settings key-value store
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Automations (Flows)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_default INTEGER NOT NULL DEFAULT 0,
        initial_step_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Automation Steps
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automation_steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        automation_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        order_index INTEGER NOT NULL DEFAULT 0,
        message_text TEXT NOT NULL,
        wait_input INTEGER NOT NULL DEFAULT 1,
        auto_reply INTEGER NOT NULL DEFAULT 1,
        invalid_reply_text TEXT,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        on_max_attempts_action TEXT NOT NULL DEFAULT 'handoff',
        is_final INTEGER NOT NULL DEFAULT 0,
        create_task INTEGER NOT NULL DEFAULT 0,
        task_title TEXT,
        task_priority TEXT DEFAULT 'MEDIUM',
        handoff_human INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE
      );
    `);

    // Automation Options (Rule connections from a step to next step)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS automation_options (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        step_id INTEGER NOT NULL,
        condition_type TEXT NOT NULL, /* EXACT_MATCH, KEYWORD, NUMERIC_OPTION, ANY_TEXT, EMPTY */
        condition_value TEXT NOT NULL,
        next_step_id INTEGER,
        action_type TEXT NOT NULL DEFAULT 'TRANSITION', /* TRANSITION, END_FLOW, HANDOFF */
        label TEXT,
        order_index INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (step_id) REFERENCES automation_steps(id) ON DELETE CASCADE
      );
    `);

    // Tasks for human intervention
    // Note: NEVER stores customer message text or conversation content. Only technical metadata.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id TEXT NOT NULL,
        contact_name TEXT,
        type TEXT NOT NULL DEFAULT 'HUMAN_INTERVENTION',
        status TEXT NOT NULL DEFAULT 'PENDING', /* PENDING, IN_PROGRESS, RESOLVED, CANCELLED */
        priority TEXT NOT NULL DEFAULT 'MEDIUM', /* LOW, MEDIUM, HIGH, URGENT */
        title TEXT NOT NULL,
        flow_id INTEGER,
        flow_name TEXT,
        step_id INTEGER,
        step_name TEXT,
        assigned_to TEXT,
        last_message TEXT,
        photo_url TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Schema updates for existing tables
    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN last_message TEXT;');
    } catch (_) {}
    try {
      this.db.exec('ALTER TABLE tasks ADD COLUMN photo_url TEXT;');
    } catch (_) {}

    // Technical event metadata timeline (NO message content allowed!)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS event_metadata (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        contact_id TEXT,
        flow_id INTEGER,
        step_id INTEGER,
        task_id INTEGER,
        summary TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // Leads / Prospecting table (Google Maps Scraper + WhatsApp Checker)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        search_term TEXT NOT NULL,
        location TEXT,
        business_name TEXT NOT NULL,
        phone_raw TEXT,
        phone_formatted TEXT,
        has_whatsapp INTEGER, /* 1 = Sim, 0 = Não, NULL = Não verificado */
        whatsapp_jid TEXT,
        website_url TEXT,
        address TEXT,
        rating REAL,
        reviews_count INTEGER,
        maps_url TEXT,
        status TEXT NOT NULL DEFAULT 'NEW', /* NEW, CONTACTED, CONVERTED, IGNORED */
        notes TEXT,
        task_id INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );
    `);

    // Indexes for hot query paths (steps/options lookups, task listing, timeline, leads)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_steps_automation ON automation_steps(automation_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_options_step ON automation_options(step_id, order_index);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status, id DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_contact ON tasks(contact_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON event_metadata(event_type);
      CREATE INDEX IF NOT EXISTS idx_leads_search ON leads(search_term);
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone_formatted);
      CREATE INDEX IF NOT EXISTS idx_leads_whatsapp ON leads(has_whatsapp);
      CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);
    `);

    // Keep the append-only technical timeline bounded
    this.db.exec(`
      DELETE FROM event_metadata
      WHERE id <= (SELECT COALESCE(MAX(id), 0) FROM event_metadata) - 5000;
    `);

    logger.info('Database migrations applied successfully.');
  }

  seedDefaults() {
    // 1. Seed settings
    const insertSetting = this.db.prepare(`
      INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
    `);

    for (const [key, val] of Object.entries(config.defaultSettings)) {
      insertSetting.run(key, typeof val === 'string' ? val : JSON.stringify(val));
    }

    // 2. Check if default automation exists
    const existingAuto = this.db.prepare('SELECT count(*) as cnt FROM automations').get();
    if (existingAuto.cnt === 0) {
      this.seedDefaultFlow();
    }
  }

  seedDefaultFlow() {
    logger.info('Seeding mandatory default automation flow: "Primeiro Atendimento"...');

    // Create flow
    const insertAuto = this.db.prepare(`
      INSERT INTO automations (name, description, is_active, is_default)
      VALUES (?, ?, 1, 1)
    `);
    const flowResult = insertAuto.run(
      'Primeiro Atendimento',
      'Fluxo inicial de recepção e triagem automática para novos contatos.'
    );
    const flowId = Number(flowResult.lastInsertRowid);

    // Step 1: Menu Principal
    const insertStep = this.db.prepare(`
      INSERT INTO automation_steps (
        automation_id, name, order_index, message_text, wait_input,
        auto_reply, invalid_reply_text, max_attempts, on_max_attempts_action,
        is_final, create_task, handoff_human
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const step1Result = insertStep.run(
      flowId,
      'Menu Principal',
      1,
      'Olá! Seja bem-vindo.\nDigite:\n1 - Orçamento\n2 - Suporte\n3 - Informações',
      1, // wait_input
      1, // auto_reply
      'Não consegui identificar sua opção. Digite 1, 2 ou 3.',
      3, // max_attempts
      'handoff',
      0, // is_final
      0, // create_task
      0  // handoff_human
    );
    const step1Id = Number(step1Result.lastInsertRowid);

    // Update initial_step_id
    this.db.prepare('UPDATE automations SET initial_step_id = ? WHERE id = ?').run(step1Id, flowId);

    // Step 2: Orçamento (Finaliza e cria task)
    const step2Result = insertStep.run(
      flowId,
      'Opção Orçamento',
      2,
      'Perfeito! Para solicitar um orçamento, descreva brevemente o serviço que você precisa. Logo entraremos em contato.',
      1, // wait_input
      1, // auto_reply: 1 (envia orientação e aguarda contato)
      null,
      1,
      'handoff',
      1, // is_final: 1
      1, // create_task: 1
      1  // handoff_human: 1
    );
    const step2Id = Number(step2Result.lastInsertRowid);
    this.db.prepare('UPDATE automation_steps SET task_title = ?, task_priority = ? WHERE id = ?')
      .run('Cliente solicitou orçamento', 'HIGH', step2Id);

    // Step 3: Suporte (Finaliza e cria task)
    const step3Result = insertStep.run(
      flowId,
      'Opção Suporte',
      3,
      'Para suporte, descreva o problema ou dificuldade que está enfrentando. Um atendente especializado irá continuar.',
      1, // wait_input
      1, // auto_reply: 1
      null,
      1,
      'handoff',
      1, // is_final: 1
      1, // create_task: 1
      1  // handoff_human: 1
    );
    const step3Id = Number(step3Result.lastInsertRowid);
    this.db.prepare('UPDATE automation_steps SET task_title = ?, task_priority = ? WHERE id = ?')
      .run('Cliente necessita de suporte técnico', 'HIGH', step3Id);

    // Step 4: Informações (Finaliza e cria task)
    const step4Result = insertStep.run(
      flowId,
      'Opção Informações',
      4,
      'Claro! Um de nossos atendentes poderá fornecer mais informações em instantes.',
      0, // wait_input: 0
      1, // auto_reply: 1
      null,
      1,
      'handoff',
      1, // is_final: 1
      1, // create_task: 1
      1  // handoff_human: 1
    );
    const step4Id = Number(step4Result.lastInsertRowid);
    this.db.prepare('UPDATE automation_steps SET task_title = ?, task_priority = ? WHERE id = ?')
      .run('Cliente aguarda informações gerais', 'MEDIUM', step4Id);

    // Step 1 Options:
    // 1 -> NUMERIC_OPTION 1 or KEYWORD orcamento -> step2
    // 2 -> NUMERIC_OPTION 2 or KEYWORD suporte -> step3
    // 3 -> NUMERIC_OPTION 3 or KEYWORD informacoes -> step4
    const insertOption = this.db.prepare(`
      INSERT INTO automation_options (step_id, condition_type, condition_value, next_step_id, action_type, label, order_index)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    insertOption.run(step1Id, 'NUMERIC_OPTION', '1', step2Id, 'TRANSITION', '1 - Orçamento', 1);
    insertOption.run(step1Id, 'KEYWORD', 'orcamento', step2Id, 'TRANSITION', 'Palavra-chave orçamento', 2);

    insertOption.run(step1Id, 'NUMERIC_OPTION', '2', step3Id, 'TRANSITION', '2 - Suporte', 3);
    insertOption.run(step1Id, 'KEYWORD', 'suporte', step3Id, 'TRANSITION', 'Palavra-chave suporte', 4);

    insertOption.run(step1Id, 'NUMERIC_OPTION', '3', step4Id, 'TRANSITION', '3 - Informações', 5);
    insertOption.run(step1Id, 'KEYWORD', 'informacoes', step4Id, 'TRANSITION', 'Palavra-chave informações', 6);

    logger.info('Default flow seeded successfully.');
  }

  // Prepared helpers for clean decoupled usage across the application.
  // Statements are cached by SQL text to avoid re-parsing on every call.
  prepare(sql) {
    let stmt = this._stmtCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this._stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  close() {
    this._stmtCache.clear();
    if (this.db) {
      try {
        this.db.close();
      } catch (_) {}
      this.db = null;
    }
  }
}

// Export singleton instance
const dbService = new DatabaseService();
module.exports = dbService;
