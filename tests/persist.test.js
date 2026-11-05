import { describe, it, expect } from 'vitest';
import {
  createAutosave, autosaveKey, hasContent, describeAge,
  AUTOSAVE_VERSION, MAX_AUTOSAVE_BYTES
} from '../js/io/persist.js';

/** In-memory stand-in for localStorage, with optional failure injection. */
function fakeStorage({ failWrite = false, failRead = false } = {}) {
  const map = new Map();
  return {
    map,
    getItem(k) { if (failRead) throw new Error('blocked'); return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { if (failWrite) throw new Error('quota'); map.set(k, v); },
    removeItem(k) { map.delete(k); }
  };
}

const stateJson = JSON.stringify({ devices: [{ id: 'd1', name: 'FW' }], zones: [] });

describe('autosaveKey', () => {
  it('namespaces per shell so two mappers never collide', () => {
    expect(autosaveKey('network-mapper')).not.toBe(autosaveKey('i-tech-network-mapper'));
    expect(autosaveKey('x')).toMatch(/^netmapper:autosave:/);
  });
});

describe('createAutosave', () => {
  const make = (opts = {}) =>
    createAutosave({ storage: fakeStorage(opts.storageOpts), key: 'k', ...opts });

  it('round-trips a snapshot with its metadata', () => {
    const a = make();
    expect(a.write(stateJson, { client: 'Acme' }).ok).toBe(true);
    const got = a.read();
    expect(got.ok).toBe(true);
    expect(got.stateJson).toBe(stateJson);
    expect(got.meta).toEqual({ client: 'Acme' });
    expect(typeof got.savedAt).toBe('number');
  });

  it('reports an empty slot rather than failing', () => {
    expect(make().read()).toEqual({ ok: false, reason: 'empty' });
  });

  it('refuses a snapshot larger than the cap instead of throwing', () => {
    const a = createAutosave({ storage: fakeStorage(), key: 'k', maxBytes: 100 });
    const r = a.write(JSON.stringify({ devices: new Array(500).fill({ id: 'x' }) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('too-large');
    expect(r.bytes).toBeGreaterThan(100);
  });

  it('survives storage that throws on write', () => {
    const a = createAutosave({ storage: fakeStorage({ failWrite: true }), key: 'k' });
    expect(a.write(stateJson)).toEqual({ ok: false, reason: 'write-failed' });
  });

  it('survives storage that throws on read', () => {
    const a = createAutosave({ storage: fakeStorage({ failRead: true }), key: 'k' });
    expect(a.read()).toEqual({ ok: false, reason: 'read-failed' });
  });

  it('degrades to a no-op when there is no storage at all', () => {
    const a = createAutosave({ storage: null, key: 'k' });
    expect(a.write(stateJson)).toEqual({ ok: false, reason: 'unavailable' });
    expect(a.read()).toEqual({ ok: false, reason: 'unavailable' });
    expect(() => a.clear()).not.toThrow();
  });

  it('rejects a corrupt payload rather than throwing', () => {
    const storage = fakeStorage();
    storage.setItem('k', 'not json at all');
    expect(createAutosave({ storage, key: 'k' }).read()).toEqual({ ok: false, reason: 'corrupt' });
  });

  it('rejects a payload from a different format version', () => {
    const storage = fakeStorage();
    storage.setItem('k', JSON.stringify({ v: AUTOSAVE_VERSION + 1, state: stateJson }));
    expect(createAutosave({ storage, key: 'k' }).read().reason).toBe('version');
  });

  it('rejects a well-formed payload whose state is not a string', () => {
    const storage = fakeStorage();
    storage.setItem('k', JSON.stringify({ v: AUTOSAVE_VERSION, state: { devices: [] } }));
    expect(createAutosave({ storage, key: 'k' }).read().reason).toBe('corrupt');
  });

  it('overwrites rather than accumulating', () => {
    const storage = fakeStorage();
    const a = createAutosave({ storage, key: 'k' });
    a.write(stateJson);
    a.write(JSON.stringify({ devices: [], zones: [] }));
    expect(storage.map.size).toBe(1);
    expect(JSON.parse(a.read().stateJson).devices).toEqual([]);
  });

  it('clear empties the slot', () => {
    const a = make();
    a.write(stateJson);
    a.clear();
    expect(a.read().reason).toBe('empty');
  });

  it('has a cap that is generous but inside a typical quota', () => {
    expect(MAX_AUTOSAVE_BYTES).toBeGreaterThan(1e6);
    expect(MAX_AUTOSAVE_BYTES).toBeLessThan(5 * 1024 * 1024);
  });
});

describe('hasContent', () => {
  it('is true when there are devices or zones', () => {
    expect(hasContent(JSON.stringify({ devices: [{ id: 'a' }], zones: [] }))).toBe(true);
    expect(hasContent(JSON.stringify({ devices: [], zones: [{ id: 'z' }] }))).toBe(true);
  });
  it('is false for an empty canvas, so a cleared board is not offered back', () => {
    expect(hasContent(JSON.stringify({ devices: [], zones: [] }))).toBe(false);
  });
  it('is false for unreadable input rather than throwing', () => {
    expect(hasContent('{{{')).toBe(false);
    expect(hasContent('')).toBe(false);
  });
});

describe('describeAge', () => {
  const now = Date.UTC(2026, 0, 2, 12, 0, 0);
  it('reads naturally across the ranges', () => {
    expect(describeAge(now - 5_000, now)).toBe('just now');
    expect(describeAge(now - 60_000, now)).toBe('1 minute ago');
    expect(describeAge(now - 300_000, now)).toBe('5 minutes ago');
    expect(describeAge(now - 3_600_000, now)).toBe('1 hour ago');
    expect(describeAge(now - 7_200_000, now)).toBe('2 hours ago');
  });
  it('falls back to a date once it is more than a day old', () => {
    expect(describeAge(now - 3 * 86_400_000, now)).not.toMatch(/ago/);
  });
  it('does not produce a negative age from a clock skew', () => {
    expect(describeAge(now + 10_000, now)).toBe('just now');
  });
});
