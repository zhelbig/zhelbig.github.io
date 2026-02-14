import { describe, it, expect, beforeEach } from 'vitest';
import {
  types,
  zoneTypes,
  manufacturers,
  createInitialState,
  snapToGridValue,
  createDeviceData,
  deleteDeviceData,
  updateDeviceProperty,
  setDeviceStatus,
  createZoneData,
  deleteZoneData,
  updateZoneProperty,
  addConnection,
  getDeviceConnections,
  getConnectedDevices,
  addVlan,
  deleteVlan,
  getVlanName,
  addSSID,
  deleteSSID,
  toggleSwitchVLAN,
  toggleAPSSID,
  addVM,
  removeVM,
  calculateConnectionPoint,
  generateConnectionPath,
  getNearestEdge,
  clampZoom,
  calculateZoomPan,
  calculateDropPosition,
  formatCount,
  exportStateToJson,
  importStateFromJson,
  parseCSVLine,
  parseCSVContent,
  csvRowToDevice,
  escapeCSVCell,
  exportDevicesToCSV,
  calculateBoundingBox,
  clearAllData,
} from '../js/network-mapper-logic.js';

// ─── Helpers ────────────────────────────────────────────────────────

let state;

beforeEach(() => {
  state = createInitialState();
});

// ─── Type definitions ───────────────────────────────────────────────

describe('type definitions', () => {
  it('has all expected device types', () => {
    const expected = [
      'desktop', 'laptop', 'cellphone', 'tablet', 'otherendpoint',
      'server', 'nas', 'router', 'switch', 'firewall', 'ap',
      'vmhost', 'vm', 'storage', 'printer', 'iot', 'phone', 'camera',
    ];
    expected.forEach((t) => {
      expect(types[t]).toBeDefined();
      expect(types[t].name).toBeTruthy();
      expect(types[t].icon).toBeTruthy();
    });
  });

  it('has all expected zone types', () => {
    ['cloud', 'onprem', 'mdf', 'idf', 'ups'].forEach((t) => {
      expect(zoneTypes[t]).toBeDefined();
      expect(zoneTypes[t].name).toBeTruthy();
      expect(zoneTypes[t].color).toBeTruthy();
    });
  });

  it('has manufacturer lists for common device types', () => {
    ['desktop', 'laptop', 'server', 'printer'].forEach((t) => {
      expect(manufacturers[t]).toBeDefined();
      expect(manufacturers[t].length).toBeGreaterThan(0);
    });
  });
});

// ─── Initial state ──────────────────────────────────────────────────

describe('createInitialState', () => {
  it('returns fresh state with defaults', () => {
    expect(state.devices).toEqual([]);
    expect(state.connections).toEqual([]);
    expect(state.zones).toEqual([]);
    expect(state.vlans).toHaveLength(3);
    expect(state.zoom).toBe(1);
    expect(state.counter).toBe(0);
    expect(state.connType).toBe('wired');
  });

  it('returns independent instances', () => {
    const s2 = createInitialState();
    s2.devices.push({ id: 'test' });
    expect(state.devices).toHaveLength(0);
  });

  it('includes default VLANs', () => {
    expect(state.vlans[0]).toEqual({
      id: 1, name: 'Default', subnet: '192.168.1.0/24', gateway: '192.168.1.1',
    });
  });
});

// ─── Grid snapping ──────────────────────────────────────────────────

describe('snapToGridValue', () => {
  it('snaps to nearest grid multiple', () => {
    expect(snapToGridValue(25)).toBe(20);
    expect(snapToGridValue(30)).toBe(40);
    expect(snapToGridValue(10)).toBe(20);
    expect(snapToGridValue(0)).toBe(0);
    expect(snapToGridValue(20)).toBe(20);
  });

  it('returns raw value when snap is disabled', () => {
    expect(snapToGridValue(25, false)).toBe(25);
    expect(snapToGridValue(33, false)).toBe(33);
  });

  it('handles negative values', () => {
    expect(snapToGridValue(-15)).toBe(-20);
    expect(snapToGridValue(-25)).toBe(-20);
  });
});

// ─── Device CRUD ────────────────────────────────────────────────────

