/**
 * Mission Control: Enterprise Satellite Tracking Platform
 * Fixed version with proper error handling and Cesium initialization
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
let viewer;
let appConfig = {
    cesiumToken: null,
    initialized: false
};

// --- SAFE CONFIGURATION LOADING ---
async function loadConfiguration() {
    try {
        // Try to get token from window (loaded by /config.js)
        if (window.CESIUM_ION_TOKEN && window.CESIUM_ION_TOKEN !== '') {
            appConfig.cesiumToken = window.CESIUM_ION_TOKEN;
            console.log('✅ Cesium token loaded from config.js');
            return true;
        }
        
        // Fallback: try API endpoint
        console.log('⚠️ Trying API fallback...');
        const response = await fetch('/api/config');
        if (response.ok) {
            const config = await response.json();
            if (config.cesiumToken && config.cesiumToken !== '') {
                appConfig.cesiumToken = config.cesiumToken;
                console.log('✅ Cesium token loaded from API');
                return true;
            }
        }
        
        throw new Error('Cesium token not found in any source');
        
    } catch (error) {
        console.error('❌ Configuration loading failed:', error);
        return false;
    }
}

// --- SAFE CESIUM INITIALIZATION ---
async function initializeCesium() {
    try {
        if (!appConfig.cesiumToken) {
            throw new Error('No Cesium token available');
        }
        
        // Set the token
        Cesium.Ion.defaultAccessToken = appConfig.cesiumToken;
        console.log('🎯 Cesium token set');
        
        // Create viewer with safe configuration
        viewer = new Cesium.Viewer("cesiumContainer", {
            // Use simple imagery provider instead of Ion
            imageryProvider: new Cesium.OpenStreetMapImageryProvider({
                url: 'https://a.tile.openstreetmap.org/',
                credit: 'OpenStreetMap'
            }),
            // Simplified configuration to avoid errors
            baseLayerPicker: false,
            geocoder: false,
            homeButton: false,
            infoBox: false,
            navigationHelpButton: false,
            sceneModePicker: false,
            timeline: false,
            animation: false,
            fullscreenButton: false,
            vrButton: false
        });
        
        // Basic scene configuration
        viewer.scene.globe.enableLighting = true;
        viewer.scene.skyBox = new Cesium.SkyBox({
            sources: {
                positiveX: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                negativeX: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                positiveY: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                negativeY: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                positiveZ: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
                negativeZ: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
            }
        });
        
        console.log('✅ Cesium viewer initialized');
        appConfig.initialized = true;
        return viewer;
        
    } catch (error) {
        console.error('❌ Cesium initialization failed:', error);
        throw error;
    }
}

// --- APPLICATION BOOTSTRAP ---
document.addEventListener('DOMContentLoaded', async () => {
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    try {
        console.log('🚀 Starting Mission Control...');
        
        // Step 1: Load configuration
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading configuration...</p>`;
        const configLoaded = await loadConfiguration();
        
        if (!configLoaded) {
            loadingIndicator.innerHTML = `
                <p style="color:yellow; text-align:center;">
                    CONFIGURATION ERROR<br>
                    Unable to load Cesium Ion token.<br>
                    Please check environment variables in Render.
                    <br><br>
                    <button onclick="location.reload()" style="padding:10px;">🔄 Retry</button>
                </p>`;
            return;
        }
        
        // Step 2: Wait for dependencies
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading 3D engine...</p>`;
        
        // Ensure Cesium is loaded
        if (typeof Cesium === 'undefined') {
            throw new Error('Cesium library not loaded');
        }
        
        // Ensure satellite.js is loaded
        if (typeof satellite === 'undefined') {
            throw new Error('Satellite.js library not loaded');
        }
        
        // Step 3: Initialize Cesium
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Initializing 3D visualization...</p>`;
        await initializeCesium();
        
        // Step 4: Initialize UI
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Setting up interface...</p>`;
        initUI();
        
        // Step 5: Load satellite data
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading satellite data...</p>`;
        await loadAndInitializeSatellites();
        
        console.log('🎉 Mission Control fully loaded!');
        
    } catch (error) {
        console.error('💥 Application initialization failed:', error);
        loadingIndicator.innerHTML = `
            <p style="color:red; text-align:center;">
                INITIALIZATION FAILED<br>
                ${error.message}<br><br>
                <details style="margin-top:10px;">
                    <summary>Technical Details</summary>
                    <pre style="text-align:left; font-size:10px; margin-top:5px;">${error.stack || 'No stack trace available'}</pre>
                </details>
                <br>
                <button onclick="location.reload()" style="padding:10px;">🔄 Retry</button>
            </p>`;
    }
});

/**
 * Initialize UI event handlers
 */
