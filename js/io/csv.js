/**
 * Pure CSV helpers shared by import, export and the downloadable templates.
 * String in, string or array out - no DOM, no Blob, no download side effects.
 */

export const VALID_DEVICE_TYPES = [
    'router', 'firewall', 'switch', 'ap', 'server', 'vmhost', 'nas',
    'desktop', 'laptop', 'cellphone', 'tablet', 'printer', 'phone',
    'camera', 'iot', 'otherendpoint', 'storage', 'vpn'
];

export const VALID_STATUSES = [
    'online', 'offline', 'warning', 'retired', 'decommissioned'
];

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

export function escapeCSVCell(cell) {
    const str = String(cell == null ? '' : cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

export function rowsToCSV(headers, rows, comments) {
    let out = '';
    (comments || []).forEach(c => { out += c + '\n'; });
    out += headers.map(escapeCSVCell).join(',') + '\n';
    rows.forEach(r => { out += r.map(escapeCSVCell).join(',') + '\n'; });
    return out;
}

/** Parse a CSV body into row objects keyed by squashed lowercase header.
 *  Comment lines (#) and blanks are skipped. Rows whose Type is not a known
 *  device type are reported in `skipped` rather than silently dropped. */
export function parseCSVContent(content) {
    const lines = String(content).split('\n')
        .filter(l => l.trim() && !l.trim().startsWith('#'));
    if (lines.length < 2) return { rows: [], skipped: 0, headers: [] };

    const headers = parseCSVLine(lines[0]);
    const rows = [];
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === 0) continue;
        const row = {};
        headers.forEach((h, idx) => {
            row[h.toLowerCase().replace(/\s+/g, '')] = values[idx] || '';
        });
        if (row.type && VALID_DEVICE_TYPES.includes(row.type.toLowerCase())) {
            rows.push(row);
        } else {
            skipped++;
        }
    }
    return { rows, skipped, headers };
}

export function normalizeStatus(status) {
    const s = String(status || '').toLowerCase();
    return VALID_STATUSES.includes(s) ? s : 'online';
}