describe('createDeviceData', () => {
  it('creates a device and adds it to state', () => {
    const device = createDeviceData(state, 'desktop', 100, 200);
    expect(device).toBeDefined();
    expect(device.type).toBe('desktop');
    expect(device.name).toBe('Desktop 1');
    expect(device.x).toBe(100);
    expect(device.y).toBe(200);
    expect(device.status).toBe('online');
    expect(state.devices).toHaveLength(1);
    expect(state.counter).toBe(1);
  });

  it('increments counter for each device', () => {
    createDeviceData(state, 'desktop', 0, 0);
    createDeviceData(state, 'laptop', 0, 0);
    expect(state.counter).toBe(2);
    expect(state.devices[1].name).toBe('Laptop 2');
  });

  it('creates vmhost with empty vms array', () => {
    const device = createDeviceData(state, 'vmhost', 0, 0);
    expect(device.vms).toEqual([]);
  });

  it('creates non-vmhost with null vms', () => {
    const device = createDeviceData(state, 'server', 0, 0);
    expect(device.vms).toBeNull();
  });

  it('returns null for invalid type', () => {
    const device = createDeviceData(state, 'invalid_type', 0, 0);
    expect(device).toBeNull();
    expect(state.devices).toHaveLength(0);
  });

  it('initializes empty string fields', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    expect(device.ip).toBe('');
    expect(device.mac).toBe('');
    expect(device.vlan).toBe('');
    expect(device.notes).toBe('');
    expect(device.manufacturer).toBe('');
    expect(device.os).toBe('');
  });
});

describe('deleteDeviceData', () => {
  it('removes device from state', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    const result = deleteDeviceData(state, device.id);
    expect(result).toBe(true);
    expect(state.devices).toHaveLength(0);
  });

  it('removes connections involving the device', () => {
    const d1 = createDeviceData(state, 'desktop', 0, 0);
    const d2 = createDeviceData(state, 'server', 100, 0);
    const d3 = createDeviceData(state, 'router', 200, 0);
    addConnection(state, d1.id, 'right', d2.id, 'left');
    addConnection(state, d2.id, 'right', d3.id, 'left');
    expect(state.connections).toHaveLength(2);

    deleteDeviceData(state, d2.id);
    expect(state.connections).toHaveLength(0);
  });

  it('clears selected if deleted device was selected', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    state.selected = device;
    deleteDeviceData(state, device.id);
    expect(state.selected).toBeNull();
  });

  it('returns false for non-existent device', () => {
    expect(deleteDeviceData(state, 'nonexistent')).toBe(false);
  });
});

describe('updateDeviceProperty', () => {
  it('updates property on selected device', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    state.selected = device;
    updateDeviceProperty(state, 'name', 'My PC');
    expect(device.name).toBe('My PC');
  });

  it('returns false when no device selected', () => {
    expect(updateDeviceProperty(state, 'name', 'test')).toBe(false);
  });
});

describe('setDeviceStatus', () => {
  it('sets valid status', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    state.selected = device;
    expect(setDeviceStatus(state, 'offline')).toBe(true);
    expect(device.status).toBe('offline');
  });

  it('rejects invalid status', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    state.selected = device;
    expect(setDeviceStatus(state, 'invalid')).toBe(false);
    expect(device.status).toBe('online');
  });

  it('accepts all valid statuses', () => {
    const device = createDeviceData(state, 'desktop', 0, 0);
    state.selected = device;
    ['online', 'offline', 'warning', 'retired', 'decommissioned'].forEach((s) => {
      expect(setDeviceStatus(state, s)).toBe(true);
      expect(device.status).toBe(s);
    });
  });

  it('returns false when no device selected', () => {
    expect(setDeviceStatus(state, 'online')).toBe(false);
  });
});

// ─── Zone CRUD ──────────────────────────────────────────────────────

