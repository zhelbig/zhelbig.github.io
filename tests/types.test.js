import { describe, it, expect } from 'vitest';
import {
  types, zoneTypes, manufacturers, operatingSystems,
  svgDefs, getSvgIcon, getSvgIconSidebar
} from '../js/core/types.js';

describe('device registry', () => {
  it('covers every type the palette and CSV import accept', () => {
    const expected = [
      'desktop', 'laptop', 'cellphone', 'tablet', 'otherendpoint',
      'server', 'nas', 'router', 'switch', 'firewall', 'ap',
      'vmhost', 'vm', 'storage', 'printer', 'iot', 'phone', 'camera', 'vpn'
    ];
    expected.forEach(t => expect(types, `missing type: ${t}`).toHaveProperty(t));
  });

  it('gives every type a display name', () => {
    Object.entries(types).forEach(([key, cfg]) => {
      expect(cfg.name, `${key} has no name`).toBeTruthy();
      expect(typeof cfg.name).toBe('string');
    });
  });

  // This is the invariant that the previous, drifted module violated:
  // it still referenced emoji icons after the app had moved to SVG.
  it('points every type at an icon that actually exists', () => {
    Object.entries(types).forEach(([key, cfg]) => {
      expect(cfg.svgIcon, `${key} is not marked as an SVG icon`).toBe(true);
      expect(svgDefs, `${key} references missing icon "${cfg.icon}"`)
        .toHaveProperty(cfg.icon);
    });
  });

  it('has no orphaned icon definitions', () => {
    const used = new Set(Object.values(types).map(c => c.icon));
    Object.keys(svgDefs).forEach(k => {
      expect(used.has(k), `svgDefs."${k}" is defined but unused`).toBe(true);
    });
  });
});

describe('zone registry', () => {
  it('covers the six zone kinds the palette offers', () => {
    ['cloud', 'onprem', 'mdf', 'idf', 'ups', 'nvr']
      .forEach(z => expect(zoneTypes).toHaveProperty(z));
  });
  it('gives every zone a name and a hex colour', () => {
    Object.entries(zoneTypes).forEach(([key, cfg]) => {
      expect(cfg.name, `${key} has no name`).toBeTruthy();
      expect(cfg.color, `${key} has a bad colour`).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });
});

describe('hardware pick-lists', () => {
  it('ends every manufacturer list with "Other" as an escape hatch', () => {
    Object.entries(manufacturers).forEach(([key, list]) => {
      expect(list.length, `${key} list is empty`).toBeGreaterThan(0);
      expect(list[list.length - 1], `${key} has no "Other"`).toBe('Other');
    });
  });
  it('ends every OS list with an "Other" variant', () => {
    Object.entries(operatingSystems).forEach(([key, list]) => {
      expect(list[list.length - 1], `${key} has no "Other"`).toMatch(/^Other/);
    });
  });
  it('has no duplicates within a list', () => {
    [...Object.entries(manufacturers), ...Object.entries(operatingSystems)]
      .forEach(([key, list]) => {
        expect(new Set(list).size, `${key} has duplicates`).toBe(list.length);
      });
  });
  it('only lists types that exist', () => {
    [...Object.keys(manufacturers), ...Object.keys(operatingSystems)]
      .forEach(k => expect(types, `pick-list for unknown type "${k}"`).toHaveProperty(k));
  });
  it('shares one array between desktop and laptop rather than duplicating it', () => {
    expect(operatingSystems.laptop).toBe(operatingSystems.desktop);
  });
});

describe('icon builders', () => {
  it('produces a well-formed svg element at the requested size', () => {
    const out = getSvgIcon('svg-router', 32);
    expect(out).toMatch(/^<svg /);
    expect(out).toMatch(/width="32"/);
    expect(out).toMatch(/viewBox="0 0 24 24"/);
    expect(out.endsWith('</svg>')).toBe(true);
  });
  it('resolves the placeholder tokens, leaving none behind', () => {
    const out = getSvgIcon('svg-server', 24);
    expect(out).not.toMatch(/currentStroke|currentFill/);
  });
  it('uses currentColor for the sidebar so the icon inherits hover styling', () => {
    const out = getSvgIconSidebar('svg-switch');
    expect(out).toMatch(/stroke="currentColor"/);
    expect(out).not.toMatch(/currentStroke|currentFill/);
  });
  it('returns an empty string for an unknown icon instead of throwing', () => {
    expect(getSvgIcon('nope', 24)).toBe('');
    expect(getSvgIconSidebar('nope')).toBe('');
  });
  it('renders every registered type without error', () => {
    Object.values(types).forEach(cfg => {
      expect(getSvgIcon(cfg.icon, 24).length).toBeGreaterThan(20);
    });
  });
});
