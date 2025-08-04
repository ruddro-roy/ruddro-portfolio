/**
 * Mission Control - Enterprise Grade Satellite Tracking
 * Secure implementation with real-time data processing
 * Enhanced for precise Cesium Ion integration without token exposure.
 */

// Configuration
const CONFIG = {
    API_BASE: window.location.origin,
    UPDATE_INTERVAL: 30000, // 30 seconds
    MAX_SATELLITES: 5000,
    ORBIT_PROPAGATION_MINUTES: 90,
    ORBIT_SAMPLE_POINTS: 120
};

// State management
const state = {
    session: null,
    satellites: new Map(),
    selectedSatellite: null,
    viewer: null,
    entities: new Map(),
    lastUpdate: null,
    cesiumReady: false
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
        
        // Initialize viewer with enterprise configuration (using correct proxy URLs for real-time 3D Earth)
        state.viewer = new Cesium.Viewer('cesiumContainer', {
            imageryProvider: new Cesium.UrlTemplateImageryProvider({
                url: `${CONFIG.API_BASE}/api/cesium-assets/2/{z}/{x}/{y}.jpg`  // Correct URL for Natural Earth II imagery (asset ID 2)
            }),
            
            terrainProvider: new Cesium.CesiumTerrainProvider({
                url: `${CONFIG.API_BASE}/api/cesium-assets/1`  // Correct URL for Cesium World Terrain (asset ID 1)
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

// Determine satellite color based on type/operator (visualization only; info uses full public data)
function determineSatelliteColor(satData) {
    const name = satData.OBJECT_NAME.toUpperCase();
    const owner = (satData.OWNER || '').toUpperCase();
    
    // Space stations
    if (name.includes('ISS') || name.includes('TIANGONG')) {
        return Cesium.Color.WHITE;
    }
    
    // Navigation satellites
    if (name.includes('GPS') || name.includes('GLONASS') || name.includes('GALILEO') || name.includes('BEIDOU')) {
        return Cesium.Color.LIME;
    }
    
    // Communication satellites
    if (name.includes('STARLINK') || name.includes('ONEWEB')) {
        return Cesium.Color.CYAN;
    }
    
    // Weather satellites
    if (name.includes('GOES') || name.includes('NOAA') || name.includes('METEOSAT')) {
        return Cesium.Color.ORANGE;
    }
    
    // Scientific satellites
    if (name.includes('HUBBLE') || name.includes('LANDSAT') || name.includes('SENTINEL')) {
        return Cesium.Color.MAGENTA;
    }
    
    // By country/operator
    if (owner.includes('US')) return Cesium.Color.DODGERBLUE;
    if (owner.includes('RUSS')) return Cesium.Color.RED;
    if (owner.includes('PRC')) return Cesium.Color.YELLOW;
    if (owner.includes('ESA')) return Cesium.Color.LIGHTBLUE;
    
    // Default
    return Cesium.Color.GRAY;
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
