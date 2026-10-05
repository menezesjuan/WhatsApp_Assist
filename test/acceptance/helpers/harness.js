'use strict';
/**
 * Acceptance-test harness.
 *
 * Boots the real application (Express + WebSocket + SQLite + automation engine) inside the test process,
 * on a random free port, against a throw-away database and the mock WhatsApp adapter.
 * Tests talk to it as a black box (HTTP / WebSocket / browser) wherever possible. The only "inside" access is
 * limited to what a real WhatsApp connection would otherwise provide: simulating the customer's phone and
 * observing what the system tries to send out.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
const { once } = require('events');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let ctx = null;
let seq = 0;
const logBuffer = [];
const outbox = [];
let sendFailure = false;
const lastSentAt = new Map();

const uid = () => `${Date.now().toString(36)}${(++seq).toString(36)}`;
/** Unique Brazilian-looking mobile number (13 digits, country code included). */
const nextPhone = () => `55119${String(Date.now() % 10000).padStart(4, '0')}${String(++seq % 10000).padStart(4, '0')}`;
const jid = (phone) => (String(phone).includes('@') ? String(phone) : `${phone}@c.us`);
const mod = (rel) => require(path.join(ROOT, 'src', rel));

function captureConsole() {
  for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
    const original = console[method];
    console[method] = (...args) => {
      logBuffer.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      if (process.env.ACCEPTANCE_VERBOSE) original.apply(console, args);
    };
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function toHeaders(h) {
  const out = {};
  for (const [k, v] of h.entries()) out[k.toLowerCase()] = v;
  return out;
}

async function waitFor(fn, { timeout = 5000, interval = 50, message = 'condition' } = {}) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeout) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      lastError = err;
    }
    await sleep(interval);
  }
  throw new Error(`Timeout (${timeout}ms) waiting for ${message}${lastError ? `: ${lastError.message}` : ''}`);
}

