'use strict';

const puppeteer = require('puppeteer');
const config = require('../config/config');
const SanitizedLogger = require('../utils/SanitizedLogger');

const logger = new SanitizedLogger('GoogleMapsScraper');

class GoogleMapsScraper {
  /**
   * Normalizes Brazilian phone numbers
   * @param {string} raw 
   * @returns {{ raw: string, clean: string, formatted: string, isMobile: boolean, isValid: boolean }}
   */
  static normalizePhone(raw) {
    if (!raw || typeof raw !== 'string') {
      return { raw: '', clean: '', formatted: '', isMobile: false, isValid: false };
    }

    const trimmed = raw.trim();
    let digits = trimmed.replace(/\D/g, '');

    // Remove leading zero if present (e.g., 011988887777)
    if (digits.startsWith('0') && digits.length >= 11) {
      digits = digits.substring(1);
    }

    // Add country code 55 if missing and valid DDD present (10 or 11 digits)
    if (digits.length === 10 || digits.length === 11) {
      digits = '55' + digits;
    }

    // Validate Brazilian numbers: 55 + 2 digits DDD + 8 or 9 digits number
    const isValid = digits.startsWith('55') && (digits.length === 12 || digits.length === 13);
    const ddd = isValid ? digits.substring(2, 4) : '';
    const numberPart = isValid ? digits.substring(4) : digits;
    const isMobile = isValid && numberPart.length === 9 && numberPart.startsWith('9');

    let formatted = trimmed;
    if (isValid) {
      if (isMobile) {
        formatted = `+55 (${ddd}) ${numberPart.substring(0, 5)}-${numberPart.substring(5)}`;
      } else {
        formatted = `+55 (${ddd}) ${numberPart.substring(0, 4)}-${numberPart.substring(4)}`;
      }
    }

    return {
      raw: trimmed,
      clean: digits,
      formatted,
      isMobile,
      isValid
    };
  }

  /**
   * Generates realistic mock leads for tests and sandbox mode
   * @param {string} query 
   * @param {number} maxResults 
   * @returns {Array<object>}
   */
  static _generateMockLeads(query, maxResults = 10) {
    const categories = ['Bar & Restaurante', 'Oficina Mecânica', 'Pet Shop & Clínica', 'Consultório Odontológico', 'Imobiliária & Consultoria'];
    const cities = ['São Paulo - SP', 'Curitiba - PR', 'Belo Horizonte - MG', 'Rio de Janeiro - RJ', 'Campinas - SP'];
    const mockList = [];

    for (let i = 1; i <= maxResults; i++) {
      const ddd = 11 + (i % 8);
      const isMobile = i % 3 !== 0; // 2 out of 3 are mobiles
      const number = isMobile ? `9${String(1000 + i * 73).padStart(4, '0')}${String(2000 + i * 37).padStart(4, '0')}` : `3${String(1000 + i * 41).padStart(7, '0')}`;
      const rawPhone = `(${ddd}) ${isMobile ? number.substring(0, 5) + '-' + number.substring(5) : number.substring(0, 4) + '-' + number.substring(4)}`;
      const normalized = GoogleMapsScraper.normalizePhone(rawPhone);
      const cat = categories[i % categories.length];
      const city = cities[i % cities.length];
      const name = `${cat} ${query.split(' ')[0] || 'Premium'} - Unidade ${i}`;
      const hasSite = i % 2 === 0;

      mockList.push({
        business_name: name,
        phone_raw: rawPhone,
        phone_formatted: normalized.formatted,
        phone_clean: normalized.clean,
        is_mobile: normalized.isMobile,
        website_url: hasSite ? `https://www.exemplo-${i}.com.br` : null,
        address: `Av. Paulista, ${100 * i} - Bela Vista, ${city}`,
        rating: Number((4.0 + (i % 10) * 0.1).toFixed(1)),
        reviews_count: 15 + i * 8,
        maps_url: `https://maps.google.com/?cid=${Date.now() + i}`
      });
    }

    return mockList;
  }

