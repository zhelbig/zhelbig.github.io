/**
 * Browser checks for the render hot path.
 *
 * These cover properties that only exist against a live compositor -
 * frame coalescing, pointer interaction modes, lazy script loading - and
 * that no unit test can observe.
 *
 * Not part of `npm test`: needs Playwright.
 *   npm install --no-save playwright && npm run test:render
 */
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const M={'.html':'text/html','.js':'text/javascript','.css':'text/css','.jpg':'image/jpeg'};
const s=http.createServer((q,r)=>{const p=path.join(ROOT,q.url.split('?')[0]);
 if(!fs.existsSync(p)){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':M[path.extname(p)]||'text/plain'});fs.createReadStream(p).pipe(r);});
await new Promise(r=>s.listen(0,r));
const port=s.address().port;
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1400,height:900}});
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(`http://127.0.0.1:${port}/i-tech-network-mapper.html`,{waitUntil:'domcontentloaded'});
await p.waitForFunction(()=>!!window.mapper);

let fail = 0;
const check=(n,ok,d='')=>{console.log((ok?'  PASS  ':'  FAIL  ')+n+(d?'  -> '+d:'')); if(!ok)fail++;};

// Build a diagram in view.
await p.evaluate(()=>{
  for(let i=0;i<24;i++) mapper.createDevice(i%2?'switch':'server', 3980+(i%6)*150, 4000+Math.floor(i/6)*150);
  const d=mapper.state.devices;
  for(let i=1;i<d.length;i++)
    mapper.state.connections.push({id:'c'+i,from:d[i-1].id,fromPos:'right',to:d[i].id,toPos:'left',type:'wired',routingStyle:'curved'});
  mapper.drawConnections();
  document.getElementById('emptyState').style.display='none';
  // Count how often paths are actually rewritten.
  window.__paint = 0;
  const orig = mapper.connLayer.updatePaths.bind(mapper.connLayer);
  mapper.connLayer.updatePaths = (c, f) => { window.__paint++; return orig(c, f); };
});

// ── 1. rAF coalescing: many mousemoves must not mean many repaints ──
let box=null, dragId=null;
for (const h of await p.locator('.network-device').all()) {
  const bb = await h.boundingBox();
  if (bb && bb.x>60 && bb.y>120 && bb.x+bb.width<1200 && bb.y+bb.height<800) {
    box = bb; dragId = await h.getAttribute('id'); break;
  }
}
if(!box) throw new Error('no device fully in view');
const posBefore = await p.evaluate(id=>({...mapper.state.devices.find(d=>d.id===id)}), dragId);
await p.evaluate(()=>{window.__paint=0;});
await p.mouse.move(box.x+box.width/2, box.y+box.height/2);
await p.mouse.down();
await p.mouse.move(box.x+box.width/2+200, box.y+box.height/2+120, {steps:60});
await p.mouse.up();
const posAfter = await p.evaluate(id=>({...mapper.state.devices.find(d=>d.id===id)}), dragId);
const moved = posAfter.x!==posBefore.x || posAfter.y!==posBefore.y;
check('the drag actually moved the device', moved, `${posBefore.x},${posBefore.y} -> ${posAfter.x},${posAfter.y}`);

// Playwright paces its synthetic moves, so each one gets its own frame and
// nothing would coalesce. The property under test is what happens when moves
// arrive faster than the display refreshes, so dispatch a burst in one task.
const burst = await p.evaluate(async ({id, x, y}) => {
  const el = document.getElementById(id);
  el.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, clientX:x, clientY:y}));
  window.__paint = 0;
  for (let i = 0; i < 50; i++) {
    document.dispatchEvent(new MouseEvent('mousemove', {bubbles:true, clientX:x+i, clientY:y+i}));
  }
  const duringBurst = window.__paint;                       // before any frame runs
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const afterFrame = window.__paint;
  document.dispatchEvent(new MouseEvent('mouseup', {bubbles:true, clientX:x+49, clientY:y+49}));
  return { duringBurst, afterFrame };
}, {id: dragId, x: Math.round(box.x+box.width/2), y: Math.round(box.y+box.height/2)});

check('50 moves inside one frame paint nothing synchronously',
      burst.duringBurst === 0, `${burst.duringBurst} synchronous repaints`);
check('and collapse into a single repaint on the next frame',
      burst.afterFrame === 1, `${burst.afterFrame} repaints for 50 moves`);

