/**
 * Mission Control - Enterprise Grade Satellite Tracking Frontend
 * Version: 3.0.0
 * Author: Ruddro Roy (enhanced by AI assistant)
 * Description: Secure, real-time 3D satellite visualization.
 */

// --- Configuration ---
const CONFIG = {
    API_BASE_URL: window.location.origin,
    SATELLITE_DATA_REFRESH_INTERVAL: 60000, // 60 seconds
    MAX_SATELLITES_TO_RENDER: 8000,
    HIGH_PRECISION_ORBIT_POINTS: 100, // Matches python script output
};

// --- Application State ---
const state = {
    viewer: null,
    satellites: new Map(), // Stores TLE data, keyed by NORAD ID
    entities: new Map(),   // Stores Cesium entities, keyed by NORAD ID
    selectedSatellite: {
        noradId: null,
        entity: null,
        highPrecisionPath: null
    },
    lastDataTimestamp: null
};

// --- UI Elements ---
const ui = {
    loadingIndicator: document.getElementById('loadingIndicator'),
    loadingText: document.getElementById('loadingIndicator').querySelector('p'),
    infoPanel: document.getElementById('infoPanel'),
    searchBox: document.getElementById('searchBox'),
    satDataList: document.getElementById('satList'),
    sidebar: document.getElementById('sidebar'),
};

/**
 * Main application entry point.
 */
async function main() {
    try {
        console.log("Initializing Mission Control v3.0");
        initializeUIEventListeners();
        
        updateLoadingStatus('Initializing 3D environment...');
        await initializeCesiumViewer();

        updateLoadingStatus('Fetching active satellite data...');
        await fetchAndRenderSatellites();
        
        // Set up periodic data refresh
        setInterval(fetchAndRenderSatellites, CONFIG.SATELLITE_DATA_REFRESH_INTERVAL);

        updateLoadingStatus(null); // Hide loading indicator
        console.log("Mission Control initialization complete.");

    } catch (error) {
        console.error("Fatal initialization error:", error);
        updateLoadingStatus(`Error: ${error.message}. Please refresh the page.`);
    }
}

/**
 * Initializes the Cesium Viewer, pointing all asset requests to our secure backend proxy.
 */
