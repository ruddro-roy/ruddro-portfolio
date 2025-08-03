/**
 * Mission Control: Enterprise Satellite Tracking Platform
 * This script orchestrates the entire satellite tracking application with proper backend integration.
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
let appConfig = {
    cesiumToken: null,
    geminiApiKey: null
};

// --- CONFIGURATION LOADING ---
async function loadConfiguration() {
    try {
        // Config should be loaded from /config.js script tag, but fallback to fetch
        if (window.CESIUM_ION_TOKEN) {
            appConfig.cesiumToken = window.CESIUM_ION_TOKEN;
        } else {
            console.warn('CESIUM_ION_TOKEN not found in window, attempting direct fetch...');
            const response = await fetch('/api/config');
            if (response.ok) {
                const config = await response.json();
                appConfig.cesiumToken = config.cesiumToken;
                appConfig.geminiApiKey = config.geminiApiKey;
            }
        }
        
        // Validate configuration
        if (!appConfig.cesiumToken || appConfig.cesiumToken === '') {
            throw new Error('Cesium Ion token not configured');
        }
        
        return true;
    } catch (error) {
        console.error('Configuration loading failed:', error);
        return false;
    }
}

// --- CESIUM INITIALIZATION ---
let viewer;

async function initializeCesium() {
    if (!appConfig.cesiumToken) {
        throw new Error('Cesium token not available');
    }
    
    Cesium.Ion.defaultAccessToken = appConfig.cesiumToken;
    
    viewer = new Cesium.Viewer("cesiumContainer", {
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
    
    return viewer;
}

// --- APPLICATION BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', async () => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    try {
        // Step 1: Load configuration
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading configuration...</p>`;
        const configLoaded = await loadConfiguration();
        
        if (!configLoaded) {
            loadingIndicator.innerHTML = `
                <p style="color:yellow; text-align:center;">
                    CONFIGURATION ERROR<br>
                    Unable to load Cesium Ion token from backend.<br>
                    Please check your environment variables.
                </p>`;
            return;
        }
        
        // Step 2: Initialize Cesium
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Initializing 3D engine...</p>`;
        await initializeCesium();
        
        // Step 3: Initialize UI
        initUI();
        
        // Step 4: Load satellite data
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading satellite data...</p>`;
        setTimeout(loadAndInitializeSatellites, 500);
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        loadingIndicator.innerHTML = `
            <p style="color:red; text-align:center;">
                INITIALIZATION FAILED<br>
                ${error.message}<br>
                <button onclick="location.reload()" style="margin-top:10px;">Retry</button>
            </p>`;
    }
});

/**
 * Binds all user interface event listeners.
 */
function initUI() {
    document.getElementById('toggleThemeBtn').addEventListener('click', () => {
        document.body.classList.toggle('light');
        document.body.classList.toggle('dark');
    });
    document.getElementById('resetViewBtn').addEventListener('click', resetCamera);
    document.getElementById('togglePanelBtn').addEventListener('click', () => 
        document.getElementById('sidebar').classList.toggle('show'));
    document.getElementById('searchBox').addEventListener('change', handleSearch);
    
    viewer.screenSpaceEventHandler.setInputAction(handleGlobeClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    
    viewer.scene.screenSpaceCameraController.enableRotate = true;
    viewer.scene.screenSpaceCameraController.enableTranslate = true;
    viewer.scene.screenSpaceCameraController.enableZoom = true;
    viewer.scene.screenSpaceCameraController.enableTilt = true;
}

/**
 * Main data loading and entity creation pipeline using backend API.
 */
async function loadAndInitializeSatellites() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    try {
        // Use backend API instead of direct TLE fetch
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Fetching satellite positions...</p>`;
        const response = await fetch('/api/starlink/positions');
        if (!response.ok) {
            throw new Error(`Backend API failed: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`Loaded ${data.satellites.length} satellites from backend`);
        
        // Convert backend data to our format
        convertBackendData(data);
        
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Building search index...</p>`;
        populateDatalist();
        
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Rendering 3D visualization...</p>`;
        createSatelliteEntitiesFromBackend(data);
        
        console.log(`Successfully initialized ${satellites.length} satellites`);
        
    } catch (error) {
        console.error("Satellite initialization error:", error);
        
        // Fallback to direct TLE loading if backend fails
        console.warn("Falling back to direct TLE loading...");
        try {
            await loadTLEDirectly();
        } catch (fallbackError) {
            console.error("Fallback also failed:", fallbackError);
            loadingIndicator.innerHTML = `
                <p style="color:red;">Error loading satellite data.<br>
                Backend: ${error.message}<br>
                <button onclick="location.reload()">Retry</button></p>`;
            return;
        }
    } finally {
        if (loadingIndicator.style.display !== 'none' && 
            !loadingIndicator.innerHTML.includes('ERROR') &&
            !loadingIndicator.innerHTML.includes('CONFIGURATION')) {
            loadingIndicator.style.display = 'none';
        }
    }
}

