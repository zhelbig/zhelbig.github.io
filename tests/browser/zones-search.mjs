/**
 * Browser checks for zone parenting and the device search panel.
 *
 * Not part of `npm test`: needs Playwright.
 *   npm install --no-save playwright && npm run test:zones
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
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
const errs = []; page.on('pageerror', e => errs.push(e.message));
page.on('dialog', async d => await d.accept());

await page.goto(`http://127.0.0.1:${server.address().port}/i-tech-network-mapper.html`,
  { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.mapper);

// ── Zone with two devices inside and one deliberately outside ──
await page.evaluate(() => {
  localStorage.clear();
  mapper.createZone('mdf', 4100, 4100);
  const z = mapper.state.zones[0];
  z.width = 400; z.height = 420;
  document.getElementById(z.id).style.width = '400px';
  document.getElementById(z.id).style.height = '420px';
  mapper.createDevice('switch', 4140, 4160);   // inside
  mapper.createDevice('server', 4140, 4300);   // inside
  mapper.createDevice('printer', 4600, 4160);  // outside
  document.getElementById('emptyState').style.display = 'none';
  mapper.drawConnections();
});
await page.waitForTimeout(250);

// Ask the app itself rather than re-deriving containment with a guessed
// device height - the boxes are ~137px tall, not 100.
const membership = await page.evaluate(() => ({
  inside: mapper.devicesInZone(mapper.state.zones[0]).map(d => d.name),
  total: mapper.state.devices.length,
  boxHeight: mapper.deviceSize(mapper.state.devices[0].id).height
}));
check('the zone contains exactly the two devices drawn inside it',
  membership.inside.length === 2 && membership.total === 3,
  JSON.stringify(membership));

// ── Dragging the zone body carries its contents ──
const before = await page.evaluate(() => ({
  zone: { x: mapper.state.zones[0].x, y: mapper.state.zones[0].y },
  devices: mapper.state.devices.map(d => ({ id: d.id, name: d.name, x: d.x, y: d.y }))
}));
const undoBefore = await page.evaluate(() => mapper.history.undoDepth);

const zoneBox = await page.locator('.network-zone').boundingBox();
// Press the body, well away from the header and the resize corner.
const px = zoneBox.x + zoneBox.width - 40;
const py = zoneBox.y + zoneBox.height - 60;
await page.mouse.move(px, py);
await page.mouse.down();
await page.mouse.move(px + 160, py + 80, { steps: 12 });
await page.mouse.up();
await page.waitForTimeout(150);

const after = await page.evaluate(() => ({
  zone: { x: mapper.state.zones[0].x, y: mapper.state.zones[0].y },
  devices: mapper.state.devices.map(d => ({ id: d.id, name: d.name, x: d.x, y: d.y }))
}));
const undoAfter = await page.evaluate(() => mapper.history.undoDepth);

const zoneDelta = { dx: after.zone.x - before.zone.x, dy: after.zone.y - before.zone.y };
check('dragging the zone body moves it', zoneDelta.dx !== 0 || zoneDelta.dy !== 0, JSON.stringify(zoneDelta));

const deltas = before.devices.map(b => {
  const a = after.devices.find(x => x.id === b.id);
  return { name: b.name, dx: a.x - b.x, dy: a.y - b.y };
});
const carried = deltas.filter(d => d.dx === zoneDelta.dx && d.dy === zoneDelta.dy);
const stranded = deltas.filter(d => d.dx === 0 && d.dy === 0);
check('devices inside travel with the zone', carried.length === 2, JSON.stringify(deltas));
check('a device outside is left where it was', stranded.length === 1, JSON.stringify(stranded));
check('zone and contents are one undo step', undoAfter === undoBefore + 1, `${undoBefore} -> ${undoAfter}`);

await page.evaluate(() => mapper.undo());
const undone = await page.evaluate(() => ({
  zone: { x: mapper.state.zones[0].x, y: mapper.state.zones[0].y },
  devices: mapper.state.devices.map(d => ({ id: d.id, x: d.x, y: d.y }))
}));
check('undo restores the zone and everything it carried',
  undone.zone.x === before.zone.x && undone.zone.y === before.zone.y &&
  before.devices.every(b => {
    const u = undone.devices.find(x => x.id === b.id);
    return u && u.x === b.x && u.y === b.y;
  }));

// ── Search ──
await page.evaluate(() => {
  mapper.state.devices[0].name = 'Core Switch';
  mapper.state.devices[0].ip = '192.168.1.2';
  mapper.state.devices[1].name = 'DC01';
  mapper.state.devices[1].ip = '192.168.20.10';
  mapper.deselectAll();
});

await page.fill('#deviceSearch', 'core');
await page.waitForTimeout(150);
const results = await page.evaluate(() => ({
  shown: !document.getElementById('searchResults').hidden,
  paletteHidden: document.getElementById('palette').hidden,
  hits: [...document.querySelectorAll('.search-hit .hit-name')].map(e => e.textContent)
}));
check('typing filters the sidebar to matching devices',
  results.shown && results.paletteHidden && results.hits.length === 1 && results.hits[0] === 'Core Switch',
  JSON.stringify(results));

await page.fill('#deviceSearch', '192.168.20');
await page.waitForTimeout(150);
check('searching by IP works', await page.evaluate(() =>
  [...document.querySelectorAll('.search-hit .hit-name')].map(e => e.textContent).join()) === 'DC01');

await page.fill('#deviceSearch', 'zzzz');
await page.waitForTimeout(150);
check('a query with no matches says so', await page.evaluate(() =>
  !!document.querySelector('.search-empty')));

// ── Clicking a result selects it and brings it into view ──
await page.fill('#deviceSearch', 'DC01');
await page.waitForTimeout(150);
const panBefore = await page.evaluate(() => ({ x: mapper.state.panX, y: mapper.state.panY }));
await page.click('.search-hit');
await page.waitForTimeout(200);
const revealed = await page.evaluate(() => {
  const d = mapper.state.devices.find(x => x.name === 'DC01');
  const el = document.getElementById(d.id);
  const r = el.getBoundingClientRect();
  const area = document.getElementById('canvasArea').getBoundingClientRect();
  return {
    selected: mapper.selection.has(d.id),
    // Centre of the device should land near the centre of the canvas view.
    offX: Math.abs((r.x + r.width / 2) - (area.x + area.width / 2)),
    offY: Math.abs((r.y + r.height / 2) - (area.y + area.height / 2))
  };
});
check('clicking a result selects that device', revealed.selected);
check('and pans it to the middle of the view',
  revealed.offX < 4 && revealed.offY < 4, JSON.stringify(revealed));

// ── Escape clears the filter before leaving the field ──
await page.fill('#deviceSearch', 'core');
await page.waitForTimeout(100);
await page.press('#deviceSearch', 'Escape');
await page.waitForTimeout(100);
check('Escape clears the search and restores the palette', await page.evaluate(() =>
  document.getElementById('deviceSearch').value === '' &&
  document.getElementById('searchResults').hidden &&
  !document.getElementById('palette').hidden));

// ── Ctrl+F focuses the search, not the browser's find bar ──
await page.evaluate(() => document.getElementById('deviceSearch').blur());
await page.keyboard.press('Control+f');
check('Ctrl+F focuses the device search', await page.evaluate(() =>
  document.activeElement === document.getElementById('deviceSearch')));

check('no JS errors', errs.length === 0, errs.join(' | '));
await browser.close(); server.close();
console.log(fail ? `\n${fail} failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
