// ===== STARLINK SATELLITE TRACKER - ENTERPRISE EDITION =====
// Real-time satellite tracking with enhanced features and enterprise-grade error handling

class StarlinkTracker {
  constructor() {
    this.config = {
      TLE_URL: '/api/tle', // Use our backend proxy to avoid CORS
      UPDATE_INTERVAL: 1000, // 1 second default
      MAX_RETRY_ATTEMPTS: 3,
      RETRY_DELAY: 5000,
      CESIUM_ION_TOKEN: null // Add your Cesium Ion token if needed
    };
    
    this.state = {
      satellites: [],
      satByName: {},
      selectedSat: null,
      userLocation: null,
      isConnected: false,
      lastUpdate: null,
      updateInterval: null,
      retryCount: 0
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
        default: Cesium.Color.YELLOW,
        visible: Cesium.Color.LIME,
        selected: Cesium.Color.RED
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
  
  // ===== INITIALIZATION =====
  async init() {
    try {
      this.showLoading(0);
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
        this.showNotification('Starlink Tracker initialized successfully!', 'success');
      }, 500);
      
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showNotification('Failed to initialize tracker: ' + error.message, 'error');
      this.hideLoading();
    }
  }
  
  async initializeCesium() {
    try {
      // Set Cesium Ion token if provided
      if (this.config.CESIUM_ION_TOKEN) {
        Cesium.Ion.defaultAccessToken = this.config.CESIUM_ION_TOKEN;
      }
      
      this.ui.viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
          url: 'https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer'
        }),
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
      
      // Enable lighting and atmosphere
      this.ui.viewer.scene.globe.enableLighting = true;
      this.ui.viewer.scene.globe.atmosphereHueShift = 0.1;
      this.ui.viewer.scene.globe.atmosphereSaturationShift = 0.1;
      
