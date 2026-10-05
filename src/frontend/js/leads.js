/**
 * WhatsApp Assist - Captação de Clientes (Google Maps Scraper & Validador de WhatsApp)
 */

let leadsList = [];
let leadsStats = { total: 0, withWhatsApp: 0, withoutWhatsApp: 0, unverified: 0, withWebsite: 0 };
let currentLeadFilter = 'all';
let isScrapingActive = false;

async function loadLeadsView() {
  const container = document.getElementById('leadsTableBody');
  if (!container) return;

  try {
    let url = '/api/leads?limit=100';
    if (currentLeadFilter === 'whatsapp') url += '&has_whatsapp=1';
    if (currentLeadFilter === 'no_whatsapp') url += '&has_whatsapp=0';
    if (currentLeadFilter === 'unverified') url += '&has_whatsapp=unverified';
    if (currentLeadFilter === 'website') url += '&has_website=1';

    const searchInput = document.getElementById('leadsSearchFilterInput');
    if (searchInput && searchInput.value.trim()) {
      url += `&search=${encodeURIComponent(searchInput.value.trim())}`;
    }

    const res = await api.get(url);
    if (res.success) {
      leadsList = res.leads || [];
      leadsStats = res.stats || leadsStats;
      renderLeadsStats();
      renderLeadsTable();
    }
  } catch (err) {
    showToast(`Erro ao carregar leads: ${err.message}`, 'danger');
  }
}

