import { describe, it, expect } from 'vitest';
import {
  createInitialState, serializeState, applySnapshot,
  highestNameIndex, resolveCounters, SNAPSHOT_FIELDS, nextId, migrateUpsZones
} from '../js/core/state.js';

describe('createInitialState', () => {
  it('starts with empty collections and zeroed counters', () => {
    const s = createInitialState();
    expect(s.devices).toEqual([]);
    expect(s.connections).toEqual([]);
    expect(s.zones).toEqual([]);
    expect(s.counter).toBe(0);
    expect(s.zoneCounter).toBe(0);
  });

  it('ships the three default VLANs', () => {
    const s = createInitialState();
    expect(s.vlans.map(v => v.id)).toEqual([1, 10, 20]);
    s.vlans.forEach(v => {
      expect(v.subnet).toMatch(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
      expect(v.gateway).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    });
  });

  it('defaults the view to unzoomed and unpanned', () => {
    const s = createInitialState();
    expect(s.zoom).toBe(1);
    expect(s.panX).toBe(0);
    expect(s.panY).toBe(0);
  });

  it('hands out independent state objects', () => {
    const a = createInitialState(), b = createInitialState();
    a.devices.push({ id: 'x' });
    a.vlans.push({ id: 99 });
    expect(b.devices).toHaveLength(0);
    expect(b.vlans).toHaveLength(3);
  });
});

describe('snapshots', () => {
  it('round-trips every captured field', () => {
    const s = createInitialState();
    s.devices.push({ id: 'd1', name: 'FW', x: 10, y: 20 });
    s.connections.push({ id: 'c1', from: 'd1', to: 'd2', type: 'vpn' });
    s.zones.push({ id: 'z1', name: 'MDF', x: 0, y: 0, width: 200, height: 150 });
    s.counter = 7;

    const snap = serializeState(s);
    const fresh = applySnapshot(createInitialState(), snap);
    SNAPSHOT_FIELDS.forEach(f => expect(fresh[f]).toEqual(s[f]));
  });

  it('leaves viewport and selection out, so undo does not move the camera', () => {
    const s = createInitialState();
    s.zoom = 2.5; s.panX = 300; s.panY = -120;
    s.selected = { id: 'd1' };
    const data = JSON.parse(serializeState(s));
    expect(data).not.toHaveProperty('zoom');
    expect(data).not.toHaveProperty('panX');
    expect(data).not.toHaveProperty('panY');
    expect(data).not.toHaveProperty('selected');
    expect(data).not.toHaveProperty('selectedZone');
  });

  it('preserves the viewport across a restore', () => {
    const s = createInitialState();
    const snap = serializeState(s);
    s.zoom = 3; s.panX = 99;
    applySnapshot(s, snap);
    expect(s.zoom).toBe(3);
    expect(s.panX).toBe(99);
  });

  it('mutates in place so live references stay valid', () => {
    const s = createInitialState();
    const snap = serializeState(s);
    s.devices.push({ id: 'gone' });
    const returned = applySnapshot(s, snap);
    expect(returned).toBe(s);
    expect(s.devices).toEqual([]);
  });

  it('detaches restored data from the snapshot source', () => {
    const a = createInitialState();
    a.devices.push({ id: 'd1', name: 'orig' });
    const b = applySnapshot(createInitialState(), serializeState(a));
    b.devices[0].name = 'changed';
    expect(a.devices[0].name).toBe('orig');
  });

  it('accepts an already-parsed object as well as JSON', () => {
    const s = createInitialState();
    s.counter = 5;
    const obj = JSON.parse(serializeState(s));
    expect(applySnapshot(createInitialState(), obj).counter).toBe(5);
  });
});

describe('highestNameIndex', () => {
  it('finds the largest trailing number', () => {
    expect(highestNameIndex([{ name: 'Switch 3' }, { name: 'Switch 12' }])).toBe(12);
  });
  it('ignores names without a trailing number', () => {
    expect(highestNameIndex([{ name: 'Core Firewall' }, { name: 'AP 4' }])).toBe(4);
  });
  it('tolerates empty, missing and malformed entries', () => {
    expect(highestNameIndex([])).toBe(0);
    expect(highestNameIndex(null)).toBe(0);
    expect(highestNameIndex([{}, { name: '' }, null])).toBe(0);
  });
  it('does not pick up a number from the middle of a name', () => {
    expect(highestNameIndex([{ name: 'Floor 2 Switch' }])).toBe(0);
  });
});

describe('resolveCounters', () => {
  it('uses the saved counters when they are the highest', () => {
    expect(resolveCounters({ counter: 20, devices: [{ name: 'A 1' }] }).counter).toBe(20);
  });
  it('never returns less than the item count', () => {
    const devices = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(resolveCounters({ counter: 0, devices }).counter).toBe(3);
  });
  it('clears the highest number already used in a name', () => {
    expect(resolveCounters({ devices: [{ name: 'Server 41' }] }).counter).toBe(41);
  });
  it('handles a file with no counters at all', () => {
    expect(resolveCounters({})).toEqual({ counter: 0, zoneCounter: 0 });
  });
  it('tracks zones separately from devices', () => {
    const r = resolveCounters({ devices: [{ name: 'D 9' }], zones: [{ name: 'Z 2' }] });
    expect(r).toEqual({ counter: 9, zoneCounter: 2 });
  });
});

describe('nextId', () => {
  it('never repeats, even for ids minted in the same millisecond', () => {
    // The old `prefix + Date.now()` collided here, and duplicate device ids
    // make getElementById return the wrong box.
    const ids = new Set();
    for (let i = 0; i < 5000; i++) ids.add(nextId('dev'));
    expect(ids.size).toBe(5000);
  });
  it('keeps the prefix', () => {
    expect(nextId('zone')).toMatch(/^zone/);
    expect(nextId('conn')).toMatch(/^conn/);
  });
  it('produces ids that are safe as DOM ids and CSS selectors', () => {
    for (let i = 0; i < 50; i++) {
      const id = nextId('dev');
      expect(id).toMatch(/^[A-Za-z][\w-]*$/);
    }
  });
  it('does not collide across prefixes', () => {
    const a = new Set([nextId('dev'), nextId('zone'), nextId('conn')]);
    expect(a.size).toBe(3);
  });
});

describe('migrateUpsZones', () => {
  const upsZone = (over = {}) => Object.assign({
    id: 'zone1', type: 'ups', name: 'Rack UPS', x: 100, y: 100,
    width: 400, height: 300, manufacturer: 'APC', model: 'Smart-UPS 1500',
    capacity: '1500', runtime: '15', ip: '192.168.1.100', notes: 'rack A'
  }, over);
  const dev = (id, x, y, type = 'server') => ({ id, type, name: id, x, y });

  it('leaves a file with no UPS zones untouched', () => {
    const data = { devices: [dev('d1', 0, 0)], zones: [{ id: 'z', type: 'mdf', x: 0, y: 0 }] };
    const out = migrateUpsZones(data);
    expect(out.migrated).toBe(0);
    expect(out.data.zones).toHaveLength(1);
    expect(out.data.devices).toHaveLength(1);
  });

  it('turns a UPS zone into a UPS device', () => {
    const { data, migrated } = migrateUpsZones({ devices: [], zones: [upsZone()] });
    expect(migrated).toBe(1);
    expect(data.zones).toHaveLength(0);
    const ups = data.devices.find(d => d.type === 'ups');
    expect(ups).toBeTruthy();
    expect(ups.name).toBe('Rack UPS');
    expect(ups.x).toBe(100);
    expect(ups.y).toBe(100);
  });

  it('carries the UPS details across', () => {
    const { data } = migrateUpsZones({ devices: [], zones: [upsZone()] });
    const ups = data.devices[0];
    expect(ups.manufacturer).toBe('APC');
    expect(ups.model).toBe('Smart-UPS 1500');
    expect(ups.capacity).toBe('1500');
    expect(ups.runtime).toBe('15');
    expect(ups.ip).toBe('192.168.1.100');
    expect(ups.notes).toBe('rack A');
  });

  it('seeds the protects list from whatever sat inside the box', () => {
    // Drawing the box around things was how the old model expressed this.
    const devices = [dev('in1', 150, 150), dev('in2', 300, 200), dev('out', 900, 900)];
    const { data } = migrateUpsZones({ devices, zones: [upsZone()] });
    const ups = data.devices.find(d => d.type === 'ups');
    expect(ups.protects).toEqual(['in1', 'in2']);
  });

  it('never has a migrated UPS protect another UPS', () => {
    const devices = [dev('other-ups', 150, 150, 'ups'), dev('srv', 200, 200)];
    const { data } = migrateUpsZones({ devices, zones: [upsZone()] });
    const ups = data.devices.find(d => d.id !== 'other-ups' && d.type === 'ups');
    expect(ups.protects).toEqual(['srv']);
  });

  it('gives each migrated UPS a fresh id that collides with nothing', () => {
    const { data } = migrateUpsZones({
      devices: [dev('d1', 0, 0)],
      zones: [upsZone(), upsZone({ id: 'zone2', name: 'UPS B', x: 900, y: 900 })]
    });
    const ids = data.devices.map(d => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain('zone1');
  });

  it('keeps non-UPS zones', () => {
    const { data } = migrateUpsZones({
      devices: [],
      zones: [upsZone(), { id: 'z2', type: 'mdf', name: 'MDF', x: 0, y: 0 }]
    });
    expect(data.zones.map(z => z.type)).toEqual(['mdf']);
  });

  it('survives a zone with no dimensions or a file with no devices array', () => {
    expect(() => migrateUpsZones({ zones: [{ id: 'z', type: 'ups', x: 0, y: 0 }] })).not.toThrow();
    const { data } = migrateUpsZones({ zones: [{ id: 'z', type: 'ups', name: '', x: 0, y: 0 }] });
    expect(data.devices[0].protects).toEqual([]);
    expect(data.devices[0].name).toBe('UPS');
  });

  it('produces a device that serializes like any other', () => {
    const { data } = migrateUpsZones({ devices: [], zones: [upsZone()] });
    const state = createInitialState();
    state.devices = data.devices;
    const round = applySnapshot(createInitialState(), serializeState(state));
    expect(round.devices[0].protects).toEqual([]);
    expect(round.devices[0].type).toBe('ups');
  });
});
