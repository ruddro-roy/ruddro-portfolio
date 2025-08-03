/**
 * Mission Control: Enterprise Satellite Tracking Platform
 * * This script orchestrates the entire satellite tracking application. It handles:
 * - CesiumJS viewer initialization with high-fidelity visuals.
 * - Fetching and parsing satellite TLE data from CelesTrak.
 * - Augmenting satellite data with detailed info from the CelesTrak SATCAT API.
 * - Calculating and rendering smooth, full orbital paths for high performance.
 * - Managing user interactions (search, selection, camera control).
 * - Displaying detailed telemetry and metadata in a professional UI.
 * - Ensuring a robust and responsive experience on both desktop and mobile.
 */

// --- CONFIGURATION & CONSTANTS ---
const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const SATCAT_URL_BASE = "https://celestrak.org/satcat/records.php";
const SELECTED_SAT_ICON_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iNSIgeTE9IjEyIiB4Mj0iMTkiIHkyPSIxMiI+PC9saW5lPjxsaW5lIHgxPSIxMiIgeTE9IjUiIHgyPSIxMiIgeTI9IjE5Ij48L2xpbmU+PC9zdmc+';

const ORBIT_PROPAGATION_STEP_SECONDS = 60;
const ORBIT_DURATION_PERIODS = 2;

// --- STATE MANAGEMENT ---
let satellites = [];
let satByName = {};
let selectedSat = null;
let satcatCache = {};

// =================================================================================
// CRITICAL SECURITY INSTRUCTION
// =================================================================================
// 1. Go to https://cesium.com/ion/signup/ to create a free Cesium Ion account.
// 2. Go to the "Access Tokens" page on your dashboard.
// 3. Copy the "Default" access token.
// 4. PASTE YOUR TOKEN INTO THE LINE BELOW.
//
// WARNING: NEVER COMMIT THIS FILE WITH YOUR REAL TOKEN TO A PUBLIC GITHUB REPO.
// This will cause your token to be automatically revoked. For deployment,
// always use a placeholder here and inject the real token via an environment
// variable in your hosting provider's settings.
// =================================================================================
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyZDBhZThkMi1hODdkLTQ1YjMtYTNjMS1mMmI1ZjQ5ZGI2ZGMiLCJpZCI6MzI4MDcyLCJpYXQiOjE3NTQxNjk4MjB9.x0Lf8MuQAFYLBoKCkEHsUCot9HAiv3wZDQd0kLyk1pA';
// =================================================================================

// --- CESIUM INITIALIZATION ---
const viewer = new Cesium.Viewer("cesiumContainer", {
    imageryProvider: new Cesium.IonImageryProvider({ assetId: 2 }),
    skyAtmosphere: new Cesium.SkyAtmosphere(),
    skyBox: new Cesium.SkyBox(),
    baseLayerPicker: false, geocoder: false, homeButton: false, infoBox: false,
    navigationHelpButton: false, sceneModePicker: false, timeline: false, animation: false,
});
viewer.scene.globe.enableLighting = true;
viewer.scene.requestRenderMode = true;
viewer.scene.maximumRenderTimeChange = Infinity;

// --- APPLICATION BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', () => {
    //
    // Robust check to ensure the user has configured their access token.
    if (Cesium.Ion.defaultAccessToken === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyZDBhZThkMi1hODdkLTQ1YjMtYTNjMS1mMmI1ZjQ5ZGI2ZGMiLCJpZCI6MzI4MDcyLCJpYXQiOjE3NTQxNjk4MjB9.x0Lf8MuQAFYLBoKCkEHsUCot9HAiv3wZDQd0kLyk1pA' || !Cesium.Ion.defaultAccessToken) {
        const loadingIndicator = document.getElementById('loadingIndicator');
        loadingIndicator.innerHTML = `<p style="color:yellow; text-align:center;">CONFIGURATION NEEDED<br>Please add your Cesium Ion Access Token in app.js to load the globe.</p>`;
        return;
    }
    initUI();
    // Defer satellite loading to allow the globe to render first, improving perceived performance.
    setTimeout(loadAndInitializeSatellites, 500);
});

/**
 * Binds all user interface event listeners.
 */