  /**
   * Scrapes Google Maps search results
   * @param {string} query Search terms (e.g. "Dentistas em Moema, São Paulo")
   * @param {object} [options]
   * @param {number} [options.maxResults=20]
   * @param {Function} [options.onProgress]
   * @returns {Promise<Array<object>>}
   */
  static async scrape(query, { maxResults = 20, onProgress = () => {} } = {}) {
    if (!query || !query.trim()) {
      throw new Error('Termo de busca para o Google Maps é obrigatório.');
    }

    const limit = Math.min(Math.max(parseInt(maxResults, 10) || 20, 1), 100);

    // If running in acceptance test mode or mock environment
    if (process.env.SCRAPER_MOCK === 'true' || process.env.WA_ADAPTER === 'mock' && !process.env.SCRAPER_FORCE_REAL) {
      logger.info(`[MOCK SCRAPER] Generating ${limit} mock leads for query: "${query}"`);
      const mockLeads = GoogleMapsScraper._generateMockLeads(query, limit);
      for (let i = 0; i < mockLeads.length; i++) {
        onProgress({ current: i + 1, total: limit, lead: mockLeads[i] });
      }
      return mockLeads;
    }

    logger.info(`Starting live Google Maps scraping for "${query}" (limit: ${limit})...`);
    let browser = null;

    try {
      const puppeteerArgs = [
        ...config.whatsapp.puppeteer.args,
        '--window-size=1280,800',
        '--lang=pt-BR,pt'
      ];

      // Try pipe launch first (immune to stdout/stderr WS endpoint buffering timeout on Windows daemons)
      try {
        browser = await puppeteer.launch({
          headless: true,
          pipe: true,
          args: puppeteerArgs,
          timeout: 45000
        });
      } catch (pipeErr) {
        logger.warn(`Puppeteer pipe launch fallback: ${pipeErr.message}`);
        browser = await puppeteer.launch({
          headless: true,
          args: puppeteerArgs,
          timeout: 45000
        });
      }

      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 800 });
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      );

      const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=pt-BR`;
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 35000 });

      // Handle cookie consent dialog if shown
      try {
        const consentBtn = await page.$('button[aria-label*="Aceitar"], form[action*="consent"] button');
        if (consentBtn) {
          await consentBtn.click();
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
        }
      } catch (_) {}

      // Wait for feed container or single result
      await page.waitForSelector('div[role="feed"], div.fontHeadlineSmall, a.hfpxzc', { timeout: 15000 });

      // Scroll to load results
      let previousCount = 0;
      let scrollAttempts = 0;
      const maxScrolls = Math.ceil(limit / 5) + 3;

      while (scrollAttempts < maxScrolls) {
        const count = await page.evaluate(() => document.querySelectorAll('a.hfpxzc').length);
        if (count >= limit || (count > 0 && count === previousCount && scrollAttempts > 2)) {
          break;
        }
        previousCount = count;
        scrollAttempts++;

        await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]') || document.querySelector('div[aria-label*="Resultados"]');
          if (feed) {
            feed.scrollTop = feed.scrollHeight;
          } else {
            window.scrollBy(0, 1000);
          }
        });

        await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
      }

      // Extract basic listings
      const rawListings = await page.evaluate((max) => {
        const items = [];
        const links = Array.from(document.querySelectorAll('a.hfpxzc')).slice(0, max);

        for (const link of links) {
          const container = link.closest('div[jsaction]') || link.parentElement;
          const nameEl = container ? (container.querySelector('.fontHeadlineSmall, .qBF1Pd') || link) : link;
          const name = nameEl.textContent?.trim() || link.getAttribute('aria-label') || 'Sem Nome';
          const href = link.href || '';

          // Text content snippet in card
          const fullText = container ? container.textContent : '';

          // Rating & Reviews count
          const ratingEl = container ? container.querySelector('span.MW4etd') : null;
          const reviewsEl = container ? container.querySelector('span.UY7F9') : null;
          const rating = ratingEl ? parseFloat(ratingEl.textContent.replace(',', '.')) : null;
          let reviewsCount = null;
          if (reviewsEl) {
            const numMatch = reviewsEl.textContent.match(/\d+/g);
            if (numMatch) reviewsCount = parseInt(numMatch.join(''), 10);
          }

          items.push({
            name,
            href,
            fullText,
            rating,
            reviewsCount
          });
        }
        return items;
      }, limit);

      logger.info(`Extracted ${rawListings.length} raw listings from search feed. Gathering detailed phone & website...`);

      const results = [];
      const phoneRegex = /(?:\+?55\s*)?(?:\(?\b[1-9]{2}\)?\s*)?(?:9\s*)?[0-9]{4}[-\s]?[0-9]{4}\b/g;

      // Extract details for each listing
      for (let i = 0; i < rawListings.length; i++) {
        const item = rawListings[i];
        let phone = '';
        let website = null;
        let address = '';

        // Check if phone was already visible in card snippet
        const matches = item.fullText.match(phoneRegex);
        if (matches && matches.length > 0) {
          phone = matches[0];
        }

        // Try navigating to details view to retrieve official phone and website if missing
        if ((!phone || !website) && item.href) {
          try {
            await page.goto(item.href, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await new Promise((r) => setTimeout(r, 600));

            const details = await page.evaluate(() => {
              let p = '';
              let w = null;
              let a = '';

              // Phone selectors
              const phoneBtn = document.querySelector('button[data-tooltip*="Copiar número de telefone"], button[data-item-id^="phone:tel:"], button[aria-label*="Telefone"]');
              if (phoneBtn) {
                p = phoneBtn.getAttribute('aria-label') || phoneBtn.textContent || '';
                p = p.replace(/Telefone:\s*/i, '').trim();
              }

              // Website selectors
              const siteLink = document.querySelector('a[data-item-id="authority"], a[aria-label*="site"], a[aria-label*="Website"]');
              if (siteLink && siteLink.href && !siteLink.href.includes('google.com')) {
                w = siteLink.href;
              }

              // Address selectors
              const addrBtn = document.querySelector('button[data-item-id="address"], button[aria-label*="Endereço"]');
              if (addrBtn) {
                a = (addrBtn.getAttribute('aria-label') || addrBtn.textContent || '').replace(/Endereço:\s*/i, '').trim();
              }

              return { phone: p, website: w, address: a };
            });

            if (details.phone) phone = details.phone;
            if (details.website) website = details.website;
            if (details.address) address = details.address;
          } catch (err) {
            logger.warn(`Could not fetch details for "${item.name}": ${err.message}`);
          }
        }

        const normalizedPhone = GoogleMapsScraper.normalizePhone(phone);
        const lead = {
          business_name: item.name,
          phone_raw: phone || null,
          phone_formatted: normalizedPhone.isValid ? normalizedPhone.formatted : (phone || null),
          phone_clean: normalizedPhone.clean || null,
          is_mobile: normalizedPhone.isMobile,
          website_url: website,
          address: address || null,
          rating: item.rating,
          reviews_count: item.reviewsCount,
          maps_url: item.href
        };

        results.push(lead);
        onProgress({ current: i + 1, total: rawListings.length, lead });
      }

      logger.info(`Successfully completed Google Maps scraping: ${results.length} leads extracted.`);
      return results;
    } catch (err) {
      logger.error(`Error during Google Maps scraping: ${err.message}`, { stack: err.stack });
      throw err;
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (_) {}
      }
    }
  }
}

module.exports = GoogleMapsScraper;
