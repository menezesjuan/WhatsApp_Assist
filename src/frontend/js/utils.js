/**
 * WhatsApp Assist - Shared helpers (badges, HTML escaping)
 * Classic script: shares the global scope with the other js/*.js files (load order matters, see index.html).
 */

// --- Badge Helpers with Bootstrap 5 ---
function getStatusBadgeClass(status) {
  if (!status) return 'badge bg-secondary-subtle text-secondary';
  if (['Conectado', 'RESOLVED', 'AUTOMATION_ACTIVE'].includes(status)) {
    return 'badge bg-success-subtle text-success border border-success-subtle';
  }
  if (['Aguardando QR Code', 'Aguardando autenticação', 'WAITING_INPUT', 'IN_PROGRESS'].includes(status)) {
    return 'badge bg-warning-subtle text-warning border border-warning-subtle';
  }
  if (['Desconectado', 'Sessão perdida', 'CANCELLED', 'WAITING_HUMAN', 'HANDOFF'].includes(status)) {
    return 'badge bg-danger-subtle text-danger border border-danger-subtle';
  }
  return 'badge bg-info-subtle text-info border border-info-subtle';
}

function getPriorityBadgeClass(priority) {
  if (priority === 'URGENT') return 'badge bg-danger text-white';
  if (priority === 'HIGH') return 'badge bg-danger-subtle text-danger border border-danger-subtle';
  if (priority === 'MEDIUM') return 'badge bg-warning-subtle text-warning border border-warning-subtle';
  return 'badge bg-light text-secondary border';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
