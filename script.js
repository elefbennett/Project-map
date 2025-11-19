<script>
// ------------------ Login (unchanged) ------------------
function loginUser() {
  const user = document.getElementById("username")?.value;
  const pass = document.getElementById("password")?.value;
  if (user === "member" && pass === "syv2025") {
    window.location.href = "dashboard.html";
  } else {
    alert("Invalid credentials.");
  }
  return false;
}

// ------------------ Config ------------------
const SHEET_CSV_URL =
  'https://corsproxy.io/?https://docs.google.com/spreadsheets/d/1fUKAQlPWiotRlFQw95qbvUjvxwNFJGWWT3RX6OcCKRI/export?format=csv';

const SUPPORTED_MARKER_COLORS = ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];
const workTypeColorMap = Object.create(null);

let map, markerCluster, allProjects = [];

// ------------------ CSV → objects ------------------
async function fetchProjects() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (!lines.length) return [];

    const keys = lines[0].split(',').map(k => k.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const obj = {};
      keys.forEach((k, i) => obj[k] = vals[i] || '');
      return obj;
    });
  } catch (err) {
    console.error('CSV fetch failed:', err);
    const main = document.querySelector('main');
    if (main) {
      const note = document.createElement('div');
      note.style = 'margin:20px auto; padding:16px; background:#fff3cd; border:1px solid #ffeeba; border-radius:12px; text-align:center; max-width:800px;';
      note.textContent = 'Could not load project data right now. Showing base map only.';
      main.prepend(note);
    }
    return [];
  }
}

