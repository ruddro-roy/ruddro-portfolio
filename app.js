/**
 * Enterprise Satellite Tracking Platform
 * * This script orchestrates the entire satellite tracking application.
 * It handles:
 * - CesiumJS viewer initialization with high-fidelity visuals.
 * - Fetching and parsing satellite TLE data from CelesTrak.
 * - Augmenting satellite data with detailed info from the CelesTrak SATCAT API.
 * - Calculating and rendering smooth, full orbital paths.
 * - Managing user interactions (search, selection, camera control).
 * - Displaying detailed telemetry and metadata in a professional UI.
 * - Ensuring a robust and responsive experience on both desktop and mobile.
 */

// --- Configuration ---
// Using a broader TLE set for active satellites for a more comprehensive view.
const TLE_URL = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
// URL for fetching detailed satellite catalog information.
const SATCAT_URL_BASE = "https://celestrak.org/satcat/records.php";
// A custom icon for the selected satellite to make it clearly distinguishable.
const SELECTED_SAT_ICON_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iNSIgeTE9IjEyIiB4Mj0iMTkiIHkyPSIxMiI+PC9saW5lPjxsaW5lIHgxPSIxMiIgeTE9IjUiIHgyPSIxMiIgeTI9IjE5Ij48L2xpbmU+PC9zdmc+';

// --- Global State & Cache ---
let satellites = [];
let satByName = {}; // Case-insensitive lookup: keys are always UPPERCASE.
let selectedSat = null;
let satcatCache = {}; // Cache for detailed satellite info to avoid redundant API calls.
const ORBIT_PROPAGATION_STEP_SECONDS = 60;
const ORBIT_DURATION_PERIODS = 2; // Calculate orbit for 2 full periods.

// --- CesiumJS Viewer Initialization ---

// =================================================================================
// SECURE TOKEN MANAGEMENT FOR DEPLOYMENT
// =================================================================================
// TO MAKE THE APP WORK:
// 1. Go to https://cesium.com/ion/ and get your free access token.
// 2. Paste your token into the line below.
//
// CRITICAL SECURITY WARNING:
// After you paste your token and deploy the site, you MUST remove the token
// from this file before committing any new changes to your public GitHub repository.
// If you commit your token, it will be exposed and automatically disabled.
// =================================================================================
Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzY2FlZjgzZi1iYzVhLTQxZjEtYTdmMi1lYTFhOWE1OTFkNGYiLCJpZCI6MzI4MDcyLCJpYXQiOjE3NTQxNDk0NTR9.gxKHxL2Mcmgn6xwmWL0lE5LzPgsNh2hJkD1kvT1LZ3w'

const viewer = new Cesium.Viewer("cesiumContainer", {
    // Use high-quality Bing Maps Aerial imagery.
    imageryProvider: new Cesium.IonImageryProvider({ assetId: 2 }),
    // Add realistic atmosphere, fog, and stars.
    skyAtmosphere: new Cesium.SkyAtmosphere(),
    skyBox: new Cesium.SkyBox(),
    // Disable default UI elements we are replacing.
    baseLayerPicker: false, geocoder: false, homeButton: false, infoBox: false,
    navigationHelpButton: false, sceneModePicker: false, timeline: false, animation: false,
});

// Enable globe lighting for realistic day/night cycles.
viewer.scene.globe.enableLighting = true;
// Improve performance by requesting WebGL 2 if available.
viewer.scene.requestRenderMode = true;
viewer.scene.maximumRenderTimeChange = Infinity;

// --- Main Application Flow ---
document.addEventListener('DOMContentLoaded', () => {
    // CORRECTED LOGIC: This check now correctly looks for the placeholder text.
    // If the token on line 44 is the real token, this check will be false,
    // and the application will proceed to load correctly.
    if (Cesium.Ion.defaultAccessToken === 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzY2FlZjgzZi1iYzVhLTQxZjEtYTdmMi1lYTFhOWE1OTFkNGYiLCJpZCI6MzI4MDcyLCJpYXQiOjE3NTQxNDk0NTR9.gxKHxL2Mcmgn6xwmWL0lE5LzPgsNh2hJkD1kvT1LZ3w') {
        const loadingIndicator = document.getElementById('loadingIndicator');
        loadingIndicator.innerHTML = `<p style="color:yellow; text-align:center;">Configuration Needed!<br>Please add your Cesium Ion Access Token in app.js to load the globe.</p>`;
        return;
    }
    initUI();
    loadAndInitializeSatellites();
});

/**
 * Initializes all UI event listeners.
 */
function initUI() {
    document.getElementById('toggleThemeBtn').addEventListener('click', () => document.body.classList.toggle('light'));
    document.getElementById('resetViewBtn').addEventListener('click', resetCamera);
    document.getElementById('togglePanelBtn').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('show'));
    document.getElementById('searchBox').addEventListener('change', handleSearch);
    viewer.screenSpaceEventHandler.setInputAction(handleGlobeClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    // Enable default zoom/pan controls.
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
}

