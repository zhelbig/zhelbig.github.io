/**
 * Network Mapper - Pure logic extracted for testability.
 * These functions contain the business logic from network-mapper.html,
 * separated from DOM manipulation for unit testing.
 */

// ─── Device type definitions ────────────────────────────────────────

export const types = {
  desktop: { name: 'Desktop', icon: '🖥️' },
  laptop: { name: 'Laptop', icon: '💻' },
  cellphone: { name: 'Cell Phone', icon: '📱' },
  tablet: { name: 'Tablet', icon: '📲' },
  otherendpoint: { name: 'Other Endpoint', icon: '❓' },
  server: { name: 'Server', icon: '🖥️' },
  nas: { name: 'NAS', icon: '💾' },
  router: { name: 'Router', icon: '📡' },
  switch: { name: 'Switch', icon: '🔀' },
  firewall: { name: 'Firewall', icon: '🛡️' },
  ap: { name: 'Access Point', icon: '📶' },
  vmhost: { name: 'VM Host', icon: '🖥️🖥️' },
  vm: { name: 'VM', icon: '🖥️' },
  storage: { name: 'Storage', icon: '📦' },
  printer: { name: 'Printer', icon: '🖨️' },
  iot: { name: 'IoT', icon: '🌐' },
  phone: { name: 'Desk Phone', icon: '☎️' },
  camera: { name: 'Security Camera', icon: '📹' },
};

export const zoneTypes = {
  cloud: { name: 'Cloud', icon: '☁️', color: '#3b82f6' },
  onprem: { name: 'On-Prem', icon: '🏢', color: '#8b5cf6' },
  mdf: { name: 'MDF', icon: '', color: '#22c55e' },
  idf: { name: 'IDF', icon: '', color: '#f97316' },
  ups: { name: 'UPS', icon: '🔋', color: '#eab308' },
};

export const manufacturers = {
  desktop: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'Microsoft', 'Intel NUC', 'Custom Build', 'Other'],
  laptop: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'Microsoft', 'Samsung', 'MSI', 'Razer', 'Framework', 'Other'],
  cellphone: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Motorola', 'LG', 'Xiaomi', 'Huawei', 'Sony', 'Nokia', 'Other'],
  tablet: ['Apple', 'Samsung', 'Microsoft', 'Lenovo', 'Amazon', 'Google', 'Huawei', 'Asus', 'Other'],
  printer: ['HP', 'Canon', 'Epson', 'Brother', 'Xerox', 'Lexmark', 'Ricoh', 'Kyocera', 'Dell', 'Samsung', 'Konica Minolta', 'Other'],
  otherendpoint: ['Generic', 'Custom', 'Other'],
  server: ['Dell', 'HP/HPE', 'Lenovo', 'Supermicro', 'Cisco', 'IBM', 'Fujitsu', 'Intel', 'Custom Build', 'Other'],
  vm: ['VMware', 'Hyper-V', 'Proxmox', 'KVM', 'VirtualBox', 'Xen', 'Other'],
};

// ─── State factory ──────────────────────────────────────────────────

