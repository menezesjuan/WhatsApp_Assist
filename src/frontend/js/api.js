/**
 * API Client
 * Wraps REST calls to WhatsApp Assist backend
 */

const API_BASE = '/api';

async function request(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  };

  try {
    const res = await fetch(url, config);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err.message);
    throw err;
  }
}

const api = {
  // WhatsApp
  getWhatsAppStatus: () => request('/whatsapp/status'),
  connectWhatsApp: () => request('/whatsapp/connect', { method: 'POST' }),
  disconnectWhatsApp: () => request('/whatsapp/disconnect', { method: 'POST' }),
  switchAdapter: (type) => request('/whatsapp/adapter', { method: 'POST', body: JSON.stringify({ type }) }),
  simulateSandboxMessage: (payload) => request('/whatsapp/simulate', { method: 'POST', body: JSON.stringify(payload) }),
  sendManualMessage: (contactId, message) => request('/whatsapp/send-manual', {
    method: 'POST',
    body: JSON.stringify({ contactId, message })
  }),
  getChats: () => request('/whatsapp/chats'),
  getChatMessages: (contactId, limit) => request(`/whatsapp/chats/${encodeURIComponent(contactId)}/messages${limit ? `?limit=${limit}` : ''}`),
  sendChatMessage: (contactId, message) => request(`/whatsapp/chats/${encodeURIComponent(contactId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({ message })
  }),

  // Automations
  getAutomations: () => request('/automations'),
  getAutomation: (id) => request(`/automations/${id}`),
  createAutomation: (data) => request('/automations', { method: 'POST', body: JSON.stringify(data) }),
  updateAutomation: (id, data) => request(`/automations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAutomation: (id) => request(`/automations/${id}`, { method: 'DELETE' }),
  duplicateAutomation: (id) => request(`/automations/${id}/duplicate`, { method: 'POST' }),

  // Steps
  createStep: (flowId, data) => request(`/automations/${flowId}/steps`, { method: 'POST', body: JSON.stringify(data) }),
  updateStep: (stepId, data) => request(`/automations/steps/${stepId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStep: (stepId) => request(`/automations/steps/${stepId}`, { method: 'DELETE' }),

  // Options
  createOption: (stepId, data) => request(`/automations/steps/${stepId}/options`, { method: 'POST', body: JSON.stringify(data) }),
  updateOption: (optionId, data) => request(`/automations/options/${optionId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteOption: (optionId) => request(`/automations/options/${optionId}`, { method: 'DELETE' }),

  // Test Mode Simulator
  simulateTestMode: (data) => request('/automations/test-simulate', { method: 'POST', body: JSON.stringify(data) }),

  // Tasks
  getTasks: (params = {}) => {
    const cleanParams = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '' && v !== 'ALL' && v !== 'undefined') {
        cleanParams[k] = v;
      }
    }
    const query = new URLSearchParams(cleanParams).toString();
    return request(query ? `/tasks?${query}` : '/tasks');
  },
  getTaskPhoto: (taskId) => request(`/tasks/${taskId}/photo`),
  getTaskStats: () => request('/tasks/stats'),
  updateTaskStatus: (id, status, assignedTo) => request(`/tasks/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, assigned_to: assignedTo })
  }),
  takeoverTask: (id, operatorName) => request(`/tasks/${id}/takeover`, {
    method: 'POST',
    body: JSON.stringify({ operator_name: operatorName })
  }),
  sendTaskReply: (taskId, message, operatorName, resolve) => request(`/tasks/${taskId}/send-reply`, {
    method: 'POST',
    body: JSON.stringify({ message, operator_name: operatorName, resolve })
  }),

  // Settings
  getSettings: () => request('/settings'),
  updateSettings: (data) => request('/settings', { method: 'PUT', body: JSON.stringify(data) }),

  // Dashboard Stats
  getDashboardStats: () => request('/stats/dashboard')
};

window.api = api;
