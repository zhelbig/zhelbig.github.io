/**
 * Device and zone registries, hardware pick-lists, and the inline SVG icon
 * set. Pure data plus two string builders - no DOM, no app state.
 */

export const zoneTypes = {
    cloud: { name: 'Cloud', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10a4 4 0 00-7.5-2A5 5 0 105 14h13a3 3 0 000-6z"/></svg>', color: '#3b82f6' },
    onprem: { name: 'On-Prem', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><line x1="4" y1="10" x2="20" y2="10"/><line x1="10" y1="4" x2="10" y2="20"/><line x1="4" y1="15" x2="10" y2="15"/></svg>', color: '#8b5cf6' },
    mdf: { name: 'MDF', icon: '', color: '#22c55e' },
    idf: { name: 'IDF', icon: '', color: '#f97316' },
    ups: { name: 'UPS', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="18" rx="2"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/><path d="M13 10l-2 4h3l-2 4"/></svg>', color: '#eab308' },
    nvr: { name: 'NVR', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="8" cy="12" r="2"/><line x1="14" y1="9" x2="20" y2="9"/><line x1="14" y1="12" x2="20" y2="12"/><line x1="14" y1="15" x2="20" y2="15"/></svg>', color: '#ef4444' }
};

export const types = {
    desktop: { name: 'Desktop', icon: 'svg-desktop', svgIcon: true },
    laptop: { name: 'Laptop', icon: 'svg-laptop', svgIcon: true },
    cellphone: { name: 'Cell Phone', icon: 'svg-cellphone', svgIcon: true },
    tablet: { name: 'Tablet', icon: 'svg-tablet', svgIcon: true },
    otherendpoint: { name: 'Other Endpoint', icon: 'svg-other', svgIcon: true },
    server: { name: 'Server', icon: 'svg-server', svgIcon: true },
    nas: { name: 'NAS', icon: 'svg-nas', svgIcon: true },
    router: { name: 'Router', icon: 'svg-router', svgIcon: true },
    switch: { name: 'Switch', icon: 'svg-switch', svgIcon: true },
    firewall: { name: 'Firewall', icon: 'svg-firewall', svgIcon: true },
    ap: { name: 'Access Point', icon: 'svg-ap', svgIcon: true },
    vmhost: { name: 'VM Host', icon: 'svg-vmhost', svgIcon: true },
    vm: { name: 'VM', icon: 'svg-vm', svgIcon: true },
    storage: { name: 'Storage', icon: 'svg-storage', svgIcon: true },
    printer: { name: 'Printer', icon: 'svg-printer', svgIcon: true },
    iot: { name: 'IoT', icon: 'svg-iot', svgIcon: true },
    phone: { name: 'Desk Phone', icon: 'svg-phone', svgIcon: true },
    camera: { name: 'Security Camera', icon: 'svg-camera', svgIcon: true },
    vpn: { name: 'VPN', icon: 'svg-vpn', svgIcon: true }
};

export const manufacturers = {
    desktop: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'Microsoft', 'Intel NUC', 'Custom Build', 'Other'],
    laptop: ['Dell', 'HP', 'Lenovo', 'Apple', 'Asus', 'Acer', 'Microsoft', 'Samsung', 'MSI', 'Razer', 'Framework', 'Other'],
    cellphone: ['Apple', 'Samsung', 'Google', 'OnePlus', 'Motorola', 'LG', 'Xiaomi', 'Huawei', 'Sony', 'Nokia', 'Other'],
    tablet: ['Apple', 'Samsung', 'Microsoft', 'Lenovo', 'Amazon', 'Google', 'Huawei', 'Asus', 'Other'],
    printer: ['HP', 'Canon', 'Epson', 'Brother', 'Xerox', 'Lexmark', 'Ricoh', 'Kyocera', 'Dell', 'Samsung', 'Konica Minolta', 'Other'],
    otherendpoint: ['Generic', 'Custom', 'Other'],
    server: ['Dell', 'HP/HPE', 'Lenovo', 'Supermicro', 'Cisco', 'IBM', 'Fujitsu', 'Intel', 'Custom Build', 'Other'],
    vm: ['VMware', 'Hyper-V', 'Proxmox', 'KVM', 'VirtualBox', 'Xen', 'Other']
};

const _desktopOS = ['Windows 11', 'Windows 10', 'Windows 8.1', 'Windows 7', 'macOS Sonoma', 'macOS Ventura', 'macOS Monterey', 'macOS Big Sur', 'Ubuntu', 'Fedora', 'Debian', 'Linux Mint', 'Arch Linux', 'Pop!_OS', 'Chrome OS', 'Other'];
export const operatingSystems = {
    desktop: _desktopOS,
    laptop: _desktopOS,
    cellphone: ['iOS 17', 'iOS 16', 'iOS 15', 'Android 14', 'Android 13', 'Android 12', 'Android 11', 'Android 10', 'Other'],
    tablet: ['iPadOS 17', 'iPadOS 16', 'iPadOS 15', 'Android 14', 'Android 13', 'Android 12', 'Windows 11', 'Windows 10', 'Fire OS', 'Chrome OS', 'Other'],
    otherendpoint: ['Windows', 'macOS', 'Linux', 'Android', 'iOS', 'Embedded', 'Proprietary', 'Other'],
    server: ['Windows Server 2022', 'Windows Server 2019', 'Windows Server 2016', 'Windows Server 2012 R2', 'Ubuntu Server 24.04', 'Ubuntu Server 22.04', 'Ubuntu Server 20.04', 'RHEL 9', 'RHEL 8', 'CentOS Stream 9', 'Rocky Linux 9', 'AlmaLinux 9', 'Debian 12', 'Debian 11', 'SUSE Linux Enterprise', 'VMware ESXi', 'Proxmox VE', 'Other'],
    vm: ['Windows Server 2022', 'Windows Server 2019', 'Windows Server 2016', 'Windows 11', 'Windows 10', 'Ubuntu Server 24.04', 'Ubuntu Server 22.04', 'Ubuntu 24.04', 'Ubuntu 22.04', 'RHEL 9', 'RHEL 8', 'CentOS Stream 9', 'Rocky Linux 9', 'AlmaLinux 9', 'Debian 12', 'Debian 11', 'Other Linux', 'Other']
};

// SVG icon definitions - clean line-art style
export const svgDefs = {
    'svg-desktop': '<rect x="4" y="3" width="16" height="12" rx="1.5"/><line x1="8" y1="19" x2="16" y2="19"/><line x1="12" y1="15" x2="12" y2="19"/>',
    'svg-laptop': '<path d="M4 6a1 1 0 011-1h14a1 1 0 011 1v9H4V6z"/><path d="M2 17h20l-1.5 2H3.5L2 17z"/>',
    'svg-cellphone': '<rect x="7" y="2" width="10" height="20" rx="2"/><line x1="10" y1="18" x2="14" y2="18"/>',
    'svg-tablet': '<rect x="5" y="2" width="14" height="20" rx="2"/><circle cx="12" cy="19" r="1"/>',
    'svg-other': '<circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.8" fill="currentStroke"/>',
    'svg-server': '<rect x="4" y="2" width="16" height="6" rx="1.5"/><rect x="4" y="10" width="16" height="6" rx="1.5"/><circle cx="7" cy="5" r="1" fill="currentStroke"/><circle cx="7" cy="13" r="1" fill="currentStroke"/><line x1="14" y1="5" x2="18" y2="5"/><line x1="14" y1="13" x2="18" y2="13"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>',
    'svg-nas': '<rect x="3" y="5" width="18" height="14" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="15" x2="21" y2="15"/><circle cx="17" cy="7.5" r="1" fill="currentStroke"/><circle cx="17" cy="12.5" r="1" fill="currentStroke"/><circle cx="17" cy="17.5" r="1" fill="currentStroke"/>',
    'svg-router': '<rect x="3" y="10" width="18" height="8" rx="2"/><circle cx="7" cy="14" r="1" fill="currentStroke"/><line x1="12" y1="14" x2="19" y2="14"/><line x1="8" y1="4" x2="8" y2="10"/><line x1="16" y1="6" x2="16" y2="10"/><circle cx="8" cy="3" r="1.5"/><circle cx="16" cy="5" r="1.5"/>',
    'svg-switch': '<rect x="2" y="7" width="20" height="10" rx="2"/><line x1="5" y1="11" x2="5" y2="14"/><line x1="7.5" y1="11" x2="7.5" y2="14"/><line x1="10" y1="11" x2="10" y2="14"/><line x1="12.5" y1="11" x2="12.5" y2="14"/><line x1="15" y1="11" x2="15" y2="14"/><line x1="17.5" y1="11" x2="17.5" y2="14"/><circle cx="20" cy="9.5" r="0.8" fill="currentStroke"/>',
    'svg-firewall': '<rect x="3" y="4" width="18" height="16" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><path d="M9 9v11"/><path d="M15 4v5"/><circle cx="6" cy="6.5" r="1" fill="currentStroke"/><line x1="12" y1="13" x2="12" y2="17"/>',
    'svg-ap': '<path d="M6 8a8 8 0 0112 0"/><path d="M8.5 10.5a5 5 0 017 0"/><path d="M11 13a2 2 0 012 0"/><circle cx="12" cy="15" r="1.5" fill="currentStroke"/><line x1="12" y1="16.5" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>',
    'svg-vmhost': '<rect x="2" y="2" width="20" height="6" rx="1.5"/><rect x="2" y="10" width="20" height="6" rx="1.5"/><circle cx="5" cy="5" r="1" fill="currentStroke"/><circle cx="5" cy="13" r="1" fill="currentStroke"/><circle cx="8" cy="5" r="1" fill="currentStroke"/><circle cx="8" cy="13" r="1" fill="currentStroke"/><line x1="14" y1="5" x2="20" y2="5"/><line x1="14" y1="13" x2="20" y2="13"/><line x1="12" y1="18" x2="12" y2="20"/><line x1="8" y1="20" x2="16" y2="20"/>',
    'svg-vm': '<rect x="4" y="4" width="16" height="12" rx="1.5" stroke-dasharray="3,2"/><path d="M9 10l2 2 4-4"/>',
    'svg-storage': '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v4c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 10v4c0 1.66 3.58 3 8 3s8-1.34 8-3v-4"/>',
    'svg-printer': '<rect x="5" y="10" width="14" height="8" rx="1.5"/><rect x="7" y="3" width="10" height="7" rx="1"/><rect x="7" y="18" width="10" height="3" rx="0.5"/><circle cx="16" cy="13" r="1" fill="currentStroke"/>',
    'svg-iot': '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="1.5" fill="currentStroke"/><line x1="12" y1="3" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="21"/><line x1="3" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="21" y2="12"/>',
    'svg-phone': '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z"/>',
    'svg-camera': '<path d="M4 8h2v8H4z" fill="currentFill" opacity="0.3"/><rect x="6" y="7" width="4" height="10" rx="1"/><rect x="10" y="8.5" width="10" height="7" rx="3.5"/><circle cx="17" cy="12" r="2"/><circle cx="17" cy="12" r="0.8" fill="currentStroke"/>',
    'svg-vpn': '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 6V5a4 4 0 018 0v1"/><circle cx="12" cy="13" r="2"/><line x1="12" y1="15" x2="12" y2="16.5"/>'
};

export function getSvgIcon(name, size) {
    const s = size || 24;
    const paths = svgDefs[name];
    if (!paths) return '';
    const processed = paths.replace(/currentStroke/g, '#333').replace(/currentFill/g, '#ccc');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + processed + '</svg>';
}

export function getSvgIconSidebar(name) {
    const paths = svgDefs[name];
    if (!paths) return '';
    const processed = paths.replace(/currentStroke/g, 'currentColor').replace(/currentFill/g, 'currentColor');
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + processed + '</svg>';
}
