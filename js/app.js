/**
 * Network mapper - application entry point.
 *
 * Loaded by every shell (i-tech-network-mapper.html, network-mapper.html).
 * The shells differ only in their :root theme tokens, their font link and
 * their branding; all behaviour lives here and in the modules under js/.
 */

import {
    createInitialState, serializeState, applySnapshot,
    highestNameIndex, resolveCounters, nextId, migrateUpsZones
} from './core/state.js';
import { createHistory } from './core/history.js';
import {
    types, zoneTypes, manufacturers, operatingSystems,
    svgDefs, getSvgIcon, getSvgIconSidebar
} from './core/types.js';
import { themeColor, connColor, CONN_COLORS } from './core/theme.js';
import {
    DEFAULT_GRID_SIZE, CANVAS_ORIGIN, snapValue, connectionPoint,
    buildConnPath, buildOrthoPath, buildOrthoPathFromWaypoints,
    getDefaultWaypoints, nearestEdge, clampZoom, zoomPan,
    dropPosition, boundingBox, formatCount, safeExportScale
} from './geometry/geometry.js';
import {
    parseCSVLine, escapeCSVCell, parseCSVContent, normalizeStatus
} from './io/csv.js';
import { mountChrome } from './ui/layout.js';
import { createSceneIndex } from './core/indexes.js';
import { createFrameScheduler } from './render/scheduler.js';
import { createConnectionLayer } from './render/connection-layer.js';
import { createToaster } from './ui/toast.js';
import { matchDevices, describeDevice } from './core/search.js';
import { createAutosave, autosaveKey, hasContent, describeAge } from './io/persist.js';

// The chrome is injected before anything else runs: the element lookups
// further down this file, and every getElementById inside the handlers,
// depend on it already being in the document.
mountChrome();

const state = createInitialState();
const history = createHistory();

function getStateSnapshot() {
    return serializeState(state);
}

function pushSnapshot(snap) {
    scheduleAutosave();
    history.push(snap);
    updateUndoRedoBtns();
}

function saveState() {
    commitPendingSnapshot();
    pushSnapshot(getStateSnapshot());
}

// Property edits fire once per keystroke. Capture the state as it was
// before the burst began and commit it once typing settles, so a field
// edit is one undo step instead of none.
let pendingSnapshot = null;
let pendingSnapshotTimer = null;
const SNAPSHOT_DEBOUNCE_MS = 600;

function saveStateDebounced() {
    if (pendingSnapshot === null) pendingSnapshot = getStateSnapshot();
    clearTimeout(pendingSnapshotTimer);
    pendingSnapshotTimer = setTimeout(commitPendingSnapshot, SNAPSHOT_DEBOUNCE_MS);
}

function commitPendingSnapshot() {
    clearTimeout(pendingSnapshotTimer);
    pendingSnapshotTimer = null;
    if (pendingSnapshot === null) return;
    const snap = pendingSnapshot;
    pendingSnapshot = null;
    // Discard if the burst left the state unchanged (e.g. type then undo the typing).
    if (snap !== getStateSnapshot()) pushSnapshot(snap);
}

// Records an undo step for an in-place geometry change (drag, resize)
// without paying for a snapshot on every mousedown: revert to the old
// values, snapshot, then put the new values back.
function pushUndoForGeometryChange(revert, reapply) {
    commitPendingSnapshot();
    revert();
    const snap = getStateSnapshot();
    reapply();
    pushSnapshot(snap);
}

function restoreSnapshot(snapshot) {
    scheduleAutosave();
    applySnapshot(state, snapshot);
    rerenderEverything();
    refreshAllPowerTags();
}

function undo() {
    commitPendingSnapshot();
    const snap = history.undo(getStateSnapshot());
    if (snap === null) return;
    restoreSnapshot(snap);
    updateUndoRedoBtns();
}

function redo() {
    commitPendingSnapshot();
    const snap = history.redo(getStateSnapshot());
    if (snap === null) return;
    restoreSnapshot(snap);
    updateUndoRedoBtns();
}

function updateUndoRedoBtns() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    if (undoBtn) undoBtn.disabled = !history.canUndo();
    if (redoBtn) redoBtn.disabled = !history.canRedo();
}

const canvasArea = document.getElementById('canvasArea');
const canvasWrapper = document.getElementById('canvasWrapper');
const canvasGrid = document.getElementById('canvasGrid');
const canvas = document.getElementById('canvas');
const svg = document.getElementById('connections');
const connHint = document.getElementById('connHint');

const sceneIndex = createSceneIndex();
const scheduler = createFrameScheduler();
const connLayer = createConnectionLayer(svg);
const toast = createToaster(document.getElementById('toastHost'));

/**
 * Autosave. Keyed per shell so the two mappers never overwrite each other,
 * and wrapped so a browser with storage disabled simply does without.
 */
const SHELL_ID = document.documentElement.dataset.shell
    || location.pathname.split('/').pop().replace(/\.html$/, '')
    || 'mapper';

let storageBackend = null;
try {
    // Touching localStorage throws outright in some privacy modes.
    localStorage.setItem('netmapper:probe', '1');
    localStorage.removeItem('netmapper:probe');
    storageBackend = localStorage;
} catch (err) {
    storageBackend = null;
}

const autosave = createAutosave({ storage: storageBackend, key: autosaveKey(SHELL_ID) });

const AUTOSAVE_DEBOUNCE_MS = 1200;
let autosaveTimer = null;
let autosaveWarned = false;
/** Changes made since the last explicit save-to-file. */
let unsavedSinceExport = false;

function scheduleAutosave() {
    unsavedSinceExport = true;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(writeAutosave, AUTOSAVE_DEBOUNCE_MS);
}

function writeAutosave() {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    const result = autosave.write(serializeState(state), {
        client: document.getElementById('clientName')?.value || '',
        site: document.getElementById('siteName')?.value || ''
    });
    // Say so once, rather than on every keystroke, and never block.
    if (!result.ok && !autosaveWarned && result.reason !== 'unavailable') {
        autosaveWarned = true;
        toast.show(
            result.reason === 'too-large'
                ? 'This diagram is too large to autosave. Use Save Project to keep a copy.'
                : 'Autosave is unavailable in this browser. Use Save Project to keep a copy.',
            { type: 'warn', duration: 9000 }
        );
    }
}

function offerAutosaveRestore() {
    const found = autosave.read();
    if (!found.ok || !hasContent(found.stateJson)) return;
    // Offered, not applied: silently replacing a deliberate fresh start
    // would be worse than the problem it solves.
    toast.show('Unsaved work from ' + describeAge(found.savedAt) + ' was found.', {
        type: 'info',
        duration: 0,
        action: {
            label: 'Restore',
            onClick: () => {
                saveState();
                const { data } = migrateUpsZones(JSON.parse(found.stateJson));
                applySnapshot(state, data);
                if (found.meta.client) document.getElementById('clientName').value = found.meta.client;
                if (found.meta.site) document.getElementById('siteName').value = found.meta.site;
                rerenderEverything();
                refreshAllPowerTags();
                toast.show('Restored.', { type: 'success' });
            }
        }
    });
}

/** Tear down and rebuild every rendered object from state. */
function rerenderEverything() {
    deselectAll();
    document.querySelectorAll('.network-device').forEach(el => el.remove());
    document.querySelectorAll('.network-zone').forEach(el => el.remove());
    state.devices.forEach(d => renderDevice(d));
    state.zones.forEach(z => renderZone(z));
    drawConnections();
    updateVlanSelect();
    updateNetworkInfoBox();
    updateUpsBox();
    updateCounts();
    document.getElementById('emptyState').style.display =
        (state.devices.length === 0 && state.zones.length === 0) ? 'block' : 'none';
}

/**
 * One listener for the whole layer, instead of three per connection
 * re-attached on every redraw. The old eraser rebuilt the SVG on mouseleave,
 * which destroyed the node under the cursor, re-fired mouseenter against its
 * replacement and rebuilt again - a loop that ran for as long as the pointer
 * rested on a line.
 */
svg.addEventListener('click', e => {
    const g = e.target.closest('g[data-conn-id]');
    if (!g) return;
    const conn = state.connections.find(c => c.id === g.dataset.connId);
    if (!conn) return;
    e.stopPropagation();

    if (eraserMode) {
        saveState();
        const idx = state.connections.indexOf(conn);
        state.connections.splice(idx, 1);
        sceneIndex.removeConnection(conn);
        updateCounts();
        if (state.selected) renderConnectedToList(state.selected);
        drawConnections();
        return;
    }

    if (editRouteMode && conn.routingStyle === 'orthogonal') {
        editingConn = conn;
        if (!conn.waypoints || conn.waypoints.length === 0) {
            conn.waypoints = getDefaultWaypoints(
                getConnectionPoint(conn.from, conn.fromPos),
                getConnectionPoint(conn.to, conn.toPos),
                conn.fromPos
            );
        }
        drawConnections();
    }
});

/** Interaction modes are a class on the layer, so switching one on costs
 *  nothing and rebuilds nothing. */
function setLayerMode() {
    svg.classList.toggle('erasing', eraserMode);
    svg.classList.toggle('route-edit', editRouteMode);
    svg.style.pointerEvents = (eraserMode || editRouteMode) ? 'all' : 'none';
}

