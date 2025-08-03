/*
 * Front‑end logic for Mission Control
 *
 * This script initialises the Cesium globe, loads TLE data for active
 * satellites, computes simple orbital trajectories and provides UI
 * interactions such as search and selection.  The Cesium Ion access token is
 * injected at runtime via the generated config.js (see server.js).
 */

// --- CONFIGURATION ---
// The Cesium Ion access token is defined by server.js in config.js.  If
// CESIUM_ION_TOKEN is not set on the server the viewer will fail to load.  A
// fallback empty string is used so that a helpful message can be displayed.
Cesium.Ion.defaultAccessToken = window.CESIUM_ION_TOKEN || '';

// Data sources for Two‑Line Element sets (TLE) and the satellite catalog.
const TLE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const SATCAT_URL_BASE = 'https://celestrak.org/satcat/records.php';
const SELECTED_SAT_ICON_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iNSIgeTE9IjEyIiB4Mj0iMTkiIHkyPSIxMiI+PC9saW5lPjxsaW5lIHgxPSIxMiIgeTE9IjUiIHgyPSIxMiIgeTI9IjE5Ij48L2xpbmU+PC9zdmc+';

// --- STATE & CACHE ---
const satellites = [];
const satByName = {};
let selectedSat = null;
const satcatCache = {};
const ORBIT_PROPAGATION_STEP_SECONDS = 60;
const ORBIT_DURATION_PERIODS = 2;

// --- VIEWER INITIALISATION ---
// Delay initialisation until the DOM has loaded.  If the Cesium token is
// missing we display a configuration message and abort the rest of the setup.
document.addEventListener('DOMContentLoaded', () => {
  const loadingIndicator = document.getElementById('loadingIndicator');
  if (!Cesium.Ion.defaultAccessToken) {
    loadingIndicator.innerHTML =
      'Configuration Needed! Please provide a Cesium Ion Access Token on the server (CESIUM_ION_TOKEN).';
    return;
  }
  initViewer();
  initUI();
  // Defer satellite loading slightly to give the globe a chance to render.
  setTimeout(loadAndInitializeSatellites, 500);
});

let viewer;
function initViewer() {
  viewer = new Cesium.Viewer('cesiumContainer', {
    imageryProvider: new Cesium.IonImageryProvider({ assetId: 2 }),
    skyAtmosphere: new Cesium.SkyAtmosphere(),
    skyBox: new Cesium.SkyBox(),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    sceneModePicker: false,
    timeline: false,
    animation: false,
  });
  viewer.scene.globe.enableLighting = true;
  viewer.scene.requestRenderMode = true;
  viewer.scene.maximumRenderTimeChange = Infinity;
}

// --- MAIN APPLICATION FLOW ---
function initUI() {
  document
    .getElementById('toggleThemeBtn')
    .addEventListener('click', () => document.body.classList.toggle('light'));
  document
    .getElementById('resetViewBtn')
    .addEventListener('click', resetCamera);
  document
    .getElementById('togglePanelBtn')
    .addEventListener('click', () => document.getElementById('sidebar').classList.toggle('hide'));
  document
    .getElementById('searchBox')
    .addEventListener('change', handleSearch);
  // When the user clicks on the globe we try to pick a satellite
  viewer.screenSpaceEventHandler.setInputAction(
    handleGlobeClick,
    Cesium.ScreenSpaceEventType.LEFT_CLICK
  );
  // Enable a few default interactions
  viewer.scene.screenSpaceCameraController.enableRotate = true;
  viewer.scene.screenSpaceCameraController.enableTranslate = true;
  viewer.scene.screenSpaceCameraController.enableZoom = true;
  viewer.scene.screenSpaceCameraController.enableTilt = true;
}

async function loadAndInitializeSatellites() {
  const loadingIndicator = document.getElementById('loadingIndicator');
  try {
    const response = await fetch(TLE_URL);
    if (!response.ok) throw new Error(`Failed to fetch TLE data: ${response.statusText}`);
    const tleText = await response.text();
    parseTLEData(tleText);
    populateDatalist();
    createSatelliteEntities();
  } catch (error) {
    console.error('Fatal error during satellite initialization:', error);
    loadingIndicator.innerHTML = 'Error loading satellite data. Please refresh the page.';
  } finally {
    loadingIndicator.style.display = 'none';
  }
}

function parseTLEData(tleText) {
  const lines = tleText.split(/\r?\n/);
  for (let i = 0; i < lines.length - 2; i += 3) {
    const name = lines[i].trim();
    if (name) {
      const line1 = lines[i + 1].trim();
      const line2 = lines[i + 2].trim();
      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        if (satrec.error !== 0) continue;
        const satData = { name, tle1: line1, tle2: line2, satrec, entity: null, details: null };
        satellites.push(satData);
        satByName[name.toUpperCase()] = satData;
      } catch {
        /* ignore malformed entries */
      }
    }
  }
}

function populateDatalist() {
  const dataList = document.getElementById('satList');
  const fragment = document.createDocumentFragment();
  satellites.forEach(sat => {
    const option = document.createElement('option');
    option.value = sat.name;
    fragment.appendChild(option);
  });
  dataList.appendChild(fragment);
}

function createSatelliteEntities() {
  const now = Cesium.JulianDate.now();
  satellites.forEach(sat => {
    const orbitalPath = computeOrbitalPath(sat.satrec, now);
    if (!orbitalPath) return;
    sat.entity = viewer.entities.add({
      id: sat.name,
      position: orbitalPath,
      orientation: new Cesium.VelocityOrientationProperty(orbitalPath),
      point: {
        pixelSize: 4,
        color: Cesium.Color.SKYBLUE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      path: {
        resolution: 120,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.1,
          color: Cesium.Color.WHITE.withAlpha(0.5),
        }),
        width: 1,
        trailTime: 0,
        leadTime: sat.satrec.no_kozai * 60 * ORBIT_DURATION_PERIODS,
      },
    });
  });
  viewer.scene.requestRender();
}