/**
 * Convert backend satellite data to frontend format
 */
function convertBackendData(backendData) {
    satellites = [];
    satByName = {};
    
    backendData.sats.forEach((sat, index) => {
        if (sat.satrec) {
            const satData = {
                name: sat.id,
                satrec: sat.satrec,
                entity: null,
                details: null,
                backendIndex: index
            };
            satellites.push(satData);
            satByName[sat.id.toUpperCase()] = satData;
        }
    });
}

/**
 * Fallback: Direct TLE loading if backend fails
 */
async function loadTLEDirectly() {
    const response = await fetch(TLE_URL);
    if (!response.ok) throw new Error(`TLE fetch failed: ${response.statusText}`);
    const tleText = await response.text();
    
    parseTLEData(tleText);
    populateDatalist();
    createSatelliteEntities();
}

/**
 * Parses raw TLE text into satellite objects (fallback method)
 */
function parseTLEData(tleText) {
    const lines = tleText.split(/\r?\n/);
    satellites = [];
    satByName = {};
    
    for (let i = 0; i < lines.length - 2; i += 3) {
        const name = lines[i].trim();
        if (name) {
            const line1 = lines[i + 1].trim();
            const line2 = lines[i + 2].trim();
            try {
                const satrec = satellite.twoline2satrec(line1, line2);
                if (satrec.error !== 0) continue;
                
                const satData = { 
                    name, 
                    tle1: line1, 
                    tle2: line2, 
                    satrec, 
                    entity: null, 
                    details: null 
                };
                satellites.push(satData);
                satByName[name.toUpperCase()] = satData;
            } catch (e) {
                console.warn(`Failed to parse satellite: ${name}`);
            }
        }
    }
}

/**
 * Populates search autocomplete
 */
function populateDatalist() {
    const dataList = document.getElementById("satList");
    dataList.innerHTML = ''; // Clear existing options
    
    const fragment = document.createDocumentFragment();
    satellites.forEach(sat => {
        const option = document.createElement("option");
        option.value = sat.name;
        fragment.appendChild(option);
    });
    dataList.appendChild(fragment);
}

/**
 * Creates entities from backend data with performance optimization
 */
