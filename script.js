// ------------------ Config ------------------
const SHEET_CSV_URL = 'https://corsproxy.io/?https://docs.google.com/spreadsheets/d/1fUKAQlPWiotRlFQw95qbvUjvxwNFJGWWT3RX6OcCKRI/export?format=csv';
const SUPPORTED_MARKER_COLORS = ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];

// Specific stages for the checkbox
const TARGET_STAGES = [
  "4.3 - Closed - Project", 
  "3.3 - Submitted", 
  "3.4 - Permitted", 
  "3.5 - In Construction"
];

// This will be set dynamically from the 5th column (Column E)
let dealStageHeader = ""; 

const workTypeColorMap = Object.create(null);
let allProjects = [];
let map, markerCluster;

// ------------------ CSV → objects ------------------
async function fetchProjects() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    
    // Parse Headers
    const keys = lines[0].split(',').map(k => k.trim().replace(/^"|"$/g, ''));
    
    // SET COLUMN E AS THE DEAL STAGE KEY (Index 4)
    dealStageHeader = keys[4] || "Deal Stage"; 

    return lines.slice(1).map(line => {
      // Handle commas within quotes
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

// ------------------ UI Build ------------------
function buildFiltersUI({ workTypes }) {
  const main = document.querySelector('main');
  if (!main) return;

  const filtersHTML = `
    <section id="filters">
      <div class="filter-group">
        <h3>🔍 Search Projects</h3>
        <input type="text" id="searchBox" placeholder="Search name, city, stage, etc..." />
      </div>

      <div class="filter-group" style="margin-bottom: 15px; padding: 12px; background: #ebf8ff; border-radius: 8px; border: 1px solid #bee3f8;">
        <label style="display: flex; align-items: center; cursor: pointer; font-weight: bold; color: #2b6cb0;">
          <input type="checkbox" id="stageFilterToggle" checked style="width: 20px; height: 20px; margin-right: 10px;">
          Show Key Stages Only
        </label>
        <div style="margin-left: 30px; font-size: 0.85em; color: #4a5568; line-height: 1.4;">
          <em>Filters for: 3.3, 3.4, 3.5, & 4.3</em>
        </div>
      </div>

      <div class="filter-group">
        <h3>Work Type</h3>
        <select id="workTypeSelect" multiple style="width: 100%; height: 120px; border-radius: 6px; border: 1px solid #cbd5e0;">
          ${workTypes.map(wt => `<option value="${wt}">${wt}</option>`).join('')}
        </select>
        <small style="color: #718096; margin-top: 5px; display: block;">Hold Ctrl/Cmd to select multiple</small>
      </div>

      <div class="filter-actions" style="margin-top: 20px; display: flex; align-items: center; justify-content: space-between;">
        <button id="resetFilters" class="btn secondary">Reset All</button>
        <span id="resultCount" class="result-count" style="font-weight: bold;">Loading...</span>
      </div>
    </section>`;

  main.insertAdjacentHTML('beforeend', filtersHTML);
}

// ------------------ Filtering Logic ------------------
function matchesFilters(p) {
  const query = document.getElementById('searchBox')?.value.trim().toLowerCase() || '';
  const selectedTypes = Array.from(document.getElementById('workTypeSelect')?.selectedOptions || []).map(o => o.value);
  const isStageFilterActive = document.getElementById('stageFilterToggle')?.checked;

  // 1. Checkbox Logic (Column E)
  if (isStageFilterActive) {
    const projectStage = p[dealStageHeader] || "";
    if (!TARGET_STAGES.includes(projectStage)) return false;
  }

  // 2. Work Type Logic
  if (selectedTypes.length && !selectedTypes.includes(p['Work Type'])) return false;
  
  // 3. Global Text Search (Now includes Column E/F automatically)
  if (query) {
    const allDataString = Object.values(p).join(' ').toLowerCase();
    if (!allDataString.includes(query)) return false;
  }

  return true;
}

// ------------------ Initialization & Plotting ------------------
async function initProjectsMap() {
  const mapHost = document.getElementById('map');
  if (!mapHost) return;

  map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
  markerCluster = L.markerClusterGroup().addTo(map);

  allProjects = await fetchProjects();
  
  const workTypes = [...new Set(allProjects.map(p => p['Work Type']).filter(Boolean))].sort();
  workTypes.forEach((wt, i) => workTypeColorMap[wt] = SUPPORTED_MARKER_COLORS[i % SUPPORTED_MARKER_COLORS.length]);

  buildFiltersUI({ workTypes });

  // Event Listeners
  document.getElementById('searchBox').addEventListener('input', plotFiltered);
  document.getElementById('workTypeSelect').addEventListener('change', plotFiltered);
  document.getElementById('stageFilterToggle').addEventListener('change', plotFiltered);
  
  document.getElementById('resetFilters').addEventListener('click', () => {
    document.getElementById('searchBox').value = '';
    document.getElementById('stageFilterToggle').checked = true;
    Array.from(document.getElementById('workTypeSelect').options).forEach(opt => opt.selected = false);
    plotFiltered();
  });

  plotFiltered();
}

function plotFiltered() {
  markerCluster.clearLayers();
  const bounds = L.latLngBounds();
  let count = 0;

  allProjects.forEach(p => {
    if (!matchesFilters(p)) return;

    let lat = parseFloat(p['Latitude'] || p['lat']);
    let lon = parseFloat(p['Longitude'] || p['lon']);
    if (isNaN(lat) || isNaN(lon)) return;

    const color = workTypeColorMap[p['Work Type']] || 'grey';
    const marker = L.marker([lat, lon], {
      icon: L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
      })
    });

    const address = [p['Street Address'], p['City'], p['State']].filter(Boolean).join(', ');

    marker.bindPopup(`
      <div style="font-family: sans-serif; min-width: 160px;">
        <strong style="font-size: 1.1em;">${p['Job Name'] || 'Project'}</strong><br>
        <span style="color: #666;">${address}</span><br><br>
        <b>Stage:</b> ${p[dealStageHeader]}<br>
        <b>Type:</b> ${p['Work Type']}
      </div>
    `);

    markerCluster.addLayer(marker);
    bounds.extend([lat, lon]);
    count++;
  });

  const rc = document.getElementById('resultCount');
  rc.textContent = `${count} Results`;
  if (count > 0) map.fitBounds(bounds.pad(0.1));
}

document.addEventListener('DOMContentLoaded', initProjectsMap);