export function createInitialState() {
  return {
    devices: [],
    connections: [],
    zones: [],
    vlans: [
      { id: 1, name: 'Default', subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
      { id: 10, name: 'Management', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
      { id: 20, name: 'Servers', subnet: '192.168.20.0/24', gateway: '192.168.20.1' },
    ],
    ssids: [],
    config: {
      dnsProvider: 'DNS Filter',
      dnsServer: '',
      dnsPrimary: '8.8.8.8',
      dnsSecondary: '8.8.4.4',
      dhcpType: 'Router',
      dhcpDevice: '',
    },
    selected: null,
    selectedZone: null,
    connType: 'wired',
    connecting: null,
    zoom: 1,
    panX: 0,
    panY: 0,
    counter: 0,
    zoneCounter: 0,
    exportFormat: 'pdf',
  };
}

// ─── Grid snapping ──────────────────────────────────────────────────

const GRID_SIZE = 20;

export function snapToGridValue(value, snapEnabled = true) {
  if (!snapEnabled) return value;
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

// ─── Device CRUD ────────────────────────────────────────────────────

export function createDeviceData(state, type, x, y) {
  state.counter++;
  const cfg = types[type];
  if (!cfg) return null;

  const device = {
    id: 'dev' + Date.now() + '_' + state.counter,
    type,
    name: cfg.name + ' ' + state.counter,
    ip: '',
    mac: '',
    status: 'online',
    vlan: '',
    notes: '',
    manufacturer: '',
    os: '',
    x,
    y,
    vms: type === 'vmhost' ? [] : null,
  };
  state.devices.push(device);
  return device;
}

export function deleteDeviceData(state, deviceId) {
  const index = state.devices.findIndex((d) => d.id === deviceId);
  if (index === -1) return false;

  // Remove connections involving this device
  state.connections = state.connections.filter(
    (c) => c.from !== deviceId && c.to !== deviceId
  );
  state.devices.splice(index, 1);

  if (state.selected && state.selected.id === deviceId) {
    state.selected = null;
  }
  return true;
}

export function updateDeviceProperty(state, key, value) {
  if (!state.selected) return false;
  state.selected[key] = value;
  return true;
}

export function setDeviceStatus(state, status) {
  const validStatuses = ['online', 'offline', 'warning', 'retired', 'decommissioned'];
  if (!state.selected) return false;
  if (!validStatuses.includes(status)) return false;
  state.selected.status = status;
  return true;
}

// ─── Zone CRUD ──────────────────────────────────────────────────────

export function createZoneData(state, type, x, y) {
  state.zoneCounter++;
  const cfg = zoneTypes[type];
  if (!cfg) return null;

  const zone = {
    id: 'zone' + Date.now() + '_' + state.zoneCounter,
    type,
    name: cfg.name + ' ' + state.zoneCounter,
    x,
    y,
    width: 200,
    height: 150,
    notes: '',
  };

  if (type === 'ups') {
    zone.manufacturer = '';
    zone.model = '';
    zone.capacity = '';
    zone.runtime = '';
    zone.ip = '';
  } else if (type === 'mdf' || type === 'idf') {
    zone.location = '';
    if (type === 'idf') zone.connectedMDF = '';
  } else if (type === 'cloud') {
    zone.provider = '';
    zone.region = '';
  } else if (type === 'onprem') {
    zone.location = '';
  }

  state.zones.push(zone);
  return zone;
}

export function deleteZoneData(state, zoneId) {
  const index = state.zones.findIndex((z) => z.id === zoneId);
  if (index === -1) return false;
  state.zones.splice(index, 1);
  if (state.selectedZone && state.selectedZone.id === zoneId) {
    state.selectedZone = null;
  }
  return true;
}

export function updateZoneProperty(state, key, value) {
  if (!state.selectedZone) return false;
  state.selectedZone[key] = value;
  return true;
}

// ─── Connection management ──────────────────────────────────────────

export function addConnection(state, fromId, fromPos, toId, toPos) {
  // Can't connect to self
  if (fromId === toId) return null;

  // Check for duplicate
  const exists = state.connections.some(
    (c) =>
      (c.from === fromId && c.to === toId) ||
      (c.from === toId && c.to === fromId)
  );
  if (exists) return null;

  // Verify both devices exist
  const fromDevice = state.devices.find((d) => d.id === fromId);
  const toDevice = state.devices.find((d) => d.id === toId);
  if (!fromDevice || !toDevice) return null;

  const connection = {
    id: 'conn' + Date.now(),
    from: fromId,
    fromPos,
    to: toId,
    toPos,
    type: state.connType,
  };
  state.connections.push(connection);
  return connection;
}

export function getDeviceConnections(state, deviceId) {
  return state.connections.filter(
    (c) => c.from === deviceId || c.to === deviceId
  );
}

export function getConnectedDevices(state, deviceId) {
  const connections = getDeviceConnections(state, deviceId);
  return connections.map((conn) => {
    const otherId = conn.from === deviceId ? conn.to : conn.from;
    return state.devices.find((d) => d.id === otherId);
  }).filter(Boolean);
}

// ─── VLAN management ────────────────────────────────────────────────

export function addVlan(state, id, name, subnet, gateway) {
  if (!id || !name || !subnet) return false;
  if (state.vlans.some((v) => v.id === id)) return false;
  state.vlans.push({ id, name, subnet, gateway: gateway || '' });
  return true;
}

export function deleteVlan(state, index) {
  if (index < 0 || index >= state.vlans.length) return false;
  state.vlans.splice(index, 1);
  return true;
}

export function getVlanName(vlans, vlanId) {
  const vlan = vlans.find((v) => v.id === vlanId);
  return vlan ? `VLAN ${vlan.id} - ${vlan.name}` : 'None';
}

// ─── SSID management ────────────────────────────────────────────────

export function addSSID(state, name, security, vlan) {
  if (!name) return false;
  if (state.ssids.some((s) => s.name === name)) return false;
  state.ssids.push({ name, security: security || 'WPA2-Personal', vlan: vlan || '' });
  return true;
}

export function deleteSSID(state, index) {
  if (index < 0 || index >= state.ssids.length) return false;
  const ssidName = state.ssids[index].name;
  state.ssids.splice(index, 1);
  // Remove from all access points
  state.devices.forEach((d) => {
    if (d.type === 'ap' && d.ssids) {
      d.ssids = d.ssids.filter((s) => s !== ssidName);
    }
  });
  return true;
}

// ─── Switch VLAN toggle ─────────────────────────────────────────────

export function toggleSwitchVLAN(device, vlanId) {
  if (!device || device.type !== 'switch') return false;
  if (!device.assignedVlans) device.assignedVlans = [];

  const index = device.assignedVlans.indexOf(vlanId);
  if (index === -1) {
    device.assignedVlans.push(vlanId);
  } else {
    device.assignedVlans.splice(index, 1);
  }
  return true;
}

// ─── AP SSID toggle ─────────────────────────────────────────────────

export function toggleAPSSID(device, ssidName) {
  if (!device || device.type !== 'ap') return false;
  if (!device.ssids) device.ssids = [];

  const index = device.ssids.indexOf(ssidName);
  if (index === -1) {
    device.ssids.push(ssidName);
  } else {
    device.ssids.splice(index, 1);
  }
  return true;
}

// ─── VM management ──────────────────────────────────────────────────

export function addVM(device, name, status) {
  if (!device || device.type !== 'vmhost') return false;
  if (!name) return false;
  if (!device.vms) device.vms = [];
  device.vms.push({ name, status: status || 'online' });
  return true;
}

export function removeVM(device, index) {
  if (!device || !device.vms) return false;
  if (index < 0 || index >= device.vms.length) return false;
  device.vms.splice(index, 1);
  return true;
}

// ─── Connection point calculation ───────────────────────────────────

export function calculateConnectionPoint(device, position, width, height) {
  if (!device) return { x: 0, y: 0 };

  const centerX = device.x + width / 2;
  const centerY = device.y + height / 2;

  switch (position) {
    case 'top':
      return { x: centerX, y: device.y };
    case 'bottom':
      return { x: centerX, y: device.y + height };
    case 'left':
      return { x: device.x, y: centerY };
    case 'right':
      return { x: device.x + width, y: centerY };
    default:
      return { x: centerX, y: centerY };
  }
}

// ─── Connection path generation ─────────────────────────────────────

export function generateConnectionPath(from, fromPos, to) {
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;

  if (fromPos === 'top' || fromPos === 'bottom') {
    return `M${from.x},${from.y} C${from.x},${midY} ${to.x},${midY} ${to.x},${to.y}`;
  }
  return `M${from.x},${from.y} C${midX},${from.y} ${midX},${to.y} ${to.x},${to.y}`;
}

// ─── Nearest edge detection ─────────────────────────────────────────

export function getNearestEdge(relX, relY, width, height) {
  const distTop = relY;
  const distBottom = height - relY;
  const distLeft = relX;
  const distRight = width - relX;
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);

  if (minDist === distTop) return 'top';
  if (minDist === distBottom) return 'bottom';
  if (minDist === distLeft) return 'left';
  return 'right';
}

// ─── Zoom clamping ──────────────────────────────────────────────────

export function clampZoom(zoom) {
  return Math.max(0.25, Math.min(3, zoom));
}

export function calculateZoomPan(oldZoom, newZoom, mouseX, mouseY, panX, panY) {
  const zoomRatio = newZoom / oldZoom;
  return {
    panX: mouseX - (mouseX - panX) * zoomRatio,
    panY: mouseY - (mouseY - panY) * zoomRatio,
  };
}

// ─── Canvas drop coordinate calculation ─────────────────────────────

export function calculateDropPosition(clientX, clientY, rectLeft, rectTop, panX, panY, zoom) {
  const rawX = (clientX - rectLeft - panX) / zoom + 4000 - 60;
  const rawY = (clientY - rectTop - panY) / zoom + 4000 - 40;
  return { x: rawX, y: rawY };
}

// ─── Count labels ───────────────────────────────────────────────────

export function formatCount(count, singular) {
  return count + ' ' + singular + (count !== 1 ? 's' : '');
}

// ─── JSON serialization ─────────────────────────────────────────────

export function exportStateToJson(state, clientName, siteName) {
  return {
    devices: state.devices,
    connections: state.connections,
    zones: state.zones,
    vlans: state.vlans,
    ssids: state.ssids,
    config: state.config,
    clientName: clientName || '',
    siteName: siteName || '',
    view: { zoom: state.zoom, panX: state.panX, panY: state.panY },
  };
}

export function importStateFromJson(state, data) {
  state.devices = data.devices || [];
  state.connections = data.connections || [];
  state.zones = data.zones || [];
  state.vlans = data.vlans || state.vlans;
  state.ssids = data.ssids || [];
  state.config = data.config || state.config;

  if (data.view) {
    state.zoom = data.view.zoom || 1;
    state.panX = data.view.panX || 0;
    state.panY = data.view.panY || 0;
  }

  return {
    clientName: data.clientName || '',
    siteName: data.siteName || '',
  };
}

// ─── CSV parsing ────────────────────────────────────────────────────

export function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());

  return result;
}