async function initializeCesiumViewer() {
    // The proxy is now transparent. CesiumJS is loaded from our backend, so its internal
    // requests for assets will naturally go to our domain, triggering the proxy.
    state.viewer = new Cesium.Viewer('cesiumContainer', {
        // Use a high-quality imagery provider proxied through our backend
        imageryProvider: new Cesium.TileMapServiceImageryProvider({
            url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"),
        }),
        terrainProvider: await Cesium.createWorldTerrainAsync(),
        skyBox: new Cesium.SkyBox({
            sources: {
                positiveX: '/api/cesium-assets/releases/1.114/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_8192/px.jpg',
                negativeX: '/api/cesium-assets/releases/1.114/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_8192/mx.jpg',
                positiveY: '/api/cesium-assets/releases/1.114/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_8192/py.jpg',
                negativeY: '/api/cesium-assets/releases/1.114/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_8192/my.jpg',
                positiveZ: '/api/cesium-assets/releases/1.114/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_8192/pz.jpg',
                negativeZ: '/api/cesium-assets/releases/1.114/Build/Cesium/Assets/Textures/SkyBox/tycho2t3_8192/mz.jpg'
            }
        }),
        skyAtmosphere: new Cesium.SkyAtmosphere(),
        // Configure UI elements for a professional look
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        timeline: false,
        animation: false,
        fullscreenButton: false,
        vrButton: false,
        creditContainer: document.createElement("div"), // Hide credits
    });

    // Performance and visual enhancements
    const scene = state.viewer.scene;
    scene.globe.enableLighting = true;
    scene.globe.depthTestAgainstTerrain = false;
    scene.requestRenderMode = true;
    scene.maximumRenderTimeChange = Infinity; // Only render when needed

    // Set initial camera view
    resetCameraView();

    // Set up click handler for satellite selection
    state.viewer.screenSpaceEventHandler.setInputAction(
        handleEntityClick,
        Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
}

/**
 * Fetches the latest satellite TLE data from the backend and triggers rendering.
 */
async function fetchAndRenderSatellites() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/satellites/active`);
        if (!response.ok) {
            throw new Error(`Server returned status ${response.status}`);
        }
        const data = await response.json();

        state.lastDataTimestamp = new Date(data.timestamp);
        console.log(`Fetched ${data.count} satellites at ${state.lastDataTimestamp.toLocaleTimeString()}`);

        // Update the internal satellite data map
        const newSatellites = new Map(data.satellites.map(sat => [sat.NORAD_CAT_ID, sat]));
        state.satellites = newSatellites;

        // Render satellites on the globe
        await renderAllSatellites();
        updateSearchDatalist();

    } catch (error) {
        console.error("Failed to fetch or render satellite data:", error);
        updateLoadingStatus('Could not refresh satellite data.');
    }
}

/**
 * Renders all satellites as points on the globe.
 */
async function renderAllSatellites() {
    if (!state.viewer) return;
    
    state.viewer.entities.suspendEvents(); // Pause events for performance
    state.viewer.entities.removeAll(); // Clear all previous entities
    state.entities.clear();

    const satellitesToRender = Array.from(state.satellites.values()).slice(0, CONFIG.MAX_SATELLITES_TO_RENDER);

    for (const satData of satellitesToRender) {
        // The position is now just a placeholder; orbits are calculated on demand
        const entity = state.viewer.entities.add({
            id: satData.NORAD_CAT_ID,
            name: satData.OBJECT_NAME,
            position: Cesium.Cartesian3.fromDegrees(0, 0, 0), // Will be updated on select
            point: {
                pixelSize: getSatelliteVisualProperties(satData).size,
                color: getSatelliteVisualProperties(satData).color,
                outlineColor: Cesium.Color.WHITE,
                outlineWidth: 1,
                disableDepthTestDistance: Number.POSITIVE_INFINITY
            },
            properties: satData, // Store the full TLE data
        });
        state.entities.set(satData.NORAD_CAT_ID, entity);
    }
    
    state.viewer.entities.resumeEvents(); // Resume events
    state.viewer.scene.requestRender(); // Request a new frame
    console.log(`Rendered ${state.entities.size} satellites as static points.`);
}


/**
 * Handles clicking on an entity in the Cesium scene.
 * @param {object} movement - The click event data.
 */
function handleEntityClick(movement) {
    const pickedObject = state.viewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
        selectSatellite(pickedObject.id.id);
    }
}

/**
 * Core function to select a satellite, fetch its data, and display its orbit.
 * @param {string} noradId - The NORAD ID of the satellite to select.
 */
async function selectSatellite(noradId) {
    // Prevent re-selecting the same satellite
    if (state.selectedSatellite.noradId === noradId) {
        state.viewer.trackedEntity = state.selectedSatellite.entity;
        return;
    }

    // Clear previous selection visuals
    clearSelection();

    const entity = state.entities.get(noradId);
    const satData = state.satellites.get(noradId);

    if (!entity || !satData) {
        console.warn(`Could not find satellite data for NORAD ID: ${noradId}`);
        updateInfoPanelWithMessage('Satellite data not available.');
        return;
    }
    
    state.selectedSatellite.noradId = noradId;
    state.selectedSatellite.entity = entity;
    
    // Visually highlight the selected satellite
    entity.point.pixelSize = 12;
    entity.point.outlineWidth = 2;
    
    // Fetch and display detailed info and orbit
    updateInfoPanelWithMessage('Fetching satellite details and propagating orbit...');
    
    // Fetch detailed metadata and high-precision orbit concurrently
    const [details] = await Promise.all([
        fetchSatelliteDetails(noradId),
        propagateAndDrawHighPrecisionOrbit(satData)
    ]);

    // Update the info panel with the complete data
    if (details) {
        displaySatelliteInfo(details);
    } else {
        updateInfoPanelWithMessage('Could not retrieve satellite details.');
    }
    
    // Track the newly selected satellite
    state.viewer.trackedEntity = entity;
    state.viewer.scene.requestRender();
}

/**
 * Fetches detailed metadata for a given satellite.
 * @param {string} noradId - The NORAD ID.
 * @returns {object|null} The satellite details or null on failure.
 */
async function fetchSatelliteDetails(noradId) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/satellite/${noradId}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error(`Error fetching details for ${noradId}:`, error);
        return null;
    }
}

/**
 * Calls the backend to run the Python script and draws the resulting orbit path.
 * @param {object} satData - The satellite's TLE data.
 */
async function propagateAndDrawHighPrecisionOrbit(satData) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/api/satellite/${satData.NORAD_CAT_ID}/propagate-gr`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tle1: satData.TLE_LINE1,
                tle2: satData.TLE_LINE2
            })
        });

        if (!response.ok) {
            throw new Error(`Orbit propagation failed with status ${response.status}`);
        }
        const positionsKm = await response.json();

        // Convert positions from km (from Python script) to meters for Cesium
        const positionsMeters = positionsKm.map(p => new Cesium.Cartesian3(p[0] * 1000, p[1] * 1000, p[2] * 1000));

        // Update the entity's position to the start of the orbit
        if (positionsMeters.length > 0) {
            state.selectedSatellite.entity.position = positionsMeters[0];
        }
        
        // Draw the orbit path
        state.selectedSatellite.highPrecisionPath = state.viewer.entities.add({
            polyline: {
                positions: positionsMeters,
                width: 2,
                material: new Cesium.PolylineGlowMaterialProperty({
                    glowPower: 0.2,
                    color: Cesium.Color.LIME,
                }),
            },
        });

    } catch (error) {
        console.error(`High-precision orbit propagation failed for ${satData.NORAD_CAT_ID}:`, error);
        updateInfoPanelWithMessage('Failed to calculate high-precision orbit.');
    }
}

