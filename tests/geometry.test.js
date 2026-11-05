import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GRID_SIZE, MIN_ZOOM, MAX_ZOOM, CANVAS_ORIGIN,
  snapValue, connectionPoint, buildConnPath, buildOrthoPath,
  buildOrthoPathFromWaypoints, getDefaultWaypoints, nearestEdge,
  clampZoom, zoomPan, dropPosition, boundingBox, formatCount
} from '../js/geometry/geometry.js';

const box = { x: 100, y: 200 };
const W = 120, H = 90;

describe('snapValue', () => {
  it('rounds to the nearest grid multiple', () => {
    expect(snapValue(23, 20)).toBe(20);
    expect(snapValue(31, 20)).toBe(40);
  });
  it('passes the value through when snapping is off', () => {
    expect(snapValue(23, 20, false)).toBe(23);
  });
  it('handles negatives, which occur because the canvas origin is offset', () => {
    expect(snapValue(-23, 20)).toBe(-20);
  });
  it('defaults to a 20px grid', () => {
    expect(DEFAULT_GRID_SIZE).toBe(20);
    expect(snapValue(23)).toBe(20);
    expect(snapValue(31)).toBe(40);
  });
});

describe('connectionPoint', () => {
  it('anchors to the midpoint of each named edge', () => {
    expect(connectionPoint(box, 'top', W, H)).toEqual({ x: 160, y: 200 });
    expect(connectionPoint(box, 'bottom', W, H)).toEqual({ x: 160, y: 290 });
    expect(connectionPoint(box, 'left', W, H)).toEqual({ x: 100, y: 245 });
    expect(connectionPoint(box, 'right', W, H)).toEqual({ x: 220, y: 245 });
  });
  it('falls back to the centre for an unknown edge', () => {
    expect(connectionPoint(box, 'nonsense', W, H)).toEqual({ x: 160, y: 245 });
  });
  it('returns the origin rather than throwing on a missing device', () => {
    expect(connectionPoint(null, 'top', W, H)).toEqual({ x: 0, y: 0 });
  });
});

describe('buildConnPath', () => {
  const from = { x: 0, y: 0 }, to = { x: 100, y: 50 };

  it('curves horizontally when leaving a side edge', () => {
    expect(buildConnPath(from, to, 'right', 'curved')).toBe('M0,0 C50,0 50,50 100,50');
  });
  it('curves vertically when leaving a top/bottom edge', () => {
    expect(buildConnPath(from, to, 'bottom', 'curved')).toBe('M0,0 C0,25 100,25 100,50');
  });
  it('produces a single right-angle for orthogonal routes', () => {
    expect(buildConnPath(from, to, 'right', 'orthogonal')).toBe('M0,0 L100,0 L100,50');
    expect(buildConnPath(from, to, 'bottom', 'orthogonal')).toBe('M0,0 L0,50 L100,50');
  });
  it('threads explicit waypoints when present', () => {
    const wps = [{ x: 20, y: 0 }, { x: 20, y: 50 }];
    expect(buildConnPath(from, to, 'right', 'orthogonal', wps)).toBe('M0,0 L20,0 L20,50 L100,50');
  });
  it('ignores waypoints on a curved route', () => {
    expect(buildConnPath(from, to, 'right', 'curved', [{ x: 20, y: 0 }]))
      .toBe(buildConnPath(from, to, 'right', 'curved'));
  });
  it('treats an empty waypoint list as auto-routed', () => {
    expect(buildConnPath(from, to, 'right', 'orthogonal', []))
      .toBe(buildOrthoPath(from, to, 'right'));
  });
  it('always emits a path starting with a moveto', () => {
    for (const style of ['curved', 'orthogonal']) {
      for (const pos of ['top', 'bottom', 'left', 'right']) {
        expect(buildConnPath(from, to, pos, style)).toMatch(/^M/);
      }
    }
  });
});

