function loginUser() {
    const user = document.getElementById("username").value;
    const pass = document.getElementById("password").value;
  
    // Simulated login check — replace with real validation later
    if (user === "member" && pass === "syv2025") {
      window.location.href = "dashboard.html";
    } else {
      alert("Invalid credentials.");
    }
  
    return false; // Prevent form submission
  }

// DRS Engineering Projects Map functionality

// Google Sheets CSV export URL (public) with CORS proxy
const SHEET_CSV_URL = 'https://corsproxy.io/?https://docs.google.com/spreadsheets/d/1fUKAQlPWiotRlFQw95qbvUjvxwNFJGWWT3RX6OcCKRI/export?format=csv';

// Helper: fetch CSV and parse to array of objects
async function fetchProjects() {
  const res = await fetch(SHEET_CSV_URL);
  const csv = await res.text();
  const [header, ...rows] = csv.trim().split('\n');
  const keys = header.split(',');
  return rows.map(row => {
    const values = row.split(',');
    const obj = {};
    keys.forEach((k, i) => obj[k.trim()] = values[i]?.trim());
    return obj;
  });
}

// Add filter UI to the map page
document.addEventListener('DOMContentLoaded', () => {
  if (!document.getElementById('map')) return;
  const main = document.querySelector('main');
  const filterDiv = document.createElement('div');
  filterDiv.id = 'filters';
  filterDiv.style = 'margin: 20px 0; display: flex; gap: 20px; align-items: center; flex-wrap: wrap;';
  filterDiv.innerHTML = `
    <label>Work Type: <select id="workTypeFilter"><option value="">All</option></select></label>
    <label>Deal Stage: <select id="dealStageFilter"><option value="">All</option></select></label>
    <button id="resetFilters">Reset</button>
  `;
  main.insertBefore(filterDiv, main.firstChild);
});

// Supported Leaflet-color-markers colors
const SUPPORTED_MARKER_COLORS = ['red', 'blue', 'green', 'orange', 'yellow', 'violet', 'grey', 'black'];
const workTypeColorMap = {}

// Main: initialize map and plot projects
async function initProjectsMap() {
  if (!document.getElementById('map')) return;
  const map = L.map('map').setView([39.5, -98.35], 4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const projects = await fetchProjects();
  // Get unique work types and deal stages
  const workTypes = Array.from(new Set(projects.map(p => p['Work Type']).filter(Boolean)));
  const dealStages = Array.from(new Set(projects.map(p => p['Deal Stage']).filter(Boolean)));
  // Assign only supported colors to work types
  workTypes.forEach((wt, i) => {
    workTypeColorMap[wt] = SUPPORTED_MARKER_COLORS[i % SUPPORTED_MARKER_COLORS.length];
  });

  // Populate filter dropdowns
  const workTypeFilter = document.getElementById('workTypeFilter');
  const dealStageFilter = document.getElementById('dealStageFilter');
  if (workTypeFilter) workTypes.forEach(wt => workTypeFilter.append(new Option(wt, wt)));
  if (dealStageFilter) dealStages.forEach(ds => dealStageFilter.append(new Option(ds, ds)));

  let markers = [];
  function clearMarkers() { markers.forEach(m => map.removeLayer(m)); markers = []; }

  async function plotFilteredMarkers() {
    clearMarkers();
    let plotted = 0;
    const selectedWorkType = workTypeFilter?.value || '';
    const selectedDealStage = dealStageFilter?.value || '';
    for (const project of projects) {
      // Handle possible empty column between Zip Code and Latitude
      // Try to parse Latitude/Longitude from any column named 'Latitude'/'Longitude' or at the end
      let lat = project['Latitude'] || project[' Latitude'] || project['lat'] || project[' latitude'];
      let lon = project['Longitude'] || project[' Longitude'] || project['lon'] || project[' longitude'];
      if (!lat || !lon) {
        // Try to get from last two columns if header names are off
        const values = Object.values(project);
        lat = lat || values[values.length - 2];
        lon = lon || values[values.length - 1];
      }
      if (
        (!selectedWorkType || project['Work Type'] === selectedWorkType) &&
        (!selectedDealStage || project['Deal Stage'] === selectedDealStage) &&
        lat && lon
      ) {
        lat = parseFloat(lat);
        lon = parseFloat(lon);
        if (!isNaN(lat) && !isNaN(lon)) {
          // Use a colored icon for each work type
          const color = workTypeColorMap[project['Work Type']] || 'blue';
          const icon = L.icon({
            iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
            shadowSize: [41, 41]
          });
          const marker = L.marker([lat, lon], { icon }).addTo(map);
          const address = `${project['Street Address']} ${project['City']} ${project['State']} ${project['Zip Code']}`;
          marker.bindPopup(`<div class='project-popup'><strong>${project['Job Name']}</strong><br>${address}<br><b>Work Type:</b> ${project['Work Type']}<br><b>Deal Stage:</b> ${project['Deal Stage']}</div>`);
          markers.push(marker);
          plotted++;
        }
      }
    }
    if (plotted === 0) {
      alert('No projects could be mapped for the selected filters.');
    }
  }

  // Initial plot
  plotFilteredMarkers();
  // Filter event listeners
  workTypeFilter?.addEventListener('change', plotFilteredMarkers);
  dealStageFilter?.addEventListener('change', plotFilteredMarkers);
  document.getElementById('resetFilters')?.addEventListener('click', () => {
    workTypeFilter.value = '';
    dealStageFilter.value = '';
    plotFilteredMarkers();
  });
}

// Run map init if on projects_map.html
if (window.location.pathname.endsWith('projects_map.html')) {
  initProjectsMap();
}