function openModal(id) { document.getElementById(id).classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function updateNetworkInfoBox() {
    document.getElementById('infoDnsProvider').textContent = state.config.dnsProvider;
    document.getElementById('infoDnsPrimary').textContent = state.config.dnsPrimary;
    document.getElementById('infoDnsSecondary').textContent = state.config.dnsSecondary;
    document.getElementById('infoDhcp').textContent = state.config.dhcpType;
    document.getElementById('infoVlans').innerHTML = state.vlans.length > 0 
        ? state.vlans.map(v => '<span class="vlan-tag">VLAN ' + v.id + ' - ' + v.subnet + '</span>').join('')
        : '<span style="color:var(--text-muted);font-size:0.6rem;">None configured</span>';
    document.getElementById('infoSSIDs').innerHTML = state.ssids.length > 0 
        ? state.ssids.map(s => '<span class="vlan-tag">' + s.name + '</span>').join('')
        : '<span style="color:var(--text-muted);font-size:0.6rem;">None configured</span>';
}

// Pan and zoom state
let isPanning = false;
let panStart = { x: 0, y: 0 };
let draggingDevice = null;
/** Other selected devices riding along with the one under the cursor. */
let dragGroup = [];
/** Devices contained by the zone being dragged. */
let zoneDragGroup = [];
/** Shift-drag rubber band: {x, y} canvas-space anchor, or null. */
let marqueeStart = null;
/**
 * Set when a drag actually moved something, so the click that follows the
 * release is not also treated as a selection. Without this, dragging a
 * multi-selection collapses it to the one device under the cursor.
 */
let suppressNextClick = false;
let dragStart = { x: 0, y: 0 };
let deviceStart = { x: 0, y: 0 };

// Drag connection state
let isDraggingConnection = false;
let dragConnStart = { device: null, pos: null, x: 0, y: 0 };
let dragConnCurrent = { x: 0, y: 0 };

// Zone drag and resize state
let draggingZone = null;
let zoneStart = { x: 0, y: 0 };
let resizingZone = null;
let resizeStart = { x: 0, y: 0, w: 0, h: 0 };

// Grid snapping
const GRID_SIZE = DEFAULT_GRID_SIZE; // matches .canvas-grid background-size
let snapToGrid = true;

function snapToGridValue(value) {
    return snapValue(value, GRID_SIZE, snapToGrid);
}

function applyTransform() {
    const transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    canvasWrapper.style.transform = transform;
    canvasGrid.style.transform = transform;
    document.getElementById('zoomLevel').textContent = Math.round(state.zoom * 100) + '%';
}

function resetView() {
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    applyTransform();
}

document.addEventListener('DOMContentLoaded', function() {
    // Device drag from palette
    document.querySelectorAll('.device-item:not(.zone-item)').forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('type', item.dataset.type);
            e.dataTransfer.setData('itemType', 'device');
        });
    });

    // Zone drag from palette
    document.querySelectorAll('.zone-item').forEach(item => {
        item.addEventListener('dragstart', e => {
            e.dataTransfer.setData('zone', item.dataset.zone);
            e.dataTransfer.setData('itemType', 'zone');
        });
    });

    // Clicking empty canvas deselects. Previously the properties panel could
    // only be dismissed with Escape.
    canvasArea.addEventListener('click', function(e) {
        if (suppressNextClick) { suppressNextClick = false; return; }
        if (e.shiftKey) return;
        const onEmptySpace = e.target === canvasArea || e.target === canvasGrid ||
            (e.target.closest('#canvasWrapper') && !e.target.closest('.network-device') && !e.target.closest('.network-zone'));
        if (onEmptySpace && !state.connecting) deselectAll();
    });

    canvasArea.addEventListener('dragover', e => e.preventDefault());
    canvasArea.addEventListener('drop', function(e) {
        e.preventDefault();
        const itemType = e.dataTransfer.getData('itemType');
        const rect = canvasArea.getBoundingClientRect();
        const raw = dropPosition(e.clientX, e.clientY, rect.left, rect.top,
                                 state.panX, state.panY, state.zoom);
        const x = snapToGridValue(raw.x);
        const y = snapToGridValue(raw.y);

        if (itemType === 'zone') {
            const zoneType = e.dataTransfer.getData('zone');
            if (zoneType) {
                createZone(zoneType, x, y);
            }
        } else {
            const type = e.dataTransfer.getData('type');
            if (type) {
                createDevice(type, x, y);
            }
        }
    });

    // Pan functionality - mousedown on canvas area
    canvasArea.addEventListener('mousedown', function(e) {
        const onEmptySpace = e.target === canvasArea || e.target === canvasGrid ||
            (e.target.closest('#canvasWrapper') && !e.target.closest('.network-device') && !e.target.closest('.network-zone'));
        if (!onEmptySpace) return;

        if (e.shiftKey) {
            // Shift is the selection modifier everywhere else in the tool, so
            // shift-drag selects. Plain drag still pans, as the hint says.
            marqueeStart = canvasPointFromEvent(e);
            canvasArea.classList.add('marqueeing');
            e.preventDefault();
            return;
        }

        isPanning = true;
        panStart.x = e.clientX - state.panX;
        panStart.y = e.clientY - state.panY;
        canvasArea.classList.add('panning');
        e.preventDefault();
    });

    document.addEventListener('mousemove', function(e) {
        if (marqueeStart) {
            const now = canvasPointFromEvent(e);
            drawMarquee(marqueeStart, now);
        }
        if (isPanning) {
            state.panX = e.clientX - panStart.x;
            state.panY = e.clientY - panStart.y;
            applyTransform();
        }
        if (draggingDevice) {
            const dx = (e.clientX - dragStart.x) / state.zoom;
            const dy = (e.clientY - dragStart.y) / state.zoom;
            draggingDevice.x = snapToGridValue(deviceStart.x + dx);
            draggingDevice.y = snapToGridValue(deviceStart.y + dy);
            const el = document.getElementById(draggingDevice.id);
            el.style.left = draggingDevice.x + 'px';
            el.style.top = draggingDevice.y + 'px';
            scheduleDeviceRedraw(draggingDevice.id);

            // The rest of the selection moves by the same snapped delta, so
            // relative spacing survives the drag.
            const moveX = draggingDevice.x - deviceStart.x;
            const moveY = draggingDevice.y - deviceStart.y;
            dragGroup.forEach(entry => {
                entry.device.x = entry.x + moveX;
                entry.device.y = entry.y + moveY;
                const other = document.getElementById(entry.device.id);
                if (other) {
                    other.style.left = entry.device.x + 'px';
                    other.style.top = entry.device.y + 'px';
                }
                scheduleDeviceRedraw(entry.device.id);
            });
        }
        if (draggingZone) {
            const dx = (e.clientX - dragStart.x) / state.zoom;
            const dy = (e.clientY - dragStart.y) / state.zoom;
            draggingZone.x = snapToGridValue(zoneStart.x + dx);
            draggingZone.y = snapToGridValue(zoneStart.y + dy);
            const el = document.getElementById(draggingZone.id);
            el.style.left = draggingZone.x + 'px';
            el.style.top = draggingZone.y + 'px';

            const moveX = draggingZone.x - zoneStart.x;
            const moveY = draggingZone.y - zoneStart.y;
            zoneDragGroup.forEach(entry => {
                entry.device.x = entry.x + moveX;
                entry.device.y = entry.y + moveY;
                const dev = document.getElementById(entry.device.id);
                if (dev) {
                    dev.style.left = entry.device.x + 'px';
                    dev.style.top = entry.device.y + 'px';
                }
                scheduleDeviceRedraw(entry.device.id);
            });
        }
        if (resizingZone) {
            const dx = (e.clientX - resizeStart.x) / state.zoom;
            const dy = (e.clientY - resizeStart.y) / state.zoom;
            resizingZone.width = Math.max(150, snapToGridValue(resizeStart.w + dx));
            resizingZone.height = Math.max(100, snapToGridValue(resizeStart.h + dy));
            const el = document.getElementById(resizingZone.id);
            el.style.width = resizingZone.width + 'px';
            el.style.height = resizingZone.height + 'px';
        }
        if (isDraggingConnection) {
            const rect = canvasArea.getBoundingClientRect();
            // Convert screen coords to canvas coords
            dragConnCurrent.x = (e.clientX - rect.left - state.panX) / state.zoom + 4000;
            dragConnCurrent.y = (e.clientY - rect.top - state.panY) / state.zoom + 4000;
            scheduler.schedule('drag-preview', drawConnectionsWithDrag);
        }
    });

    document.addEventListener('mouseup', function(e) {
        if (isPanning) {
            isPanning = false;
            canvasArea.classList.remove('panning');
        }
        if (marqueeStart) {
            const rect = marqueeRect(marqueeStart, canvasPointFromEvent(e));
            marqueeStart = null;
            canvasArea.classList.remove('marqueeing');
            document.getElementById('marquee').hidden = true;
            // A shift-click with no drag should not wipe the selection.
            if (rect.width > 3 || rect.height > 3) {
                const hits = devicesIntersecting(rect).map(d => d.id);
                setSelection([...new Set([...selection, ...hits])]);
            }
        }

        if (draggingDevice || draggingZone || resizingZone || isDraggingConnection) {
            scheduler.flushNow();
        }
        if (draggingDevice) {
            const moved = [
                { device: draggingDevice, x: deviceStart.x, y: deviceStart.y },
                ...dragGroup
            ].filter(e => e.device.x !== e.x || e.device.y !== e.y);

            if (moved.length) {
                suppressNextClick = true;
                // One undo step for the gesture, not one per device.
                const after = moved.map(e => ({ device: e.device, x: e.device.x, y: e.device.y }));
                pushUndoForGeometryChange(
                    () => moved.forEach(e => { e.device.x = e.x; e.device.y = e.y; }),
                    () => after.forEach(e => { e.device.x = e.x; e.device.y = e.y; })
                );
            }
            draggingDevice = null;
            dragGroup = [];
            canvasArea.classList.remove('dragging-device');
        }
        if (draggingZone) {
            const z = draggingZone;
            const movedZone = z.x !== zoneStart.x || z.y !== zoneStart.y;
            if (movedZone) {
                suppressNextClick = true;
                const before = [
                    { obj: z, x: zoneStart.x, y: zoneStart.y },
                    ...zoneDragGroup.map(e => ({ obj: e.device, x: e.x, y: e.y }))
                ];
                const after = before.map(e => ({ obj: e.obj, x: e.obj.x, y: e.obj.y }));
                // The zone and its contents are one move, so one undo step.
                pushUndoForGeometryChange(
                    () => before.forEach(e => { e.obj.x = e.x; e.obj.y = e.y; }),
                    () => after.forEach(e => { e.obj.x = e.x; e.obj.y = e.y; })
                );
            }
            draggingZone = null;
            zoneDragGroup = [];
        }
        if (resizingZone) {
            const z = resizingZone;
            const ow = resizeStart.w, oh = resizeStart.h;
            if (z.width !== ow || z.height !== oh) {
                const nw = z.width, nh = z.height;
                pushUndoForGeometryChange(
                    () => { z.width = ow; z.height = oh; },
                    () => { z.width = nw; z.height = nh; }
                );
            }
            resizingZone = null;
        }
        if (isDraggingConnection) {
            const source = dragConnStart.device;
            const sourcePos = dragConnStart.pos;
            const target = findDeviceAtPoint(e.clientX, e.clientY);

            // Tear the drag down before anything else, so the preview goes
            // whether the release landed on a device, on the source, or on
            // empty canvas.
            endConnectionDrag();

            if (target && target.device.id !== source.id) {
                const exists = state.connections.some(c =>
                    (c.from === source.id && c.to === target.device.id) ||
                    (c.from === target.device.id && c.to === source.id)
                );
                if (exists) {
                    // Previously this did nothing at all, which read as the
                    // drag having failed.
                    toast.show(source.name + ' and ' + target.device.name +
                        ' are already connected.', { type: 'warn' });
                } else {
                    saveState();
                    const conn = {
                        id: nextId('conn'),
                        from: source.id,
                        fromPos: sourcePos,
                        to: target.device.id,
                        toPos: target.pos,
                        type: state.connType,
                        routingStyle: state.routingStyle
                    };
                    state.connections.push(conn);
                    sceneIndex.addConnection(conn);
                    updateCounts();
                    if (state.selected &&
                        (state.selected.id === target.device.id || state.selected.id === source.id)) {
                        renderConnectedToList(state.selected);
                    }
                }
            }
            drawConnections();
        }
    });

    // Scroll to zoom
    canvasArea.addEventListener('wheel', function(e) {
        e.preventDefault();
        const rect = canvasArea.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const oldZoom = state.zoom;
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        state.zoom = clampZoom(state.zoom + delta);

        // Keep the point under the cursor fixed while zooming
        const panned = zoomPan(oldZoom, state.zoom, mouseX, mouseY, state.panX, state.panY);
        state.panX = panned.panX;
        state.panY = panned.panY;

        applyTransform();
    }, { passive: false });

    // Buttons
    document.getElementById('zoomInBtn').onclick = () => { state.zoom = clampZoom(state.zoom + 0.1); applyTransform(); };
    document.getElementById('zoomOutBtn').onclick = () => { state.zoom = clampZoom(state.zoom - 0.1); applyTransform(); };
    document.getElementById('resetBtn').onclick = resetView;
    document.getElementById('snapBtn').onclick = () => {
        snapToGrid = !snapToGrid;
        document.getElementById('snapBtn').textContent = 'Snap: ' + (snapToGrid ? 'On' : 'Off');
        document.getElementById('snapBtn').style.opacity = snapToGrid ? '1' : '0.6';
    };
    document.getElementById('undoBtn').onclick = undo;
    document.getElementById('redoBtn').onclick = redo;
    document.getElementById('wiredBtn').onclick = () => setConnType('wired');
    document.getElementById('wirelessBtn').onclick = () => setConnType('wireless');
    document.getElementById('vpnBtn').onclick = () => setConnType('vpn');
    document.getElementById('curvedBtn').onclick = () => setRoutingStyle('curved');
    document.getElementById('orthoBtn').onclick = () => setRoutingStyle('orthogonal');
    document.getElementById('editRouteBtn').onclick = toggleEditRoute;
    document.getElementById('eraserBtn').onclick = toggleEraser;
    document.getElementById('clearBtn').onclick = clearAll;
    document.getElementById('csvTemplatesBtn').onclick = () => openModal('csvTemplatesModal');
    document.getElementById('exportPdfBtn').onclick = () => openModal('exportModal');
    document.getElementById('saveProjectBtn').onclick = () => openModal('saveProjectModal');
    document.getElementById('loadProjectBtn').onclick = () => openModal('loadProjectModal');
    const searchBox = document.getElementById('deviceSearch');
    searchBox.addEventListener('input', e => renderSearch(e.target.value));
    searchBox.addEventListener('keydown', e => {
        if (e.key === 'Enter' && searchHits.length > 0) {
            e.preventDefault();
            revealDevice(searchHits[0]);
        }
        if (e.key === 'Escape') {
            // Clear the filter first; a second Escape leaves the field.
            e.stopPropagation();
            if (searchBox.value) { searchBox.value = ''; renderSearch(''); }
            else searchBox.blur();
        }
    });

    document.getElementById('deleteBtn').onclick = deleteSelected;
    document.getElementById('deleteSelectionBtn').onclick = deleteSelected;
    document.getElementById('duplicateSelectionBtn').onclick = duplicateSelection;
    document.querySelectorAll('[data-bulk-status]').forEach(btn => {
        btn.onclick = () => applyToSelection(
            d => { d.status = btn.dataset.bulkStatus; },
            'Set {n} to ' + btn.dataset.bulkStatus + '.'
        );
    });
    document.getElementById('multiVlan').onchange = e => {
        const value = e.target.value;
        if (value === '') return;
        applyToSelection(d => { d.vlan = value; }, 'Assigned {n} to ' + getVlanName(value) + '.');
        e.target.value = '';
    };
    document.getElementById('addVMBtn').onclick = () => openModal('vmModal');

    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.onclick = () => setStatus(btn.dataset.status);
    });

    document.getElementById('propName').oninput = e => updateDeviceProp('name', e.target.value);
    document.getElementById('propIP').oninput = e => updateDeviceProp('ip', e.target.value);
    document.getElementById('propMAC').oninput = e => updateDeviceProp('mac', e.target.value);
    document.getElementById('propVLAN').onchange = e => updateDeviceProp('vlan', e.target.value);
    document.getElementById('propNotes').oninput = e => updateDeviceProp('notes', e.target.value);
    document.getElementById('propManufacturer').onchange = e => updateDeviceProp('manufacturer', e.target.value);
    document.getElementById('propOS').onchange = e => updateDeviceProp('os', e.target.value);

    function isTextEntry(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    }

    document.addEventListener('keydown', e => {
        const inTextEntry = isTextEntry(e.target);

        if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
            e.preventDefault();
            exportJson();
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
            // The browser's find bar cannot see devices on the canvas, so
            // take the shortcut for the one that can.
            e.preventDefault();
            const box = document.getElementById('deviceSearch');
            box.focus();
            box.select();
            return;
        }

        if (e.key === '?' && !inTextEntry) {
            e.preventDefault();
            openModal('shortcutsModal');
            return;
        }

        if (e.key === 'Escape') {
            // Escape closes an open modal before anything else.
            const open = document.querySelector('.modal-bg.active');
            if (open) { open.classList.remove('active'); return; }
            // Inside a field, Escape just leaves the field.
            if (inTextEntry) { e.target.blur(); return; }
            cancelConnect();
            deselectAll();
            if (eraserMode) toggleEraser();
            if (editRouteMode) toggleEditRoute();
            return;
        }

        // Text fields keep their native editing keys - most importantly
        // Delete/Backspace, which would otherwise destroy the device.
        if (inTextEntry) return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return; }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
            e.preventDefault();
            setSelection(state.devices.map(d => d.id));
            return;
        }

        if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            duplicateSelection();
            return;
        }

        const ARROWS = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (ARROWS[e.key] && selection.size > 0) {
            e.preventDefault();
            // Shift means fine adjustment; otherwise move by one grid step.
            const step = e.shiftKey ? 1 : GRID_SIZE;
            nudgeSelection(ARROWS[e.key][0] * step, ARROWS[e.key][1] * step);
            return;
        }

        if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            // Guard on the selection set, not state.selected: that is null
            // whenever more than one device is selected.
            if (selection.size > 0) deleteSelected();
            if (state.selectedZone) deleteSelectedZone();
        }
    });

    updateVlanSelect();
    updateNetworkInfoBox();
    updateUpsBox();
    applyTransform();
    offerAutosaveRestore();

    // Autosave is debounced, so a close mid-debounce would lose the tail.
    window.addEventListener('pagehide', () => {
        if (autosaveTimer) writeAutosave();
    });

    window.addEventListener('beforeunload', e => {
        const hasWork = state.devices.length > 0 || state.zones.length > 0;
        if (!hasWork || !unsavedSinceExport) return;
        e.preventDefault();
        e.returnValue = '';   // required for the browser's own prompt
    });
});

function setConnType(type) {
    state.connType = type;
    document.getElementById('wiredBtn').className = 'wired-bar' + (type === 'wired' ? ' active' : '');
    document.getElementById('wirelessBtn').className = 'wireless-bar' + (type === 'wireless' ? ' active' : '');
    document.getElementById('vpnBtn').className = 'vpn-bar' + (type === 'vpn' ? ' active' : '');
}

function setRoutingStyle(style) {
    state.routingStyle = style;
    document.getElementById('curvedBtn').className = 'curved-bar' + (style === 'curved' ? ' active' : '');
    document.getElementById('orthoBtn').className = 'ortho-bar' + (style === 'orthogonal' ? ' active' : '');
}

// Build a path string for a connection
// ─── Waypoint / Edit-Route mode ──────────────────────────────────────────
let editRouteMode = false;
let editingConn = null;           // connection being edited
let draggingWaypoint = null;      // { connId, index }
let wpDragStart = { x: 0, y: 0 };
let wpOriginal = { x: 0, y: 0 };
const waypointLayer = document.getElementById('waypointLayer');

function toggleEditRoute() {
    editRouteMode = !editRouteMode;
    const btn = document.getElementById('editRouteBtn');
    if (editRouteMode) {
        btn.style.background = 'rgba(124,58,237,0.12)';
        btn.style.borderColor = 'rgba(124,58,237,0.5)';
        connHint.textContent = 'Click an orthogonal connection to edit its route';
        connHint.classList.add('active');
        setLayerMode();
        drawConnections();
    } else {
        btn.style.background = '';
        btn.style.borderColor = 'rgba(124,58,237,0.3)';
        connHint.classList.remove('active');
        editingConn = null;
        clearWaypointHandles();
        setLayerMode();
        drawConnections();
        waypointLayer.classList.remove('active');
    }
}

function drawConnectionsForRouteEdit() {
    drawConnections();
}

/**
 * Move the existing handles to match the connection's current geometry.
 *
 * Dragging a corner used to call renderWaypointHandles on every pointer
 * move, which emptied the layer and recreated every midpoint, handle and
 * listener. The handle count only changes when a corner is added or removed,
 * so an ordinary drag just needs new coordinates.
 */
function repositionWaypointHandles(conn) {
    if (!conn.waypoints) return;
    const from = getConnectionPoint(conn.from, conn.fromPos);
    const to   = getConnectionPoint(conn.to,   conn.toPos);
    const points = [from, ...conn.waypoints, to];

    waypointLayer.querySelectorAll('[data-waypoint]').forEach(el => {
        const wp = conn.waypoints[Number(el.dataset.waypoint)];
        if (!wp) return;
        el.style.left = wp.x + 'px';
        el.style.top = wp.y + 'px';
    });

    waypointLayer.querySelectorAll('[data-segment]').forEach(el => {
        const i = Number(el.dataset.segment);
        const a = points[i], b = points[i + 1];
        if (!a || !b) return;
        el.style.left = ((a.x + b.x) / 2) + 'px';
        el.style.top = ((a.y + b.y) / 2) + 'px';
    });

    const reset = waypointLayer.querySelector('[data-reset-btn]');
    if (reset) {
        reset.style.left = ((from.x + to.x) / 2 - 28) + 'px';
        reset.style.top = ((from.y + to.y) / 2 - 24) + 'px';
    }
}

function renderWaypointHandles(conn) {
    clearWaypointHandles();
    waypointLayer.classList.add('active');
    if (!conn.waypoints) return;

    const from = getConnectionPoint(conn.from, conn.fromPos);
    const to   = getConnectionPoint(conn.to,   conn.toPos);

    // Helper: create a draggable midpoint diamond that inserts a new waypoint at insertIdx
    function makeMidpoint(mx, my, insertIdx) {
        const mid = document.createElement('div');
        mid.className = 'seg-midpoint';
        mid.dataset.segment = String(insertIdx);
        mid.style.left = mx + 'px';
        mid.style.top  = my + 'px';
        mid.title = 'Drag to add a new corner here';
        mid.addEventListener('mousedown', function(e) {
            e.stopPropagation();
            conn.waypoints.splice(insertIdx, 0, { x: mx, y: my });
            draggingWaypoint = { conn: conn, index: insertIdx };
            wpDragStart = { x: e.clientX, y: e.clientY };
            wpOriginal  = { x: mx, y: my };
            e.preventDefault();
            connLayer.updatePaths([conn], connPath);
            renderWaypointHandles(conn);
        });
        waypointLayer.appendChild(mid);
    }

    // Build the full ordered list of points: source → waypoints → target
    const allPoints = [from, ...conn.waypoints, to];

    // Midpoint on every segment (between allPoints[i] and allPoints[i+1])
    // inserting at waypoint index i (between wp[i-1] and wp[i])
    for (let i = 0; i < allPoints.length - 1; i++) {
        const a = allPoints[i];
        const b = allPoints[i + 1];
        makeMidpoint((a.x + b.x) / 2, (a.y + b.y) / 2, i);
    }

    // Corner handles for each existing waypoint
    conn.waypoints.forEach((wp, i) => {
        const handle = document.createElement('div');
        handle.className = 'waypoint-handle';
        handle.dataset.waypoint = String(i);
        handle.style.left = wp.x + 'px';
        handle.style.top  = wp.y + 'px';
        handle.title = 'Drag to move this corner';
        handle.addEventListener('mousedown', function(e) {
            e.stopPropagation();
            draggingWaypoint = { conn: conn, index: i };
            wpDragStart = { x: e.clientX, y: e.clientY };
            wpOriginal  = { x: wp.x, y: wp.y };
            handle.classList.add('dragging');
            e.preventDefault();
        });
        waypointLayer.appendChild(handle);
    });

    // Reset button
    const resetBtn = document.createElement('div');
    resetBtn.dataset.resetBtn = '1';
    resetBtn.style.cssText = 'position:absolute;left:' + ((from.x + to.x)/2 - 28) + 'px;top:' + ((from.y + to.y)/2 - 24) + 'px;' +
        'background:#7c3aed;color:#fff;font-size:0.6rem;font-family:var(--font-body);font-weight:600;padding:3px 7px;' +
        'border-radius:6px;cursor:pointer;z-index:51;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.2);';
    resetBtn.textContent = '↺ Reset';
    resetBtn.title = 'Reset to auto-routed path';
    resetBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        conn.waypoints = [];
        connLayer.updatePaths([conn], connPath);
        renderWaypointHandles(conn);
    });
    waypointLayer.appendChild(resetBtn);
}

function clearWaypointHandles() {
    waypointLayer.innerHTML = '';
    waypointLayer.classList.remove('active');
}

