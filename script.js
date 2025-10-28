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
// TIP: If corsproxy flakes, swap to a tiny Google Apps Script proxy and put its URL here.
const SHEET_CSV_URL =
  'https://corsproxy.io/?https://docs.google.com/spreadsheets/d/1fUKAQlPWiotRlFQw95qbvUjvxwNFJGWWT3RX6OcCKRI/export?format=csv';

// Supported marker colors (cycled across Work Types)
const SUPPORTED_MARKER_COLORS = ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];
const workTypeColorMap = Object.create(null);

// ------------------ CSV → objects (simple parser) ------------------
// NOTE: If your sheet has commas inside quoted cells, consider switching to Papa Parse.
async function fetchProjects() {
  try {
    const res = await fetch(SHEET_CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (!lines.length) return [];

    const keys = lines[0].split(',').map(k => k.trim());
    return lines.slice(1).map(line => {
      const vals = line.split(','); // simple split (no quoted-comma support)
      const obj = {};
      keys.forEach((k, i) => (obj[k] = vals[i]?.trim()));
      return obj;
    });
  } catch (err) {
    console.error('CSV fetch failed:', err);
    const main = document.querySelector('main');
    if (main) {
      const note = document.createElement('div');
      note.style = 'margin:12px 0; padding:8px 12px; background:#fff3cd; border:1px solid #ffeeba; border-radius:6px;';
      note.textContent = 'Could not load project data right now. Showing base map only.';
      main.prepend(note);
    }
    return [];
  }
}

// ------------------ UI: dynamic checkbox filters ------------------
function buildFiltersUI({ workTypes, dealStages }) {
  const main = document.querySelector('main');
  if (!main) return;

  const filters = document.createElement('section');
  filters.id = 'filters';
  filters.style = `
    margin: 16px 0; padding: 12px; border: 1px solid #e3e3e3; border-radius: 8px;
    display: grid; gap: 12px; grid-template-columns: 1fr; font: 14px system-ui, sans-serif;
  `;

  const makeCheckboxGroup = (title, idPrefix, items) => {
    const wrap = document.createElement('div');
    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style = 'font-weight:600; margin-bottom:6px;';
    wrap.appendChild(heading);

    const box = document.createElement('div');
    box.id = `${idPrefix}Group`;
    box.style = 'display:flex; flex-wrap:wrap; gap:10px;';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear selection';
    clearBtn.style = 'padding:4px 8px; border:1px solid #ddd; border-radius:6px; background:#f9f9f9; cursor:pointer; margin-bottom:6px;';
    clearBtn.addEventListener('click', () => {
      box.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false));
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });

    wrap.appendChild(clearBtn);
    wrap.appendChild(box);

    items.forEach(val => {
      const id = `${idPrefix}__${slugify(val)}`;
      const label = document.createElement('label');
      label.setAttribute('for', id);
      label.style = 'display:flex; align-items:center; gap:6px; border:1px solid #eee; padding:4px 8px; border-radius:6px;';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = val;

      label.appendChild(cb);
      label.appendChild(document.createTextNode(val));
      box.appendChild(label);
    });

    return wrap;
  };

  const workTypeGroup = makeCheckboxGroup('Work Type', 'workType', workTypes);
  const dealStageGroup = makeCheckboxGroup('Deal Stage', 'dealStage', dealStages);

  const controls = document.createElement('div');
  controls.style = 'display:flex; gap:10px; align-items:center; flex-wrap:wrap;';
  controls.innerHTML = `
    <button id="resetFilters" type="button" style="padding:6px 10px; border:1px solid #ddd; border-radius:6px; background:#f3f3f3; cursor:pointer;">Reset</button>
    <span style="color:#666; font-size:12px;">Tip: leave all unchecked to show all.</span>
    <span id="resultCount" style="margin-left:auto; color:#333; font-size:12px;"></span>
  `;

  const legend = document.createElement('div');
  legend.id = 'legend';
  legend.style = 'display:flex; gap:10px; flex-wrap:wrap; align-items:center;';
  const legendTitle = document.createElement('div');
  legendTitle.textContent = 'Legend:';
  legend.appendChild(legendTitle);

  filters.appendChild(workTypeGroup);
  filters.appendChild(dealStageGroup);
  filters.appendChild(controls);
  filters.appendChild(legend);

  const mapEl = document.getElementById('map');
  if (mapEl) main.insertBefore(filters, mapEl);
  else main.insertBefore(filters, main.firstChild);
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function getCheckedValues(groupId) {
  const group = document.getElementById(groupId);
  if (!group) return [];
  return Array.from(group.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

// ------------------ Map + plotting ------------------
async function initProjectsMap() {
  const mapHost = document.getElementById('map');
  if (!mapHost) return;

  // Base map
  const map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // Data
  const projects = await fetchProjects();
  if (!Array.isArray(projects)) {
    console.warn('Projects is not an array; aborting plot.');
    return;
  }

  // Unique filters
  const workTypes = Array.from(new Set(projects.map(p => p?.['Work Type']).filter(Boolean))).sort();
  const dealStages = Array.from(new Set(projects.map(p => p?.['Deal Stage']).filter(Boolean))).sort();

  // Color map
  workTypes.forEach((wt, i) => {
    workTypeColorMap[wt] = SUPPORTED_MARKER_COLORS[i % SUPPORTED_MARKER_COLORS.length];
  });

  // UI
  buildFiltersUI({ workTypes, dealStages });
  renderLegend();

  // Refs
  const workTypeGroup = document.getElementById('workTypeGroup');
  const dealStageGroup = document.getElementById('dealStageGroup');
  const resetBtn = document.getElementById('resetFilters');
  const resultCount = document.getElementById('resultCount');

  let markers = [];
  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
  }

  function renderLegend() {
    const legend = document.getElementById('legend');
    if (!legend) return;
    // keep first child ("Legend:")
    const title = legend.firstChild;
    legend.innerHTML = '';
    legend.appendChild(title);
    Object.entries(workTypeColorMap).forEach(([wt, color]) => {
      const item = document.createElement('div');
      item.style = 'display:flex; align-items:center; gap:6px;';
      const swatch = document.createElement('span');
      swatch.style = `
        display:inline-block; width:12px; height:12px; border-radius:50%;
        background:${color}; border:1px solid #999;
      `;
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(wt));
      legend.appendChild(item);
    });
  }

  function matchesFilters(project, selectedWorkTypes, selectedDealStages) {
    const wtOk = selectedWorkTypes.length === 0 || selectedWorkTypes.includes(project['Work Type']);
    const dsOk = selectedDealStages.length === 0 || selectedDealStages.includes(project['Deal Stage']);
    return wtOk && dsOk;
  }

  function parseLatLon(project) {
    let lat = project['Latitude'] || project[' Latitude'] || project['lat'] || project[' latitude'];
    let lon = project['Longitude'] || project[' Longitude'] || project['lon'] || project[' longitude'];
    if (!lat || !lon) {
      const values = Object.values(project);
      lat = lat || values[values.length - 2];
      lon = lon || values[values.length - 1];
    }
    const plat = parseFloat(lat);
    const plon = parseFloat(lon);
    if (isNaN(plat) || isNaN(plon)) return null;
    return [plat, plon];
  }

  function makeIcon(color) {
    return L.icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
      shadowSize: [41, 41]
    });
  }

  function plotFiltered() {
    clearMarkers();
    const selectedWorkTypes = getCheckedValues('workTypeGroup');
    const selectedDealStages = getCheckedValues('dealStageGroup');

    const bounds = L.latLngBounds();
    let count = 0;

    for (const p of projects) {
      if (!matchesFilters(p, selectedWorkTypes, selectedDealStages)) continue;

      const coords = parseLatLon(p);
      if (!coords) continue;

      const [lat, lon] = coords;
      const color = workTypeColorMap[p['Work Type']] || 'blue';
      const marker = L.marker([lat, lon], { icon: makeIcon(color) }).addTo(map);

      const address = [p['Street Address'], p['City'], p['State'], p['Zip Code']]
        .filter(Boolean).join(' ');

      marker.bindPopup(
        `<div class='project-popup'>
          <strong>${p['Job Name'] || ''}</strong><br>
          ${address || ''}<br>
          <b>Work Type:</b> ${p['Work Type'] || ''}<br>
          <b>Deal Stage:</b> ${p['Deal Stage'] || ''}
        </div>`
      );

      markers.push(marker);
      bounds.extend([lat, lon]);
      count++;
    }

    if (resultCount) {
      resultCount.textContent = count ? `${count} project${count === 1 ? '' : 's'} shown` : 'No matching projects';
    }
    if (count > 0) {
      map.fitBounds(bounds.pad(0.1));
    }
  }

  // Initial render
  plotFiltered();

  // Events
  workTypeGroup?.addEventListener('change', plotFiltered);
  dealStageGroup?.addEventListener('change', plotFiltered);
  resetBtn?.addEventListener('click', () => {
    [workTypeGroup, dealStageGroup].forEach(g =>
      g?.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.checked = false))
    );
    plotFiltered();
  });
}

// ------------------ Boot (unconditional) ------------------
document.addEventListener('DOMContentLoaded', () => {
  initProjectsMap();
});
