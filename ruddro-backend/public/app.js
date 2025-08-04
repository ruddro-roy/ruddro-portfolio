/**
 * Mission Control - Enterprise Grade Satellite Tracking
 * Secure implementation with real-time data processing
 * Enhanced for precise Cesium Ion integration without token exposure, super realistic imagery, and region analysis.
 */

// Configuration
const CONFIG = {
    API_BASE: window.location.origin,
    UPDATE_INTERVAL: 30000, // 30 seconds
    MAX_SATELLITES: 5000,
    ORBIT_PROPAGATION_MINUTES: 90,
    ORBIT_SAMPLE_POINTS: 120,
    REGION_ANALYSIS_INTERVAL_MIN: 5, // Sample every 5 minutes for 24h analysis
    REGION_ANALYSIS_HOURS: 24
};

// State management
const state = {
    session: null,
    satellites: new Map(),
    selectedSatellite: null,
    viewer: null,
    entities: new Map(),
    lastUpdate: null,
    cesiumReady: false,
    drawingRegion: false,
    regionEntity: null,
    regionPositions: [],
    startPosition: null
};

// Session management for secure Cesium access
async function initializeSession() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/api/session`);
        if (!response.ok) throw new Error('Session initialization failed');
        
        state.session = await response.json();
        console.log('Session established:', state.session.sessionId);
        
        // Refresh session before expiry
        setTimeout(initializeSession, 25 * 60 * 1000); // 25 minutes
        
        return state.session;
    } catch (error) {
        console.error('Session error:', error);
        throw error;
    }
}

// Initialize Cesium with secure proxy
async function initializeCesium() {
    try {
        if (!state.session) {
            throw new Error('No valid session');
        }
        
        // Configure Cesium to use our proxy
        Cesium.Ion.defaultAccessToken = undefined; // Disable direct token usage
        
        // Override Cesium resource loading for security and proxying
        const originalResource = Cesium.Resource;
        Cesium.Resource = function(options) {
            if (typeof options === 'string' && options.includes('cesium.com')) {
                // Redirect Cesium Ion requests through our proxy
                options = options.replace('https://api.cesium.com/', `${CONFIG.API_BASE}/api/cesium-assets/`);
                options = options.replace('https://assets.ion.cesium.com/', `${CONFIG.API_BASE}/api/cesium-assets/`);
                options = options.replace('https://assets.cesium.com/', `${CONFIG.API_BASE}/api/cesium-assets/`);
            }
            
            const resource = new originalResource(options);
            
            // Add session header to all Cesium requests
            const originalFetch = resource._makeRequest;
            resource._makeRequest = function(options) {
                options.headers = options.headers || {};
                options.headers['X-Session-ID'] = state.session.sessionId;
                return originalFetch.call(this, options);
            };
            
            return resource;
        };
        
        // Initialize viewer with enterprise configuration (using Sentinel-2 for super realistic imagery)
        state.viewer = new Cesium.Viewer('cesiumContainer', {
            imageryProvider: new Cesium.UrlTemplateImageryProvider({
                url: `${CONFIG.API_BASE}/api/cesium-assets/3954/{z}/{x}/{y}.png`  // Sentinel-2 asset ID 3954 for realistic global imagery
            }),
            
            terrainProvider: new Cesium.CesiumTerrainProvider({
                url: `${CONFIG.API_BASE}/api/cesium-assets/1`  // Cesium World Terrain asset ID 1
            }),
            
            skyBox: false, // Disable for performance
            skyAtmosphere: new Cesium.SkyAtmosphere(),
            
            // Minimal UI for enterprise use
            baseLayerPicker: false,
            geocoder: false,
            homeButton: true,
            infoBox: false,
            navigationHelpButton: false,
            sceneModePicker: true,
            timeline: false,
            animation: false,
            fullscreenButton: true,
            vrButton: false,
            creditContainer: document.createElement('div')
        });
        
        // Configure scene for optimal performance and real-time rendering
        const scene = state.viewer.scene;
        scene.globe.enableLighting = true;
        scene.globe.depthTestAgainstTerrain = false;
        scene.globe.showGroundAtmosphere = true;
        scene.requestRenderMode = true;
        scene.maximumRenderTimeChange = Infinity;
        
        // Set initial view
        state.viewer.camera.setView({
            destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
            orientation: {
                heading: 0,
                pitch: -Cesium.Math.PI_OVER_TWO,
                roll: 0
            }
        });
        
        // Setup event handlers
        state.viewer.screenSpaceEventHandler.setInputAction(
            handleSatelliteClick,
            Cesium.ScreenSpaceEventType.LEFT_CLICK
        );
        
        state.cesiumReady = true;
        console.log('Cesium initialized with secure proxy');
        
    } catch (error) {
        console.error('Cesium initialization failed:', error);
        throw error;
    }
}

// Load real satellite data (full public information from Celestrak)
async function loadSatelliteData() {
    try {
        updateLoadingStatus('Fetching satellite data...');
        
        const response = await fetch(`${CONFIG.API_BASE}/api/satellites/active`);
        if (!response.ok) throw new Error('Failed to fetch satellites');
        
        const data = await response.json();
        console.log(`Loaded ${data.count} satellites`);
        
        // Process satellites
        state.satellites.clear();
        data.satellites.forEach(sat => {
            state.satellites.set(sat.NORAD_CAT_ID, sat);
        });
        
        state.lastUpdate = new Date(data.timestamp);
        
        // Update UI
        populateSearchList();
        
        // Render satellites
        if (state.cesiumReady) {
            renderSatellites();
        }
        
        updateLoadingStatus(null);
        
    } catch (error) {
        console.error('Satellite data error:', error);
        updateLoadingStatus('Error loading satellite data');
    }
}

// Render satellites in 3D (with precise orbit propagation)
function renderSatellites() {
    if (!state.viewer || !state.cesiumReady) return;
    
    // Clear existing entities
    state.entities.forEach(entity => {
        state.viewer.entities.remove(entity);
    });
    state.entities.clear();
    
    let rendered = 0;
    const maxToRender = Math.min(state.satellites.size, CONFIG.MAX_SATELLITES);
    
    for (const [noradId, satData] of state.satellites) {
        if (rendered >= maxToRender) break;
        
        try {
            // Parse TLE
            const satrec = satellite.twoline2satrec(satData.TLE_LINE1, satData.TLE_LINE2);
            if (satrec.error !== 0) continue;
            
            // Calculate orbit (precise using SGP4 propagation)
            const orbitPath = calculateOrbitPath(satrec);
            if (!orbitPath) continue;
            
            // Determine visual properties based on satellite characteristics
            const color = determineSatelliteColor(satData);
            const size = determineSatelliteSize(satData);
            
            // Create entity
            const entity = state.viewer.entities.add({
                id: noradId,
                name: satData.OBJECT_NAME,
                position: orbitPath,
                
                point: {
                    pixelSize: size,
                    color: color,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 1,
                    disableDepthTestDistance: Number.POSITIVE_INFINITY
                },
                
                path: {
                    resolution: 120,
                    material: new Cesium.PolylineGlowMaterialProperty({
                        glowPower: 0.1,
                        color: color.withAlpha(0.5)
                    }),
                    width: 2,
                    leadTime: CONFIG.ORBIT_PROPAGATION_MINUTES * 60,
                    trailTime: CONFIG.ORBIT_PROPAGATION_MINUTES * 60,
                    show: false // Show only when selected
                },
                
                properties: satData
            });
            
            state.entities.set(noradId, entity);
            rendered++;
            
        } catch (error) {
            console.warn(`Failed to render satellite ${noradId}:`, error.message);
        }
    }
    
    console.log(`Rendered ${rendered} satellites`);
    state.viewer.scene.requestRender();
}

// Calculate orbit path (precise real-time propagation)
function calculateOrbitPath(satrec) {
    try {
        const startTime = Cesium.JulianDate.now();
        const stopTime = Cesium.JulianDate.addMinutes(startTime, CONFIG.ORBIT_PROPAGATION_MINUTES, new Cesium.JulianDate());
        const property = new Cesium.SampledPositionProperty();
        
        const timeStep = CONFIG.ORBIT_PROPAGATION_MINUTES * 60 / CONFIG.ORBIT_SAMPLE_POINTS;
        
        for (let i = 0; i <= CONFIG.ORBIT_SAMPLE_POINTS; i++) {
            const time = Cesium.JulianDate.addSeconds(startTime, i * timeStep, new Cesium.JulianDate());
            const jsDate = Cesium.JulianDate.toDate(time);
            
            const positionAndVelocity = satellite.propagate(satrec, jsDate);
            if (!positionAndVelocity.position) continue;
            
            const positionEci = positionAndVelocity.position;
            const positionInertial = new Cesium.Cartesian3(
                positionEci.x * 1000,
                positionEci.y * 1000,
                positionEci.z * 1000
            );
            
            const positionFixed = Cesium.Transforms.computeIcrfToFixed(time, new Cesium.Matrix3())
                ? Cesium.Matrix3.multiplyByVector(
                    Cesium.Transforms.computeIcrfToFixed(time, new Cesium.Matrix3()),
                    positionInertial,
                    new Cesium.Cartesian3()
                  )
                : positionInertial;
            
            property.addSample(time, positionFixed);
        }
        
        return property;
        
    } catch (error) {
        console.error('Orbit calculation error:', error);
        return null;
    }
}

// Determine satellite color and category
function getSatelliteCategoryAndColor(satData) {
    const name = satData.OBJECT_NAME.toUpperCase();
    const owner = (satData.OWNER || '').toUpperCase();
    let category = 'Other';
    let color = Cesium.Color.GRAY;
    
    if (name.includes('ISS') || name.includes('TIANGONG')) {
        category = 'Space Station';
        color = Cesium.Color.WHITE;
    } else if (name.includes('GPS') || name.includes('GLONASS') || name.includes('GALILEO') || name.includes('BEIDOU')) {
        category = 'Navigation';
        color = Cesium.Color.LIME;
    } else if (name.includes('STARLINK') || name.includes('ONEWEB')) {
        category = 'Communication';
        color = Cesium.Color.CYAN;
    } else if (name.includes('GOES') || name.includes('NOAA') || name.includes('METEOSAT')) {
        category = 'Weather';
        color = Cesium.Color.ORANGE;
    } else if (name.includes('HUBBLE') || name.includes('LANDSAT') || name.includes('SENTINEL')) {
        category = 'Scientific';
        color = Cesium.Color.MAGENTA;
    } else if (satData.OBJECT_TYPE === 'DEBRIS') {
        category = 'Debris';
        color = Cesium.Color.RED;
    } else if (satData.OBJECT_TYPE === 'ROCKET BODY') {
        category = 'Rocket Body';
        color = Cesium.Color.YELLOW;
    } else if (owner.includes('US')) {
        category = 'US Military/Civil';
        color = Cesium.Color.DODGERBLUE;
    } else if (owner.includes('RUSS')) {
        category = 'Russian';
        color = Cesium.Color.RED;
    } else if (owner.includes('PRC')) {
        category = 'Chinese';
        color = Cesium.Color.YELLOW;
    } else if (owner.includes('ESA')) {
        category = 'ESA';
        color = Cesium.Color.LIGHTBLUE;
    }
    
    return { category, color };
}

// Determine satellite size based on RCS or type
function determineSatelliteSize(satData) {
    const rcs = satData.RCS_SIZE;
    
    if (rcs === 'LARGE') return 12;
    if (rcs === 'MEDIUM') return 8;
    if (rcs === 'SMALL') return 6;
    
    // Special cases
    if (satData.OBJECT_NAME.includes('ISS')) return 16;
    if (satData.OBJECT_NAME.includes('DEBRIS')) return 4;
    
    return 8;
}

// Handle satellite selection
async function handleSatelliteClick(movement) {
    const pickedObject = state.viewer.scene.pick(movement.position);
    
    if (Cesium.defined(pickedObject) && pickedObject.id) {
        const noradId = pickedObject.id.id;
        await selectSatellite(noradId);
    }
}

// Select satellite and display information (using full public data)
async function selectSatellite(noradId) {
    try {
        // Clear previous selection
        if (state.selectedSatellite) {
            const prevEntity = state.entities.get(state.selectedSatellite);
            if (prevEntity) {
                prevEntity.path.show = false;
                prevEntity.point.pixelSize = determineSatelliteSize(prevEntity.properties._value);
            }
        }
        
        // Highlight new selection
        const entity = state.entities.get(noradId);
        if (!entity) return;
        
        entity.path.show = true;
        entity.point.pixelSize = 16;
        state.selectedSatellite = noradId;
        
        // Fetch detailed information
        updateInfoPanel('Loading satellite details...');
        
        const [detailResponse, positionResponse] = await Promise.all([
            fetch(`${CONFIG.API_BASE}/api/satellite/${noradId}`),
            fetch(`${CONFIG.API_BASE}/api/satellite/${noradId}/position`)
        ]);
        
        const details = await detailResponse.json();
        const position = await positionResponse.json();
        
        displaySatelliteInfo(details, position);
        
        // Track satellite
        state.viewer.trackedEntity = entity;
        
    } catch (error) {
        console.error('Selection error:', error);
        updateInfoPanel('Error loading satellite information');
    }
}

// Display satellite information (full public data from sources, no predefined placeholders)
function displaySatelliteInfo(details, position) {
    if (!details) {
        updateInfoPanel('No information available');
        return;
    }
    
    const infoPanel = document.getElementById('infoPanel');
    
    infoPanel.innerHTML = `
        <div class="info-header">
            <h2>${details.OBJECT_NAME || 'Unknown'}</h2>
            <p>NORAD: ${details.NORAD_CAT_ID} | COSPAR: ${details.OBJECT_ID || 'N/A'}</p>
        </div>
        
        <div class="info-section">
            <h3>IDENTIFICATION</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Object Type</span>
                    <span class="value">${details.OBJECT_TYPE || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Owner</span>
                    <span class="value">${details.OWNER || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Country</span>
                    <span class="value">${details.COUNTRY || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Launch Date</span>
                    <span class="value">${details.LAUNCH_DATE || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Launch Site</span>
                    <span class="value">${details.LAUNCH_SITE || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Decay Date</span>
                    <span class="value">${details.DECAY_DATE || 'Active'}</span>
                </div>
            </div>
        </div>
        
        <div class="info-section">
            <h3>ORBITAL PARAMETERS</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Period (min)</span>
                    <span class="value">${details.PERIOD || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Inclination (°)</span>
                    <span class="value">${details.INCLINATION || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Apogee (km)</span>
                    <span class="value">${details.APOGEE || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Perigee (km)</span>
                    <span class="value">${details.PERIGEE || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="label">RCS Size</span>
                    <span class="value">${details.RCS_SIZE || 'Unknown'}</span>
                </div>
                <div class="info-item">
                    <span class="label">Launch Mass (kg)</span>
                    <span class="value">${details.LAUNCH_MASS || 'Unknown'}</span>
                </div>
            </div>
        </div>
        
        ${position ? `
        <div class="info-section">
            <h3>CURRENT POSITION</h3>
            <div class="info-grid">
                <div class="info-item">
                    <span class="label">Latitude</span>
                    <span class="value">${position.latitude.toFixed(4)}°</span>
                </div>
                <div class="info-item">
                    <span class="label">Longitude</span>
                    <span class="value">${position.longitude.toFixed(4)}°</span>
                </div>
                <div class="info-item">
                    <span class="label">Altitude</span>
                    <span class="value">${position.altitude.toFixed(2)} km</span>
                </div>
                <div class="info-item">
                    <span class="label">Velocity</span>
                    <span class="value">${position.velocity.toFixed(3)} km/s</span>
                </div>
                <div class="info-item">
                    <span class="label">Timestamp</span>
                    <span class="value">${new Date(position.timestamp).toLocaleTimeString()}</span>
                </div>
            </div>
        </div>
        ` : ''}
        
        <div class="info-section">
            <p style="font-size: 0.9rem; color: #888; margin-top: 20px;">
                Data source: CelesTrak/SATCAT<br>
                Last updated: ${state.lastUpdate ? state.lastUpdate.toLocaleString() : 'Unknown'}
            </p>
        </div>
    `;
}

// Start region drawing
function startRegionDrawing() {
    state.drawingRegion = true;
    state.regionPositions = [];
    state.startPosition = null;
    
    // Temporary handler for drawing rectangle
    const handler = new Cesium.ScreenSpaceEventHandler(state.viewer.scene.canvas);
    
    handler.setInputAction((movement) => {
        const cartesian = state.viewer.camera.pickEllipsoid(movement.position);
        if (cartesian) {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            state.startPosition = {
                lon: Cesium.Math.toDegrees(cartographic.longitude),
                lat: Cesium.Math.toDegrees(cartographic.latitude)
            };
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOWN);
    
    handler.setInputAction((movement) => {
        if (!state.startPosition) return;
        
        const cartesian = state.viewer.camera.pickEllipsoid(movement.endPosition);
        if (cartesian) {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const endLon = Cesium.Math.toDegrees(cartographic.longitude);
            const endLat = Cesium.Math.toDegrees(cartographic.latitude);
            
            // Update rectangle
            if (state.regionEntity) {
                state.viewer.entities.remove(state.regionEntity);
            }
            state.regionEntity = state.viewer.entities.add({
                rectangle: {
                    coordinates: Cesium.Rectangle.fromDegrees(
                        Math.min(state.startPosition.lon, endLon),
                        Math.min(state.startPosition.lat, endLat),
                        Math.max(state.startPosition.lon, endLon),
                        Math.max(state.startPosition.lat, endLat)
                    ),
                    material: Cesium.Color.RED.withAlpha(0.3),
                    outline: true,
                    outlineColor: Cesium.Color.RED
                }
            });
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
    
    handler.setInputAction((movement) => {
        handler.destroy();
        state.drawingRegion = false;
        
        const cartesian = state.viewer.camera.pickEllipsoid(movement.position);
        if (cartesian && state.startPosition) {
            const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
            const endLon = Cesium.Math.toDegrees(cartographic.longitude);
            const endLat = Cesium.Math.toDegrees(cartographic.latitude);
            
            const west = Math.min(state.startPosition.lon, endLon);
            const south = Math.min(state.startPosition.lat, endLat);
            const east = Math.max(state.startPosition.lon, endLon);
            const north = Math.max(state.startPosition.lat, endLat);
            
            analyzeRegion({ west, south, east, north });
        }
        
        if (state.regionEntity) {
            state.viewer.entities.remove(state.regionEntity);
            state.regionEntity = null;
        }
    }, Cesium.ScreenSpaceEventType.LEFT_UP);
}

// Analyze satellites over region in last 24 hours
function analyzeRegion(rectangle) {
    updateLoadingStatus('Analyzing region...');
    
    const now = new Date();
    const startTime = new Date(now.getTime() - CONFIG.REGION_ANALYSIS_HOURS * 60 * 60 * 1000);
    const timeSteps = (CONFIG.REGION_ANALYSIS_HOURS * 60) / CONFIG.REGION_ANALYSIS_INTERVAL_MIN;
    const stepMs = CONFIG.REGION_ANALYSIS_INTERVAL_MIN * 60 * 1000;
    
    const categoryCounts = new Map();
    const passDetails = []; // For CSV: satName, category, passTime
    
    for (const [noradId, satData] of state.satellites) {
        try {
            const satrec = satellite.twoline2satrec(satData.TLE_LINE1, satData.TLE_LINE2);
            if (satrec.error !== 0) continue;
            
            const { category, color } = getSatelliteCategoryAndColor(satData);
            let passed = false;
            let passTimes = [];
            
            for (let i = 0; i <= timeSteps; i++) {
                const time = new Date(startTime.getTime() + i * stepMs);
                const positionAndVelocity = satellite.propagate(satrec, time);
                if (!positionAndVelocity.position) continue;
                
                const gmst = satellite.gstime(time);
                const geodetic = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                const lon = satellite.degreesLong(geodetic.longitude);
                const lat = satellite.degreesLat(geodetic.latitude);
                
                if (lon >= rectangle.west && lon <= rectangle.east &&
                    lat >= rectangle.south && lat <= rectangle.north) {
                    passed = true;
                    passTimes.push(time.toISOString());
                }
            }
            
            if (passed) {
                const count = categoryCounts.get(category) || { count: 0, color: color.toCssColorString(), sats: [] };
                count.count++;
                count.sats.push(satData.OBJECT_NAME);
                categoryCounts.set(category, count);
                
                passTimes.forEach(time => {
                    passDetails.push({ satName: satData.OBJECT_NAME, category, passTime: time });
                });
            }
        } catch (error) {
            console.warn(`Analysis failed for ${noradId}:`, error);
        }
    }
    
    displayRegionAnalysis(categoryCounts);
    setupCsvExport(passDetails);
    
    updateLoadingStatus(null);
}

// Display region analysis results
function displayRegionAnalysis(categoryCounts) {
    const resultsDiv = document.getElementById('analysisResults');
    resultsDiv.innerHTML = '';
    
    let total = 0;
    const table = document.createElement('table');
    table.style.width = '100%';
    table.innerHTML = '<tr><th>Category</th><th>Count</th><th>Color</th></tr>';
    
    for (const [category, data] of categoryCounts) {
        total += data.count;
        const row = `<tr>
            <td>${category}</td>
            <td>${data.count}</td>
            <td><div style="width:20px;height:20px;background:${data.color};border:1px solid white;"></div></td>
        </tr>`;
        table.innerHTML += row;
    }
    
    resultsDiv.appendChild(table);
    resultsDiv.innerHTML += `<p>Total satellites passed: ${total}</p>`;
    
    document.getElementById('regionAnalysis').style.display = 'block';
}

// Setup CSV export
function setupCsvExport(passDetails) {
    document.getElementById('exportCsvBtn').onclick = () => {
        let csv = 'Satellite Name,Category,Pass Time\n';
        passDetails.forEach(detail => {
            csv += `${detail.satName},${detail.category},${detail.passTime}\n`;
        });
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'region_satellite_passes.csv';
        a.click();
        URL.revokeObjectURL(url);
    };
}

// UI Helper functions
function updateLoadingStatus(message) {
    const indicator = document.getElementById('loadingIndicator');
    if (message) {
        indicator.style.display = 'flex';
        indicator.querySelector('p').textContent = message;
    } else {
        indicator.style.display = 'none';
    }
}

function updateInfoPanel(message) {
    const infoPanel = document.getElementById('infoPanel');
    infoPanel.innerHTML = `<div class="placeholder-text"><p>${message}</p></div>`;
}

function populateSearchList() {
    const dataList = document.getElementById('satList');
    dataList.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
    let count = 0;
    
    for (const [noradId, sat] of state.satellites) {
        if (count >= 1000) break; // Limit for performance
        
        const option = document.createElement('option');
        option.value = sat.OBJECT_NAME;
        option.setAttribute('data-norad', noradId);
        fragment.appendChild(option);
        count++;
    }
    
    dataList.appendChild(fragment);
}

// Event handlers
function initializeUI() {
    // Theme toggle
    document.getElementById('toggleThemeBtn').addEventListener('click', () => {
        document.body.classList.toggle('light');
        document.body.classList.toggle('dark');
    });
    
    // Reset view
    document.getElementById('resetViewBtn').addEventListener('click', () => {
        if (state.viewer) {
            state.viewer.trackedEntity = undefined;
            state.viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
                orientation: {
                    heading: 0,
                    pitch: -Cesium.Math.PI_OVER_TWO,
                    roll: 0
                }
            });
        }
        
        if (state.selectedSatellite) {
            const entity = state.entities.get(state.selectedSatellite);
            if (entity) {
                entity.path.show = false;
                entity.point.pixelSize = determineSatelliteSize(entity.properties._value);
            }
            state.selectedSatellite = null;
        }
        
        updateInfoPanel('Select a satellite to view details');
    });
    
    // Panel toggle
    document.getElementById('togglePanelBtn').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('show');
    });
    
    // Search functionality
    const searchBox = document.getElementById('searchBox');
    searchBox.addEventListener('change', (e) => {
        const selectedName = e.target.value;
        const option = document.querySelector(`#satList option[value="${selectedName}"]`);
        
        if (option) {
            const noradId = option.getAttribute('data-norad');
            if (noradId) {
                selectSatellite(noradId);
            }
        }
    });
    
    // Region analysis button
    document.getElementById('analyzeRegionBtn').addEventListener('click', () => {
        if (state.drawingRegion) return;
        startRegionDrawing();
    });
}

// Initialize application
async function initialize() {
    try {
        console.log('Initializing Mission Control...');
        
        // Initialize UI
        initializeUI();
        updateLoadingStatus('Establishing secure connection...');
        
        // Get session
        await initializeSession();
        updateLoadingStatus('Initializing 3D visualization...');
        
        // Initialize Cesium
        await initializeCesium();
        updateLoadingStatus('Loading satellite data...');
        
        // Load satellites
        await loadSatelliteData();
        
        // Start periodic updates for real-time data
        setInterval(loadSatelliteData, CONFIG.UPDATE_INTERVAL);
        
        console.log('Mission Control ready');
        // Enterprise notes: For microservices, split into separate services (e.g., one for Cesium proxy, one for satellite data fetching). Use Docker/Kubernetes for scaling. Advanced caching: Implement Redis for satellite data. Performance: Monitor with New Relic/Prometheus.
        
    } catch (error) {
        console.error('Initialization failed:', error);
        updateLoadingStatus('Initialization failed. Please refresh.');
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
