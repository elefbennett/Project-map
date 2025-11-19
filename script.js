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

// ------------------ CSV → objects (improved parser) ------------------
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

// ------------------ UI: dynamic checkbox filters (now beautiful + live search) ------------------
function buildFiltersUI({ workTypes, dealStages }) {
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
        <div id="workTypeGroup" class="checkbox-group"></div>
      </div>

      <div class="filter-group">
        <h3>Deal Stage</h3>
        <div id="dealStageGroup" class="checkbox-group"></div>
      </div>

      <div class="filter-actions">
        <button id="resetFilters" class="btn secondary">Reset All</button>
        <span id="resultCount" class="result-count">Loading...</span>
      </div>

      <div id="legend" class="legend"><strong>Legend:</strong></div>
    </section>`;

  const div = document.createElement('div');
  div.innerHTML = filtersHTML;
  const filters = div.firstElementChild;

  // Insert before map
  const mapEl = document.getElementById('map');
  main.insertBefore(filters, mapEl);

  // Populate checkboxes
  const populate = (id, items) => {
    const el = document.getElementById(id);
    el.innerHTML = items.map(val => `
      <label class="checkbox-label">
        <input type="checkbox" value="${val}">
        <span class="checkmark"></span>${val}
      </label>`).join('');
  };
  populate('workTypeGroup', workTypes);
  populate('dealStageGroup', dealStages);

  // Legend (clickable!)
  const legend = document.getElementById('legend');
  Object.entries(workTypeColorMap).forEach(([wt, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="swatch" style="background:${color}"></span>${wt}`;
    item.style.cursor = 'pointer';
    item.title = 'Click to toggle';
    item.onclick = () => {
      const cb = document.querySelector(`#workTypeGroup input[value="${wt}"]`);
      if (cb) { cb.checked = !cb.checked; plotFiltered(); }
    };
    legend.appendChild(item);
  });
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// ------------------ Map + plotting (now with clusters, live filter, loading, etc.) ------------------
async function initProjectsMap() {
  const mapHost = document.getElementById('map');
  if (!mapHost) return;

  // Loading overlay
  const overlay = document.createElement('div');
  overlay.id = 'mapOverlay';
  overlay.innerHTML = `<div class="spinner"></div><div>Loading projects...</div>`;
  mapHost.appendChild(overlay);

  // Base map
  map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Marker clustering
  markerCluster = L.markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 60
  });
  map.addLayer(markerCluster);

  // Controls (Near Me, Filters toggle, Dark Mode)
  const controlsHTML = `
    <div id="topControls">
      <button id="toggleFilters" class="btn">⚙️ Filters</button>
      <button id="locateMe" class="btn">📍 Near Me</button>
      <button id="darkMode" class="btn">🌙 Dark</button>
    </div>`;
  mapHost.insertAdjacentHTML('beforeend', controlsHTML);

  // Load data
  allProjects = await fetchProjects();
  if (!allProjects.length) {
    overlay.innerHTML = '<div style="color:#c53030">No data loaded</div>';
    return;
  }

  const workTypes = [...new Set(allProjects.map(p => p['Work Type']).filter(Boolean))].sort();
  const dealStages = [...new Set(allProjects.map(p => p['Deal Stage']).filter(Boolean))].sort();

  workTypes.forEach((wt, i) => workTypeColorMap[wt] = SUPPORTED_MARKER_COLORS[i % SUPPORTED_MARKER_COLORS.length]);

  buildFiltersUI({ workTypes, dealStages });

  // Remove loading overlay
  overlay.remove();

  // Initial plot
  document.getElementById('resultCount').textContent = `All ${allProjects.length} projects loaded`;
  plotFiltered();

  // Live filtering (debounced)
  let debounce;
  const livePlot = () => {
    clearTimeout(debounce);
    debounce = setTimeout(plotFiltered, 300);
  };
  document.getElementById('filters').addEventListener('change', livePlot);
  document.getElementById('searchBox')?.addEventListener('input', livePlot);

  // Buttons
  document.getElementById('resetFilters')?.addEventListener('click', () => {
    document.getElementById('searchBox').value = '';
    document.querySelectorAll('#filters input[type="checkbox"]').forEach(c => c.checked = false);
    plotFiltered();
  });

  document.getElementById('locateMe')?.addEventListener('click', () => {
    map.locate({ setView: true, maxZoom: 12 });
    map.once('locationfound', e => L.marker(e.latlng).addTo(map).bindPopup('You are here').openPopup());
  });

  document.getElementById('toggleFilters')?.addEventListener('click', () => {
    document.getElementById('filters').classList.toggle('collapsed');
  });

  document.getElementById('darkMode')?.addEventListener('click', () => {
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
  const wtChecks = Array.from(document.querySelectorAll('#workTypeGroup input:checked')).map(c => c.value);
  const dsChecks = Array.from(document.querySelectorAll('#dealStageGroup input:checked')).map(c => c.value);

  if (wtChecks.length && !wtChecks.includes(p['Work Type'])) return false;
  if (dsChecks.length && !dsChecks.includes(p['Deal Stage'])) return false;
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
        <b>Work Type:</b> ${p['Work Type'] || '—'}<br>
        <b>Deal Stage:</b> ${p['Deal Stage'] || '—'}
      </div>`);

    markerCluster.addLayer(marker);
    bounds.extend(coords);
    count++;
  }

  const rc = document.getElementById('resultCount');
  if (rc) rc.textContent = count ? `${count} project${count > 1 ? 's' : ''} shown` : 'No projects match';

  if (count > 0) map.fitBounds(bounds.pad(0.2));
}

// ------------------ Boot (unchanged) ------------------
document.addEventListener('DOMContentLoaded', () => {
  initProjectsMap();
});
</script>

<!-- Add these styles to your existing CSS file (or keep here) -->
<style>
  #mapOverlay { position:absolute; inset:0; background:rgba(255,255,255,0.95); z-index:1000; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:16px; font-size:1.3rem; }
  .spinner { width:48px; height:48px; border:5px solid #f3f3f3; border-top:5px solid #722f37; border-radius:50%; animation:spin 1s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }

  #topControls { position:absolute; top:12px; left:12px; z-index:1000; display:flex; gap:10px; flex-wrap:wrap; }
  #topControls .btn { background:rgba(255,255,255,0.9); padding:10px 16px; border:none; border-radius:50px; box-shadow:0 4px 12px rgba(0,0,0,0.15); font-weight:600; }

  #filters.collapsed { transform:translateY(-110%); transition:transform .4s; }
  @media (max-width:768px) { #filters { transition:transform .4s; } }

  body.dark { background:#121212 !important; color:#eee !important; }
  body.dark #filters, body.dark .project-popup { background:#1e1e1e !important; border-color:#444 !important; }
  body.dark .checkbox-label { background:#333 !important; }
  body.dark .checkbox-label:hover { background:#444 !important; }
</style>
