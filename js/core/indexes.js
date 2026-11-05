/**
 * O(1) lookups for the render hot path.
 *
 * Redrawing connections used to call state.devices.find() twice per
 * connection and read offsetWidth/offsetHeight off the DOM each time, so a
 * single mousemove cost O(devices x connections) plus a layout read per
 * endpoint. This keeps the same answers in maps.
 *
 * Pure: holds only plain data, so it is testable without a DOM.
 */

const EMPTY = Object.freeze(new Set());

export function createSceneIndex() {
    const devicesById = new Map();
    const connsByDevice = new Map();   // deviceId -> Set<connection>
    const sizes = new Map();           // deviceId -> { width, height }

    function link(conn) {
        for (const id of [conn.from, conn.to]) {
            let set = connsByDevice.get(id);
            if (!set) connsByDevice.set(id, (set = new Set()));
            set.add(conn);
        }
    }

    return {
        /** Re-index everything. Measured sizes are kept: a state swap replaces
         *  the data, but a device of the same id renders at the same size. */
        rebuild(devices, connections) {
            devicesById.clear();
            connsByDevice.clear();
            (devices || []).forEach(d => devicesById.set(d.id, d));
            (connections || []).forEach(link);
        },

        device(id) { return devicesById.get(id); },
        addDevice(d) { devicesById.set(d.id, d); },

        removeDevice(id) {
            devicesById.delete(id);
            // Drop this device from its neighbours' sets too, or they keep
            // pointing at connections that no longer exist.
            (connsByDevice.get(id) || EMPTY).forEach(conn => {
                const other = conn.from === id ? conn.to : conn.from;
                const set = connsByDevice.get(other);
                if (set) set.delete(conn);
            });
            connsByDevice.delete(id);
            sizes.delete(id);
        },

        addConnection(conn) { link(conn); },

        removeConnection(conn) {
            [conn.from, conn.to].forEach(id => {
                const set = connsByDevice.get(id);
                if (set) set.delete(conn);
            });
        },

        /** Connections with this device at either end. */
        connectionsFor(deviceId) { return connsByDevice.get(deviceId) || EMPTY; },

        /** Union of the connections touching any of these devices. */
        connectionsForAny(deviceIds) {
            const out = new Set();
            deviceIds.forEach(id => {
                (connsByDevice.get(id) || EMPTY).forEach(c => out.add(c));
            });
            return out;
        },

        size(id) { return sizes.get(id); },
        setSize(id, width, height) { sizes.set(id, { width, height }); },
        invalidateSize(id) { sizes.delete(id); },
        clearSizes() { sizes.clear(); },

        get deviceCount() { return devicesById.size; },
        get sizeCacheCount() { return sizes.size; }
    };
}
