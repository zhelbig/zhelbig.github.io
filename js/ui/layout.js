/**
 * The mapper's chrome: sidebar palette, canvas, properties panel, status bar
 * and every modal. Injected at startup rather than duplicated into each
 * shell, because this markup is where features live - the VPN button, the
 * undo controls and the upstream/downstream panel are all markup, and
 * keeping two copies is exactly how the two mappers drifted apart before.
 *
 * A shell supplies its own branding through a <template id="brand-logo">.
 */

const CHROME = `    <div class="grid-bg"></div>
    <div class="orb orb-1"></div>
    <div class="orb orb-2"></div>
    <div class="orb orb-3"></div>

    <div class="app">
        <header class="header">
            <!--BRAND_LOGO-->
            <div class="client-label">
                <span class="client-label-text">Client:</span>
                <input type="text" id="clientName" class="client-input" placeholder="Enter client name...">
            </div>
            <div class="client-label">
                <span class="client-label-text">Location/Site:</span>
                <input type="text" id="siteName" class="client-input" placeholder="Enter location...">
            </div>
            <div class="header-actions">
                <button class="btn" id="csvTemplatesBtn">&#x1F4CB; CSV Templates</button>
                <button class="btn" id="exportPdfBtn">&#x1F4C4; Export PDF</button>
                <button class="btn" id="saveProjectBtn">&#x1F4BE; Save Project</button>
                <button class="btn" id="loadProjectBtn">&#x1F4C2; Load Project</button>
                <button class="btn btn-danger" id="clearBtn">&#x1F5D1;&#xFE0F; Clear</button>
            </div>
        </header>
        <aside class="sidebar">
            <div class="sidebar-section">
                <div class="sidebar-title">Zones (Drag to Create)</div>
                <div class="device-palette">
                    <div class="device-item zone-item" draggable="true" data-zone="mdf">MDF</div>
                    <div class="device-item zone-item" draggable="true" data-zone="idf">IDF</div>
                    <div class="device-item zone-item" draggable="true" data-zone="cloud"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10a4 4 0 00-7.5-2A5 5 0 105 14h13a3 3 0 000-6z"/></svg></span>Cloud</div>
                    <div class="device-item zone-item" draggable="true" data-zone="onprem"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/><line x1="4" y1="15" x2="10" y2="15"/></svg></span>On-Prem</div>
                    <div class="device-item zone-item" draggable="true" data-zone="ups"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="18" rx="2"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/><path d="M13 10l-2 4h3l-2 4"/></svg></span>UPS</div>
                    <div class="device-item zone-item" draggable="true" data-zone="nvr"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><circle cx="8" cy="12" r="0.5" fill="currentColor"/><line x1="14" y1="9" x2="20" y2="9"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="15" x2="20" y2="15"/></svg></span>NVR</div>
                </div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">Network Equipment</div>
                <div class="device-palette">
                    <div class="device-item" draggable="true" data-type="router"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="10" width="18" height="8" rx="2"/><circle cx="7" cy="14" r="1" fill="currentColor"/><line x1="12" y1="14" x2="19" y2="14"/><line x1="8" y1="4" x2="8" y2="10"/><line x1="16" y1="6" x2="16" y2="10"/><circle cx="8" cy="3" r="1.5"/><circle cx="16" cy="5" r="1.5"/></svg></span>Router</div>
                    <div class="device-item" draggable="true" data-type="firewall"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M9 9v11"/><path d="M15 4v5"/><circle cx="6" cy="6.5" r="1" fill="currentColor"/><line x1="12" y1="13" x2="12" y2="17"/></svg></span>Firewall</div>
                    <div class="device-item" draggable="true" data-type="switch"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="10" rx="2"/><line x1="5" y1="11" x2="5" y2="14"/><line x1="7.5" y1="11" x2="7.5" y2="14"/><line x1="10" y1="11" x2="10" y2="14"/><line x1="12.5" y1="11" x2="12.5" y2="14"/><line x1="15" y1="11" x2="15" y2="14"/><line x1="17.5" y1="11" x2="17.5" y2="14"/><circle cx="20" cy="9.5" r="0.8" fill="currentColor"/></svg></span>Switch</div>
                    <div class="device-item" draggable="true" data-type="ap"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a8 8 0 0112 0"/><path d="M8.5 10.5a5 5 0 017 0"/><path d="M11 13a2 2 0 012 0"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/><line x1="12" y1="16.5" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></span>Access Point</div>
                    <div class="device-item" draggable="true" data-type="vpn"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6V5a4 4 0 018 0v1"/><circle cx="12" cy="13" r="2"/><line x1="12" y1="15" x2="12" y2="16.5"/></svg></span>VPN</div>
                </div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">Servers &amp; Storage</div>
                <div class="device-palette">
                    <div class="device-item" draggable="true" data-type="server"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="6" rx="1.5"/><rect x="4" y="10" width="16" height="6" rx="1.5"/><circle cx="7" cy="5" r="1" fill="currentColor"/><circle cx="7" cy="13" r="1" fill="currentColor"/><line x1="14" y1="5" x2="18" y2="5"/><line x1="14" y1="13" x2="18" y2="13"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></span>Server</div>
                    <div class="device-item" draggable="true" data-type="nas"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><circle cx="17" cy="7.5" r="1" fill="currentColor"/><circle cx="17" cy="12.5" r="1" fill="currentColor"/><circle cx="17" cy="17.5" r="1" fill="currentColor"/></svg></span>NAS</div>
                </div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">Virtualization</div>
                <div class="device-palette">
                    <div class="device-item" draggable="true" data-type="vmhost"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="6" rx="1.5"/><rect x="2" y="10" width="20" height="6" rx="1.5"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="5" cy="13" r="1" fill="currentColor"/><circle cx="8" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="13" r="1" fill="currentColor"/><line x1="14" y1="5" x2="20" y2="5"/><line x1="14" y1="13" x2="20" y2="13"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/></svg></span>VM Host</div>
                    <div class="device-item" draggable="true" data-type="vm"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="12" rx="1.5" stroke-dasharray="3,2"/><path d="M9 10l2 2 4-4"/></svg></span>VM</div>
                    <div class="device-item" draggable="true" data-type="storage"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v4c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4"/></svg></span>Storage</div>
                </div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">Endpoints</div>
                <div class="device-palette">
                    <div class="device-item" draggable="true" data-type="desktop"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="12" rx="1.5"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/></svg></span>Desktop</div>
                    <div class="device-item" draggable="true" data-type="laptop"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6a1 1 0 011-1h14a1 1 0 011 1v9H4V6z"/><path d="M2 17h20l-1.5 2H3.5L2 17z"/></svg></span>Laptop</div>
                    <div class="device-item" draggable="true" data-type="cellphone"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10" y1="18" x2="14" y2="18"/></svg></span>Cell Phone</div>
                    <div class="device-item" draggable="true" data-type="tablet"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="19" r="1"/></svg></span>Tablet</div>
                    <div class="device-item" draggable="true" data-type="printer"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="8" rx="1.5"/><rect x="7" y="3" width="10" height="7" rx="1"/><rect x="7" y="18" width="10" height="3" rx="0.5"/><circle cx="16" cy="13" r="1" fill="currentColor"/></svg></span>Printer</div>
                    <div class="device-item" draggable="true" data-type="otherendpoint"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.8" fill="currentColor"/></svg></span>Other</div>
                </div>
            </div>
            <div class="sidebar-section">
                <div class="sidebar-title">Other</div>
                <div class="device-palette">
                    <div class="device-item" draggable="true" data-type="phone"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/></svg></span>Desk Phone</div>
                    <div class="device-item" draggable="true" data-type="camera"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h2v8H4z" fill="currentColor" opacity="0.3"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="10" y="8.5" width="10" height="7" rx="3.5"/><circle cx="17" cy="12" r="2"/><circle cx="17" cy="12" r="0.8" fill="currentColor"/></svg></span>Security Cam</div>
                    <div class="device-item" draggable="true" data-type="iot"><span class="icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/></svg></span>IoT</div>
                </div>
            </div>
        </aside>
        <main class="canvas-area" id="canvasArea">
            <div class="canvas-grid" id="canvasGrid"></div>
            <div id="canvasWrapper">
                <svg id="connections" width="8000" height="8000"></svg>
                <div id="waypointLayer"></div>
                <div id="canvas"></div>
            </div>
            <div class="empty-state" id="emptyState">
                <h3>Start Building Your Network</h3>
                <p>Drag devices from the sidebar onto the canvas</p>
            </div>
            <div class="network-info-box" id="networkInfoBox">
                <h4 onclick="openConfig()" style="cursor:pointer;" title="Click to edit configuration">&#x2699;&#xFE0F; Network Configuration <span style="font-size:0.6rem;color:var(--text-muted);font-weight:normal;">&#x270E; click to edit</span></h4>
                <div class="info-section">
                    <div class="info-section-title">DNS</div>
                    <div class="info-row"><span class="info-label">Provider:</span><span class="info-value" id="infoDnsProvider">DNS Filter</span></div>
                    <div class="info-row"><span class="info-label">Primary:</span><span class="info-value" id="infoDnsPrimary">8.8.8.8</span></div>
                    <div class="info-row"><span class="info-label">Secondary:</span><span class="info-value" id="infoDnsSecondary">8.8.4.4</span></div>
                </div>
                <div class="info-section">
                    <div class="info-section-title">DHCP</div>
                    <div class="info-row"><span class="info-label">Managed by:</span><span class="info-value" id="infoDhcp">Router</span></div>
                </div>
                <div class="info-section">
                    <div class="info-section-title">VLANs</div>
                    <div class="vlan-tags" id="infoVlans"></div>
                </div>
                <div class="info-section">
                    <div class="info-section-title">Wireless SSIDs</div>
                    <div class="vlan-tags" id="infoSSIDs"></div>
                </div>
            </div>
            <div class="marquee" id="marquee" hidden></div>
            <div class="pan-hint">Drag to pan &#x2022; Scroll to zoom &#x2022; Shift-drag to select</div>
            <div class="undo-redo">
                <button id="undoBtn" title="Undo (Ctrl+Z)" disabled>&#x21B6;</button>
                <button id="redoBtn" title="Redo (Ctrl+Y)" disabled>&#x21B7;</button>
            </div>
            <div class="controls">
                <button class="btn" id="snapBtn" title="Toggle grid snapping">Snap: On</button>
                <button class="btn" id="zoomInBtn">+</button>
                <button class="btn" id="zoomOutBtn">-</button>
                <button class="btn" id="resetBtn">Reset View</button>
                <div class="ctrl-divider"></div>

            </div>
            <!-- Floating Connection Toolbar (bottom-right) -->
            <div class="conn-toolbar" id="connToolbar">
                <div class="conn-toolbar-title">&#x1F517; Connections</div>
                <div class="conn-toolbar-row">
                    <span class="conn-toolbar-label">Type</span>
                    <div class="conn-toggle-bar">
                        <button class="wired-bar active" id="wiredBtn">&#x1F5A7; Wired</button>
                        <button class="wireless-bar" id="wirelessBtn">&#x1F4F6; Wireless</button>
                        <button class="vpn-bar" id="vpnBtn">&#x1F510; VPN</button>
                    </div>
                </div>
                <div class="conn-toolbar-row">
                    <span class="conn-toolbar-label">Route</span>
                    <div class="conn-toggle-bar">
                        <button class="curved-bar active" id="curvedBtn">Curved</button>
                        <button class="ortho-bar" id="orthoBtn">Angled</button>
                    </div>
                </div>
                <div class="conn-toolbar-row">
                    <button class="conn-eraser-btn" id="editRouteBtn" style="color:#7c3aed;border-color:rgba(124,58,237,0.3);" title="Click an orthogonal connection to edit its waypoints">&#x270E; Edit Route</button>
                    <button class="conn-eraser-btn" id="eraserBtn">&#x2702; Eraser</button>
                </div>
            </div>
        </main>
        <aside class="props-panel">
            <div class="panel-title">Properties</div>
            <div id="noSelect" style="text-align:center;padding:30px;color:var(--text-muted);"><p style="font-size:0.8rem;">Select a device to edit</p></div>
            <div id="deviceProps" style="display:none;">
                <div class="form-group" id="nameGroup"><label class="form-label" id="nameLabel">Device Name</label><input type="text" class="form-input" id="propName"></div>
                <div class="form-group" id="ipGroup"><label class="form-label">IP Address</label><input type="text" class="form-input" id="propIP" placeholder="192.168.1.1"></div>
                <div id="networkEquipSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Manufacturer</label><input type="text" class="form-input" id="propNetEquipMfg" placeholder="e.g. Cisco, Ubiquiti" oninput="updateDeviceProp('manufacturer', this.value)"></div>
                    <div class="form-group"><label class="form-label">Model</label><input type="text" class="form-input" id="propNetEquipModel" placeholder="e.g. USW-24-POE" oninput="updateDeviceProp('model', this.value)"></div>
                </div>
                <div class="form-group" id="manufacturerGroup" style="display:none;"><label class="form-label">Manufacturer</label><select class="form-select" id="propManufacturer"></select></div>
                <div class="form-group" id="osGroup" style="display:none;"><label class="form-label">Operating System</label><select class="form-select" id="propOS"></select></div>
                <div class="form-group" id="serialGroup" style="display:none;"><label class="form-label">Serial Number</label><input type="text" class="form-input" id="propSerial" placeholder="e.g. ABC123XYZ" oninput="updateDeviceProp('serial', this.value)"></div>
                <div id="routerSection" style="display:none;">
                    <div style="display:flex;gap:8px;">
                        <div class="form-group" style="flex:1;"><label class="form-label">Subnet Mask</label><input type="text" class="form-input" id="propSubnetMask" placeholder="255.255.255.0" oninput="updateDeviceProp('subnetMask', this.value)"></div>
                        <div class="form-group" style="flex:1;"><label class="form-label">Default Gateway</label><input type="text" class="form-input" id="propDefaultGateway" placeholder="192.168.1.1" oninput="updateDeviceProp('defaultGateway', this.value)"></div>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Connection Type</label>
                        <div style="display:flex;gap:16px;">
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">
                                <input type="radio" name="connType" id="propFiber" value="fiber" onchange="updateDeviceProp('connectionType', 'fiber')" style="accent-color:var(--primary);">
                                Fiber
                            </label>
                            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">
                                <input type="radio" name="connType" id="propCoax" value="coax" onchange="updateDeviceProp('connectionType', 'coax')" style="accent-color:var(--primary);">
                                Coax
                            </label>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <div class="form-group" style="flex:1;"><label class="form-label">Download (Mbps)</label><input type="text" class="form-input" id="propDownload" placeholder="1000" oninput="updateDeviceProp('downloadSpeed', this.value)"></div>
                        <div class="form-group" style="flex:1;"><label class="form-label">Upload (Mbps)</label><input type="text" class="form-input" id="propUpload" placeholder="100" oninput="updateDeviceProp('uploadSpeed', this.value)"></div>
                    </div>
                </div>
                <div class="form-group" id="macGroup"><label class="form-label">MAC Address</label><input type="text" class="form-input" id="propMAC" placeholder="00:00:00:00:00:00"></div>
                <div class="form-group" id="statusGroup">
                    <label class="form-label">Status</label>
                    <div class="status-btns">
                        <div class="status-btn" data-status="online"><div class="dot status-online"></div>Online</div>
                        <div class="status-btn" data-status="offline"><div class="dot status-offline"></div>Offline</div>
                        <div class="status-btn" data-status="warning"><div class="dot status-warning"></div>Warning</div>
                        <div class="status-btn" data-status="retired"><div class="dot status-retired"></div>Retired</div>
                        <div class="status-btn" data-status="decommissioned"><div class="dot status-decommissioned"></div>Decom.</div>
                    </div>
                </div>
                <div class="form-group" id="vlanGroup"><label class="form-label">VLAN</label><select class="form-select" id="propVLAN"></select></div>
                <div id="ssidSection" style="display:none;">
                    <div class="form-label">Assigned SSIDs</div>
                    <div id="apSSIDList" style="max-height:150px;overflow-y:auto;margin-bottom:8px;"></div>
                </div>
                <div id="switchSection" style="display:none;">
                    <div class="form-group">
                        <label class="form-label">Number of Ports</label>
                        <select class="form-select" id="propSwitchPorts" onchange="updateDeviceProp('ports', this.value)">
                            <option value="">-- Select --</option>
                            <option value="5">5 Ports</option>
                            <option value="8">8 Ports</option>
                            <option value="12">12 Ports</option>
                            <option value="16">16 Ports</option>
                            <option value="24">24 Ports</option>
                            <option value="48">48 Ports</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">
                            <input type="checkbox" id="propPOE" onchange="updateDeviceProp('poe', this.checked)" style="width:16px;height:16px;accent-color:var(--primary);">
                            PoE Capable
                        </label>
                    </div>
                    <div class="form-label">Assigned VLANs</div>
                    <div id="switchVLANList" style="max-height:150px;overflow-y:auto;margin-bottom:8px;"></div>
                </div>
                <div id="firewallSection" style="display:none;">
                    <div class="form-group">
                        <label class="form-label">Number of Ports</label>
                        <select class="form-select" id="propFirewallPorts" onchange="updateDeviceProp('ports', this.value)">
                            <option value="">-- Select --</option>
                            <option value="2">2 Ports</option>
                            <option value="4">4 Ports</option>
                            <option value="6">6 Ports</option>
                            <option value="8">8 Ports</option>
                            <option value="10">10 Ports</option>
                            <option value="12">12 Ports</option>
                        </select>
                    </div>
                </div>
                <div id="vpnSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Manufacturer</label><input type="text" class="form-input" id="propVPNMfg" placeholder="e.g. Cisco, OpenVPN" oninput="updateDeviceProp('manufacturer', this.value)"></div>
                    <div class="form-group"><label class="form-label">Model / Software</label><input type="text" class="form-input" id="propVPNModel" placeholder="e.g. AnyConnect, WireGuard" oninput="updateDeviceProp('model', this.value)"></div>
                    <div class="form-group"><label class="form-label">VPN Type</label>
                        <select class="form-select" id="propVPNType" onchange="updateDeviceProp('vpnType', this.value)">
                            <option value="">-- Select --</option>
                            <option value="Site-to-Site">Site-to-Site</option>
                            <option value="Remote Access">Remote Access</option>
                            <option value="SSL VPN">SSL VPN</option>
                            <option value="IPSec">IPSec</option>
                            <option value="WireGuard">WireGuard</option>
                            <option value="OpenVPN">OpenVPN</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="propNotes"></textarea></div>
                <div id="printerSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Model</label><input type="text" class="form-input" id="propPrinterModel" placeholder="e.g. LaserJet Pro M404n" oninput="updateDeviceProp('model', this.value)"></div>
                </div>
                <div id="vmSection" style="display:none;">
                    <div class="form-label">Hosted VMs</div>
                    <div id="vmList"></div>
                    <button class="add-btn" id="addVMBtn" style="margin-top:8px;">+ Add VM</button>
                </div>
                <div id="connectedToSection" style="margin-top:12px;padding-top:12px;border-top:1px solid var(--glass-border);">
                    <div id="upstreamSection">
                        <div class="form-label" style="margin-bottom:6px;">&#x2B06;&#xFE0F; Upstream <span style="font-weight:400;text-transform:none;letter-spacing:0;">(Parent)</span></div>
                        <div id="upstreamList" style="font-size:0.75rem;color:var(--text-muted);margin-bottom:10px;"></div>
                    </div>
                    <div id="downstreamSection">
                        <div class="form-label" style="margin-bottom:6px;">&#x2B07;&#xFE0F; Downstream <span style="font-weight:400;text-transform:none;letter-spacing:0;">(Children)</span></div>
                        <div id="downstreamList" style="font-size:0.75rem;color:var(--text-muted);"></div>
                    </div>
                </div>
                <button class="btn btn-danger" style="width:100%;margin-top:16px;justify-content:center;" id="deleteBtn">&#x1F5D1;&#xFE0F; Delete Device</button>
            </div>
            <div id="multiProps" style="display:none;">
                <div class="multi-count" id="multiCount"></div>
                <p class="multi-hint">Drag any one to move them together. Shift-click to add or remove.</p>
                <div class="form-group">
                    <label class="form-label">Set status for all</label>
                    <div class="status-btns" id="multiStatusBtns">
                        <div class="status-btn" data-bulk-status="online"><div class="dot status-online"></div>Online</div>
                        <div class="status-btn" data-bulk-status="offline"><div class="dot status-offline"></div>Offline</div>
                        <div class="status-btn" data-bulk-status="warning"><div class="dot status-warning"></div>Warning</div>
                        <div class="status-btn" data-bulk-status="retired"><div class="dot status-retired"></div>Retired</div>
                    </div>
                </div>
                <div class="form-group">
                    <label class="form-label">Set VLAN for all</label>
                    <select class="form-select" id="multiVlan"></select>
                </div>
                <button class="btn" style="width:100%;justify-content:center;" id="duplicateSelectionBtn">&#x29C9; Duplicate</button>
                <button class="btn btn-danger" style="width:100%;margin-top:8px;justify-content:center;" id="deleteSelectionBtn">&#x1F5D1;&#xFE0F; Delete selected</button>
            </div>
            <div id="zoneProps" style="display:none;">
                <div class="form-group"><label class="form-label">Zone Name</label><input type="text" class="form-input" id="propZoneName" oninput="updateZoneProp('name', this.value)"></div>
                <div id="upsPropsSection" style="display:none;">
                    <div class="form-group"><label class="form-label">UPS Manufacturer</label>
                        <select class="form-select" id="propUPSMfg" onchange="updateZoneProp('manufacturer', this.value)">
                            <option value="">-- Select --</option>
                            <option value="APC">APC</option>
                            <option value="CyberPower">CyberPower</option>
                            <option value="Eaton">Eaton</option>
                            <option value="Tripp Lite">Tripp Lite</option>
                            <option value="Vertiv/Liebert">Vertiv/Liebert</option>
                            <option value="Schneider Electric">Schneider Electric</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">UPS Model</label><input type="text" class="form-input" id="propUPSModel" placeholder="e.g. Smart-UPS 1500" oninput="updateZoneProp('model', this.value)"></div>
                    <div style="display:flex;gap:8px;">
                        <div class="form-group" style="flex:1;"><label class="form-label">Capacity (VA)</label><input type="text" class="form-input" id="propUPSCapacity" placeholder="1500" oninput="updateZoneProp('capacity', this.value)"></div>
                        <div class="form-group" style="flex:1;"><label class="form-label">Runtime (min)</label><input type="text" class="form-input" id="propUPSRuntime" placeholder="15" oninput="updateZoneProp('runtime', this.value)"></div>
                    </div>
                    <div class="form-group"><label class="form-label">IP Address</label><input type="text" class="form-input" id="propUPSIP" placeholder="192.168.1.100" oninput="updateZoneProp('ip', this.value)"></div>
                </div>
                <div id="nvrPropsSection" style="display:none;">
                    <div class="form-group"><label class="form-label">NVR Manufacturer</label>
                        <select class="form-select" id="propNVRMfg" onchange="updateZoneProp('manufacturer', this.value)">
                            <option value="">-- Select --</option>
                            <option value="Hikvision">Hikvision</option>
                            <option value="Dahua">Dahua</option>
                            <option value="Reolink">Reolink</option>
                            <option value="Uniview">Uniview</option>
                            <option value="Axis">Axis</option>
                            <option value="Milestone">Milestone</option>
                            <option value="Blue Iris">Blue Iris (Software)</option>
                            <option value="Ubiquiti">Ubiquiti (UniFi Protect)</option>
                            <option value="Synology">Synology (Surveillance Station)</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">NVR Model</label><input type="text" class="form-input" id="propNVRModel" placeholder="e.g. DS-7608NI-I2" oninput="updateZoneProp('model', this.value)"></div>
                    <div style="display:flex;gap:8px;">
                        <div class="form-group" style="flex:1;"><label class="form-label">Channels</label><input type="text" class="form-input" id="propNVRChannels" placeholder="8" oninput="updateZoneProp('channels', this.value)"></div>
                        <div class="form-group" style="flex:1;"><label class="form-label">Storage (TB)</label><input type="text" class="form-input" id="propNVRStorage" placeholder="4" oninput="updateZoneProp('storage', this.value)"></div>
                    </div>
                    <div class="form-group"><label class="form-label">IP Address</label><input type="text" class="form-input" id="propNVRIP" placeholder="192.168.1.100" oninput="updateZoneProp('ip', this.value)"></div>
                </div>
                <div id="mdfPropsSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Location/Room</label><input type="text" class="form-input" id="propMDFLocation" placeholder="e.g. Server Room 1" oninput="updateZoneProp('location', this.value)"></div>
                </div>
                <div id="idfPropsSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Location/Room</label><input type="text" class="form-input" id="propIDFLocation" placeholder="e.g. Floor 2 Closet" oninput="updateZoneProp('location', this.value)"></div>
                    <div class="form-group"><label class="form-label">Connected to MDF</label>
                        <select class="form-select" id="propIDFMDF" onchange="updateZoneProp('connectedMDF', this.value)"></select>
                    </div>
                </div>
                <div id="cloudPropsSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Cloud Provider</label>
                        <select class="form-select" id="propCloudProvider" onchange="updateZoneProp('provider', this.value)">
                            <option value="">-- Select --</option>
                            <option value="AWS">Amazon Web Services</option>
                            <option value="Azure">Microsoft Azure</option>
                            <option value="GCP">Google Cloud Platform</option>
                            <option value="DigitalOcean">DigitalOcean</option>
                            <option value="Linode">Linode/Akamai</option>
                            <option value="Vultr">Vultr</option>
                            <option value="Oracle Cloud">Oracle Cloud</option>
                            <option value="IBM Cloud">IBM Cloud</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">Region</label><input type="text" class="form-input" id="propCloudRegion" placeholder="e.g. us-east-1" oninput="updateZoneProp('region', this.value)"></div>
                </div>
                <div id="onpremPropsSection" style="display:none;">
                    <div class="form-group"><label class="form-label">Location/Building</label><input type="text" class="form-input" id="propOnPremLocation" placeholder="e.g. Main Office" oninput="updateZoneProp('location', this.value)"></div>
                </div>
                <div class="form-group"><label class="form-label">Notes</label><textarea class="form-textarea" id="propZoneNotes" oninput="updateZoneProp('notes', this.value)"></textarea></div>
                <button class="btn btn-danger" style="width:100%;margin-top:16px;justify-content:center;" id="deleteZoneBtn" onclick="deleteSelectedZone()">&#x1F5D1;&#xFE0F; Delete Zone</button>
            </div>
        </aside>
        <footer class="statusbar">
            <span id="deviceCount">0 devices</span>
            <span id="zoneCount">0 zones</span>
            <span id="connCount">0 connections</span>
            <span style="margin-left:auto;" id="zoomLevel">100%</span>
        </footer>
    </div>
    <div class="conn-hint" id="connHint">Click another device to complete connection</div>

    <div class="modal-bg" id="configModal">
        <div class="modal">
            <div class="modal-header"><h3>Network Configuration</h3><button class="modal-close" onclick="closeModal('configModal')">&times;</button></div>
            <div class="modal-body">
                <div class="config-section">
                    <div class="config-title">&#x1F310; DNS Configuration</div>
                    <div class="form-group"><label class="form-label">DNS Provider</label>
                        <select class="form-select" id="dnsProvider" onchange="updateDnsFields()">
                            <option value="DNS Filter">DNS Filter</option>
                            <option value="Cisco Umbrella">Cisco Umbrella</option>
                            <option value="Server Hosted">Server Hosted</option>
                            <option value="Cloudflare">Cloudflare</option>
                            <option value="Google DNS">Google DNS</option>
                        </select>
                    </div>
                    <div class="form-group" id="dnsServerGroup" style="display:none;"><label class="form-label">DNS Server</label><select class="form-select" id="dnsServerDevice"></select></div>
                    <div style="display:flex;gap:8px;">
                        <div class="form-group" style="flex:1;"><label class="form-label">Primary DNS</label><input type="text" class="form-input" id="dnsPrimary" value="8.8.8.8"></div>
                        <div class="form-group" style="flex:1;"><label class="form-label">Secondary DNS</label><input type="text" class="form-input" id="dnsSecondary" value="8.8.4.4"></div>
                    </div>
                </div>
                <div class="config-section">
                    <div class="config-title">&#x1F4CB; DHCP Configuration</div>
                    <div class="form-group"><label class="form-label">DHCP Server Type</label>
                        <select class="form-select" id="dhcpType" onchange="updateDhcpDevices()">
                            <option value="Router">Router</option>
                            <option value="Dedicated Server">Dedicated Server</option>
                            <option value="Firewall">Firewall</option>
                        </select>
                    </div>
                    <div class="form-group"><label class="form-label">DHCP Device</label><select class="form-select" id="dhcpDevice"></select></div>
                </div>
                <div class="config-section">
                    <div class="config-title">&#x1F3F7;&#xFE0F; VLANs &amp; Subnets</div>
                    <div id="vlanList"></div>
                    <button class="add-btn" onclick="openModal('vlanModal')">+ Add VLAN</button>
                </div>
                <div class="config-section">
                    <div class="config-title">&#x1F4F6; Wireless Configuration</div>
                    <div id="ssidList"></div>
                    <button class="add-btn" onclick="openModal('ssidModal')">+ Add SSID</button>
                </div>
            </div>
            <div class="modal-footer"><button class="btn btn-primary" onclick="saveConfig()">Save &amp; Close</button></div>
        </div>
    </div>
    <div class="modal-bg" id="vlanModal">
        <div class="modal" style="width:350px;">
            <div class="modal-header"><h3>Add VLAN</h3><button class="modal-close" onclick="closeModal('vlanModal')">&times;</button></div>
            <div class="modal-body">
                <div class="form-group"><label class="form-label">VLAN ID</label><input type="number" class="form-input" id="newVlanID"></div>
                <div class="form-group"><label class="form-label">Name</label><input type="text" class="form-input" id="newVlanName"></div>
                <div class="form-group"><label class="form-label">Subnet</label><input type="text" class="form-input" id="newVlanSubnet" placeholder="192.168.10.0/24"></div>
                <div class="form-group"><label class="form-label">Gateway</label><input type="text" class="form-input" id="newVlanGateway" placeholder="192.168.10.1"></div>
            </div>
            <div class="modal-footer"><button class="btn" onclick="closeModal('vlanModal')">Cancel</button><button class="btn btn-primary" onclick="saveVlan()">Add</button></div>
        </div>
    </div>
    <div class="modal-bg" id="ssidModal">
        <div class="modal" style="width:350px;">
            <div class="modal-header"><h3>Add SSID</h3><button class="modal-close" onclick="closeModal('ssidModal')">&times;</button></div>
            <div class="modal-body">
                <div class="form-group"><label class="form-label">SSID Name</label><input type="text" class="form-input" id="newSSIDName" placeholder="MyNetwork"></div>
                <div class="form-group"><label class="form-label">Security</label>
                    <select class="form-select" id="newSSIDSecurity">
                        <option value="WPA3-Enterprise">WPA3-Enterprise</option>
                        <option value="WPA3-Personal">WPA3-Personal</option>
                        <option value="WPA2-Enterprise">WPA2-Enterprise</option>
                        <option value="WPA2-Personal" selected>WPA2-Personal</option>
                        <option value="WPA/WPA2-Mixed">WPA/WPA2-Mixed</option>
                        <option value="Open">Open</option>
                    </select>
                </div>
                <div class="form-group"><label class="form-label">VLAN</label>
                    <select class="form-select" id="newSSIDVlan"></select>
                </div>
            </div>
            <div class="modal-footer"><button class="btn" onclick="closeModal('ssidModal')">Cancel</button><button class="btn btn-primary" onclick="saveSSID()">Add</button></div>
        </div>
    </div>
    <div class="modal-bg" id="vmModal">
        <div class="modal" style="width:350px;">
            <div class="modal-header"><h3>Add VM</h3><button class="modal-close" onclick="closeModal('vmModal')">&times;</button></div>
            <div class="modal-body">
                <div class="form-group"><label class="form-label">VM Name</label><input type="text" class="form-input" id="newVMName"></div>
                <div class="form-group"><label class="form-label">Status</label><select class="form-select" id="newVMStatus"><option value="online">Online</option><option value="offline">Offline</option><option value="warning">Warning</option></select></div>
            </div>
            <div class="modal-footer"><button class="btn" onclick="closeModal('vmModal')">Cancel</button><button class="btn btn-primary" onclick="saveVM()">Add</button></div>
        </div>
    </div>
    <div class="modal-bg" id="exportModal">
        <div class="modal" style="width:400px;">
            <div class="modal-header"><h3>Export PDF</h3><button class="modal-close" onclick="closeModal('exportModal')">&times;</button></div>
            <div class="modal-body">
                <div class="form-group"><label class="form-label">Document Title</label><input type="text" class="form-input" id="pdfTitle" value="Network Diagram"></div>
                <div class="form-group"><label class="form-label">Orientation</label>
                    <select class="form-select" id="pdfOrientation"><option value="landscape">Landscape</option><option value="portrait">Portrait</option></select>
                </div>
                <div class="form-group">
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.8rem;color:var(--text-secondary);">
                        <input type="checkbox" id="includeInventory" checked style="width:16px;height:16px;accent-color:var(--primary);">
                        Include device inventory (Notes, VLAN, MAC)
                    </label>
                </div>
            </div>
            <div class="modal-footer"><button class="btn" onclick="closeModal('exportModal')">Cancel</button><button class="btn btn-primary" onclick="generatePDF()">Export PDF</button></div>
        </div>
    </div>
    <div class="modal-bg" id="csvTemplatesModal">
        <div class="modal" style="width:420px;">
            <div class="modal-header"><h3>CSV Templates</h3><button class="modal-close" onclick="closeModal('csvTemplatesModal')">&times;</button></div>
            <div class="modal-body">
                <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:16px;">Download a CSV template to fill in your devices. Each template has columns specific to that device category. Load the filled CSV using "Load Project".</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <button class="btn" onclick="downloadCSVTemplate('network')" style="justify-content:flex-start;">&#x1F4E1; Network Equipment</button>
                    <button class="btn" onclick="downloadCSVTemplate('servers')" style="justify-content:flex-start;">&#x1F5A5;&#xFE0F; Servers</button>
                    <button class="btn" onclick="downloadCSVTemplate('endpoints')" style="justify-content:flex-start;">&#x1F4BB; Endpoints</button>
                    <button class="btn" onclick="downloadCSVTemplate('other')" style="justify-content:flex-start;">&#x1F310; Other Devices</button>
                    <button class="btn" onclick="downloadCSVTemplate('all')" style="justify-content:flex-start;">&#x1F4CB; All Devices (Combined)</button>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-bg" id="saveProjectModal">
        <div class="modal" style="width:380px;">
            <div class="modal-header"><h3>Save Project</h3><button class="modal-close" onclick="closeModal('saveProjectModal')">&times;</button></div>
            <div class="modal-body">
                <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:16px;">Choose a format to save your project:</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <button class="btn btn-primary" onclick="exportJson()" style="justify-content:center;">&#x1F4BE; Save as JSON (Full Project)</button>
                    <button class="btn" onclick="exportCSV()" style="justify-content:center;">&#x1F4CB; Save as CSV (Devices Only)</button>
                </div>
                <p style="font-size:0.65rem;color:var(--text-muted);margin-top:12px;">JSON includes all data (devices, connections, zones, settings). CSV exports device list only.</p>
            </div>
        </div>
    </div>
    <div class="modal-bg" id="loadProjectModal">
        <div class="modal" style="width:420px;">
            <div class="modal-header"><h3>Load Project</h3><button class="modal-close" onclick="closeModal('loadProjectModal')">&times;</button></div>
            <div class="modal-body">
                <p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:16px;">Load a project file or import devices from CSV:</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                    <input type="file" id="jsonFileInput" accept=".json" style="display:none;" onchange="handleJsonLoad(event)">
                    <button class="btn btn-primary" onclick="document.getElementById('jsonFileInput').click()" style="justify-content:center;">&#x1F4C2; Load JSON Project</button>
                    <input type="file" id="csvFileInput" accept=".csv" style="display:none;" onchange="handleCSVUpload(event)">
                    <button class="btn" onclick="document.getElementById('csvFileInput').click()" style="justify-content:center;">&#x1F4CB; Import CSV Devices</button>
                </div>
                <div id="csvPreview" style="display:none;margin-top:12px;">
                    <div class="form-label">Preview</div>
                    <div id="csvPreviewContent" style="max-height:200px;overflow-y:auto;background:rgba(0,0,0,0.3);border-radius:8px;padding:10px;font-size:0.7rem;font-family:'JetBrains Mono',monospace;"></div>
                    <div style="margin-top:12px;display:flex;gap:8px;">
                        <button class="btn btn-primary" onclick="importCSVDevices()" style="flex:1;justify-content:center;">&#x2714; Import Devices</button>
                        <button class="btn" onclick="cancelCSVImport()" style="flex:1;justify-content:center;">Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="modal-bg" id="shortcutsModal">
        <div class="modal" style="width:460px;">
            <div class="modal-header"><h3>Keyboard &amp; mouse</h3><button class="modal-close" onclick="closeModal('shortcutsModal')">&times;</button></div>
            <div class="modal-body">
                <dl class="shortcuts">
                    <dt>Click</dt><dd>Select a device</dd>
                    <dt>Shift-click</dt><dd>Add to or remove from the selection</dd>
                    <dt>Shift-drag</dt><dd>Rubber-band select</dd>
                    <dt>Drag</dt><dd>Move the selection &middot; on empty space, pan</dd>
                    <dt>Scroll</dt><dd>Zoom</dd>
                    <dt>Drag a dot</dt><dd>Draw a connection from a device edge</dd>
                    <dt>Ctrl A</dt><dd>Select every device</dd>
                    <dt>Ctrl D</dt><dd>Duplicate the selection</dd>
                    <dt>Arrows</dt><dd>Nudge by one grid step &middot; hold Shift for 1px</dd>
                    <dt>Delete</dt><dd>Remove the selection</dd>
                    <dt>Ctrl Z / Ctrl Y</dt><dd>Undo &middot; redo</dd>
                    <dt>Ctrl S</dt><dd>Save the project file</dd>
                    <dt>Esc</dt><dd>Cancel, or clear the selection</dd>
                    <dt>?</dt><dd>This list</dd>
                </dl>
            </div>
        </div>
    </div>
    <div id="toastHost" aria-live="polite" aria-atomic="false"></div>
`;

/** Fallback used when a shell declares no <template id="brand-logo">. */
const DEFAULT_LOGO = `            <div class="logo">
                <div class="logo-icon">NM</div>
                <span class="logo-tool-name">Network Mapping Tool</span>
            </div>
`;

export function appMarkup(logoHtml) {
    return CHROME.replace('<!--BRAND_LOGO-->', (logoHtml || DEFAULT_LOGO).trim());
}

/**
 * Replace #app-root with the chrome. Must run before anything looks an
 * element up, which is why app.js calls it immediately after its imports.
 */
export function mountChrome(doc = document) {
    const root = doc.getElementById('app-root');
    if (!root) throw new Error('mountChrome: no #app-root in the page');
    const tpl = doc.getElementById('brand-logo');
    root.outerHTML = appMarkup(tpl ? tpl.innerHTML : null);
}
