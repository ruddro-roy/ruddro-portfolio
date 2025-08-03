/**
 * MISSION CONTROL: ROBUST SATELLITE TRACKING PLATFORM
 * Fixed implementation with comprehensive error handling and fallbacks
 */

// --- ROBUST CONFIGURATION ---
const CONFIG = {
    TLE_SOURCES: [
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle'
    ],
    CESIUM_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkYWY0MjU5MS1iNjkzLTQ1ZjMtYjc4Ni1hY2VjNWRmZTcxOGEiLCJpZCI6MjM3MjA5LCJpYXQiOjE3MzU0MTIzNzJ9.zM7_6cGPihCdnYNQJn6_l_TrReA4D1ohNJuqHyA4y_k', // Free token
    MAX_SATELLITES: 1000,
    UPDATE_INTERVAL: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000
};

// --- GLOBAL STATE ---
let viewer = null;
let satellites = [];
let satByName = new Map();
let loadingManager = null;
let errorManager = null;
let performanceMonitor = null;

// --- SATELLITE CATEGORIES ---
const SATELLITE_CATEGORIES = {
    STARLINK: { color: [0, 255, 255], name: 'Starlink' },
    GPS: { color: [0, 255, 0], name: 'GPS/GNSS' },
    ISS: { color: [255, 255, 255], name: 'Space Station' },
    WEATHER: { color: [255, 165, 0], name: 'Weather' },
    COMMUNICATION: { color: [255, 255, 0], name: 'Communication' },
    SCIENTIFIC: { color: [255, 0, 255], name: 'Scientific' },
    MILITARY: { color: [255, 0, 0], name: 'Military' },
    OTHER: { color: [173, 216, 230], name: 'Other' }
};

// --- LOADING STATE MANAGER ---
class LoadingStateManager {
    constructor() {
        this.attempts = 0;
        this.maxAttempts = CONFIG.RETRY_ATTEMPTS;
        this.isLoading = false;
        this.loadingElement = document.getElementById('loadingIndicator');
    }

    showLoading(message) {
        this.isLoading = true;
        if (this.loadingElement) {
            this.loadingElement.style.display = 'flex';
            this.loadingElement.innerHTML = `
                <div class="spinner"></div>
                <p>${message}</p>
            `;
        }
    }

    hideLoading() {
        this.isLoading = false;
        if (this.loadingElement) {
            this.loadingElement.style.display = 'none';
        }
    }

    updateProgress(message) {
        if (this.loadingElement && this.isLoading) {
            const p = this.loadingElement.querySelector('p');
            if (p) p.textContent = message;
        }
    }
}

// --- ERROR MANAGER ---
class ErrorManager {
    constructor() {
        this.errors = [];
        this.maxErrors = 10;
    }

    logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            context,
            timestamp: new Date(),
            stack: error.stack
        };
        
        this.errors.push(errorInfo);
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }
        
        console.error(`[Mission Control Error] ${context}:`, error);
    }

    showUserError(message, isRecoverable = true) {
        const loadingElement = document.getElementById('loadingIndicator');
        if (loadingElement) {
            loadingElement.innerHTML = `
                <div style="text-align: center; color: #ff6b6b; padding: 40px;">
                    <h3>Mission Control Alert</h3>
                    <p>${message}</p>
                    ${isRecoverable ? `
                        <button onclick="location.reload()" 
                                style="margin-top: 20px; padding: 12px 24px; background: #007acc; 
                                       color: white; border: none; border-radius: 6px; cursor: pointer;">
                            🔄 Restart Mission Control
                        </button>
                    ` : ''}
                </div>
            `;
        }
    }
}

// --- TLE VALIDATOR ---
class TLEValidator {
    static validateLine(line, lineNumber) {
        if (!line || line.length !== 69) {
            throw new Error(`Line ${lineNumber} invalid length: ${line?.length || 0}`);
        }
        
        // Validate checksum
        const checksum = this.calculateChecksum(line.substring(0, 68));
        const providedChecksum = parseInt(line.charAt(68));
        
        if (checksum !== providedChecksum) {
            throw new Error(`Line ${lineNumber} checksum mismatch`);
        }
        
        return true;
    }

    static calculateChecksum(line) {
        let sum = 0;
        for (let i = 0; i < line.length; i++) {
            const char = line.charAt(i);
            if (char >= '0' && char <= '9') {
                sum += parseInt(char);
            } else if (char === '-') {
                sum += 1;
            }
        }
        return sum % 10;
    }

