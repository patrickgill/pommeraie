const API = '';

const categoryLabels = {
  AppleSeries: 'Apple Series',
  AppleTVs: 'Apple TVs',
  AUX: 'A/UX',
  Cameras: 'Cameras',
  ClassicMacs: 'Classic Macs',
  Displays: 'Displays',
  eMacs: 'eMacs',
  iBooks: 'iBooks',
  iMacs: 'iMacs',
  iOS: 'iOS',
  iPadAirs: 'iPad Air',
  iPadminis: 'iPad mini',
  iPadOS: 'iPadOS',
  iPadPros: 'iPad Pro',
  iPads: 'iPads',
  iPods: 'iPods',
  MacBookAir: 'MacBook Air',
  MacBookPros: 'MacBook Pro',
  MacBooks: 'MacBooks',
  MacOS: 'Classic Mac OS',
  MacOSX: 'macOS',
  MacPros: 'Mac Pro',
  MacStudios: 'Mac Studio',
  Macminis: 'Mac mini',
  MiceAndKeyboards: 'Mice & Keyboards',
  Newtons: 'Newton',
  Performas: 'Performa',
  Phones: 'iPhone',
  PowerBookGSeries: 'PowerBook G Series',
  PowerBooks: 'PowerBooks',
  PowerMacGSeries: 'Power Mac G Series',
  PowerMacs: 'Power Macs',
  Printers: 'Printers',
  Scanners: 'Scanners',
  Servers: 'Servers',
  Speakers: 'Speakers',
  Storage: 'Storage',
  Telecom: 'Telecom',
  tvOS: 'tvOS',
  VisionOS: 'visionOS',
  VisionPro: 'Vision Pro',
  WatchOS: 'watchOS',
  Watches: 'Apple Watch',
  WiFiBaseStations: 'Wi-Fi Base Stations',
  Xserves: 'Xserve',
};

function formatCategoryName(name) {
  return categoryLabels[name] || name;
}

function statusClass(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s === 'supported') return 'supported';
  if (s === 'obsolete') return 'obsolete';
  if (s === 'vintage') return 'vintage';
  return 'mixed';
}

// Group spec keys into logical sections
const specGroups = [
  {
    title: 'Overview',
    keys: ['ModelName', 'ModelNameAlternate', 'Tagline', 'Introduction', 'Discontinued', 'SupportStatus',
           'PurchasePriceUSD', 'PurchasePriceGBP', 'PurchasePriceEUR', 'PurchasePriceCAD',
           'PurchasePriceJPY', 'PurchasePriceAUD', 'OrderNumber', 'FamilyNumber', 'Colors', 'Codename'],
  },
  {
    title: 'Processor & Performance',
    keys: ['Processor', 'ProcessorSpeed', 'ProcessorSpeedMax', 'ProcessorCores', 'ProcessorArchitecture',
           'ProcessorManufactureProcess', 'ProcessorTechnologyNode', 'ProcessorNeuralEngine',
           'ProcessorNeuralEngineCores', 'Coprocessor', 'CoprocessorSpeed', 'Cache', 'SystemBus'],
  },
  {
    title: 'Memory',
    keys: ['RAMLogicBoard', 'RAMMax', 'RAMSlots', 'RAMSpeed', 'RAMBandwidth', 'MemoryInterleaving'],
  },
  {
    title: 'Storage',
    keys: ['HardDrive', 'HDBus', 'Media', 'LargeATADriveSupport', 'Capacity'],
  },
  {
    title: 'Display',
    keys: ['Display', 'ExternalDisplayResolution', 'Resolutions', 'DisplayInput', 'DisplayModes',
           'Brightness', 'ContrastRatio', 'PixelDensity', 'DisplayRefreshRate', 'ViewableAngle',
           'ViewableArea', 'DisplayColor', 'DisplayGlass', 'DisplayMaterial', 'DisplaySupport',
           'PhoneScreenResolution', 'PhoneScreenSizeMetric'],
  },
  {
    title: 'Graphics',
    keys: ['GraphicsCard', 'GraphicsCardMem', 'GraphicsCardConnection', 'GraphicsCores', 'MetalSupport'],
  },
  {
    title: 'Connectivity',
    keys: ['USB', 'ThunderboltPort', 'FireWire', 'Ethernet', 'AirPort', 'Bluetooth', 'Modem',
           'Serial', 'SCSI', 'Infrared', 'NFC', 'UltraWideband', 'WiFiBaseStations'],
  },
  {
    title: 'Audio & Video',
    keys: ['SoundIn', 'SoundOut', 'Audio', 'AudioOutput', 'AudioCapacity', 'AudioFormats',
           'VideoIn', 'VideoOut', 'VideoOutput', 'VideoFormats', 'VideoRecordingFormat',
           'BuiltInCamera', 'CameraResolution', 'CameraAperture', 'FaceID', 'TouchID'],
  },
  {
    title: 'Software',
    keys: ['OriginalMacOS', 'LaterMacOS', 'MaxMacOS', 'MacOSVersions', 'MinorVersions',
           'AppArchitectureSupport', 'BundledSoftware', 'SupportedDevices'],
  },
  {
    title: 'Power',
    keys: ['MaxWatts', 'PowerAdapter', 'Battery', 'BatteryCapacity', 'BatteryLife',
           'BatteryRecharge', 'BatteryStandby', 'LineVoltage', 'PowerSource', 'ENERGYSTAR', 'EPEAT'],
  },
  {
    title: 'Physical',
    keys: ['DimensionsUS', 'DimensionsMetric', 'CaseMaterial', 'WaterResistance', 'DustResistance'],
  },
  {
    title: 'Expansion',
    keys: ['Slots', 'ExpansionBays', 'MacDisplayConnection'],
  },
];