// ------------------ UI: Multi-select dropdown filters ------------------
function buildFiltersUI({ workTypes }) {
  const main = document.querySelector('main');
  if (!main) return;

  const filtersHTML = `
    <section id="filters">
      <div class="filter-group">
        <h3>🔍 Search Projects</h3>
        <input type="text" id="searchBox" placeholder="Job name, city, vineyard, address..." />
      </div>

      <div class="filter-group">
        <h3>Work Type</h3>
        <select id="workTypeSelect" multiple placeholder="All Work Types">
          ${workTypes.map(wt => `<option value="${wt}">${wt}</option>`).join('')}
        </select>
        <small style="color:#666; display:block; margin-top:4px;">Hold Ctrl/Cmd or Shift to select multiple</small>
      </div>

      <div class="filter-actions">
        <button id="resetFilters" class="btn secondary">Reset All</button>
        <span id="resultCount" class="result-count">Loading...</span>
      </div>

      <div id="legend" class="legend"><strong>Legend:</strong></div>
    </section>`;

  main.insertAdjacentHTML('beforeend', filtersHTML);

  // Make the <select> look beautiful
  const select = document.getElementById('workTypeSelect');
  select.size = Math.min(workTypes.length, 8); // show up to 8 items without scrolling too much

  // Legend (clickable)
  const legend = document.getElementById('legend');
  Object.entries(workTypeColorMap).sort((a,b) => workTypes.indexOf(a[0]) - workTypes.indexOf(b[0])).forEach(([wt, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="swatch" style="background:${color}"></span>${wt}`;
    item.style.cursor = 'pointer';
    item.title = 'Click to toggle in filter';
    item.onclick = () => {
      const option = select.querySelector(`option[value="${wt}"]`);
      if (option) {
        option.selected = !option.selected;
        plotFiltered();
      }
    };
    legend.appendChild(item);
  });
}

// ------------------ Map + plotting ------------------
async function initProjectsMap() {
  const mapHost = document.getElementById('map');
  if (!mapHost) return;

  // Loading overlay
  const overlay = document.createElement('div');
  overlay.id = 'mapOverlay';
  overlay.innerHTML = `<div class="spinner"></div><div>Loading projects...</div>`;
  mapHost.style.position = 'relative';
  mapHost.appendChild(overlay);

  // Map setup
  map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  markerCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 60
  });
  map.addLayer(markerCluster);

  // Top controls
  mapHost.insertAdjacentHTML('beforeend', `
    <div id="topControls">
      <button id="toggleFilters" class="btn">⚙️ Filters</button>
      <button id="locateMe" class="btn">📍 Near Me</button>
      <button id="darkMode" class="btn">🌙 Dark</button>
    </div>`);

  // Load data
  allProjects = await fetchProjects();
  if (!allProjects.length) {
    overlay.innerHTML = '<div style="color:#c53030">No data loaded</div>';
    return;
  }

  const workTypes = [...new Set(allProjects.map(p => p['Work Type']).filter(Boolean))].sort();
  workTypes.forEach((wt, i) => workTypeColorMap[wt] = SUPPORTED_MARKER_COLORS[i % SUPPORTED_MARKER_COLORS.length]);

  buildFiltersUI({ workTypes });
  overlay.remove();

  document.getElementById('resultCount').textContent = `All ${allProjects.length} projects loaded`;
  plotFiltered();

  // Live filtering
  let debounce;
  const livePlot = () => {
    clearTimeout(debounce);
    debounce = setTimeout(plotFiltered, 250);
  };
  document.getElementById('searchBox').addEventListener('input', livePlot);
  document.getElementById('workTypeSelect').addEventListener('change', plotFiltered);

  // Buttons
  document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('searchBox').value = '';
    Array.from(document.getElementById('workTypeSelect').options).forEach(opt => opt.selected = false);
    plotFiltered();
  });

  document.getElementById('locateMe').addEventListener('click', () => {
    map.locate({ setView: true, maxZoom: 12 });
    map.once('locationfound', e => L.marker(e.latlng).addTo(map).bindPopup('You are here').openPopup());
  });

  document.getElementById('toggleFilters').addEventListener('click', () => {
    document.getElementById('filters').classList.toggle('collapsed');
  });

  document.getElementById('darkMode').addEventListener('click', () => {
    document.body.classList.toggle('dark');
  });
}

function parseLatLon(p) {
  let lat = p['Latitude'] || p[' Latitude'] || p['lat'] || p[' latitude'];
  let lon = p['Longitude'] || p[' Longitude'] || p['lon'] || p[' longitude'];
  if (!lat || !lon) return null;
  const [plat, plon] = [parseFloat(lat), parseFloat(lon)];
  return isNaN(plat) || isNaN(plon) ? null : [plat, plon];
}

function makeIcon(color) {
  return L.icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
  });
}

function matchesFilters(p) {
  const query = document.getElementById('searchBox')?.value.trim().toLowerCase() || '';
  const selectedTypes = Array.from(document.getElementById('workTypeSelect')?.selectedOptions || []).map(o => o.value);

  if (selectedTypes.length && !selectedTypes.includes(p['Work Type'])) return false;
  if (query && !Object.values(p).join(' ').toLowerCase().includes(query)) return false;
  return true;
}

function plotFiltered() {
  markerCluster.clearLayers();
  const bounds = L.latLngBounds();
  let count = 0;

  for (const p of allProjects) {
    if (!matchesFilters(p)) continue;
    const coords = parseLatLon(p);
    if (!coords) continue;

    const color = workTypeColorMap[p['Work Type']] || 'grey';
    const marker = L.marker(coords, { icon: makeIcon(color) });

    const address = [p['Street Address'], p['City'], p['State'], p['Zip Code']].filter(Boolean).join(', ');
    marker.bindPopup(`
      <div class="project-popup">
        <strong>${p['Job Name'] || 'Unnamed Project'}</strong><br>
        ${address}<br><br>
        <b>Work Type:</b> ${p['Work Type'] || '—'}
      </div>`);

    markerCluster.addLayer(marker);
    bounds.extend(coords);
    count++;
  }

  const rc = document.getElementById('resultCount');
  rc.textContent = count ? `${count} project${count > 1 ? 's' : ''} shown` : 'No projects match';
  rc.style.color = count ? 'var(--color-primary)' : '#c53030';

  if (count > 0) map.fitBounds(bounds.pad(0.2));
}

// ------------------ Boot ------------------
document.addEventListener('DOMContentLoaded', () => {
  initProjectsMap();
});
</script>
