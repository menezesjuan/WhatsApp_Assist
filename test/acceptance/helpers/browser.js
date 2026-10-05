'use strict';
/**
 * Real-browser helpers (Puppeteer ships as a dependency of whatsapp-web.js).
 * Set CHROME_PATH to use a specific Chrome/Edge/Chromium executable.
 */

const fs = require('fs');

const SYSTEM_BROWSERS = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const ARGS = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--mute-audio'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer');
  } catch (err) {
    throw new Error(`Puppeteer nao encontrado (rode "npm install"): ${err.message}`);
  }
  const attempts = [{ headless: true, args: ARGS }];
  for (const executablePath of SYSTEM_BROWSERS) {
    if (fs.existsSync(executablePath)) attempts.push({ headless: true, args: ARGS, executablePath });
  }
  let lastError;
  for (const opts of attempts) {
    try {
      return await puppeteer.launch(opts);
    } catch (err) {
      lastError = err;
    }
  }
  throw new Error(`Nao foi possivel iniciar um navegador (defina CHROME_PATH): ${lastError && lastError.message}`);
}

/**
 * Opens a page and records everything a user would experience as "broken":
 * uncaught exceptions, console errors, failed requests and HTTP >= 400 responses.
 */
async function openPage(browser, url, { width = 1366, height = 768, dialogs = 'dismiss' } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height });
  page.problems = [];
  page.dialogMessages = [];
  page.on('pageerror', (e) => page.problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') page.problems.push(`console.error: ${m.text()}`); });
  page.on('requestfailed', (r) => page.problems.push(`requestfailed: ${r.url()} ${r.failure() && r.failure().errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) page.problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on('dialog', async (d) => {
    page.dialogMessages.push(d.message());
    if (dialogs === 'accept') await d.accept(); else await d.dismiss();
  });
  await page.goto(url, { waitUntil: 'networkidle0' });
  return page;
}

const isVisible = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
  }, selector);

async function waitUntil(fn, { timeout = 5000, interval = 100, message = 'condition' } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await fn()) return true;
    await sleep(interval);
  }
  throw new Error(`Timeout (${timeout}ms) waiting for ${message}`);
}

const waitVisible = (page, selector, timeout = 5000) =>
  waitUntil(() => isVisible(page, selector), { timeout, message: `visible ${selector}` });

const text = (page, selector) =>
  page.evaluate((sel) => { const el = document.querySelector(sel); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; }, selector);

/** Real mouse click on the first visible element matching selector whose text/title matches the regex. */
async function clickByText(page, selector, regex) {
  const handle = await page.evaluateHandle((sel, src) => {
    const re = new RegExp(src, 'i');
    return [...document.querySelectorAll(sel)].find((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && re.test(`${e.textContent} ${e.getAttribute('title') || ''} ${e.getAttribute('aria-label') || ''}`);
    }) || null;
  }, selector, regex.source);
  const el = handle.asElement();
  if (!el) throw new Error(`Elemento nao encontrado: ${selector} ~ ${regex}`);
  await el.click();
}

/** Waits for a toast whose text matches the regex; returns { text, type }. */
async function waitToast(page, regex, timeout = 5000) {
  let found = null;
  await waitUntil(async () => {
    found = await page.evaluate((src) => {
      const re = new RegExp(src, 'i');
      const t = [...document.querySelectorAll('#toastContainer .saas-toast')].find((e) => re.test(e.textContent));
      return t ? { text: t.textContent.replace(/\s+/g, ' ').trim(), type: t.className } : null;
    }, regex.source);
    return Boolean(found);
  }, { timeout, message: `toast ${regex}` });
  return found;
}

async function goToView(page, view) {
  await page.click(`.sidebar-nav-item[data-view="${view}"]`);
  await waitVisible(page, `#view-${view}`);
  await sleep(300);
}

module.exports = { launch, openPage, isVisible, waitUntil, waitVisible, text, clickByText, waitToast, goToView, sleep };
