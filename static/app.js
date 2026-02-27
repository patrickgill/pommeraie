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
let searchTimeout = null;

async function fetchJSON(url) {
  const res = await fetch(API + url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadCategories() {
  const categories = await fetchJSON('/api/categories');
  const list = document.getElementById('category-list');
  list.innerHTML = '';
  for (const cat of categories) {
    const li = document.createElement('li');
    li.dataset.name = cat.name;
    li.innerHTML = `<span>${formatCategoryName(cat.name)}</span><span class="count">${cat.count}</span>`;
    li.addEventListener('click', () => selectCategory(cat.name));
    list.appendChild(li);
  }
}

async function selectCategory(name) {
  currentCategory = name;

  document.querySelectorAll('#category-list li').forEach(li => {
    li.classList.toggle('active', li.dataset.name === name);
  });

  showView('items-view');
  document.getElementById('items-title').textContent = formatCategoryName(name);

  const items = await fetchJSON(`/api/categories/${name}`);
  document.getElementById('items-count').textContent = `${items.length} products`;
  renderItemsGrid(items, document.getElementById('items-grid'));
}

function renderItemsGrid(items, container) {
  container.innerHTML = '';
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'item-card';
    card.addEventListener('click', () => showDetail(item.uuid));

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

async function showDetail(uuid) {
  showView('detail-view');
  const item = await fetchJSON(`/api/items/${uuid}`);
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

document.getElementById('back-btn').addEventListener('click', () => {
  if (currentCategory) {
    selectCategory(currentCategory);
  } else {
    showView('welcome');
  }
});

document.getElementById('search').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  const q = e.target.value.trim();
  if (q.length < 2) {
    if (currentCategory) {
      selectCategory(currentCategory);
    } else {
      showView('welcome');
    }
    return;
  }
  searchTimeout = setTimeout(async () => {
    const results = await fetchJSON(`/api/search?q=${encodeURIComponent(q)}`);
    showView('search-results');
    const grid = document.getElementById('search-grid');
    grid.innerHTML = '';
    if (results.length === 0) {
      grid.innerHTML = '<p style="color: var(--text-secondary)">No results found.</p>';
      return;
    }
    for (const item of results) {
      const card = document.createElement('div');
      card.className = 'item-card';
      card.addEventListener('click', () => {
        currentCategory = item.category;
        showDetail(item.uuid);
      });
      card.innerHTML = `
        <span class="search-category">${formatCategoryName(item.category)}</span>
        <h3>${item.modelName}</h3>
        <div class="meta">${item.introduction || ''}</div>
        ${item.supportStatus ? `<span class="status-badge ${statusClass(item.supportStatus)}">${item.supportStatus}</span>` : ''}
      `;
      grid.appendChild(card);
    }
  }, 250);
});

loadCategories();