const VALID_DEVICE_TYPES = [
  'router', 'firewall', 'switch', 'ap', 'server', 'vmhost', 'nas',
  'desktop', 'laptop', 'cellphone', 'tablet', 'printer', 'phone',
  'camera', 'iot', 'otherendpoint', 'storage',
];

const VALID_STATUSES = ['online', 'offline', 'warning', 'retired', 'decommissioned'];

export function parseCSVContent(content) {
  const lines = content.split('\n').filter(
    (line) => line.trim() && !line.trim().startsWith('#')
  );

  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row = {};
    headers.forEach((header, index) => {
      row[header.toLowerCase().replace(/\s+/g, '')] = values[index] || '';
    });

    if (row.type && VALID_DEVICE_TYPES.includes(row.type.toLowerCase())) {
      results.push(row);
    }
  }

  return results;
}

export function csvRowToDevice(row, index, counter, gridCols, startX, startY, snapEnabled) {
  const col = index % gridCols;
  const rowNum = Math.floor(index / gridCols);
  const deviceType = row.type.toLowerCase();

  const device = {
    id: 'dev' + Date.now() + '_' + index,
    type: deviceType,
    name: row.name || (types[deviceType]?.name || 'Device') + ' ' + counter,
    ip: row.ipaddress || '',
    mac: row.macaddress || '',
    manufacturer: row.manufacturer || '',
    os: row.os || '',
    model: row.model || '',
    serial: row.serialnumber || '',
    vlan: row.vlanid || '',
    status: VALID_STATUSES.includes(row.status?.toLowerCase())
      ? row.status.toLowerCase()
      : 'online',
    notes: row.notes || '',
    x: snapToGridValue(startX + col * 160, snapEnabled),
    y: snapToGridValue(startY + rowNum * 160, snapEnabled),
    vms: deviceType === 'vmhost' ? [] : null,
  };

  if (deviceType === 'router') {
    device.connectionType = row.connectiontype || '';
    device.downloadSpeed = row.downloadmbps || '';
    device.uploadSpeed = row.uploadmbps || '';
  }

  if (deviceType === 'switch' || deviceType === 'firewall') {
    device.ports = row.ports || '';
  }

  if (deviceType === 'switch') {
    device.poe = row.poe?.toLowerCase() === 'yes' || row.poe?.toLowerCase() === 'true';
    device.assignedVlans = [];
  }

  return device;
}

