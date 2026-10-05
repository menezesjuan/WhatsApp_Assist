'use strict';

const express = require('express');
const router = express.Router();
const GoogleMapsScraper = require('../../scraper/GoogleMapsScraper');
const LeadManager = require('../../leads/LeadManager');
const WhatsAppManager = require('../../whatsapp/WhatsAppManager');
const NotificationManager = require('../../notifications/NotificationManager');
const SanitizedLogger = require('../../utils/SanitizedLogger');

const logger = new SanitizedLogger('LeadRoutes');

// GET /api/leads - list leads with filters & statistics
router.get('/', (req, res) => {
  try {
    const {
      search,
      has_whatsapp,
      has_website,
      search_term,
      status,
      limit = 50,
      offset = 0
    } = req.query;

    const result = LeadManager.getLeads({
      search,
      has_whatsapp,
      has_website,
      search_term,
      status,
      limit: Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200),
      offset: Math.max(parseInt(offset, 10) || 0, 0)
    });

    res.json({
      success: true,
      ...result
    });
  } catch (err) {
    logger.error(`Error listing leads: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/leads/export - download leads as CSV
router.get('/export', (req, res) => {
  try {
    const { search, has_whatsapp, has_website, search_term, status } = req.query;
    const { leads } = LeadManager.getLeads({
      search,
      has_whatsapp,
      has_website,
      search_term,
      status,
      limit: 10000,
      offset: 0
    });

    const csvData = LeadManager.exportCsv(leads);
    const filename = `leads_prospeccao_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);
  } catch (err) {
    logger.error(`Error exporting leads CSV: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/leads/search - start Google Maps scraping and WhatsApp verification
router.post('/search', async (req, res) => {
  const { query, location = '', maxResults = 20, checkWhatsApp = true } = req.body;

  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ success: false, error: 'Termo de pesquisa (nicho / palavra-chave) é obrigatório.' });
  }

  const fullQuery = location && location.trim() ? `${query.trim()} em ${location.trim()}` : query.trim();
  const limit = Math.min(Math.max(parseInt(maxResults, 10) || 20, 1), 100);

  logger.info(`Starting lead search for: "${fullQuery}" (Max: ${limit}, Check WhatsApp: ${checkWhatsApp})`);

  try {
    NotificationManager.broadcast('LEAD_SEARCH_STARTED', {
      query: fullQuery,
      totalExpected: limit,
      timestamp: Date.now()
    });

    // 1. Scrape Google Maps
    const rawLeads = await GoogleMapsScraper.scrape(fullQuery, {
      maxResults: limit,
      onProgress: (progress) => {
        NotificationManager.broadcast('LEAD_SEARCH_PROGRESS', {
          stage: 'SCRAPING',
          current: progress.current,
          total: progress.total,
          item: progress.lead.business_name
        });
      }
    });

    const savedLeads = [];

    // 2. Validate WhatsApp & save to database
    for (let i = 0; i < rawLeads.length; i++) {
      const item = rawLeads[i];
      let hasWhatsApp = null;
      let whatsappJid = null;

      if (checkWhatsApp && item.phone_formatted) {
        NotificationManager.broadcast('LEAD_SEARCH_PROGRESS', {
          stage: 'CHECKING_WHATSAPP',
          current: i + 1,
          total: rawLeads.length,
          item: `${item.business_name} (${item.phone_formatted})`
        });

        try {
          const check = await WhatsAppManager.checkNumberHasWhatsApp(item.phone_clean || item.phone_formatted);
          if (check.checked) {
            hasWhatsApp = check.hasWhatsApp ? 1 : 0;
            whatsappJid = check.jid || null;
          }
        } catch (checkErr) {
          logger.warn(`Could not verify WhatsApp for ${item.phone_formatted}: ${checkErr.message}`);
        }
      }

      const leadId = LeadManager.saveLead({
        search_term: query.trim(),
        location: location ? location.trim() : null,
        business_name: item.business_name,
        phone_raw: item.phone_raw,
        phone_formatted: item.phone_formatted,
        has_whatsapp: hasWhatsApp,
        whatsapp_jid: whatsappJid,
        website_url: item.website_url,
        address: item.address,
        rating: item.rating,
        reviews_count: item.reviews_count,
        maps_url: item.maps_url,
        status: 'NEW'
      });

      const fullSaved = LeadManager.getLeadById(leadId);
      savedLeads.push(fullSaved);

      NotificationManager.broadcast('LEAD_ITEM_SAVED', {
        lead: fullSaved,
        current: i + 1,
        total: rawLeads.length
      });
    }

    NotificationManager.broadcast('LEAD_SEARCH_COMPLETED', {
      query: fullQuery,
      totalExtracted: savedLeads.length,
      withWhatsApp: savedLeads.filter(l => l.has_whatsapp === 1).length
    });

    res.json({
      success: true,
      query: fullQuery,
      count: savedLeads.length,
      leads: savedLeads
    });
  } catch (err) {
    logger.error(`Search error: ${err.message}`, { stack: err.stack });
    NotificationManager.broadcast('LEAD_SEARCH_ERROR', { error: err.message });
    res.status(500).json({ success: false, error: `Erro na busca do Google Maps: ${err.message}` });
  }
});

// POST /api/leads/:id/verify-whatsapp - verify single lead WhatsApp status
router.post('/:id/verify-whatsapp', async (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  try {
    const result = await LeadManager.verifyLeadWhatsApp(leadId);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// POST /api/leads/:id/create-task - convert lead into a Kanban task
router.post('/:id/create-task', (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  const { assignedTo = 'Equipe de Vendas' } = req.body;
  try {
    const task = LeadManager.createTaskForLead(leadId, assignedTo);
    res.json({
      success: true,
      message: 'Tarefa de prospecção criada no Kanban com sucesso!',
      task
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// DELETE /api/leads/:id - delete lead
router.delete('/:id', (req, res) => {
  const leadId = parseInt(req.params.id, 10);
  try {
    const deleted = LeadManager.deleteLead(leadId);
    if (!deleted) return res.status(404).json({ success: false, error: 'Lead não encontrado.' });
    res.json({ success: true, message: 'Lead excluído com sucesso.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/leads - clear leads
router.delete('/', (req, res) => {
  const { search_term } = req.query;
  try {
    const count = LeadManager.clearLeads(search_term || null);
    res.json({ success: true, message: `${count} leads excluídos com sucesso.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