describe('createZoneData', () => {
  it('creates a zone and adds it to state', () => {
    const zone = createZoneData(state, 'cloud', 100, 200);
    expect(zone).toBeDefined();
    expect(zone.type).toBe('cloud');
    expect(zone.name).toBe('Cloud 1');
    expect(zone.width).toBe(200);
    expect(zone.height).toBe(150);
    expect(state.zones).toHaveLength(1);
  });

  it('adds cloud-specific properties', () => {
    const zone = createZoneData(state, 'cloud', 0, 0);
    expect(zone).toHaveProperty('provider', '');
    expect(zone).toHaveProperty('region', '');
  });

  it('adds ups-specific properties', () => {
    const zone = createZoneData(state, 'ups', 0, 0);
    expect(zone).toHaveProperty('manufacturer', '');
    expect(zone).toHaveProperty('model', '');
    expect(zone).toHaveProperty('capacity', '');
    expect(zone).toHaveProperty('runtime', '');
    expect(zone).toHaveProperty('ip', '');
  });

  it('adds idf-specific properties', () => {
    const zone = createZoneData(state, 'idf', 0, 0);
    expect(zone).toHaveProperty('location', '');
    expect(zone).toHaveProperty('connectedMDF', '');
  });

  it('adds mdf-specific properties (no connectedMDF)', () => {
    const zone = createZoneData(state, 'mdf', 0, 0);
    expect(zone).toHaveProperty('location', '');
    expect(zone).not.toHaveProperty('connectedMDF');
  });

  it('adds onprem-specific properties', () => {
    const zone = createZoneData(state, 'onprem', 0, 0);
    expect(zone).toHaveProperty('location', '');
  });

  it('returns null for invalid zone type', () => {
    expect(createZoneData(state, 'invalid', 0, 0)).toBeNull();
  });

  it('increments zone counter', () => {
    createZoneData(state, 'cloud', 0, 0);
    createZoneData(state, 'onprem', 0, 0);
    expect(state.zoneCounter).toBe(2);
  });
});

describe('deleteZoneData', () => {
  it('removes zone from state', () => {
    const zone = createZoneData(state, 'cloud', 0, 0);
    expect(deleteZoneData(state, zone.id)).toBe(true);
    expect(state.zones).toHaveLength(0);
  });

  it('clears selectedZone if deleted zone was selected', () => {
    const zone = createZoneData(state, 'cloud', 0, 0);
    state.selectedZone = zone;
    deleteZoneData(state, zone.id);
    expect(state.selectedZone).toBeNull();
  });

  it('returns false for non-existent zone', () => {
    expect(deleteZoneData(state, 'nonexistent')).toBe(false);
  });
});

describe('updateZoneProperty', () => {
  it('updates property on selected zone', () => {
    const zone = createZoneData(state, 'cloud', 0, 0);
    state.selectedZone = zone;
    updateZoneProperty(state, 'name', 'AWS Cloud');
    expect(zone.name).toBe('AWS Cloud');
  });

  it('returns false when no zone selected', () => {
    expect(updateZoneProperty(state, 'name', 'test')).toBe(false);
  });
});

// ─── Connections ────────────────────────────────────────────────────

describe('addConnection', () => {
  let d1, d2, d3;

  beforeEach(() => {
    d1 = createDeviceData(state, 'desktop', 0, 0);
    d2 = createDeviceData(state, 'server', 200, 0);
    d3 = createDeviceData(state, 'router', 400, 0);
  });

  it('creates a connection between two devices', () => {
    const conn = addConnection(state, d1.id, 'right', d2.id, 'left');
    expect(conn).toBeDefined();
    expect(conn.from).toBe(d1.id);
    expect(conn.to).toBe(d2.id);
    expect(conn.type).toBe('wired');
    expect(state.connections).toHaveLength(1);
  });

  it('prevents self-connection', () => {
    expect(addConnection(state, d1.id, 'right', d1.id, 'left')).toBeNull();
    expect(state.connections).toHaveLength(0);
  });

  it('prevents duplicate connections', () => {
    addConnection(state, d1.id, 'right', d2.id, 'left');
    expect(addConnection(state, d1.id, 'right', d2.id, 'left')).toBeNull();
    expect(state.connections).toHaveLength(1);
  });

  it('prevents duplicate connections in reverse direction', () => {
    addConnection(state, d1.id, 'right', d2.id, 'left');
    expect(addConnection(state, d2.id, 'left', d1.id, 'right')).toBeNull();
    expect(state.connections).toHaveLength(1);
  });

  it('returns null when source device does not exist', () => {
    expect(addConnection(state, 'nonexistent', 'right', d2.id, 'left')).toBeNull();
  });

  it('returns null when target device does not exist', () => {
    expect(addConnection(state, d1.id, 'right', 'nonexistent', 'left')).toBeNull();
  });

  it('uses current connection type from state', () => {
    state.connType = 'wireless';
    const conn = addConnection(state, d1.id, 'right', d2.id, 'left');
    expect(conn.type).toBe('wireless');
  });

  it('allows multiple connections from same device to different devices', () => {
    addConnection(state, d1.id, 'right', d2.id, 'left');
    addConnection(state, d1.id, 'bottom', d3.id, 'top');
    expect(state.connections).toHaveLength(2);
  });
});