function initUI() {
    try {
        document.getElementById('toggleThemeBtn').addEventListener('click', () => {
            document.body.classList.toggle('light');
            document.body.classList.toggle('dark');
        });
        
        document.getElementById('resetViewBtn').addEventListener('click', resetCamera);
        
        document.getElementById('togglePanelBtn').addEventListener('click', () => 
            document.getElementById('sidebar').classList.toggle('show'));
        
        document.getElementById('searchBox').addEventListener('change', handleSearch);
        
        // Set up Cesium event handlers
        if (viewer && viewer.screenSpaceEventHandler) {
            viewer.screenSpaceEventHandler.setInputAction(handleGlobeClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }
        
        console.log('✅ UI initialized');
    } catch (error) {
        console.error('❌ UI initialization failed:', error);
        throw error;
    }
}

/**
 * Load satellite data with fallback strategies
 */
async function loadAndInitializeSatellites() {
    const loadingIndicator = document.getElementById('loadingIndicator');
    
    try {
        console.log('📡 Loading satellite data...');
        
        // Try backend API first
        try {
            loadingIndicator.innerHTML = `<div class="spinner"></div><p>Fetching from backend...</p>`;
            const response = await fetch('/api/starlink/positions', { timeout: 15000 });
            
            if (response.ok) {
                const data = await response.json();
                console.log(`✅ Backend returned ${data.satellites?.length || 0} satellites`);
                
                if (data.sats && data.sats.length > 0) {
                    convertBackendData(data);
                    populateDatalist();
                    createSatelliteEntities();
                    return; // Success!
                }
            }
        } catch (backendError) {
            console.warn('⚠️ Backend failed, trying direct TLE...', backendError.message);
        }
        
        // Fallback: Direct TLE loading
        loadingIndicator.innerHTML = `<div class="spinner"></div><p>Loading TLE data directly...</p>`;
        const response = await fetch(TLE_URL, { timeout: 20000 });
        
        if (!response.ok) {
            throw new Error(`TLE fetch failed: ${response.status} ${response.statusText}`);
        }
        
        const tleText = await response.text();
        if (!tleText || tleText.length < 100) {
            throw new Error('Invalid TLE data received');
        }
        
        console.log('✅ TLE data loaded directly');
        parseTLEData(tleText);
        populateDatalist();
        createSatelliteEntities();
        
    } catch (error) {
        console.error('❌ All satellite loading methods failed:', error);
        loadingIndicator.innerHTML = `
            <p style="color:red;">
                Failed to load satellite data.<br>
                Error: ${error.message}<br>
                <button onclick="loadAndInitializeSatellites()" style="margin-top:10px;">🔄 Retry</button>
            </p>`;
        throw error;
    } finally {
        if (satellites.length > 0) {
            loadingIndicator.style.display = 'none';
            console.log(`🎯 Successfully loaded ${satellites.length} satellites`);
        }
    }
}

/**
 * Convert backend data format
 */
function convertBackendData(backendData) {
    satellites = [];
    satByName = {};
    
    backendData.sats.forEach((sat, index) => {
        if (sat.satrec || sat.id) {
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
 * Parse TLE data (fallback method)
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
 * Populate search autocomplete
 */
function populateDatalist() {
    const dataList = document.getElementById("satList");
    if (!dataList) return;
    
    dataList.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    satellites.slice(0, 100).forEach(sat => { // Limit for performance
        const option = document.createElement("option");
        option.value = sat.name;
        fragment.appendChild(option);
    });
    dataList.appendChild(fragment);
    
    console.log(`✅ Search index populated with ${Math.min(satellites.length, 100)} entries`);
}

/**
 * Create satellite entities with performance limits
 */
function createSatelliteEntities() {
    if (!viewer) {
        console.error('❌ Viewer not initialized');
        return;
    }
    
    const now = Cesium.JulianDate.now();
    const maxSatellites = 500; // Conservative limit
    
    const satellitesToRender = satellites.slice(0, maxSatellites);
    
    if (satellites.length > maxSatellites) {
        console.warn(`🎯 Rendering ${maxSatellites} of ${satellites.length} satellites for performance`);
    }
    
    let rendered = 0;
    satellitesToRender.forEach((sat, index) => {
        try {
            const orbitalPath = computeOrbitalPath(sat.satrec, now);
            if (!orbitalPath) return;

            sat.entity = viewer.entities.add({
                id: sat.name,
                position: orbitalPath,
                orientation: new Cesium.VelocityOrientationProperty(orbitalPath),
                point: {
                    pixelSize: 3,
                    color: Cesium.Color.CYAN,
                    outlineColor: Cesium.Color.DARKBLUE,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
                path: {
                    resolution: 60,
                    material: new Cesium.PolylineGlowMaterialProperty({
                        glowPower: 0.1,
                        color: Cesium.Color.CYAN.withAlpha(0.4),
                    }),
                    width: 1,
                    trailTime: 0,
                    leadTime: Math.min(3600, (1 / sat.satrec.no_kozai) * 2 * Math.PI * 60) // 1 hour max
                }
            });
            rendered++;
        } catch (error) {
            console.warn(`Failed to render satellite ${sat.name}:`, error.message);
        }
    });
    
    viewer.scene.requestRender();
    console.log(`✅ Rendered ${rendered} satellites in 3D scene`);
}

/**
 * Compute orbital path
 */
function computeOrbitalPath(satrec, startTime) {
    try {
        const property = new Cesium.SampledPositionProperty();
        const period = (1 / satrec.no_kozai) * 2 * Math.PI / 60;
        const totalSeconds = Math.min(period * 60, 7200); // Max 2 hours

        for (let i = 0; i <= totalSeconds; i += ORBIT_PROPAGATION_STEP_SECONDS) {
            const time = Cesium.JulianDate.addSeconds(startTime, i, new Cesium.JulianDate());
            
            const p = satellite.propagate(satrec, Cesium.JulianDate.toDate(time)).position;
            if (!p) continue;
            
            const position = Cesium.Cartesian3.fromArray([p.x, p.y, p.z]).multiplyByScalar(1000);
            const finalPosition = Cesium.Transforms.computeIcrfToFixed(time).multiplyByPoint(position, new Cesium.Cartesian3());
            property.addSample(time, finalPosition);
        }
        return property;
    } catch (error) {
        console.warn('Orbital path computation failed:', error.message);
        return null;
    }
}

/**
 * Handle search
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
    if (!viewer) return;
    
    const pickedObject = viewer.scene.pick(movement.position);
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.id) {
        const satName = pickedObject.id.id.toUpperCase();
        if (satByName[satName]) {
            selectSatellite(satByName[satName]);
        }
    }
}

/**
 * Select satellite (simplified)
 */
async function selectSatellite(satData) {
    if (!satData || !satData.entity || !viewer) return;

    // Reset previous selection
    if (selectedSat && selectedSat.entity) {
        selectedSat.entity.point.pixelSize = 3;
        selectedSat.entity.path.material.color.setValue(Cesium.Color.CYAN.withAlpha(0.4));
        if (selectedSat.billboard) {
            viewer.entities.remove(selectedSat.billboard);
            selectedSat.billboard = null;
        }
    }

    selectedSat = satData;

    // Highlight selected
    selectedSat.entity.point.pixelSize = 8;
    selectedSat.entity.path.material.color.setValue(Cesium.Color.YELLOW.withAlpha(0.8));
    
    // Fly to satellite
    try {
        viewer.flyTo(selectedSat.entity, {
            duration: 2.0,
            offset: new Cesium.HeadingPitchRange(0, -Cesium.Math.toRadians(45), 5000000)
        });
    } catch (flyError) {
        console.warn('Fly-to failed:', flyError.message);
    }

    // Show info
    const infoPanel = document.getElementById("infoPanel");
    if (infoPanel) {
        infoPanel.innerHTML = `
            <div class="info-header">
                <h2>${satData.name}</h2>
                <p>Selected satellite information</p>
            </div>
            <div class="info-section">
                <h3>STATUS</h3>
                <p>Satellite successfully tracked and highlighted in 3D view.</p>
                <p>Orbital data processing...</p>
            </div>`;
    }
    
    console.log(`✅ Selected satellite: ${satData.name}`);
}

/**
 * Reset camera
 */
function resetCamera() {
    if (!viewer) return;
    
    if (selectedSat && selectedSat.entity) {
        selectedSat.entity.point.pixelSize = 3;
        selectedSat.entity.path.material.color.setValue(Cesium.Color.CYAN.withAlpha(0.4));
        if (selectedSat.billboard) {
            viewer.entities.remove(selectedSat.billboard);
            selectedSat.billboard = null;
        }
    }
    
    selectedSat = null;
    
    const infoPanel = document.getElementById("infoPanel");
    if (infoPanel) {
        infoPanel.innerHTML = `
            <div class="placeholder-text">
                <p>No satellite selected.</p>
                <span>Click on a satellite in the 3D view or use the search bar.</span>
            </div>`;
    }
    
    try {
        viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000)
        });
    } catch (error) {
        console.warn('Camera reset failed:', error.message);
    }
}