      // Set initial camera position
      this.ui.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-90),
          roll: 0
        }
      });
      
    } catch (error) {
      throw new Error('Failed to initialize Cesium: ' + error.message);
    }
  }
  
  // ===== DATA FETCHING =====
  async fetchTLEData() {
    try {
      this.updateConnectionStatus('connecting');
      
      const response = await fetch(this.config.TLE_URL, {
        method: 'GET',
        headers: {
          'Accept': 'text/plain',
          'Cache-Control': 'no-cache'
        }
      });
      
      if (!response.ok) {
        throw new Error(`TLE fetch failed: ${response.status} ${response.statusText}`);
      }
      
      const tleText = await response.text();
      await this.parseTLEData(tleText);
      
      this.updateConnectionStatus('connected');
      this.state.lastUpdate = new Date();
      this.state.retryCount = 0;
      
      this.updateUI();
      
    } catch (error) {
      console.error('TLE fetch error:', error);
      this.updateConnectionStatus('error');
      
      if (this.state.retryCount < this.config.MAX_RETRY_ATTEMPTS) {
        this.state.retryCount++;
        this.showNotification(`Connection failed. Retrying... (${this.state.retryCount}/${this.config.MAX_RETRY_ATTEMPTS})`, 'warning');
        setTimeout(() => this.fetchTLEData(), this.config.RETRY_DELAY);
      } else {
        this.showNotification('Failed to fetch satellite data. Please check your connection.', 'error');
      }
    }
  }
  
  async parseTLEData(tleText) {
    const lines = tleText.split(/[\r\n]+/);
    this.state.satellites = [];
    this.state.satByName = {};
    
    for (let i = 0; i < lines.length; ) {
      const name = lines[i++]?.trim();
      const line1 = lines[i++]?.trim();
      const line2 = lines[i++]?.trim();
      
      if (!name || !line1 || !line2) break;
      
      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        if (satrec.error) {
          console.warn(`Skipping invalid TLE for ${name} (error: ${satrec.error})`);
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
          isVisible: false,
          entity: null
        };
        
        this.state.satellites.push(satData);
        this.state.satByName[name] = satData;
      } catch (err) {
        console.error('TLE parse error for', name, err);
      }
    }
    
    if (this.state.satellites.length === 0) {
      throw new Error('No valid satellites loaded from TLE data');
    }
    
    this.populateSearchDatalist();
    this.createSatelliteEntities();
    
    console.log(`✅ Loaded ${this.state.satellites.length} Starlink satellites`);
  }
  
  // ===== SATELLITE ENTITIES =====
  createSatelliteEntities() {
    this.state.satellites.forEach(sat => {
      const entity = this.ui.viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
        point: {
          pixelSize: 3,
          color: this.ui.colors.default,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY
        },
        id: sat.name,
        name: sat.name
      });
      sat.entity = entity;
    });
  }
  
  // ===== REAL-TIME UPDATES =====
  startRealTimeUpdates() {
    if (this.state.updateInterval) {
      clearInterval(this.state.updateInterval);
    }
    
    this.updateSatellitePositions();
    
    this.state.updateInterval = setInterval(() => {
      this.updateSatellitePositions();
      
      // Periodic visibility updates
      if (this.state.userLocation) {
        this.updateVisibilityForAll();
      }
      
      // Refresh TLE data every 30 minutes
      if (this.state.lastUpdate && Date.now() - this.state.lastUpdate.getTime() > 30 * 60 * 1000) {
        this.fetchTLEData();
      }
      
    }, this.config.UPDATE_INTERVAL);
  }
  
  updateSatellitePositions() {
    const now = new Date();
    const gmst = satellite.gstime(now);
    
    this.state.satellites.forEach(sat => {
      try {
        const { position: posEci } = satellite.propagate(sat.satrec, now);
        if (!posEci) return;
        
        const positionGd = satellite.eciToGeodetic(posEci, gmst);
        const lat = Cesium.Math.toDegrees(positionGd.latitude);
        const lon = Cesium.Math.toDegrees(positionGd.longitude);
        const altKm = positionGd.height;
        
        sat.lat = lat;
        sat.lon = lon;
        sat.alt = altKm;
        
        const newPos = Cesium.Cartesian3.fromRadians(positionGd.longitude, positionGd.latitude, altKm * 1000);
        sat.entity.position = newPos;
        
        // Update selected satellite visuals
        if (sat === this.state.selectedSat) {
          this.updateSelectedSatellite();
        }
        
      } catch (error) {
        console.warn(`Position update failed for ${sat.name}:`, error);
      }
    });
    
    this.updateLastUpdateTime();
  }
  
  updateSelectedSatellite() {
    const sat = this.state.selectedSat;
    if (!sat) return;
    
    // Update info panel
    this.updateSelectedInfo();
    
    // Update coverage circle
    if (this.ui.entities.coverage && this.settings.showCoverage) {
      this.ui.entities.coverage.position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, 0);
      this.updateCoverageRadius(sat.alt);
    }
    
    // Update marker
    if (this.ui.entities.selectedMarker) {
      this.ui.entities.selectedMarker.position = Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, sat.alt * 1000);
    }
  }
  
  // ===== VISIBILITY CALCULATIONS =====
  updateVisibilityForAll() {
    if (!this.state.userLocation) return;
    
    const R = 6371.0; // Earth radius in km
    const userLatRad = Cesium.Math.toRadians(this.state.userLocation.lat);
    const userLonRad = Cesium.Math.toRadians(this.state.userLocation.lon);
    
    let visibleCount = 0;
    
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
      if (isVisible) visibleCount++;
      
      // Update color if not selected
      if (sat !== this.state.selectedSat) {
        sat.entity.point.color = isVisible ? this.ui.colors.visible : this.ui.colors.default;
      }
    });
    
    this.updateVisibleSatelliteCount(visibleCount);
    this.updateOverheadInfo();
  }
  
  updateOverheadInfo() {
    if (!this.state.userLocation) return;
    
    const panel = document.getElementById('overheadPanel');
    if (!panel) return;
    
    let bestSat = null;
    let bestCos = -1;
    let nextSat = null;
    let minAngleDiff = Infinity;
    
    const R = 6371.0;
    const userLatRad = Cesium.Math.toRadians(this.state.userLocation.lat);
    const userLonRad = Cesium.Math.toRadians(this.state.userLocation.lon);
    
    this.state.satellites.forEach(sat => {
      const satLatRad = Cesium.Math.toRadians(sat.lat);
      const satLonRad = Cesium.Math.toRadians(sat.lon);
      const dLon = satLonRad - userLonRad;
      
      const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) +
                      Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
      const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
      const phi = Math.acos(R / (R + sat.alt));
      
      if (centralAngle <= phi && cosAngle > bestCos) {
        bestCos = cosAngle;
        bestSat = sat;
      } else if (centralAngle > phi) {
        const diff = centralAngle - phi;
        if (diff < minAngleDiff) {
          minAngleDiff = diff;
          nextSat = sat;
        }
      }
    });
    
    panel.innerHTML = '';
    panel.className = 'overhead-panel visible';
    
    const currentP = document.createElement('p');
    currentP.innerHTML = bestSat 
      ? `🛰️ <strong>Overhead:</strong> ${bestSat.name}` 
      : '🌌 No satellite overhead currently';
    panel.appendChild(currentP);
    
    if (nextSat) {
      const nextP = document.createElement('p');
      nextP.innerHTML = `⏳ <strong>Next:</strong> ${nextSat.name}`;
      panel.appendChild(nextP);
    }
  }
  
  // ===== SATELLITE SELECTION =====
  selectSatellite(satData) {
    if (!satData || satData === this.state.selectedSat) return;
    
    this.clearSelection();
    this.state.selectedSat = satData;
    
    // Highlight selected satellite
    satData.entity.point.color = this.ui.colors.selected;
    satData.entity.point.pixelSize = 6;
    
    // Add marker
    this.ui.entities.selectedMarker = this.ui.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(satData.lon, satData.lat, satData.alt * 1000),
      billboard: {
        image: this.createCrosshairIcon(),
        width: 32,
        height: 32,
        verticalOrigin: Cesium.VerticalOrigin.CENTER,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        scale: 1.5,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    // Fly to satellite
    this.ui.viewer.flyTo(satData.entity, {
      duration: 1.5,
      offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), (satData.alt * 1000 * 2) + 500000)
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
    
    this.showNotification(`Selected: ${satData.name}`, 'success');
  }
  
  clearSelection() {
    if (this.state.selectedSat) {
      const sat = this.state.selectedSat;
      sat.entity.point.color = (sat.isVisible && this.state.userLocation) ? this.ui.colors.visible : this.ui.colors.default;
      sat.entity.point.pixelSize = 3;
    }
    
    // Remove visual elements
    ['selectedMarker', 'coverage', 'selectedPath'].forEach(key => {
      if (this.ui.entities[key]) {
        this.ui.viewer.entities.remove(this.ui.entities[key]);
        this.ui.entities[key] = null;
      }
    });
    
    this.state.selectedSat = null;
    this.showDefaultInfo();
  }
  
  // ===== UI UPDATES =====
  showSatelliteInfo(sat) {
    const panel = document.getElementById('infoPanel');
    panel.innerHTML = '';
    
    const infoDiv = document.createElement('div');
    infoDiv.className = 'satellite-info';
    
    // Header
    const header = document.createElement('div');
    header.className = 'info-header';
    header.innerHTML = `
      <h3>${sat.name}</h3>
      <button class="btn-clear" id="clearSelectionBtn">✕</button>
    `;
    infoDiv.appendChild(header);
    
    // Position section
    const posSection = document.createElement('div');
    posSection.className = 'info-section';
    posSection.innerHTML = `
      <h4>📍 Position</h4>
      <div class="info-row">
        <span class="info-label">Latitude:</span>
        <span class="info-value" id="infoLat">${sat.lat.toFixed(4)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Longitude:</span>
        <span class="info-value" id="infoLon">${sat.lon.toFixed(4)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Altitude:</span>
        <span class="info-value" id="infoAlt">${sat.alt.toFixed(1)} km</span>
      </div>
      <div class="info-row">
        <span class="info-label">Velocity:</span>
        <span class="info-value" id="infoVel">${this.getCurrentVelocity(sat)?.toFixed(2) || '?'} km/s</span>
      </div>
    `;
    infoDiv.appendChild(posSection);
    
    // Orbital parameters
    const orbitalSection = document.createElement('div');
    orbitalSection.className = 'info-section';
    const incl = Cesium.Math.toDegrees(sat.satrec.inclo);
    const periodMin = 86400 / sat.satrec.no / 60;
    const ecc = sat.satrec.ecco;
    
    orbitalSection.innerHTML = `
      <h4>🛸 Orbital Parameters</h4>
      <div class="info-row">
        <span class="info-label">Inclination:</span>
        <span class="info-value">${incl.toFixed(2)}°</span>
      </div>
      <div class="info-row">
        <span class="info-label">Period:</span>
        <span class="info-value">${periodMin.toFixed(2)} min</span>
      </div>
      <div class="info-row">
        <span class="info-label">Eccentricity:</span>
        <span class="info-value">${ecc.toFixed(6)}</span>
      </div>
    `;
    infoDiv.appendChild(orbitalSection);
    
    // TLE section
    const tleSection = document.createElement('div');
    tleSection.className = 'info-section';
    tleSection.innerHTML = `
      <h4>📡 TLE Data</h4>
      <pre style="font-size: 0.7rem; overflow-x: auto; background: var(--bg-primary); padding: 8px; border-radius: 4px;">${sat.line1}\n${sat.line2}</pre>
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
    panel.innerHTML = `
      <div class="info-header">
        <h3>Satellite Information</h3>
      </div>
      <p class="info-placeholder">Click on a satellite or search to see details</p>
    `;
  }
  
  updateSelectedInfo() {
    const sat = this.state.selectedSat;
    if (!sat) return;
    
    const elements = {
      lat: document.getElementById('infoLat'),
      lon: document.getElementById('infoLon'),
      alt: document.getElementById('infoAlt'),
      vel: document.getElementById('infoVel')
    };
    
    if (elements.lat) {
      elements.lat.textContent = `${sat.lat.toFixed(4)}°`;
      elements.lon.textContent = `${sat.lon.toFixed(4)}°`;
      elements.alt.textContent = `${sat.alt.toFixed(1)} km`;
      const vel = this.getCurrentVelocity(sat);
      elements.vel.textContent = vel ? `${vel.toFixed(2)} km/s` : '? km/s';
    }
  }
  
  getCurrentVelocity(sat) {
    try {
      const pv = satellite.propagate(sat.satrec, new Date());
      if (pv.velocity) {
        const { x, y, z } = pv.velocity;
        return Math.sqrt(x*x + y*y + z*z);
      }
    } catch (e) {
      console.warn('Velocity calculation failed:', e);
    }
    return null;
  }
  
  // ===== VISUAL ELEMENTS =====
  showCoverage(sat) {
    const R = 6371.0;
    const phi = Math.acos(R / (R + sat.alt));
    const radiusMeters = R * 1000 * phi;
    
    this.ui.entities.coverage = this.ui.viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(sat.lon, sat.lat, 0),
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: Cesium.Color.BLUE.withAlpha(0.2),
        outline: true,
        outlineColor: Cesium.Color.BLUE,
        height: 0
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
    const steps = 100;
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
          width: 3,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.1,
            color: Cesium.Color.ORANGE
          }),
          clampToGround: false
        }
      });
    }
  }
  
  // ===== UTILITY METHODS =====
  createCrosshairIcon() {
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDIwIDIwIj4KPGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPgo8bGluZSB4MT0iMTAiIHkxPSIyIiB4Mj0iMTAiIHkyPSIxOCIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPgo8bGluZSB4MT0iMiIgeTE9IjEwIiB4Mj0iMTgiIHkyPSIxMCIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=';
  }
  
  populateSearchDatalist() {
    const dataList = document.getElementById('satList');
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
    loadingScreen.style.display = 'flex';
    progressBar.style.width = `${progress}%`;
  }
  
  hideLoading() {
    const loadingScreen = document.getElementById('loadingScreen');
    const app = document.getElementById('app');
    loadingScreen.style.display = 'none';
    app.style.display = 'flex';
  }
  
  updateConnectionStatus(status) {
    const indicator = document.querySelector('.status-indicator');
    const text = document.querySelector('.status-text');
    
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
    document.getElementById('totalSats').textContent = this.state.satellites.length;
    document.getElementById('tleTimestamp').textContent = this.state.lastUpdate ? 
      this.state.lastUpdate.toLocaleTimeString() : 'Never';
  }
  
  updateLastUpdateTime() {
    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
  }
  
  updateVisibleSatelliteCount(count) {
    document.getElementById('visibleSats').textContent = count;
  }
  
  // ===== NOTIFICATIONS =====
  showNotification(message, type = 'info', duration = 5000) {
    const container = document.getElementById('notifications');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    container.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => {
        if (notification.parentNode) {
          container.removeChild(notification);
        }
      }, 300);
    }, duration);
  }
  
  // ===== SETTINGS =====
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
    document.getElementById('updateInterval').value = this.settings.updateInterval;
    document.getElementById('intervalValue').textContent = `${this.settings.updateInterval}s`;
    document.getElementById('showOrbits').checked = this.settings.showOrbits;
    document.getElementById('showCoverage').checked = this.settings.showCoverage;
    document.getElementById('enableSounds').checked = this.settings.enableSounds;
  }
  
  // ===== GEOLOCATION =====
  setupGeolocation() {
    if (!navigator.geolocation) {
      this.showNotification('Geolocation not supported by this browser', 'warning');
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      position => {
        this.state.userLocation = {
          lat: position.coords.latitude,
          lon: position.coords.longitude
        };
        
        this.ui.entities.userMarker = this.ui.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(this.state.userLocation.lon, this.state.userLocation.lat, 0),
          point: {
            pixelSize: 12,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
          },
          label: {
            text: '📍 You',
            showBackground: true,
            backgroundColor: Cesium.Color.BLACK.withAlpha(0.7),
            horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(15, -5),
            font: '14px sans-serif',
            fillColor: Cesium.Color.WHITE
          }
        });
        
        this.showNotification('Location detected successfully!', 'success');
        this.updateVisibilityForAll();
      },
      error => {
        console.warn('Geolocation error:', error);
        let message = 'Location access denied';
        switch (error.code) {
          case error.PERMISSION_DENIED:
            message = 'Location permission denied';
            break;
          case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable';
            break;
          case error.TIMEOUT:
            message = 'Location request timed out';
            break;
        }
        this.showNotification(message, 'warning');
        
        const panel = document.getElementById('overheadPanel');
        panel.className = 'overhead-panel visible';
        panel.innerHTML = '<p>🌐 Enable location to see overhead satellites</p>';
      }
    );
  }
  
  // ===== EVENT HANDLERS =====
  setupEventListeners() {
    // Search functionality
    const searchInput = document.getElementById('searchBox');
    let searchTimer;
    
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        if (query && this.state.satByName[query]) {
          this.selectSatellite(this.state.satByName[query]);
          searchInput.blur();
        }
      }, 300);
    });
    
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query && this.state.satByName[query]) {
          this.selectSatellite(this.state.satByName[query]);
          searchInput.blur();
        }
      }
    });
    
    // Random satellite button
    document.getElementById('randomSatBtn').addEventListener('click', () => {
      const randomSat = this.getRandomSatellite();
      this.selectSatellite(randomSat);
      searchInput.value = randomSat.name;
    });
    
    // Click on globe to select satellite
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
    
    // Theme toggle
    document.getElementById('toggleThemeBtn').addEventListener('click', () => {
      const body = document.body;
      if (body.classList.contains('dark')) {
        body.classList.remove('dark');
        body.classList.add('light');
        localStorage.setItem('theme', 'light');
        this.showNotification('Switched to light theme', 'success');
      } else {
        body.classList.remove('light');
        body.classList.add('dark');
        localStorage.setItem('theme', 'dark');
        this.showNotification('Switched to dark theme', 'success');
      }
    });
    
    // Sidebar toggle
    const sidebar = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('togglePanelBtn');
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('show');
      toggleBtn.classList.toggle('active');
    });
    
    // Export CSV
    document.getElementById('exportBtn').addEventListener('click', () => {
      this.exportVisibleSatellites();
    });
    
    // Reset view
    document.getElementById('resetViewBtn').addEventListener('click', () => {
      this.resetView();
    });
    
    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      this.toggleFullscreen();
    });
    
    // Settings modal
    document.getElementById('settingsBtn').addEventListener('click', () => {
      document.getElementById('settingsModal').classList.add('active');
    });
    
    document.getElementById('closeSettings').addEventListener('click', () => {
      document.getElementById('settingsModal').classList.remove('active');
    });
    
    // About modal
    document.getElementById('aboutBtn').addEventListener('click', () => {
      document.getElementById('aboutModal').classList.add('active');
    });
    
    document.getElementById('closeAbout').addEventListener('click', () => {
      document.getElementById('aboutModal').classList.remove('active');
    });
    
    // Settings controls
    document.getElementById('updateInterval').addEventListener('input', (e) => {
      this.settings.updateInterval = parseInt(e.target.value);
      document.getElementById('intervalValue').textContent = `${this.settings.updateInterval}s`;
      this.config.UPDATE_INTERVAL = this.settings.updateInterval * 1000;
      this.saveSettings();
      this.startRealTimeUpdates();
    });
    
    ['showOrbits', 'showCoverage', 'enableSounds'].forEach(id => {
      document.getElementById(id).addEventListener('change', (e) => {
        this.settings[id] = e.target.checked;
        this.saveSettings();
        
        if (id === 'showOrbits' && this.state.selectedSat) {
          if (e.target.checked) {
            this.showOrbitalPath(this.state.selectedSat);
          } else if (this.ui.entities.selectedPath) {
            this.ui.viewer.entities.remove(this.ui.entities.selectedPath);
            this.ui.entities.selectedPath = null;
          }
        }
        
        if (id === 'showCoverage' && this.state.selectedSat) {
          if (e.target.checked) {
            this.showCoverage(this.state.selectedSat);
          } else if (this.ui.entities.coverage) {
            this.ui.viewer.entities.remove(this.ui.entities.coverage);
            this.ui.entities.coverage = null;
          }
        }
      });
    });
    
    // Close modals when clicking outside
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
      }
    });
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      document.body.className = savedTheme;
    }
  }
  
  // ===== FEATURE METHODS =====
  exportVisibleSatellites() {
    if (!this.state.userLocation) {
      this.showNotification('Enable location to determine visible satellites', 'warning');
      return;
    }
    
    const visibleSats = this.state.satellites.filter(sat => sat.isVisible);
    
    if (visibleSats.length === 0) {
      this.showNotification('No visible satellites to export', 'warning');
      return;
    }
    
    let csvContent = 'Satellite Name,Latitude (deg),Longitude (deg),Altitude (km),Velocity (km/s)\n';
    
    visibleSats.forEach(sat => {
      const velocity = this.getCurrentVelocity(sat) || 0;
      csvContent += `"${sat.name}",${sat.lat.toFixed(4)},${sat.lon.toFixed(4)},${sat.alt.toFixed(1)},${velocity.toFixed(2)}\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `starlink_visible_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    this.showNotification(`Exported ${visibleSats.length} visible satellites`, 'success');
  }
  
  resetView() {
    this.clearSelection();
    
    this.ui.viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(0, 30, 20000000),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),
        roll: 0
      }
    });
    
    // Hide sidebar on mobile
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('show')) {
      sidebar.classList.remove('show');
      document.getElementById('togglePanelBtn').classList.remove('active');
    }
    
    this.showNotification('View reset to global view', 'success');
  }
  
  toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => {
        this.showNotification('Entered fullscreen mode', 'success');
      }).catch(err => {
        this.showNotification('Failed to enter fullscreen mode', 'error');
      });
    } else {
      document.exitFullscreen().then(() => {
        this.showNotification('Exited fullscreen mode', 'success');
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
  }
}

// ===== GLOBAL ERROR HANDLING =====
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  if (window.tracker) {
    window.tracker.showNotification('An unexpected error occurred', 'error');
  }
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  if (window.tracker) {
    window.tracker.showNotification('A background error occurred', 'error');
  }
});

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
  window.tracker = new StarlinkTracker();
});

// ===== CSS ANIMATIONS FOR SLIDE OUT =====
const style = document.createElement('style');
style.textContent = `
@keyframes slideOutRight {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(100%);
  }
}
`;
document.head.appendChild(style);