describe('getDeviceConnections', () => {
  it('returns all connections for a device', () => {
    const d1 = createDeviceData(state, 'desktop', 0, 0);
    const d2 = createDeviceData(state, 'server', 200, 0);
    const d3 = createDeviceData(state, 'router', 400, 0);
    addConnection(state, d1.id, 'right', d2.id, 'left');
    addConnection(state, d1.id, 'bottom', d3.id, 'top');

    expect(getDeviceConnections(state, d1.id)).toHaveLength(2);
    expect(getDeviceConnections(state, d2.id)).toHaveLength(1);
  });

  it('returns empty array for unconnected device', () => {
    const d1 = createDeviceData(state, 'desktop', 0, 0);
    expect(getDeviceConnections(state, d1.id)).toHaveLength(0);
  });
});

describe('getConnectedDevices', () => {
  it('returns connected device objects', () => {
    const d1 = createDeviceData(state, 'desktop', 0, 0);
    const d2 = createDeviceData(state, 'server', 200, 0);
    addConnection(state, d1.id, 'right', d2.id, 'left');

    const connected = getConnectedDevices(state, d1.id);
    expect(connected).toHaveLength(1);
    expect(connected[0].id).toBe(d2.id);
  });
});

// ─── VLAN management ────────────────────────────────────────────────

describe('VLAN management', () => {
  it('adds a VLAN', () => {
    const result = addVlan(state, 30, 'Guest', '192.168.30.0/24', '192.168.30.1');
    expect(result).toBe(true);
    expect(state.vlans).toHaveLength(4);
  });

  it('prevents duplicate VLAN IDs', () => {
    expect(addVlan(state, 1, 'Duplicate', '10.0.0.0/24', '')).toBe(false);
  });

  it('requires id, name, and subnet', () => {
    expect(addVlan(state, null, 'Test', '10.0.0.0/24', '')).toBe(false);
    expect(addVlan(state, 100, '', '10.0.0.0/24', '')).toBe(false);
    expect(addVlan(state, 100, 'Test', '', '')).toBe(false);
  });

  it('deletes a VLAN by index', () => {
    expect(deleteVlan(state, 0)).toBe(true);
    expect(state.vlans).toHaveLength(2);
  });

  it('rejects out-of-bounds index', () => {
    expect(deleteVlan(state, -1)).toBe(false);
    expect(deleteVlan(state, 10)).toBe(false);
  });

  it('getVlanName returns formatted name for existing VLAN', () => {
    expect(getVlanName(state.vlans, 1)).toBe('VLAN 1 - Default');
    expect(getVlanName(state.vlans, 10)).toBe('VLAN 10 - Management');
  });

  it('getVlanName returns "None" for unknown VLAN', () => {
    expect(getVlanName(state.vlans, 999)).toBe('None');
    expect(getVlanName(state.vlans, '')).toBe('None');
  });
});

// ─── SSID management ────────────────────────────────────────────────

describe('SSID management', () => {
  it('adds an SSID', () => {
    expect(addSSID(state, 'CorpWiFi', 'WPA3-Enterprise', '10')).toBe(true);
    expect(state.ssids).toHaveLength(1);
    expect(state.ssids[0].name).toBe('CorpWiFi');
  });

  it('prevents duplicate SSID names', () => {
    addSSID(state, 'CorpWiFi', 'WPA2-Personal', '');
    expect(addSSID(state, 'CorpWiFi', 'WPA3', '10')).toBe(false);
  });

  it('requires a name', () => {
    expect(addSSID(state, '', 'WPA2', '')).toBe(false);
  });

  it('uses defaults for security and vlan', () => {
    addSSID(state, 'Open', null, null);
    expect(state.ssids[0].security).toBe('WPA2-Personal');
    expect(state.ssids[0].vlan).toBe('');
  });

  it('deletes SSID and removes from access points', () => {
    addSSID(state, 'GuestWiFi', 'WPA2-Personal', '');
    const ap = createDeviceData(state, 'ap', 0, 0);
    ap.ssids = ['GuestWiFi'];

    deleteSSID(state, 0);
    expect(state.ssids).toHaveLength(0);
    expect(ap.ssids).toHaveLength(0);
  });

  it('rejects out-of-bounds SSID delete', () => {
    expect(deleteSSID(state, 0)).toBe(false);
  });
});

// ─── Switch VLAN toggle ─────────────────────────────────────────────

