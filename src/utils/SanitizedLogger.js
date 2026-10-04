/**
 * SanitizedLogger
 * Ensures that under NO circumstances are message contents, chat transcripts,
 * QR codes, tokens, or private credentials printed or persisted in logs.
 * Principle: Privacy by Design.
 */

class SanitizedLogger {
  constructor(moduleName = 'System') {
    this.moduleName = moduleName;
  }

  _format(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(this._sanitizeMeta(meta))}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.moduleName}] ${message}${metaStr}`;
  }

  _sanitizeMeta(meta) {
    if (!meta || typeof meta !== 'object') return {};
    const sanitized = {};
    const forbiddenKeys = ['message', 'body', 'text', 'content', 'qr', 'token', 'password', 'credential', 'auth', 'secret'];

    for (const [key, val] of Object.entries(meta)) {
      const lower = key.toLowerCase();
      if (forbiddenKeys.some(fk => lower.includes(fk))) {
        sanitized[key] = '[REDACTED_BY_POLICY]';
      } else if (typeof val === 'object' && val !== null) {
        sanitized[key] = this._sanitizeMeta(val);
      } else {
        sanitized[key] = val;
      }
    }
    return sanitized;
  }

  info(message, meta) {
    console.log(this._format('info', message, meta));
  }

  warn(message, meta) {
    console.warn(this._format('warn', message, meta));
  }

  error(message, meta) {
    console.error(this._format('error', message, meta));
  }

  debug(message, meta) {
    if (process.env.DEBUG) {
      console.log(this._format('debug', message, meta));
    }
  }
}

module.exports = SanitizedLogger;
