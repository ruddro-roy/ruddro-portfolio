// ===== STARLINK SATELLITE TRACKER - ROBUST VERSION =====
// Fixed Cesium rendering issues and enhanced real-time tracking

class StarlinkTracker {
  constructor() {
    this.config = {
      TLE_URL: '/api/tle',
      UPDATE_INTERVAL: 1000,
      MAX_RETRY_ATTEMPTS: 3,
      RETRY_DELAY: 5000,
      CESIUM_ION_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1NGNhZi0zNDRiLTRkYjMtOGM5Yy1hYzllNGZjZGJmNjQiLCJpZCI6MjU5MDYsImlhdCI6MTcwNDE5OTM5M30.bGU0nRDVKLo8oJLk2jOH4oU7SFPdVxe8YAk9hRSKdAY' // Cesium World Terrain
    };
    
    this.state = {
      satellites: [],
      satByName: {},
      selectedSat: null,
      userLocation: null,
      isConnected: false,
      lastUpdate: null,
      updateInterval: null,
      retryCount: 0,
      cesiumInitialized: false
    };
    
    this.ui = {
      viewer: null,
      entities: {
        coverage: null,
        selectedPath: null,
        userMarker: null,
        selectedMarker: null
      },
      colors: {
        default: Cesium.Color.fromCssColorString('#FFD700'), // Gold
        visible: Cesium.Color.fromCssColorString('#00FF7F'), // Spring Green
        selected: Cesium.Color.fromCssColorString('#FF4500'), // Red Orange
        user: Cesium.Color.fromCssColorString('#00BFFF') // Deep Sky Blue
      }
    };
    
    this.settings = {
      showOrbits: true,
      showCoverage: true,
      enableSounds: false,
      updateInterval: 1
    };
    
    this.init();
  }
  
  // ===== ROBUST INITIALIZATION =====
  async init() {
    try {
      this.showLoading(0);
      console.log('🚀 Initializing Starlink Tracker...');
      
      await this.initializeCesium();
      this.showLoading(25);
      
      await this.loadSettings();
      this.showLoading(50);
      
      await this.fetchTLEData();
      this.showLoading(75);
      
      this.setupEventListeners();
      this.setupGeolocation();
      this.showLoading(100);
      
      setTimeout(() => {
        this.hideLoading();
        this.startRealTimeUpdates();
        this.showNotification('🛰️ Starlink Tracker initialized successfully!', 'success');
      }, 1000);
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.handleCriticalError(error);
    }
  }
  
