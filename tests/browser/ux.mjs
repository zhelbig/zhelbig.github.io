/**
 * Browser checks for the Phase 5 UX work: non-blocking feedback, autosave
 * and restore, Ctrl+S, the exit guard, and that user-supplied names cannot
 * rewrite the page.
 *
 * Not part of `npm test`: needs Playwright.
 *   npm install --no-save playwright && npm run test:ux
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg','.png':'image/png'};
const server = http.createServer((rq,rs)=>{
  const p = path.join(ROOT, decodeURIComponent(rq.url.split('?')[0]));
  if(!p.startsWith(ROOT)||!fs.existsSync(p)||fs.statSync(p).isDirectory()){rs.writeHead(404);return rs.end();}
  rs.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});
  fs.createReadStream(p).pipe(rs);
});

let fail = 0;
const check = (n, ok, d='') => { console.log((ok?'  PASS  ':'  FAIL  ')+n+(d?'  -> '+d:'')); if(!ok) fail++; };

await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true });
const page = await ctx.newPage();

const errs = [], dialogs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('dialog', async d => {
  dialogs.push(d.type());
  // beforeunload must be accepted or the navigation never completes; any
  // other dialog means something still uses alert()/confirm() unexpectedly.
  await d.accept();
});

const KEY = 'netmapper:autosave:i-tech-network-mapper';
const url = `http://127.0.0.1:${port}/i-tech-network-mapper.html`;
const boot = async () => {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.mapper);
};
await boot();

// ── 1. Feedback is a toast, not a blocking alert ──
await page.click('#exportPdfBtn');
await page.click('.modal-bg.active .btn-primary');
await page.waitForTimeout(300);
const emptyExport = await page.evaluate(() => {
  const t = document.querySelector('#toastHost .toast');
  return t ? { text: t.textContent, cls: t.className } : null;
});
check('exporting an empty canvas warns without blocking',
  !!emptyExport && /Nothing to export/i.test(emptyExport.text) && /toast-warn/.test(emptyExport.cls),
  emptyExport ? emptyExport.text.slice(0,58) : 'no toast');
check('no alert() was raised', dialogs.length === 0, dialogs.join(','));

// ── 2. Autosave writes to a namespaced slot ──
const EVIL = '<img src=x onerror="window.__pwned=1">Core FW';
await page.evaluate((evil) => {
  document.querySelectorAll('#toastHost .toast').forEach(t => t.remove());
  mapper.createDevice('firewall', 4000, 4000);
  mapper.createDevice('switch', 4200, 4000);
  mapper.selectDevice(mapper.state.devices[0]);
  updateDeviceProp('name', evil);     // the normal edit path
}, EVIL);
await page.waitForTimeout(1800);      // past the autosave debounce
const stored = await page.evaluate(k => {
  const raw = localStorage.getItem(k);
  return raw ? { v: JSON.parse(raw).v, devices: JSON.parse(JSON.parse(raw).state).devices.length } : null;
}, KEY);
check('autosave writes a snapshot to its own namespaced key',
  !!stored && stored.devices === 2, JSON.stringify(stored));
check("the other shell's slot is untouched",
  (await page.evaluate(() => localStorage.getItem('netmapper:autosave:network-mapper'))) === null);

// ── 3. Reload offers the work back; the exit guard fires ──
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.mapper);
await page.waitForTimeout(300);
check('the exit guard prompted before unloading unsaved work',
  dialogs.includes('beforeunload'), dialogs.join(','));

const offered = await page.evaluate(() => {
  const t = document.querySelector('#toastHost .toast');
  return t ? { text: t.textContent, hasAction: !!t.querySelector('.toast-action') } : null;
});
check('a reload offers the unsaved work back',
  !!offered && /Unsaved work/i.test(offered.text) && offered.hasAction,
  offered ? offered.text.slice(0,58) : 'no toast');

const before = await page.evaluate(() => mapper.state.devices.length);
await page.click('#toastHost .toast-action');
await page.waitForTimeout(300);
const after = await page.evaluate(() => ({
  devices: mapper.state.devices.length,
  rendered: document.querySelectorAll('.network-device').length
}));
check('restoring brings the diagram back and renders it',
  before === 0 && after.devices === 2 && after.rendered === 2,
  `${before} -> ${JSON.stringify(after)}`);

// ── 4. The restored name went through renderDevice, the innerHTML path ──
const nameSafe = await page.evaluate(() => {
  const el = [...document.querySelectorAll('.network-device .device-name')]
    .find(e => e.textContent.includes('Core FW'));
  return el ? {
    text: el.textContent,
    injectedImg: !!document.querySelector('.network-device img'),
    pwned: !!window.__pwned
  } : null;
});
check('a name containing markup renders as text, not as an element',
  !!nameSafe && nameSafe.text.startsWith('<img') && !nameSafe.injectedImg && !nameSafe.pwned,
  nameSafe ? JSON.stringify(nameSafe).slice(0,100) : 'name not found');

// ── 5. Ctrl+S saves the project instead of the page ──
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.keyboard.press('Control+s');
const download = await dl;
check('Ctrl+S exports the project as JSON',
  !!download && /\.json$/.test(download.suggestedFilename()),
  download ? download.suggestedFilename() : 'no download');

await page.waitForTimeout(250);
check('an explicit save confirms itself', await page.evaluate(() =>
  [...document.querySelectorAll('#toastHost .toast')].some(t => /saved to your downloads/i.test(t.textContent))));

// ── 6. Having saved, closing should no longer nag ──
dialogs.length = 0;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.mapper);
check('after an explicit save the exit guard stays quiet',
  !dialogs.includes('beforeunload'), dialogs.join(','));

// ── 7. Zone names render, and are equally safe ──
const zoneName = await page.evaluate(() => {
  mapper.createZone('mdf', 4000, 4400);
  const z = mapper.state.zones[0];
  z.name = '<b>MDF</b> Room';
  document.getElementById(z.id).remove();
  // force the render path a load/undo takes
  mapper.state.zones = [z];
  mapper.undo(); mapper.redo();
  const el = document.querySelector('.network-zone .zone-name');
  return el ? { text: el.textContent, bold: !!document.querySelector('.network-zone b') } : null;
});
check('zone names render as text and are not empty',
  !!zoneName && zoneName.text.length > 0 && !zoneName.bold,
  zoneName ? JSON.stringify(zoneName) : 'no zone name element');

check('no JS errors', errs.length === 0, errs.join(' | '));
await browser.close(); server.close();
console.log(fail ? `\n${fail} failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