describe('getDefaultWaypoints', () => {
  const from = { x: 0, y: 0 }, to = { x: 100, y: 50 };
  it('yields the corner that matches the auto-routed path', () => {
    expect(getDefaultWaypoints(from, to, 'right')).toEqual([{ x: 100, y: 0 }]);
    expect(getDefaultWaypoints(from, to, 'bottom')).toEqual([{ x: 0, y: 50 }]);
  });
  it('reproduces the auto-route when fed back in', () => {
    for (const pos of ['top', 'bottom', 'left', 'right']) {
      expect(buildOrthoPathFromWaypoints(from, to, getDefaultWaypoints(from, to, pos)))
        .toBe(buildOrthoPath(from, to, pos));
    }
  });
});

describe('nearestEdge', () => {
  it('picks the closest edge of a 100x100 box', () => {
    expect(nearestEdge(50, 5, 100, 100)).toBe('top');
    expect(nearestEdge(50, 95, 100, 100)).toBe('bottom');
    expect(nearestEdge(5, 50, 100, 100)).toBe('left');
    expect(nearestEdge(95, 50, 100, 100)).toBe('right');
  });
  it('always returns a real edge, including at the exact centre', () => {
    const edges = ['top', 'bottom', 'left', 'right'];
    expect(edges).toContain(nearestEdge(50, 50, 100, 100));
    expect(edges).toContain(nearestEdge(0, 0, 100, 100));
  });
});

describe('zoom', () => {
  it('clamps to the supported range', () => {
    expect(clampZoom(10)).toBe(MAX_ZOOM);
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(1.5)).toBe(1.5);
  });
  it('keeps the point under the cursor fixed', () => {
    const mouseX = 400;
    const after = zoomPan(1, 2, mouseX, 300, 0, 0);
    const worldX = (mouseX - 0) / 1;
    expect(worldX * 2 + after.panX).toBeCloseTo(mouseX, 6);
  });
  it('is a no-op when the zoom does not change', () => {
    expect(zoomPan(1, 1, 400, 300, 25, 50)).toEqual({ panX: 25, panY: 50 });
  });
});

describe('dropPosition', () => {
  it('maps a screen point into canvas space around the origin', () => {
    expect(dropPosition(60, 40, 0, 0, 0, 0, 1)).toEqual({ x: CANVAS_ORIGIN, y: CANVAS_ORIGIN });
  });
  it('accounts for pan and zoom', () => {
    const p = dropPosition(260, 240, 0, 0, 100, 100, 2);
    expect(p.x).toBe((260 - 100) / 2 + CANVAS_ORIGIN - 60);
    expect(p.y).toBe((240 - 100) / 2 + CANVAS_ORIGIN - 40);
  });
});

describe('boundingBox', () => {
  const sizeOf = () => ({ width: 100, height: 50 });
  it('covers every device', () => {
    expect(boundingBox([{ x: 0, y: 0 }, { x: 200, y: 100 }], [], sizeOf))
      .toEqual({ minX: 0, minY: 0, maxX: 300, maxY: 150 });
  });
  it('includes zones, which carry their own dimensions', () => {
    expect(boundingBox([{ x: 500, y: 500 }], [{ x: 0, y: 0, width: 80, height: 40 }], sizeOf))
      .toEqual({ minX: 0, minY: 0, maxX: 600, maxY: 550 });
  });
  it('tolerates a zone-only diagram', () => {
    expect(boundingBox([], [{ x: 10, y: 20, width: 30, height: 40 }], sizeOf))
      .toEqual({ minX: 10, minY: 20, maxX: 40, maxY: 60 });
  });
});

describe('formatCount', () => {
  it('pluralises everything except one', () => {
    expect(formatCount(0, 'device')).toBe('0 devices');
    expect(formatCount(1, 'device')).toBe('1 device');
    expect(formatCount(2, 'device')).toBe('2 devices');
  });
});
