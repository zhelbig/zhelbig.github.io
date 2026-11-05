/**
 * Cross-file invariants. The unit suites check each module in isolation;
 * these check that the modules, the shared stylesheet and the HTML shells
 * still agree with each other. Every failure here is a class of bug this
 * project has actually shipped before.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULT_GRID_SIZE } from '../js/geometry/geometry.js';

const at = f => new URL('../' + f, import.meta.url);
const read = f => readFileSync(at(f), 'utf8');

/** Every page that loads the shared stylesheet and app bundle. */
const SHELLS = ['i-tech-network-mapper.html', 'network-mapper.html']
  .filter(f => existsSync(at(f)) && read(f).includes('css/mapper.css'));

const CSS = read('css/mapper.css');
const APP = read('js/app.js');
const LAYOUT = read('js/ui/layout.js');

const tokensDefinedIn = html => {
  const root = /:root\{([\s\S]*?)\n\s*\}/.exec(html);
  expect(root, 'no :root block').toBeTruthy();
  return new Set([...root[1].matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
};

describe('shared stylesheet', () => {
  it('snaps to the same grid the dots are drawn on', () => {
    // The original bug: GRID_SIZE was 10 while the dots were 20px apart, so
    // "snapped" devices landed between the dots.
    const m = /\.canvas-grid\{[^}]*background-size:(\d+)px (\d+)px/.exec(CSS);
    expect(m, '.canvas-grid background-size not found').toBeTruthy();
    expect(Number(m[1])).toBe(DEFAULT_GRID_SIZE);
    expect(Number(m[2])).toBe(DEFAULT_GRID_SIZE);
  });

  it('contains no brand colour or font name at all', () => {
    // It is shared by differently-branded shells, so any literal here would
    // bleed one brand into the other.
    const literals = CSS.match(
      /#0F71F0|#006CFF|#199FFF|#ff3b3b|#ff6b6b|#cc0000|rgba\(15,113,240|rgba\(0,21,67|rgba\(0,30,98|rgba\(255,59,59|Poppins|Outfit/gi
    ) || [];
    expect(literals, `brand literals leaked: ${[...new Set(literals)].join(', ')}`).toEqual([]);
  });

  it('declares no :root tokens of its own', () => {
    expect(/:root\s*\{/.test(CSS), 'mapper.css must not define tokens').toBe(false);
  });
});

describe('app bundle', () => {
  it('resolves every module it imports', () => {
    const specs = [...APP.matchAll(/from\s+'(\.\.?\/[^']+)'/g)].map(m => m[1]);
    expect(specs.length, 'no module imports found').toBeGreaterThan(0);
    specs.forEach(s => {
      const resolved = 'js/' + s.replace(/^\.\//, '');
      expect(existsSync(at(resolved)), `missing module: ${s}`).toBe(true);
    });
  });

  it('publishes every function the shared chrome calls from an attribute', () => {
    // app.js is a module, so its scope is not global. An on*= attribute in the
    // chrome naming a function that was never put on window fails only at
    // click time - long after any test or page load would notice.
    const called = new Set(
      [...LAYOUT.matchAll(/\bon(?:click|input|change)=\\?"([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1])
    );
    expect(called.size, 'no inline handlers found in layout.js').toBeGreaterThan(0);
    const assign = /Object\.assign\(window,\s*\{([\s\S]*?)\}\);/.exec(APP);
    expect(assign, 'window assignment block not found in app.js').toBeTruthy();
    const published = new Set(
      assign[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean)
    );
    const unpublished = [...called].filter(f => !published.has(f));
    expect(unpublished, `called from chrome but not on window: ${unpublished.join(', ')}`).toEqual([]);
  });
});

describe('shells', () => {
  it('there is at least one', () => {
    expect(SHELLS.length).toBeGreaterThan(0);
  });

  describe.each(SHELLS)('%s', (shell) => {
    const html = read(shell);

    it('loads the shared stylesheet and the shared bundle', () => {
      expect(html).toMatch(/<link[^>]+href="css\/mapper\.css"/);
      expect(html).toMatch(/<script[^>]+src="js\/app\.js"/);
    });

    it('defines every custom property the shared stylesheet consumes', () => {
      const defined = tokensDefinedIn(html);
      const used = new Set([...CSS.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
      const missing = [...used].filter(t => !defined.has(t));
      expect(missing, `used by mapper.css but undefined: ${missing.join(', ')}`).toEqual([]);
    });

    it('carries no inline <style> beyond its token block', () => {
      const blocks = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
      blocks.forEach(b => {
        const withoutTokens = b.replace(/:root\{[\s\S]*?\n\s*\}/, '').replace(/\/\*[\s\S]*?\*\//g, '');
        expect(withoutTokens.trim(), 'shell has styles that belong in mapper.css').toBe('');
      });
    });

    it('holds no app chrome of its own', () => {
      // Chrome lives in js/ui/layout.js. A shell that grows its own copy is
      // how the two mappers drifted apart in the first place.
      expect(html).toMatch(/<div id="app-root"><\/div>/);
      ['class="app"', 'device-palette', 'props-panel', 'modal-bg', 'conn-toolbar']
        .forEach(marker => {
          expect(html.includes(marker), `shell contains chrome markup: ${marker}`).toBe(false);
        });
    });

    it('declares a brand logo for the shared chrome to slot in', () => {
      expect(html).toMatch(/<template id="brand-logo">[\s\S]*?<\/template>/);
    });
  });
});

describe('shells agree with each other', () => {
  it('define an identical token set', () => {
    if (SHELLS.length < 2) return;
    const sets = SHELLS.map(s => [...tokensDefinedIn(read(s))].sort());
    sets.slice(1).forEach((s, i) => {
      expect(s, `${SHELLS[i + 1]} token set differs from ${SHELLS[0]}`).toEqual(sets[0]);
    });
  });

  it('all load the same bundle, so a feature ships to every shell at once', () => {
    SHELLS.forEach(s => expect(read(s)).toMatch(/src="js\/app\.js"/));
  });
});

describe('repository', () => {
  it('no longer ships the drifted logic module', () => {
    expect(existsSync(at('js/network-mapper-logic.js'))).toBe(false);
  });
});
