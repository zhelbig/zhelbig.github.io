/**
 * Browser checks for UPS-as-a-device: the protects list, the battery tag
 * on protected devices, and migration of UPS zones in older files.
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

// ── UPS is in the device palette, not the zone palette ──
check('UPS is offered as a device', await page.evaluate(() =>
  !!document.querySelector('.device-item[data-type="ups"]')));
check('UPS is no longer a zone', await page.evaluate(() =>
  !document.querySelector('.device-item[data-zone="ups"]')));

// ── Build a UPS plus devices, and protect two of them ──
await page.evaluate(() => {
  mapper.createDevice('ups', 4150, 4150);
  mapper.createDevice('server', 4350, 4150);
  mapper.createDevice('switch', 4350, 4320);
  mapper.createDevice('printer', 4550, 4150);
  document.getElementById('emptyState').style.display = 'none';
  mapper.selectDevice(mapper.state.devices[0]);
});
await page.waitForTimeout(250);

check('selecting the UPS shows its panel', await page.evaluate(() =>
  getComputedStyle(document.getElementById('upsSection')).display !== 'none'));

const listed = await page.evaluate(() =>
  [...document.querySelectorAll('#upsProtectsList .ups-row-name')].map(e => e.textContent));
check('the protects list offers every other device, and not itself',
  listed.length === 3 && !listed.some(n => /UPS/.test(n)), JSON.stringify(listed));

// Tick the first two.
await page.evaluate(() => {
  const boxes = document.querySelectorAll('#upsProtectsList input[type=checkbox]');
  boxes[0].click(); boxes[1].click();
});
await page.waitForTimeout(200);

const protectedState = await page.evaluate(() => {
  const ups = mapper.state.devices.find(d => d.type === 'ups');
  return {
    protects: ups.protects.length,
    tags: document.querySelectorAll('.power-tag').length,
    taggedIds: [...document.querySelectorAll('.network-device')]
      .filter(el => el.querySelector('.power-tag')).map(el => el.id),
    upsHasTag: !!document.getElementById(ups.id).querySelector('.power-tag')
  };
});
check('ticking two devices records them on the UPS', protectedState.protects === 2, String(protectedState.protects));
check('each protected device gets a battery tag', protectedState.tags === 2, String(protectedState.tags));
check('the UPS itself gets no tag', !protectedState.upsHasTag);

const tagLook = await page.evaluate(() => {
  const t = document.querySelector('.power-tag');
  const dot = t.closest('.network-device').querySelector('.device-status');
  const tr = t.getBoundingClientRect(), dr = dot.getBoundingClientRect();
  return {
    colour: getComputedStyle(t).color,
    title: t.title,
    // sits immediately left of the status dot, roughly level with it
    leftOfDot: tr.right <= dr.left + 2,
    sameRow: Math.abs(tr.top - dr.top) < 8
  };
});
check('the tag is green', /0,\s*197,\s*94|34,\s*197,\s*94/.test(tagLook.colour), tagLook.colour);
check('the tag sits next to the status dot',
  tagLook.leftOfDot && tagLook.sameRow, JSON.stringify(tagLook));
check('the tag names the UPS on hover', /^On /.test(tagLook.title), tagLook.title);

// ── The protected device shows what feeds it ──
await page.evaluate(() => {
  const ups = mapper.state.devices.find(d => d.type === 'ups');
  mapper.selectDevice(mapper.state.devices.find(d => d.id === ups.protects[0]));
});
await page.waitForTimeout(200);
const pb = await page.evaluate(() => ({
  shown: getComputedStyle(document.getElementById('protectedBySection')).display !== 'none',
  name: (document.querySelector('#protectedByList .pb-name') || {}).textContent
}));
check('a protected device lists the UPS feeding it', pb.shown && /UPS/.test(pb.name || ''), JSON.stringify(pb));

const unprotected = await page.evaluate(() => {
  const ups = mapper.state.devices.find(d => d.type === 'ups');
  const free = mapper.state.devices.find(d => d.type !== 'ups' && !ups.protects.includes(d.id));
  mapper.selectDevice(free);
  return getComputedStyle(document.getElementById('protectedBySection')).display;
});
check('an unprotected device shows no power section', unprotected === 'none', unprotected);

// ── Deleting a protected device cleans the UPS list ──
await page.evaluate(() => {
  const ups = mapper.state.devices.find(d => d.type === 'ups');
  mapper.setSelection([ups.protects[0]]);
  mapper.deleteSelected();
});
await page.waitForTimeout(200);
check('deleting a protected device removes it from the UPS', await page.evaluate(() => {
  const ups = mapper.state.devices.find(d => d.type === 'ups');
  return ups.protects.length === 1 &&
         ups.protects.every(id => mapper.state.devices.some(d => d.id === id));
}));

// ── An older file with a UPS zone is migrated on load ──
const legacy = {
  devices: [
    { id: 'd1', type: 'server', name: 'DC01', x: 4200, y: 4200, status: 'online' },
    { id: 'd2', type: 'switch', name: 'SW1',  x: 4260, y: 4320, status: 'online' },
    { id: 'd3', type: 'printer', name: 'Far', x: 5200, y: 5200, status: 'online' }
  ],
  connections: [],
  zones: [{ id: 'z1', type: 'ups', name: 'Rack UPS', x: 4150, y: 4150,
            width: 400, height: 400, manufacturer: 'APC', capacity: '1500', runtime: '20' }],
  vlans: [], ssids: [], config: {}
};
await page.evaluate(() => { mapper.state.devices = []; mapper.state.zones = []; mapper.deselectAll(); });
await page.setInputFiles('#jsonFileInput', {
  name: 'legacy.json', mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(legacy))
});
await page.waitForTimeout(500);

const migrated = await page.evaluate(() => {
  const ups = mapper.state.devices.find(d => d.type === 'ups');
  return {
    zonesLeft: mapper.state.zones.length,
    upsExists: !!ups,
    name: ups && ups.name,
    capacity: ups && ups.capacity,
    protects: ups ? ups.protects.map(id =>
      (mapper.state.devices.find(d => d.id === id) || {}).name) : [],
    tags: document.querySelectorAll('.power-tag').length
  };
});
check('a legacy UPS zone becomes a UPS device', migrated.upsExists && migrated.zonesLeft === 0,
  JSON.stringify(migrated));
check('its details survive', migrated.name === 'Rack UPS' && migrated.capacity === '1500');
check('devices that sat inside it are now protected',
  migrated.protects.sort().join() === 'DC01,SW1', JSON.stringify(migrated.protects));
check('and they get their battery tags', migrated.tags === 2, String(migrated.tags));

check('no JS errors', errs.length === 0, errs.join(' | '));
await browser.close(); server.close();
console.log(fail ? `\n${fail} failed` : '\nall checks passed');
process.exit(fail ? 1 : 0);