    static validateTLE(line1, line2) {
        try {
            this.validateLine(line1, 1);
            this.validateLine(line2, 2);
            
            // Validate satellite numbers match
            const satNum1 = line1.substring(2, 7);
            const satNum2 = line2.substring(2, 7);
            
            if (satNum1 !== satNum2) {
                throw new Error('Satellite numbers do not match');
            }
            
            return true;
        } catch (error) {
            throw new Error(`TLE validation failed: ${error.message}`);
        }
    }
}

// --- ROBUST CESIUM VIEWER ---
class RobustCesiumViewer {
    static async create(containerId) {
        try {
            // Set Cesium Ion token
            if (typeof Cesium !== 'undefined') {
                Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_TOKEN;
            } else {
                throw new Error('Cesium library not loaded');
            }

            const viewer = new Cesium.Viewer(containerId, {
                // Basic imagery that works without Ion
                imageryProvider: new Cesium.OpenStreetMapImageryProvider({
                    url: 'https://a.tile.openstreetmap.org/'
                }),
                
                // Disable problematic features
                terrainProvider: Cesium.Ellipsoid.WGS84,
                skyBox: false,
                skyAtmosphere: false,
                
                // Clean UI
                animation: false,
                timeline: false,
                baseLayerPicker: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                navigationHelpButton: false,
                sceneModePicker: false,
                fullscreenButton: false,
                vrButton: false,
                
                // Performance settings
                requestRenderMode: true,
                maximumRenderTimeChange: Infinity,
                
                // WebGL settings
                contextOptions: {
                    webgl: {
                        failIfMajorPerformanceCaveat: false,
                        preserveDrawingBuffer: true
                    }
                }
            });

            // Configure scene
            viewer.scene.globe.enableLighting = false; // Disable for performance
            viewer.scene.globe.atmosphereColorCorrection = false;
            
            // Set initial view
            viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
                orientation: {
                    heading: 0,
                    pitch: -Cesium.Math.PI_OVER_TWO,
                    roll: 0
                }
            });

            console.log('✅ Cesium viewer initialized successfully');
            return viewer;
            
        } catch (error) {
            console.error('❌ Cesium initialization failed:', error);
            
            // Fallback: Try with minimal configuration
            try {
                const fallbackViewer = new Cesium.Viewer(containerId, {
                    imageryProvider: false,
                    terrainProvider: false,
                    skyBox: false,
                    skyAtmosphere: false,
                    animation: false,
                    timeline: false,
                    baseLayerPicker: false,
                    geocoder: false,
                    homeButton: false,
                    infoBox: false,
                    navigationHelpButton: false,
                    sceneModePicker: false,
                    fullscreenButton: false,
                    vrButton: false,
                    contextOptions: {
                        requestWebgl1: true
                    }
                });
                
                console.log('⚠️ Cesium fallback mode activated');
                return fallbackViewer;
                
            } catch (fallbackError) {
                throw new Error(`Cesium initialization failed completely: ${fallbackError.message}`);
            }
        }
    }
}

// --- SATELLITE DATA MANAGER ---
class SatelliteDataManager {
    constructor() {
        this.cache = new Map();
        this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
    }