// Mouse move / up for waypoint dragging
document.addEventListener('mousemove', function(e) {
    if (!draggingWaypoint) return;
    const conn = draggingWaypoint.conn;
    const idx = draggingWaypoint.index;
    const dx = (e.clientX - wpDragStart.x) / state.zoom;
    const dy = (e.clientY - wpDragStart.y) / state.zoom;
    conn.waypoints[idx] = {
        x: snapToGridValue(wpOriginal.x + dx),
        y: snapToGridValue(wpOriginal.y + dy)
    };
    // Reposition the existing handles instead of tearing the layer down and
    // rebuilding every handle and listener on each pointer move.
    scheduler.schedule('waypoints', () => {
        connLayer.updatePaths([conn], connPath);
        repositionWaypointHandles(conn);
    });
}, true);

document.addEventListener('mouseup', function(e) {
    if (!draggingWaypoint) return;
    const conn = draggingWaypoint.conn;
    draggingWaypoint = null;
    scheduler.flushNow();
    renderWaypointHandles(conn);
}, true);

// Connection eraser mode
let eraserMode = false;

function toggleEraser() {
    eraserMode = !eraserMode;
    const btn = document.getElementById('eraserBtn');
    btn.classList.toggle('eraser-active', eraserMode);

    if (eraserMode) {
        // Make connections clickable
            connHint.textContent = 'Click a connection line to delete it';
        connHint.classList.add('active');
    } else {
        connHint.classList.remove('active');
    }
    setLayerMode();
    drawConnections();
}

function drawConnectionsForEraser() {
    drawConnections();
}

function createDevice(type, x, y) {
    saveState();
    state.counter++;
    const cfg = types[type];
    const device = {
        id: nextId('dev'),
        type: type,
        name: cfg.name + ' ' + state.counter,
        ip: '', mac: '', status: 'online', vlan: '', notes: '',
        manufacturer: '', os: '',
        x: x, y: y,
        vms: type === 'vmhost' ? [] : null
    };
    state.devices.push(device);
    sceneIndex.addDevice(device);
    renderDevice(device);
    updateCounts();
    document.getElementById('emptyState').style.display = 'none';
}

function renderDevice(d) {
    const cfg = types[d.type];
    const el = document.createElement('div');
    el.id = d.id;
    el.className = 'network-device' + (d.type === 'vmhost' ? ' vm-host' : '');
    el.style.left = d.x + 'px';
    el.style.top = d.y + 'px';

    const iconClass = 'device-icon';
    let iconContent;
    if (cfg.svgIcon) {
        iconContent = getSvgIcon(cfg.icon, 24);
    } else {
        iconContent = cfg.icon;
    }

    el.innerHTML = '<div class="device-status status-' + d.status + '"></div>' +
        '<div class="' + iconClass + '">' + iconContent + '</div>' +
        '<div class="device-name"></div>' +
        '<div class="device-ip">' + (d.ip || 'No IP') + '</div>' +
        '<div class="device-badge">' + cfg.name + '</div>' +
        (d.type === 'vmhost' ? '<div class="vm-list" id="vms' + d.id + '"></div>' : '') +
        '<div class="conn-point top" data-pos="top"></div>' +
        '<div class="conn-point bottom" data-pos="bottom"></div>' +
        '<div class="conn-point left" data-pos="left"></div>' +
        '<div class="conn-point right" data-pos="right"></div>';

    el.addEventListener('mousedown', function(e) {
        if (e.target.classList.contains('conn-point')) return;
        e.stopPropagation();
        if (e.shiftKey) return;   // shift-click is a selection gesture, not a drag

        // Pressing an unselected device selects it first, so a drag always
        // moves what is under the cursor.
        if (!selection.has(d.id)) setSelection([d.id]);

        // No snapshot here - a plain click to select is not an edit.
        // The undo step is recorded on mouseup, only if the thing moved.
        draggingDevice = d;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        deviceStart.x = d.x;
        deviceStart.y = d.y;
        // Everything else in the selection rides along from its own origin.
        dragGroup = selectedDevices()
            .filter(other => other.id !== d.id)
            .map(other => ({ device: other, x: other.x, y: other.y }));
        canvasArea.classList.add('dragging-device');
    });

    el.addEventListener('click', function(e) {
        if (e.target.classList.contains('conn-point')) return;
        e.stopPropagation();
        if (suppressNextClick) { suppressNextClick = false; return; }
        if (e.shiftKey) { selectDevice(d, true); return; }
        selectDevice(d);
    });

    el.querySelectorAll('.conn-point').forEach(point => {
        point.addEventListener('click', function(e) {
            e.stopPropagation();
            e.preventDefault();
            // Only handle click if we're not ending a drag
            if (!isDraggingConnection) {
                handleConnectionClick(d, point.dataset.pos);
            }
        });

        // Drag-to-connect: mousedown on connection point
        point.addEventListener('mousedown', function(e) {
            e.stopPropagation();
            e.preventDefault();

            const connPoint = getConnectionPoint(d.id, point.dataset.pos);
            isDraggingConnection = true;
            dragConnStart = { 
                device: d, 
                pos: point.dataset.pos, 
                x: connPoint.x, 
                y: connPoint.y 
            };
            dragConnCurrent = { x: connPoint.x, y: connPoint.y };

            document.getElementById(d.id).classList.add('connecting');
            connHint.textContent = 'Drag to another device to connect, or release to cancel';
            connHint.classList.add('active');

            drawConnectionsWithDrag();
        });
    });

    // Device names are user input; setting them as text keeps a stray '<'
    // from rewriting the card.
    el.querySelector('.device-name').textContent = d.name;

    canvas.appendChild(el);
    // The element was just replaced, so any cached box size is stale.
    sceneIndex.invalidateSize(d.id);
    updatePowerTag(d);
    if (d.type === 'vmhost' && d.vms) renderVMsOnDevice(d);
}

function renderVMsOnDevice(d) {
    sceneIndex.invalidateSize(d.id);
    const container = document.getElementById('vms' + d.id);
    if (!container) return;
    container.innerHTML = d.vms.map(vm => '<div class="hosted-vm"><div class="dot status-' + vm.status + '"></div>' + vm.name + '</div>').join('');
}

// Zone functions
function createZone(type, x, y) {
    saveState();
    state.zoneCounter++;
    const cfg = zoneTypes[type];
    const zone = {
        id: nextId('zone'),
        type: type,
        name: cfg.name + ' ' + state.zoneCounter,
        x: x, y: y,
        width: 200, height: 150,
        notes: ''
    };
    // Type-specific properties
    if (type === 'mdf' || type === 'idf') {
        zone.location = '';
        if (type === 'idf') zone.connectedMDF = '';
    } else if (type === 'cloud') {
        zone.provider = '';
        zone.region = '';
    } else if (type === 'onprem') {
        zone.location = '';
    }
    state.zones.push(zone);
    renderZone(zone);
    updateCounts();
    document.getElementById('emptyState').style.display = 'none';
}

function renderZone(z) {
    const cfg = zoneTypes[z.type];
    const el = document.createElement('div');
    el.id = z.id;
    el.className = 'network-zone zone-' + z.type;
    el.style.left = z.x + 'px';
    el.style.top = z.y + 'px';
    el.style.width = z.width + 'px';
    el.style.height = z.height + 'px';

    const iconStyle = cfg.textIcon ? 'font-size:0.6rem;font-weight:bold;letter-spacing:-1px;color:' + (cfg.iconColor || 'inherit') + ';' : '';
    el.innerHTML = '<div class="zone-header">' +
        '<span class="zone-icon" style="' + iconStyle + '">' + cfg.icon + '</span>' +
        '<span class="zone-name"></span>' +
        '<span class="zone-badge">' + cfg.name + '</span>' +
        '</div>' +
        '<div class="zone-resize">⤡</div>';

    // Zone names are user input; set as text so a stray '<' cannot
    // rewrite the header.
    el.querySelector('.zone-name').textContent = z.name;
    updatePowerTag(z);

    // The whole box drags, not just the header. It already showed
    // cursor:move everywhere, so pressing the body and getting nothing was
    // a lie the cursor told. Devices sit above zones, so this does not
    // interfere with dragging them.
    el.addEventListener('mousedown', function(e) {
        if (e.target.classList.contains('zone-resize')) return;
        e.stopPropagation();
        draggingZone = z;
        dragStart.x = e.clientX;
        dragStart.y = e.clientY;
        zoneStart.x = z.x;
        zoneStart.y = z.y;
        // Whatever is inside right now travels with the zone.
        zoneDragGroup = devicesInZone(z).map(d => ({ device: d, x: d.x, y: d.y }));
    });

    // Zone click to select
    el.addEventListener('click', function(e) {
        if (e.target.classList.contains('zone-resize')) return;
        if (suppressNextClick) { suppressNextClick = false; return; }
        e.stopPropagation();
        selectZone(z);
    });

    // Resize handle
    const resizeHandle = el.querySelector('.zone-resize');
    resizeHandle.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        resizingZone = z;
        resizeStart.x = e.clientX;
        resizeStart.y = e.clientY;
        resizeStart.w = z.width;
        resizeStart.h = z.height;
    });

    canvas.appendChild(el);
}

function selectZone(z) {
    deselectAll();
    state.selectedZone = z;
    document.getElementById(z.id).classList.add('selected');
    showZoneProps(z);
}

function showZoneProps(z) {
    document.getElementById('noSelect').style.display = 'none';
    document.getElementById('deviceProps').style.display = 'none';
    document.getElementById('zoneProps').style.display = 'block';

    document.getElementById('propZoneName').value = z.name;

    showSection('zonePowerSection', canBeProtected(z));
    if (canBeProtected(z)) renderPowerList(z, 'zonePowerList');
    document.getElementById('propZoneNotes').value = z.notes || '';

    // Hide all type-specific sections
    document.getElementById('nvrPropsSection').style.display = 'none';
    document.getElementById('mdfPropsSection').style.display = 'none';
    document.getElementById('idfPropsSection').style.display = 'none';
    document.getElementById('cloudPropsSection').style.display = 'none';
    document.getElementById('onpremPropsSection').style.display = 'none';

    // Show appropriate section based on zone type
    if (z.type === 'nvr') {
        document.getElementById('nvrPropsSection').style.display = 'block';
        document.getElementById('propNVRMfg').value = z.manufacturer || '';
        document.getElementById('propNVRModel').value = z.model || '';
        document.getElementById('propNVRChannels').value = z.channels || '';
        document.getElementById('propNVRStorage').value = z.storage || '';
        document.getElementById('propNVRIP').value = z.ip || '';
    } else if (z.type === 'mdf') {
        document.getElementById('mdfPropsSection').style.display = 'block';
        document.getElementById('propMDFLocation').value = z.location || '';
    } else if (z.type === 'idf') {
        document.getElementById('idfPropsSection').style.display = 'block';
        document.getElementById('propIDFLocation').value = z.location || '';
        // Populate MDF dropdown
        const mdfSelect = document.getElementById('propIDFMDF');
        const mdfZones = state.zones.filter(zone => zone.type === 'mdf');
        mdfSelect.innerHTML = '<option value="">-- Select MDF --</option>' + 
            mdfZones.map(m => '<option value="' + m.id + '"' + (z.connectedMDF === m.id ? ' selected' : '') + '>' + m.name + '</option>').join('');
    } else if (z.type === 'cloud') {
        document.getElementById('cloudPropsSection').style.display = 'block';
        document.getElementById('propCloudProvider').value = z.provider || '';
        document.getElementById('propCloudRegion').value = z.region || '';
    } else if (z.type === 'onprem') {
        document.getElementById('onpremPropsSection').style.display = 'block';
        document.getElementById('propOnPremLocation').value = z.location || '';
    }
}

function updateZoneProp(key, value) {
    if (!state.selectedZone) return;
    if (state.selectedZone[key] === value) return;
    saveStateDebounced();
    state.selectedZone[key] = value;
    const el = document.getElementById(state.selectedZone.id);
    if (key === 'name') el.querySelector('.zone-name').textContent = value;
}

function deleteSelectedZone() {
    if (!state.selectedZone) return;
    saveState();
    const id = state.selectedZone.id;
    state.zones = state.zones.filter(z => z.id !== id);
    document.getElementById(id).remove();
    deselectAll();
    updateCounts();
    if (state.devices.length === 0 && state.zones.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
    }
}

function handleConnectionClick(device, position) {
    if (state.connecting === null) {
        state.connecting = { device: device, pos: position };
        document.getElementById(device.id).classList.add('connecting');
        connHint.classList.add('active');
    } else {
        if (state.connecting.device.id !== device.id) {
            const exists = state.connections.some(c =>
                (c.from === state.connecting.device.id && c.to === device.id) ||
                (c.from === device.id && c.to === state.connecting.device.id)
            );
            if (!exists) {
                saveState();
                state.connections.push({
                    id: nextId('conn'),
                    from: state.connecting.device.id, fromPos: state.connecting.pos,
                    to: device.id, toPos: position, type: state.connType,
                    routingStyle: state.routingStyle
                });
                drawConnections();
                updateCounts();
                // Refresh connected to list if either device is selected
                if (state.selected && (state.selected.id === device.id || state.selected.id === state.connecting.device.id)) {
                    renderConnectedToList(state.selected);
                }
            }
        }
        cancelConnect();
    }
}

/**
 * End an in-flight connection drag and clear its preview line.
 *
 * The preview used to disappear by accident: drawConnections() rebuilt
 * svg.innerHTML from a string, which wiped every node including the dashed
 * line. The layer now keeps persistent nodes and re-appends the overlay, so
 * releasing over empty space left the line stranded on the canvas. Every
 * way a drag can end routes through here.
 */
function endConnectionDrag() {
    if (!isDraggingConnection) return;
    // Drop any queued preview frame, or it would redraw the line we just hid.
    scheduler.cancel('drag-preview');
    connLayer.hideOverlay();
    const el = dragConnStart.device && document.getElementById(dragConnStart.device.id);
    if (el) el.classList.remove('connecting');
    isDraggingConnection = false;
    dragConnStart = { device: null, pos: null, x: 0, y: 0 };
    connHint.classList.remove('active');
    connHint.textContent = 'Click another connection point to complete';
}

function cancelConnect() {
    endConnectionDrag();
    if (state.connecting) {
        const el = document.getElementById(state.connecting.device.id);
        if (el) el.classList.remove('connecting');
    }
    state.connecting = null;
    connHint.classList.remove('active');
}

/**
 * Box size for a device, measured once and cached. Reading offsetWidth per
 * endpoint per connection per frame was the single biggest cost on the drag
 * path; the box is CSS-sized, so it only changes when content does.
 */
function deviceSize(deviceId) {
    let size = sceneIndex.size(deviceId);
    if (size) return size;
    const el = document.getElementById(deviceId);
    if (!el) return null;
    sceneIndex.setSize(deviceId, el.offsetWidth, el.offsetHeight);
    return sceneIndex.size(deviceId);
}

function getConnectionPoint(deviceId, position) {
    const device = sceneIndex.device(deviceId);
    if (!device) return { x: 0, y: 0 };
    const size = deviceSize(deviceId);
    if (!size) return { x: 0, y: 0 };
    return connectionPoint(device, position, size.width, size.height);
}

function connPath(conn) {
    const from = getConnectionPoint(conn.from, conn.fromPos);
    const to = getConnectionPoint(conn.to, conn.toPos);
    return buildConnPath(from, to, conn.fromPos, conn.routingStyle || 'curved', conn.waypoints);
}

/** Re-index, then reconcile the layer. O(devices + connections); called on
 *  structural change, never from within a drag. */
function drawConnections() {
    sceneIndex.rebuild(state.devices, state.connections);
    connLayer.render(state.connections, connPath);
    connLayer.setEditing(editRouteMode && editingConn ? editingConn.id : null);
    if (editRouteMode && editingConn) renderWaypointHandles(editingConn);
}

// Coalesced redraw. A full redraw wins over per-device ones queued in the
// same frame, since it is a superset of their work.
let pendingFullRedraw = false;
const pendingDirtyDevices = new Set();

function runPendingRedraw() {
    if (pendingFullRedraw) {
        drawConnections();
    } else if (pendingDirtyDevices.size) {
        connLayer.updatePaths(sceneIndex.connectionsForAny([...pendingDirtyDevices]), connPath);
    }
    pendingFullRedraw = false;
    pendingDirtyDevices.clear();
}

function scheduleFullRedraw() {
    pendingFullRedraw = true;
    scheduler.schedule('connections', runPendingRedraw);
}

/** Only the edges touching this device need new paths. */
function scheduleDeviceRedraw(deviceId) {
    pendingDirtyDevices.add(deviceId);
    scheduler.schedule('connections', runPendingRedraw);
}

function drawConnectionsWithDrag() {
    if (isDraggingConnection && dragConnStart.device) {
        const d = buildConnPath(dragConnStart, dragConnCurrent, dragConnStart.pos, state.routingStyle);
        connLayer.showOverlay(d, connColor(state.connType), state.connType === 'vpn' ? 3.5 : 2);
    } else {
        connLayer.hideOverlay();
    }
}

