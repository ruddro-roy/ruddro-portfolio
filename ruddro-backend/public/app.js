/**
 * Mission Control Enterprise - Real-time Satellite Tracking System
 * Secure implementation with Cesium Ion integration and comprehensive satellite data
 * Features: Real-time 3D Earth, satellite tracking, orbital mechanics, enterprise security
 */

// Application Configuration
const CONFIG = {
    API_BASE: window.location.origin,
    UPDATE_INTERVAL: 30000, // 30 seconds for real-time updates
    MAX_SATELLITES_RENDER: 8000, // Enterprise scale
    ORBIT_PROPAGATION_MINUTES: 120, // 2 orbits
    ORBIT_SAMPLE_POINTS: 180,
    SEARCH_DEBOUNCE_MS: 300,
    SESSION_REFRESH_INTERVAL: 25 * 60 * 1000, // 25 minutes
    PERFORMANCE_MONITOR_INTERVAL: 1000,
    CESIUM_BASE_LAYER_ASSET_ID: 3812, // High-resolution Bing Maps
    CESIUM_TERRAIN_ASSET_ID: 1, // Cesium World Terrain
    MAX_RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000,
};

// Application State
const AppState = {
    // Core system
    viewer: null,
    session: null,
    satellites: new Map(),
    selectedSatellite: null,
    
    // Rendering state
    entities: new Map(),
    showOrbits: false,
    showLabels: true,
    enableDayNight: true,
    currentFilter: 'all',
    
    // System status
    systemReady: false,
    lastDataUpdate: null,
    connectionStatus: 'disconnected',
    errorCount: 0,
    retryAttempts: 0,
    
    // Performance monitoring
    frameCount: 0,
    lastFrameTime: 0,
    fps: 0,
    
    // UI state
    searchResults: [],
    searchTimeout: null,
};

// Utility Functions
const Utils = {
    formatDate: (date) => {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZoneName: 'short'
        }).format(new Date(date));
    },

    formatNumber: (num, decimals = 2) => {
        return parseFloat(num).toFixed(decimals);
    },

    calculateDistance: (lat1, lon1, lat2, lon2) => {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    },

    debounce: (func, wait) => {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    showMessage: (message, type = 'info', duration = 5000) => {
        const container = document.getElementById('messageContainer');
        if (!container) return;
        
        const messageDiv = document.createElement('div');
        messageDiv.className = type === 'error' ? 'error-message' : 'success-message';
        messageDiv.textContent = message;
        
        container.appendChild(messageDiv);
        
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, duration);
    },

    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};

