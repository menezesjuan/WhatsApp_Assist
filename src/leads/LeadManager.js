'use strict';

const dbService = require('../database/database');
const WhatsAppManager = require('../whatsapp/WhatsAppManager');
const TaskManager = require('../tasks/TaskManager');
const EventBus = require('../utils/EventBus');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('LeadManager');

class LeadManager {
  /**
   * Saves or updates a lead in SQLite
   */
  static saveLead(data) {
    const {
      search_term = '',
      location = '',
      business_name = 'Empresa sem nome',
      phone_raw = null,
      phone_formatted = null,
      has_whatsapp = null,
      whatsapp_jid = null,
      website_url = null,
      address = null,
      rating = null,
      reviews_count = null,
      maps_url = null,
      status = 'NEW',
      notes = null
    } = data;

    // Check if duplicate exists by phone
    let existing = null;
    if (phone_formatted) {
      existing = dbService.prepare('SELECT id, has_whatsapp FROM leads WHERE phone_formatted = ? LIMIT 1').get(phone_formatted);
    }

    if (existing) {
      dbService.prepare(`
        UPDATE leads SET
          business_name = COALESCE(?, business_name),
          website_url = COALESCE(?, website_url),
          address = COALESCE(?, address),
          rating = COALESCE(?, rating),
          reviews_count = COALESCE(?, reviews_count),
          maps_url = COALESCE(?, maps_url),
          has_whatsapp = COALESCE(?, has_whatsapp),
          whatsapp_jid = COALESCE(?, whatsapp_jid),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(
        business_name,
        website_url,
        address,
        rating,
        reviews_count,
        maps_url,
        has_whatsapp !== undefined && has_whatsapp !== null ? has_whatsapp : null,
        whatsapp_jid,
        existing.id
      );
      return existing.id;
    }

    const stmt = dbService.prepare(`
      INSERT INTO leads (
        search_term, location, business_name, phone_raw, phone_formatted,
        has_whatsapp, whatsapp_jid, website_url, address, rating,
        reviews_count, maps_url, status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      search_term,
      location,
      business_name,
      phone_raw,
      phone_formatted,
      has_whatsapp !== undefined && has_whatsapp !== null ? has_whatsapp : null,
      whatsapp_jid,
      website_url,
      address,
      rating,
      reviews_count,
      maps_url,
      status,
      notes
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Retrieves leads with filters and statistics
   */
  static getLeads({
    search = '',
    has_whatsapp,
    has_website,
    search_term,
    status,
    limit = 50,
    offset = 0
  } = {}) {
    let whereClauses = [];
    let params = [];

    if (search && search.trim()) {
      whereClauses.push('(business_name LIKE ? OR phone_formatted LIKE ? OR address LIKE ?)');
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (search_term && search_term.trim()) {
      whereClauses.push('search_term LIKE ?');
      params.push(`%${search_term.trim()}%`);
    }

    if (status && status.trim()) {
      whereClauses.push('status = ?');
      params.push(status.trim());
    }

    if (has_whatsapp !== undefined && has_whatsapp !== null && has_whatsapp !== '') {
      if (has_whatsapp === '1' || has_whatsapp === true || has_whatsapp === 1) {
        whereClauses.push('has_whatsapp = 1');
      } else if (has_whatsapp === '0' || has_whatsapp === false || has_whatsapp === 0) {
        whereClauses.push('has_whatsapp = 0');
      } else if (has_whatsapp === 'null' || has_whatsapp === 'unverified') {
        whereClauses.push('has_whatsapp IS NULL');
      }
    }

    if (has_website !== undefined && has_website !== null && has_website !== '') {
      if (has_website === '1' || has_website === 'true' || has_website === true) {
        whereClauses.push("(website_url IS NOT NULL AND website_url != '')");
      } else if (has_website === '0' || has_website === 'false' || has_website === false) {
        whereClauses.push("(website_url IS NULL OR website_url = '')");
      }
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    // Total count matching filter
    const countSql = `SELECT count(*) as count FROM leads ${whereSql}`;
    const totalCount = dbService.prepare(countSql).get(...params).count;

    // Fetch leads
    const querySql = `
      SELECT * FROM leads
      ${whereSql}
      ORDER BY id DESC
      LIMIT ? OFFSET ?
    `;
    const leads = dbService.prepare(querySql).all(...params, limit, offset);

    // Compute global metrics
    const stats = dbService.prepare(`
      SELECT 
        count(*) as total,
        SUM(CASE WHEN has_whatsapp = 1 THEN 1 ELSE 0 END) as with_whatsapp,
        SUM(CASE WHEN has_whatsapp = 0 THEN 1 ELSE 0 END) as without_whatsapp,
        SUM(CASE WHEN has_whatsapp IS NULL THEN 1 ELSE 0 END) as unverified,
        SUM(CASE WHEN website_url IS NOT NULL AND website_url != '' THEN 1 ELSE 0 END) as with_website
      FROM leads
    `).get();

    return {
      leads,
      pagination: {
        total: totalCount,
        limit,
        offset
      },
      stats: {
        total: stats.total || 0,
        withWhatsApp: stats.with_whatsapp || 0,
        withoutWhatsApp: stats.without_whatsapp || 0,
        unverified: stats.unverified || 0,
        withWebsite: stats.with_website || 0
      }
    };
  }

  static getLeadById(id) {
    return dbService.prepare('SELECT * FROM leads WHERE id = ?').get(id);
  }

  static deleteLead(id) {
    const result = dbService.prepare('DELETE FROM leads WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static clearLeads(searchTerm = null) {
    if (searchTerm) {
      const result = dbService.prepare('DELETE FROM leads WHERE search_term = ?').run(searchTerm);
      return result.changes;
    }
    const result = dbService.prepare('DELETE FROM leads').run();
    return result.changes;
  }

  /**
   * Verifies if a lead has WhatsApp active
   */
  static async verifyLeadWhatsApp(leadId) {
    const lead = LeadManager.getLeadById(leadId);
    if (!lead) throw new Error('Lead não encontrado.');

    const targetPhone = lead.phone_formatted || lead.phone_raw;
    if (!targetPhone) {
      dbService.prepare("UPDATE leads SET has_whatsapp = 0, updated_at = datetime('now') WHERE id = ?").run(leadId);
      return { leadId, hasWhatsApp: false, error: 'Telefone ausente' };
    }

    const check = await WhatsAppManager.checkNumberHasWhatsApp(targetPhone);
    const hasWhatsApp = check.checked ? (check.hasWhatsApp ? 1 : 0) : null;
    const jid = check.jid || null;

    dbService.prepare(`
      UPDATE leads 
      SET has_whatsapp = ?, whatsapp_jid = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(hasWhatsApp, jid, leadId);

    logger.info(`Lead #${leadId} (${lead.business_name}) WhatsApp verified: ${hasWhatsApp === 1 ? 'SIM' : (hasWhatsApp === 0 ? 'NÃO' : 'DESCONHECIDO')}`);
    return { leadId, hasWhatsApp: hasWhatsApp === 1, jid, check };
  }

  /**
   * Converts a lead into a Kanban task for sales outreach
   */
  static createTaskForLead(leadId, assignedTo = 'Equipe de Vendas') {
    const lead = LeadManager.getLeadById(leadId);
    if (!lead) throw new Error('Lead não encontrado.');

    if (lead.task_id) {
      const existingTask = TaskManager.getTaskById(lead.task_id);
      if (existingTask) return existingTask;
    }

    const cleanPhone = (lead.phone_formatted || lead.phone_raw || '').replace(/\D/g, '');
    const contactId = lead.whatsapp_jid || (cleanPhone ? `${cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone}@c.us` : `lead-${lead.id}@c.us`);

    const task = TaskManager.createTask({
      contactId,
      contactName: lead.business_name,
      title: `Prospecção: ${lead.business_name}`,
      priority: lead.has_whatsapp === 1 ? 'HIGH' : 'MEDIUM',
      type: 'LEAD_PROSPECTING',
      assignedTo,
      lastMessage: `Lead captado no Google Maps.\nTelefone: ${lead.phone_formatted || 'N/A'}\nSite: ${lead.website_url || 'N/A'}\nEndereço: ${lead.address || 'N/A'}\nAvaliação: ${lead.rating ? lead.rating + ' ★' : 'N/A'}`
    });

    dbService.prepare("UPDATE leads SET task_id = ?, status = 'CONTACTED', updated_at = datetime('now') WHERE id = ?").run(task.id, leadId);
    return task;
  }

  /**
   * Exports an array of leads to formatted CSV string (Excel UTF-8 BOM compatible)
   */
  static exportCsv(leads) {
    const headers = [
      'ID',
      'Nome da Empresa',
      'Telefone Formatado',
      'Telefone Bruto',
      'Possui WhatsApp',
      'JID WhatsApp',
      'Website',
      'Endereço',
      'Nota / Avaliação',
      'Total de Avaliações',
      'Termo de Busca',
      'Status',
      'Link Google Maps',
      'Data de Captura'
    ];

    const escapeCsv = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = [headers.map(escapeCsv).join(';')];

    for (const l of leads) {
      const row = [
        l.id,
        l.business_name,
        l.phone_formatted,
        l.phone_raw,
        l.has_whatsapp === 1 ? 'SIM' : (l.has_whatsapp === 0 ? 'NÃO' : 'NÃO VERIFICADO'),
        l.whatsapp_jid,
        l.website_url,
        l.address,
        l.rating,
        l.reviews_count,
        l.search_term,
        l.status,
        l.maps_url,
        l.created_at
      ];
      rows.push(row.map(escapeCsv).join(';'));
    }

    // Prepend UTF-8 Byte Order Mark (BOM) so Excel opens UTF-8 accents seamlessly
    return '\uFEFF' + rows.join('\r\n');
  }
}

module.exports = LeadManager;