function findDeviceAtPoint(clientX, clientY) {
    // Find which device (if any) is under the mouse cursor
    const elements = document.elementsFromPoint(clientX, clientY);

    for (const el of elements) {
        // Check if it's a connection point
        if (el.classList.contains('conn-point')) {
            const deviceEl = el.closest('.network-device');
            if (deviceEl) {
                const device = state.devices.find(d => d.id === deviceEl.id);
                if (device) {
                    return { device: device, pos: el.dataset.pos };
                }
            }
        }
        // Check if it's a device
        if (el.classList.contains('network-device')) {
            const device = state.devices.find(d => d.id === el.id);
            if (device) {
                const rect = el.getBoundingClientRect();
                const pos = nearestEdge(
                    clientX - rect.left, clientY - rect.top,
                    rect.width, rect.height
                );

                return { device: device, pos: pos };
            }
        }
    }
    return null;
}
/**
 * Selection is a set of device ids. `state.selected` is kept as the single
 * selected device - null unless exactly one is selected - so the properties
 * panel and every handler that already reads it keep working unchanged.
 */
const selection = new Set();

/** Pointer position in canvas coordinates. */
function canvasPointFromEvent(e) {
    const rect = canvasArea.getBoundingClientRect();
    return {
        x: (e.clientX - rect.left - state.panX) / state.zoom + CANVAS_ORIGIN,
        y: (e.clientY - rect.top - state.panY) / state.zoom + CANVAS_ORIGIN
    };
}

function marqueeRect(a, b) {
    return {
        x: Math.min(a.x, b.x),
        y: Math.min(a.y, b.y),
        width: Math.abs(a.x - b.x),
        height: Math.abs(a.y - b.y)
    };
}

function drawMarquee(a, b) {
    const r = marqueeRect(a, b);
    const el = document.getElementById('marquee');
    // The band lives inside #canvasWrapper's coordinate space.
    el.style.left = (r.x - CANVAS_ORIGIN) + 'px';
    el.style.top = (r.y - CANVAS_ORIGIN) + 'px';
    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    el.hidden = false;
}

/** Devices whose box overlaps the rect - touching counts, as in most editors. */
/**
 * Devices sitting inside a zone.
 *
 * Membership is derived from geometry each time rather than stored on the
 * device, so it can never fall out of step with where things actually are -
 * a device dragged out of a zone stops belonging to it with no bookkeeping.
 * Containment must be total: a device straddling the edge belongs to neither.
 */
/**
 * Power protection.
 *
 * UPS units are configuration, like VLANs and SSIDs - they live in
 * state.upsUnits rather than on the canvas, because a UPS is a fact about
 * the site, not a box with a position. Each protected object stores the ids
 * feeding it, so the checkbox in its properties reads straight off its own
 * record. Equipment can be fed by more than one, which dual-PSU hardware is.
 */

/** Only infrastructure offers the option; a desk phone is not on a UPS. */
const UPS_PROTECTABLE_DEVICES = ['router', 'firewall', 'switch', 'ap', 'vmhost', 'nas'];
const UPS_PROTECTABLE_ZONES = ['nvr'];

function canBeProtected(obj) {
    if (!obj) return false;
    return UPS_PROTECTABLE_DEVICES.includes(obj.type) || UPS_PROTECTABLE_ZONES.includes(obj.type);
}

function upsById(id) {
    return state.upsUnits.find(u => u.id === id);
}

function upsFeeding(obj) {
    return (obj && obj.upsIds ? obj.upsIds : [])
        .map(upsById)
        .filter(Boolean);
}

function toggleUpsFor(obj, upsId) {
    if (!obj) return;
    saveState();
    if (!obj.upsIds) obj.upsIds = [];
    const at = obj.upsIds.indexOf(upsId);
    if (at === -1) obj.upsIds.push(upsId);
    else obj.upsIds.splice(at, 1);
    updatePowerTag(obj);
    updateUpsBox();   // the bubble shows a per-unit count
}

/** Add or remove the battery badge on one object's card. */
function updatePowerTag(obj) {
    const el = document.getElementById(obj.id);
    if (!el) return;
    const existing = el.querySelector('.power-tag');
    const feeds = upsFeeding(obj);
    if (feeds.length === 0) {
        if (existing) existing.remove();
        return;
    }
    const tag = existing || (() => {
        const t = document.createElement('div');
        t.className = 'power-tag';
        t.innerHTML = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="16" height="10" rx="2"/><path d="M21 10v4"/></svg>';
        el.appendChild(t);
        return t;
    })();
    tag.title = 'On ' + feeds.map(u => u.name).join(', ');
}

function refreshAllPowerTags() {
    state.devices.forEach(updatePowerTag);
    state.zones.forEach(updatePowerTag);
}

/** The checkbox list shown on anything that can sit on a UPS. */
function renderPowerList(obj, containerId) {
    const box = document.getElementById(containerId);
    box.textContent = '';
    if (state.upsUnits.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'ups-empty';
        empty.textContent = 'No UPS units yet \u2014 add one in the Power panel.';
        box.appendChild(empty);
        return;
    }
    if (!obj.upsIds) obj.upsIds = [];
    state.upsUnits.forEach(u => {
        const row = document.createElement('label');
        row.className = 'ups-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = obj.upsIds.includes(u.id);
        cb.addEventListener('change', () => toggleUpsFor(obj, u.id));
        const name = document.createElement('span');
        name.className = 'ups-row-name';
        name.textContent = u.name;
        const meta = document.createElement('span');
        meta.className = 'ups-row-meta';
        meta.textContent = [u.capacity ? u.capacity + ' VA' : null,
                            u.runtime ? u.runtime + ' min' : null]
                            .filter(Boolean).join(' \u00b7 ');
        row.append(cb, name, meta);
        box.appendChild(row);
    });
}

// ─── UPS unit management ────────────────────────────────────────────

function openUpsConfig() {
    openModal('upsConfigModal');
    renderUpsList();
}

function renderUpsList() {
    const box = document.getElementById('upsList');
    box.textContent = '';
    if (state.upsUnits.length === 0) {
        const empty = document.createElement('p');
        empty.style.cssText = 'font-size:0.72rem;color:var(--text-muted);text-align:center;padding:10px;';
        empty.textContent = 'No UPS units configured.';
        box.appendChild(empty);
        return;
    }
    state.upsUnits.forEach((u, i) => {
        const row = document.createElement('div');
        row.className = 'vlan-item';
        const name = document.createElement('span');
        name.className = 'vlan-name';
        name.style.fontWeight = '600';
        name.textContent = u.name;
        const spec = document.createElement('span');
        spec.className = 'vlan-subnet';
        spec.textContent = [u.manufacturer, u.model,
                            u.capacity ? u.capacity + ' VA' : null,
                            u.runtime ? u.runtime + ' min' : null]
                            .filter(Boolean).join(' \u00b7 ') || '\u2014';
        const count = document.createElement('span');
        count.className = 'vlan-id';
        count.style.minWidth = 'auto';
        count.textContent = formatCount(protectedBy(u.id).length, 'device');
        const del = document.createElement('button');
        del.className = 'vlan-del';
        del.textContent = '\u00d7';
        del.addEventListener('click', () => deleteUps(i));
        row.append(name, spec, count, del);
        box.appendChild(row);
    });
}

/** Everything currently ticked for this UPS, devices and zones alike. */
function protectedBy(upsId) {
    return [...state.devices, ...state.zones]
        .filter(o => o.upsIds && o.upsIds.includes(upsId));
}

function saveUps() {
    const name = document.getElementById('newUpsName').value.trim();
    if (!name) {
        toast.show('Give the UPS a name.', { type: 'warn' });
        return;
    }
    if (state.upsUnits.some(u => u.name.toLowerCase() === name.toLowerCase())) {
        toast.show('A UPS called \u201c' + name + '\u201d already exists.', { type: 'warn' });
        return;
    }
    saveState();
    state.upsUnits.push({
        id: nextId('ups'),
        name,
        manufacturer: document.getElementById('newUpsMfg').value,
        model: document.getElementById('newUpsModel').value.trim(),
        capacity: document.getElementById('newUpsCapacity').value.trim(),
        runtime: document.getElementById('newUpsRuntime').value.trim(),
        ip: document.getElementById('newUpsIP').value.trim()
    });
    ['newUpsName', 'newUpsModel', 'newUpsCapacity', 'newUpsRuntime', 'newUpsIP']
        .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('newUpsMfg').value = '';
    closeModal('upsModal');
    renderUpsList();
    updateUpsBox();
    if (state.selected) showProps(state.selected);
    if (state.selectedZone) showZoneProps(state.selectedZone);
}

function deleteUps(index) {
    const ups = state.upsUnits[index];
    if (!ups) return;
    const users = protectedBy(ups.id).length;
    const detail = users ? ' ' + formatCount(users, 'device') + ' reference it.' : '';
    if (!confirm('Delete UPS \u201c' + ups.name + '\u201d?' + detail)) return;
    saveState();
    state.upsUnits.splice(index, 1);
    // Clear the references, or equipment keeps a battery tag for a UPS
    // that no longer exists.
    [...state.devices, ...state.zones].forEach(o => {
        if (o.upsIds) o.upsIds = o.upsIds.filter(id => id !== ups.id);
    });
    refreshAllPowerTags();
    renderUpsList();
    updateUpsBox();
    if (state.selected) showProps(state.selected);
    if (state.selectedZone) showZoneProps(state.selectedZone);
}

/** The bottom-left bubble. */
function updateUpsBox() {
    const box = document.getElementById('upsBoxList');
    if (!box) return;
    box.textContent = '';
    if (state.upsUnits.length === 0) {
        const none = document.createElement('div');
        none.className = 'ups-box-empty';
        none.textContent = 'None configured';
        box.appendChild(none);
        return;
    }
    state.upsUnits.forEach(u => {
        const row = document.createElement('div');
        row.className = 'ups-box-row';
        const name = document.createElement('span');
        name.className = 'ups-box-name';
        name.textContent = u.name;
        const count = document.createElement('span');
        count.className = 'ups-box-count';
        const n = protectedBy(u.id).length;
        count.textContent = n === 0 ? 'unassigned' : formatCount(n, 'device');
        row.append(name, count);
        box.appendChild(row);
    });
}

function devicesInZone(z) {
    return state.devices.filter(d => {
        const size = deviceSize(d.id) || { width: 120, height: 100 };
        return d.x >= z.x && d.y >= z.y &&
               d.x + size.width <= z.x + z.width &&
               d.y + size.height <= z.y + z.height;
    });
}

function devicesIntersecting(rect) {
    return state.devices.filter(d => {
        const size = deviceSize(d.id) || { width: 120, height: 100 };
        return d.x < rect.x + rect.width && d.x + size.width > rect.x &&
               d.y < rect.y + rect.height && d.y + size.height > rect.y;
    });
}

function selectedDevices() {
    return state.devices.filter(d => selection.has(d.id));
}

/** Push the selection out to the DOM and the properties panel. */
function applySelection() {
    document.querySelectorAll('.network-device').forEach(el => {
        const on = selection.has(el.id);
        el.classList.toggle('selected', on && selection.size === 1);
        el.classList.toggle('selected-multi', on && selection.size > 1);
    });

    const devices = selectedDevices();
    state.selected = devices.length === 1 ? devices[0] : null;

    showSection('noSelect', devices.length === 0 && !state.selectedZone);
    showSection('deviceProps', devices.length === 1);
    showSection('multiProps', devices.length > 1);
    if (devices.length > 1) showSection('zoneProps', false);

    if (devices.length === 1) {
        showProps(devices[0]);
    } else if (devices.length > 1) {
        document.getElementById('multiCount').textContent =
            formatCount(devices.length, 'device') + ' selected';
    }
}

/** Copy the selection, offset by a grid step, including any connection
 *  whose both ends are inside it. */
function duplicateSelection() {
    const originals = selectedDevices();
    if (originals.length === 0) return;
    saveState();

    const offset = GRID_SIZE * 2;
    const idMap = new Map();
    const copies = originals.map(src => {
        const copy = JSON.parse(JSON.stringify(src));
        copy.id = nextId('dev');
        copy.x = src.x + offset;
        copy.y = src.y + offset;
        state.counter++;
        idMap.set(src.id, copy.id);
        state.devices.push(copy);
        sceneIndex.addDevice(copy);
        renderDevice(copy);
        return copy;
    });

    // filter() materialises first, so pushing while iterating is safe.
    state.connections.filter(c => idMap.has(c.from) && idMap.has(c.to)).forEach(c => {
        const copy = Object.assign({}, c, {
            id: nextId('conn'),
            from: idMap.get(c.from),
            to: idMap.get(c.to)
        });
        if (c.waypoints) {
            copy.waypoints = c.waypoints.map(w => ({ x: w.x + offset, y: w.y + offset }));
        }
        state.connections.push(copy);
    });

    drawConnections();
    refreshAllPowerTags();
    updateCounts();
    setSelection(copies.map(c => c.id));
    toast.show('Duplicated ' + formatCount(copies.length, 'device') + '.', { type: 'success' });
}

/** Move the selection by a whole-pixel delta as one undo step. */
function nudgeSelection(dx, dy) {
    const devices = selectedDevices();
    if (devices.length === 0) return;
    const before = devices.map(d => ({ device: d, x: d.x, y: d.y }));
    devices.forEach(d => { d.x += dx; d.y += dy; });
    const after = devices.map(d => ({ device: d, x: d.x, y: d.y }));
    pushUndoForGeometryChange(
        () => before.forEach(e => { e.device.x = e.x; e.device.y = e.y; }),
        () => after.forEach(e => { e.device.x = e.x; e.device.y = e.y; })
    );
    devices.forEach(d => {
        const el = document.getElementById(d.id);
        if (el) { el.style.left = d.x + 'px'; el.style.top = d.y + 'px'; }
        scheduleDeviceRedraw(d.id);
    });
}

function applyToSelection(mutate, label) {
    const devices = selectedDevices();
    if (devices.length === 0) return;
    saveState();
    devices.forEach(mutate);
    devices.forEach(d => {
        const el = document.getElementById(d.id);
        if (el) {
            const dot = el.querySelector('.device-status');
            if (dot) dot.className = 'device-status status-' + d.status;
        }
    });
    if (label) toast.show(label.replace('{n}', formatCount(devices.length, 'device')), { type: 'success' });
}

/** Centre the viewport on a device without changing the zoom. */
function panToDevice(d) {
    const size = deviceSize(d.id) || { width: 120, height: 100 };
    const area = canvasArea.getBoundingClientRect();
    // Screen position of a canvas point is (p - CANVAS_ORIGIN) * zoom + pan,
    // so solve for the pan that puts the device centre at the view centre.
    state.panX = area.width / 2 - (d.x + size.width / 2 - CANVAS_ORIGIN) * state.zoom;
    state.panY = area.height / 2 - (d.y + size.height / 2 - CANVAS_ORIGIN) * state.zoom;
    applyTransform();
}

const typeLabel = (type) => (types[type] && types[type].name) || type;

let searchHits = [];

function renderSearch(query) {
    const box = document.getElementById('searchResults');
    const palette = document.getElementById('palette');
    if (!query.trim()) {
        box.hidden = true;
        palette.hidden = false;
        searchHits = [];
        return;
    }

    searchHits = matchDevices(state.devices, query, typeLabel);
    palette.hidden = true;
    box.hidden = false;
    box.textContent = '';

    if (searchHits.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'search-empty';
        empty.textContent = state.devices.length === 0
            ? 'No devices on the canvas yet.'
            : 'Nothing matches that.';
        box.appendChild(empty);
        return;
    }

    searchHits.forEach((d, i) => {
        const hit = document.createElement('div');
        hit.className = 'search-hit' + (i === 0 ? ' active' : '');
        hit.innerHTML = '<span class="hit-icon">' + getSvgIconSidebar(types[d.type].icon) + '</span>' +
            '<span class="hit-body"><span class="hit-name"></span>' +
            '<span class="hit-meta"></span></span>';
        // Names and IPs are user data, so they go in as text.
        hit.querySelector('.hit-name').textContent = d.name;
        hit.querySelector('.hit-meta').textContent = describeDevice(d, typeLabel(d.type));
        hit.addEventListener('click', () => revealDevice(d));
        box.appendChild(hit);
    });
}

function revealDevice(d) {
    setSelection([d.id]);
    panToDevice(d);
}

function setSelection(ids) {
    selection.clear();
    ids.forEach(id => selection.add(id));
    if (selection.size > 0 && state.selectedZone) {
        const el = document.getElementById(state.selectedZone.id);
        if (el) el.classList.remove('selected');
        state.selectedZone = null;
    }
    applySelection();
}

function selectDevice(d, additive = false) {
    if (!additive) {
        setSelection([d.id]);
        return;
    }
    // Shift-click toggles, so the same gesture adds and removes.
    if (selection.has(d.id)) selection.delete(d.id);
    else selection.add(d.id);
    applySelection();
}

function deselectAll() {
    selection.clear();
    document.querySelectorAll('.network-device.selected, .network-device.selected-multi')
        .forEach(el => el.classList.remove('selected', 'selected-multi'));
    state.selected = null;
    if (state.selectedZone) {
        const el = document.getElementById(state.selectedZone.id);
        if (el) el.classList.remove('selected');
    }
    state.selectedZone = null;
    document.getElementById('noSelect').style.display = 'block';
    document.getElementById('deviceProps').style.display = 'none';
    document.getElementById('multiProps').style.display = 'none';
    document.getElementById('zoneProps').style.display = 'none';
}

function showSection(id, show) {
    document.getElementById(id).style.display = show ? 'block' : 'none';
}

