const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function capture() {
  const outDir = path.join(__dirname, '..', 'docs', 'screenshots');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Launching headless browser to capture screenshots...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1.5 });

  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // 1. Dashboard
  console.log('Capturing 01-dashboard.png...');
  await page.evaluate(() => window.switchView('dashboard'));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '01-dashboard.png') });

  // 2. Kanban Tasks
  console.log('Capturing 02-kanban-tasks.png...');
  await page.evaluate(() => window.switchView('tasks'));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '02-kanban-tasks.png') });

  // 3. WhatsApp Web Integrado (Live Chat)
  console.log('Capturing 03-chat-integrado.png...');
  await page.evaluate(() => {
    window.switchView('chat');
    // Click on the first chat item if available
    const firstItem = document.querySelector('.wa-chat-item');
    if (firstItem) firstItem.click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '03-chat-integrado.png') });

  // 4. Automações & Linha do Tempo
  console.log('Capturing 04-automacoes-fluxos.png...');
  await page.evaluate(() => window.switchView('automations'));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '04-automacoes-fluxos.png') });

  // 5. Conexão WhatsApp
  console.log('Capturing 05-conexao-whatsapp.png...');
  await page.evaluate(() => window.switchView('whatsapp'));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '05-conexao-whatsapp.png') });

  // 6. Configurações
  console.log('Capturing 06-configuracoes.png...');
  await page.evaluate(() => window.switchView('settings'));
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: path.join(outDir, '06-configuracoes.png') });

  await browser.close();
  console.log('All screenshots captured successfully into docs/screenshots/ !');
}

capture().catch(err => {
  console.error('Error capturing screenshots:', err);
  process.exit(1);
});