function renderLeadsStats() {
  const elTotal = document.getElementById('leadsStatTotal');
  const elWa = document.getElementById('leadsStatWhatsApp');
  const elNoWa = document.getElementById('leadsStatNoWhatsApp');
  const elSite = document.getElementById('leadsStatWebsite');

  if (elTotal) elTotal.textContent = leadsStats.total || 0;
  if (elWa) elWa.textContent = leadsStats.withWhatsApp || 0;
  if (elNoWa) elNoWa.textContent = leadsStats.withoutWhatsApp || 0;
  if (elSite) elSite.textContent = leadsStats.withWebsite || 0;

  const badge = document.getElementById('leadsBadge');
  if (badge) {
    if (leadsStats.total > 0) {
      badge.textContent = leadsStats.total;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  }
}

function renderLeadsTable() {
  const tbody = document.getElementById('leadsTableBody');
  const countEl = document.getElementById('leadsFilteredCount');
  if (!tbody) return;

  if (countEl) countEl.textContent = `${leadsList.length} resultado(s)`;

  if (leadsList.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-secondary">
          <i class="bi bi-geo-alt display-6 d-block mb-3 text-secondary opacity-50"></i>
          <h6 class="fw-bold mb-1">Nenhum lead encontrado</h6>
          <p class="small mb-3">Utilize o formulário acima para buscar estabelecimentos no Google Maps e validar WhatsApps.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = leadsList.map(lead => {
    let waBadge = '<span class="badge bg-secondary-subtle text-secondary border"><i class="bi bi-question-circle me-1"></i> Não verificado</span>';
    if (lead.has_whatsapp === 1) {
      waBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="bi bi-whatsapp me-1"></i> Ativo</span>';
    } else if (lead.has_whatsapp === 0) {
      waBadge = '<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="bi bi-x-circle me-1"></i> Inativo</span>';
    }

    let siteLink = '<span class="text-secondary small">—</span>';
    if (lead.website_url) {
      const cleanUrl = lead.website_url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
      const displayUrl = cleanUrl.length > 25 ? cleanUrl.substring(0, 22) + '...' : cleanUrl;
      siteLink = `
        <a href="${escapeHtml(lead.website_url)}" target="_blank" rel="noopener noreferrer" class="text-primary text-decoration-none small">
          <i class="bi bi-globe me-1"></i>${escapeHtml(displayUrl)}
        </a>
      `;
    }

    let ratingDisplay = '';
    if (lead.rating) {
      ratingDisplay = `
        <div class="small text-warning">
          <i class="bi bi-star-fill"></i> <strong class="text-dark">${lead.rating}</strong>
          ${lead.reviews_count ? `<span class="text-secondary ms-1">(${lead.reviews_count})</span>` : ''}
        </div>
      `;
    }

    const mapsBtn = lead.maps_url ? `
      <a href="${escapeHtml(lead.maps_url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-secondary py-0 px-2" title="Abrir no Google Maps" style="font-size: 0.75rem;">
        <i class="bi bi-geo-alt"></i>
      </a>
    ` : '';

    const chatActionBtn = lead.has_whatsapp === 1 && lead.phone_formatted ? `
      <button class="btn btn-sm btn-success py-1 px-2 text-white" onclick="openChatForLead('${lead.id}', '${escapeHtml(lead.phone_formatted)}', '${escapeHtml(lead.business_name)}')" title="Conversar no Live Chat">
        <i class="bi bi-whatsapp me-1"></i> Conversar
      </button>
    ` : '';

    const taskActionBtn = !lead.task_id ? `
      <button class="btn btn-sm btn-outline-primary py-1 px-2" onclick="createTaskFromLead(${lead.id})" title="Criar Tarefa no Kanban">
        <i class="bi bi-kanban me-1"></i> Criar Tarefa
      </button>
    ` : `
      <span class="badge bg-primary-subtle text-primary border" title="Tarefa já criada no Kanban">
        <i class="bi bi-check-all me-1"></i> Tarefa Criada
      </span>
    `;

    return `
      <tr>
        <td>
          <div class="fw-semibold text-dark">${escapeHtml(lead.business_name)}</div>
          ${ratingDisplay}
        </td>
        <td>
          ${lead.phone_formatted ? `
            <a href="tel:${escapeHtml(lead.phone_formatted.replace(/\D/g, ''))}" class="fw-semibold text-dark text-decoration-none">
              ${escapeHtml(lead.phone_formatted)}
            </a>
          ` : '<span class="text-secondary small">Não informado</span>'}
        </td>
        <td>${waBadge}</td>
        <td>${siteLink}</td>
        <td>
          <span class="small text-secondary" style="max-width: 200px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(lead.address || '')}">
            ${escapeHtml(lead.address || '—')}
          </span>
        </td>
        <td>
          <div class="d-flex align-items-center gap-1 justify-content-end">
            ${chatActionBtn}
            ${taskActionBtn}
            ${mapsBtn}
            <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="deleteLead(${lead.id})" title="Excluir Lead" style="font-size: 0.75rem;">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function startLeadSearch() {
  const queryInput = document.getElementById('leadSearchQuery');
  const locInput = document.getElementById('leadSearchLocation');
  const maxInput = document.getElementById('leadSearchMax');
  const checkWaInput = document.getElementById('leadSearchCheckWa');
  const submitBtn = document.getElementById('leadSearchSubmitBtn');
  const progressContainer = document.getElementById('leadSearchProgressContainer');
  const progressBar = document.getElementById('leadSearchProgressBar');
  const progressText = document.getElementById('leadSearchProgressText');

  if (!queryInput || !queryInput.value.trim()) {
    showToast('Informe o nicho ou termo de busca (ex: Clínicas, Restaurantes).', 'danger');
    if (queryInput) queryInput.focus();
    return;
  }

  const query = queryInput.value.trim();
  const location = locInput ? locInput.value.trim() : '';
  const maxResults = maxInput ? parseInt(maxInput.value, 10) || 20 : 20;
  const checkWhatsApp = checkWaInput ? checkWaInput.checked : true;

  isScrapingActive = true;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Buscando...';
  }

  if (progressContainer) progressContainer.style.display = 'block';
  if (progressBar) {
    progressBar.style.width = '10%';
    progressBar.classList.add('progress-bar-animated', 'progress-bar-striped');
  }
  if (progressText) progressText.textContent = 'Conectando ao Google Maps...';

  try {
    const res = await api.post('/api/leads/search', {
      query,
      location,
      maxResults,
      checkWhatsApp
    });

    if (res.success) {
      showToast(`Captação concluída! ${res.count} estabelecimentos encontrados.`, 'success');
      loadLeadsView();
    } else {
      showToast(res.error || 'Erro na captação de leads.', 'danger');
    }
  } catch (err) {
    showToast(`Erro na busca: ${err.message}`, 'danger');
  } finally {
    isScrapingActive = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-search me-1"></i> Iniciar Captação';
    }
    setTimeout(() => {
      if (!isScrapingActive && progressContainer) {
        progressContainer.style.display = 'none';
      }
    }, 4000);
  }
}

function updateSearchProgress(stage, current, total, item) {
  const progressBar = document.getElementById('leadSearchProgressBar');
  const progressText = document.getElementById('leadSearchProgressText');
  const progressContainer = document.getElementById('leadSearchProgressContainer');

  if (progressContainer) progressContainer.style.display = 'block';

  let percent = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 50;
  if (progressBar) progressBar.style.width = `${percent}%`;

  if (progressText) {
    if (stage === 'SCRAPING') {
      progressText.textContent = `Extraindo do Google Maps (${current}/${total}): ${item || ''}`;
    } else if (stage === 'CHECKING_WHATSAPP') {
      progressText.textContent = `Validando WhatsApp (${current}/${total}): ${item || ''}`;
    } else {
      progressText.textContent = `${item || 'Processando...'}`;
    }
  }
}

async function createTaskFromLead(leadId) {
  try {
    const res = await api.post(`/api/leads/${leadId}/create-task`, {});
    if (res.success) {
      showToast('Tarefa de prospecção criada no Kanban!', 'success', {
        text: 'Ver no Kanban',
        onClick: () => window.switchView('tasks')
      });
      loadLeadsView();
    } else {
      showToast(res.error || 'Erro ao criar tarefa.', 'danger');
    }
  } catch (err) {
    showToast(`Erro ao criar tarefa: ${err.message}`, 'danger');
  }
}

function openChatForLead(leadId, phone, name) {
  // Switches to chat view and sets up phone
  window.switchView('chat');
  setTimeout(() => {
    const cleanNumber = phone.replace(/\D/g, '');
    const jid = cleanNumber.startsWith('55') ? `${cleanNumber}@c.us` : `55${cleanNumber}@c.us`;
    if (typeof selectChatContact === 'function') {
      selectChatContact(jid, name);
    }
  }, 300);
}

async function deleteLead(leadId) {
  if (!confirm('Deseja excluir este lead da lista?')) return;
  try {
    const res = await api.delete(`/api/leads/${leadId}`);
    if (res.success) {
      showToast('Lead excluído.', 'info');
      loadLeadsView();
    }
  } catch (err) {
    showToast(`Erro ao excluir: ${err.message}`, 'danger');
  }
}

async function clearAllLeads() {
  if (!confirm('Deseja excluir TODOS os leads captados? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await api.delete('/api/leads');
    if (res.success) {
      showToast('Todos os leads foram removidos.', 'info');
      loadLeadsView();
    }
  } catch (err) {
    showToast(`Erro ao limpar leads: ${err.message}`, 'danger');
  }
}

function exportLeadsCsv() {
  let url = '/api/leads/export';
  if (currentLeadFilter === 'whatsapp') url += '?has_whatsapp=1';
  if (currentLeadFilter === 'no_whatsapp') url += '?has_whatsapp=0';
  if (currentLeadFilter === 'website') url += '?has_website=1';
  window.open(url, '_blank');
}

function setLeadsFilter(filterType) {
  currentLeadFilter = filterType;
  document.querySelectorAll('.leads-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filterType);
  });
  loadLeadsView();
}

// Bind realtime WebSocket events for leads
window.realtime.on('LEAD_SEARCH_PROGRESS', (data) => {
  updateSearchProgress(data.stage, data.current, data.total, data.item);
});

window.realtime.on('LEAD_ITEM_SAVED', (data) => {
  // Update stats and incrementally reload table
  if (data.lead) {
    renderLeadsStats();
  }
});

window.realtime.on('LEAD_SEARCH_COMPLETED', (data) => {
  const progressBar = document.getElementById('leadSearchProgressBar');
  const progressText = document.getElementById('leadSearchProgressText');
  if (progressBar) progressBar.style.width = '100%';
  if (progressText) progressText.textContent = `Busca finalizada! ${data.totalExtracted} leads processados (${data.withWhatsApp} com WhatsApp).`;
  loadLeadsView();
});

window.realtime.on('LEAD_SEARCH_ERROR', (data) => {
  showToast(`Erro na busca: ${data.error}`, 'danger');
});

// Expose functions globally
window.loadLeadsView = loadLeadsView;
window.startLeadSearch = startLeadSearch;
window.createTaskFromLead = createTaskFromLead;
window.openChatForLead = openChatForLead;
window.deleteLead = deleteLead;
window.clearAllLeads = clearAllLeads;
window.exportLeadsCsv = exportLeadsCsv;
window.setLeadsFilter = setLeadsFilter;
