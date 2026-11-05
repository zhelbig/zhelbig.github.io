/**
 * Browser smoke suite for the network mapper.
 *
 * Covers behaviour that only exists against a real DOM - key handling,
 * drag gestures, undo depth after a real interaction - which the vitest
 * suites deliberately do not try to simulate.
 *
 * Not part of `npm test`: it needs Playwright, and the filename is kept
 * outside vitest's glob on purpose so CI stays dependency-light.
 *
 *   npm install --no-save playwright && npm run test:browser
 */
import { createRequire } from 'node:module';
// Resolved through CommonJS lookup so a Playwright installed outside the
// project (global, or a toolchain directory on NODE_PATH) is still found.
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css',
               '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.pdf':'application/pdf' };

const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('nf');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? '  PASS  ' : '  FAIL  ') + name + (detail ? '  -> ' + detail : ''));
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(`http://127.0.0.1:${port}/i-tech-network-mapper.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  check('page loads with no JS errors', errors.length === 0, errors.join(' | '));
  check('GRID_SIZE matches visual grid (20)',
    await page.evaluate(() => mapper.GRID_SIZE) === 20);

  // --- 1. Delete key inside a text field must NOT delete the device ---
  await page.evaluate(() => { mapper.createDevice('server', 4000, 4000); mapper.selectDevice(mapper.state.devices[0]); });
  const before = await page.evaluate(() => mapper.state.devices.length);
  await page.focus('#propIP');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  const afterInField = await page.evaluate(() => mapper.state.devices.length);
  check('Delete/Backspace in IP field keeps the device',
    afterInField === before, `${before} -> ${afterInField}`);

  // --- 2. Delete key outside a text field still deletes ---
  await page.evaluate(() => document.getElementById('propIP').blur());
  await page.keyboard.press('Delete');
  check('Delete outside a field removes the device',
    await page.evaluate(() => mapper.state.devices.length) === 0);

  // --- 3. Click-to-select must not pollute undo history ---
  await page.evaluate(() => { mapper.createDevice('switch', 4200, 4200); });
  const depthBeforeClick = await page.evaluate(() => mapper.history.undoDepth);
  const box = await page.locator('.network-device').first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  const depthAfterClick = await page.evaluate(() => mapper.history.undoDepth);
  check('click-to-select adds no undo entry',
    depthAfterClick === depthBeforeClick, `${depthBeforeClick} -> ${depthAfterClick}`);

  // --- 4. A real drag adds exactly one undo entry, and undo restores position ---
  const posBefore = await page.evaluate(() => ({ x: mapper.state.devices[0].x, y: mapper.state.devices[0].y }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 80, { steps: 12 });
  await page.mouse.up();
  const depthAfterDrag = await page.evaluate(() => mapper.history.undoDepth);
  const posAfter = await page.evaluate(() => ({ x: mapper.state.devices[0].x, y: mapper.state.devices[0].y }));
  check('drag moved the device', posAfter.x !== posBefore.x || posAfter.y !== posBefore.y,
    `${JSON.stringify(posBefore)} -> ${JSON.stringify(posAfter)}`);
  check('drag adds exactly one undo entry',
    depthAfterDrag === depthAfterClick + 1, `${depthAfterClick} -> ${depthAfterDrag}`);
  await page.evaluate(() => mapper.undo());
  const posUndone = await page.evaluate(() => ({ x: mapper.state.devices[0].x, y: mapper.state.devices[0].y }));
  check('undo restores the pre-drag position',
    posUndone.x === posBefore.x && posUndone.y === posBefore.y,
    `expected ${JSON.stringify(posBefore)}, got ${JSON.stringify(posUndone)}`);

  // --- 5. Property edits are undoable (debounced into one step) ---
  await page.evaluate(() => mapper.selectDevice(mapper.state.devices[0]));
  const nameBefore = await page.evaluate(() => mapper.state.devices[0].name);
  await page.fill('#propName', '');
  await page.type('#propName', 'Core-SW-01', { delay: 15 });
  await page.waitForTimeout(900); // let the debounce commit
  const nameTyped = await page.evaluate(() => mapper.state.devices[0].name);
  await page.evaluate(() => mapper.undo());
  const nameUndone = await page.evaluate(() => mapper.state.devices[0].name);
  check('typed name reached state', nameTyped === 'Core-SW-01', nameTyped);
  check('undo reverts the whole typing burst',
    nameUndone === nameBefore, `expected "${nameBefore}", got "${nameUndone}"`);

  // --- 6. clearAll clears zones too ---
  page.on('dialog', d => d.accept());
  await page.evaluate(() => { mapper.createZone('mdf', 4100, 4100); mapper.createDevice('router', 4300, 4300); });
  await page.evaluate(() => mapper.clearAll());
  const cleared = await page.evaluate(() => ({
    devices: mapper.state.devices.length, zones: mapper.state.zones.length,
    zoneEls: document.querySelectorAll('.network-zone').length,
    emptyShown: document.getElementById('emptyState').style.display
  }));
  check('clearAll clears zones as well as devices',
    cleared.devices === 0 && cleared.zones === 0 && cleared.zoneEls === 0,
    JSON.stringify(cleared));

  // --- 7. deleteVlan clears dangling references ---
  const dangling = await page.evaluate(() => {
    mapper.createDevice('desktop', 4000, 4000);
    const d = mapper.state.devices[0];
    d.vlan = '10';
    mapper.state.ssids.push({ name: 'Test', security: 'WPA2-Personal', vlan: '10' });
    const idx = mapper.state.vlans.findIndex(v => v.id === 10);
    window.deleteVlan(idx);
    return { deviceVlan: d.vlan, ssidVlan: mapper.state.ssids[0].vlan,
             vlanGone: !mapper.state.vlans.some(v => v.id === 10) };
  });
  check('deleteVlan clears device + SSID references',
    dangling.vlanGone && dangling.deviceVlan === '' && dangling.ssidVlan === '',
    JSON.stringify(dangling));

  check('no JS errors across the whole run', errors.length === 0, errors.join(' | '));

  await browser.close();
  server.close();

  const failed = results.filter(r => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
