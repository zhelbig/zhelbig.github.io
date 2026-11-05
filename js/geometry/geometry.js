/**
 * Pure geometry for the canvas: grid snapping, connection anchor points,
 * SVG path construction, hit-testing maths, zoom/pan and bounding boxes.
 * No DOM and no app state - every input is passed in, so this is all
 * unit-testable without a browser.
 */

export const DEFAULT_GRID_SIZE = 20;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

/** Canvas is 8000x8000 with its origin offset to the middle. */
export const CANVAS_ORIGIN = 4000;

export function snapValue(value, gridSize = DEFAULT_GRID_SIZE, enabled = true) {
    if (!enabled) return value;
    return Math.round(value / gridSize) * gridSize;
}

/**
 * Anchor point for a connection on one edge of a device box.
 * Width/height are passed in so this stays free of layout reads.
 */
export function connectionPoint(device, position, width, height) {
    if (!device) return { x: 0, y: 0 };
    const centerX = device.x + width / 2;
    const centerY = device.y + height / 2;
    switch (position) {
        case 'top': return { x: centerX, y: device.y };
        case 'bottom': return { x: centerX, y: device.y + height };
        case 'left': return { x: device.x, y: centerY };
        case 'right': return { x: device.x + width, y: centerY };
        default: return { x: centerX, y: centerY };
    }
}

export function buildConnPath(from, to, fromPos, routingStyle, waypoints) {
    if (routingStyle === 'orthogonal') {
        if (waypoints && waypoints.length > 0) {
            return buildOrthoPathFromWaypoints(from, to, waypoints);
        }
        return buildOrthoPath(from, to, fromPos);
    }
    // Default: cubic bezier curved
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;
    if (fromPos === 'top' || fromPos === 'bottom') {
        return 'M' + from.x + ',' + from.y + ' C' + from.x + ',' + midY + ' ' + to.x + ',' + midY + ' ' + to.x + ',' + to.y;
    } else {
        return 'M' + from.x + ',' + from.y + ' C' + midX + ',' + from.y + ' ' + midX + ',' + to.y + ' ' + to.x + ',' + to.y;
    }
}

// Build path through explicit waypoints (all corners as [x,y] pairs)
export function buildOrthoPathFromWaypoints(from, to, waypoints) {
    let d = 'M' + from.x + ',' + from.y;
    waypoints.forEach(wp => { d += ' L' + wp.x + ',' + wp.y; });
    d += ' L' + to.x + ',' + to.y;
    return d;
}

// Build an orthogonal (right-angle) path between two points — single 90° L-shape
export function buildOrthoPath(from, to, fromPos) {
    const fx = from.x, fy = from.y, tx = to.x, ty = to.y;

    // Single 90° turn: L-shape with one corner
    if (fromPos === 'left' || fromPos === 'right') {
        // Horizontal first, then vertical — corner at (tx, fy)
        return 'M' + fx + ',' + fy +
               ' L' + tx + ',' + fy +
               ' L' + tx + ',' + ty;
    } else {
        // Vertical first, then horizontal — corner at (fx, ty)
        return 'M' + fx + ',' + fy +
               ' L' + fx + ',' + ty +
               ' L' + tx + ',' + ty;
    }
}

// Build the default waypoints array for an orthogonal connection (for editing)
export function getDefaultWaypoints(from, to, fromPos) {
    const fx = from.x, fy = from.y, tx = to.x, ty = to.y;

    // Single corner matching the auto-route
    if (fromPos === 'left' || fromPos === 'right') {
        return [{ x: tx, y: fy }];
    } else {
        return [{ x: fx, y: ty }];
    }
}

/** Which edge of a box a point is nearest, for drag-to-connect snapping. */
export function nearestEdge(relX, relY, width, height) {
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

export function clampZoom(zoom) {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

/** Pan adjustment that keeps the point under the cursor fixed while zooming. */
export function zoomPan(oldZoom, newZoom, mouseX, mouseY, panX, panY) {
    const ratio = newZoom / oldZoom;
    return {
        panX: mouseX - (mouseX - panX) * ratio,
        panY: mouseY - (mouseY - panY) * ratio
    };
}

/** Screen coordinates -> canvas coordinates for a palette drop. */
export function dropPosition(clientX, clientY, rectLeft, rectTop, panX, panY, zoom,
                             offsetX = 60, offsetY = 40) {
    return {
        x: (clientX - rectLeft - panX) / zoom + CANVAS_ORIGIN - offsetX,
        y: (clientY - rectTop - panY) / zoom + CANVAS_ORIGIN - offsetY
    };
}

/**
 * Bounding box over devices and zones. sizeOf(device) supplies {width,height}
 * so the caller owns any measurement.
 */
export function boundingBox(devices, zones, sizeOf) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (devices || []).forEach(d => {
        const { width, height } = sizeOf(d);
        minX = Math.min(minX, d.x);
        minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + width);
        maxY = Math.max(maxY, d.y + height);
    });
    (zones || []).forEach(z => {
        minX = Math.min(minX, z.x);
        minY = Math.min(minY, z.y);
        maxX = Math.max(maxX, z.x + z.width);
        maxY = Math.max(maxY, z.y + z.height);
    });
    return { minX, minY, maxX, maxY };
}

export function formatCount(count, singular) {
    return count + ' ' + singular + (count !== 1 ? 's' : '');
}
