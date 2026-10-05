/**
 * WhatsAppAdapter (Interface/Base Class)
 * Defines the conceptual contract for WhatsApp integrations.
 * Decouples the rest of the application from specific libraries (whatsapp-web.js, Baileys, or Official Cloud API).
 */

class WhatsAppAdapter {
  static STATUS = {
    DISCONNECTED: 'Desconectado',
    WAITING_QR: 'Aguardando QR Code',
    WAITING_AUTH: 'Aguardando autenticação',
    CONNECTING: 'Conectando',
    CONNECTED: 'Conectado',
    SESSION_LOST: 'Sessão perdida'
  };

  constructor() {
    if (new.target === WhatsAppAdapter) {
      throw new TypeError('Cannot construct WhatsAppAdapter instances directly; use an implementation.');
    }
    this.status = WhatsAppAdapter.STATUS.DISCONNECTED;
    this.incomingMessageCallbacks = [];
    this.connectionChangeCallbacks = [];
    this.qrCodeDataUrl = null;
    this.clientInfo = null;
  }

  /**
   * Initializes the session connection
   * @returns {Promise<void>}
   */
  async connect() {
    throw new Error('Method connect() must be implemented.');
  }

  /**
   * Disconnects and terminates the active session
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('Method disconnect() must be implemented.');
  }

  /**
   * Returns current connection status
   * @returns {string} Status string from WhatsAppAdapter.STATUS
   */
  getStatus() {
    return this.status;
  }

  /**
   * Returns current QR code data URL (if any)
   * @returns {string|null}
   */
  getQRCode() {
    return this.qrCodeDataUrl;
  }

  /**
   * Returns profile picture URL for a contact (if available)
   * @param {string} contactId
   * @returns {Promise<string|null>}
   */
  async getProfilePicUrl(contactId) {
    return null;
  }

  /**
   * Returns authenticated client info (phone, pushname, platform)
   * @returns {object|null}
   */
  getClientInfo() {
    return this.clientInfo;
  }

  /**
   * Sends an outbound text message to a contact
   * @param {string} to Phone number or JID
   * @param {string} text Message content
   * @returns {Promise<{ success: boolean, id?: string, error?: string }>}
   */
  async sendMessage(to, text) {
    throw new Error('Method sendMessage() must be implemented.');
  }

  /**
   * Checks if a phone number is registered on WhatsApp
   * @param {string} phone
   * @returns {Promise<{ checked: boolean, hasWhatsApp: boolean|null, jid?: string, error?: string }>}
   */
  async checkNumberHasWhatsApp(phone) {
    throw new Error('Method checkNumberHasWhatsApp() must be implemented.');
  }

  /**
   * Registers a listener for incoming messages
   * @param {Function} callback (msgPayload: { id, from, fromName, body, timestamp, isGroup }) => void
   */
  onIncomingMessage(callback) {
    this.incomingMessageCallbacks.push(callback);
  }

  /**
   * Registers a listener for connection status changes
   * @param {Function} callback (status: string, details?: any) => void
   */
  onConnectionChange(callback) {
    this.connectionChangeCallbacks.push(callback);
  }

  /**
   * Helper to trigger registered incoming message listeners
   */
  emitIncomingMessage(payload) {
    for (const cb of this.incomingMessageCallbacks) {
      try {
        cb(payload);
      } catch (err) {
        console.error('Error in onIncomingMessage callback:', err);
      }
    }
  }

  /**
   * Helper to trigger registered connection change listeners
   */
  emitConnectionChange(status, details = {}) {
    this.status = status;
    for (const cb of this.connectionChangeCallbacks) {
      try {
        cb(status, details);
      } catch (err) {
        console.error('Error in onConnectionChange callback:', err);
      }
    }
  }
}

module.exports = WhatsAppAdapter;