function showProps(d) {
    showSection('noSelect', false);
    showSection('deviceProps', true);
    document.getElementById('propNotes').value = d.notes;

    document.getElementById('nameLabel').textContent = d.type === 'router' ? 'ISP' : 'Device Name';
    document.getElementById('propName').value = d.name;

    document.getElementById('propIP').value = d.ip;
    showSection('macGroup', d.type !== 'router');
    if (d.type !== 'router') document.getElementById('propMAC').value = d.mac;

    showSection('statusGroup', d.type !== 'router');
    if (d.type !== 'router') {
        document.querySelectorAll('.status-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === d.status));
    }

    const isRouter = d.type === 'router';
    showSection('routerSection', isRouter);
    if (isRouter) {
        document.getElementById('propFiber').checked = d.connectionType === 'fiber';
        document.getElementById('propCoax').checked = d.connectionType === 'coax';
        document.getElementById('propDownload').value = d.downloadSpeed || '';
        document.getElementById('propUpload').value = d.uploadSpeed || '';
        document.getElementById('propSubnetMask').value = d.subnetMask || '';
        document.getElementById('propDefaultGateway').value = d.defaultGateway || '';
    }

    showSection('vmSection', d.type === 'vmhost');
    if (d.type === 'vmhost') renderVMList(d);

    const hideVlanTypes = ['ap', 'firewall', 'switch', 'cloud', 'onprem', 'storage', 'router', 'vpn'];
    const showVlan = !hideVlanTypes.includes(d.type);
    showSection('vlanGroup', showVlan);
    if (showVlan) document.getElementById('propVLAN').value = d.vlan;

    const networkEquipTypes = ['firewall', 'switch', 'ap'];
    const isNetworkEquip = networkEquipTypes.includes(d.type);
    showSection('networkEquipSection', isNetworkEquip);
    if (isNetworkEquip) {
        document.getElementById('propNetEquipMfg').value = d.manufacturer || '';
        document.getElementById('propNetEquipModel').value = d.model || '';
    }

    showSection('ssidSection', d.type === 'ap');
    if (d.type === 'ap') renderAPSSIDList(d);

    showSection('switchSection', d.type === 'switch');
    if (d.type === 'switch') {
        document.getElementById('propSwitchPorts').value = d.ports || '';
        document.getElementById('propPOE').checked = d.poe || false;
        renderSwitchVLANList(d);
    }

    showSection('firewallSection', d.type === 'firewall');
    if (d.type === 'firewall') document.getElementById('propFirewallPorts').value = d.ports || '';

    showSection('vpnSection', d.type === 'vpn');
    if (d.type === 'vpn') {
        document.getElementById('propVPNMfg').value = d.manufacturer || '';
        document.getElementById('propVPNModel').value = d.model || '';
        document.getElementById('propVPNType').value = d.vpnType || '';
    }

    showSection('powerSection', canBeProtected(d));
    if (canBeProtected(d)) renderPowerList(d, 'powerList');

    showSection('printerSection', d.type === 'printer');
    if (d.type === 'printer') document.getElementById('propPrinterModel').value = d.model || '';

    const hasMfg = manufacturers[d.type] && !isNetworkEquip;
    showSection('manufacturerGroup', hasMfg);
    if (hasMfg) {
        document.getElementById('propManufacturer').innerHTML = '<option value="">-- Select --</option>' +
            manufacturers[d.type].map(m => '<option value="' + m + '"' + (d.manufacturer === m ? ' selected' : '') + '>' + m + '</option>').join('');
    }

    const hasOS = !!operatingSystems[d.type];
    showSection('osGroup', hasOS);
    if (hasOS) {
        document.getElementById('propOS').innerHTML = '<option value="">-- Select --</option>' +
            operatingSystems[d.type].map(o => '<option value="' + o + '"' + (d.os === o ? ' selected' : '') + '>' + o + '</option>').join('');
    }

    const serialTypes = ['desktop', 'laptop', 'server'];
    showSection('serialGroup', serialTypes.includes(d.type));
    if (serialTypes.includes(d.type)) document.getElementById('propSerial').value = d.serial || '';

    renderConnectedToList(d);
}

function getConnIcon(connType) {
    const c = connColor(connType);
    const open = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="' + c + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    if (connType === 'wireless') return open + '<path d="M6 8a8 8 0 0112 0"/><path d="M8.5 10.5a5 5 0 017 0"/><circle cx="12" cy="14" r="1.5" fill="' + c + '"/></svg>';
    if (connType === 'vpn') return open + '<rect x="3" y="11" width="18" height="8" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>';
    return open + '<path d="M4 12h6"/><circle cx="14" cy="12" r="3"/><path d="M17 12h3"/></svg>';
}

function getConnBadge(connType) {
    const spec = CONN_COLORS[connType];
    if (!spec) return null;
    return '<span style="display:inline-block;padding:3px 8px;background:rgba(' + spec.rgb + ',0.15);' +
        'border:1px solid rgba(' + spec.rgb + ',0.3);border-radius:6px;font-size:0.6rem;color:' +
        spec.solid + ';font-weight:500;">' + spec.label + '</span>';
}

function renderConnectedToList(d) {
    const upstreamContainer = document.getElementById('upstreamList');
    const downstreamContainer = document.getElementById('downstreamList');
    const connections = state.connections.filter(c => c.from === d.id || c.to === d.id);

    if (!d.parentPorts) d.parentPorts = {};

    const upstream = [];
    const downstream = [];

    connections.forEach(conn => {
        const isFrom = conn.from === d.id;
        const otherId = isFrom ? conn.to : conn.from;
        const otherDevice = state.devices.find(dev => dev.id === otherId);
        if (!otherDevice) return;
        if (isFrom) {
            upstream.push({ conn, device: otherDevice });
        } else {
            downstream.push({ conn, device: otherDevice });
        }
    });

    function buildConnRow(entry, d) {
        const { conn, device } = entry;
        const connIcon = getConnIcon(conn.type);
        const badge = getConnBadge(conn.type);
        const portValue = d.parentPorts[device.id] || '';

        let portField;
        if (badge) {
            portField = badge;
        } else {
            portField = '<input type="text" class="form-input" style="width:55px;padding:3px 5px;font-size:0.65rem;text-align:center;" ' +
                'placeholder="Port" value="' + portValue + '" ' +
                'oninput="updateParentPort(\'' + device.id + '\', this.value)" ' +
                'title="Port on ' + device.name + '">';
        }

        return '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid var(--glass-border);">' +
            '<span>' + connIcon + '</span>' +
            '<div style="flex:1;min-width:0;">' +
                '<div style="font-weight:500;color:var(--text-primary);font-size:0.72rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + device.name + '</div>' +
                '<div style="font-size:0.6rem;color:var(--text-muted);">' + (types[device.type]?.name || device.type) + '</div>' +
            '</div>' +
            portField +
            '<button onclick="flipConnection(\'' + conn.id + '\')" title="Flip direction" style="background:none;border:1px solid var(--glass-border);border-radius:4px;cursor:pointer;padding:2px 4px;color:var(--text-muted);font-size:0.7rem;line-height:1;">&#x21C5;</button>' +
        '</div>';
    }

    if (upstream.length === 0) {
        upstreamContainer.innerHTML = '<p style="font-size:0.65rem;color:var(--text-muted);text-align:center;padding:4px 0;">None</p>';
    } else {
        upstreamContainer.innerHTML = upstream.map(e => buildConnRow(e, d)).join('');
    }

    if (downstream.length === 0) {
        downstreamContainer.innerHTML = '<p style="font-size:0.65rem;color:var(--text-muted);text-align:center;padding:4px 0;">None</p>';
    } else {
        downstreamContainer.innerHTML = downstream.map(e => buildConnRow(e, d)).join('');
    }
}

function flipConnection(connId) {
    const conn = state.connections.find(c => c.id === connId);
    if (!conn) return;
    saveState();
    const tmpFrom = conn.from;
    const tmpFromPos = conn.fromPos;
    conn.from = conn.to;
    conn.fromPos = conn.toPos;
    conn.to = tmpFrom;
    conn.toPos = tmpFromPos;
    drawConnections();
    if (state.selected) renderConnectedToList(state.selected);
}

function updateParentPort(parentId, portValue) {
    if (!state.selected) return;
    if (!state.selected.parentPorts) state.selected.parentPorts = {};
    if (state.selected.parentPorts[parentId] === portValue) return;
    saveStateDebounced();
    state.selected.parentPorts[parentId] = portValue;
}

function renderSwitchVLANList(d) {
    const container = document.getElementById('switchVLANList');
    if (state.vlans.length === 0) {
        container.innerHTML = '<p style="font-size:10px;color:var(--text-muted);text-align:center;">No VLANs configured. Add VLANs in Config.</p>';
        return;
    }

    // Initialize vlans array on device if not present
    if (!d.assignedVlans) d.assignedVlans = [];

    container.innerHTML = state.vlans.map(vlan => {
        const isChecked = d.assignedVlans.includes(vlan.id);
        return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.75rem;color:var(--text-secondary);padding:4px 0;">' +
            '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="toggleSwitchVLAN(' + vlan.id + ')" style="width:14px;height:14px;accent-color:var(--primary);">' +
            '<span style="flex:1">VLAN ' + vlan.id + ' - ' + vlan.name + '</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + vlan.subnet + '</span>' +
        '</label>';
    }).join('');
}

function toggleSwitchVLAN(vlanId) {
    if (!state.selected || state.selected.type !== 'switch') return;
    saveState();
    if (!state.selected.assignedVlans) state.selected.assignedVlans = [];

    const index = state.selected.assignedVlans.indexOf(vlanId);
    if (index === -1) {
        state.selected.assignedVlans.push(vlanId);
    } else {
        state.selected.assignedVlans.splice(index, 1);
    }
}

function renderAPSSIDList(d) {
    const container = document.getElementById('apSSIDList');
    if (state.ssids.length === 0) {
        container.innerHTML = '<p style="font-size:10px;color:var(--text-muted);text-align:center;">No SSIDs configured. Add SSIDs in Config.</p>';
        return;
    }

    // Initialize ssids array on device if not present
    if (!d.ssids) d.ssids = [];

    container.innerHTML = state.ssids.map(ssid => {
        const isChecked = d.ssids.includes(ssid.name);
        const vlanInfo = ssid.vlan ? ' (VLAN ' + ssid.vlan + ')' : '';
        return '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.75rem;color:var(--text-secondary);padding:4px 0;">' +
            '<input type="checkbox" ' + (isChecked ? 'checked' : '') + ' onchange="toggleAPSSID(\'' + ssid.name + '\')" style="width:14px;height:14px;accent-color:var(--primary);">' +
            '<span style="flex:1">' + ssid.name + '</span>' +
            '<span style="font-size:0.65rem;color:var(--text-muted);">' + ssid.security + vlanInfo + '</span>' +
        '</label>';
    }).join('');
}

function toggleAPSSID(ssidName) {
    if (!state.selected || state.selected.type !== 'ap') return;
    saveState();
    if (!state.selected.ssids) state.selected.ssids = [];

    const index = state.selected.ssids.indexOf(ssidName);
    if (index === -1) {
        state.selected.ssids.push(ssidName);
    } else {
        state.selected.ssids.splice(index, 1);
    }
}

function renderVMList(d) {
    const list = document.getElementById('vmList');
    list.innerHTML = (!d.vms || d.vms.length === 0) 
        ? '<p style="font-size:10px;color:var(--text-muted);text-align:center;">No VMs</p>'
        : d.vms.map((vm, i) => '<div class="vlan-item"><div class="dot status-' + vm.status + '" style="width:8px;height:8px;border-radius:50%;"></div><span style="flex:1">' + vm.name + '</span><button class="vlan-del" onclick="removeVM(' + i + ')">&times;</button></div>').join('');
}

function removeVM(index) {
    if (state.selected && state.selected.vms) {
        saveState();
        state.selected.vms.splice(index, 1);
        renderVMsOnDevice(state.selected);
        renderVMList(state.selected);
    }
}

function updateDeviceProp(key, value) {
    if (!state.selected) return;
    if (state.selected[key] === value) return;
    saveStateDebounced();
    state.selected[key] = value;
    const el = document.getElementById(state.selected.id);
    if (key === 'name') el.querySelector('.device-name').textContent = value;
    if (key === 'ip') el.querySelector('.device-ip').textContent = value || 'No IP';
    // Text changes can reflow the box, so drop the measurement.
    if (key === 'name' || key === 'ip') sceneIndex.invalidateSize(state.selected.id);
}

function setStatus(status) {
    if (!state.selected) return;
    if (state.selected.status === status) return;
    saveState();
    state.selected.status = status;
    document.getElementById(state.selected.id).querySelector('.device-status').className = 'device-status status-' + status;
    document.querySelectorAll('.status-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.status === status));
}

function deleteSelected() {
    const ids = new Set(selection);
    if (ids.size === 0) return;
    saveState();
    state.connections = state.connections.filter(c => !ids.has(c.from) && !ids.has(c.to));
    state.devices = state.devices.filter(d => !ids.has(d.id));
    ids.forEach(id => {
        document.getElementById(id)?.remove();
        sceneIndex.removeDevice(id);
    });

    deselectAll();
    clearWaypointHandles();
    editingConn = null;
    drawConnections();
    updateCounts();
    if (state.devices.length === 0 && state.zones.length === 0) {
        document.getElementById('emptyState').style.display = 'block';
    }
}

function updateCounts() {
    const q = document.getElementById('deviceSearch');
    if (q && q.value.trim()) renderSearch(q.value);
    document.getElementById('deviceCount').textContent = formatCount(state.devices.length, 'device');
    document.getElementById('zoneCount').textContent = formatCount(state.zones.length, 'zone');
    document.getElementById('connCount').textContent = formatCount(state.connections.length, 'connection');
}

function updateVlanSelect() {
    const bulk = document.getElementById('multiVlan');
    if (bulk) {
        bulk.innerHTML = '<option value="">-- Choose a VLAN --</option>' +
            state.vlans.map(v => '<option value="' + v.id + '">VLAN ' + v.id + ' - ' + v.name + '</option>').join('');
    }
    document.getElementById('propVLAN').innerHTML = '<option value="">Select VLAN</option>' + 
        state.vlans.map(v => '<option value="' + v.id + '">VLAN ' + v.id + ' - ' + v.name + '</option>').join('');
}

function updateSSIDVlanSelect() {
    document.getElementById('newSSIDVlan').innerHTML = '<option value="">No VLAN</option>' + 
        state.vlans.map(v => '<option value="' + v.id + '">VLAN ' + v.id + ' - ' + v.name + '</option>').join('');
}

function openConfig() {
    openModal('configModal');
    document.getElementById('dnsProvider').value = state.config.dnsProvider;
    document.getElementById('dnsPrimary').value = state.config.dnsPrimary;
    document.getElementById('dnsSecondary').value = state.config.dnsSecondary;
    document.getElementById('dhcpType').value = state.config.dhcpType;
    renderVlanList();
    renderSSIDList();
    updateDnsFields();
    updateDhcpDevices();
    updateSSIDVlanSelect();
}

function renderVlanList() {
    document.getElementById('vlanList').innerHTML = state.vlans.map((v, i) => 
        '<div class="vlan-item"><span class="vlan-id">VLAN ' + v.id + '</span><span class="vlan-name">' + v.name + '</span><span class="vlan-subnet">' + v.subnet + '</span><button class="vlan-del" onclick="deleteVlan(' + i + ')">&times;</button></div>'
    ).join('');
}

function renderSSIDList() {
    const container = document.getElementById('ssidList');
    if (state.ssids.length === 0) {
        container.innerHTML = '<p style="font-size:0.7rem;color:var(--text-muted);text-align:center;padding:10px;">No SSIDs configured</p>';
        return;
    }
    container.innerHTML = state.ssids.map((s, i) => {
        const vlanInfo = s.vlan ? 'VLAN ' + s.vlan : 'No VLAN';
        return '<div class="vlan-item"><span class="vlan-id" style="min-width:auto;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--secondary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a8 8 0 0112 0"/><path d="M8.5 10.5a5 5 0 017 0"/><circle cx="12" cy="14" r="1.5" fill="var(--secondary)"/></svg></span><span class="vlan-name" style="flex:1;">' + s.name + '</span><span class="vlan-subnet" style="font-size:0.6rem;">' + s.security + ' / ' + vlanInfo + '</span><button class="vlan-del" onclick="deleteSSID(' + i + ')">&times;</button></div>';
    }).join('');
}

function deleteSSID(index) {
    if (!state.ssids[index]) return;
    const ssidName = state.ssids[index].name;
    const aps = state.devices.filter(d => d.type === 'ap' && d.ssids && d.ssids.includes(ssidName)).length;
    const detail = aps ? ' It is broadcast by ' + formatCount(aps, 'access point') + '.' : '';
    if (!confirm('Delete SSID \u201c' + ssidName + '\u201d?' + detail)) return;
    saveState();
    state.ssids.splice(index, 1);
    // Remove this SSID from all access points
    state.devices.forEach(d => {
        if (d.type === 'ap' && d.ssids) {
            d.ssids = d.ssids.filter(s => s !== ssidName);
        }
    });
    renderSSIDList();
}

function saveSSID() {
    const name = document.getElementById('newSSIDName').value.trim();
    const security = document.getElementById('newSSIDSecurity').value;
    const vlan = document.getElementById('newSSIDVlan').value;

    if (!name) {
        toast.show('Give the SSID a name.', { type: 'warn' });
        return;
    }
    {
        // Check for duplicate
        if (state.ssids.some(s => s.name === name)) {
            toast.show('An SSID named \u201c' + name + '\u201d already exists.', { type: 'warn' });
            return;
        }
        saveState();
        state.ssids.push({ name, security, vlan });
        renderSSIDList();
        closeModal('ssidModal');
        document.getElementById('newSSIDName').value = '';
        document.getElementById('newSSIDSecurity').value = 'WPA2-Personal';
        document.getElementById('newSSIDVlan').value = '';
    }
}

function deleteVlan(index) {
    const vlan = state.vlans[index];
    if (!vlan) return;
    const users = state.devices.filter(d => String(d.vlan) === String(vlan.id)).length;
    const detail = users ? ' It is assigned to ' + formatCount(users, 'device') + '.' : '';
    if (!confirm('Delete VLAN ' + vlan.id + ' (' + vlan.name + ')?' + detail)) return;
    saveState();
    state.vlans.splice(index, 1);
    // Clear references, or devices keep pointing at a VLAN that is gone.
    const gone = String(vlan.id);
    state.devices.forEach(d => {
        if (String(d.vlan) === gone) d.vlan = '';
        if (d.assignedVlans) {
            d.assignedVlans = d.assignedVlans.filter(v => String(v) !== gone);
        }
    });
    state.ssids.forEach(s => {
        if (String(s.vlan) === gone) s.vlan = '';
    });
    if (state.selected) showProps(state.selected);
    renderVlanList();
    renderSSIDList();
    updateVlanSelect();
    updateNetworkInfoBox();
}

function saveVlan() {
    const id = parseInt(document.getElementById('newVlanID').value);
    const name = document.getElementById('newVlanName').value;
    const subnet = document.getElementById('newVlanSubnet').value;
    const gateway = document.getElementById('newVlanGateway').value;
    if (!id || !name || !subnet) {
        toast.show('A VLAN needs an ID, a name and a subnet.', { type: 'warn' });
        return;
    }
    if (state.vlans.some(v => v.id === id)) {
        toast.show('VLAN ' + id + ' already exists.', { type: 'warn' });
        return;
    }
    if (id < 1 || id > 4094) {
        toast.show('VLAN IDs run from 1 to 4094.', { type: 'warn' });
        return;
    }
    {
        saveState();
        state.vlans.push({ id, name, subnet, gateway });
        renderVlanList();
        updateVlanSelect();
        updateNetworkInfoBox();
        closeModal('vlanModal');
        document.getElementById('newVlanID').value = '';
        document.getElementById('newVlanName').value = '';
        document.getElementById('newVlanSubnet').value = '';
        document.getElementById('newVlanGateway').value = '';
    }
}

function updateDnsFields() {
    const prov = document.getElementById('dnsProvider').value;
    document.getElementById('dnsServerGroup').style.display = prov === 'Server Hosted' ? 'block' : 'none';
    if (prov === 'Server Hosted') {
        document.getElementById('dnsServerDevice').innerHTML = '<option value="">Select...</option>' +
            state.devices.filter(d => d.type === 'server').map(d => '<option value="' + d.id + '">' + d.name + '</option>').join('');
    }
}

function updateDhcpDevices() {
    const type = document.getElementById('dhcpType').value;
    const typeMap = { 'Router': 'router', 'Dedicated Server': 'server', 'Firewall': 'firewall' };
    const devices = state.devices.filter(d => d.type === typeMap[type]);
    document.getElementById('dhcpDevice').innerHTML = '<option value="">Select...</option>' +
        devices.map(d => '<option value="' + d.id + '">' + d.name + '</option>').join('');
    if (state.config.dhcpDevice) {
        document.getElementById('dhcpDevice').value = state.config.dhcpDevice;
    }
}

function saveConfig() {
    saveState();
    state.config.dnsProvider = document.getElementById('dnsProvider').value;
    state.config.dnsPrimary = document.getElementById('dnsPrimary').value;
    state.config.dnsSecondary = document.getElementById('dnsSecondary').value;
    state.config.dhcpType = document.getElementById('dhcpType').value;
    state.config.dhcpDevice = document.getElementById('dhcpDevice').value;
    updateNetworkInfoBox();
    closeModal('configModal');
}

function saveVM() {
    if (!state.selected || state.selected.type !== 'vmhost') return;
    const name = document.getElementById('newVMName').value;
    const status = document.getElementById('newVMStatus').value;
    if (!name) {
        toast.show('Give the VM a name.', { type: 'warn' });
        return;
    }
    {
        saveState();
        state.selected.vms.push({ name, status });
        renderVMsOnDevice(state.selected);
        renderVMList(state.selected);
        closeModal('vmModal');
        document.getElementById('newVMName').value = '';
    }
}

function clearAll() {
    if (state.devices.length === 0 && state.zones.length === 0) return;
    if (confirm('Clear all devices, connections and zones? This can be undone with Ctrl+Z.')) {
        saveState();
        state.devices = [];
        state.connections = [];
        state.zones = [];
        state.counter = 0;
        state.zoneCounter = 0;
        document.querySelectorAll('.network-device').forEach(el => el.remove());
        document.querySelectorAll('.network-zone').forEach(el => el.remove());
        svg.innerHTML = '';
        clearWaypointHandles();
        editingConn = null;
        deselectAll();
        updateCounts();
        document.getElementById('emptyState').style.display = 'block';
    }
}

function getVlanName(vlanId) {
    const vlan = state.vlans.find(v => v.id === vlanId);
    return vlan ? `VLAN ${vlan.id} - ${vlan.name}` : 'None';
}


/**
 * html2canvas and jsPDF are ~550KB and only the export path needs them.
 * They used to be parser-blocking <script> tags in every shell's <head>,
 * paid for on every page load whether or not anyone exported anything.
 */
const EXPORT_LIBS = [
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      ready: () => typeof window.html2canvas === 'function' },
    { url: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
      ready: () => !!(window.jspdf && window.jspdf.jsPDF) }
];

let exportLibsPromise = null;

function loadScript(url) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Could not load ' + url));
        document.head.appendChild(s);
    });
}