    async fetchTLEData(attempt = 0) {
        const source = CONFIG.TLE_SOURCES[attempt % CONFIG.TLE_SOURCES.length];
        
        try {
            console.log(`📡 Fetching TLE data from source ${attempt + 1}...`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(source, {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Mission-Control/1.0'
                }
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.text();
            
            if (!data || data.length < 100) {
                throw new Error('Invalid or empty TLE data received');
            }
            
            return data;
            
        } catch (error) {
            if (attempt < CONFIG.TLE_SOURCES.length - 1) {
                console.warn(`⚠️ Source ${attempt + 1} failed, trying next...`);
                await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
                return this.fetchTLEData(attempt + 1);
            }
            throw error;
        }
    }

    parseTLEData(tleText) {
        const lines = tleText.trim().split(/\r?\n/);
        const parsedSatellites = [];
        const errors = [];

        for (let i = 0; i < lines.length - 2; i += 3) {
            try {
                const name = lines[i].trim();
                const line1 = lines[i + 1].trim();
                const line2 = lines[i + 2].trim();

                if (!name || !line1 || !line2) continue;

                // Validate TLE format
                TLEValidator.validateTLE(line1, line2);

                // Create satellite record
                const satrec = satellite.twoline2satrec(line1, line2);
                
                if (satrec.error !== 0) {
                    throw new Error(`SGP4 initialization failed with error ${satrec.error}`);
                }

                const satData = {
                    name: name,
                    line1: line1,
                    line2: line2,
                    satrec: satrec,
                    category: this.categorizeSatellite(name),
                    entity: null
                };

                parsedSatellites.push(satData);

            } catch (error) {
                errors.push({
                    line: i / 3 + 1,
                    name: lines[i]?.trim() || 'Unknown',
                    error: error.message
                });
            }
        }

        console.log(`✅ Parsed ${parsedSatellites.length} satellites, ${errors.length} errors`);
        
        if (errors.length > 0 && errors.length < 10) {
            console.warn('TLE parsing errors:', errors);
        }

        return parsedSatellites;
    }

    categorizeSatellite(name) {
        const nameUpper = name.toUpperCase();
        
        if (nameUpper.includes('STARLINK')) return 'STARLINK';
        if (nameUpper.includes('GPS') || nameUpper.includes('NAVSTAR')) return 'GPS';
        if (nameUpper.includes('ISS') || nameUpper.includes('ZARYA')) return 'ISS';
        if (nameUpper.includes('GOES') || nameUpper.includes('NOAA')) return 'WEATHER';
        if (nameUpper.includes('INTELSAT') || nameUpper.includes('EUTELSAT')) return 'COMMUNICATION';
        if (nameUpper.includes('LANDSAT') || nameUpper.includes('SENTINEL')) return 'SCIENTIFIC';
        if (nameUpper.includes('USA-') || nameUpper.includes('MILSTAR')) return 'MILITARY';
        
        return 'OTHER';
    }
}

// --- SATELLITE RENDERER ---
class SatelliteRenderer {
    constructor(viewer) {
        this.viewer = viewer;
        this.pointCollection = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
        this.labelCollection = viewer.scene.primitives.add(new Cesium.LabelCollection());
        this.renderedSatellites = new Map();
    }

    renderSatellites(satellites) {
        console.log(`🎯 Rendering ${satellites.length} satellites...`);
        
        const now = new Date();
        let rendered = 0;
        
        // Limit satellites for performance
        const satellitesToRender = satellites.slice(0, CONFIG.MAX_SATELLITES);

        satellitesToRender.forEach((sat, index) => {
            try {
                const position = this.calculatePosition(sat.satrec, now);
                if (!position) return;

                const category = SATELLITE_CATEGORIES[sat.category] || SATELLITE_CATEGORIES.OTHER;
                const color = Cesium.Color.fromBytes(category.color[0], category.color[1], category.color[2], 200);

                // Add point
                const point = this.pointCollection.add({
                    position: position,
                    pixelSize: 6,
                    color: color,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 1,
                    scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.5e8, 0.1),
                    translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.5e8, 0.8)
                });

                // Store satellite data
                this.renderedSatellites.set(sat.name, {
                    satellite: sat,
                    point: point,
                    lastUpdate: now.getTime()
                });

                rendered++;

            } catch (error) {
                console.warn(`Failed to render ${sat.name}:`, error.message);
            }
        });

        console.log(`✅ Successfully rendered ${rendered} satellites`);
        this.viewer.scene.requestRender();
    }

    calculatePosition(satrec, time) {
        try {
            const propagationResult = satellite.propagate(satrec, time);
            
            if (!propagationResult.position) {
                throw new Error('No position returned from propagation');
            }

            // Check for NaN values
            const pos = propagationResult.position;
            if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                throw new Error('NaN values in position');
            }

            // Convert from km to meters and ECI to ECEF
            const positionEci = new Cesium.Cartesian3(
                pos.x * 1000,
                pos.y * 1000, 
                pos.z * 1000
            );

            // Transform to fixed frame
            const gmst = satellite.gstime(time);
            const earthRotation = Cesium.Matrix3.fromRotationZ(-gmst);
            const positionEcef = Cesium.Matrix3.multiplyByVector(earthRotation, positionEci, new Cesium.Cartesian3());

            return positionEcef;

        } catch (error) {
            return null;
        }
    }

    updatePositions() {
        const now = new Date();
        const currentTime = now.getTime();

        this.renderedSatellites.forEach((data, name) => {
            // Update every 30 seconds
            if (currentTime - data.lastUpdate > 30000) {
                try {
                    const newPosition = this.calculatePosition(data.satellite.satrec, now);
                    if (newPosition) {
                        data.point.position = newPosition;
                        data.lastUpdate = currentTime;
                    }
                } catch (error) {
                    console.warn(`Failed to update position for ${name}:`, error.message);
                }
            }
        });

        this.viewer.scene.requestRender();
    }
}

