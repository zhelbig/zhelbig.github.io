/**
 * The SVG connection layer.
 *
 * Keeps one <g> per connection and mutates its `d` attributes, instead of
 * rebuilding svg.innerHTML from a string on every frame. The old approach
 * destroyed and re-parsed every path on each mousemove, which also meant
 * re-attaching listeners and, in eraser mode, deleting the very node the
 * cursor was over - that re-fired mouseenter and rebuilt again, in a loop.
 *
 * Each group carries an always-present transparent `conn-hit` path, so
 * click targets need no extra DOM when a mode turns interaction on; the
 * modes only flip a class on the root.
 */

const NS = 'http://www.w3.org/2000/svg';

function path(cls) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('class', cls);
    return p;
}

export function createConnectionLayer(svg) {
    const groups = new Map();  // connId -> { g, hit, main, outline, type }
    let overlay = null;

    function build(conn) {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'conn');
        g.dataset.connId = conn.id;
        g.dataset.type = conn.type;

        const hit = path('conn-hit');
        g.appendChild(hit);

        // VPN draws a translucent sleeve under the line to read as a tunnel.
        const outline = conn.type === 'vpn' ? path('conn-vpn-outline') : null;
        if (outline) g.appendChild(outline);

        const main = path('conn-' + conn.type);
        g.appendChild(main);

        svg.appendChild(g);
        const entry = { g, hit, main, outline, type: conn.type };
        groups.set(conn.id, entry);
        return entry;
    }

    function entryFor(conn) {
        const existing = groups.get(conn.id);
        // A type change swaps which paths the group needs, so rebuild it.
        if (existing && existing.type === conn.type) return existing;
        if (existing) { existing.g.remove(); groups.delete(conn.id); }
        return build(conn);
    }

    function setPath(entry, d) {
        entry.hit.setAttribute('d', d);
        entry.main.setAttribute('d', d);
        if (entry.outline) entry.outline.setAttribute('d', d);
    }

    return {
        /** Reconcile to exactly this set of connections and set every path. */
        render(connections, pathOf) {
            const live = new Set();
            connections.forEach(conn => {
                live.add(conn.id);
                const entry = entryFor(conn);
                entry.g.dataset.ortho = conn.routingStyle === 'orthogonal' ? '1' : '0';
                setPath(entry, pathOf(conn));
            });
            groups.forEach((entry, id) => {
                if (!live.has(id)) { entry.g.remove(); groups.delete(id); }
            });
            if (overlay) svg.appendChild(overlay);  // keep the preview on top
        },

        /** Update only these connections - the drag path, where everything
         *  else on the canvas is unchanged. */
        updatePaths(connections, pathOf) {
            connections.forEach(conn => {
                const entry = groups.get(conn.id);
                if (entry) setPath(entry, pathOf(conn));
            });
        },

        /** Mark one connection as the one being route-edited. */
        setEditing(connId) {
            groups.forEach((entry, id) => {
                entry.g.classList.toggle('editing', id === connId);
            });
        },

        /** The dashed line that follows the cursor while drawing a link. */
        showOverlay(d, stroke, width) {
            if (!overlay) {
                overlay = path('conn-overlay');
                svg.appendChild(overlay);
            }
            overlay.setAttribute('d', d);
            overlay.setAttribute('stroke', stroke);
            overlay.setAttribute('stroke-width', width);
        },

        hideOverlay() {
            if (overlay) { overlay.remove(); overlay = null; }
        },

        clear() {
            groups.forEach(entry => entry.g.remove());
            groups.clear();
            this.hideOverlay();
        },

        get count() { return groups.size; }
    };
}