function initUI() {
    document.getElementById('toggleThemeBtn').addEventListener('click', () => document.body.classList.toggle('light'));
    document.getElementById('resetViewBtn').addEventListener('click', resetCamera);
    document.getElementById('togglePanelBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('show'));
    document.getElementById('searchBox').addEventListener('change', handleSearch);
    viewer.screenSpaceEventHandler.setInputAction(handleGlobeClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    
    // Enable default camera interactions
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
}

/**
 * Main data loading and entity creation pipeline.
 */
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
        console.error("Fatal error during satellite initialization:", error);
        loadingIndicator.innerHTML = `<p style="color:red;">Error loading satellite data.<br>Please refresh the page.</p>`;
    } finally {
        // Ensure the loading indicator is hidden unless a configuration error was shown.
        if (loadingIndicator.style.display !== 'none' && !loadingIndicator.innerHTML.includes('CONFIGURATION NEEDED')) {
            loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * Parses raw TLE text into a structured array of satellite objects.
 * @param {string} tleText - The raw TLE data from CelesTrak.
 */
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
            } catch (e) {
                // Ignore satellites that satellite.js cannot parse.
            }
        }
    }
}

/**
 * Populates the search box datalist with satellite names for autocomplete.
 */
function populateDatalist() {
    const dataList = document.getElementById("satList");
    const fragment = document.createDocumentFragment();
    satellites.forEach(sat => {
        const option = document.createElement("option");
        option.value = sat.name;
        fragment.appendChild(option);
    });
    dataList.appendChild(fragment);
}

/**
 * Creates Cesium entities with pre-calculated orbital paths for performance.
 */
function createSatelliteEntities() {
    const now = Cesium.JulianDate.now();
    satellites.forEach(sat => {
        const orbitalPath = computeOrbitalPath(sat.satrec, now);
        if (!orbitalPath) return; // Skip satellites with invalid orbits

        sat.entity = viewer.entities.add({
            id: sat.name,
            position: orbitalPath,
            orientation: new Cesium.VelocityOrientationProperty(orbitalPath),
            point: {
                pixelSize: 4,
                color: Cesium.Color.SKYBLUE,
                outlineColor: Cesium.Color.BLACK.withAlpha(0.5),
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
                leadTime: (1 / sat.satrec.no_kozai) * 2 * Math.PI * 60 * ORBIT_DURATION_PERIODS
            }
        });
    });
    viewer.scene.requestRender();
}

/**
 * Computes a satellite's future positions for a smooth, continuous path.
 * @param {object} satrec - The satellite record from satellite.js.
 * @param {Cesium.JulianDate} startTime - The time to start the calculation.
 * @returns {Cesium.SampledPositionProperty | null} The calculated path property.
 */
function computeOrbitalPath(satrec, startTime) {
    const property = new Cesium.SampledPositionProperty();
    const period = (1 / satrec.no_kozai) * 2 * Math.PI / 60;
    const totalSeconds = period * 60 * ORBIT_DURATION_PERIODS;

    for (let i = 0; i <= totalSeconds; i += ORBIT_PROPAGATION_STEP_SECONDS) {
        const time = Cesium.JulianDate.addSeconds(startTime, i, new Cesium.JulianDate());
        try {
            const p = satellite.propagate(satrec, Cesium.JulianDate.toDate(time)).position;
            if (!p) continue;
            const position = Cesium.Cartesian3.fromArray([p.x, p.y, p.z]).multiplyByScalar(1000); // km to meters
            const gmst = satellite.gstime(Cesium.JulianDate.toDate(time));
            const finalPosition = Cesium.Transforms.computeIcrfToFixed(time).multiplyByPoint(position, new Cesium.Cartesian3());
            property.addSample(time, finalPosition);
        } catch (e) {
            return null; // Satellite has likely decayed or TLE is invalid
        }
    }
    return property;
}

/**
 * Handles satellite selection from the search bar.
 */
function handleSearch(event) {
    const query = event.target.value.trim().toUpperCase();
    if (byName[query]) {
        selectSatellite(byName[query]);
    }
}

/**
 * Handles satellite selection by clicking on the globe.
 */
function handleGlobeClick(movement) {
    const pickedObject = viewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.id) {
        const satName = pickedObject.id.id.toUpperCase();
        if (byName[satName]) {
            selectSatellite(byName[satName]);
        }
    }
}

/**
 * The core function to select a satellite and update the entire UI.
 * @param {object} satData - The satellite object to select.
 */
