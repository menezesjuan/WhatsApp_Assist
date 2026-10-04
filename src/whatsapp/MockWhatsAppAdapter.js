const QRCode = require('qrcode');
const WhatsAppAdapter = require('./WhatsAppAdapter');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('MockWhatsAppAdapter');

class MockWhatsAppAdapter extends WhatsAppAdapter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.simulatedLatency = options.simulatedLatency || 300;
  }

  async connect() {
    logger.info('Connecting Mock WhatsApp Adapter...');
    this.emitConnectionChange(WhatsAppAdapter.STATUS.CONNECTING, { message: 'Iniciando simulação...' });

    // Generate a valid mock QR code
    const mockQrPayload = `MOCK-SESSION-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    this.qrCodeDataUrl = await QRCode.toDataURL(mockQrPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 320
    });

    this.emitConnectionChange(WhatsAppAdapter.STATUS.WAITING_QR, { qr: this.qrCodeDataUrl });

    // In autoConnect mode or after short delay if specified, simulate successful scan
    if (this.options.autoConnect !== false) {
      setTimeout(() => {
        if (this.status === WhatsAppAdapter.STATUS.WAITING_QR) {
          logger.info('Simulating QR Scan authentication...');
          this.emitConnectionChange(WhatsAppAdapter.STATUS.WAITING_AUTH, { message: 'QR lido no celular de teste' });

          setTimeout(() => {
            this.qrCodeDataUrl = null;
            this.clientInfo = {
              pushname: 'WhatsApp Assist Demo',
              phone: '5511999998888',
              platform: 'Simulador / Sandbox'
            };
            this.emitConnectionChange(WhatsAppAdapter.STATUS.CONNECTED, { clientInfo: this.clientInfo });
            logger.info('Mock WhatsApp Adapter connected successfully.');
          }, 600);
        }
      }, 1500);
    }
  }

  async disconnect() {
    logger.info('Disconnecting Mock WhatsApp Adapter...');
    this.qrCodeDataUrl = null;
    this.clientInfo = null;
    this.emitConnectionChange(WhatsAppAdapter.STATUS.DISCONNECTED);
  }

  async sendMessage(to, text) {
    if (this.status !== WhatsAppAdapter.STATUS.CONNECTED) {
      throw new Error('Mock WhatsApp client is not connected.');
    }
    logger.info(`[MOCK OUTBOUND] Sent message to: ${to}`);
    return {
      success: true,
      id: `mock-msg-${Date.now()}`
    };
  }

  /**
   * Helper to simulate an incoming message from a test customer
   */
  simulateIncoming(fromPhone, text, fromName = 'Cliente Teste') {
    const jid = fromPhone.includes('@') ? fromPhone : `${fromPhone.replace(/\D/g, '')}@c.us`;
    logger.info(`[MOCK INBOUND] Received message from: ${jid}`);
    this.emitIncomingMessage({
      id: `mock-in-${Date.now()}`,
      from: jid,
      fromName,
      body: text,
      timestamp: Date.now(),
      isGroup: false
    });
  }
}

module.exports = MockWhatsAppAdapter;
