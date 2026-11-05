/**
 * Device search.
 *
 * With fifty devices on an 8000x8000 canvas there was no way to find one
 * short of panning around reading 10px labels. Matching is pure so the
 * ranking is testable on its own.
 */

/** Where a term matched, best first. The order here is the ranking. */
const FIELD_WEIGHTS = [
    { key: 'name',  exact: 100, prefix: 60, contains: 30 },
    { key: 'ip',    exact: 90,  prefix: 50, contains: 25 },
    { key: 'type',  exact: 40,  prefix: 20, contains: 10 },
    { key: 'model', exact: 30,  prefix: 15, contains: 8 },
    { key: 'mac',   exact: 30,  prefix: 15, contains: 8 },
    { key: 'serial', exact: 30, prefix: 15, contains: 8 }
];

function fieldScore(value, term, weights) {
    if (!value) return 0;
    const v = String(value).toLowerCase();
    if (v === term) return weights.exact;
    if (v.startsWith(term)) return weights.prefix;
    if (v.includes(term)) return weights.contains;
    return 0;
}

/**
 * Score one device against one term. A term that matches nothing scores 0,
 * which disqualifies the device: every term must match something, so
 * "core switch" finds a switch named Core rather than everything matching
 * either word.
 */
function termScore(device, term, typeLabel) {
    let best = 0;
    for (const w of FIELD_WEIGHTS) {
        best = Math.max(best, fieldScore(device[w.key], term, w));
    }
    // The human-readable type ("Access Point") as well as the key ("ap").
    best = Math.max(best, fieldScore(typeLabel, term, FIELD_WEIGHTS[2]));
    return best;
}

/**
 * @param {Array} devices
 * @param {string} query            space-separated terms, all must match
 * @param {(type: string) => string} [labelOf]  type key -> display name
 * @returns {Array} matching devices, best match first
 */
export function matchDevices(devices, query, labelOf) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const terms = q.split(/\s+/);

    const scored = [];
    for (const device of devices || []) {
        const typeLabel = labelOf ? labelOf(device.type) : device.type;
        let total = 0;
        let every = true;
        for (const term of terms) {
            const s = termScore(device, term, typeLabel);
            if (s === 0) { every = false; break; }
            total += s;
        }
        if (every) scored.push({ device, total });
    }

    scored.sort((a, b) =>
        b.total - a.total ||
        String(a.device.name || '').localeCompare(String(b.device.name || '')));
    return scored.map(s => s.device);
}

/** One-line summary under a result: IP if known, else the type. */
export function describeDevice(device, typeLabel) {
    const bits = [];
    if (device.ip) bits.push(device.ip);
    bits.push(typeLabel || device.type);
    if (device.model) bits.push(device.model);
    return bits.join('  ·  ');
}