function loadExportLibs() {
    if (EXPORT_LIBS.every(l => l.ready())) return Promise.resolve();
    if (!exportLibsPromise) {
        exportLibsPromise = Promise.all(
            EXPORT_LIBS.filter(l => !l.ready()).map(l => loadScript(l.url))
        ).catch(err => {
            exportLibsPromise = null;   // allow a retry after a transient failure
            throw err;
        });
    }
    return exportLibsPromise;
}

function generatePDF() {
    const title = document.getElementById('pdfTitle').value || 'Network Diagram';
    const client = document.getElementById('clientName').value || '';
    const site = document.getElementById('siteName').value || '';
    const orientation = document.getElementById('pdfOrientation').value;
    const includeInventory = document.getElementById('includeInventory').checked;
    closeModal('exportModal');

    if (state.devices.length === 0 && state.zones.length === 0) {
        toast.show('Nothing to export yet \u2014 add a device or a zone first.', { type: 'warn' });
        return;
    }

    // Calculate bounding box of all devices and zones
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.devices.forEach(d => {
        const el = document.getElementById(d.id);
        const w = el ? el.offsetWidth : 120;
        const h = el ? el.offsetHeight : 100;
        minX = Math.min(minX, d.x);
        minY = Math.min(minY, d.y);
        maxX = Math.max(maxX, d.x + w);
        maxY = Math.max(maxY, d.y + h);
    });
    state.zones.forEach(z => {
        minX = Math.min(minX, z.x);
        minY = Math.min(minY, z.y);
        maxX = Math.max(maxX, z.x + z.width);
        maxY = Math.max(maxY, z.y + z.height);
    });

    // Add padding around the content
    const padding = 20;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;

    // Include network info box dimensions
    const infoBox = document.getElementById('networkInfoBox');
    const infoBoxWidth = infoBox.offsetWidth + 40;
    const infoBoxHeight = infoBox.offsetHeight + 40;

    // Create a temporary container for rendering
    const tempContainer = document.createElement('div');
    tempContainer.style.cssText = `
        position: fixed; left: -10000px; top: 0;
        background: #050505; padding: 20px;
    `;
    document.body.appendChild(tempContainer);

    // Create SVG for connections
    const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    tempSvg.setAttribute('width', contentWidth);
    tempSvg.setAttribute('height', contentHeight);
    tempSvg.style.cssText = 'position: absolute; top: 0; left: 0; pointer-events: none;';

    // Draw connections offset to bounding box
    let paths = '';
    state.connections.forEach(conn => {
        const from = getConnectionPoint(conn.from, conn.fromPos);
        const to = getConnectionPoint(conn.to, conn.toPos);
        // Offset into bounding box coordinate space
        const offsetFrom = { x: from.x - minX, y: from.y - minY };
        const offsetTo   = { x: to.x   - minX, y: to.y   - minY };
        // Offset any custom waypoints too
        const offsetWaypoints = (conn.waypoints || []).map(wp => ({ x: wp.x - minX, y: wp.y - minY }));
        const path = buildConnPath(offsetFrom, offsetTo, conn.fromPos, conn.routingStyle || 'curved', offsetWaypoints);
        const strokeColor = connColor(conn.type);
        const dashArray = conn.type === 'wireless' ? 'stroke-dasharray="8,4"' : '';
        const sw = conn.type === 'vpn' ? '3.5' : '2';
        if (conn.type === 'vpn') paths += `<path d="${path}" stroke="rgba(${CONN_COLORS.vpn.rgb},0.25)" stroke-width="8" fill="none"/>`;
        paths += `<path d="${path}" stroke="${strokeColor}" stroke-width="${sw}" fill="none" ${dashArray}/>`;
    });
    tempSvg.innerHTML = paths;

    // Create wrapper - diagram only, no info box (config gets its own page)
    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position: relative; width: ${contentWidth}px; height: ${contentHeight}px; background: #ffffff;`;

    // Diagram area
    const diagramArea = document.createElement('div');
    diagramArea.style.cssText = `position: relative; width: ${contentWidth}px; height: ${contentHeight}px;`;
    diagramArea.appendChild(tempSvg);

    // Clone and position zones (render first so they appear behind devices)
    state.zones.forEach(z => {
        const orig = document.getElementById(z.id);
        if (orig) {
            const clone = orig.cloneNode(true);
            clone.style.left = (z.x - minX) + 'px';
            clone.style.top = (z.y - minY) + 'px';
            clone.style.width = z.width + 'px';
            clone.style.height = z.height + 'px';
            clone.classList.remove('selected');
            // Hide resize handle
            const resizeHandle = clone.querySelector('.zone-resize');
            if (resizeHandle) resizeHandle.style.display = 'none';
            diagramArea.appendChild(clone);
        }
    });

    // Clone and position devices
    state.devices.forEach(d => {
        const orig = document.getElementById(d.id);
        const clone = orig.cloneNode(true);
        clone.style.left = (d.x - minX) + 'px';
        clone.style.top = (d.y - minY) + 'px';
        clone.classList.remove('selected', 'connecting');
        clone.querySelectorAll('.conn-point').forEach(cp => cp.style.display = 'none');
        diagramArea.appendChild(clone);
    });

    wrapper.appendChild(diagramArea);
    tempContainer.appendChild(wrapper);

    const exportScale = safeExportScale(contentWidth, contentHeight);
    const progress = toast.progress('Generating PDF');

    loadExportLibs().then(() => html2canvas(wrapper, {
        backgroundColor: '#ffffff',
        scale: exportScale,
        useCORS: true,
        logging: false
    })).then(canvasImg => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4' });
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        // Shared page header helper — used by all pages
        function drawPageHeader(pageTitle) {
            pdf.setFillColor(0, 30, 98);
            pdf.rect(0, 0, pageWidth, 16, 'F');
            const headerLeft = [client, site].filter(Boolean).join(' - ');
            if (headerLeft) {
                pdf.setTextColor(234, 234, 234);
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'bold');
                pdf.text(headerLeft, 10, 10);
            }
            pdf.setTextColor(234, 234, 234);
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(pageTitle, pageWidth / 2, 10, { align: 'center' });
            pdf.setFontSize(9);
            pdf.setFont('helvetica', 'normal');
            pdf.text(new Date().toLocaleDateString(), pageWidth - 10, 10, { align: 'right' });
        }

        drawPageHeader('Network Diagram');

        // Calculate image dimensions to fit and center
        // PNG is lossless and a large diagram's data URL is held in memory
        // alongside the source canvas; JPEG keeps the peak well down.
        const megapixels = (canvasImg.width * canvasImg.height) / 1e6;
        const imgData = megapixels > 8
            ? canvasImg.toDataURL('image/jpeg', 0.92)
            : canvasImg.toDataURL('image/png');
        const imgFormat = megapixels > 8 ? 'JPEG' : 'PNG';
        const availableWidth = pageWidth - 10;
        const availableHeight = pageHeight - 21;

        const imgAspect = canvasImg.width / canvasImg.height;
        const availAspect = availableWidth / availableHeight;

        let finalWidth, finalHeight;
        if (imgAspect > availAspect) {
            finalWidth = availableWidth;
            finalHeight = availableWidth / imgAspect;
        } else {
            finalHeight = availableHeight;
            finalWidth = availableHeight * imgAspect;
        }

        const imgX = (pageWidth - finalWidth) / 2;
        const imgY = 20 + (availableHeight - finalHeight) / 2;

        pdf.addImage(imgData, imgFormat, imgX, imgY, finalWidth, finalHeight);

        // Add device inventory pages if checked
        if (includeInventory && (state.devices.length > 0 || state.zones.length > 0)) {
            // Group devices by type — routers appear on the Network Config page instead
            const devicesByType = {};
            state.devices.forEach(d => {
                if (d.type === 'router') return;
                if (!devicesByType[d.type]) devicesByType[d.type] = [];
                devicesByType[d.type].push(d);
            });

            let pageNum = 2;
            let yPos = 24;

            // Helper to get connected device info with port
            function getConnectedTo(d) {
                const connections = state.connections.filter(c => c.from === d.id || c.to === d.id);
                if (connections.length === 0) return '-';

                return connections.map(conn => {
                    const parentId = conn.from === d.id ? conn.to : conn.from;
                    const parentDevice = state.devices.find(dev => dev.id === parentId);
                    if (!parentDevice) return '';
                    const port = d.parentPorts && d.parentPorts[parentId] ? ' (Port ' + d.parentPorts[parentId] + ')' : '';
                    return parentDevice.name + port;
                }).filter(Boolean).join(', ') || '-';
            }

            // ── NETWORK CONFIGURATION PAGE (page 2) ─────────────────────────────
            pdf.addPage();
            drawPageHeader('Network Configuration');
            yPos = 24;

            function drawCfgSectionHeader(label, count) {
                if (yPos > pageHeight - 40) {
                    pdf.addPage();
                    drawPageHeader('Network Configuration');
                    yPos = 24;
                }
                pdf.setFillColor(15, 113, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 8, 'F');
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(255, 255, 255);
                const countStr = count !== undefined ? ' (' + count + ')' : '';
                pdf.text(label + countStr, 12, yPos + 1);
                yPos += 10;
            }

            function drawCfgColHeaders(cols, widths) {
                pdf.setFillColor(240, 240, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 7, 'F');
                pdf.setFontSize(6);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(60, 60, 60);
                let xOff = 10;
                cols.forEach((col, i) => { pdf.text(col, xOff + 1, yPos); xOff += widths[i]; });
                yPos += 6;
            }

            function drawCfgDataRow(rowData, widths, rowIdx) {
                if (yPos > pageHeight - 15) {
                    pdf.addPage();
                    drawPageHeader('Network Configuration');
                    yPos = 24;
                }
                pdf.setFillColor(rowIdx % 2 === 0 ? 250 : 255, rowIdx % 2 === 0 ? 250 : 255, rowIdx % 2 === 0 ? 250 : 255);
                pdf.rect(10, yPos - 4, pageWidth - 20, 6, 'F');
                pdf.setFontSize(6);
                pdf.setFont('helvetica', 'normal');
                pdf.setTextColor(40, 40, 40);
                let xOff = 10;
                rowData.forEach((val, j) => {
                    const maxChars = Math.floor(widths[j] / 1.8);
                    pdf.text(String(val || '-').substring(0, maxChars), xOff + 1, yPos);
                    xOff += widths[j];
                });
                yPos += 6;
            }

            // Internet Connection (Routers)
            const routers = state.devices.filter(d => d.type === 'router');
            if (routers.length > 0) {
                drawCfgSectionHeader('Internet Connection', routers.length);
                const rCols = ['ISP / Name', 'Conn. Type', 'Download', 'Upload', 'IP Address', 'Subnet Mask', 'Default Gateway', 'Notes'];
                const rWidths = orientation === 'landscape'
                    ? [38, 24, 24, 24, 36, 32, 36, 56]
                    : [26, 18, 18, 18, 28, 26, 28, 28];
                drawCfgColHeaders(rCols, rWidths);
                routers.forEach((d, i) => {
                    drawCfgDataRow([
                        d.name,
                        d.connectionType || '-',
                        d.downloadSpeed ? d.downloadSpeed + ' Mbps' : '-',
                        d.uploadSpeed   ? d.uploadSpeed   + ' Mbps' : '-',
                        d.ip            || '-',
                        d.subnetMask    || '-',
                        d.defaultGateway || '-',
                        d.notes         || '-'
                    ], rWidths, i);
                });
                yPos += 6;
            }

            // DNS Configuration
            drawCfgSectionHeader('DNS Configuration');
            const dnsCols = ['Provider', 'Primary DNS', 'Secondary DNS'];
            const dnsWidths = orientation === 'landscape' ? [90, 80, 80] : [65, 57, 57];
            drawCfgColHeaders(dnsCols, dnsWidths);
            drawCfgDataRow([
                state.config.dnsProvider  || '-',
                state.config.dnsPrimary   || '-',
                state.config.dnsSecondary || '-'
            ], dnsWidths, 0);
            yPos += 6;

            // DHCP Configuration
            drawCfgSectionHeader('DHCP Configuration');
            const dhcpCols = ['Managed By', 'DHCP Device / Server'];
            const dhcpWidths = orientation === 'landscape' ? [120, 130] : [90, 90];
            drawCfgColHeaders(dhcpCols, dhcpWidths);
            drawCfgDataRow([
                state.config.dhcpType || '-',
                state.config.dhcpDevice
                    ? (state.devices.find(d => d.id === state.config.dhcpDevice)?.name || state.config.dhcpDevice)
                    : '-'
            ], dhcpWidths, 0);
            yPos += 6;

            // VLANs
            if (state.vlans && state.vlans.length > 0) {
                drawCfgSectionHeader('VLANs', state.vlans.length);
                const vCols = ['VLAN ID', 'Name', 'Subnet', 'Gateway'];
                const vWidths = orientation === 'landscape' ? [28, 60, 80, 82] : [20, 45, 58, 57];
                drawCfgColHeaders(vCols, vWidths);
                state.vlans.forEach((v, i) => {
                    drawCfgDataRow([String(v.id), v.name || '-', v.subnet || '-', v.gateway || '-'], vWidths, i);
                });
                yPos += 6;
            }

            // Wireless SSIDs
            if (state.ssids && state.ssids.length > 0) {
                drawCfgSectionHeader('Wireless SSIDs', state.ssids.length);
                const sCols = ['SSID Name', 'Band', 'Security', 'VLAN', 'Notes'];
                const sWidths = orientation === 'landscape' ? [60, 28, 38, 40, 84] : [44, 22, 30, 30, 54];
                drawCfgColHeaders(sCols, sWidths);
                state.ssids.forEach((s, i) => {
                    drawCfgDataRow([
                        s.name     || '-',
                        s.band     || '-',
                        s.security || '-',
                        s.vlan ? getVlanName(s.vlan) : '-',
                        s.notes    || '-'
                    ], sWidths, i);
                });
                yPos += 6;
            }

            // ── DEVICE LIST PAGE(S) ──────────────────────────────────────────────
            const typeConfigs = {
                'switch': {
                    cols: ['Name', 'Manufacturer', 'Model', 'IP Address', 'Ports', 'PoE', 'VLANs', 'Notes'],
                    widths: orientation === 'landscape' ? [30, 28, 30, 35, 15, 15, 50, 67] : [22, 20, 22, 28, 12, 12, 40, 34],
                    getData: (d) => [
                        d.name, d.manufacturer || '-', d.model || '-', d.ip || '-',
                        d.ports || '-', d.poe ? 'Yes' : 'No',
                        d.assignedVlans ? d.assignedVlans.map(v => 'VLAN ' + v).join(', ') : '-',
                        d.notes || '-'
                    ]
                },
                'firewall': {
                    cols: ['Name', 'Manufacturer', 'Model', 'IP Address', 'MAC Address', 'Ports', 'Notes'],
                    widths: orientation === 'landscape' ? [35, 30, 35, 38, 42, 18, 72] : [24, 22, 24, 30, 35, 14, 41],
                    getData: (d) => [d.name, d.manufacturer || '-', d.model || '-', d.ip || '-', d.mac || '-', d.ports || '-', d.notes || '-']
                },
                'ap': {
                    cols: ['Name', 'Manufacturer', 'Model', 'IP Address', 'MAC Address', 'Connected To', 'SSIDs'],
                    widths: orientation === 'landscape' ? [30, 20, 30, 35, 38, 67, 50] : [20, 13, 22, 28, 32, 55, 20],
                    getData: (d) => [
                        d.name, d.manufacturer || '-', d.model || '-', d.ip || '-', d.mac || '-',
                        getConnectedTo(d), d.ssids ? d.ssids.join(', ') : '-'
                    ]
                },
                'router': {
                    cols: ['ISP', 'Connection', 'Download', 'Upload', 'IP Address', 'Subnet Mask', 'Default Gateway', 'Notes'],
                    widths: orientation === 'landscape' ? [40, 25, 30, 30, 40, 38, 40, 57] : [28, 20, 25, 25, 32, 30, 32, 28],
                    getData: (d) => [
                        d.name, d.connectionType || '-', 
                        d.downloadSpeed ? d.downloadSpeed + ' Mbps' : '-',
                        d.uploadSpeed ? d.uploadSpeed + ' Mbps' : '-',
                        d.ip || '-',
                        d.subnetMask || '-',
                        d.defaultGateway || '-',
                        d.notes || '-'
                    ]
                },
                'printer': {
                    cols: ['Name', 'Manufacturer', 'Model', 'IP Address', 'MAC Address', 'VLAN', 'Notes'],
                    widths: orientation === 'landscape' ? [35, 30, 35, 35, 40, 35, 60] : [24, 22, 25, 30, 35, 28, 26],
                    getData: (d) => [d.name, d.manufacturer || '-', d.model || '-', d.ip || '-', d.mac || '-', getVlanName(d.vlan), d.notes || '-']
                },
                'desktop': {
                    cols: ['Name', 'Manufacturer', 'OS', 'Serial', 'IP Address', 'Connected To', 'Notes'],
                    widths: orientation === 'landscape' ? [28, 19, 28, 28, 30, 70, 67] : [18, 11, 20, 20, 24, 60, 37],
                    getData: (d) => [d.name, d.manufacturer || '-', d.os || '-', d.serial || '-', d.ip || '-', getConnectedTo(d), d.notes || '-']
                },
                'laptop': {
                    cols: ['Name', 'Manufacturer', 'OS', 'Serial', 'IP Address', 'Connected To', 'Notes'],
                    widths: orientation === 'landscape' ? [28, 19, 28, 28, 30, 70, 67] : [18, 11, 20, 20, 24, 60, 37],
                    getData: (d) => [d.name, d.manufacturer || '-', d.os || '-', d.serial || '-', d.ip || '-', getConnectedTo(d), d.notes || '-']
                },
                'server': {
                    cols: ['Name', 'Manufacturer', 'OS', 'Serial', 'IP Address', 'Connected To', 'Notes'],
                    widths: orientation === 'landscape' ? [28, 19, 28, 28, 30, 70, 67] : [18, 11, 20, 20, 24, 60, 37],
                    getData: (d) => [d.name, d.manufacturer || '-', d.os || '-', d.serial || '-', d.ip || '-', getConnectedTo(d), d.notes || '-']
                },
                'vmhost': {
                    cols: ['Name', 'Manufacturer', 'OS', 'IP Address', 'Connected To', 'VMs', 'Notes'],
                    widths: orientation === 'landscape' ? [30, 23, 32, 32, 65, 50, 38] : [20, 15, 24, 26, 55, 28, 22],
                    getData: (d) => [
                        d.name, d.manufacturer || '-', d.os || '-', d.ip || '-', getConnectedTo(d),
                        d.vms ? d.vms.map(vm => vm.name).join(', ') : '-', d.notes || '-'
                    ]
                },
                'ups': {
                    cols: ['Name', 'Manufacturer', 'Model', 'Capacity (VA)', 'Runtime (min)', 'IP Address', 'Protecting'],
                    widths: orientation === 'landscape' ? [32, 26, 30, 26, 26, 34, 96] : [22, 18, 22, 18, 18, 28, 64],
                    getData: (d) => [
                        d.name, d.manufacturer || '-', d.model || '-',
                        d.capacity || '-', d.runtime || '-', d.ip || '-',
                        (d.protects || [])
                            .map(id => (state.devices.find(x => x.id === id) || {}).name)
                            .filter(Boolean).join(', ') || '-'
                    ]
                },
                'vpn': {
                    cols: ['Name', 'Manufacturer', 'Model', 'VPN Type', 'IP Address', 'Connected To', 'Notes'],
                    widths: orientation === 'landscape' ? [30, 23, 32, 30, 35, 65, 55] : [20, 15, 24, 22, 28, 55, 26],
                    getData: (d) => [d.name, d.manufacturer || '-', d.model || '-', d.vpnType || '-', d.ip || '-', getConnectedTo(d), d.notes || '-']
                },
                'default': {
                    cols: ['Name', 'Manufacturer', 'IP Address', 'MAC Address', 'Connected To', 'VLAN', 'Notes'],
                    widths: orientation === 'landscape' ? [30, 23, 32, 38, 70, 28, 49] : [20, 15, 26, 32, 57, 16, 24],
                    getData: (d) => [d.name, d.manufacturer || '-', d.ip || '-', d.mac || '-', getConnectedTo(d), getVlanName(d.vlan), d.notes || '-']
                }
            };

            // Type display names
            const typeNames = {
                'desktop': 'Desktops', 'laptop': 'Laptops', 'cellphone': 'Cell Phones', 'tablet': 'Tablets',
                'printer': 'Printers', 'otherendpoint': 'Other Endpoints', 'server': 'Servers', 'nas': 'NAS Devices',
                'router': 'Internet Connection', 'firewall': 'Firewalls', 'switch': 'Switches', 'ap': 'Access Points',
                'vmhost': 'VM Hosts', 'vm': 'Virtual Machines', 'storage': 'Storage', 'phone': 'Desk Phones', 
                'camera': 'Security Cameras', 'iot': 'IoT Devices', 'ups': 'UPS Units', 'vpn': 'VPNs',
                'nvr': 'NVR Units'
            };

            // ── DEVICE LIST PAGE(S) ──────────────────────────────────────────────
            pdf.addPage();
            drawPageHeader('Device List');
            yPos = 24;

            // Add Cloud & On-Prem Environments section first
            const cloudOnpremZones = state.zones.filter(z => z.type === 'cloud' || z.type === 'onprem');
            if (cloudOnpremZones.length > 0) {
                // Section header
                pdf.setFillColor(15, 113, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 8, 'F');
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(255, 255, 255);
                pdf.text('Cloud & On-Prem Environments (' + cloudOnpremZones.length + ')', 12, yPos + 1);
                yPos += 10;

                // Column headers
                const envCols = ['Name', 'Type', 'Provider/Location', 'Region', 'Notes'];
                const envWidths = orientation === 'landscape' ? [40, 30, 60, 50, 90] : [30, 25, 45, 35, 55];

                pdf.setFillColor(240, 240, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 7, 'F');
                pdf.setFontSize(6);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(60, 60, 60);

                let xOffset = 10;
                envCols.forEach((col, i) => {
                    pdf.text(col, xOffset + 1, yPos);
                    xOffset += envWidths[i];
                });
                yPos += 6;

                // Environment rows
                pdf.setFont('helvetica', 'normal');
                cloudOnpremZones.forEach((z, i) => {
                    if (yPos > pageHeight - 15) {
                        pdf.addPage();
                        pageNum++;
                        drawPageHeader('Device List');
                        yPos = 24;
                    }

                    if (i % 2 === 0) {
                        pdf.setFillColor(250, 250, 250);
                    } else {
                        pdf.setFillColor(255, 255, 255);
                    }
                    pdf.rect(10, yPos - 4, pageWidth - 20, 6, 'F');

                    pdf.setFontSize(6);
                    pdf.setTextColor(40, 40, 40);

                    const typeName = z.type === 'cloud' ? 'Cloud' : 'On-Premises';
                    const providerLocation = z.type === 'cloud' ? (z.provider || '-') : (z.location || '-');
                    const region = z.type === 'cloud' ? (z.region || '-') : '-';

                    const rowData = [z.name, typeName, providerLocation, region, z.notes || '-'];
                    let xOff = 10;
                    rowData.forEach((val, j) => {
                        const maxChars = Math.floor(envWidths[j] / 1.8);
                        const truncated = String(val).substring(0, maxChars);
                        pdf.text(truncated, xOff + 1, yPos);
                        xOff += envWidths[j];
                    });

                    yPos += 6;
                });

                yPos += 6;
            }


            // Add NVR Units section
            const nvrZones = state.zones.filter(z => z.type === 'nvr');
            if (nvrZones.length > 0) {
                if (yPos > pageHeight - 40) {
                    pdf.addPage();
                    pageNum++;
                    drawPageHeader('Device List');
                    yPos = 24;
                }

                const nvrCols = ['Name', 'Manufacturer', 'Model', 'Channels', 'Storage (TB)', 'IP Address', 'Notes'];
                const nvrWidths = orientation === 'landscape' ? [35, 30, 35, 25, 30, 40, 75] : [24, 22, 25, 18, 22, 32, 47];

                pdf.setFillColor(15, 113, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 8, 'F');
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(255, 255, 255);
                pdf.text('NVR Units (' + nvrZones.length + ')', 12, yPos + 1);
                yPos += 10;

                pdf.setFillColor(240, 240, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 7, 'F');
                pdf.setFontSize(6);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(60, 60, 60);

                let xOffset = 10;
                nvrCols.forEach((col, i) => {
                    pdf.text(col, xOffset + 1, yPos);
                    xOffset += nvrWidths[i];
                });
                yPos += 6;

                pdf.setFont('helvetica', 'normal');
                nvrZones.forEach((z, i) => {
                    if (yPos > pageHeight - 15) {
                        pdf.addPage();
                        pageNum++;
                        drawPageHeader('Device List');
                        yPos = 24;
                    }

                    if (i % 2 === 0) {
                        pdf.setFillColor(250, 250, 250);
                    } else {
                        pdf.setFillColor(255, 255, 255);
                    }
                    pdf.rect(10, yPos - 4, pageWidth - 20, 6, 'F');

                    pdf.setFontSize(6);
                    pdf.setTextColor(40, 40, 40);

                    const rowData = [z.name, z.manufacturer || '-', z.model || '-', z.channels || '-', z.storage || '-', z.ip || '-', z.notes || '-'];
                    let xOff = 10;
                    rowData.forEach((val, j) => {
                        const maxChars = Math.floor(nvrWidths[j] / 1.8);
                        const truncated = String(val).substring(0, maxChars);
                        pdf.text(truncated, xOff + 1, yPos);
                        xOff += nvrWidths[j];
                    });

                    yPos += 6;
                });

                yPos += 6;
            }

            // Process each device type
            Object.keys(devicesByType).forEach(deviceType => {
                const devices = devicesByType[deviceType];
                const config = typeConfigs[deviceType] || typeConfigs['default'];
                const typeName = typeNames[deviceType] || types[deviceType]?.name || deviceType;

                // Check if we need a new page
                if (yPos > pageHeight - 40) {
                    pdf.addPage();
                    pageNum++;
                    drawPageHeader('Device List');
                    yPos = 24;
                }

                // Section header
                pdf.setFillColor(15, 113, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 8, 'F');
                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(255, 255, 255);
                pdf.text(typeName + ' (' + devices.length + ')', 12, yPos + 1);
                yPos += 10;

                // Column headers
                pdf.setFillColor(240, 240, 240);
                pdf.rect(10, yPos - 4, pageWidth - 20, 7, 'F');
                pdf.setFontSize(6);
                pdf.setFont('helvetica', 'bold');
                pdf.setTextColor(60, 60, 60);

                let xOffset = 10;
                config.cols.forEach((col, i) => {
                    pdf.text(col, xOffset + 1, yPos);
                    xOffset += config.widths[i];
                });
                yPos += 6;

                // Device rows
                pdf.setFont('helvetica', 'normal');
                devices.forEach((d, i) => {
                    // Check for page break
                    if (yPos > pageHeight - 15) {
                        pdf.addPage();
                        pageNum++;
                        drawPageHeader('Device List');
                        yPos = 24;

                        // Repeat column headers
                        pdf.setFillColor(240, 240, 240);
                        pdf.rect(10, yPos - 4, pageWidth - 20, 7, 'F');
                        pdf.setFontSize(6);
                        pdf.setFont('helvetica', 'bold');
                        pdf.setTextColor(60, 60, 60);
                        let xOff = 10;
                        config.cols.forEach((col, j) => {
                            pdf.text(col, xOff + 1, yPos);
                            xOff += config.widths[j];
                        });
                        yPos += 6;
                        pdf.setFont('helvetica', 'normal');
                    }

                    // Alternate row background
                    if (i % 2 === 0) {
                        pdf.setFillColor(250, 250, 250);
                    } else {
                        pdf.setFillColor(255, 255, 255);
                    }
                    pdf.rect(10, yPos - 4, pageWidth - 20, 6, 'F');

                    const rowData = config.getData(d);
                    pdf.setFontSize(6);
                    pdf.setTextColor(40, 40, 40);

                    let xOff = 10;
                    rowData.forEach((val, j) => {
                        const maxChars = Math.floor(config.widths[j] / 1.8);
                        const truncated = String(val).substring(0, maxChars);
                        pdf.text(truncated, xOff + 1, yPos);
                        xOff += config.widths[j];
                    });

                    yPos += 6;
                });

                yPos += 6; // Space between sections
            });

        }

        pdf.save(title.toLowerCase().replace(/\s+/g, '-') + '-' + new Date().toISOString().split('T')[0] + '.pdf');
        progress.done('PDF exported.');
    }).catch(err => {
        console.error('PDF export error:', err);
        progress.fail('PDF export failed: ' + err.message);
    }).finally(() => {
        // The offscreen container holds a full clone of the diagram. It was
        // only removed on success, so every failed export leaked one - and a
        // failure is exactly what a very large diagram produced.
        if (tempContainer.parentNode) tempContainer.parentNode.removeChild(tempContainer);
    });
}

