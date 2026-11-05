import { describe, it, expect } from 'vitest';
import { matchDevices, describeDevice } from '../js/core/search.js';

const devices = [
  { id: '1', name: 'Core Switch',   type: 'switch',   ip: '192.168.1.2',  model: 'USW-Pro-48' },
  { id: '2', name: 'Edge Firewall', type: 'firewall', ip: '192.168.1.1',  model: 'FortiGate 60F' },
  { id: '3', name: 'AP Lobby',      type: 'ap',       ip: '192.168.1.10', mac: '00:1A:2B:3C:4D:10' },
  { id: '4', name: 'DC01',          type: 'server',   ip: '192.168.20.10', serial: 'DELLSRV001' },
  { id: '5', name: 'Floor 2 Switch', type: 'switch',  ip: '192.168.1.3' }
];
const LABELS = { switch: 'Switch', firewall: 'Firewall', ap: 'Access Point', server: 'Server' };
const labelOf = t => LABELS[t] || t;
const names = q => matchDevices(devices, q, labelOf).map(d => d.name);

describe('matchDevices', () => {
  it('returns nothing for an empty query', () => {
    expect(matchDevices(devices, '', labelOf)).toEqual([]);
    expect(matchDevices(devices, '   ', labelOf)).toEqual([]);
  });

  it('matches on name, case-insensitively', () => {
    expect(names('core')).toEqual(['Core Switch']);
    expect(names('CORE')).toEqual(['Core Switch']);
  });

  it('matches on IP, including a partial one', () => {
    expect(names('192.168.20')).toEqual(['DC01']);
    expect(names('192.168.1.2')).toContain('Core Switch');
  });

  it('ranks an exact IP above one that merely contains it', () => {
    // '192.168.1.1' is also a substring of '192.168.1.10'.
    const hits = names('192.168.1.1');
    expect(hits.length).toBe(2);
    expect(hits[0]).toBe('Edge Firewall');
  });

  it('matches the human-readable type as well as the key', () => {
    expect(names('ap')).toContain('AP Lobby');
    expect(names('access point')).toEqual(['AP Lobby']);
  });

  it('matches model, MAC and serial', () => {
    expect(names('fortigate')).toEqual(['Edge Firewall']);
    expect(names('4d:10')).toEqual(['AP Lobby']);
    expect(names('dellsrv')).toEqual(['DC01']);
  });

  it('requires every term to match, so terms narrow rather than widen', () => {
    expect(names('core switch')).toEqual(['Core Switch']);
    expect(names('core firewall')).toEqual([]);   // not a union
    expect(names('switch 192.168.1.3')).toEqual(['Floor 2 Switch']);
  });

  it('ranks a name match above a type match', () => {
    const hits = names('switch');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toBe('Core Switch');          // name beats type
  });

  it('breaks ties alphabetically so order is stable', () => {
    const tied = [{ id: 'b', name: 'Beta', type: 'server' }, { id: 'a', name: 'Alpha', type: 'server' }];
    expect(matchDevices(tied, 'server', labelOf).map(d => d.name)).toEqual(['Alpha', 'Beta']);
  });

  it('tolerates missing fields and an empty device list', () => {
    expect(() => matchDevices([{ id: 'x' }], 'anything', labelOf)).not.toThrow();
    expect(matchDevices([], 'x', labelOf)).toEqual([]);
    expect(matchDevices(null, 'x', labelOf)).toEqual([]);
  });

  it('works without a label function', () => {
    expect(matchDevices(devices, 'switch').map(d => d.name)).toContain('Core Switch');
  });
});

describe('describeDevice', () => {
  it('leads with the IP when there is one', () => {
    expect(describeDevice(devices[0], 'Switch')).toMatch(/^192\.168\.1\.2/);
  });
  it('falls back to the type when there is no IP', () => {
    expect(describeDevice({ type: 'server' }, 'Server')).toBe('Server');
  });
  it('appends the model when known', () => {
    expect(describeDevice(devices[1], 'Firewall')).toContain('FortiGate 60F');
  });
});
