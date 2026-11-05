/**
 * Browser checks for power protection: the Power bubble, the per-device
 * checkboxes, the glowing battery tag, and migration of the two earlier
 * shapes this feature had.
 *
 * Not part of `npm test`: needs Playwright.
 *   npm install --no-save playwright && npm run test:ups
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
await page.evaluate(() => localStorage.clear());

// ── The bubble ──
check('a Power bubble sits in the bottom-left of the canvas', await page.evaluate(() => {
  const b = document.getElementById('upsBox'), a = document.getElementById('canvasArea');
  if (!b) return false;
  const r = b.getBoundingClientRect(), ar = a.getBoundingClientRect();
  // Left edge hugs the canvas; vertically it sits in the bottom quarter,
  // raised just enough to clear the zoom controls below it.
  return r.left - ar.left < 40 && r.bottom > ar.top + ar.height * 0.75;
}));
check('it starts empty', await page.evaluate(() =>
  /None configured/i.test(document.getElementById('upsBoxList').textContent)));
check('UPS is no longer something you place', await page.evaluate(() =>
  !document.querySelector('[data-type="ups"]') && !document.querySelector('[data-zone="ups"]')));

// ── Adding a unit ──
await page.click('#upsBox h4');
await page.waitForTimeout(150);
check('clicking the bubble opens the manager', await page.evaluate(() =>
  document.getElementById('upsConfigModal').classList.contains('active')));

await page.click('#upsConfigModal .add-btn');
await page.fill('#newUpsName', 'Rack A UPS');
await page.selectOption('#newUpsMfg', 'APC');
await page.fill('#newUpsCapacity', '1500');
await page.fill('#newUpsRuntime', '20');
await page.click('#upsModal .btn-primary');
await page.waitForTimeout(200);
check('the unit is stored', await page.evaluate(() =>
  mapper.state.upsUnits.length === 1 && mapper.state.upsUnits[0].name === 'Rack A UPS'));
check('and shows in the bubble', await page.evaluate(() =>
  /Rack A UPS/.test(document.getElementById('upsBoxList').textContent)));

await page.click('#upsConfigModal .add-btn');
await page.fill('#newUpsName', 'Rack A UPS');
await page.click('#upsModal .btn-primary');
await page.waitForTimeout(200);
check('a duplicate name is refused with a reason', await page.evaluate(() =>
  mapper.state.upsUnits.length === 1 &&
  [...document.querySelectorAll('#toastHost .toast')].some(t => /already exists/i.test(t.textContent))));
await page.click('#upsModal .modal-close');
await page.click('#upsConfigModal .modal-footer .btn-primary');
await page.waitForTimeout(150);

// ── Which types offer the checkbox ──
await page.evaluate(() => {
  ['router','firewall','switch','ap','vmhost','nas','server','printer']
    .forEach((t,i) => mapper.createDevice(t, 4120 + (i%4)*170, 4120 + Math.floor(i/4)*170));
  mapper.createZone('nvr', 4120, 4480);
  mapper.createZone('mdf', 4400, 4480);
  document.getElementById('emptyState').style.display = 'none';
});
await page.waitForTimeout(250);

const offers = await page.evaluate(() => {
  const out = {};
  mapper.state.devices.forEach(d => {
    mapper.selectDevice(d);
    out[d.type] = getComputedStyle(document.getElementById('powerSection')).display !== 'none';
  });
  mapper.state.zones.forEach(z => {
    mapper.selectZone(z);
    out[z.type] = getComputedStyle(document.getElementById('zonePowerSection')).display !== 'none';
  });
  return out;
});
const want = { router:true, firewall:true, switch:true, ap:true, vmhost:true, nas:true, nvr:true,
               server:false, printer:false, mdf:false };
const wrong = Object.keys(want).filter(k => offers[k] !== want[k]);
check('exactly the seven intended types offer the checkbox',
  wrong.length === 0, wrong.length ? JSON.stringify({wrong, offers}) : '7 of 10');

// ── Ticking puts a glowing battery on the map ──
await page.evaluate(() => {
  const fw = mapper.state.devices.find(d => d.type === 'firewall');
  mapper.selectDevice(fw);
  document.querySelector('#powerList input[type=checkbox]').click();
});
await page.waitForTimeout(200);
const tag = await page.evaluate(() => {
  const fw = mapper.state.devices.find(d => d.type === 'firewall');
  const el = document.getElementById(fw.id);
  const t = el.querySelector('.power-tag');
  if (!t) return null;
  const dot = el.querySelector('.device-status');
  const tr = t.getBoundingClientRect(), dr = dot.getBoundingClientRect();
  const cs = getComputedStyle(t);
  return {
    assigned: fw.upsIds.length,
    colour: cs.color,
    glows: cs.filter !== 'none' && /drop-shadow/.test(cs.filter),
    animated: cs.animationName !== 'none',
    leftOfDot: tr.right <= dr.left + 2,
    sameRow: Math.abs(tr.top - dr.top) < 8,
    title: t.title,
    onlyOne: document.querySelectorAll('.power-tag').length === 1
  };
});
check('ticking assigns the UPS', tag && tag.assigned === 1);
check('a battery appears on that device alone', tag && tag.onlyOne);
check('it is green', tag && /34,\s*197,\s*94/.test(tag.colour), tag && tag.colour);
check('it glows', tag && tag.glows, tag && tag.glows ? '' : 'no drop-shadow');
check('it pulses', tag && tag.animated);
check('it sits beside the status dot', tag && tag.leftOfDot && tag.sameRow, JSON.stringify(tag));
check('it names the UPS on hover', tag && /Rack A UPS/.test(tag.title), tag && tag.title);

// ── The NVR zone works the same way ──
await page.evaluate(() => {
  const nvr = mapper.state.zones.find(z => z.type === 'nvr');
  mapper.selectZone(nvr);
  document.querySelector('#zonePowerList input[type=checkbox]').click();
});
await page.waitForTimeout(200);
check('an NVR zone can be put on a UPS too', await page.evaluate(() => {
  const nvr = mapper.state.zones.find(z => z.type === 'nvr');
  return nvr.upsIds.length === 1 && !!document.getElementById(nvr.id).querySelector('.power-tag');
}));

check('the bubble counts what is assigned', await page.evaluate(() =>
  /2 devices/.test(document.getElementById('upsBoxList').textContent)));

// ── Unticking removes it ──
await page.evaluate(() => {
  const fw = mapper.state.devices.find(d => d.type === 'firewall');
  mapper.selectDevice(fw);
  document.querySelector('#powerList input[type=checkbox]').click();
});
await page.waitForTimeout(200);
check('unticking removes the battery', await page.evaluate(() => {
  const fw = mapper.state.devices.find(d => d.type === 'firewall');
  return fw.upsIds.length === 0 && !document.getElementById(fw.id).querySelector('.power-tag');
}));

// ── Deleting a unit clears what referenced it ──
await page.evaluate(() => {
  const ap = mapper.state.devices.find(d => d.type === 'ap');
  mapper.selectDevice(ap);
  document.querySelector('#powerList input[type=checkbox]').click();
  mapper.deleteUps(0);
});
await page.waitForTimeout(250);
check('deleting a UPS clears every reference and tag', await page.evaluate(() =>
  mapper.state.upsUnits.length === 0 &&
  ![...mapper.state.devices, ...mapper.state.zones].some(o => o.upsIds && o.upsIds.length) &&
  document.querySelectorAll('.power-tag').length === 0));

// ── Both legacy shapes migrate ──
const legacy = {
  devices: [
    { id: 'd1', type: 'switch',   name: 'SW1', x: 4200, y: 4200, status: 'online' },
    { id: 'd2', type: 'firewall', name: 'FW1', x: 5200, y: 5200, status: 'online' },
    { id: 'u1', type: 'ups', name: 'Device-era UPS', x: 0, y: 0, capacity: '3000', protects: ['d2'] }
  ],
  connections: [],
  zones: [{ id: 'z1', type: 'ups', name: 'Zone-era UPS', x: 4150, y: 4150,
            width: 400, height: 400, capacity: '1500' }],
  vlans: [], ssids: [], config: {}
};
await page.evaluate(() => { mapper.state.devices = []; mapper.state.zones = []; mapper.deselectAll(); });
await page.setInputFiles('#jsonFileInput', {
  name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy))
});
await page.waitForTimeout(600);

const after = await page.evaluate(() => ({
  units: mapper.state.upsUnits.map(u => u.name).sort(),
  noUpsDevice: !mapper.state.devices.some(d => d.type === 'ups'),
  noUpsZone: !mapper.state.zones.some(z => z.type === 'ups'),
  sw: (mapper.state.devices.find(d => d.name === 'SW1') || {}).upsIds,
  fw: (mapper.state.devices.find(d => d.name === 'FW1') || {}).upsIds,
  tags: document.querySelectorAll('.power-tag').length
}));
check('both legacy shapes become configured units',
  after.units.join() === 'Device-era UPS,Zone-era UPS' && after.noUpsDevice && after.noUpsZone,
  JSON.stringify(after.units));
check('the zone-era assignment survives (it was inside the box)',
  Array.isArray(after.sw) && after.sw.length === 1, JSON.stringify(after.sw));
check('the device-era protects list survives',
  Array.isArray(after.fw) && after.fw.length === 1, JSON.stringify(after.fw));
check('and both wear their battery', after.tags === 2, String(after.tags));

// ── The bubble must not land on the other floating panels ──
// It shares the bottom edge with the zoom controls and the connection
// toolbar, and the canvas narrows as the window does.
for (const width of [1500, 1280, 1100]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(150);
  const clash = await page.evaluate(() => {
    const box = sel => { const e = document.querySelector(sel); if (!e) return null;
      const b = e.getBoundingClientRect(); return { l:b.left, r:b.right, t:b.top, b:b.bottom }; };
    const hit = (a, c) => a && c && !(a.r < c.l || c.r < a.l || a.b < c.t || c.b < a.t);
    const ups = box('.ups-box');
    return ['.controls', '.conn-toolbar', '.pan-hint', '.network-info-box']
      .filter(sel => hit(ups, box(sel)));
  });
  check(`the bubble is clear of the other panels at ${width}px`,
    clash.length === 0, clash.join(', '));
}

check('no JS errors', errs.length === 0, errs.join(' | '));
await browser.close(); server.close();
console.log(fail ? `\n${fail} failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