const skipKeys = new Set([
  'UUID', 'AppleFileIcon', 'Image', 'ImageBackground', 'ImageBit', 'ImageCredit',
  'ImageCreditLicense', 'ImageCreditLicenseURL', 'ImageCreditURL', 'ImageSourceURL',
  'IconCredit', 'IconCreditURL', 'TemplateFile', 'SortDate', 'AppleDefaultLinks',
  'AppleFirmwareUpdates', 'ModelPhotos', 'PerformanceResults',
]);

function formatLabel(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/^Purchase Price/, 'Price ')
    .replace(/^RAM/, 'RAM ')
    .replace(/^HD/, 'HD ')
    .replace(/USB/, 'USB');
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === 'object') {
      return value.map(v => {
        if (v.DefaultLinkTitle && v.DefaultLinkURL) {
          return `<a href="${v.DefaultLinkURL}" target="_blank">${v.DefaultLinkTitle}</a>`;
        }
        return JSON.stringify(v);
      }).join('<br>');
    }
    return value.join(', ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const str = String(value);
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return `<a href="${str}" target="_blank">${str}</a>`;
  }
  return str;
}

let currentCategory = null;
let currentSideboardIndex = null;
let searchTimeout = null;
let searchGen = 0;
let itemSlugToUuid = {};
let navigating = false;

async function fetchJSON(url) {
  const res = await fetch(API + url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Routing ---

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

let sideboardSlugToIndex = {};

function itemSlug(name, uuid) {
  let slug = slugify(name || 'unknown');
  if (itemSlugToUuid[slug] && itemSlugToUuid[slug] !== uuid) {
    slug = slug + '-' + uuid.slice(0, 8);
  }
  itemSlugToUuid[slug] = uuid;
  return slug;
}

async function resolveSlugAndShow(slug) {
  const query = slug.replace(/-/g, ' ');
  const results = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
  for (const item of results) {
    if (slugify(item.modelName) === slug || itemSlug(item.modelName, item.uuid) === slug) {
      showDetail(item.uuid, true);
      return;
    }
  }
  if (results.length > 0) {
    showDetail(results[0].uuid, true);
  } else {
    showView('welcome');
  }
}

function navigate(hash) {
  navigating = true;
  window.location.hash = hash;
  navigating = false;
}

function handleRoute() {
  const hash = window.location.hash || '#/';
  const parts = hash.slice(1).split('/').filter(Boolean);

  if (parts.length === 0) {
    showView('welcome');
    currentSideboardIndex = null;
    document.querySelectorAll('#sidebar-list li').forEach(li => li.classList.remove('active'));
    return;
  }

  if (parts[0] === 'browse' && parts[1] !== undefined) {
    const slug = decodeURIComponent(parts.slice(1).join('/'));
    const index = sideboardSlugToIndex[slug];
    if (index !== undefined) {
      selectSideboardEntry(index, true);
    }
    return;
  }

  if (parts[0] === 'item' && parts[1]) {
    const itemKey = decodeURIComponent(parts.slice(1).join('/'));
    const uuid = itemSlugToUuid[itemKey];
    if (uuid) {
      showDetail(uuid, true);
    } else {
      resolveSlugAndShow(itemKey);
    }
    return;
  }

  if (parts[0] === 'search' && parts[1]) {
    const query = decodeURIComponent(parts.slice(1).join('/'));
    const searchInput = document.getElementById('search');
    if (document.activeElement !== searchInput) {
      searchInput.value = query;
    }
    performSearch(query, true);
    return;
  }

  showView('welcome');
}

window.addEventListener('hashchange', () => {
  if (!navigating) handleRoute();
});

// --- Sidebar ---

let sideboardEntries = [];

async function loadSideboard() {
  const entries = await fetchJSON('/api/sideboard');
  sideboardEntries = entries;
  sideboardSlugToIndex = {};
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].type !== 'group') {
      sideboardSlugToIndex[slugify(entries[i].name)] = i;
    }
  }
  const list = document.getElementById('sidebar-list');
  list.innerHTML = '';

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.type === 'group') {
      const li = document.createElement('li');
      li.className = 'sidebar-group';
      li.textContent = entry.name;
      list.appendChild(li);
      continue;
    }

    const li = document.createElement('li');
    li.dataset.index = i;
    li.innerHTML = `<span>${entry.name}</span>`;
    li.addEventListener('click', () => selectSideboardEntry(i));
    list.appendChild(li);
  }
}