async function start() {
  if (ctx) return ctx;

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-assist-acc-'));
  const port = await freePort();
  const dbPath = path.join(tmp, 'acceptance.sqlite');
  Object.assign(process.env, {
    DB_PATH: dbPath,
    WA_ADAPTER: 'mock',
    WA_TEMP_DIR: path.join(tmp, 'wa-session'),
    PORT: String(port),
    HOST: '127.0.0.1'
  });
  captureConsole();

  const { bootstrap } = require(path.join(ROOT, 'src', 'backend', 'server'));
  const { server } = await bootstrap();
  if (!server.listening) await once(server, 'listening');

  const baseUrl = `http://127.0.0.1:${port}`;

  /** High-level JSON request (fetch). Returns { status, headers, text, json }. */
  async function api(method, url, body, { headers = {} } = {}) {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      if (!Object.keys(opts.headers).some((k) => k.toLowerCase() === 'content-type')) {
        opts.headers['Content-Type'] = 'application/json';
      }
      opts.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, opts);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, headers: toHeaders(res.headers), text, json };
  }

  /** Low-level HTTP request: exact path/headers are sent untouched (traversal, Host, Origin, raw bodies...). */
  function raw({ method = 'GET', path: reqPath = '/', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, method, path: reqPath, headers: { Host: `127.0.0.1:${port}`, ...headers } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const buffer = Buffer.concat(chunks);
            const text = buffer.toString('utf8');
            let json = null;
            try { json = JSON.parse(text); } catch { /* not JSON */ }
            resolve({ status: res.statusCode, headers: res.headers, text, json, buffer });
          });
        }
      );
      req.on('error', reject);
      if (body !== undefined) req.write(body);
      req.end();
    });
  }

  /** WebSocket client with an event log. */
  function openWs({ origin, path: wsPath = '/ws' } = {}) {
    const WebSocket = require('ws');
    const headers = {};
    if (origin) headers.Origin = origin;
    const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`, { headers });
    const events = [];
    ws.on('message', (data) => {
      try { events.push(JSON.parse(data.toString())); } catch { /* ignore non-JSON */ }
    });
    const opened = new Promise((resolve, reject) => {
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
      ws.once('unexpected-response', (req, res) => {
        req.destroy();
        reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { statusCode: res.statusCode }));
      });
    });
    opened.catch(() => {});
    return {
      ws,
      events,
      opened,
      cursor: () => events.length,
      next: (type, { pred = () => true, timeout = 3000, from = 0 } = {}) =>
        waitFor(() => events.slice(from).find((e) => e.type === type && pred(e)), {
          timeout,
          message: `WebSocket event ${type}`
        }),
      close: () => { try { ws.close(); } catch { /* already closed */ } }
    };
  }

  ctx = { baseUrl, port, dbPath, tmp, server, api, raw, openWs };
  return ctx;
}

async function stop() {
  if (!ctx) return;
  const c = ctx;
  ctx = null;
  try {
    for (const client of mod('notifications/NotificationManager').wsClients) client.terminate();
  } catch { /* ignore */ }
  const closed = new Promise((resolve) => c.server.close(resolve));
  if (c.server.closeAllConnections) c.server.closeAllConnections();
  await closed;
  try { mod('database/database').close(); } catch { /* ignore */ }
  try { fs.rmSync(c.tmp, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ---------------------------------------------------------------- WhatsApp control / observation

/**
 * Marks the mock adapter as connected and installs an outbound spy.
 * `outbox` then lists every message the system actually tried to send to a customer.
 */
function connectMock() {
  const WA = mod('whatsapp/WhatsAppAdapter');
  const adapter = mod('whatsapp/WhatsAppManager').adapter;
  adapter.clientInfo = { pushname: 'Operador Teste', phone: '5511999998888', platform: 'Teste' };
  if (!adapter.__acceptanceSpy) {
    adapter.__acceptanceSpy = true;
    adapter.sendMessage = async (to, text) => {
      if (adapter.status !== WA.STATUS.CONNECTED) throw new Error('Mock WhatsApp client is not connected.');
      if (sendFailure) return { success: false, error: 'Falha simulada de envio' };
      outbox.push({ to, text, at: Date.now() });
      return { success: true, id: `acc-${outbox.length}-${Date.now()}` };
    };
  }
  adapter.emitConnectionChange(WA.STATUS.CONNECTED, { clientInfo: adapter.clientInfo });
}

function disconnectMock() {
  const WA = mod('whatsapp/WhatsAppAdapter');
  const adapter = mod('whatsapp/WhatsAppManager').adapter;
  adapter.clientInfo = null;
  adapter.emitConnectionChange(WA.STATUS.DISCONNECTED);
}

const setSendFailure = (on) => { sendFailure = Boolean(on); };
const sentTo = (phoneOrJid) => outbox.filter((m) => m.to === jid(phoneOrJid));
const clearOutbox = () => { outbox.length = 0; };

/**
 * Simulates a customer writing from their phone, through the same public endpoint the UI sandbox uses.
 * Respects the engine's 500ms per-contact burst window so each call models a distinct human message.
 */
async function customerSays(phone, text, { name = 'Cliente Teste', settleMs = 150 } = {}) {
  const key = jid(phone);
  const wait = 560 - (Date.now() - (lastSentAt.get(key) || 0));
  if (wait > 0) await sleep(wait);
  lastSentAt.set(key, Date.now());
  const res = await ctx.api('POST', '/api/whatsapp/simulate', { phone, text, name });
  await sleep(settleMs);
  return res;
}

/** Injects an inbound message straight on the event bus (group chats, duplicates, bursts). */
function publishInbound(payload) {
  const bus = mod('utils/EventBus');
  const msg = { id: `bus-${uid()}`, fromName: 'Cliente Bus', timestamp: Date.now(), isGroup: false, ...payload };
  bus.publish(bus.EVENTS.MESSAGE_RECEIVED, msg);
  return msg;
}

/** Creates a human-intervention task the same way the engine does. */
function makeTask(overrides = {}) {
  return mod('tasks/TaskManager').createTask({
    contactId: jid(nextPhone()),
    contactName: 'Cliente Fixture',
    title: 'Atendimento de teste',
    priority: 'MEDIUM',
    ...overrides
  });
}

/** Runs fn with temporary settings and restores previous values afterwards. */
async function withSettings(patch, fn) {
  const before = (await ctx.api('GET', '/api/settings')).json.settings;
  const res = await ctx.api('PUT', '/api/settings', patch);
  if (res.status !== 200) throw new Error(`could not apply settings ${JSON.stringify(patch)}: ${res.status} ${res.text}`);
  try {
    return await fn();
  } finally {
    const restore = {};
    for (const k of Object.keys(patch)) restore[k] = before[k];
    await ctx.api('PUT', '/api/settings', restore);
  }
}

// ---------------------------------------------------------------- persistence / privacy helpers

const db = () => mod('database/database');

/** Returns "table.column" for every TEXT-castable cell that contains the marker. */
function scanDbForText(marker) {
  const d = db();
  const hits = [];
  const tables = d.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name } of tables) {
    for (const col of d.prepare(`PRAGMA table_info(${name})`).all()) {
      const row = d.prepare(`SELECT count(*) AS n FROM ${name} WHERE CAST(${col.name} AS TEXT) LIKE ?`).get(`%${marker}%`);
      if (row.n > 0) hits.push(`${name}.${col.name}`);
    }
  }
  return hits;
}

/** Looks for the marker in the raw database, WAL and SHM files on disk. */
function scanFilesForText(marker) {
  const hits = [];
  for (const file of [ctx.dbPath, `${ctx.dbPath}-wal`, `${ctx.dbPath}-shm`]) {
    if (fs.existsSync(file) && fs.readFileSync(file).includes(marker)) hits.push(path.basename(file));
  }
  return hits;
}

const logs = () => logBuffer.join('\n');
const clearLogs = () => { logBuffer.length = 0; };

/** Detects stack traces, file-system paths and driver internals in a response body. */
const LEAK_PATTERN = /\bat\s+\S+\s+\(.*\)|\bat\s+(?:async\s+)?\S+\.js:\d+|node_modules|node:internal|[A-Za-z]:\\|\/src\/|SQLITE_|SQLite|TypeError|ReferenceError|SyntaxError|RangeError|\bstack\b/i;
const leaksInternals = (text) => LEAK_PATTERN.test(text || '');

module.exports = {
  ROOT,
  sleep,
  uid,
  nextPhone,
  jid,
  mod,
  waitFor,
  start,
  stop,
  connectMock,
  disconnectMock,
  setSendFailure,
  outbox,
  sentTo,
  clearOutbox,
  customerSays,
  publishInbound,
  makeTask,
  withSettings,
  db,
  scanDbForText,
  scanFilesForText,
  logs,
  clearLogs,
  leaksInternals,
  get ctx() { return ctx; }
};