  async initializeCesium() {
    try {
      console.log('🌍 Initializing Cesium...');
      
      // Set Ion token for better terrain and imagery
      if (this.config.CESIUM_ION_TOKEN) {
        Cesium.Ion.defaultAccessToken = this.config.CESIUM_ION_TOKEN;
      }
      
      // Check WebGL support
      if (!this.checkWebGLSupport()) {
        throw new Error('WebGL not supported. Please enable WebGL in your browser.');
      }
      
      const cesiumContainer = document.getElementById('cesiumContainer');
      if (!cesiumContainer) {
        throw new Error('Cesium container not found');
      }
      
      // Initialize viewer with robust settings
      this.ui.viewer = new Cesium.Viewer('cesiumContainer', {
        // Use Cesium Ion imagery for better quality
        imageryProvider: new Cesium.IonImageryProvider({ assetId: 3 }),
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
        selectionIndicator: false,
        shadows: false,
        terrainShadows: Cesium.ShadowMode.DISABLED,
        requestRenderMode: false, // Continuous rendering for real-time updates
        maximumRenderTimeChange: Infinity
      });
      
      // Configure scene for better performance and visuals
      const scene = this.ui.viewer.scene;
      scene.globe.enableLighting = true;
      scene.globe.dynamicAtmosphereLighting = true;
      scene.globe.atmosphereHueShift = 0.2;
      scene.globe.atmosphereSaturationShift = 0.1;
      scene.globe.atmosphereBrightnessShift = 0.1;
      
      // Set high-quality rendering options
      scene.postProcessStages.fxaa.enabled = true;
      scene.globe.tileCacheSize = 1000;
      
      // Set initial camera position for better view
      this.ui.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-75.0, 40.0, 15000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-30),
          roll: 0
        }
      });
      
      // Handle Cesium errors
      this.ui.viewer.cesiumWidget.creditContainer.style.display = 'none';
      this.ui.viewer.scene.renderError.addEventListener((scene, error) => {
        console.error('🔥 Cesium render error:', error);
        this.handleRenderError(error);
      });
      
      this.state.cesiumInitialized = true;
      console.log('✅ Cesium initialized successfully');
      
    } catch (error) {
      console.error('❌ Cesium initialization failed:', error);
      throw new Error(`Cesium initialization failed: ${error.message}`);
    }
  }
  
  checkWebGLSupport() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      return !!gl;
    } catch (e) {
      return false;
    }
  }
  
  handleRenderError(error) {
    console.error('🔥 Rendering error:', error);
    this.showNotification('Rendering error detected. Attempting to recover...', 'error');
    
    // Attempt to recover
    setTimeout(() => {
      try {
        if (this.ui.viewer && this.ui.viewer.scene) {
          this.ui.viewer.scene.requestRender();
        }
      } catch (e) {
        console.error('Failed to recover from render error:', e);
      }
    }, 1000);
  }
  
  handleCriticalError(error) {
    this.hideLoading();
    const errorMessage = `Critical Error: ${error.message}`;
    this.showNotification(errorMessage, 'error', 10000);
    
    // Show fallback UI
    document.getElementById('app').innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: white; font-family: Arial;">
        <div style="text-align: center; max-width: 600px; padding: 40px;">
          <h1>🛰️ Starlink Tracker</h1>
          <div style="background: #e74c3c; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2>Initialization Failed</h2>
            <p>${errorMessage}</p>
          </div>
          <div style="background: #3498db; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Possible Solutions:</h3>
            <ul style="text-align: left;">
              <li>Enable WebGL in your browser</li>
              <li>Update your graphics drivers</li>
              <li>Try a different browser (Chrome recommended)</li>
              <li>Disable browser extensions</li>
              <li>Check if hardware acceleration is enabled</li>
            </ul>
          </div>
          <button onclick="location.reload()" style="background: #4f86f7; color: white; border: none; padding: 15px 30px; border-radius: 5px; cursor: pointer; font-size: 16px;">
            🔄 Retry
          </button>
        </div>
      </div>
    `;
  }
  
  // ===== ENHANCED DATA FETCHING =====
  async fetchTLEData() {
    try {
      this.updateConnectionStatus('connecting');
      console.log('📡 Fetching TLE data...');
      
      const response = await fetch(this.config.TLE_URL, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
          'Cache-Control': 'no-cache'
        },
        timeout: 15000
      });
      
      if (!response.ok) {
        throw new Error(`TLE fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const tleText = await response.text();
      console.log(`📊 TLE data received: ${tleText.length} bytes`);
      
      await this.parseTLEData(tleText);
      
      this.updateConnectionStatus('connected');
      this.state.lastUpdate = new Date();
      this.state.retryCount = 0;
      this.updateUI();
      
    } catch (error) {
      console.error('❌ TLE fetch error:', error);
      this.updateConnectionStatus('error');
      
      if (this.state.retryCount < this.config.MAX_RETRY_ATTEMPTS) {
        this.state.retryCount++;
        this.showNotification(`Connection failed. Retrying... (${this.state.retryCount}/${this.config.MAX_RETRY_ATTEMPTS})`, 'warning');
        setTimeout(() => this.fetchTLEData(), this.config.RETRY_DELAY);
      } else {
        this.showNotification('Failed to fetch satellite data. Please refresh the page.', 'error');
      }
    }
  }
  
  async parseTLEData(tleText) {
    const lines = tleText.split(/[\r\n]+/);
    this.state.satellites = [];
    this.state.satByName = {};
    
    let validCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < lines.length; ) {
      const name = lines[i++]?.trim();
      const line1 = lines[i++]?.trim();
      const line2 = lines[i++]?.trim();
      
      if (!name || !line1 || !line2) break;
      
      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        if (satrec.error) {
          errorCount++;
          console.warn(`⚠️ Skipping invalid TLE for ${name} (error: ${satrec.error})`);
          continue;
        }
        
        const satData = {
          name,
          line1,
          line2,
          satrec,
          lat: 0,
          lon: 0,
          alt: 0,
          velocity: 0,
          isVisible: false,
          entity: null,
          lastUpdate: Date.now()
        };
        
        this.state.satellites.push(satData);
        this.state.satByName[name] = satData;
        validCount++;
      } catch (err) {
        errorCount++;
        console.error(`❌ TLE parse error for ${name}:`, err);
      }
    }
    
    if (validCount === 0) {
      throw new Error('No valid satellites loaded from TLE data');
    }
    
    console.log(`✅ Loaded ${validCount} satellites (${errorCount} errors)`);
    
    this.populateSearchDatalist();
    this.createSatelliteEntities();
  }
  
  // ===== ENHANCED SATELLITE ENTITIES =====
  createSatelliteEntities() {
    if (!this.ui.viewer) return;
    
    console.log('🛰️ Creating satellite entities...');
    
    this.state.satellites.forEach((sat, index) => {
      try {
        const entity = this.ui.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 400000), // Initial position
          point: {
            pixelSize: 4,
            color: this.ui.colors.default,
            outlineColor: Cesium.Color.BLACK,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1000000, 1.0, 10000000, 0.5)
          },
          id: sat.name,
          name: sat.name,
          description: `Starlink satellite: ${sat.name}`
        });
        
        sat.entity = entity;
        
        // Add progress feedback
        if (index % 1000 === 0) {
          console.log(`📡 Created ${index}/${this.state.satellites.length} entities`);
        }
        
      } catch (error) {
        console.error(`❌ Failed to create entity for ${sat.name}:`, error);
      }
    });
    
    console.log(`✅ Created ${this.state.satellites.length} satellite entities`);
  }
  
  // ===== REAL-TIME UPDATES WITH PERFORMANCE OPTIMIZATION =====
  startRealTimeUpdates() {
    if (this.state.updateInterval) {
      clearInterval(this.state.updateInterval);
    }
    
    console.log('⏰ Starting real-time updates...');
    this.updateSatellitePositions();
    
    this.state.updateInterval = setInterval(() => {
      try {
        this.updateSatellitePositions();
        
        if (this.state.userLocation) {
          this.updateVisibilityForAll();
        }
        
        // Refresh TLE data every 30 minutes
        if (this.state.lastUpdate && Date.now() - this.state.lastUpdate.getTime() > 30 * 60 * 1000) {
          console.log('🔄 Refreshing TLE data...');
          this.fetchTLEData();
        }
        
      } catch (error) {
        console.error('❌ Update cycle error:', error);
      }
    }, this.config.UPDATE_INTERVAL);
  }
  
  updateSatellitePositions() {
    const now = new Date();
    const gmst = satellite.gstime(now);
    let updateCount = 0;
    let errorCount = 0;
    
    this.state.satellites.forEach(sat => {
      try {
        const propagation = satellite.propagate(sat.satrec, now);
        const posEci = propagation.position;
        const velEci = propagation.velocity;
        
        if (!posEci) return;
        
        const positionGd = satellite.eciToGeodetic(posEci, gmst);
        const lat = Cesium.Math.toDegrees(positionGd.latitude);
        const lon = Cesium.Math.toDegrees(positionGd.longitude);
        const altKm = positionGd.height;
        
        // Calculate velocity magnitude
        let velocity = 0;
        if (velEci) {
          velocity = Math.sqrt(velEci.x*velEci.x + velEci.y*velEci.y + velEci.z*velEci.z);
        }
        
        sat.lat = lat;
        sat.lon = lon;
        sat.alt = altKm;
        sat.velocity = velocity;
        sat.lastUpdate = Date.now();
        
        // Update Cesium entity position
        const newPos = Cesium.Cartesian3.fromRadians(
          positionGd.longitude, 
          positionGd.latitude, 
          altKm * 1000
        );
        sat.entity.position = newPos;
        
        updateCount++;
        
        // Update selected satellite visuals
        if (sat === this.state.selectedSat) {
          this.updateSelectedSatellite();
        }
        
      } catch (error) {
        errorCount++;
        if (errorCount < 5) { // Limit error logging
          console.warn(`⚠️ Position update failed for ${sat.name}:`, error);
        }
      }
    });
    
    this.updateLastUpdateTime();
    
    // Log performance stats occasionally
    if (Date.now() % 10000 < this.config.UPDATE_INTERVAL) {
      console.log(`📊 Updated ${updateCount}/${this.state.satellites.length} satellites (${errorCount} errors)`);
    }
  }
  
  updateSelectedSatellite() {
    const sat = this.state.selectedSat;
    if (!sat) return;
    
    this.updateSelectedInfo();
    
    if (this.ui.entities.coverage && this.settings.showCoverage) {
      this.ui.entities.coverage.position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, 0);
      this.updateCoverageRadius(sat.alt);
    }
    
    if (this.ui.entities.selectedMarker) {
      this.ui.entities.selectedMarker.position = Cesium.Cartesian3.fromDegrees(
        sat.lon, sat.lat, sat.alt * 1000
      );
    }
  }
  
  // ===== ENHANCED VISIBILITY CALCULATIONS =====
  updateVisibilityForAll() {
    if (!this.state.userLocation) return;
    
    const R = 6371.0;
    const userLatRad = Cesium.Math.toRadians(this.state.userLocation.lat);
    const userLonRad = Cesium.Math.toRadians(this.state.userLocation.lon);
    
    let visibleCount = 0;
    let overheadSat = null;
    let maxElevation = -90;
    
    this.state.satellites.forEach(sat => {
      const satLatRad = Cesium.Math.toRadians(sat.lat);
      const satLonRad = Cesium.Math.toRadians(sat.lon);
      const dLon = satLonRad - userLonRad;
      
      const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) +
                      Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
      const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
      
      const phi = Math.acos(R / (R + sat.alt));
      const isVisible = centralAngle <= phi;
      
      sat.isVisible = isVisible;
      
      if (isVisible) {
        visibleCount++;
        
        // Calculate elevation for overhead detection
        const elevation = 90 - Cesium.Math.toDegrees(centralAngle);
        if (elevation > maxElevation) {
          maxElevation = elevation;
          overheadSat = sat;
        }
      }
      
      if (sat !== this.state.selectedSat) {
        sat.entity.point.color = isVisible ? this.ui.colors.visible : this.ui.colors.default;
      }
    });
    
    this.updateVisibleSatelliteCount(visibleCount);
    this.updateOverheadInfo(overheadSat);
  }
  
  updateOverheadInfo(overheadSat) {
    const panel = document.getElementById('overheadPanel');
    if (!panel) return;
    
    panel.innerHTML = '';
    panel.className = 'overhead-panel visible';
    
    if (overheadSat) {
      panel.innerHTML = `
        <p><strong>🛰️ Overhead:</strong> ${overheadSat.name}</p>
        <p><strong>📏 Altitude:</strong> ${overheadSat.alt.toFixed(1)} km</p>
        <p><strong>⚡ Velocity:</strong> ${overheadSat.velocity.toFixed(2)} km/s</p>
      `;
    } else {
      panel.innerHTML = '<p>🌌 No satellite overhead currently</p>';
    }
  }
  
  // ===== ENHANCED SATELLITE SELECTION =====
  selectSatellite(satData) {
    if (!satData || satData === this.state.selectedSat) return;
    
    console.log(`🎯 Selecting satellite: ${satData.name}`);
    
    this.clearSelection();
    this.state.selectedSat = satData;
    
    // Enhanced highlighting
    satData.entity.point.color = this.ui.colors.selected;
    satData.entity.point.pixelSize = 8;
    satData.entity.point.outlineWidth = 2;
    satData.entity.point.outlineColor = Cesium.Color.WHITE;
    
    // Add enhanced marker
    this.ui.entities.selectedMarker = this.ui.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(satData.lon, satData.lat, satData.alt * 1000),
      billboard: {
        image: this.createCrosshairIcon(),
        width: 40,
        height: 40,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        scale: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      },
      label: {
        text: satData.name,
        font: '14pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -50),
        fillColor: Cesium.Color.WHITE,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE
      }
    });
    
    // Smooth camera transition
    this.ui.viewer.flyTo(satData.entity, {
      duration: 2.0,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-60), satData.alt * 1000 * 3)
    });
    
    this.showSatelliteInfo(satData);
    
    if (this.settings.showCoverage) {
      this.showCoverage(satData);
    }
    
    if (this.settings.showOrbits) {
      this.showOrbitalPath(satData);
    }
    
    // Auto-show sidebar on mobile
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar').classList.add('show');
    }
    
    this.showNotification(`🎯 Selected: ${satData.name}`, 'success');
  }
  
  clearSelection() {
    if (this.state.selectedSat) {
      const sat = this.state.selectedSat;
      sat.entity.point.color = (sat.isVisible && this.state.userLocation) ? 
        this.ui.colors.visible : this.ui.colors.default;
      sat.entity.point.pixelSize = 4;
      sat.entity.point.outlineWidth = 1;
      sat.entity.point.outlineColor = Cesium.Color.BLACK;
    }
    
    ['selectedMarker', 'coverage', 'selectedPath'].forEach(key => {
      if (this.ui.entities[key]) {
        this.ui.viewer.entities.remove(this.ui.entities[key]);
        this.ui.entities[key] = null;
      }
    });
    
    this.state.selectedSat = null;
    this.showDefaultInfo();
  }
  
  // ===== ENHANCED UI UPDATES =====
  showSatelliteInfo(sat) {
    const panel = document.getElementById('infoPanel');
    if (!panel) return;
    
    panel.innerHTML = '';
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'satellite-info';
    
    // Header with clear button
    const header = document.createElement('div');
    header.className = 'info-header';
    header.innerHTML = `
      <h3>📡 ${sat.name}</h3>
      <button class="btn-clear" id="clearSelectionBtn" title="Clear Selection">✕</button>
    `;
    infoDiv.appendChild(header);
    
    // Real-time position data
    const posSection = document.createElement('div');
    posSection.className = 'info-section';
    posSection.innerHTML = `
      <h4>📍 Real-time Position</h4>
      <div class="info-row">
        <span class="info-label">Latitude:</span>
        <span class="info-value" id="infoLat">${sat.lat.toFixed(6)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Longitude:</span>
        <span class="info-value" id="infoLon">${sat.lon.toFixed(6)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Altitude:</span>
        <span class="info-value" id="infoAlt">${sat.alt.toFixed(2)} km</span>
      </div>
      <div class="info-row">
        <span class="info-label">Velocity:</span>
        <span class="info-value" id="infoVel">${sat.velocity.toFixed(3)} km/s</span>
      </div>
      <div class="info-row">
        <span class="info-label">Visibility:</span>
        <span class="info-value visibility-${sat.isVisible ? 'visible' : 'hidden'}" id="infoVis">
          ${sat.isVisible ? '👁️ Visible' : '🌑 Hidden'}
        </span>
      </div>
    `;
    infoDiv.appendChild(posSection);
    
    // Orbital parameters
    const orbitalSection = document.createElement('div');
    orbitalSection.className = 'info-section';
    const incl = Cesium.Math.toDegrees(sat.satrec.inclo);
    const periodMin = 86400 / sat.satrec.no / 60;
    const ecc = sat.satrec.ecco;
    const raan = Cesium.Math.toDegrees(sat.satrec.nodeo);
    const argPerigee = Cesium.Math.toDegrees(sat.satrec.argpo);
    
    orbitalSection.innerHTML = `
      <h4>🛸 Orbital Elements</h4>
      <div class="info-row">
        <span class="info-label">Inclination:</span>
        <span class="info-value">${incl.toFixed(3)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Period:</span>
        <span class="info-value">${periodMin.toFixed(2)} min</span>
      </div>
      <div class="info-row">
        <span class="info-label">Eccentricity:</span>
        <span class="info-value">${ecc.toFixed(6)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">RAAN:</span>
        <span class="info-value">${raan.toFixed(2)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Arg. Perigee:</span>
        <span class="info-value">${argPerigee.toFixed(2)}°</span>
      </div>
    `;
    infoDiv.appendChild(orbitalSection);
    
    // TLE data section
    const tleSection = document.createElement('div');
    tleSection.className = 'info-section';
    tleSection.innerHTML = `
      <h4>📊 TLE Data</h4>
      <div class="tle-container">
        <pre class="tle-data">${sat.line1}\n${sat.line2}</pre>
      </div>
    `;
    infoDiv.appendChild(tleSection);
    
    panel.appendChild(infoDiv);
    
    // Add event listener for clear button
    document.getElementById('clearSelectionBtn').addEventListener('click', () => {
      this.clearSelection();
    });
  }
  
  showDefaultInfo() {
    const panel = document.getElementById('infoPanel');
    if (!panel) return;
    
    panel.innerHTML = `
      <div class="info-header">
        <h3>📡 Satellite Information</h3>
      </div>
      <div class="info-placeholder">
        <p>🎯 Click on a satellite or use search to see detailed real-time information</p>
        <div class="feature-list">
          <p>✨ <strong>Features available:</strong></p>
          <ul>
            <li>📍 Real-time position & velocity</li>
            <li>🛸 Complete orbital parameters</li>
            <li>👁️ Visibility calculations</li>
            <li>🌍 Ground coverage footprint</li>
            <li>🛤️ Orbital path visualization</li>
            <li>📊 Engineering TLE data</li>
          </ul>
        </div>
      </div>
    `;
  }
  
  updateSelectedInfo() {
    const sat = this.state.selectedSat;
    if (!sat) return;
    
    const elements = {
      lat: document.getElementById('infoLat'),
      lon: document.getElementById('infoLon'),
      alt: document.getElementById('infoAlt'),
      vel: document.getElementById('infoVel'),
      vis: document.getElementById('infoVis')
    };
    
    if (elements.lat) {
      elements.lat.textContent = `${sat.lat.toFixed(6)}°`;
      elements.lon.textContent = `${sat.lon.toFixed(6)}°`;
      elements.alt.textContent = `${sat.alt.toFixed(2)} km`;
      elements.vel.textContent = `${sat.velocity.toFixed(3)} km/s`;
      elements.vis.textContent = sat.isVisible ? '👁️ Visible' : '🌑 Hidden';
      elements.vis.className = `info-value visibility-${sat.isVisible ? 'visible' : 'hidden'}`;
    }
  }
  
  // ===== ENHANCED VISUAL ELEMENTS =====
  showCoverage(sat) {
    const R = 6371.0;
    const phi = Math.acos(R / (R + sat.alt));
    const radiusMeters = R * 1000 * phi;
    
    this.ui.entities.coverage = this.ui.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, 0),
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: Cesium.Color.CYAN.withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.CYAN.withAlpha(0.8),
        outlineWidth: 2,
        height: 0
      },
      label: {
        text: `Coverage: ${(radiusMeters/1000).toFixed(0)} km radius`,
        font: '12pt sans-serif',
        pixelOffset: new Cesium.Cartesian2(0, -20),
        fillColor: Cesium.Color.CYAN,
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.7)
      }
    });
  }
  
  updateCoverageRadius(altKm) {
    if (!this.ui.entities.coverage) return;
    const R = 6371.0;
    const phi = Math.acos(R / (R + altKm));
    const radiusMeters = R * 1000 * phi;
    this.ui.entities.coverage.ellipse.semiMajorAxis = radiusMeters;
    this.ui.entities.coverage.ellipse.semiMinorAxis = radiusMeters;
  }
  
  showOrbitalPath(sat) {
    const positions = [];
    const periodMin = 86400 / sat.satrec.no / 60;
    const steps = 150; // More detailed path
    const stepMs = (periodMin * 60000) / steps;
    const now = Date.now();
    
    for (let i = 0; i <= steps; i++) {
      const time = new Date(now + i * stepMs);
      const gmst = satellite.gstime(time);
      const prop = satellite.propagate(sat.satrec, time);
      
      if (prop.position) {
        const gd = satellite.eciToGeodetic(prop.position, gmst);
        const lon = Cesium.Math.toDegrees(gd.longitude);
        const lat = Cesium.Math.toDegrees(gd.latitude);
        const alt = gd.height * 1000;
        positions.push(Cesium.Cartesian3.fromDegrees(lon, lat, alt));
      }
    }
    
    if (positions.length > 1) {
      this.ui.entities.selectedPath = this.ui.viewer.entities.add({
        polyline: {
          positions: positions,
          width: 4,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.2,
            color: Cesium.Color.ORANGE.withAlpha(0.9)
          }),
          clampToGround: false
        }
      });
    }
  }
  
  // ===== UTILITY METHODS =====
  createCrosshairIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#FF4500" stroke-width="3"/>
        <line x1="16" y1="4" x2="16" y2="28" stroke="#FF4500" stroke-width="3"/>
        <line x1="4" y1="16" x2="28" y2="16" stroke="#FF4500" stroke-width="3"/>
        <circle cx="16" cy="16" r="2" fill="#FF4500"/>
      </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }
  
  populateSearchDatalist() {
    const dataList = document.getElementById('satList');
    if (!dataList) return;
    
    dataList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    this.state.satellites.forEach(sat => {
      const option = document.createElement('option');
      option.value = sat.name;
      fragment.appendChild(option);
    });
    
    dataList.appendChild(fragment);
  }
  
  getRandomSatellite() {
    const randomIndex = Math.floor(Math.random() * this.state.satellites.length);
    return this.state.satellites[randomIndex];
  }
  
  // ===== UI STATE MANAGEMENT =====
  showLoading(progress) {
    const loadingScreen = document.getElementById('loadingScreen');
    const progressBar = document.getElementById('loadingProgress');
    if (loadingScreen && progressBar) {
      loadingScreen.style.display = 'flex';
      progressBar.style.width = `${progress}%`;
    }
  }
  
  hideLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    const app = document.getElementById('app');
    if (loadingScreen && app) {
      loadingScreen.style.display = 'none';
      app.style.display = 'flex';
    }
  }
  
  updateConnectionStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');
    
    if (!indicator || !text) return;
    
    this.state.isConnected = status === 'connected';
    
    indicator.className = `status-indicator ${status}`;
    
    switch (status) {
      case 'connected':
        text.textContent = 'Connected';
        break;
      case 'connecting':
        text.textContent = 'Connecting...';
        break;
      case 'error':
        text.textContent = 'Connection Error';
        break;
    }
  }
  
  updateUI() {
    const totalSats = document.getElementById('totalSats');
    const tleTimestamp = document.getElementById('tleTimestamp');
    
    if (totalSats) totalSats.textContent = this.state.satellites.length;
    if (tleTimestamp) {
      tleTimestamp.textContent = this.state.lastUpdate ? 
        this.state.lastUpdate.toLocaleTimeString() : 'Never';
    }
  }
  
  updateLastUpdateTime() {
    const lastUpdate = document.getElementById('lastUpdate');
    if (lastUpdate) {
      lastUpdate.textContent = new Date().toLocaleTimeString();
    }
  }
  
  updateVisibleSatelliteCount(count) {
    const visibleSats = document.getElementById('visibleSats');
    if (visibleSats) {
      visibleSats.textContent = count;
    }
  }
  
  // ===== NOTIFICATIONS =====
  showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notifications');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${message}</span>
        <button class="notification-close">×</button>
      </div>
    `;
    
    container.appendChild(notification);
    
    // Auto remove
    const autoRemove = setTimeout(() => {
      this.removeNotification(notification);
    }, duration);
    
    // Manual close
    notification.querySelector('.notification-close').addEventListener('click', () => {
      clearTimeout(autoRemove);
      this.removeNotification(notification);
    });
  }
  
  removeNotification(notification) {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  }
  
  // ===== SETTINGS MANAGEMENT =====
  loadSettings() {
    try {
      const saved = localStorage.getItem('starlinkTrackerSettings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.warn('Failed to load settings:', error);
    }
    this.applySettings();
  }
  
  saveSettings() {
    try {
      localStorage.setItem('starlinkTrackerSettings', JSON.stringify(this.settings));
    } catch (error) {
      console.warn('Failed to save settings:', error);
    }
  }
  
  applySettings() {
    this.config.UPDATE_INTERVAL = this.settings.updateInterval * 1000;
    
    // Update UI controls
    const controls = {
      updateInterval: document.getElementById('updateInterval'),
      intervalValue: document.getElementById('intervalValue'),
      showOrbits: document.getElementById('showOrbits'),
      showCoverage: document.getElementById('showCoverage'),
      enableSounds: document.getElementById('enableSounds')
    };
    
    if (controls.updateInterval) {
      controls.updateInterval.value = this.settings.updateInterval;
      if (controls.intervalValue) {
        controls.intervalValue.textContent = `${this.settings.updateInterval}s`;
      }
    }
    
    if (controls.showOrbits) controls.showOrbits.checked = this.settings.showOrbits;
    if (controls.showCoverage) controls.showCoverage.checked = this.settings.showCoverage;
    if (controls.enableSounds) controls.enableSounds.checked = this.settings.enableSounds;
  }
  
  // ===== GEOLOCATION =====
  setupGeolocation() {
    if (!navigator.geolocation) {
      this.showNotification('🌐 Geolocation not supported by this browser', 'warning');
      return;
    }
    
    const options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    };
    
    navigator.geolocation.getCurrentPosition(
      position => {
        this.state.userLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        
        console.log(`📍 User location: ${this.state.userLocation.lat.toFixed(4)}, ${this.state.userLocation.lon.toFixed(4)}`);
        
        // Enhanced user marker
        this.ui.entities.userMarker = this.ui.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(
            this.state.userLocation.lon, 
            this.state.userLocation.lat, 
            0
          ),
          point: {
            pixelSize: 15,
            color: this.ui.colors.user,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          },
          label: {
            text: '📍 Your Location',
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.8),
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(20, -10),
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE
          }
        });
        
        this.showNotification(`📍 Location detected: ${this.state.userLocation.accuracy.toFixed(0)}m accuracy`, 'success');
        this.updateVisibilityForAll();
      },
      error => {
        console.warn('Geolocation error:', error);
        let message = '🌐 Location access denied';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = '🚫 Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = '📍 Location information unavailable';
            break;
          case error.TIMEOUT:
            message = '⏱️ Location request timed out';
            break;
        }
        this.showNotification(message, 'warning');
        
        const panel = document.getElementById('overheadPanel');
        if (panel) {
          panel.className = 'overhead-panel visible';
          panel.innerHTML = '<p>🌐 Enable location to see overhead satellites</p>';
        }
      },
      options
    );
  }
  
  // ===== EVENT HANDLERS =====
  setupEventListeners() {
    // Search functionality with enhanced debouncing
    const searchInput = document.getElementById('searchBox');
    if (searchInput) {
      let searchTimer;
      
      const handleSearch = () => {
        const query = searchInput.value.trim();
        if (query && this.state.satByName[query]) {
          this.selectSatellite(this.state.satByName[query]);
          searchInput.blur();
        }
      };
      
      searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(handleSearch, 300);
      });
      
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          clearTimeout(searchTimer);
          handleSearch();
        }
      });
    }
    
    // Random satellite button
    const randomBtn = document.getElementById('randomSatBtn');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        const randomSat = this.getRandomSatellite();
        this.selectSatellite(randomSat);
        if (searchInput) searchInput.value = randomSat.name;
      });
    }
    
    // Cesium click handler
    if (this.ui.viewer) {
      this.ui.viewer.screenSpaceEventHandler.setInputAction((movement) => {
        const picked = this.ui.viewer.scene.pick(movement.position);
        if (Cesium.defined(picked) && Cesium.defined(picked.id) && picked.id instanceof Cesium.Entity) {
          const entity = picked.id;
          const pickedName = entity.id;
          if (pickedName && this.state.satByName[pickedName]) {
            this.selectSatellite(this.state.satByName[pickedName]);
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
    
    // Theme toggle
    const themeBtn = document.getElementById('toggleThemeBtn');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const body = document.body;
        if (body.classList.contains('dark')) {
          body.classList.remove('dark');
          body.classList.add('light');
          localStorage.setItem('theme', 'light');
          this.showNotification('🌞 Switched to light theme', 'success');
        } else {
          body.classList.remove('light');
          body.classList.add('dark');
          localStorage.setItem('theme', 'dark');
          this.showNotification('🌙 Switched to dark theme', 'success');
        }
      });
    }
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.body.className = savedTheme;
    }
    
    // Add all other event listeners...
    this.setupOtherEventListeners();
  }
  
  setupOtherEventListeners() {
    // Sidebar toggle, export, reset, fullscreen, settings, about modal handlers...
    // (Previous event listener code continues here)
    
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('togglePanelBtn');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('show');
        toggleBtn.classList.toggle('active');
      });
    }
    
    // Export functionality
    const exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => this.exportVisibleSatellites());
    }
    
    // Reset view
    const resetBtn = document.getElementById('resetViewBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.resetView());
    }
    
    // Fullscreen toggle
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }
  }
  
  // ===== FEATURE METHODS =====
  exportVisibleSatellites() {
    if (!this.state.userLocation) {
      this.showNotification('📍 Enable location to determine visible satellites', 'warning');
      return;
    }
    
    const visibleSats = this.state.satellites.filter(sat => sat.isVisible);
    
    if (visibleSats.length === 0) {
      this.showNotification('🚫 No visible satellites to export', 'warning');
      return;
    }
    
    let csvContent = 'Satellite Name,Latitude (deg),Longitude (deg),Altitude (km),Velocity (km/s),Last Update\n';
    
    visibleSats.forEach(sat => {
      const timestamp = new Date(sat.lastUpdate).toISOString();
      csvContent += `"${sat.name}",${sat.lat.toFixed(6)},${sat.lon.toFixed(6)},${sat.alt.toFixed(2)},${sat.velocity.toFixed(3)},${timestamp}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = url;
    link.download = `starlink_visible_${timestamp}_${this.state.userLocation.lat.toFixed(2)}_${this.state.userLocation.lon.toFixed(2)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    this.showNotification(`📊 Exported ${visibleSats.length} visible satellites`, 'success');
  }
  
  resetView() {
    this.clearSelection();
    
    if (this.ui.viewer) {
      this.ui.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-75.0, 40.0, 15000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-30),
          roll: 0
        }
      });
    }
    
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('togglePanelBtn');
    if (sidebar && sidebar.classList.contains('show')) {
      sidebar.classList.remove('show');
      if (toggleBtn) toggleBtn.classList.remove('active');
    }
    
    this.showNotification('🌍 View reset to global perspective', 'success');
  }
  
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.showNotification('⛶ Entered fullscreen mode', 'success');
      }).catch(err => {
        this.showNotification('❌ Failed to enter fullscreen mode', 'error');
      });
    } else {
      document.exitFullscreen().then(() => {
        this.showNotification('🪟 Exited fullscreen mode', 'success');
      });
    }
  }
  
  // ===== CLEANUP =====
  destroy() {
    if (this.state.updateInterval) {
      clearInterval(this.state.updateInterval);
    }
    
    if (this.ui.viewer) {
      this.ui.viewer.destroy();
    }
    
    console.log('🗑️ Starlink Tracker destroyed');
  }
}

// ===== GLOBAL ERROR HANDLING =====
window.addEventListener('error', (event) => {
  console.error('💥 Global error:', event.error);
  if (window.tracker) {
    window.tracker.showNotification('⚠️ An unexpected error occurred', 'error');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('💥 Unhandled promise rejection:', event.reason);
  if (window.tracker) {
    window.tracker.showNotification('⚠️ A background error occurred', 'error');
  }
});

// ===== PERFORMANCE MONITORING =====
if ('performance' in window) {
  window.addEventListener('load', () => {
    setTimeout(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const loadTime = navigation.loadEventEnd - navigation.loadEventStart;
      console.log(`⚡ Page load time: ${loadTime.toFixed(2)}ms`);
    }, 1000);
  });
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 DOM loaded, initializing Starlink Tracker...');
  window.tracker = new StarlinkTracker();
});

// ===== CSS ANIMATIONS =====
const style = document.createElement('style');
style.textContent = `
@keyframes slideOutRight {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(100%); }
}

.visibility-visible { color: #00FF7F !important; }
.visibility-hidden { color: #888 !important; }

.notification {
  position: relative;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 8px 32px var(--shadow);
  backdrop-filter: var(--blur);
  animation: slideInRight 0.3s ease;
  max-width: 400px;
}

.notification-content {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}

.notification-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.notification-close:hover {
  color: var(--text-primary);
}

.feature-list {
  text-align: left;
  margin-top: 20px;
}

.feature-list ul {
  margin-left: 20px;
  color: var(--text-secondary);
}

.feature-list li {
  margin-bottom: 8px;
}

.tle-container {
  background: var(--bg-primary);
  border-radius: 8px;
  padding: 12px;
  margin-top: 8px;
}

.tle-data {
  font-family: 'Courier New', monospace;
  font-size: 0.8rem;
  color: var(--accent-primary);
  white-space: pre;
  overflow-x: auto;
  margin: 0;
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}
`;
document.head.appendChild(style);