function createSatelliteEntitiesFromBackend(backendData) {
    const now = Cesium.JulianDate.now();
    const maxSatellites = 1000; // Performance limit
    
    const satellitesToRender = satellites.slice(0, maxSatellites);
    
    if (satellites.length > maxSatellites) {
        console.warn(`Rendering ${maxSatellites} of ${satellites.length} satellites for performance`);
    }
    
    satellitesToRender.forEach(sat => {
        const orbitalPath = computeOrbitalPath(sat.satrec, now);
        if (!orbitalPath) return;

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
 * Fallback entity creation for direct TLE loading
 */
function createSatelliteEntities() {
    createSatelliteEntitiesFromBackend({ sats: satellites });
}

/**
 * Computes orbital path using satellite.js
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
            
            const position = Cesium.Cartesian3.fromArray([p.x, p.y, p.z]).multiplyByScalar(1000);
            const finalPosition = Cesium.Transforms.computeIcrfToFixed(time).multiplyByPoint(position, new Cesium.Cartesian3());
            property.addSample(time, finalPosition);
        } catch (e) {
            return null;
        }
    }
    return property;
}

/**
 * Handle satellite search
 */
function handleSearch(event) {
    const query = event.target.value.trim().toUpperCase();
    if (satByName[query]) {
        selectSatellite(satByName[query]);
    }
}

/**
 * Handle globe clicks
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
 * Select and highlight a satellite
 */
async function selectSatellite(satData) {
    if (!satData || !satData.entity) return;

    // Reset previous selection
    if (selectedSat && selectedSat.entity) {
        selectedSat.entity.point.pixelSize = 4;
        selectedSat.entity.path.material.color.setValue(Cesium.Color.WHITE.withAlpha(0.5));
        if (selectedSat.billboard) {
            viewer.entities.remove(selectedSat.billboard);
            selectedSat.billboard = null;
        }
    }

    selectedSat = satData;

    // Highlight selected satellite
    selectedSat.entity.point.pixelSize = 10;
    selectedSat.entity.path.material.color.setValue(Cesium.Color.ORANGERED.withAlpha(0.8));
    
    selectedSat.billboard = viewer.entities.add({
        position: selectedSat.entity.position,
        billboard: {
            image: SELECTED_SAT_ICON_URL,
            width: 24,
            height: 24,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
    });

    // Fly to satellite
    viewer.flyTo(selectedSat.entity, {
        duration: 2.0,
        offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.toRadians(45), 1500 * 1000)
    });

    // Show sidebar on mobile
    if (window.innerWidth <= 800) {
        document.getElementById('sidebar').classList.add('show');
    }

    // Load satellite details
    const infoPanel = document.getElementById("infoPanel");
    infoPanel.innerHTML = `<div class="placeholder-text"><div class="spinner"></div><p>Fetching satellite data...</p></div>`;
    
    await getAndShowSatelliteDetails(selectedSat);
    viewer.scene.requestRender();
}

/**
 * Fetch satellite details using backend proxy when possible
 */
async function getAndShowSatelliteDetails(sat) {
    if (!sat.details) {
        try {
            // Try to extract NORAD ID
            let noradId;
            if (sat.tle2) {
                noradId = sat.tle2.substring(2, 7);
            } else {
                // Extract from name if no TLE available
                const match = sat.name.match(/\d+/);
                noradId = match ? match[0] : '00000';
            }
            
            // Try backend proxy first, then direct
            let response;
            try {
                response = await fetch(`/api/cesium-proxy/satcat/records.php?CATNR=${noradId}&FORMAT=JSON`);
            } catch (proxyError) {
                console.warn('Backend proxy failed, trying direct:', proxyError);
                response = await fetch(`${SATCAT_URL_BASE}?CATNR=${noradId}&FORMAT=JSON`);
            }
            
            if (!response.ok) throw new Error('SATCAT API request failed');
            const data = (await response.json())[0] || { 
                OBJECT_NAME: sat.name, 
                COMMENT: 'No catalog info found.' 
            };
            
            sat.details = data;
            satcatCache[sat.name.toUpperCase()] = data;
        } catch (error) {
            console.error("Could not fetch SATCAT details:", error);
            sat.details = { 
                OBJECT_NAME: sat.name, 
                COMMENT: 'Error fetching catalog info.' 
            };
        }
    }
    displaySatelliteInfo(sat);
}

/**
 * Display satellite information with AI controls
 */
function displaySatelliteInfo(sat) {
    const infoPanel = document.getElementById("infoPanel");
    const d = sat.details;
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
        <div class="info-section">
            <h3>✨ AI-POWERED ANALYSIS</h3>
            <div class="gemini-controls">
                <button id="briefingBtn" class="gemini-btn">Generate Mission Briefing</button>
                <button id="orbitBtn" class="gemini-btn">Explain Orbit</button>
            </div>
            <div id="geminiResponse"></div>
        </div>`;
    
    document.getElementById('briefingBtn').addEventListener('click', () => handleGeminiRequest('briefing'));
    document.getElementById('orbitBtn').addEventListener('click', () => handleGeminiRequest('orbit'));

    infoPanel.parentElement.scrollTop = 0;
}

/**
 * Handle Gemini AI requests via backend
 */
async function handleGeminiRequest(type) {
    if (!selectedSat || !selectedSat.details) return;

    const geminiResponseDiv = document.getElementById('geminiResponse');
    geminiResponseDiv.innerHTML = `<div class="spinner"></div><p>Generating analysis...</p>`;

    const d = selectedSat.details;
    let prompt = '';

    if (type === 'briefing') {
        prompt = `Generate a concise, engaging mission briefing for the satellite "${d.OBJECT_NAME}", an object of type "${d.OBJECT_TYPE}" launched by ${d.OWNER} on ${d.LAUNCH_DATE}. Describe its likely purpose and importance in a professional, mission-control style.`;
    } else if (type === 'orbit') {
        prompt = `For a non-expert, explain these orbital parameters in simple terms: Apogee: ${d.APOGEE} km, Perigee: ${d.PERIGEE} km, Inclination: ${d.INCLINATION} degrees. What does this type of orbit suggest about the satellite's primary mission or coverage area?`;
    }

    try {
        // Try backend Gemini API first
        let resultText;
        try {
            const response = await fetch('/api/gemini/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt })
            });
            
            if (response.ok) {
                const result = await response.json();
                resultText = result.text;
            } else {
                throw new Error('Backend Gemini API failed');
            }
        } catch (backendError) {
            console.warn('Backend Gemini failed, trying direct:', backendError);
            resultText = await callGeminiAPIDirect(prompt);
        }
        
        geminiResponseDiv.innerText = resultText;
    } catch (error) {
        console.error("Gemini API call failed:", error);
        geminiResponseDiv.innerText = "Error: Could not generate AI analysis. AI features may not be configured properly.";
    }
}

/**
 * Direct Gemini API call (fallback)
 */
async function callGeminiAPIDirect(prompt) {
    // This will only work if you have a direct API key
    const apiKey = appConfig.geminiApiKey || "";
    
    if (!apiKey) {
        throw new Error("Gemini API key not configured");
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{
            parts: [{ text: prompt }]
        }]
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (response.ok) {
        const result = await response.json();
        if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
            return result.candidates[0].content.parts[0].text;
        } else {
            throw new Error("Invalid response structure from Gemini API");
        }
    } else {
        throw new Error(`API request failed with status ${response.status}`);
    }
}

/**
 * Reset camera and clear selection
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
    document.getElementById("infoPanel").innerHTML = `
        <div class="placeholder-text">
            <p>No satellite selected.</p>
            <span>Select a satellite from the globe or the search bar to view detailed telemetry and orbital data.</span>
        </div>`;
    viewer.flyTo(viewer.entities, { duration: 2.0 });
}