function sideboardFetchURL(entry) {
  if (entry.type === 'category') {
    if (entry.categories) {
      return `/api/multicategory?names=${entry.categories.join(',')}`;
    }
    return `/api/categories/${entry.category}`;
  }
  if (entry.type === 'filter') {
    const f = entry.filter;
    let url = `/api/filter?field=${encodeURIComponent(f.field)}&op=${encodeURIComponent(f.op)}&value=${encodeURIComponent(f.value)}`;
    if (f.categories) {
      url += `&categories=${f.categories.join(',')}`;
    }
    return url;
  }
  return null;
}

async function selectSideboardEntry(index, fromRouter) {
  const entry = sideboardEntries[index];
  if (!entry || entry.type === 'group') return;

  currentCategory = entry.category || null;
  currentSideboardIndex = index;

  if (!fromRouter) navigate(`#/browse/${slugify(entry.name)}`);

  document.querySelectorAll('#sidebar-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.index === String(index));
  });

  showView('items-view');
  window.scrollTo(0, 0);
  document.getElementById('items-title').textContent = entry.name;

  const url = sideboardFetchURL(entry);
  const items = await fetchJSON(url);
  renderItemsGrid(items, document.getElementById('items-grid'));
  document.getElementById('items-status').textContent = `${items.length} item${items.length !== 1 ? 's' : ''}`;

  closeSidebar();
}

function renderItemsGrid(items, container) {
  container.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'item-card';
    const slug = itemSlug(item.modelName, item.uuid);
    card.addEventListener('click', () => showDetail(item.uuid, false, slug));

    let meta = '';
    if (item.introduction) meta += `Introduced: ${item.introduction}`;
    if (item.processor) meta += `<br>Processor: ${item.processor}`;
    if (item.purchasePriceUSD) meta += `<br>${item.purchasePriceUSD}`;

    let badge = '';
    if (item.supportStatus) {
      badge = `<span class="status-badge ${statusClass(item.supportStatus)}">${item.supportStatus}</span>`;
    }

    let tagline = '';
    if (item.tagline) {
      tagline = `<div class="tagline">${item.tagline}</div>`;
    }

    card.innerHTML = `
      <h3>${item.modelName || 'Unknown'}</h3>
      <div class="meta">${meta}</div>
      ${tagline}
      ${badge}
    `;
    container.appendChild(card);
  }
}

