/**
 * Brand colour access. The only module in core/ that touches the DOM:
 * it reads CSS custom properties so each shell can theme independently.
 */

// Brand colours live in CSS custom properties so each shell can theme
// itself; JS reads them from the computed root style instead of keeping
// its own copy of the hex. This is the only non-pure thing in core/.
const _themeCache = {};
export function themeColor(token, fallback) {
    if (_themeCache[token] === undefined) {
        const v = getComputedStyle(document.documentElement)
            .getPropertyValue('--' + token).trim();
        _themeCache[token] = v || fallback;
    }
    return _themeCache[token];
}

// Wired tracks the brand token. Wireless and VPN are app semantics,
// not branding, so they carry their own fixed colours.
export const CONN_COLORS = {
    wireless: { solid: '#c084fc', rgb: '192,132,252', label: 'Wireless' },
    vpn:      { solid: '#d4a017', rgb: '212,160,23',  label: 'VPN' }
};

export function connColor(type) {
    const spec = CONN_COLORS[type];
    return spec ? spec.solid : themeColor('primary', '#0F71F0');
}
