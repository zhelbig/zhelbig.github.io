/**
 * Browser checks for the selection model: shift-click, marquee, group drag,
 * and the keyboard operations built on them.
 *
 * Not part of `npm test`: needs Playwright.
 *   npm install --no-save playwright && npm run test:selection
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

// A 3x3 grid of devices, comfortably on screen.
await page.evaluate(() => {
  localStorage.clear();
  for (let i = 0; i < 9; i++) {
    mapper.createDevice('server', 4120 + (i % 3) * 180, 4120 + Math.floor(i / 3) * 180);
  }
  document.getElementById('emptyState').style.display = 'none';
});
await page.waitForTimeout(250);

const boxes = [];
for (const h of await page.locator('.network-device').all()) boxes.push(await h.boundingBox());
const centre = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const sel = () => page.evaluate(() => mapper.selection.size);

// ── 1. Plain click selects one ──
await page.mouse.click(centre(boxes[0]).x, centre(boxes[0]).y);
check('clicking a device selects just it', await sel() === 1);
check('the single-device panel is shown', await page.evaluate(() =>
  getComputedStyle(document.getElementById('deviceProps')).display !== 'none' &&
  getComputedStyle(document.getElementById('multiProps')).display === 'none'));

// ── 2. Shift-click adds, and removes ──
await page.keyboard.down('Shift');
await page.mouse.click(centre(boxes[1]).x, centre(boxes[1]).y);
const two = await sel();
await page.mouse.click(centre(boxes[2]).x, centre(boxes[2]).y);
const three = await sel();
await page.mouse.click(centre(boxes[2]).x, centre(boxes[2]).y);   // toggle back off
const backToTwo = await sel();
await page.keyboard.up('Shift');
check('shift-click adds to the selection', two === 2 && three === 3, `${two}, ${three}`);
check('shift-click again removes it', backToTwo === 2, String(backToTwo));
check('the multi panel appears and counts correctly', await page.evaluate(() =>
  getComputedStyle(document.getElementById('multiProps')).display !== 'none' &&
  /2 devices selected/.test(document.getElementById('multiCount').textContent)));

// ── 3. Clicking empty canvas clears ──
// Find a point that really is bare canvas. The floating panels - the
// Power bubble, the zoom controls, the connection toolbar, the config box -
// cover several corners, so picking one by hand goes stale.
const empty = await page.evaluate(() => {
  const area = document.getElementById('canvasArea');
  const r = area.getBoundingClientRect();
  for (let y = r.top + 40; y < r.bottom - 40; y += 30) {
    for (let x = r.left + 40; x < r.right - 40; x += 30) {
      const el = document.elementFromPoint(x, y);
      if (!el) continue;
      if (el.closest('.network-device') || el.closest('.network-zone')) continue;
      if (el.closest('.ups-box') || el.closest('.controls') ||
          el.closest('.conn-toolbar') || el.closest('.network-info-box') ||
          el.closest('.pan-hint') || el.closest('.undo-redo')) continue;
      if (area.contains(el)) return { x, y };
    }
  }
  return null;
});
if (!empty) throw new Error('no bare canvas point found');
await page.mouse.click(empty.x, empty.y);
check('clicking empty canvas deselects', await sel() === 0);

// ── 4. Shift-drag draws a marquee over a region ──
await page.keyboard.down('Shift');
await page.mouse.move(boxes[0].x - 12, boxes[0].y - 12);
await page.mouse.down();
await page.mouse.move(boxes[4].x + boxes[4].width + 12, boxes[4].y + boxes[4].height + 12, { steps: 12 });
const bandVisible = await page.evaluate(() => !document.getElementById('marquee').hidden);
await page.mouse.up();
await page.keyboard.up('Shift');
const marqueed = await sel();
check('a marquee is drawn while dragging', bandVisible);
check('the marquee is hidden afterwards', await page.evaluate(() =>
  document.getElementById('marquee').hidden));
check('shift-drag selects the devices it covers', marqueed === 4, `${marqueed} selected, expected 4`);

// ── 5. Dragging one of the group moves them all, as one undo step ──
const before = await page.evaluate(() =>
  mapper.selectedDevices().map(d => ({ id: d.id, x: d.x, y: d.y })));
const undoBefore = await page.evaluate(() => mapper.history.undoDepth);
const dragged = await page.evaluate(() => mapper.selectedDevices()[0].id);
const dragBox = await page.locator('#' + dragged).boundingBox();
await page.mouse.move(centre(dragBox).x, centre(dragBox).y);
await page.mouse.down();
await page.mouse.move(centre(dragBox).x + 140, centre(dragBox).y + 60, { steps: 12 });
await page.mouse.up();
const after = await page.evaluate(() =>
  mapper.selectedDevices().map(d => ({ id: d.id, x: d.x, y: d.y })));
const undoAfter = await page.evaluate(() => mapper.history.undoDepth);

const deltas = before.map(b => {
  const a = after.find(x => x.id === b.id);
  return { dx: a.x - b.x, dy: a.y - b.y };
});
const allMoved = deltas.every(d => d.dx !== 0 || d.dy !== 0);
const sameDelta = deltas.every(d => d.dx === deltas[0].dx && d.dy === deltas[0].dy);
check('every selected device moved', allMoved, JSON.stringify(deltas));
check('relative spacing is preserved', sameDelta, JSON.stringify(deltas[0]));
check('the group move is a single undo step', undoAfter === undoBefore + 1,
  `${undoBefore} -> ${undoAfter}`);

await page.evaluate(() => mapper.undo());
const undone = await page.evaluate(() => mapper.state.devices.map(d => ({ id: d.id, x: d.x, y: d.y })));
check('undo puts the whole group back', before.every(b => {
  const u = undone.find(x => x.id === b.id);
  return u && u.x === b.x && u.y === b.y;
}));

// ── 6. Keyboard: select all, nudge, duplicate, delete ──
await page.evaluate(() => document.body.focus());
await page.keyboard.press('Control+a');
check('Ctrl+A selects every device', await sel() === 9, String(await sel()));

const nudgeFrom = await page.evaluate(() => mapper.state.devices[0].x);
await page.keyboard.press('ArrowRight');
const nudgedGrid = await page.evaluate(() => mapper.state.devices[0].x);
await page.keyboard.press('Shift+ArrowLeft');
const nudgedFine = await page.evaluate(() => mapper.state.devices[0].x);
check('an arrow key nudges by one grid step',
  nudgedGrid === nudgeFrom + 20, `${nudgeFrom} -> ${nudgedGrid}`);
check('shift+arrow nudges by a single pixel',
  nudgedFine === nudgedGrid - 1, `${nudgedGrid} -> ${nudgedFine}`);

await page.evaluate(() => {
  mapper.setSelection(mapper.state.devices.slice(0, 2).map(d => d.id));
  const [a, b] = mapper.state.devices;
  mapper.state.connections.push({ id: 'link', from: a.id, to: b.id,
    fromPos: 'right', toPos: 'left', type: 'wired', routingStyle: 'curved' });
  mapper.drawConnections();
});
const dupBefore = await page.evaluate(() => ({
  devices: mapper.state.devices.length, conns: mapper.state.connections.length }));
await page.keyboard.press('Control+d');
await page.waitForTimeout(200);
const dupAfter = await page.evaluate(() => ({
  devices: mapper.state.devices.length, conns: mapper.state.connections.length,
  selected: mapper.selection.size }));
check('Ctrl+D duplicates the selected devices',
  dupAfter.devices === dupBefore.devices + 2, JSON.stringify(dupAfter));
check('a connection wholly inside the selection is duplicated too',
  dupAfter.conns === dupBefore.conns + 1, `${dupBefore.conns} -> ${dupAfter.conns}`);
check('the copies become the selection', dupAfter.selected === 2, String(dupAfter.selected));

await page.keyboard.press('Delete');
await page.waitForTimeout(150);
check('Delete removes the whole selection', await page.evaluate(() =>
  mapper.state.devices.length) === dupBefore.devices, String(await page.evaluate(() => mapper.state.devices.length)));

check('no JS errors', errs.length === 0, errs.join(' | '));
await browser.close(); server.close();
console.log(fail ? `\n${fail} failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
