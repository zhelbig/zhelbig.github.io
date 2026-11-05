/**
 * Cross-file invariants. The unit suites check each module in isolation;
 * these check that the modules, the stylesheet and the HTML shells still
 * agree with each other. Every failure here is a class of bug this project
 * has actually shipped before.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { DEFAULT_GRID_SIZE } from '../js/geometry/geometry.js';

const SHELLS = ['i-tech-network-mapper.html'].filter(existsSync);
const read = f => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

describe.each(SHELLS)('%s', (shell) => {
  const html = read(shell);

  it('snaps to the same grid the dots are drawn on', () => {
    // The original bug: GRID_SIZE was 10 while the dots were 20px apart, so
    // "snapped" devices landed between dots.
    const m = /\.canvas-grid\{[^}]*background-size:(\d+)px (\d+)px/.exec(html);
    expect(m, '.canvas-grid background-size not found').toBeTruthy();
    expect(Number(m[1])).toBe(DEFAULT_GRID_SIZE);
    expect(Number(m[2])).toBe(DEFAULT_GRID_SIZE);
  });

  it('defines every custom property the stylesheet consumes', () => {
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const root = /:root\{([\s\S]*?)\}/.exec(style);
    expect(root, ':root block not found').toBeTruthy();

    const defined = new Set([...root[1].matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
    const used = new Set([...style.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]));
    const missing = [...used].filter(t => !defined.has(t));
    expect(missing, `used but never defined: ${missing.join(', ')}`).toEqual([]);
  });

  it('holds no brand colour outside :root', () => {
    // The shared stylesheet must be themeable, so brand literals may only
    // appear in the token block.
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const body = style.replace(/:root\{[\s\S]*?\}/, '');
    const literals = body.match(/#0F71F0|#006CFF|#199FFF|rgba\(15,113,240|rgba\(0,21,67|rgba\(0,30,98/gi) || [];
    expect(literals, `brand literals leaked: ${literals.join(', ')}`).toEqual([]);
  });

  it('publishes every function the inline HTML attributes call', () => {
    // The script is a module, so its scope is not global. An on*= attribute
    // naming a function that was never put on window fails only at click time.
    const called = new Set(
      [...html.matchAll(/\bon(?:click|input|change)="([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1])
    );
    const assign = /Object\.assign\(window,\s*\{([\s\S]*?)\}\);/.exec(html);
    expect(assign, 'window assignment block not found').toBeTruthy();
    const published = new Set(
      assign[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean)
    );
    const unpublished = [...called].filter(f => !published.has(f));
    expect(unpublished, `called from HTML but not on window: ${unpublished.join(', ')}`).toEqual([]);
  });

  it('resolves every module it imports', () => {
    const specs = [...html.matchAll(/from\s+'(\.\/js\/[^']+)'/g)].map(m => m[1]);
    expect(specs.length, 'no module imports found').toBeGreaterThan(0);
    specs.forEach(s => {
      expect(existsSync(new URL('../' + s.replace('./', ''), import.meta.url)),
        `missing module: ${s}`).toBe(true);
    });
  });
});

describe('repository', () => {
  it('no longer ships the drifted logic module', () => {
    // It was extracted from an older build and silently diverged; its tests
    // passed while describing code that had not shipped for months.
    expect(existsSync(new URL('../js/network-mapper-logic.js', import.meta.url))).toBe(false);
  });
});