/**
 * Fetches, parses, and creates all satellite entities.
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
        // Only hide the indicator if there wasn't a token error.
        if (loadingIndicator.style.display !== 'none' && !loadingIndicator.innerHTML.includes('Configuration Needed')) {
            loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * Parses raw TLE text into a structured array of satellite objects.
 * @param {string} tleText - The raw TLE data.
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
                
                const satData = {
                    name: name,
                    tle1: line1,
                    tle2: line2,
                    satrec: satrec,
                    entity: null, // Will be linked later
                    details: null // For cached SATCAT data
                };
                satellites.push(satData);
                // CRITICAL FIX: Use uppercase for case-insensitive lookup.
                satByName[name.toUpperCase()] = satData;
            } catch (e) {
                // Ignore satellites that can't be parsed.
            }
        }
    }
}

/**
 * Populates the search box datalist with satellite names.
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
 * Creates Cesium entities for each satellite with pre-calculated orbital paths.
 */
function createSatelliteEntities() {
    const now = Cesium.JulianDate.now();
    satellites.forEach(sat => {
        const orbitalPath = computeOrbitalPath(sat.satrec, now);
        if (!orbitalPath) return;

        const entity = viewer.entities.add({
            id: sat.name,
            position: orbitalPath,
            // Make the 3D model orient itself along the flight path.
            orientation: new Cesium.VelocityOrientationProperty(orbitalPath),
            // Use a simple point as the default representation.
            point: {
                pixelSize: 4,
                color: Cesium.Color.SKYBLUE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 1,
                // Disable depth testing to keep points visible through the globe.
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
            // The full, glowing orbital path.
            path: {
                resolution: 120,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.1,
                    color: Cesium.Color.WHITE.withAlpha(0.5),
                }),
                width: 1,
                trailTime: 0,
                leadTime: (sat.satrec.no_kozai * 60 * ORBIT_DURATION_PERIODS)
            }
        });
        sat.entity = entity;
    });
    viewer.scene.requestRender(); // Request a new frame to show the entities.
}

/**
 * Computes the satellite's orbital path for a set duration.
 * @param {object} satrec - The satellite record from satellite.js.
 * @param {Cesium.JulianDate} startTime - The time to start the calculation.
 * @returns {Cesium.SampledPositionProperty | null} The calculated path.
 */
function computeOrbitalPath(satrec, startTime) {
    const property = new Cesium.SampledPositionProperty();
    // Orbital period in minutes.
    const period = (1 / satrec.no_kozai) * 2 * Math.PI / 60;
    const totalSeconds = period * 60 * ORBIT_DURATION_PERIODS;

    for (let i = 0; i <= totalSeconds; i += ORBIT_PROPAGATION_STEP_SECONDS) {
        const time = Cesium.JulianDate.addSeconds(startTime, i, new Cesium.JulianDate());
        try {
            const positionAndVelocity = satellite.propagate(satrec, Cesium.JulianDate.toDate(time));
            const p = positionAndVelocity.position;
            if (!p) continue;
            
            const position = Cesium.Cartesian3.fromArray([p.x, p.y, p.z]).multiplyByScalar(1000); // km to meters
            const gmst = satellite.gstime(Cesium.JulianDate.toDate(time));
            const finalPosition = Cesium.Transforms.computeIcrfToFixed(time).multiplyByPoint(position, new Cesium.Cartesian3());

            property.addSample(time, finalPosition);
        } catch (e) {
            // Satellite has decayed or has invalid data.
            return null;
        }
    }
    return property;
}

/**
 * Handles satellite selection from the search bar.
 * @param {Event} event - The input change event.
 */
function handleSearch(event) {
    const query = event.target.value.trim().toUpperCase();
    if (query && satByName[query]) {
        selectSatellite(satByName[query]);
    }
}

/**
 * Handles satellite selection by clicking on the globe.
 * @param {object} movement - The click movement object from Cesium.
 */
function handleGlobeClick(movement) {
    const pickedObject = viewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.id) {
        const satName = pickedObject.id.id.toUpperCase();
        if (satByName[satName]) {
            selectSatellite(satByName[satName]);
        }
    }
}

/**
 * The core function to select a satellite and update the entire UI.
 * @param {object} satData - The satellite data object to select.
 */