describe('toggleSwitchVLAN', () => {
  it('adds VLAN to switch', () => {
    const sw = createDeviceData(state, 'switch', 0, 0);
    sw.assignedVlans = [];
    expect(toggleSwitchVLAN(sw, 10)).toBe(true);
    expect(sw.assignedVlans).toContain(10);
  });

  it('removes VLAN from switch when toggled again', () => {
    const sw = createDeviceData(state, 'switch', 0, 0);
    sw.assignedVlans = [10];
    toggleSwitchVLAN(sw, 10);
    expect(sw.assignedVlans).not.toContain(10);
  });

  it('rejects non-switch devices', () => {
    const desktop = createDeviceData(state, 'desktop', 0, 0);
    expect(toggleSwitchVLAN(desktop, 10)).toBe(false);
  });

  it('initializes assignedVlans if missing', () => {
    const sw = createDeviceData(state, 'switch', 0, 0);
    delete sw.assignedVlans;
    toggleSwitchVLAN(sw, 10);
    expect(sw.assignedVlans).toEqual([10]);
  });
});

// ─── AP SSID toggle ─────────────────────────────────────────────────

describe('toggleAPSSID', () => {
  it('adds SSID to AP', () => {
    const ap = createDeviceData(state, 'ap', 0, 0);
    expect(toggleAPSSID(ap, 'CorpWiFi')).toBe(true);
    expect(ap.ssids).toContain('CorpWiFi');
  });

  it('removes SSID from AP when toggled again', () => {
    const ap = createDeviceData(state, 'ap', 0, 0);
    ap.ssids = ['CorpWiFi'];
    toggleAPSSID(ap, 'CorpWiFi');
    expect(ap.ssids).not.toContain('CorpWiFi');
  });

  it('rejects non-AP devices', () => {
    const desktop = createDeviceData(state, 'desktop', 0, 0);
    expect(toggleAPSSID(desktop, 'WiFi')).toBe(false);
  });
});

// ─── VM management ──────────────────────────────────────────────────

describe('VM management', () => {
  it('adds VM to vmhost', () => {
    const host = createDeviceData(state, 'vmhost', 0, 0);
    expect(addVM(host, 'DC01', 'online')).toBe(true);
    expect(host.vms).toHaveLength(1);
    expect(host.vms[0]).toEqual({ name: 'DC01', status: 'online' });
  });

  it('rejects adding VM to non-vmhost', () => {
    const server = createDeviceData(state, 'server', 0, 0);
    expect(addVM(server, 'DC01', 'online')).toBe(false);
  });

  it('rejects empty VM name', () => {
    const host = createDeviceData(state, 'vmhost', 0, 0);
    expect(addVM(host, '', 'online')).toBe(false);
  });

  it('defaults VM status to online', () => {
    const host = createDeviceData(state, 'vmhost', 0, 0);
    addVM(host, 'DC01');
    expect(host.vms[0].status).toBe('online');
  });

  it('removes VM by index', () => {
    const host = createDeviceData(state, 'vmhost', 0, 0);
    addVM(host, 'DC01', 'online');
    addVM(host, 'DC02', 'online');
    expect(removeVM(host, 0)).toBe(true);
    expect(host.vms).toHaveLength(1);
    expect(host.vms[0].name).toBe('DC02');
  });

  it('rejects out-of-bounds VM removal', () => {
    const host = createDeviceData(state, 'vmhost', 0, 0);
    expect(removeVM(host, 0)).toBe(false);
  });
});

// ─── Connection point calculation ───────────────────────────────────

describe('calculateConnectionPoint', () => {
  const device = { x: 100, y: 200 };
  const w = 120, h = 80;

  it('calculates top point', () => {
    expect(calculateConnectionPoint(device, 'top', w, h)).toEqual({ x: 160, y: 200 });
  });

  it('calculates bottom point', () => {
    expect(calculateConnectionPoint(device, 'bottom', w, h)).toEqual({ x: 160, y: 280 });
  });

  it('calculates left point', () => {
    expect(calculateConnectionPoint(device, 'left', w, h)).toEqual({ x: 100, y: 240 });
  });

  it('calculates right point', () => {
    expect(calculateConnectionPoint(device, 'right', w, h)).toEqual({ x: 220, y: 240 });
  });

  it('returns center for unknown position', () => {
    expect(calculateConnectionPoint(device, 'unknown', w, h)).toEqual({ x: 160, y: 240 });
  });

  it('returns origin for null device', () => {
    expect(calculateConnectionPoint(null, 'top', w, h)).toEqual({ x: 0, y: 0 });
  });
});

// ─── Connection path generation ─────────────────────────────────────