async function showDetail(uuid, fromRouter, slug) {
  if (!fromRouter) {
    const s = slug || itemSlug(uuid, uuid);
    navigate(`#/item/${s}`);
  }
  showView('detail-view');
  window.scrollTo(0, 0);
  const item = await fetchJSON(`/api/items/${uuid}`);
  if (item.ModelName && item.UUID) {
    itemSlug(item.ModelName, item.UUID);
  }
  const content = document.getElementById('detail-content');

  const tagline = item.Tagline ? `<div class="tagline">${item.Tagline}</div>` : '';
  let badge = '';
  if (item.SupportStatus) {
    badge = `<span class="status-badge ${statusClass(item.SupportStatus)}">${item.SupportStatus}</span>`;
  }

  let html = `
    <div class="detail-header">
      <h2>${item.ModelName || 'Unknown'}</h2>
      ${tagline}
      ${badge}
    </div>
    <div class="detail-specs">
  `;

  const usedKeys = new Set(skipKeys);

  for (const group of specGroups) {
    const rows = [];
    for (const key of group.keys) {
      if (item[key] !== undefined && item[key] !== null && item[key] !== '' && item[key] !== '--') {
        rows.push(`<div class="spec-row"><div class="spec-label">${formatLabel(key)}</div><div class="spec-value">${formatValue(item[key])}</div></div>`);
        usedKeys.add(key);
      }
    }
    if (rows.length > 0) {
      html += `<div class="spec-group"><h3>${group.title}</h3>${rows.join('')}</div>`;
    }
  }

  // Remaining keys not in any group
  const remaining = [];
  for (const key of Object.keys(item).sort()) {
    if (!usedKeys.has(key) && item[key] !== undefined && item[key] !== null && item[key] !== '' && item[key] !== '--') {
      remaining.push(`<div class="spec-row"><div class="spec-label">${formatLabel(key)}</div><div class="spec-value">${formatValue(item[key])}</div></div>`);
    }
  }
  if (remaining.length > 0) {
    html += `<div class="spec-group"><h3>Other</h3>${remaining.join('')}</div>`;
  }

  html += '</div>';
  content.innerHTML = html;
}

function showView(id) {
  document.getElementById('welcome').classList.add('hidden');
  document.getElementById('items-view').classList.add('hidden');
  document.getElementById('detail-view').classList.add('hidden');
  document.getElementById('search-results').classList.add('hidden');
  document.getElementById(id).classList.remove('hidden');
}

// --- Back button ---

document.getElementById('back-btn').addEventListener('click', () => {
  if (window.history.length > 1) {
    history.back();
  } else if (currentSideboardIndex !== null) {
    navigate(`#/browse/${slugify(sideboardEntries[currentSideboardIndex].name)}`);
  } else {
    navigate('#/');
  }
});

// --- Search ---

async function performSearch(query, fromRouter) {
  if (!fromRouter) navigate(`#/search/${encodeURIComponent(query)}`);
  showView('search-results');
  document.getElementById('search-status').textContent = '';
  document.getElementById('search-grid').innerHTML = '';
  const gen = ++searchGen;
  const results = await fetchJSON(`/api/search?q=${encodeURIComponent(query)}`);
  if (gen !== searchGen) return;
  const grid = document.getElementById('search-grid');
  if (results.length === 0) {
    document.getElementById('search-status').textContent = '';
    grid.innerHTML = `<div class="no-results">No results found for &ldquo;${query}&rdquo;</div>`;
    return;
  }
  document.getElementById('search-status').textContent = `${results.length} item${results.length !== 1 ? 's' : ''}`;
  for (const item of results) {
    const card = document.createElement('div');
    card.className = 'item-card';
    const slug = itemSlug(item.modelName, item.uuid);
    card.addEventListener('click', () => {
      currentCategory = item.category;
      showDetail(item.uuid, false, slug);
    });
    card.innerHTML = `
      <span class="search-category">${formatCategoryName(item.category)}</span>
      <h3>${item.modelName}</h3>
      <div class="meta">${item.introduction || ''}</div>
      ${item.supportStatus ? `<span class="status-badge ${statusClass(item.supportStatus)}">${item.supportStatus}</span>` : ''}
    `;
    grid.appendChild(card);
  }
}

document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const raw = e.target.value;
  const q = raw.trim();
  if (q.length < 2) {
    if (q.length === 0) {
      if (currentSideboardIndex !== null) {
        navigate(`#/browse/${slugify(sideboardEntries[currentSideboardIndex].name)}`);
      } else {
        navigate('#/');
      }
    }
    return;
  }
  searchTimeout = setTimeout(() => performSearch(q), 250);
});

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  clearTimeout(searchTimeout);
  const q = document.getElementById('search').value.trim();
  if (q.length >= 2) {
    performSearch(q);
  }
  document.getElementById('search').blur();
  closeSidebar();
});

// --- Theme toggle ---

function systemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  const html = document.documentElement;
  html.classList.remove('light', 'dark');
  html.classList.add(mode);
  document.getElementById('theme-toggle').textContent = mode === 'dark' ? '\u263E' : '\u2600';
}

applyTheme(localStorage.getItem('theme') || systemTheme());

document.getElementById('theme-toggle').addEventListener('click', () => {
  const next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  applyTheme(next);
});

// --- Mobile sidebar toggle ---

function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

document.getElementById('menu-btn').addEventListener('click', () => {
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open')) {
    closeSidebar();
  } else {
    openSidebar();
  }
});

document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

// --- Startup ---

loadSideboard().then(() => handleRoute());