// ─── CSV export ─────────────────────────────────────────────────────

export function escapeCSVCell(cell) {
  const str = String(cell);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function exportDevicesToCSV(devices) {
  const headers = [
    'Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'Model',
    'OS', 'Serial Number', 'Ports', 'PoE', 'Connection Type',
    'Download Mbps', 'Upload Mbps', 'VLAN ID', 'Status', 'Notes',
  ];

  let csvContent = headers.join(',') + '\n';

  devices.forEach((d) => {
    const row = [
      d.type || '', d.name || '', d.ip || '', d.mac || '',
      d.manufacturer || '', d.model || '', d.os || '', d.serial || '',
      d.ports || '', d.poe ? 'yes' : '', d.connectionType || '',
      d.downloadSpeed || '', d.uploadSpeed || '', d.vlan || '',
      d.status || '', d.notes || '',
    ].map(escapeCSVCell);
    csvContent += row.join(',') + '\n';
  });

  return csvContent;
}

// ─── Bounding box calculation ───────────────────────────────────────

export function calculateBoundingBox(devices, zones, getDeviceDimensions) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  devices.forEach((d) => {
    const { width: w, height: h } = getDeviceDimensions(d);
    minX = Math.min(minX, d.x);
    minY = Math.min(minY, d.y);
    maxX = Math.max(maxX, d.x + w);
    maxY = Math.max(maxY, d.y + h);
  });

  if (zones) {
    zones.forEach((z) => {
      minX = Math.min(minX, z.x);
      minY = Math.min(minY, z.y);
      maxX = Math.max(maxX, z.x + z.width);
      maxY = Math.max(maxY, z.y + z.height);
    });
  }

  return { minX, minY, maxX, maxY };
}

// ─── Clear all ──────────────────────────────────────────────────────

export function clearAllData(state) {
  state.devices = [];
  state.connections = [];
  state.zones = [];
  state.counter = 0;
  state.zoneCounter = 0;
  state.selected = null;
  state.selectedZone = null;
}