function exportJson() {
    closeModal('saveProjectModal');
    const data = { 
        devices: state.devices, 
        connections: state.connections, 
        zones: state.zones,
        vlans: state.vlans,
        ssids: state.ssids,
        upsUnits: state.upsUnits,
        config: state.config,
        counter: state.counter,
        zoneCounter: state.zoneCounter,
        clientName: document.getElementById('clientName').value || '',
        siteName: document.getElementById('siteName').value || '',
        view: { zoom: state.zoom, panX: state.panX, panY: state.panY }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'network-project-' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    unsavedSinceExport = false;
    toast.show('Project saved to your downloads.', { type: 'success' });
}

function exportCSV() {
    closeModal('saveProjectModal');
    if (state.devices.length === 0) {
        toast.show('No devices to export.', { type: 'warn' });
        return;
    }

    // Build CSV with all device properties
    const headers = ['Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'Model', 'OS', 'Serial Number', 'Ports', 'PoE', 'Connection Type', 'Download Mbps', 'Upload Mbps', 'Subnet Mask', 'Default Gateway', 'VLAN ID', 'Status', 'Notes'];

    let csvContent = headers.join(',') + '\n';

    state.devices.forEach(d => {
        const row = [
            d.type || '',
            d.name || '',
            d.ip || '',
            d.mac || '',
            d.manufacturer || '',
            d.model || '',
            d.os || '',
            d.serial || '',
            d.ports || '',
            d.poe ? 'yes' : '',
            d.connectionType || '',
            d.downloadSpeed || '',
            d.uploadSpeed || '',
            d.subnetMask || '',
            d.defaultGateway || '',
            d.vlan || '',
            d.status || '',
            d.notes || ''
        ].map(cell => {
            const str = String(cell);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return '"' + str.replace(/"/g, '""') + '"';
            }
            return str;
        });
        csvContent += row.join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'network-devices-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    toast.show('Device list exported as CSV.', { type: 'success' });
}

function handleJsonLoad(event) {
    const file = event.target.files[0];
    if (!file) {
        event.target.value = '';
        return;
    }

    const hasWork = state.devices.length > 0 || state.zones.length > 0;
    if (hasWork && !confirm('Loading a project replaces everything on the canvas. Continue?')) {
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const parsed = JSON.parse(evt.target.result);
            const { data, migrated } = migrateUpsZones(parsed);
            saveState();
            state.devices = data.devices || [];
            state.connections = data.connections || [];
            state.vlans = data.vlans || state.vlans;
            state.ssids = data.ssids || [];
            state.upsUnits = data.upsUnits || [];
            state.config = data.config || state.config;
            if (data.clientName) {
                document.getElementById('clientName').value = data.clientName;
            }
            if (data.siteName) {
                document.getElementById('siteName').value = data.siteName;
            }
            if (data.view) {
                state.zoom = data.view.zoom || 1;
                state.panX = data.view.panX || 0;
                state.panY = data.view.panY || 0;
            }
            document.querySelectorAll('.network-device').forEach(el => el.remove());
            document.querySelectorAll('.network-zone').forEach(el => el.remove());
            state.zones = data.zones || [];
            const counters = resolveCounters(data);
            state.counter = counters.counter;
            state.zoneCounter = counters.zoneCounter;
            state.devices.forEach(d => renderDevice(d));
            state.zones.forEach(z => renderZone(z));
            drawConnections();
            updateVlanSelect();
            updateNetworkInfoBox();
            updateCounts();
            applyTransform();
            refreshAllPowerTags();
            closeModal('loadProjectModal');
            if (migrated > 0) {
                toast.show(
                    formatCount(migrated, 'UPS zone') + ' became ' +
                    (migrated === 1 ? 'a device' : 'devices') +
                    '; whatever sat inside is now listed as protected.',
                    { type: 'info', duration: 9000 }
                );
            }
            document.getElementById('emptyState').style.display =
                (state.devices.length > 0 || state.zones.length > 0) ? 'none' : 'block';
        } catch (err) {
            toast.show('Could not read that project file: ' + err.message, { type: 'error' });
        } finally {
            // Always clear, so re-selecting the same filename still fires change.
            document.getElementById('jsonFileInput').value = '';
        }
    };
    reader.readAsText(file);
}

// CSV Import/Export functions
let pendingCSVData = [];

const CSV_TEMPLATES = {
    network: {
        headers: ['Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'Model', 'Ports', 'PoE', 'Connection Type', 'Download Mbps', 'Upload Mbps', 'Status', 'Notes'],
        rows: [
            ['router', 'Comcast Business', '203.0.113.50', '', '', '', '', '', 'fiber', '1000', '1000', '', 'Primary ISP'],
            ['firewall', 'Main Firewall', '192.168.1.1', '00:1A:2B:3C:4D:01', 'Fortinet', 'FortiGate 60F', '10', '', '', '', '', 'online', 'Edge firewall'],
            ['switch', 'Core Switch', '192.168.1.2', '00:1A:2B:3C:4D:02', 'Ubiquiti', 'USW-Pro-48-PoE', '48', 'yes', '', '', '', 'online', 'Main distribution'],
            ['switch', 'Floor 2 Switch', '192.168.1.3', '00:1A:2B:3C:4D:03', 'Ubiquiti', 'USW-24-PoE', '24', 'yes', '', '', '', 'online', ''],
            ['ap', 'AP - Lobby', '192.168.1.10', '00:1A:2B:3C:4D:10', 'Ubiquiti', 'U6-Pro', '', '', '', '', '', 'online', 'Main entrance'],
            ['ap', 'AP - Office', '192.168.1.11', '00:1A:2B:3C:4D:11', 'Ubiquiti', 'U6-LR', '', '', '', '', '', 'online', 'Open office area']
        ],
        typeList: '# Valid types: router, firewall, switch, ap',
        filename: 'network-equipment-template.csv'
    },
    servers: {
        headers: ['Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'OS', 'Serial Number', 'VLAN ID', 'Status', 'Notes'],
        rows: [
            ['server', 'DC01', '192.168.20.10', '00:1A:2B:3C:4D:20', 'Dell', 'Windows Server 2022', 'DELLSRV001', '20', 'online', 'Primary Domain Controller'],
            ['server', 'DC02', '192.168.20.11', '00:1A:2B:3C:4D:21', 'Dell', 'Windows Server 2022', 'DELLSRV002', '20', 'online', 'Secondary Domain Controller'],
            ['server', 'FS01', '192.168.20.20', '00:1A:2B:3C:4D:22', 'HP/HPE', 'Windows Server 2022', 'HPEFS001', '20', 'online', 'File Server'],
            ['server', 'SQL01', '192.168.20.30', '00:1A:2B:3C:4D:23', 'Dell', 'Windows Server 2022', 'DELLSQL001', '20', 'online', 'SQL Database Server'],
            ['server', 'WEB01', '192.168.20.40', '00:1A:2B:3C:4D:24', 'Dell', 'Ubuntu Server 22.04', 'DELLWEB001', '20', 'online', 'Web Server'],
            ['vmhost', 'ESXi-01', '192.168.20.5', '00:1A:2B:3C:4D:25', 'Dell', 'VMware ESXi', 'DELLESX001', '20', 'online', 'VMware Host'],
            ['nas', 'NAS01', '192.168.20.50', '00:1A:2B:3C:4D:26', 'Synology', '', 'SYNNAS001', '20', 'online', 'Backup Storage']
        ],
        typeList: '# Valid types: server, vmhost, nas',
        filename: 'servers-template.csv'
    },
    endpoints: {
        headers: ['Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'OS', 'Serial Number', 'VLAN ID', 'Status', 'Notes'],
        rows: [
            ['desktop', 'Reception PC', '192.168.1.100', '00:1A:2B:3C:4D:5E', 'Dell', 'Windows 11', 'SN123456789', '1', 'online', 'Front desk workstation'],
            ['laptop', 'Manager Laptop', '192.168.1.101', '00:1A:2B:3C:4D:5F', 'HP', 'Windows 11', 'HP987654321', '1', 'online', ''],
            ['cellphone', 'Company iPhone', '192.168.1.102', '', 'Apple', 'iOS 17', '', '1', 'online', ''],
            ['tablet', 'Conference Room iPad', '192.168.1.103', '', 'Apple', 'iPadOS 17', '', '1', 'online', 'Meeting room display'],
            ['printer', 'Main Printer', '192.168.1.200', '00:1A:2B:3C:4D:60', 'HP', '', '', '1', 'online', 'Model: LaserJet Pro M404n']
        ],
        typeList: '# Valid types: desktop, laptop, cellphone, tablet, printer, otherendpoint',
        filename: 'endpoint-devices-template.csv'
    },
    other: {
        headers: ['Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'VLAN ID', 'Status', 'Notes'],
        rows: [
            ['phone', 'Desk Phone 1', '192.168.1.150', '00:1A:2B:3C:4D:70', 'Cisco', '10', 'online', 'Extension 101'],
            ['camera', 'Front Door Camera', '192.168.1.160', '00:1A:2B:3C:4D:71', 'Hikvision', '20', 'online', ''],
            ['iot', 'Smart Thermostat', '192.168.1.170', '00:1A:2B:3C:4D:72', 'Nest', '1', 'online', '']
        ],
        typeList: '# Valid types: phone, camera, iot, otherendpoint',
        filename: 'other-devices-template.csv'
    },
    all: {
        headers: ['Type', 'Name', 'IP Address', 'MAC Address', 'Manufacturer', 'OS', 'Serial Number', 'Model', 'VLAN ID', 'Status', 'Notes'],
        rows: [
            ['router', 'ISP Router', '203.0.113.50', '', '', '', '', '', '', '', 'Primary ISP'],
            ['firewall', 'Firewall', '192.168.1.1', '', 'Fortinet', '', '', 'FortiGate 60F', '', 'online', ''],
            ['switch', 'Core Switch', '192.168.1.2', '', 'Ubiquiti', '', '', 'USW-Pro-48', '', 'online', ''],
            ['ap', 'Access Point', '192.168.1.10', '', 'Ubiquiti', '', '', 'U6-Pro', '', 'online', ''],
            ['server', 'Server 1', '192.168.20.10', '', 'Dell', 'Windows Server 2022', 'DELLSRV001', '', '20', 'online', ''],
            ['desktop', 'Workstation 1', '192.168.1.100', '', 'Dell', 'Windows 11', 'SN123456789', '', '1', 'online', ''],
            ['laptop', 'Laptop 1', '192.168.1.101', '', 'HP', 'Windows 11', 'HP987654321', '', '1', 'online', ''],
            ['printer', 'Printer 1', '192.168.1.200', '', 'HP', '', '', 'LaserJet Pro', '1', 'online', ''],
            ['phone', 'Desk Phone 1', '192.168.1.150', '', 'Cisco', '', '', '', '10', 'online', ''],
            ['camera', 'Camera 1', '192.168.1.160', '', 'Hikvision', '', '', '', '20', 'online', '']
        ],
        typeList: '# Valid types: router, firewall, switch, ap, server, vmhost, nas, desktop, laptop, cellphone, tablet, printer, phone, camera, iot, otherendpoint',
        filename: 'all-devices-template.csv'
    }
};
const _statusComment = '# Valid statuses: online, offline, warning, retired, decommissioned';

function downloadCSVTemplate(templateType) {
    closeModal('csvTemplatesModal');
    const tmpl = CSV_TEMPLATES[templateType] || CSV_TEMPLATES.all;
    let csvContent = tmpl.typeList + '\n' + _statusComment + '\n' + tmpl.headers.join(',') + '\n';
    tmpl.rows.forEach(row => {
        csvContent += row.map(cell => {
            if (cell.includes(',') || cell.includes('"')) {
                return '"' + cell.replace(/"/g, '""') + '"';
            }
            return cell;
        }).join(',') + '\n';
    });
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = tmpl.filename;
    a.click();
}

function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const parsed = parseCSVContent(e.target.result);
        pendingCSVData = parsed.rows;

        if (parsed.headers.length === 0) {
            toast.show('That CSV needs a header row and at least one data row.', { type: 'warn' });
            event.target.value = '';
            return;
        }

        if (pendingCSVData.length === 0) {
            toast.show('No usable rows \u2014 check that the Type column holds known device types.', { type: 'warn' });
            event.target.value = '';
            return;
        }

        // Show preview
        const previewDiv = document.getElementById('csvPreview');
        const previewContent = document.getElementById('csvPreviewContent');

        let previewHTML = '<div style="color:var(--green);margin-bottom:8px;">Found ' + pendingCSVData.length + ' valid device(s):</div>';
        if (parsed.skipped > 0) {
            previewHTML += '<div style="color:var(--yellow);margin-bottom:8px;">Skipped ' + parsed.skipped +
                ' row(s) with an unrecognised Type.</div>';
        }
        pendingCSVData.slice(0, 10).forEach(row => {
            previewHTML += '<div style="padding:4px 0;border-bottom:1px solid var(--glass-border);">' +
                '<span style="color:var(--primary);">' + row.type + '</span> - ' +
                (row.name || 'Unnamed') +
                (row.ipaddress ? ' (' + row.ipaddress + ')' : '') +
                '</div>';
        });
        if (pendingCSVData.length > 10) {
            previewHTML += '<div style="color:var(--text-muted);padding-top:8px;">...and ' + (pendingCSVData.length - 10) + ' more</div>';
        }

        previewContent.innerHTML = previewHTML;
        previewDiv.style.display = 'block';
    };
    reader.readAsText(file);
}

function importCSVDevices() {
    if (pendingCSVData.length === 0) return;

    // Calculate grid layout for new devices
    const gridCols = Math.ceil(Math.sqrt(pendingCSVData.length));
    const spacing = 160;
    const startX = 4000;
    const startY = 4000;

    pendingCSVData.forEach((row, index) => {
        state.counter++;
        const col = index % gridCols;
        const rowNum = Math.floor(index / gridCols);
        const deviceType = row.type.toLowerCase();

        const device = {
            id: nextId('dev'),
            type: deviceType,
            name: row.name || (types[deviceType]?.name || 'Device') + ' ' + state.counter,
            ip: row.ipaddress || '',
            mac: row.macaddress || '',
            manufacturer: row.manufacturer || '',
            os: row.os || '',
            model: row.model || '',
            serial: row.serialnumber || '',
            vlan: row.vlanid || '',
            status: normalizeStatus(row.status),
            notes: row.notes || '',
            x: snapToGridValue(startX + (col * spacing)),
            y: snapToGridValue(startY + (rowNum * spacing)),
            vms: deviceType === 'vmhost' ? [] : null
        };

        // Handle network equipment specific fields
        if (deviceType === 'router') {
            device.connectionType = row.connectiontype || '';
            device.downloadSpeed = row.downloadmbps || '';
            device.uploadSpeed = row.uploadmbps || '';
            device.subnetMask = row.subnetmask || '';
            device.defaultGateway = row.defaultgateway || '';
        }

        if (deviceType === 'switch' || deviceType === 'firewall') {
            device.ports = row.ports || '';
        }

        if (deviceType === 'switch') {
            device.poe = row.poe?.toLowerCase() === 'yes' || row.poe?.toLowerCase() === 'true';
            device.assignedVlans = [];
        }

        state.devices.push(device);
        renderDevice(device);
    });

    const importedCount = pendingCSVData.length;

    updateCounts();
    document.getElementById('emptyState').style.display = 'none';

    // Reset and close
    cancelCSVImport();
    closeModal('loadProjectModal');

    // Center view on new devices
    resetView();

    toast.show('Imported ' + formatCount(importedCount, 'device') + '.', { type: 'success' });
}

function cancelCSVImport() {
    pendingCSVData = [];
    document.getElementById('csvPreview').style.display = 'none';
    document.getElementById('csvFileInput').value = '';
}

// This script is a module, so its scope is not global. Inline HTML
// attributes (onclick=, oninput=) resolve against window, so the
// handlers they name are published explicitly. Phase 3 replaces those
// attributes with delegated listeners and this block goes away.
Object.assign(window, {
    openModal, closeModal, openConfig, saveConfig,
    updateDnsFields, updateDhcpDevices,
    updateDeviceProp, updateZoneProp, updateParentPort,
    toggleSwitchVLAN, toggleAPSSID,
    saveVlan, deleteVlan, saveSSID, deleteSSID, saveVM, removeVM,
    openUpsConfig, saveUps, deleteUps,
    deleteSelectedZone, flipConnection,
    exportJson, exportCSV, generatePDF, downloadCSVTemplate,
    handleJsonLoad, handleCSVUpload, importCSVDevices, cancelCSVImport
});

// Console handle for debugging and automation.
window.mapper = {
    state, history,
    undo, redo, saveState,
    createDevice, createZone, deleteSelected, deleteSelectedZone, clearAll,
    selectDevice, selectZone, deselectAll,
    selection, selectedDevices, setSelection, duplicateSelection, nudgeSelection,
    devicesInZone, panToDevice, deviceSize,
    upsFeeding, toggleUpsFor, refreshAllPowerTags, canBeProtected,
    saveUps, deleteUps, protectedBy, updateUpsBox,
    drawConnections, updateCounts, setConnType, setRoutingStyle,
    connColor, GRID_SIZE,
    // Render internals, for debugging and for the benchmark harness.
    sceneIndex, scheduler, connLayer,
    redrawDeviceEdges: (id) => connLayer.updatePaths(sceneIndex.connectionsFor(id), connPath)
};