describe('generateConnectionPath', () => {
  it('generates vertical curve for top/bottom positions', () => {
    const path = generateConnectionPath({ x: 100, y: 50 }, 'top', { x: 200, y: 300 });
    expect(path).toBe('M100,50 C100,175 200,175 200,300');
  });

  it('generates horizontal curve for left/right positions', () => {
    const path = generateConnectionPath({ x: 100, y: 200 }, 'right', { x: 300, y: 200 });
    expect(path).toBe('M100,200 C200,200 200,200 300,200');
  });

  it('generates vertical curve for bottom position', () => {
    const path = generateConnectionPath({ x: 100, y: 200 }, 'bottom', { x: 300, y: 400 });
    expect(path).toBe('M100,200 C100,300 300,300 300,400');
  });
});

// ─── Nearest edge detection ─────────────────────────────────────────

describe('getNearestEdge', () => {
  it('returns top when closest to top', () => {
    expect(getNearestEdge(60, 5, 120, 80)).toBe('top');
  });

  it('returns bottom when closest to bottom', () => {
    expect(getNearestEdge(60, 75, 120, 80)).toBe('bottom');
  });

  it('returns left when closest to left', () => {
    expect(getNearestEdge(5, 40, 120, 80)).toBe('left');
  });

  it('returns right when closest to right', () => {
    expect(getNearestEdge(115, 40, 120, 80)).toBe('right');
  });
});

// ─── Zoom ───────────────────────────────────────────────────────────

describe('clampZoom', () => {
  it('clamps to min 0.25', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(-1)).toBe(0.25);
  });

  it('clamps to max 3', () => {
    expect(clampZoom(5)).toBe(3);
  });

  it('passes through values in range', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0.5)).toBe(0.5);
    expect(clampZoom(2.5)).toBe(2.5);
  });
});

describe('calculateZoomPan', () => {
  it('adjusts pan to keep mouse position stable', () => {
    const result = calculateZoomPan(1, 2, 500, 300, 0, 0);
    expect(result.panX).toBe(-500);
    expect(result.panY).toBe(-300);
  });

  it('returns unchanged pan when zoom ratio is 1', () => {
    const result = calculateZoomPan(1, 1, 500, 300, 50, 60);
    expect(result.panX).toBe(50);
    expect(result.panY).toBe(60);
  });
});

// ─── Drop position ──────────────────────────────────────────────────

describe('calculateDropPosition', () => {
  it('calculates correct drop coordinates', () => {
    const pos = calculateDropPosition(500, 400, 0, 0, 0, 0, 1);
    expect(pos.x).toBe(4440);
    expect(pos.y).toBe(4360);
  });

  it('accounts for pan offset', () => {
    const pos = calculateDropPosition(500, 400, 0, 0, 100, 50, 1);
    expect(pos.x).toBe(4340);
    expect(pos.y).toBe(4310);
  });

  it('accounts for zoom', () => {
    const pos = calculateDropPosition(500, 400, 0, 0, 0, 0, 2);
    expect(pos.x).toBe(4190);
    expect(pos.y).toBe(4160);
  });
});

// ─── Format count ───────────────────────────────────────────────────

describe('formatCount', () => {
  it('singularizes for 1', () => {
    expect(formatCount(1, 'device')).toBe('1 device');
  });

  it('pluralizes for 0', () => {
    expect(formatCount(0, 'device')).toBe('0 devices');
  });

  it('pluralizes for >1', () => {
    expect(formatCount(5, 'connection')).toBe('5 connections');
  });
});

// ─── JSON serialization ─────────────────────────────────────────────

describe('JSON serialization', () => {
  it('exports state to JSON format', () => {
    const d = createDeviceData(state, 'desktop', 100, 200);
    state.zoom = 1.5;
    state.panX = 50;

    const json = exportStateToJson(state, 'Acme Corp', 'HQ');
    expect(json.devices).toHaveLength(1);
    expect(json.clientName).toBe('Acme Corp');
    expect(json.siteName).toBe('HQ');
    expect(json.view.zoom).toBe(1.5);
  });

  it('round-trips through export/import', () => {
    createDeviceData(state, 'desktop', 100, 200);
    createDeviceData(state, 'server', 300, 200);
    addConnection(state, state.devices[0].id, 'right', state.devices[1].id, 'left');
    addVlan(state, 30, 'Guest', '192.168.30.0/24', '');
    createZoneData(state, 'cloud', 50, 50);
    state.zoom = 1.5;

    const exported = exportStateToJson(state, 'Client', 'Site');
    const newState = createInitialState();
    const meta = importStateFromJson(newState, exported);

    expect(newState.devices).toHaveLength(2);
    expect(newState.connections).toHaveLength(1);
    expect(newState.zones).toHaveLength(1);
    expect(newState.vlans).toHaveLength(4);
    expect(newState.zoom).toBe(1.5);
    expect(meta.clientName).toBe('Client');
    expect(meta.siteName).toBe('Site');
  });

  it('handles missing fields in import gracefully', () => {
    const data = {};
    const result = importStateFromJson(state, data);
    expect(state.devices).toEqual([]);
    expect(state.connections).toEqual([]);
    expect(result.clientName).toBe('');
  });

  it('preserves existing vlans when import has none', () => {
    const originalVlans = [...state.vlans];
    importStateFromJson(state, { devices: [] });
    expect(state.vlans).toEqual(originalVlans);
  });
});