async function selectSatellite(satData) {
    if (!satData || !satData.entity) return;

    // Deselect any previously selected satellite.
    if (selectedSat && selectedSat.entity) {
        selectedSat.entity.point.pixelSize = 4;
        selectedSat.entity.path.material.color = Cesium.Color.WHITE.withAlpha(0.5);
        // Remove the custom billboard icon.
        if (selectedSat.billboard) {
            viewer.entities.remove(selectedSat.billboard);
            selectedSat.billboard = null;
        }
    }

    selectedSat = satData;

    // Highlight the new selection.
    selectedSat.entity.point.pixelSize = 10;
    selectedSat.entity.path.material.color = Cesium.Color.ORANGERED.withAlpha(0.8);
    
    // Add a distinct billboard icon to the selected satellite.
    selectedSat.billboard = viewer.entities.add({
        position: selectedSat.entity.position,
        billboard: {
            image: SELECTED_SAT_ICON_URL,
            width: 24,
            height: 24,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
    });

    // CRITICAL FIX: Fly to a reasonable distance, not directly into the object.
    viewer.flyTo(selectedSat.entity, {
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.toRadians(45), 1500 * 1000) // 1500km distance
    });

    // On mobile, ensure the sidebar is visible after selection.
    if (window.innerWidth <= 800) {
        document.getElementById('sidebar').classList.add('show');
    }

    // Show loading state in info panel while fetching details.
    const infoPanel = document.getElementById("infoPanel");
    infoPanel.innerHTML = `<div class="placeholder-text"><div class="spinner"></div><p>Fetching satellite data...</p></div>`;
    
    // Fetch and display the detailed information.
    await getAndShowSatelliteDetails(selectedSat);
    viewer.scene.requestRender();
}

/**
 * Fetches (or uses cache) and displays detailed satellite info.
 * @param {object} sat - The selected satellite object.
 */
async function getAndShowSatelliteDetails(sat) {
    if (!sat.details) { // Check cache first
        try {
            const noradId = sat.tle2.substring(2, 7);
            const response = await fetch(`${SATCAT_URL_BASE}?CATNR=${noradId}&FORMAT=JSON`);
            if (!response.ok) throw new Error('SATCAT API request failed');
            const data = await response.json();
            // The API returns an array, even for one result.
            sat.details = data[0] || { OBJECT_NAME: sat.name, COMMENT: 'No catalog info found.' };
            satcatCache[sat.name.toUpperCase()] = sat.details;
        } catch (error) {
            console.error("Could not fetch SATCAT details:", error);
            sat.details = { OBJECT_NAME: sat.name, COMMENT: 'Error fetching catalog info.' };
        }
    }
    
    displaySatelliteInfo(sat);
}

/**
 * Renders the detailed satellite information into the info panel.
 * @param {object} sat - The satellite object with its `details`.
 */
function displaySatelliteInfo(sat) {
    const infoPanel = document.getElementById("infoPanel");
    const d = sat.details;

    // Helper to format data, providing a fallback.
    const val = (value, fallback = 'N/A') => value || fallback;

    infoPanel.innerHTML = `
        <div class="info-header">
            <h2>${val(d.OBJECT_NAME)}</h2>
            <p>NORAD ID: ${val(d.NORAD_CAT_ID)} | Intl. Designator: ${val(d.OBJECT_ID)}</p>
        </div>
        
        <div class="info-section">
            <h3>OPERATIONAL STATUS</h3>
            <div class="info-grid">
                <div class="info-item"><span class="label">Owner/Country</span><span class="value">${val(d.OWNER)}</span></div>
                <div class="info-item"><span class="label">Launch Date</span><span class="value">${val(d.LAUNCH_DATE)}</span></div>
                <div class="info-item"><span class="label">Launch Site</span><span class="value">${val(d.LAUNCH_SITE)}</span></div>
                <div class="info-item"><span class="label">Object Type</span><span class="value">${val(d.OBJECT_TYPE)}</span></div>
            </div>
        </div>

        <div class="info-section">
            <h3>ORBITAL PARAMETERS</h3>
            <div class="info-grid">
                <div class="info-item"><span class="label">Period (min)</span><span class="value">${val(d.PERIOD)}</span></div>
                <div class="info-item"><span class="label">Inclination (°)</span><span class="value">${val(d.INCLINATION)}</span></div>
                <div class="info-item"><span class="label">Apogee (km)</span><span class="value">${val(d.APOGEE)}</span></div>
                <div class="info-item"><span class="label">Perigee (km)</span><span class="value">${val(d.PERIGEE)}</span></div>
            </div>
        </div>
    `;
    // Ensure the new content is scrolled into view.
    infoPanel.parentElement.scrollTop = 0;
}


/**
 * Resets the camera to a global view and deselects any satellite.
 */
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
    
    document.getElementById("infoPanel").innerHTML = `
        <div class="placeholder-text">
            <p>No satellite selected.</p>
            <span>Select a satellite from the globe or search to view detailed telemetry and orbital data.</span>
        </div>`;
    
    viewer.flyTo(viewer.entities, { duration: 2.0 });
}
