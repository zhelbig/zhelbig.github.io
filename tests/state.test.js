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
    capacity: '1500', runtime: '15', ip: '192.168.1.100'
  }, over);
  const dev = (id, x, y, type = 'server') => ({ id, type, name: id, x, y });

  it('leaves a current file untouched', () => {
    const data = { devices: [dev('d1', 0, 0)], zones: [{ id: 'z', type: 'mdf', x: 0, y: 0 }] };
    const out = migrateUpsZones(data);
    expect(out.migrated).toBe(0);
    expect(out.data.upsUnits).toEqual([]);
    expect(out.data.zones).toHaveLength(1);
  });

  describe('from the UPS-as-a-zone era', () => {
    it('turns the zone into a configured unit', () => {
      const { data, migrated } = migrateUpsZones({ devices: [], zones: [upsZone()] });
      expect(migrated).toBe(1);
      expect(data.zones).toHaveLength(0);
      expect(data.devices).toHaveLength(0);
      expect(data.upsUnits).toHaveLength(1);
      expect(data.upsUnits[0]).toMatchObject({
        name: 'Rack UPS', manufacturer: 'APC', model: 'Smart-UPS 1500',
        capacity: '1500', runtime: '15', ip: '192.168.1.100'
      });
    });

    it('assigns whatever sat inside the box', () => {
      // Drawing the box around things was how that model expressed this.
      const devices = [dev('in1', 150, 150), dev('in2', 300, 200), dev('out', 900, 900)];
      const { data } = migrateUpsZones({ devices, zones: [upsZone()] });
      const id = data.upsUnits[0].id;
      expect(data.devices.find(d => d.id === 'in1').upsIds).toEqual([id]);
      expect(data.devices.find(d => d.id === 'in2').upsIds).toEqual([id]);
      expect(data.devices.find(d => d.id === 'out').upsIds).toBeUndefined();
    });

    it('keeps other zones', () => {
      const { data } = migrateUpsZones({
        devices: [], zones: [upsZone(), { id: 'z2', type: 'mdf', name: 'MDF', x: 0, y: 0 }]
      });
      expect(data.zones.map(z => z.type)).toEqual(['mdf']);
    });
  });

  describe('from the UPS-as-a-device era', () => {
    const upsDevice = (over = {}) => Object.assign({
      id: 'u1', type: 'ups', name: 'Rack UPS', x: 0, y: 0,
      manufacturer: 'Eaton', capacity: '3000', runtime: '30',
      protects: ['d1', 'd2']
    }, over);

    it('turns the device into a configured unit', () => {
      const data = { devices: [dev('d1', 0, 0), dev('d2', 0, 0), upsDevice()], zones: [] };
      const out = migrateUpsZones(data);
      expect(out.migrated).toBe(1);
      expect(out.data.devices.some(d => d.type === 'ups')).toBe(false);
      expect(out.data.upsUnits[0]).toMatchObject({ name: 'Rack UPS', capacity: '3000' });
    });

    it('carries the protects list across as assignments', () => {
      const data = { devices: [dev('d1', 0, 0), dev('d2', 0, 0), dev('d3', 0, 0), upsDevice()], zones: [] };
      const { data: out } = migrateUpsZones(data);
      const id = out.upsUnits[0].id;
      expect(out.devices.find(d => d.id === 'd1').upsIds).toEqual([id]);
      expect(out.devices.find(d => d.id === 'd2').upsIds).toEqual([id]);
      expect(out.devices.find(d => d.id === 'd3').upsIds).toBeUndefined();
    });

    it('can assign a zone, since an NVR is one', () => {
      const data = {
        devices: [upsDevice({ protects: ['nvr1'] })],
        zones: [{ id: 'nvr1', type: 'nvr', name: 'NVR', x: 0, y: 0 }]
      };
      const { data: out } = migrateUpsZones(data);
      expect(out.zones[0].upsIds).toEqual([out.upsUnits[0].id]);
    });

    it('ignores ids that no longer exist', () => {
      const data = { devices: [upsDevice({ protects: ['ghost'] })], zones: [] };
      expect(() => migrateUpsZones(data)).not.toThrow();
      expect(migrateUpsZones({ devices: [], zones: [] }).migrated).toBe(0);
    });
  });

  it('handles a file carrying both eras at once', () => {
    const data = {
      devices: [dev('in', 150, 150), dev('fed', 900, 900),
                { id: 'u1', type: 'ups', name: 'Device UPS', protects: ['fed'], x: 0, y: 0 }],
      zones: [upsZone()]
    };
    const { data: out, migrated } = migrateUpsZones(data);
    expect(migrated).toBe(2);
    expect(out.upsUnits.map(u => u.name).sort()).toEqual(['Device UPS', 'Rack UPS']);
    expect(out.devices.find(d => d.id === 'in').upsIds).toHaveLength(1);
    expect(out.devices.find(d => d.id === 'fed').upsIds).toHaveLength(1);
  });

  it('never assigns the same unit twice', () => {
    const data = {
      devices: [dev('in', 150, 150),
                { id: 'u1', type: 'ups', name: 'D', protects: ['in', 'in'], x: 0, y: 0 }],
      zones: []
    };
    const { data: out } = migrateUpsZones(data);
    expect(out.devices.find(d => d.id === 'in').upsIds).toHaveLength(1);
  });

  it('gives every unit a distinct id', () => {
    const { data } = migrateUpsZones({
      devices: [], zones: [upsZone(), upsZone({ id: 'z2', name: 'B', x: 900, y: 900 })]
    });
    expect(new Set(data.upsUnits.map(u => u.id)).size).toBe(2);
  });

  it('tolerates a file with no arrays at all', () => {
    expect(() => migrateUpsZones({})).not.toThrow();
    expect(migrateUpsZones({}).data.upsUnits).toEqual([]);
  });

  it('produces state that round-trips through a snapshot', () => {
    const { data } = migrateUpsZones({ devices: [dev('in', 150, 150)], zones: [upsZone()] });
    const st = createInitialState();
    st.devices = data.devices;
    st.upsUnits = data.upsUnits;
    const round = applySnapshot(createInitialState(), serializeState(st));
    expect(round.upsUnits).toHaveLength(1);
    expect(round.devices[0].upsIds).toEqual([data.upsUnits[0].id]);
  });
});