// ─── CSV parsing ────────────────────────────────────────────────────

describe('parseCSVLine', () => {
  it('parses simple CSV line', () => {
    expect(parseCSVLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields', () => {
    expect(parseCSVLine('"hello, world",foo,bar')).toEqual(['hello, world', 'foo', 'bar']);
  });

  it('handles escaped quotes', () => {
    expect(parseCSVLine('"say ""hi""",ok')).toEqual(['say "hi"', 'ok']);
  });

  it('handles empty fields', () => {
    expect(parseCSVLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('trims whitespace', () => {
    expect(parseCSVLine(' a , b , c ')).toEqual(['a', 'b', 'c']);
  });

  it('handles single field', () => {
    expect(parseCSVLine('hello')).toEqual(['hello']);
  });

  it('handles empty string', () => {
    expect(parseCSVLine('')).toEqual(['']);
  });
});

describe('parseCSVContent', () => {
  it('parses valid CSV with headers', () => {
    const csv = 'Type,Name,IP Address\ndesktop,PC1,192.168.1.100\nlaptop,Laptop1,192.168.1.101';
    const result = parseCSVContent(csv);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('desktop');
    expect(result[0].name).toBe('PC1');
  });

  it('skips comment lines', () => {
    const csv = '# This is a comment\nType,Name\ndesktop,PC1';
    const result = parseCSVContent(csv);
    expect(result).toHaveLength(1);
  });

  it('skips empty lines', () => {
    const csv = 'Type,Name\n\ndesktop,PC1\n\n';
    const result = parseCSVContent(csv);
    expect(result).toHaveLength(1);
  });

  it('rejects invalid device types', () => {
    const csv = 'Type,Name\ninvalidtype,Foo\ndesktop,PC1';
    const result = parseCSVContent(csv);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('desktop');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCSVContent('Type,Name')).toEqual([]);
  });

  it('returns empty array for insufficient lines', () => {
    expect(parseCSVContent('single line')).toEqual([]);
  });

  it('normalizes header names to lowercase with no spaces', () => {
    const csv = 'Type,IP Address,MAC Address\ndesktop,1.2.3.4,AA:BB:CC';
    const result = parseCSVContent(csv);
    expect(result[0].ipaddress).toBe('1.2.3.4');
    expect(result[0].macaddress).toBe('AA:BB:CC');
  });
});

describe('csvRowToDevice', () => {
  it('creates device from CSV row', () => {
    const row = { type: 'desktop', name: 'PC1', ipaddress: '10.0.0.1', status: 'online' };
    const device = csvRowToDevice(row, 0, 1, 5, 4000, 4000, true);
    expect(device.type).toBe('desktop');
    expect(device.name).toBe('PC1');
    expect(device.ip).toBe('10.0.0.1');
    expect(device.status).toBe('online');
  });

  it('defaults status to online for invalid status', () => {
    const row = { type: 'desktop', name: 'PC1', status: 'bogus' };
    const device = csvRowToDevice(row, 0, 1, 5, 4000, 4000, true);
    expect(device.status).toBe('online');
  });

  it('uses type name as default name', () => {
    const row = { type: 'server', name: '' };
    const device = csvRowToDevice(row, 0, 5, 5, 4000, 4000, true);
    expect(device.name).toBe('Server 5');
  });

  it('adds router-specific fields', () => {
    const row = { type: 'router', name: 'ISP', connectiontype: 'fiber', downloadmbps: '1000', uploadmbps: '500' };
    const device = csvRowToDevice(row, 0, 1, 5, 4000, 4000, true);
    expect(device.connectionType).toBe('fiber');
    expect(device.downloadSpeed).toBe('1000');
    expect(device.uploadSpeed).toBe('500');
  });

  it('adds switch-specific fields', () => {
    const row = { type: 'switch', name: 'SW1', ports: '48', poe: 'yes' };
    const device = csvRowToDevice(row, 0, 1, 5, 4000, 4000, true);
    expect(device.ports).toBe('48');
    expect(device.poe).toBe(true);
    expect(device.assignedVlans).toEqual([]);
  });

  it('creates vmhost with empty vms array', () => {
    const row = { type: 'vmhost', name: 'ESXi' };
    const device = csvRowToDevice(row, 0, 1, 5, 4000, 4000, true);
    expect(device.vms).toEqual([]);
  });

  it('calculates grid position', () => {
    const device0 = csvRowToDevice({ type: 'desktop', name: 'A' }, 0, 1, 3, 4000, 4000, false);
    const device1 = csvRowToDevice({ type: 'desktop', name: 'B' }, 1, 2, 3, 4000, 4000, false);
    const device3 = csvRowToDevice({ type: 'desktop', name: 'D' }, 3, 4, 3, 4000, 4000, false);

    expect(device0.x).toBe(4000);
    expect(device0.y).toBe(4000);
    expect(device1.x).toBe(4160);
    expect(device1.y).toBe(4000);
    expect(device3.x).toBe(4000);
    expect(device3.y).toBe(4160);
  });
});

// ─── CSV export ─────────────────────────────────────────────────────

describe('escapeCSVCell', () => {
  it('returns plain strings unchanged', () => {
    expect(escapeCSVCell('hello')).toBe('hello');
  });

  it('wraps strings with commas in quotes', () => {
    expect(escapeCSVCell('hello, world')).toBe('"hello, world"');
  });

  it('escapes quotes inside quoted strings', () => {
    expect(escapeCSVCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('wraps strings with newlines in quotes', () => {
    expect(escapeCSVCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('converts non-strings', () => {
    expect(escapeCSVCell(42)).toBe('42');
    expect(escapeCSVCell(true)).toBe('true');
  });
});

describe('exportDevicesToCSV', () => {
  it('exports devices to CSV format', () => {
    const devices = [
      { type: 'desktop', name: 'PC1', ip: '10.0.0.1', mac: 'AA:BB', manufacturer: 'Dell', model: '', os: 'Win11', serial: 'SN1', ports: '', poe: false, connectionType: '', downloadSpeed: '', uploadSpeed: '', vlan: '1', status: 'online', notes: '' },
    ];
    const csv = exportDevicesToCSV(devices);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Type');
    expect(lines[1]).toContain('desktop,PC1');
  });

  it('handles empty device list', () => {
    const csv = exportDevicesToCSV([]);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(1); // header only
  });
});

// ─── Bounding box ───────────────────────────────────────────────────

describe('calculateBoundingBox', () => {
  const defaultDims = () => ({ width: 120, height: 100 });

  it('calculates bounding box for devices', () => {
    const devices = [
      { x: 100, y: 200 },
      { x: 300, y: 400 },
    ];
    const box = calculateBoundingBox(devices, [], defaultDims);
    expect(box.minX).toBe(100);
    expect(box.minY).toBe(200);
    expect(box.maxX).toBe(420);
    expect(box.maxY).toBe(500);
  });

  it('includes zones in bounding box', () => {
    const devices = [{ x: 100, y: 200 }];
    const zones = [{ x: 50, y: 50, width: 500, height: 400 }];
    const box = calculateBoundingBox(devices, zones, defaultDims);
    expect(box.minX).toBe(50);
    expect(box.minY).toBe(50);
    expect(box.maxX).toBe(550);
    expect(box.maxY).toBe(450);
  });
});

// ─── Clear all ──────────────────────────────────────────────────────

describe('clearAllData', () => {
  it('resets all data arrays and counters', () => {
    createDeviceData(state, 'desktop', 0, 0);
    createDeviceData(state, 'server', 100, 0);
    addConnection(state, state.devices[0].id, 'right', state.devices[1].id, 'left');
    createZoneData(state, 'cloud', 0, 0);
    state.selected = state.devices[0];

    clearAllData(state);

    expect(state.devices).toEqual([]);
    expect(state.connections).toEqual([]);
    expect(state.zones).toEqual([]);
    expect(state.counter).toBe(0);
    expect(state.zoneCounter).toBe(0);
    expect(state.selected).toBeNull();
    expect(state.selectedZone).toBeNull();
  });
});