/**
 * Clears all visual artifacts of a selection (path, highlight).
 */
function clearSelection() {
    if (state.selectedSatellite.entity) {
        const satData = state.satellites.get(state.selectedSatellite.noradId);
        if (satData) {
            const props = getSatelliteVisualProperties(satData);
            state.selectedSatellite.entity.point.pixelSize = props.size;
            state.selectedSatellite.entity.point.outlineWidth = 1;
        }
    }
    if (state.selectedSatellite.highPrecisionPath) {
        state.viewer.entities.remove(state.selectedSatellite.highPrecisionPath);
    }
    
    state.selectedSatellite.noradId = null;
    state.selectedSatellite.entity = null;
    state.selectedSatellite.highPrecisionPath = null;
    state.viewer.trackedEntity = undefined;
}

/**
 * Determines the color and size of a satellite point based on its data.
 * @param {object} satData - The satellite's TLE and metadata.
 * @returns {{color: Cesium.Color, size: number}}
 */
function getSatelliteVisualProperties(satData) {
    const name = (satData.OBJECT_NAME || '').toUpperCase();
    const type = (satData.OBJECT_TYPE || '').toUpperCase();
    
    if (type.includes('PAYLOAD')) {
        if (name.includes('STARLINK')) return { color: Cesium.Color.CYAN, size: 4 };
        if (name.includes('ONEWEB')) return { color: Cesium.Color.DEEPSKYBLUE, size: 4 };
        if (name.includes('GPS') || name.includes('GLONASS') || name.includes('GALILEO') || name.includes('BEIDOU')) return { color: Cesium.Color.LIMEGREEN, size: 6 };
        if (name.includes('ISS')) return { color: Cesium.Color.WHITE, size: 10 };
        if (name.includes('TIANGONG')) return { color: Cesium.Color.GOLD, size: 8 };
        return { color: Cesium.Color.LIGHTGRAY, size: 5 };
    }
    if (type.includes('ROCKET BODY')) return { color: Cesium.Color.DARKORANGE, size: 3 };
    if (type.includes('DEBRIS')) return { color: Cesium.Color.RED, size: 2 };

    return { color: Cesium.Color.GRAY, size: 2 };
}


// --- UI Update Functions ---

/**
 * Populates the info panel with detailed satellite information.
 * @param {object} details - The full details object from the backend.
 */
