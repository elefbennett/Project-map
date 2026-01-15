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
const SHEET_CSV_URL = 'https://corsproxy.io/?https://docs.google.com/spreadsheets/d/1fUKAQlPWiotRlFQw95qbvUjvxwNFJGWWT3RX6OcCKRI/export?format=csv';

const SUPPORTED_MARKER_COLORS = ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];
const workTypeColorMap = Object.create(null);

// We will store the name of Column F here dynamically
let columnFHeader = ""; 
let allProjects = [];
let map, markerCluster;

// ------------------ CSV → objects ------------------
async function fetchProjects() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (!lines.length) return [];

    const keys = lines[0].split(',').map(k => k.trim().replace(/^"|"$/g, ''));
    
    // CAPTURE COLUMN F HEADER (Index 5)
    columnFHeader = keys[5] || "Column F";

    return lines.slice(1).map(line => {
      // Improved split to handle commas inside quotes
      const vals = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || line.split(',');
      const obj = {};
      keys.forEach((k, i) => {
        let val = vals[i] || '';
        obj[k] = val.trim().replace(/^"|"$/g, '');
      });
      return obj;
    });
  } catch (err) {
    console.error('CSV fetch failed:', err);
    return [];
  }
}

// ------------------ UI: Multi-select dropdown filters ------------------
function buildFiltersUI({ workTypes, colFOptions }) {
  const main = document.querySelector('main');
  if (!main) return;

  const filtersHTML = `
    <section id="filters">
      <div class="filter-group">
        <h3>🔍 Search Projects</h3>
        <input type="text" id="searchBox" placeholder="Job name, city, vineyard, address..." />
      </div>

      <div class="filter-row" style="display: flex; gap: 20px; flex-wrap: wrap;">
        <div class="filter-group" style="flex: 1; min-width: 200px;">
          <h3>Work Type</h3>
          <select id="workTypeSelect" multiple>
            ${workTypes.map(wt => `<option value="${wt}">${wt}</option>`).join('')}
          </select>
        </div>

        <div class="filter-group" style="flex: 1; min-width: 200px;">
          <h3>${columnFHeader}</h3>
          <select id="colFSelect" multiple>
            ${colFOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="filter-actions" style="margin-top:15px;">
        <button id="resetFilters" class="btn secondary">Reset All</button>
        <span id="resultCount" class="result-count">Loading...</span>
      </div>

      <div id="legend" class="legend"><strong>Legend:</strong></div>
    </section>`;

  main.insertAdjacentHTML('beforeend', filtersHTML);

  // Styling
  const selects = [document.getElementById('workTypeSelect'), document.getElementById('colFSelect')];
  selects.forEach(s => { if(s) s.size = 5; });

  // Legend logic (remains tied to Work Type)
  const legend = document.getElementById('legend');
  Object.entries(workTypeColorMap).forEach(([wt, color]) => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="swatch" style="background:${color}"></span>${wt}`;
    item.onclick = () => {
      const option = selects[0].querySelector(`option[value="${wt}"]`);
      if (option) { option.selected = !option.selected; plotFiltered(); }
    };
    legend.appendChild(item);
  });
}

// ------------------ Map + plotting ------------------
async function initProjectsMap() {
  const mapHost = document.getElementById('map');
  if (!mapHost) return;

  map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

  markerCluster = L.markerClusterGroup({ maxClusterRadius: 60 }).addTo(map);

  allProjects = await fetchProjects();
  if (!allProjects.length) return;

  // Prepare Filter Options
  const workTypes = [...new Set(allProjects.map(p => p['Work Type']).filter(Boolean))].sort();
  const colFOptions = [...new Set(allProjects.map(p => p[columnFHeader]).filter(Boolean))].sort();

  workTypes.forEach((wt, i) => workTypeColorMap[wt] = SUPPORTED_MARKER_COLORS[i % SUPPORTED_MARKER_COLORS.length]);

  buildFiltersUI({ workTypes, colFOptions });

  // Event Listeners
  document.getElementById('searchBox').addEventListener('input', plotFiltered);
  document.getElementById('workTypeSelect').addEventListener('change', plotFiltered);
  document.getElementById('colFSelect').addEventListener('change', plotFiltered);
  
  document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('searchBox').value = '';
    [...document.querySelectorAll('select option')].forEach(opt => opt.selected = false);
    plotFiltered();
  });

  plotFiltered();
}

function matchesFilters(p) {
  const query = document.getElementById('searchBox')?.value.trim().toLowerCase() || '';
  const selectedTypes = Array.from(document.getElementById('workTypeSelect')?.selectedOptions || []).map(o => o.value);
  const selectedColF = Array.from(document.getElementById('colFSelect')?.selectedOptions || []).map(o => o.value);

  // 1. Work Type Filter
  if (selectedTypes.length && !selectedTypes.includes(p['Work Type'])) return false;
  
  // 2. Column F Filter
  if (selectedColF.length && !selectedColF.includes(p[columnFHeader])) return false;
  
  // 3. Global Text Search
  if (query && !Object.values(p).join(' ').toLowerCase().includes(query)) return false;

  return true;
}

function plotFiltered() {
  markerCluster.clearLayers();
  const bounds = L.latLngBounds();
  let count = 0;

  allProjects.forEach(p => {
    if (!matchesFilters(p)) return;

    // Use your existing parseLatLon logic
    let lat = parseFloat(p['Latitude'] || p['lat']);
    let lon = parseFloat(p['Longitude'] || p['lon']);
    if (isNaN(lat) || isNaN(lon)) return;

    const color = workTypeColorMap[p['Work Type']] || 'grey';
    const marker = L.marker([lat, lon], { 
      icon: L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        iconSize: [25, 41], iconAnchor: [12, 41]
      })
    });

    marker.bindPopup(`<b>${p['Job Name']}</b><br>${columnFHeader}: ${p[columnFHeader]}`);
    markerCluster.addLayer(marker);
    bounds.extend([lat, lon]);
    count++;
  });

  document.getElementById('resultCount').textContent = `${count} projects found`;
  if (count > 0) map.fitBounds(bounds.pad(0.1));
}

document.addEventListener('DOMContentLoaded', initProjectsMap);
</script>
