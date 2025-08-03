/**
 * STARLINK CONSTELLATION SIMULATOR
 * 
 * Specialized version of Mission Control for Starlink satellite tracking
 * Optimized for high-performance rendering of the entire Starlink constellation
 */

// --- CONFIGURATION ---
const CONFIG = {
    TLE_SOURCES: [
        // Primary source - just Starlink satellites
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
        // Fallback sources
        'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
    ],
    CESIUM_TOKEN: window.CESIUM_ION_TOKEN || '', // Get token from config.js
    MAX_SATELLITES: 5000, // Higher limit for Starlink constellation
    UPDATE_INTERVAL: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000
};

// --- GLOBAL STATE ---
let viewer = null;
let satellites = [];
let renderedSatellites = new Map();
let loadingManager = null;
let errorManager = null;

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
        
        console.error(`[Starlink Simulator Error] ${context}:`, error);
    }

    showUserError(message, isRecoverable = true) {
        const loadingElement = document.getElementById('loadingIndicator');
        if (loadingElement) {
            loadingElement.innerHTML = `
                <div style="text-align: center; color: #ff6b6b; padding: 40px;">
                    <h3>Starlink Simulator Alert</h3>
                    <p>${message}</p>
                    ${isRecoverable ? `
                        <button onclick="location.reload()" 
                                style="margin-top: 20px; padding: 12px 24px; background: #007acc; 
                                       color: white; border: none; border-radius: 6px; cursor: pointer;">
                            🔄 Restart Simulator
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

// --- CESIUM VIEWER SETUP ---
class StarlinkCesiumViewer {
    static async create(containerId) {
        try {
            // Set Cesium Ion token
            if (typeof Cesium !== 'undefined') {
                Cesium.Ion.defaultAccessToken = CONFIG.CESIUM_TOKEN;
            } else {
                throw new Error('Cesium library not loaded');
            }

            const viewer = new Cesium.Viewer(containerId, {
                // Basic imagery
                imageryProvider: new Cesium.OpenStreetMapImageryProvider({
                    url: 'https://a.tile.openstreetmap.org/'
                }),
                
                // Disable features for performance
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

            // Configure scene for optimal performance
            viewer.scene.globe.enableLighting = false;
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
        // Try to fetch from local backend first
        try {
            console.log('📡 Fetching TLE data from local backend...');
            
            const response = await fetch('/api/tle', {
                headers: {
                    'User-Agent': 'Starlink-Simulator/1.0'
                }
            });
            
            if (response.ok) {
                const data = await response.text();
                
                if (data && data.length > 100) {
                    console.log('✅ Successfully fetched TLE data from local backend');
                    return data;
                }
            }
        } catch (localError) {
            console.warn('⚠️ Local backend fetch failed, trying direct sources');
        }
        
        // Fall back to direct sources if local backend fails
        const source = CONFIG.TLE_SOURCES[attempt % CONFIG.TLE_SOURCES.length];
        
        try {
            console.log(`📡 Fetching TLE data from source ${attempt + 1}: ${source}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch('/api/proxy/' + encodeURIComponent(source), {
                signal: controller.signal,
                headers: {
                    'User-Agent': 'Starlink-Simulator/1.0'
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
                
                // Focus on Starlink satellites
                if (!name.includes('STARLINK')) continue;

                // Validate TLE format
                TLEValidator.validateTLE(line1, line2);

                // Create satellite record
                const satrec = satellite.twoline2satrec(line1, line2);
                
                if (satrec.error !== 0) {
                    throw new Error(`SGP4 initialization failed with error ${satrec.error}`);
                }

                const satData = {
                    name: name,
                    id: name.replace(/\s+/g, ''),
                    line1: line1,
                    line2: line2,
                    satrec: satrec,
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

        console.log(`✅ Parsed ${parsedSatellites.length} Starlink satellites, ${errors.length} errors`);
        
        if (errors.length > 0 && errors.length < 10) {
            console.warn('TLE parsing errors:', errors);
        }

        return parsedSatellites;
    }
}

// --- SATELLITE RENDERER ---
class StarlinkRenderer {
    constructor(viewer) {
        this.viewer = viewer;
        
        // Use a single point collection for performance
        this.pointCollection = viewer.scene.primitives.add(
            new Cesium.PointPrimitiveCollection({
                blendOption: Cesium.BlendOption.OPAQUE_AND_TRANSLUCENT
            })
        );
        
        this.renderedSatellites = new Map();
        this.satellitesByOrbit = new Map();
    }

    renderSatellites(satellites) {
        console.log(`🎯 Rendering ${satellites.length} Starlink satellites...`);
        
        const now = new Date();
        let rendered = 0;
        
        // Group satellites by orbital shell (approximate altitude)
        this.groupSatellitesByOrbit(satellites);
        
        // Create different colors for each orbital shell
        const orbitColors = this.createOrbitColors();
        
        // Limit satellites for performance
        const satellitesToRender = satellites.slice(0, CONFIG.MAX_SATELLITES);

        satellitesToRender.forEach((sat, index) => {
            try {
                const position = this.calculatePosition(sat.satrec, now);
                if (!position) return;

                // Get orbit group for coloring
                const altitude = this.calculateAltitude(position);
                const orbitGroup = this.getOrbitGroup(altitude);
                const color = orbitColors.get(orbitGroup) || Cesium.Color.CYAN;

                // Add point
                const point = this.pointCollection.add({
                    position: position,
                    pixelSize: 4, // Smaller point size for better performance
                    color: color,
                    outlineColor: Cesium.Color.WHITE,
                    outlineWidth: 1,
                    scaleByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.5e8, 0.1),
                    translucencyByDistance: new Cesium.NearFarScalar(1.5e6, 1.0, 1.5e8, 0.6)
                });

                // Store satellite data
                this.renderedSatellites.set(sat.id, {
                    satellite: sat,
                    point: point,
                    orbitGroup: orbitGroup,
                    lastUpdate: now.getTime()
                });

                rendered++;

            } catch (error) {
                // Silently fail for performance
                // console.warn(`Failed to render ${sat.name}:`, error.message);
            }
        });

        console.log(`✅ Successfully rendered ${rendered} Starlink satellites`);
        this.viewer.scene.requestRender();
        
        // Update stats
        this.updateStatsDisplay(rendered);
    }
    
    groupSatellitesByOrbit(satellites) {
        this.satellitesByOrbit.clear();
        const now = new Date();
        
        satellites.forEach(sat => {
            try {
                const position = this.calculatePosition(sat.satrec, now);
                if (!position) return;
                
                const altitude = this.calculateAltitude(position);
                const orbitGroup = this.getOrbitGroup(altitude);
                
                if (!this.satellitesByOrbit.has(orbitGroup)) {
                    this.satellitesByOrbit.set(orbitGroup, []);
                }
                
                this.satellitesByOrbit.get(orbitGroup).push(sat);
            } catch (error) {
                // Silently fail
            }
        });
        
        console.log('Orbital groups:', Array.from(this.satellitesByOrbit.keys()));
    }
    
    createOrbitColors() {
        const colors = new Map();
        const orbitGroups = Array.from(this.satellitesByOrbit.keys()).sort();
        
        // Color palette for different orbital shells
        const baseColors = [
            Cesium.Color.fromBytes(0, 255, 255, 200),    // Cyan
            Cesium.Color.fromBytes(0, 255, 0, 200),      // Green
            Cesium.Color.fromBytes(255, 255, 0, 200),    // Yellow
            Cesium.Color.fromBytes(255, 165, 0, 200),    // Orange
            Cesium.Color.fromBytes(255, 0, 255, 200),    // Magenta
            Cesium.Color.fromBytes(255, 0, 0, 200),      // Red
            Cesium.Color.fromBytes(0, 0, 255, 200)       // Blue
        ];
        
        orbitGroups.forEach((group, index) => {
            colors.set(group, baseColors[index % baseColors.length]);
        });
        
        return colors;
    }
    
    calculateAltitude(position) {
        const cartographic = Cesium.Cartographic.fromCartesian(position);
        return cartographic.height / 1000; // km
    }
    
    getOrbitGroup(altitudeKm) {
        // Group Starlink satellites by approximate orbital shell
        if (altitudeKm < 350) return 'Shell-1';
        if (altitudeKm < 450) return 'Shell-2';
        if (altitudeKm < 550) return 'Shell-3';
        if (altitudeKm < 650) return 'Shell-4';
        return 'Shell-5';
    }

    calculatePosition(satrec, time) {
        try {
            const propagationResult = satellite.propagate(satrec, time);
            
            if (!propagationResult.position) {
                return null;
            }

            // Check for NaN values
            const pos = propagationResult.position;
            if (isNaN(pos.x) || isNaN(pos.y) || isNaN(pos.z)) {
                return null;
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
        let updated = 0;

        this.renderedSatellites.forEach((data, id) => {
            // Update only satellites that are visible or need updating
            if (currentTime - data.lastUpdate > 30000) {
                try {
                    const newPosition = this.calculatePosition(data.satellite.satrec, now);
                    if (newPosition) {
                        data.point.position = newPosition;
                        data.lastUpdate = currentTime;
                        updated++;
                    }
                } catch (error) {
                    // Silently fail for performance
                }
            }
        });

        this.viewer.scene.requestRender();
        if (updated > 0) {
            console.log(`Updated positions for ${updated} satellites`);
        }
    }
    
    updateStatsDisplay(count) {
        const infoPanel = document.getElementById('infoPanel');
        if (!infoPanel) return;
        
        // Get orbital shell statistics
        const orbitStats = Array.from(this.satellitesByOrbit.entries())
            .map(([shell, sats]) => ({ 
                shell, 
                count: sats.length 
            }))
            .sort((a, b) => b.count - a.count);
            
        let statsHtml = `
            <div class="info-header">
                <h2>Starlink Constellation</h2>
                <p>Real-time tracking of ${count} active satellites</p>
            </div>
            
            <div class="info-section">
                <h3>🛰️ CONSTELLATION STATS</h3>
                <div class="info-grid">
                    <div class="info-item">
                        <span class="label">Total Satellites</span>
                        <span class="value">${count}</span>
                    </div>
                    <div class="info-item">
                        <span class="label">Orbital Shells</span>
                        <span class="value">${this.satellitesByOrbit.size}</span>
                    </div>
                </div>
            </div>
            
            <div class="info-section">
                <h3>📡 ORBITAL DISTRIBUTION</h3>
                <div class="orbit-bars">
        `;
        
        // Add bars for each orbital shell
        orbitStats.forEach(stat => {
            const percentage = Math.round((stat.count / count) * 100);
            statsHtml += `
                <div class="orbit-stat">
                    <div class="orbit-label">${stat.shell}</div>
                    <div class="orbit-bar-container">
                        <div class="orbit-bar" style="width: ${percentage}%"></div>
                        <span class="orbit-value">${stat.count} satellites (${percentage}%)</span>
                    </div>
                </div>
            `;
        });
        
        statsHtml += `
                </div>
            </div>
            
            <div class="info-section">
                <h3>ℹ️ ABOUT STARLINK</h3>
                <p class="info-text">
                    Starlink is SpaceX's satellite internet constellation providing global broadband 
                    coverage. Satellites orbit at approximately 550 km altitude in multiple orbital 
                    shells, each containing hundreds of satellites.
                </p>
                <p class="info-text">
                    Click on the globe to select individual satellites or use the search 
                    functionality to find specific Starlink satellites by name or ID.
                </p>
            </div>
        `;
        
        infoPanel.innerHTML = statsHtml;
    }
    
    selectSatellite(satellite) {
        try {
            console.log(`🎯 Selected satellite: ${satellite.name}`);
            
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel) {
                const now = new Date();
                const position = this.calculatePosition(satellite.satrec, now);
                
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

                infoPanel.innerHTML = `
                    <div class="info-header">
                        <h2>${satellite.name}</h2>
                        <p>Starlink Satellite</p>
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
                    
                    <div class="info-section">
                        <h3>ℹ️ TECHNICAL DATA</h3>
                        <p class="info-text">
                            Starlink satellites operate in a low Earth orbit (LEO) and use
                            phased array antennas for high-speed, low-latency internet 
                            connectivity. Each satellite weighs approximately 260 kg and 
                            includes a compact flat-panel design with multiple high-throughput
                            antennas and a single solar array.
                        </p>
                        <p class="info-text">
                            <strong>TLE Data:</strong><br>
                            <span class="code-text">${satellite.line1}</span><br>
                            <span class="code-text">${satellite.line2}</span>
                        </p>
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
            console.error('Error selecting satellite:', error);
        }
    }
}

// --- MAIN APPLICATION ---
class StarlinkSimulator {
    constructor() {
        this.loadingManager = new LoadingStateManager();
        this.errorManager = new ErrorManager();
        this.dataManager = new SatelliteDataManager();
        this.renderer = null;
        this.updateInterval = null;
        this.satellitesById = new Map();
    }

    async initialize() {
        try {
            this.loadingManager.showLoading('Initializing Starlink Simulator...');

            // Initialize Cesium viewer
            this.loadingManager.updateProgress('Creating 3D visualization...');
            viewer = await StarlinkCesiumViewer.create('cesiumContainer');
            this.renderer = new StarlinkRenderer(viewer);

            // Load satellite data
            this.loadingManager.updateProgress('Acquiring Starlink constellation data...');
            await this.loadSatelliteData();

            // Setup UI
            this.loadingManager.updateProgress('Initializing user interface...');
            this.setupUI();

            // Start real-time updates
            this.startUpdates();

            this.loadingManager.hideLoading();
            console.log('🎉 Starlink Simulator fully operational!');

        } catch (error) {
            this.errorManager.logError(error, 'Application initialization');
            this.errorManager.showUserError(`Initialization failed: ${error.message}`);
        }
    }

    async loadSatelliteData() {
        try {
            const tleData = await this.dataManager.fetchTLEData();
            const parsedSatellites = this.dataManager.parseTLEData(tleData);
            
            if (parsedSatellites.length === 0) {
                throw new Error('No valid Starlink satellites found in TLE data');
            }

            satellites = parsedSatellites;
            
            // Build ID lookup map
            satellites.forEach(sat => {
                this.satellitesById.set(sat.id, sat);
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
            
            // Add satellites for search
            satellites.forEach(sat => {
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
                const satName = event.target.value.trim();
                const satellite = satellites.find(sat => sat.name === satName);
                if (satellite) {
                    this.renderer.selectSatellite(satellite);
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
        
        const toggleThemeBtn = document.getElementById('toggleThemeBtn');
        if (toggleThemeBtn) {
            toggleThemeBtn.addEventListener('click', () => {
                document.body.classList.toggle('light');
                document.body.classList.toggle('dark');
            });
        }

        // Click handling
        if (viewer) {
            viewer.screenSpaceEventHandler.setInputAction((event) => {
                const picked = viewer.scene.pick(event.position);
                if (picked && picked.primitive && picked.primitive instanceof Cesium.PointPrimitive) {
                    // Find satellite by point
                    for (const [id, data] of this.renderer.renderedSatellites) {
                        if (data.point === picked.primitive) {
                            this.renderer.selectSatellite(data.satellite);
                            break;
                        }
                    }
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }
    }

    resetView() {
        if (viewer) {
            viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
                duration: 2.0
            });
        }

        // Show constellation stats
        this.renderer.updateStatsDisplay(satellites.length);
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
    const app = new StarlinkSimulator();
    
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
    window.StarlinkSimulator = app;
});