function displaySatelliteInfo(details) {
    const formatValue = (value) => value || 'N/A';
    
    ui.infoPanel.innerHTML = `
        <div class="info-header">
            <h2>${formatValue(details.OBJECT_NAME)}</h2>
            <p>NORAD: ${formatValue(details.NORAD_CAT_ID)} | COSPAR: ${formatValue(details.OBJECT_ID)}</p>
        </div>
        
        <div class="info-section">
            <h3>Identification</h3>
            <div class="info-grid">
                <div class="info-item"><span class="label">Object Type</span><span class="value">${formatValue(details.OBJECT_TYPE)}</span></div>
                <div class="info-item"><span class="label">Owner</span><span class="value">${formatValue(details.OWNER)}</span></div>
                <div class="info-item"><span class="label">Country</span><span class="value">${formatValue(details.COUNTRY)}</span></div>
                <div class="info-item"><span class="label">Launch Date</span><span class="value">${formatValue(details.LAUNCH_DATE)}</span></div>
                <div class="info-item"><span class="label">Launch Site</span><span class="value">${formatValue(details.LAUNCH_SITE)}</span></div>
                <div class="info-item"><span class="label">Decay Date</span><span class="value">${details.DECAY_DATE || 'Active'}</span></div>
            </div>
        </div>
        
        <div class="info-section">
            <h3>Orbital Parameters</h3>
            <div class="info-grid">
                <div class="info-item"><span class="label">Period (min)</span><span class="value">${formatValue(details.PERIOD)}</span></div>
                <div class="info-item"><span class="label">Inclination (°)</span><span class="value">${formatValue(details.INCLINATION)}</span></div>
                <div class="info-item"><span class="label">Apogee (km)</span><span class="value">${formatValue(details.APOGEE)}</span></div>
                <div class="info-item"><span class="label">Perigee (km)</span><span class="value">${formatValue(details.PERIGEE)}</span></div>
                <div class="info-item"><span class="label">RCS (m²)</span><span class="value">${formatValue(details.RCS_SIZE)}</span></div>
            </div>
        </div>
        
        <div class="info-section">
            <p style="font-size: 0.9rem; color: #888; margin-top: 10px;">
                Data source: CelesTrak/SATCAT<br>
                Last TLE update: ${state.lastDataTimestamp.toLocaleString()}
            </p>
        </div>
    `;
}

/**
 * Displays a placeholder message in the info panel.
 * @param {string} message - The message to display.
 */
function updateInfoPanelWithMessage(message) {
    ui.infoPanel.innerHTML = `<div class="placeholder-text"><p>${message}</p></div>`;
}

/**
 * Updates the search box datalist with current satellite names.
 */
function updateSearchDatalist() {
    const fragment = document.createDocumentFragment();
    for (const sat of state.satellites.values()) {
        const option = document.createElement('option');
        option.value = `${sat.OBJECT_NAME} (${sat.NORAD_CAT_ID})`;
        option.setAttribute('data-norad', sat.NORAD_CAT_ID);
        fragment.appendChild(option);
    }
    ui.satDataList.innerHTML = ''; // Clear previous options
    ui.satDataList.appendChild(fragment);
}


/**
 * Shows or hides the loading indicator.
 * @param {string|null} message - The message to show, or null to hide.
 */
function updateLoadingStatus(message) {
    if (message) {
        ui.loadingIndicator.style.display = 'flex';
        ui.loadingText.textContent = message;
    } else {
        ui.loadingIndicator.style.display = 'none';
    }
}

/**
 * Resets the camera to a default global view.
 */
function resetCameraView() {
    if (!state.viewer) return;
    state.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-90, 30, 18000000),
        orientation: { heading: 0, pitch: -Cesium.Math.PI_OVER_TWO, roll: 0 }
    });
}

/**
 * Sets up all UI event listeners.
 */
function initializeUIEventListeners() {
    document.getElementById('toggleThemeBtn').addEventListener('click', () => {
        document.body.classList.toggle('light');
    });

    document.getElementById('resetViewBtn').addEventListener('click', () => {
        clearSelection();
        resetCameraView();
        updateInfoPanelWithMessage('Select a satellite to view details.');
    });

    document.getElementById('togglePanelBtn').addEventListener('click', () => {
        ui.sidebar.classList.toggle('show');
    });

    ui.searchBox.addEventListener('input', (e) => {
        const value = e.target.value.toUpperCase();
        const option = Array.from(ui.satDataList.options).find(opt => opt.value.toUpperCase() === value);

        if (option) {
            const noradId = option.getAttribute('data-norad');
            if (noradId) {
                selectSatellite(noradId);
                ui.searchBox.value = '';
            }
        }
    });
}

// --- Application Startup ---
document.addEventListener('DOMContentLoaded', main);