function computeOrbitalPath(satrec, startTime) {
  const property = new Cesium.SampledPositionProperty();
  // Compute approximate period in minutes from mean motion (revolutions per day)
  const period = (1 / satrec.no_kozai) * 2 * Math.PI / 60;
  const totalSeconds = period * 60 * ORBIT_DURATION_PERIODS;
  for (let i = 0; i <= totalSeconds; i += ORBIT_PROPAGATION_STEP_SECONDS) {
    const time = Cesium.JulianDate.addSeconds(startTime, i, new Cesium.JulianDate());
    try {
      const p = satellite.propagate(satrec, Cesium.JulianDate.toDate(time)).position;
      if (!p) continue;
      const position = Cesium.Cartesian3.fromArray([p.x, p.y, p.z]).multiplyByScalar(1000);
      property.addSample(time, position);
    } catch {
      return null;
    }
  }
  return property;
}

async function selectSatellite(satData) {
  if (!satData || !satData.entity) return;
  // Reset previous selection
  if (selectedSat && selectedSat.entity) {
    selectedSat.entity.point.pixelSize = 4;
    selectedSat.entity.path.material.color = Cesium.Color.WHITE.withAlpha(0.5);
    if (selectedSat.billboard) {
      viewer.entities.remove(selectedSat.billboard);
      selectedSat.billboard = null;
    }
  }
  selectedSat = satData;
  selectedSat.entity.point.pixelSize = 10;
  selectedSat.entity.path.material.color = Cesium.Color.ORANGERED.withAlpha(0.8);
  selectedSat.billboard = viewer.entities.add({
    position: selectedSat.entity.position,
    billboard: {
      image: SELECTED_SAT_ICON_URL,
      width: 24,
      height: 24,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  viewer.flyTo(selectedSat.entity, {
    duration: 2.0,
    offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.toRadians(45), 1500 * 1000),
  });
  // Show sidebar on mobile
  if (window.innerWidth <= 800) document.getElementById('sidebar').classList.remove('hide');
  const infoPanel = document.getElementById('infoPanel');
  infoPanel.innerHTML = 'Fetching satellite data…';
  await getAndShowSatelliteDetails(selectedSat);
  viewer.scene.requestRender();
}

async function getAndShowSatelliteDetails(sat) {
  if (!sat.details) {
    try {
      const noradId = sat.tle2.substring(2, 7);
      const response = await fetch(`${SATCAT_URL_BASE}?CATNR=${noradId}&FORMAT=JSON`);
      if (!response.ok) throw new Error('SATCAT API request failed');
      const data = (await response.json())[0] || { OBJECT_NAME: sat.name, COMMENT: 'No catalog info found.' };
      sat.details = data;
      satcatCache[sat.name.toUpperCase()] = data;
    } catch (error) {
      console.error('Could not fetch SATCAT details:', error);
      sat.details = { OBJECT_NAME: sat.name, COMMENT: 'Error fetching catalog info.' };
    }
  }
  displaySatelliteInfo(sat);
}

function displaySatelliteInfo(sat) {
  const infoPanel = document.getElementById('infoPanel');
  const d = sat.details;
  const val = (value, fallback = 'N/A') => (value ? value : fallback);
  infoPanel.innerHTML = `
    <div class="info-grid">
      <span class="label">Name</span><span>${val(d.OBJECT_NAME, sat.name)}</span>
      <span class="label">NORAD ID</span><span>${val(d.NORAD_CAT_ID)}</span>
      <span class="label">Intl. Designator</span><span>${val(d.OBJECT_ID)}</span>
      <span class="label">Owner/Country</span><span>${val(d.OWNER)}</span>
      <span class="label">Launch Date</span><span>${val(d.LAUNCH_DATE)}</span>
      <span class="label">Launch Site</span><span>${val(d.LAUNCH_SITE)}</span>
      <span class="label">Object Type</span><span>${val(d.OBJECT_TYPE)}</span>
      <span class="label">Period (min)</span><span>${val(d.PERIOD)}</span>
      <span class="label">Inclination (°)</span><span>${val(d.INCLINATION)}</span>
      <span class="label">Apogee (km)</span><span>${val(d.APOGEE)}</span>
      <span class="label">Perigee (km)</span><span>${val(d.PERIGEE)}</span>
      <span class="label">Comment</span><span>${val(d.COMMENT, '—')}</span>
    </div>
  `;
  infoPanel.parentElement.scrollTop = 0;
}

function resetCamera() {
  if (selectedSat && selectedSat.entity) {
    selectedSat.entity.point.pixelSize = 4;
    selectedSat.entity.path.material.color = Cesium.Color.WHITE.withAlpha(0.5);
    if (selectedSat.billboard) {
      viewer.entities.remove(selectedSat.billboard);
      selectedSat.billboard = null;
    }
  }
  selectedSat = null;
  document.getElementById('infoPanel').innerHTML =
    '<p class="placeholder-text">No satellite selected.</p><span>Select one from the globe or search to view detailed telemetry and orbital data.</span>';
  viewer.flyTo(viewer.entities, { duration: 2.0 });
}

function handleSearch(event) {
  const query = event.target.value.trim().toUpperCase();
  if (query && satByName[query]) {
    selectSatellite(satByName[query]);
  }
}

function handleGlobeClick(movement) {
  const pickedObject = viewer.scene.pick(movement.position);
  if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.id) {
    const satName = pickedObject.id.id.toUpperCase();
    if (satByName[satName]) {
      selectSatellite(satByName[satName]);
    }
  }
}