async function selectSatellite(satData) {
    if (!satData || !satData.entity) return;

    // Deselect any previously selected satellite
    if (selectedSat && selectedSat.entity) {
        selectedSat.entity.point.pixelSize = 4;
        selectedSat.entity.path.material.color.setValue(Cesium.Color.WHITE.withAlpha(0.5));
        if (selectedSat.billboard) {
            viewer.entities.remove(selectedSat.billboard);
            selectedSat.billboard = null;
        }
    }

    selectedSat = satData;

    // Highlight the new selection
    selectedSat.entity.point.pixelSize = 10;
    selectedSat.entity.path.material.color.setValue(Cesium.Color.ORANGERED.withAlpha(0.8));
    
    // Add a distinct billboard icon
    selectedSat.billboard = viewer.entities.add({
        position: selectedSat.entity.position,
        billboard: {
            image: SELECTED_SAT_ICON_URL,
            width: 24,
            height: 24,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
    });

    // Fly to a reasonable distance to prevent the "blue screen" bug
    viewer.flyTo(selectedSat.entity, {
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.toRadians(45), 1500 * 1000)
    });

    // On mobile, ensure the sidebar is visible after selection
    if (window.innerWidth <= 800) {
        document.getElementById('sidebar').classList.add('show');
    }

    // Show loading state while fetching detailed data
    const infoPanel = document.getElementById("infoPanel");
    infoPanel.innerHTML = `<div class="placeholder-text"><div class="spinner"></div><p>Fetching satellite data...</p></div>`;
    
    // Fetch and display the detailed information
    await getAndShowSatelliteDetails(selectedSat);
    viewer.scene.requestRender();
}

/**
 * Fetches (or uses cache) and displays detailed satellite catalog info.
 * @param {object} sat - The selected satellite object.
 */
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
            console.error("Could not fetch SATCAT details:", error);
            sat.details = { OBJECT_NAME: sat.name, COMMENT: 'Error fetching catalog info.' };
        }
    }
    displaySatelliteInfo(sat);
}

/**
 * Renders the detailed satellite information into the info panel.
 * @param {object} sat - The satellite object containing its `details`.
 */
function displaySatelliteInfo(sat) {
    const infoPanel = document.getElementById("infoPanel");
    const d = sat.details;
    const val = (value, fallback = 'N/A') => value || fallback;
    infoPanel.innerHTML = `
        <div class="info-header"><h2>${val(d.OBJECT_NAME)}</h2><p>NORAD ID: ${val(d.NORAD_CAT_ID)} | Intl. Designator: ${val(d.OBJECT_ID)}</p></div>
        <div class="info-section"><h3>OPERATIONAL STATUS</h3><div class="info-grid">
            <div class="info-item"><span class="label">Owner/Country</span><span class="value">${val(d.OWNER)}</span></div>
            <div class="info-item"><span class="label">Launch Date</span><span class="value">${val(d.LAUNCH_DATE)}</span></div>
            <div class="info-item"><span class="label">Launch Site</span><span class="value">${val(d.LAUNCH_SITE)}</span></div>
            <div class="info-item"><span class="label">Object Type</span><span class="value">${val(d.OBJECT_TYPE)}</span></div></div></div>
        <div class="info-section"><h3>ORBITAL PARAMETERS</h3><div class="info-grid">
            <div class="info-item"><span class="label">Period (min)</span><span class="value">${val(d.PERIOD)}</span></div>
            <div class="info-item"><span class="label">Inclination (°)</span><span class="value">${val(d.INCLINATION)}</span></div>
            <div class="info-item"><span class="label">Apogee (km)</span><span class="value">${val(d.APOGEE)}</span></div>
            <div class="info-item"><span class="label">Perigee (km)</span><span class="value">${val(d.PERIGEE)}</span></div></div></div>`;
    infoPanel.parentElement.scrollTop = 0;
}

/**
 * Resets the camera to a global view and deselects any satellite.
 */
function resetCamera() {
    if (selectedSat && selectedSat.entity) {
        selectedSat.entity.point.pixelSize = 4;
        selectedSat.entity.path.material.color.setValue(Cesium.Color.WHITE.withAlpha(0.5));
        if (selectedSat.billboard) {
            viewer.entities.remove(selectedSat.billboard);
            selectedSat.billboard = null;
        }
    }
    selectedSat = null;
    document.getElementById("infoPanel").innerHTML = `<div class="placeholder-text"><p>No satellite selected.</p><span>Select a satellite from the globe or the search bar to view detailed telemetry and orbital data.</span></div>`;
    viewer.flyTo(viewer.entities, { duration: 2.0 });
}
