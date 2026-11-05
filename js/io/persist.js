/**
 * Autosave to a key-value store.
 *
 * The tool had no persistence at all: closing the tab, a crash or an
 * accidental Ctrl+W lost everything, with the only save path being a manual
 * JSON download. This keeps a rolling copy so a reload can offer it back.
 *
 * Storage is injected, so the logic is testable without localStorage and
 * degrades cleanly when storage is unavailable (private browsing, blocked
 * cookies, quota exhausted).
 */

export const AUTOSAVE_VERSION = 1;

/** Well past any realistic diagram, well inside a typical 5MB quota. */
export const MAX_AUTOSAVE_BYTES = 3 * 1024 * 1024;

/** Each shell gets its own slot so the two mappers never overwrite each other. */
export function autosaveKey(shellId) {
    return 'netmapper:autosave:' + shellId;
}

export function createAutosave({ storage, key, maxBytes = MAX_AUTOSAVE_BYTES, now = Date.now }) {
    function available() {
        return !!storage;
    }

    return {
        /** @returns {{ok: boolean, reason?: string, bytes?: number}} */
        write(stateJson, meta = {}) {
            if (!available()) return { ok: false, reason: 'unavailable' };
            const payload = JSON.stringify({
                v: AUTOSAVE_VERSION,
                savedAt: now(),
                meta,
                state: stateJson
            });
            if (payload.length > maxBytes) {
                return { ok: false, reason: 'too-large', bytes: payload.length };
            }
            try {
                storage.setItem(key, payload);
                return { ok: true, bytes: payload.length };
            } catch (err) {
                // Quota or a storage-blocking browser setting. Autosave is a
                // convenience; never let it break the session.
                return { ok: false, reason: 'write-failed' };
            }
        },

        /** @returns {{ok: boolean, reason?: string, stateJson?: string,
         *             savedAt?: number, meta?: object}} */
        read() {
            if (!available()) return { ok: false, reason: 'unavailable' };
            let raw;
            try {
                raw = storage.getItem(key);
            } catch (err) {
                return { ok: false, reason: 'read-failed' };
            }
            if (!raw) return { ok: false, reason: 'empty' };

            let parsed;
            try {
                parsed = JSON.parse(raw);
            } catch (err) {
                return { ok: false, reason: 'corrupt' };
            }
            if (!parsed || parsed.v !== AUTOSAVE_VERSION) {
                return { ok: false, reason: 'version' };
            }
            if (typeof parsed.state !== 'string') {
                return { ok: false, reason: 'corrupt' };
            }
            return {
                ok: true,
                stateJson: parsed.state,
                savedAt: parsed.savedAt,
                meta: parsed.meta || {}
            };
        },

        clear() {
            if (!available()) return;
            try { storage.removeItem(key); } catch (err) { /* nothing to do */ }
        }
    };
}

/** Does a snapshot actually contain work worth offering back? */
export function hasContent(stateJson) {
    try {
        const s = JSON.parse(stateJson);
        return (s.devices && s.devices.length > 0) || (s.zones && s.zones.length > 0);
    } catch (err) {
        return false;
    }
}

/** "just now" / "4 minutes ago" / "2 hours ago" / a date. */
export function describeAge(savedAt, now = Date.now()) {
    const secs = Math.max(0, Math.round((now - savedAt) / 1000));
    if (secs < 45) return 'just now';
    const mins = Math.round(secs / 60);
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    const hours = Math.round(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    return new Date(savedAt).toLocaleString();
}