// ── 2. Eraser hover must not retrigger rebuilds ──
await p.evaluate(()=>{ mapper.state.selected=null; window.__paint=0; });
await p.click('#eraserBtn');
// A curve's bounding-box centre is usually off the stroke, so walk the path.
const svgBox = await p.evaluate(()=>{
  for (const g of document.querySelectorAll('#connections g[data-conn-id]')) {
    const path = g.querySelector('.conn-hit');
    const len = path.getTotalLength();
    if (!len) continue;
    const pt = path.getPointAtLength(len/2);
    const r = document.getElementById('connections').getBoundingClientRect();
    const m = path.getScreenCTM();
    const x = m.a*pt.x + m.c*pt.y + m.e, y = m.b*pt.x + m.d*pt.y + m.f;
    if (x>60 && y>120 && x<1300 && y<850) return {x, y, id:g.dataset.connId};
  }
  return null;
});
if(!svgBox) throw new Error('no connection midpoint in view');
const before = await p.evaluate(()=>mapper.state.connections.length);
await p.mouse.move(svgBox.x, svgBox.y);
await p.waitForTimeout(400);          // rest the cursor on the line
await p.mouse.move(svgBox.x+2, svgBox.y+2);
await p.waitForTimeout(400);
const after = await p.evaluate(()=>mapper.state.connections.length);
const hoverPaints = await p.evaluate(()=>window.__paint);
check('hovering a line in eraser mode rebuilds nothing', hoverPaints===0 && after===before,
      `repaints=${hoverPaints}, groups ${before}->${after}`);

// ── 3. Eraser still deletes on click ──
await p.mouse.click(svgBox.x, svgBox.y);
await p.waitForTimeout(150);
const left = await p.evaluate(()=>mapper.state.connections.length);
check('eraser click still deletes the connection', left===before-1, `${before} -> ${left}`);

// ── 4. Export libs are no longer loaded up front ──
const libsAtLoad = await p.evaluate(()=>({
  h2c: typeof window.html2canvas, jspdf: typeof window.jspdf,
  tags: [...document.querySelectorAll('script[src]')].filter(s=>/cdnjs/.test(s.src)).length
}));
check('export libraries are not fetched on page load',
      libsAtLoad.h2c==='undefined' && libsAtLoad.jspdf==='undefined' && libsAtLoad.tags===0,
      JSON.stringify(libsAtLoad));

// ── 5. A connection drag must never strand its preview line ──
// The preview used to vanish only as a side effect of rebuilding the whole
// SVG from a string; with persistent nodes, releasing over empty canvas
// left the dashed line behind.
await p.evaluate(() => {
  mapper.state.connections.length = 0;
  mapper.drawConnections();
});
const ghostCount = () => p.evaluate(() =>
  document.querySelectorAll('#connections .conn-overlay').length);

const devBox = await p.locator('.network-device').first().boundingBox();
const dot = await p.evaluate((id) => {
  const el = document.querySelector('.network-device .conn-point.right');
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});

// (a) release over empty canvas
await p.mouse.move(dot.x, dot.y);
await p.mouse.down();
await p.mouse.move(dot.x + 120, dot.y + 260, { steps: 10 });
const duringDrag = await ghostCount();
const area = await p.locator('#canvasArea').boundingBox();
await p.mouse.move(area.x + area.width - 120, area.y + area.height - 120, { steps: 8 });
await p.mouse.up();
await p.waitForTimeout(120);
check('the preview line is drawn while dragging', duringDrag === 1, String(duringDrag));
check('releasing over empty canvas leaves no ghost line',
      (await ghostCount()) === 0, String(await ghostCount()));

// (b) release back on the device it started from
await p.mouse.move(dot.x, dot.y);
await p.mouse.down();
await p.mouse.move(dot.x + 60, dot.y + 40, { steps: 6 });
await p.mouse.move(dot.x, dot.y, { steps: 6 });
await p.mouse.up();
await p.waitForTimeout(120);
check('releasing back on the source leaves no ghost line',
      (await ghostCount()) === 0, String(await ghostCount()));

// (c) a real connection, then the same pair again
const second = await p.evaluate(() => {
  const els = [...document.querySelectorAll('.network-device')];
  const el = els[1];
  const r = el.querySelector('.conn-point.left').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
const connsBefore = await p.evaluate(() => mapper.state.connections.length);
await p.mouse.move(dot.x, dot.y);
await p.mouse.down();
await p.mouse.move(second.x, second.y, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(150);
const connsAfter = await p.evaluate(() => mapper.state.connections.length);
check('dragging onto another device makes a connection',
      connsAfter === connsBefore + 1, `${connsBefore} -> ${connsAfter}`);
check('and leaves no ghost line', (await ghostCount()) === 0);

await p.mouse.move(dot.x, dot.y);
await p.mouse.down();
await p.mouse.move(second.x, second.y, { steps: 12 });
await p.mouse.up();
await p.waitForTimeout(200);
check('a duplicate is refused without adding a connection',
      (await p.evaluate(() => mapper.state.connections.length)) === connsAfter);
check('and the refusal is explained rather than silent',
      await p.evaluate(() => [...document.querySelectorAll('#toastHost .toast')]
        .some(t => /already connected/i.test(t.textContent))));
check('still no ghost line after a refused duplicate', (await ghostCount()) === 0);

check('no JS errors', errs.length===0, errs.join(' | '));
console.log(fail? `\n${fail} failed` : '\nall checks passed');
await b.close(); s.close(); process.exit(fail?1:0);
