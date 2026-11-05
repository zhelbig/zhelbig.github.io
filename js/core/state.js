/**
 * Application state: its shape, and the snapshot serialization that
 * undo/redo and project save/load are both built on. Pure - no DOM.
 */

/** Fields captured by a snapshot. View state (zoom/pan) and transient
 *  selection are deliberately excluded: undoing an edit should not move
 *  the viewport or change what is selected. */
export const SNAPSHOT_FIELDS = [
    'devices', 'connections', 'zones', 'vlans', 'ssids', 'upsUnits', 'config',
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
        upsUnits: [],
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
 * Power protection has had two earlier shapes, and both still exist in
 * saved files:
 *   1. a UPS *zone* - a box drawn on the canvas, implicitly protecting
 *      whatever sat inside it
 *   2. a UPS *device* with a `protects` list of device ids
 *
 * Both become entries in state.upsUnits, with each protected object
 * carrying the ids feeding it. Nothing is discarded: a zone's contents and
 * a device's protects list both survive as real assignments.
 *
 * Zone containment uses the device's top-left corner. This runs once over
 * old data and has no rendered sizes to consult, unlike the live test.
 */
export function migrateUpsZones(data) {
    data.devices = data.devices || [];
    data.zones = data.zones || [];
    data.upsUnits = data.upsUnits || [];

    const assign = (obj, upsId) => {
        if (!obj) return;
        if (!obj.upsIds) obj.upsIds = [];
        if (!obj.upsIds.includes(upsId)) obj.upsIds.push(upsId);
    };

    let migrated = 0;

    // (1) UPS zones.
    const upsZones = data.zones.filter(z => z.type === 'ups');
    if (upsZones.length) {
        data.zones = data.zones.filter(z => z.type !== 'ups');
        upsZones.forEach(z => {
            const unit = {
                id: nextId('ups'),
                name: z.name || 'UPS',
                manufacturer: z.manufacturer || '',
                model: z.model || '',
                capacity: z.capacity || '',
                runtime: z.runtime || '',
                ip: z.ip || ''
            };
            data.upsUnits.push(unit);
            data.devices
                .filter(d => d.type !== 'ups' &&
                    d.x >= z.x && d.x <= z.x + (z.width || 0) &&
                    d.y >= z.y && d.y <= z.y + (z.height || 0))
                .forEach(d => assign(d, unit.id));
            migrated++;
        });
    }

    // (2) UPS devices.
    const upsDevices = data.devices.filter(d => d.type === 'ups');
    if (upsDevices.length) {
        data.devices = data.devices.filter(d => d.type !== 'ups');
        const byId = new Map([...data.devices, ...data.zones].map(o => [o.id, o]));
        upsDevices.forEach(d => {
            const unit = {
                id: nextId('ups'),
                name: d.name || 'UPS',
                manufacturer: d.manufacturer || '',
                model: d.model || '',
                capacity: d.capacity || '',
                runtime: d.runtime || '',
                ip: d.ip || ''
            };
            data.upsUnits.push(unit);
            (d.protects || []).forEach(id => assign(byId.get(id), unit.id));
            migrated++;
        });
    }

    return { data, migrated };
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
