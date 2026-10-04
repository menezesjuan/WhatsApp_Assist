/**
 * WebSocket Client & Audio Notification Manager
 */

class RealtimeClient {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.soundEnabled = true;
    this.reconnectAttempts = 0;
    this.audioCtx = null;
  }

  init() {
    this._connect();
  }

  _connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[WS] Connected to server.');
      this.reconnectAttempts = 0;
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this._dispatch(message.type, message.data);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    this.ws.onclose = () => {
      const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
      this.reconnectAttempts++;
      console.warn(`[WS] Disconnected. Reconnecting in ${Math.round(delay / 1000)}s...`);
      setTimeout(() => this._connect(), delay);
    };

    this.ws.onerror = (err) => {
      console.error('[WS] Connection error');
    };
  }

  on(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);
    return () => this.listeners.get(eventType)?.delete(callback);
  }

  _dispatch(type, data) {
    if (this.listeners.has(type)) {
      for (const cb of this.listeners.get(type)) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in WS listener for ${type}:`, e);
        }
      }
    }

    // Play subtle audio chime for relevant human alerts
    if (['TASK_CREATED', 'HUMAN_HANDOFF'].includes(type) && this.soundEnabled) {
      this.playChime();
    }
  }

  setSoundEnabled(enabled) {
    this.soundEnabled = Boolean(enabled);
  }

  /**
   * Synthesize pleasant alert chime using native Web Audio API (zero external assets needed)
   */
  playChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      // Dual tone: C6 -> E6
      osc.frequency.setValueAtTime(1046.50, now);
      osc.frequency.exponentialRampToValueAtTime(1318.51, now + 0.12);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      // Audio autoplay policy or unavailable
    }
  }
}

window.realtime = new RealtimeClient();
