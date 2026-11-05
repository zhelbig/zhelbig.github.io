/**
 * Application state: its shape, and the snapshot serialization that
 * undo/redo and project save/load are both built on. Pure - no DOM.
 */

/** Fields captured by a snapshot. View state (zoom/pan) and transient
 *  selection are deliberately excluded: undoing an edit should not move
 *  the viewport or change what is selected. */
export const SNAPSHOT_FIELDS = [
    'devices', 'connections', 'zones', 'vlans', 'ssids', 'config',
    'counter', 'zoneCounter'
];

/**
 * Unique element id.
 *
 * Ids used to be `prefix + Date.now()`, which collides whenever two objects
 * are created inside the same millisecond - dragging devices out quickly, or
 * any bulk creation. Duplicate ids are not cosmetic: getElementById returns
 * the wrong box, and connections then anchor to it.
 *
 * The sequence restarts at load, but the timestamp component differs across
 * sessions, so ids stay unique against anything already saved.
 */
let idSequence = 0;

export function nextId(prefix) {
    idSequence += 1;
    return prefix + Date.now().toString(36) + '_' + idSequence.toString(36);
}

export function createInitialState() {
    return {
        devices: [],
        connections: [],
        zones: [],
        vlans: [
            { id: 1, name: 'Default', subnet: '192.168.1.0/24', gateway: '192.168.1.1' },
            { id: 10, name: 'Management', subnet: '192.168.10.0/24', gateway: '192.168.10.1' },
            { id: 20, name: 'Servers', subnet: '192.168.20.0/24', gateway: '192.168.20.1' }
        ],
        ssids: [],
        config: { dnsProvider: 'DNS Filter', dnsServer: '', dnsPrimary: '8.8.8.8', dnsSecondary: '8.8.4.4', dhcpType: 'Router', dhcpDevice: '' },
        selected: null,
        selectedZone: null,
        connType: 'wired',
        routingStyle: 'curved',
        connecting: null,
        zoom: 1,
        panX: 0,
        panY: 0,
        counter: 0,
        zoneCounter: 0
    }
}

/**
 * Bring a loaded project up to date.
 *
 * UPS used to be a zone - a box you drew around things, which "protected"
 * whatever happened to sit inside it. It is a device now, with an explicit
 * list of what it feeds. Older files still carry UPS zones, so convert
 * them and seed the list from whatever the box used to contain, which is
 * what the author meant by drawing it there.
 *
 * Containment uses the device's top-left corner: this is a one-off
 * heuristic over old data, not the live membership test, and it needs no
 * rendered sizes.
 */
export function migrateUpsZones(data) {
    const zones = data.zones || [];
    const upsZones = zones.filter(z => z.type === 'ups');
    if (upsZones.length === 0) return { data, migrated: 0 };

    data.zones = zones.filter(z => z.type !== 'ups');
    data.devices = data.devices || [];

    upsZones.forEach(z => {
        const inside = data.devices.filter(d =>
            d.x >= z.x && d.x <= z.x + (z.width || 0) &&
            d.y >= z.y && d.y <= z.y + (z.height || 0) &&
            d.type !== 'ups'
        );
        data.devices.push({
            id: nextId('dev'),
            type: 'ups',
            name: z.name || 'UPS',
            manufacturer: z.manufacturer || '',
            model: z.model || '',
            capacity: z.capacity || '',
            runtime: z.runtime || '',
            ip: z.ip || '',
            mac: '',
            notes: z.notes || '',
            status: 'online',
            vlan: '',
            x: z.x,
            y: z.y,
            vms: null,
            protects: inside.map(d => d.id)
        });
    });

    return { data, migrated: upsZones.length };
}

export function serializeState(state) {
    const out = {};
    SNAPSHOT_FIELDS.forEach(k => { out[k] = state[k]; });
    return JSON.stringify(out);
}

/** Copy a snapshot's fields back onto an existing state object in place,
 *  so every live reference to `state` stays valid. */
export function applySnapshot(state, json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;
    SNAPSHOT_FIELDS.forEach(k => {
        if (data[k] !== undefined) state[k] = data[k];
    });
    return state;
}

/** Highest trailing integer across generated names ("Switch 12" -> 12), so
 *  loading a project doesn't restart numbering and collide. */
export function highestNameIndex(items) {
    let max = 0;
    (items || []).forEach(it => {
        const m = /(\d+)\s*$/.exec(it && it.name ? it.name : '');
        if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return max;
}

/** Counter values that are safe after loading `data`: never lower than the
 *  number of items, nor than the highest number already used in a name. */
export function resolveCounters(data) {
    const devices = data.devices || [];
    const zones = data.zones || [];
    return {
        counter: Math.max(data.counter || 0, devices.length, highestNameIndex(devices)),
        zoneCounter: Math.max(data.zoneCounter || 0, zones.length, highestNameIndex(zones))
    };
}