// --- MAIN APPLICATION ---
class MissionControlApp {
    constructor() {
        this.loadingManager = new LoadingStateManager();
        this.errorManager = new ErrorManager();
        this.dataManager = new SatelliteDataManager();
        this.renderer = null;
        this.updateInterval = null;
    }

    async initialize() {
        try {
            this.loadingManager.showLoading('Initializing Mission Control...');

            // Check dependencies
            await this.checkDependencies();

            // Initialize Cesium viewer
            this.loadingManager.updateProgress('Creating 3D visualization...');
            viewer = await RobustCesiumViewer.create('cesiumContainer');
            this.renderer = new SatelliteRenderer(viewer);

            // Load satellite data
            this.loadingManager.updateProgress('Acquiring satellite constellation data...');
            await this.loadSatelliteData();

            // Setup UI
            this.loadingManager.updateProgress('Initializing user interface...');
            this.setupUI();

            // Start real-time updates
            this.startUpdates();

            this.loadingManager.hideLoading();
            console.log('🎉 Mission Control fully operational!');

        } catch (error) {
            this.errorManager.logError(error, 'Application initialization');
            this.errorManager.showUserError(`Initialization failed: ${error.message}`);
        }
    }

    async checkDependencies() {
        const missing = [];
        
        if (typeof Cesium === 'undefined') {
            missing.push('Cesium.js');
        }
        
        if (typeof satellite === 'undefined') {
            missing.push('satellite.js');
        }

        if (missing.length > 0) {
            throw new Error(`Missing dependencies: ${missing.join(', ')}`);
        }
    }

    async loadSatelliteData() {
        try {
            const tleData = await this.dataManager.fetchTLEData();
            const parsedSatellites = this.dataManager.parseTLEData(tleData);
            
            if (parsedSatellites.length === 0) {
                throw new Error('No valid satellites found in TLE data');
            }

            satellites = parsedSatellites;
            
            // Build name lookup map
            satellites.forEach(sat => {
                satByName.set(sat.name.toUpperCase(), sat);
            });

            // Render satellites
            this.renderer.renderSatellites(satellites);
            
            // Populate search
            this.populateSearch();

        } catch (error) {
            throw new Error(`Failed to load satellite data: ${error.message}`);
        }
    }

    populateSearch() {
        const searchList = document.getElementById('satList');
        if (searchList) {
            searchList.innerHTML = '';
            
            // Add top satellites for search
            const topSatellites = satellites.slice(0, 100);
            topSatellites.forEach(sat => {
                const option = document.createElement('option');
                option.value = sat.name;
                searchList.appendChild(option);
            });
        }
    }

