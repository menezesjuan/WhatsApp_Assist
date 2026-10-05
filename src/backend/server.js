const http = require('http');
const path = require('path');
const express = require('express');
const { WebSocketServer } = require('ws');
const config = require('../config/config');
const dbService = require('../database/database');
const NotificationManager = require('../notifications/NotificationManager');
const SanitizedLogger = require('../utils/SanitizedLogger');

// Import routes
const whatsappRoutes = require('./api/whatsappRoutes');
const automationRoutes = require('./api/automationRoutes');
const taskRoutes = require('./api/taskRoutes');
const settingsRoutes = require('./api/settingsRoutes');
const statsRoutes = require('./api/statsRoutes');
const leadRoutes = require('./api/leadRoutes');

const logger = new SanitizedLogger('Server');

async function bootstrap() {
  logger.info('Starting WhatsApp Assist WebApp system...');

  // 1. Initialize SQLite Database
  dbService.init();

  // 2. Setup Express App
  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: true, limit: '100kb' }));

  // Basic security and CORS headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  // Path traversal protection & URI decode validation
  app.use((req, res, next) => {
    const rawUrl = req.url || '';
    let decoded = '';
    try {
      decoded = decodeURIComponent(rawUrl);
    } catch (_) {
      return res.status(400).json({ error: 'Bad Request: URI malformada' });
    }
    if (rawUrl.includes('..') || decoded.includes('..')) {
      return res.status(403).json({ error: 'Acesso negado: tentativa de navegação inválida.' });
    }
    next();
  });

  // Serve static frontend files (vendored minified libs and fonts are cached long-term)
  const frontendDir = path.resolve(__dirname, '../frontend');
  app.use(express.static(frontendDir, {
    setHeaders: (res, filePath) => {
      if (/\.min\.(js|css)$|\.woff2?$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
      }
    }
  }));

  // Mount API endpoints
  app.use('/api/whatsapp', whatsappRoutes);
  app.use('/api/automations', automationRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/leads', leadRoutes);

  // Fallback route for SPA navigation (compatible with Express 5)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'Endpoint not found' });
    }
    if (req.method === 'GET' && !path.extname(req.path)) {
      return res.sendFile(path.join(frontendDir, 'index.html'));
    }
    res.status(404).json({ error: 'Recurso não encontrado' });
  });

  // 3. Create HTTP Server
  const server = http.createServer(app);

  // 4. Setup WebSocket Server for real-time events & notifications
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    NotificationManager.registerClient(ws);
  });

  // 5. Start listening
  server.listen(config.port, config.host, () => {
    logger.info(`WhatsApp Assist WebApp is running at: http://localhost:${config.port}`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      const WhatsAppManager = require('../whatsapp/WhatsAppManager');
      await WhatsAppManager.disconnect();
    } catch (err) {
      // ignore
    }
    dbService.close();
    for (const client of wss.clients) client.terminate();
    wss.close();
    const forceExit = setTimeout(() => process.exit(0), 5000);
    forceExit.unref();
    server.close(() => {
      logger.info('Server closed. Goodbye.');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Safety net against unhandled library exceptions (e.g. wwebjs/puppeteer asynchronous cleanup)
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception handled safely: ${err.message}`, { stack: err.stack });
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection handled safely:', { reason });
  });

  return { app, server };
}

if (require.main === module) {
  bootstrap().catch(err => {
    logger.error(`Bootstrap failure: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { bootstrap };