// Session Management
const SessionManager = {
    async initialize() {
        let lastError = null;
        
        for (let attempt = 0; attempt < CONFIG.MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                console.log(`Initializing secure session... (attempt ${attempt + 1}/${CONFIG.MAX_RETRY_ATTEMPTS})`);
                
                const response = await fetch(`${CONFIG.API_BASE}/api/session`, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 10000
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Session initialization failed: ${response.status} - ${errorText}`);
                }

                AppState.session = await response.json();
                console.log('Session established:', AppState.session.sessionId);
                AppState.retryAttempts = 0;

                // Schedule session refresh before expiry
                setTimeout(() => {
                    this.initialize();
                }, CONFIG.SESSION_REFRESH_INTERVAL);

                return AppState.session;

            } catch (error) {
                lastError = error;
                console.error(`Session initialization attempt ${attempt + 1} failed:`, error);
                
                if (attempt < CONFIG.MAX_RETRY_ATTEMPTS - 1) {
                    console.log(`Retrying in ${CONFIG.RETRY_DELAY}ms...`);
                    await Utils.sleep(CONFIG.RETRY_DELAY);
                }
            }
        }
        
        // All attempts failed
        console.error('All session initialization attempts failed:', lastError);
        AppState.retryAttempts = CONFIG.MAX_RETRY_ATTEMPTS;
        
        const errorMessage = lastError?.message || 'Unknown error';
        Utils.showMessage(`Failed to establish secure session: ${errorMessage}`, 'error');
        
        throw new Error(`Session initialization failed after ${CONFIG.MAX_RETRY_ATTEMPTS} attempts: ${errorMessage}`);
    },

    getHeaders() {
        if (!AppState.session) {
            throw new Error('No active session');
        }

        return {
            'X-Session-ID': AppState.session.sessionId,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        };
    }
};

// Cesium Integration
const CesiumManager = {
    async initialize() {
        try {
            if (!AppState.session) {
                throw new Error('Session required for Cesium initialization');
            }

            updateLoadingStatus('Configuring Cesium Ion...');

            // Check if Cesium is available
            if (typeof Cesium === 'undefined') {
                throw new Error('Cesium library not loaded. Please check your internet connection.');
            }

            // Configure Cesium to use our secure proxy
            Cesium.Ion.defaultAccessToken = undefined;

            // Simple Cesium viewer initialization without complex proxy overrides for now
            AppState.viewer = new Cesium.Viewer('cesiumContainer', {
                // Basic configuration that should work without advanced proxy
                terrainProvider: Cesium.Terrain.fromWorldTerrain(),
                
                // Scene configuration for performance
                scene3DOnly: false,
                orderIndependentTranslucency: false,
                contextOptions: {
                    webgl: {
                        alpha: false,
                        depth: true,
                        stencil: false,
                        antialias: true,
                        powerPreference: "high-performance"
                    }
                },

                // UI configuration
                animation: false,
                timeline: false,
                baseLayerPicker: false,
                fullscreenButton: false,
                geocoder: false,
                homeButton: false,
                infoBox: false,
                sceneModePicker: false,
                selectionIndicator: false,
                navigationHelpButton: false,
                navigationInstructionsInitiallyVisible: false,
                creditContainer: document.createElement('div') // Hide credits
            });

            // Configure scene for real-time performance
            const scene = AppState.viewer.scene;
            scene.globe.enableLighting = AppState.enableDayNight;
            scene.globe.dynamicAtmosphereLighting = true;
            scene.globe.dynamicAtmosphereLightingFromSun = true;
            scene.globe.showGroundAtmosphere = true;
            scene.globe.depthTestAgainstTerrain = false;

            // Set initial camera position
            AppState.viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(0.0, 0.0, 25000000),
                orientation: {
                    heading: 0.0,
                    pitch: -Cesium.Math.PI_OVER_TWO,
                    roll: 0.0
                }
            });

            // Setup event handlers
            AppState.viewer.screenSpaceEventHandler.setInputAction(
                this.onSatelliteClick.bind(this),
                Cesium.ScreenSpaceEventType.LEFT_CLICK
            );

            updateStatus('cesium', 'active', 'Connected');
            console.log('Cesium initialized successfully');
            
            return AppState.viewer;

        } catch (error) {
            console.error('Cesium initialization failed:', error);
            updateStatus('cesium', 'error', 'Failed');
            Utils.showMessage(`3D visualization failed: ${error.message}`, 'error');
            throw error;
        }
    },

    onSatelliteClick(event) {
        const pickedObject = AppState.viewer.scene.pick(event.position);
        if (Cesium.defined(pickedObject) && Cesium.defined(pickedObject.id)) {
            const entity = pickedObject.id;
            if (entity.satellite) {
                SatelliteManager.selectSatellite(entity.satellite.NORAD_CAT_ID);
            }
        }
    },

    resetView() {
        if (AppState.viewer) {
            AppState.viewer.camera.setView({
                destination: Cesium.Cartesian3.fromDegrees(0.0, 0.0, 25000000),
                orientation: {
                    heading: 0.0,
                    pitch: -Cesium.Math.PI_OVER_TWO,
                    roll: 0.0
                }
            });
        }
    },

    toggleDayNight() {
        if (AppState.viewer) {
            AppState.enableDayNight = !AppState.enableDayNight;
            AppState.viewer.scene.globe.enableLighting = AppState.enableDayNight;
            document.getElementById('toggleDayNightBtn').textContent = 
                AppState.enableDayNight ? 'Day/Night' : 'Static';
        }
    }
};

// Satellite Data Management
const SatelliteManager = {
    async loadSatelliteData() {
        try {
            updateLoadingStatus('Fetching satellite data...');
            updateStatus('data', 'active', 'Fetching');

            const response = await fetch(`${CONFIG.API_BASE}/api/satellites/live`, {
                headers: SessionManager.getHeaders(),
                timeout: 30000
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Data fetch failed: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Unknown error');
            }

            console.log(`Loaded ${data.count} satellites from ${data.sources.successful} sources`);

            // Process and store satellite data
            AppState.satellites.clear();
            data.satellites.forEach(sat => {
                // Validate TLE data
                if (sat.TLE_LINE1 && sat.TLE_LINE2 && sat.NORAD_CAT_ID) {
                    try {
                        const satrec = satellite.twoline2satrec(sat.TLE_LINE1, sat.TLE_LINE2);
                        if (satrec.error === 0) {
                            AppState.satellites.set(sat.NORAD_CAT_ID, {
                                ...sat,
                                satrec: satrec,
                                lastCalculated: null,
                                position: null
                            });
                        }
                    } catch (e) {
                        console.warn(`Invalid TLE for satellite ${sat.NORAD_CAT_ID}:`, e);
                    }
                }
            });

            AppState.lastDataUpdate = new Date();
            updateStatus('data', 'active', 'Connected');
            updateLastUpdateTime();

            // Render satellites if Cesium is ready
            if (AppState.viewer) {
                this.renderSatellites();
            }

            Utils.showMessage(`Loaded ${AppState.satellites.size} satellites`, 'success');

        } catch (error) {
            console.error('Satellite data loading failed:', error);
            updateStatus('data', 'error', 'Failed');
            Utils.showMessage(`Failed to load satellite data: ${error.message}`, 'error');
            AppState.errorCount++;
        }
    },

    renderSatellites() {
        if (!AppState.viewer || !AppState.systemReady) return;

        updateLoadingStatus('Rendering satellites...');

        // Clear existing entities
        AppState.entities.forEach(entity => {
            AppState.viewer.entities.remove(entity);
        });
        AppState.entities.clear();

        let rendered = 0;
        const maxRender = Math.min(AppState.satellites.size, CONFIG.MAX_SATELLITES_RENDER);
        const currentTime = new Date();

        for (const [noradId, satData] of AppState.satellites) {
            if (rendered >= maxRender) break;

            // Apply filters
            if (!this.passesFilter(satData)) continue;

            try {
                // Calculate current position
                const positionAndVelocity = satellite.propagate(satData.satrec, currentTime);
                
                if (!positionAndVelocity.position) continue;

                const gmst = satellite.gstime(currentTime);
                const position = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                
                // Store calculated position
                satData.position = {
                    latitude: satellite.degreesLat(position.latitude),
                    longitude: satellite.degreesLong(position.longitude),
                    altitude: position.height
                };
                satData.lastCalculated = currentTime;

                // Create entity
                const entity = AppState.viewer.entities.add({
                    id: `sat_${noradId}`,
                    position: Cesium.Cartesian3.fromDegrees(
                        satData.position.longitude,
                        satData.position.latitude,
                        satData.position.altitude * 1000 // Convert km to meters
                    ),
                    point: {
                        pixelSize: this.getSatelliteSize(satData),
                        color: this.getSatelliteColor(satData),
                        outlineColor: Cesium.Color.WHITE,
                        outlineWidth: 1,
                        heightReference: Cesium.HeightReference.NONE,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    },
                    label: AppState.showLabels ? {
                        text: satData.OBJECT_NAME || `NORAD ${noradId}`,
                        font: '10pt sans-serif',
                        pixelOffset: new Cesium.Cartesian2(0, -30),
                        fillColor: Cesium.Color.WHITE,
                        outlineColor: Cesium.Color.BLACK,
                        outlineWidth: 2,
                        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                        scale: 0.8,
                        disableDepthTestDistance: Number.POSITIVE_INFINITY
                    } : undefined,
                    satellite: satData // Store reference for click handling
                });

                // Add orbit path if enabled
                if (AppState.showOrbits) {
                    this.addOrbitPath(entity, satData);
                }

                AppState.entities.set(noradId, entity);
                rendered++;

            } catch (error) {
                console.warn(`Failed to render satellite ${noradId}:`, error);
            }
        }

        updateSatelliteCount(rendered);
        updateLoadingStatus(null);
        console.log(`Rendered ${rendered} satellites`);
    },

    getSatelliteSize(satData) {
        // Size based on satellite type and importance
        const name = satData.OBJECT_NAME?.toUpperCase() || '';
        if (name.includes('STARLINK')) return 3;
        if (name.includes('GPS') || name.includes('GALILEO') || name.includes('GLONASS')) return 5;
        if (name.includes('ISS') || name.includes('SPACE STATION')) return 8;
        return 4;
    },

    getSatelliteColor(satData) {
        // Color coding based on satellite type
        const name = satData.OBJECT_NAME?.toUpperCase() || '';
        if (name.includes('STARLINK')) return Cesium.Color.CYAN;
        if (name.includes('GPS') || name.includes('GALILEO') || name.includes('GLONASS')) return Cesium.Color.YELLOW;
        if (name.includes('ISS') || name.includes('SPACE STATION')) return Cesium.Color.RED;
        if (name.includes('WEATHER') || name.includes('NOAA')) return Cesium.Color.GREEN;
        if (name.includes('MILITARY') || name.includes('DEFENSE')) return Cesium.Color.ORANGE;
        return Cesium.Color.WHITE;
    },

    addOrbitPath(entity, satData) {
        try {
            const positions = [];
            const startTime = new Date();
            const timeStep = CONFIG.ORBIT_PROPAGATION_MINUTES * 60 * 1000 / CONFIG.ORBIT_SAMPLE_POINTS;

            for (let i = 0; i < CONFIG.ORBIT_SAMPLE_POINTS; i++) {
                const time = new Date(startTime.getTime() + (i * timeStep));
                const positionAndVelocity = satellite.propagate(satData.satrec, time);
                
                if (positionAndVelocity.position) {
                    const gmst = satellite.gstime(time);
                    const position = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                    
                    positions.push(Cesium.Cartesian3.fromDegrees(
                        satellite.degreesLong(position.longitude),
                        satellite.degreesLat(position.latitude),
                        position.height * 1000
                    ));
                }
            }

            if (positions.length > 10) {
                entity.polyline = {
                    positions: positions,
                    width: 1,
                    material: entity.point.color.getValue().withAlpha(0.6),
                    clampToGround: false
                };
            }

        } catch (error) {
            console.warn('Failed to generate orbit path:', error);
        }
    },

    passesFilter(satData) {
        const name = satData.OBJECT_NAME?.toUpperCase() || '';
        
        switch (AppState.currentFilter) {
            case 'active':
                return satData.OBJECT_TYPE !== 'DEBRIS';
            case 'starlink':
                return name.includes('STARLINK');
            case 'gps':
                return name.includes('GPS') || name.includes('GALILEO') || name.includes('GLONASS') || name.includes('BEIDOU');
            default:
                return true;
        }
    },

    async selectSatellite(noradId) {
        const satData = AppState.satellites.get(noradId);
        if (!satData) return;

        AppState.selectedSatellite = noradId;

        try {
            // Update info panel with basic data first
            this.updateInfoPanel(satData);

            // Center view on satellite
            if (satData.position && AppState.viewer) {
                AppState.viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(
                        satData.position.longitude,
                        satData.position.latitude,
                        satData.position.altitude * 1000 + 1000000 // 1000km above satellite
                    ),
                    duration: 2.0
                });
            }

            // Try to fetch detailed information
            const response = await fetch(`${CONFIG.API_BASE}/api/satellite/${noradId}/details`, {
                headers: SessionManager.getHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    this.updateInfoPanel(satData, data.satellite);
                }
            }

        } catch (error) {
            console.error('Failed to load satellite details:', error);
        }
    },

    updateInfoPanel(satData, detailInfo = {}) {
        const panel = document.getElementById('satelliteInfo');
        if (!panel) return;
        
        const html = `
            <div class="info-row">
                <span class="info-label">Name:</span>
                <span class="info-value">${satData.OBJECT_NAME || 'Unknown'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">NORAD ID:</span>
                <span class="info-value">${satData.NORAD_CAT_ID}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Owner:</span>
                <span class="info-value">${detailInfo.COUNTRY || satData.COUNTRY || 'Unknown'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Launch Date:</span>
                <span class="info-value">${detailInfo.LAUNCH ? new Date(detailInfo.LAUNCH).toLocaleDateString() : 'Unknown'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Object Type:</span>
                <span class="info-value">${detailInfo.OBJECT_TYPE || satData.OBJECT_TYPE || 'Unknown'}</span>
            </div>
            ${satData.position ? `
            <div class="info-row">
                <span class="info-label">Latitude:</span>
                <span class="info-value">${Utils.formatNumber(satData.position.latitude)}°</span>
            </div>
            <div class="info-row">
                <span class="info-label">Longitude:</span>
                <span class="info-value">${Utils.formatNumber(satData.position.longitude)}°</span>
            </div>
            <div class="info-row">
                <span class="info-label">Altitude:</span>
                <span class="info-value">${Utils.formatNumber(satData.position.altitude)} km</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="info-label">Epoch:</span>
                <span class="info-value">${Utils.formatDate(satData.EPOCH)}</span>
            </div>
        `;
        
        panel.innerHTML = html;
    },

    toggleOrbits() {
        AppState.showOrbits = !AppState.showOrbits;
        const btn = document.getElementById('toggleOrbitsBtn');
        if (btn) btn.classList.toggle('active', AppState.showOrbits);
        this.renderSatellites();
    },

    toggleLabels() {
        AppState.showLabels = !AppState.showLabels;
        const btn = document.getElementById('toggleLabelsBtn');
        if (btn) btn.classList.toggle('active', AppState.showLabels);
        this.renderSatellites();
    },

    setFilter(filter) {
        AppState.currentFilter = filter;
        
        // Update button states
        document.querySelectorAll('[id$="Btn"]').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById(`show${filter.charAt(0).toUpperCase() + filter.slice(1)}Btn`);
        if (activeBtn) activeBtn.classList.add('active');
        
        this.renderSatellites();
    }
};

// Search functionality
const SearchManager = {
    initialize() {
        const searchInput = document.getElementById('satelliteSearch');
        const resultsContainer = document.getElementById('searchResults');

        if (!searchInput || !resultsContainer) return;

        searchInput.addEventListener('input', Utils.debounce((e) => {
            this.performSearch(e.target.value.trim());
        }, CONFIG.SEARCH_DEBOUNCE_MS));

        searchInput.addEventListener('focus', () => {
            if (AppState.searchResults.length > 0) {
                resultsContainer.style.display = 'block';
            }
        });

        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !resultsContainer.contains(e.target)) {
                resultsContainer.style.display = 'none';
            }
        });
    },

    performSearch(query) {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        
        if (query.length < 2) {
            resultsContainer.style.display = 'none';
            return;
        }

        AppState.searchResults = [];
        const queryLower = query.toLowerCase();

        // Search through satellites
        for (const [noradId, satData] of AppState.satellites) {
            const name = satData.OBJECT_NAME?.toLowerCase() || '';
            const id = noradId.toString();
            
            if (name.includes(queryLower) || id.includes(queryLower)) {
                AppState.searchResults.push({
                    noradId: noradId,
                    name: satData.OBJECT_NAME || `NORAD ${noradId}`,
                    country: satData.COUNTRY || 'Unknown'
                });
                
                if (AppState.searchResults.length >= 10) break; // Limit results
            }
        }

        this.displaySearchResults();
    },

    displaySearchResults() {
        const resultsContainer = document.getElementById('searchResults');
        if (!resultsContainer) return;
        
        if (AppState.searchResults.length === 0) {
            resultsContainer.style.display = 'none';
            return;
        }

        const html = AppState.searchResults.map(result => `
            <div class="search-result" onclick="SearchManager.selectResult('${result.noradId}')">
                <div style="font-weight: 500;">${result.name}</div>
                <div style="font-size: 10px; color: #888;">NORAD ${result.noradId} • ${result.country}</div>
            </div>
        `).join('');

        resultsContainer.innerHTML = html;
        resultsContainer.style.display = 'block';
    },

    selectResult(noradId) {
        SatelliteManager.selectSatellite(noradId);
        const resultsContainer = document.getElementById('searchResults');
        const searchInput = document.getElementById('satelliteSearch');
        
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (searchInput) searchInput.value = '';
    }
};

// Performance monitoring
const PerformanceMonitor = {
    initialize() {
        setInterval(() => {
            this.updateFPS();
        }, CONFIG.PERFORMANCE_MONITOR_INTERVAL);
    },

    updateFPS() {
        const now = performance.now();
        AppState.frameCount++;
        
        if (now >= AppState.lastFrameTime + 1000) {
            AppState.fps = Math.round((AppState.frameCount * 1000) / (now - AppState.lastFrameTime));
            AppState.frameCount = 0;
            AppState.lastFrameTime = now;
            
            const fpsCounter = document.getElementById('fpsCounter');
            if (fpsCounter) fpsCounter.textContent = AppState.fps;
        }
    }
};

// UI Helper Functions
function updateLoadingStatus(message) {
    const overlay = document.getElementById('loadingOverlay');
    const statusText = document.getElementById('loadingStatus');
    
    if (!overlay || !statusText) return;
    
    if (message) {
        statusText.textContent = message;
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }
}

function updateStatus(service, status, text) {
    const indicator = document.getElementById(`${service}Status`);
    const statusText = document.getElementById(`${service}StatusText`);
    
    if (indicator) {
        indicator.className = `status-indicator ${status === 'error' ? 'status-error' : ''}`;
    }
    
    if (statusText) {
        statusText.textContent = text;
    }
}

function updateSatelliteCount(count) {
    const satCount = document.getElementById('satCount');
    if (satCount) satCount.textContent = count;
}

function updateLastUpdateTime() {
    const lastUpdateText = document.getElementById('lastUpdateText');
    if (AppState.lastDataUpdate && lastUpdateText) {
        lastUpdateText.textContent = Utils.formatDate(AppState.lastDataUpdate);
    }
}

// Event Handlers
function setupEventHandlers() {
    // View controls
    const resetViewBtn = document.getElementById('resetViewBtn');
    const toggleOrbitsBtn = document.getElementById('toggleOrbitsBtn');
    const toggleLabelsBtn = document.getElementById('toggleLabelsBtn');
    const toggleDayNightBtn = document.getElementById('toggleDayNightBtn');

    if (resetViewBtn) resetViewBtn.addEventListener('click', CesiumManager.resetView);
    if (toggleOrbitsBtn) toggleOrbitsBtn.addEventListener('click', SatelliteManager.toggleOrbits);
    if (toggleLabelsBtn) toggleLabelsBtn.addEventListener('click', SatelliteManager.toggleLabels);
    if (toggleDayNightBtn) toggleDayNightBtn.addEventListener('click', CesiumManager.toggleDayNight);

    // Filter controls
    const showAllBtn = document.getElementById('showAllBtn');
    const showActiveBtn = document.getElementById('showActiveBtn');
    const showStarlinkBtn = document.getElementById('showStarlinkBtn');
    const showGPSBtn = document.getElementById('showGPSBtn');

    if (showAllBtn) showAllBtn.addEventListener('click', () => SatelliteManager.setFilter('all'));
    if (showActiveBtn) showActiveBtn.addEventListener('click', () => SatelliteManager.setFilter('active'));
    if (showStarlinkBtn) showStarlinkBtn.addEventListener('click', () => SatelliteManager.setFilter('starlink'));
    if (showGPSBtn) showGPSBtn.addEventListener('click', () => SatelliteManager.setFilter('gps'));
}

// Application Initialization
async function initializeApplication() {
    try {
        console.log('Starting Mission Control Enterprise...');
        updateLoadingStatus('Initializing Mission Control...');
        
        // Initialize session management
        updateLoadingStatus('Establishing secure connection...');
        await SessionManager.initialize();
        
        // Initialize Cesium
        updateLoadingStatus('Initializing 3D visualization...');
        await CesiumManager.initialize();
        
        // Load satellite data
        updateLoadingStatus('Loading satellite data...');
        await SatelliteManager.loadSatelliteData();
        
        // Initialize UI components
        SearchManager.initialize();
        PerformanceMonitor.initialize();
        setupEventHandlers();
        
        // Mark system as ready
        AppState.systemReady = true;
        AppState.connectionStatus = 'connected';
        
        // Setup auto-refresh
        setInterval(() => {
            if (AppState.systemReady) {
                SatelliteManager.loadSatelliteData();
            }
        }, CONFIG.UPDATE_INTERVAL);
        
        updateLoadingStatus(null);
        console.log('Mission Control Enterprise initialized successfully');
        Utils.showMessage('Mission Control Enterprise ready', 'success');
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        
        const errorMessage = error.message || 'Unknown error occurred';
        updateLoadingStatus(`Initialization failed: ${errorMessage}`);
        Utils.showMessage(`Initialization failed: ${errorMessage}`, 'error');
        
        // Show diagnostic information
        console.log('=== DIAGNOSTIC INFORMATION ===');
        console.log('Session state:', AppState.session);
        console.log('Retry attempts:', AppState.retryAttempts);
        console.log('Current URL:', window.location.href);
        console.log('User agent:', navigator.userAgent);
        console.log('==============================');
    }
}

// Start the application
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing application...');
    
    // Check for required elements
    const requiredElements = ['cesiumContainer', 'loadingOverlay', 'loadingStatus'];
    const missingElements = requiredElements.filter(id => !document.getElementById(id));
    
    if (missingElements.length > 0) {
        console.error('Missing required DOM elements:', missingElements);
        return;
    }
    
    initializeApplication();
});

// Handle page visibility changes for performance
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Tab hidden, pausing updates');
    } else {
        console.log('Tab visible, resuming updates');
        if (AppState.systemReady) {
            SatelliteManager.renderSatellites();
        }
    }
});

// Handle errors globally
window.addEventListener('error', (event) => {
    console.error('Global error:', event.error);
    AppState.errorCount++;
    Utils.showMessage('System error occurred', 'error');
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    AppState.errorCount++;
    Utils.showMessage('Network error occurred', 'error');
});

// Export for debugging (development only)
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    window.MissionControl = {
        AppState,
        Utils,
        SessionManager,
        CesiumManager,
        SatelliteManager,
        SearchManager
    };
}