    setupUI() {
        // Search functionality
        const searchBox = document.getElementById('searchBox');
        if (searchBox) {
            searchBox.addEventListener('input', (event) => {
                const query = event.target.value.trim().toUpperCase();
                if (query.length > 2) {
                    const matches = satellites.filter(sat => 
                        sat.name.toUpperCase().includes(query)
                    ).slice(0, 10);
                    console.log(`🔍 Found ${matches.length} matches for "${query}"`);
                }
            });

            searchBox.addEventListener('change', (event) => {
                const satName = event.target.value.trim().toUpperCase();
                const satellite = satByName.get(satName);
                if (satellite) {
                    this.selectSatellite(satellite);
                }
            });
        }

        // UI buttons
        const resetBtn = document.getElementById('resetViewBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetView());
        }

        const toggleBtn = document.getElementById('togglePanelBtn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                const sidebar = document.getElementById('sidebar');
                if (sidebar) {
                    sidebar.classList.toggle('show');
                }
            });
        }

        // Click handling
        if (viewer) {
            viewer.screenSpaceEventHandler.setInputAction((event) => {
                const picked = viewer.scene.pick(event.position);
                if (picked && picked.primitive && picked.primitive instanceof Cesium.PointPrimitive) {
                    // Find satellite by point
                    for (const [name, data] of this.renderer.renderedSatellites) {
                        if (data.point === picked.primitive) {
                            this.selectSatellite(data.satellite);
                            break;
                        }
                    }
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }
    }

    selectSatellite(satellite) {
        try {
            console.log(`🎯 Selected satellite: ${satellite.name}`);
            
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) {
                const now = new Date();
                const position = this.renderer.calculatePosition(satellite.satrec, now);
                
                let altitude = 'Calculating...';
                let velocity = 'Calculating...';
                let latitude = 'Calculating...';
                let longitude = 'Calculating...';
                
                if (position) {
                    try {
                        const cartographic = Cesium.Cartographic.fromCartesian(position);
                        altitude = (cartographic.height / 1000).toFixed(1) + ' km';
                        latitude = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4) + '°';
                        longitude = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4) + '°';
                        
                        // Calculate velocity (simplified)
                        const propagationResult = satellite.propagate(satellite.satrec, now);
                        if (propagationResult.velocity) {
                            const vel = propagationResult.velocity;
                            const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
                            velocity = speed.toFixed(2) + ' km/s';
                        }
                    } catch (error) {
                        console.warn('Error calculating satellite parameters:', error);
                    }
                }

                const category = SATELLITE_CATEGORIES[satellite.category] || SATELLITE_CATEGORIES.OTHER;

                infoPanel.innerHTML = `
                    <div class="info-header">
                        <h2>${satellite.name}</h2>
                        <p>Category: ${category.name}</p>
                    </div>
                    
                    <div class="info-section">
                        <h3>🛰️ REAL-TIME DATA</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">Altitude</span>
                                <span class="value">${altitude}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Velocity</span>
                                <span class="value">${velocity}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Latitude</span>
                                <span class="value">${latitude}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Longitude</span>
                                <span class="value">${longitude}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="info-section">
                        <h3>📡 ORBITAL ELEMENTS</h3>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">Inclination</span>
                                <span class="value">${(satellite.satrec.inclo * 180 / Math.PI).toFixed(2)}°</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Eccentricity</span>
                                <span class="value">${satellite.satrec.ecco.toFixed(6)}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Period</span>
                                <span class="value">${((1 / satellite.satrec.no_kozai) * 2 * Math.PI / 60).toFixed(1)} min</span>
                            </div>
                            <div class="info-item">
                                <span class="label">Mean Motion</span>
                                <span class="value">${satellite.satrec.no_kozai.toFixed(8)} rev/day</span>
                            </div>
                        </div>
                    </div>
                `;
            }

            // Fly to satellite if position is available
            if (position && viewer) {
                viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.add(
                        position,
                        Cesium.Cartesian3.multiplyByScalar(
                            Cesium.Cartesian3.normalize(position, new Cesium.Cartesian3()),
                            100000,
                            new Cesium.Cartesian3()
                        ),
                        new Cesium.Cartesian3()
                    ),
                    duration: 2.0
                });
            }

        } catch (error) {
            this.errorManager.logError(error, 'Satellite selection');
        }
    }

    resetView() {
        if (viewer) {
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
                duration: 2.0
            });
        }

        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel) {
            infoPanel.innerHTML = `
                <div class="placeholder-text">
                    <p>No satellite selected.</p>
                    <span>Select a satellite from the globe or search to view detailed information.</span>
                </div>
            `;
        }
    }

    startUpdates() {
        // Update satellite positions every 30 seconds
        this.updateInterval = setInterval(() => {
            if (this.renderer) {
                this.renderer.updatePositions();
            }
        }, CONFIG.UPDATE_INTERVAL);
    }

    destroy() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        if (viewer) {
            viewer.destroy();
            viewer = null;
        }
    }
}

// --- APPLICATION STARTUP ---
document.addEventListener('DOMContentLoaded', async () => {
    const app = new MissionControlApp();
    
    // Global error handling
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        if (app.errorManager) {
            app.errorManager.logError(event.error, 'Global error handler');
        }
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        if (app.errorManager) {
            app.errorManager.logError(new Error(event.reason), 'Unhandled promise rejection');
        }
    });

    // Start the application
    await app.initialize();
    
    // Make app globally available for debugging
    window.MissionControl = app;
});
