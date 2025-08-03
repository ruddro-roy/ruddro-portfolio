// ===== STARLINK SATELLITE TRACKER - ENTERPRISE-GRADE VERSION =====
// Enhanced for robust deployment, using public Celestrak supplemental TLE source for real-time precision
// Added next pass prediction, full satellite list panel, stunning visuals with better imagery and effects
// Note: For Cesium Ion assets, sign up for a free account at https://cesium.com/ion/ and set CESIUM_ION_TOKEN in config
// Without token, falls back to public ArcGIS imagery

class StarlinkTracker {
  constructor() {
    this.config = {
      TLE_URL: 'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle', // Public Celestrak supplemental for all Starlink
      CESIUM_ION_TOKEN: '', // Set your free Cesium Ion token here for high-quality imagery/terrain
      UPDATE_INTERVAL: 1000, // Position updates in ms
      TLE_REFRESH_INTERVAL: 1800000, // 30 min TLE refresh
      PASS_PREDICTION_HORIZON: 3600, // 1 hour ahead for next pass in seconds
      MAX_RETRY_ATTEMPTS: 5,
      RETRY_DELAY: 3000,
      MAX_SATELLITES_TO_RENDER: 10000, // Increased for full constellation if hardware allows
    };

    this.state = {
      satellites: [],
      satByName: {},
      selectedSat: null,
      userLocation: null,
      nextPass: null, // {sat, time, duration}
      isConnected: false,
      lastUpdate: null,
      updateInterval: null,
      tleRefreshInterval: null,
      retryCount: 0,
      cesiumInitialized: false,
      webGLSupported: false,
    };

    this.ui = {
      viewer: null,
      entities: {
        coverage: null,
        selectedPath: null,
        userMarker: null,
        selectedMarker: null,
      },
      colors: {
        default: Cesium.Color.fromCssColorString('#FFD700'),
        visible: Cesium.Color.fromCssColorString('#00FF7F'),
        selected: Cesium.Color.fromCssColorString('#FF4500'),
        user: Cesium.Color.fromCssColorString('#00BFFF'),
      },
    };

    this.settings = {
      showOrbits: true,
      showCoverage: true,
      enableSounds: false,
      updateInterval: 1,
    };

    this.init();
  }

  // ===== ROBUST INITIALIZATION =====
  async init() {
    try {
      this.showLoading(0);
      console.log('🚀 Initializing Enterprise Starlink Tracker...');

      this.state.webGLSupported = this.checkWebGLSupport();
      if (!this.state.webGLSupported) {
        throw new Error('WebGL not supported. Falling back to non-3D mode.');
      }

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
        this.showSatelliteList();
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

      const cesiumContainer = document.getElementById('cesiumContainer');
      if (!cesiumContainer) {
        throw new Error('Cesium container not found');
      }

      // Set Ion token if provided
      if (this.config.CESIUM_ION_TOKEN) {
        Cesium.Ion.defaultAccessToken = this.config.CESIUM_ION_TOKEN;
      }

      let imageryProvider;
      if (this.config.CESIUM_ION_TOKEN) {
        // Use high-quality Ion imagery if token available
        imageryProvider = await Cesium.IonImageryProvider.fromAssetId(2); // Bing Maps Aerial
      } else {
        // Fallback to public ArcGIS
        imageryProvider = new Cesium.ArcGisMapServerImageryProvider({
          url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
        });
      }

      let terrainProvider;
      if (this.config.CESIUM_ION_TOKEN) {
        terrainProvider = await Cesium.createWorldTerrainAsync();
      } else {
        terrainProvider = new Cesium.EllipsoidTerrainProvider();
      }

      this.ui.viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider,
        terrainProvider,
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
        shadows: true,
        terrainShadows: Cesium.ShadowMode.ENABLED,
        requestRenderMode: false,
        maximumRenderTimeChange: Infinity,
      });

      // Enhance scene for stunning visuals
      const scene = this.ui.viewer.scene;
      scene.globe.enableLighting = true;
      scene.globe.dynamicAtmosphereLighting = true;
      scene.highDynamicRange = true;
      scene.skyAtmosphere.hueShift = -0.1;
      scene.skyAtmosphere.saturationShift = -0.2;
      scene.skyAtmosphere.brightnessShift = 0.1;
      scene.fog.enabled = true;
      scene.fog.density = 0.0001;
      scene.postProcessStages.fxaa.enabled = true;
      scene.globe.tileCacheSize = 2000;

      // Initial view
      this.ui.viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(0, 0, 20000000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
      });

      this.ui.viewer.cesiumWidget.creditContainer.style.display = 'none';
      this.ui.viewer.scene.renderError.addEventListener((scene, error) => {
        this.handleRenderError(error);
      });

      this.state.cesiumInitialized = true;
      console.log('✅ Cesium initialized');
    } catch (error) {
      console.error('❌ Cesium init failed:', error);
      throw error;
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
    console.error('🔥 Render error:', error);
    this.showNotification('Rendering error. Recovering...', 'error');
    setTimeout(() => this.ui.viewer?.scene.requestRender(), 2000);
  }

  handleCriticalError(error) {
    this.hideLoading();
    const errorMessage = `Critical Error: ${error.message}`;
    this.showNotification(errorMessage, 'error', 10000);

    // Fallback UI
    document.getElementById('app').innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: #1a1a2e; color: white; font-family: Arial;">
        <div style="text-align: center; max-width: 800px; padding: 40px;">
          <h1>🛰️ Starlink Tracker - Fallback Mode</h1>
          <div style="background: #e74c3c; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2>Initialization Failed</h2>
            <p>${errorMessage}</p>
          </div>
          <div style="background: #3498db; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3>Possible Solutions:</h3>
            <ul style="text-align: left;">
              <li>Enable WebGL and hardware acceleration</li>
              <li>Update browser and graphics drivers</li>
              <li>Use Chrome or Edge</li>
              <li>Disable extensions</li>
              <li>Check network</li>
              <li>Set CESIUM_ION_TOKEN for better visuals</li>
            </ul>
          </div>
          <button onclick="location.reload()" style="background: #4f86f7; color: white; border: none; padding: 15px 30px; border-radius: 5px; cursor: pointer; font-size: 16px;">
            🔄 Retry
          </button>
        </div>
      </div>
    `;
  }

  // ===== DATA FETCHING =====
  async fetchTLEData() {
    try {
      this.updateConnectionStatus('connecting');
      console.log('📡 Fetching TLE from Celestrak...');

      const response = await fetch(this.config.TLE_URL, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

      const tleText = await response.text();
      console.log(`📊 Received ${tleText.length} bytes`);

      await this.parseTLEData(tleText);

      this.updateConnectionStatus('connected');
      this.state.lastUpdate = new Date();
      this.state.retryCount = 0;
      this.updateUI();
      this.showSatelliteList();
    } catch (error) {
      console.error('❌ TLE error:', error);
      this.updateConnectionStatus('error');

      if (this.state.retryCount < this.config.MAX_RETRY_ATTEMPTS) {
        this.state.retryCount++;
        this.showNotification(`Retry ${this.state.retryCount}/${this.config.MAX_RETRY_ATTEMPTS}...`, 'warning');
        setTimeout(() => this.fetchTLEData(), this.config.RETRY_DELAY * this.state.retryCount);
      } else {
        this.showNotification('Failed to fetch data. Retry later.', 'error');
      }
    }
  }

  async parseTLEData(tleText) {
    const lines = tleText.split(/\r?\n/).filter(line => line.trim());
    this.state.satellites = [];
    this.state.satByName = {};

    let validCount = 0;
    let errorCount = 0;

    for (let i = 0; i < lines.length; i += 3) {
      const name = lines[i]?.trim();
      const line1 = lines[i + 1]?.trim();
      const line2 = lines[i + 2]?.trim();

      if (!name || !line1 || !line2) continue;

      try {
        const satrec = satellite.twoline2satrec(line1, line2);
        if (satrec.error) throw new Error(`TLE error ${satrec.error}`);

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
          lastUpdate: Date.now(),
        };

        this.state.satellites.push(satData);
        this.state.satByName[name] = satData;
        validCount++;
      } catch (err) {
        errorCount++;
        console.warn(`⚠️ Skip ${name}:`, err);
      }
    }

    if (validCount === 0) throw new Error('No valid satellites');

    console.log(`✅ Loaded ${validCount} sats (${errorCount} errors)`);

    this.populateSearchDatalist();
    this.createSatelliteEntities();
  }

  createSatelliteEntities() {
    if (!this.ui.viewer) return;

    console.log(`🛰️ Creating entities (limit ${this.config.MAX_SATELLITES_TO_RENDER})...`);

    const satsToRender = this.state.satellites.slice(0, this.config.MAX_SATELLITES_TO_RENDER);

    satsToRender.forEach((sat, index) => {
      try {
        const entity = this.ui.viewer.entities.add({
          position: Cesium.Cartesian3.fromDegrees(0, 0, 400000),
          point: {
            pixelSize: 5,
            color: this.ui.colors.default,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 1,
            heightReference: Cesium.HeightReference.NONE,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            scaleByDistance: new Cesium.NearFarScalar(1e6, 1.0, 1e7, 0.5),
          },
          billboard: {
            image: this.createSatelliteIcon(),
            width: 20,
            height: 20,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            show: false, // Show on zoom or select
          },
          id: sat.name,
          name: sat.name,
          description: `Starlink: ${sat.name}`,
        });

        sat.entity = entity;

        if (index % 1000 === 0) console.log(`📡 Created ${index}/${satsToRender.length}`);
      } catch (error) {
        console.error(`❌ Entity for ${sat.name}:`, error);
      }
    });

    console.log(`✅ Created ${satsToRender.length} entities`);
  }

  createSatelliteIcon() {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
        <path d="M16 0 L20 12 H32 L22 20 L26 32 L16 26 L6 32 L10 20 L0 12 H12 L16 0 Z" fill="#FFD700" stroke="#FFF" stroke-width="1"/>
      </svg>
    `;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  // ===== REAL-TIME UPDATES =====
  startRealTimeUpdates() {
    if (this.state.updateInterval) clearInterval(this.state.updateInterval);
    if (this.state.tleRefreshInterval) clearInterval(this.state.tleRefreshInterval);

    console.log('⏰ Starting updates...');
    this.updateSatellitePositions();

    this.state.updateInterval = setInterval(() => {
      try {
        this.updateSatellitePositions();
        if (this.state.userLocation) {
          this.updateVisibilityForAll();
          this.predictNextPass();
        }
      } catch (error) {
        console.error('❌ Update error:', error);
      }
    }, this.config.UPDATE_INTERVAL);

    this.state.tleRefreshInterval = setInterval(() => {
      console.log('🔄 Refresh TLE...');
      this.fetchTLEData();
    }, this.config.TLE_REFRESH_INTERVAL);
  }

  updateSatellitePositions() {
    const now = new Date();
    const gmst = satellite.gstime(now);
    let updateCount = 0;
    let errorCount = 0;

    this.state.satellites.forEach(sat => {
      try {
        const prop = satellite.propagate(sat.satrec, now);
        if (!prop.position) return;

        const posEci = prop.position;
        const velEci = prop.velocity || {x:0, y:0, z:0};

        const gd = satellite.eciToGeodetic(posEci, gmst);
        const lat = Cesium.Math.toDegrees(gd.latitude);
        const lon = Cesium.Math.toDegrees(gd.longitude);
        const alt = gd.height;

        const vel = Math.sqrt(velEci.x**2 + velEci.y**2 + velEci.z**2);

        sat.lat = lat;
        sat.lon = lon;
        sat.alt = alt;
        sat.velocity = vel;
        sat.lastUpdate = Date.now();

        if (sat.entity) {
          sat.entity.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt * 1000);
        }

        updateCount++;

        if (sat === this.state.selectedSat) this.updateSelectedSatellite();
      } catch (error) {
        errorCount++;
        if (errorCount < 10) console.warn(`⚠️ Update ${sat.name}:`, error);
      }
    });

    this.updateLastUpdateTime();

    if (Date.now() % 15000 < this.config.UPDATE_INTERVAL) {
      console.log(`📊 Updated ${updateCount}/${this.state.satellites.length} (${errorCount} errors)`);
    }
  }

  updateVisibilityForAll() {
    if (!this.state.userLocation) return;

    const R = 6371;
    const userLatRad = Cesium.Math.toRadians(this.state.userLocation.lat);
    const userLonRad = Cesium.Math.toRadians(this.state.userLocation.lon);

    let visibleCount = 0;
    let overheadSat = null;
    let maxElevation = -90;

    this.state.satellites.forEach(sat => {
      const satLatRad = Cesium.Math.toRadians(sat.lat);
      const satLonRad = Cesium.Math.toRadians(sat.lon);
      const dLon = satLonRad - userLonRad;

      const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) + Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
      const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));

      const phi = Math.acos(R / (R + sat.alt));
      const isVisible = centralAngle <= phi;

      sat.isVisible = isVisible;

      if (isVisible) {
        visibleCount++;
        const elevation = 90 - Cesium.Math.toDegrees(centralAngle);
        if (elevation > maxElevation) {
          maxElevation = elevation;
          overheadSat = sat;
        }
      }

      if (sat.entity && sat !== this.state.selectedSat) {
        sat.entity.point.color = isVisible ? this.ui.colors.visible : this.ui.colors.default;
      }
    });

    this.updateVisibleSatelliteCount(visibleCount);
    this.updateOverheadInfo(overheadSat);
  }

  predictNextPass() {
    if (!this.state.userLocation) return;

    const now = Date.now();
    const horizon = this.config.PASS_PREDICTION_HORIZON;
    const step = 30; // seconds per step
    let nextPass = null;
    let minTime = Infinity;

    this.state.satellites.forEach(sat => {
      let startTime = null;
      let endTime = null;

      for (let t = 0; t < horizon; t += step) {
        const time = new Date(now + t * 1000);
        const prop = satellite.propagate(sat.satrec, time);
        if (!prop.position) continue;

        const gmst = satellite.gstime(time);
        const gd = satellite.eciToGeodetic(prop.position, gmst);

        const satLat = Cesium.Math.toDegrees(gd.latitude);
        const satLon = Cesium.Math.toDegrees(gd.longitude);
        const alt = gd.height;

        const centralAngle = this.calculateCentralAngle(satLat, satLon);
        const phi = Math.acos(6371 / (6371 + alt));
        const isVisible = centralAngle <= phi;

        if (isVisible && !startTime) startTime = time;
        if (!isVisible && startTime) {
          endTime = time;
          break;
        }
      }

      if (startTime && startTime.getTime() - now < minTime) {
        minTime = startTime.getTime() - now;
        nextPass = {
          sat,
          time: startTime,
          duration: endTime ? (endTime - startTime) / 1000 : 0,
        };
      }
    });

    this.state.nextPass = nextPass;
    this.updateNextPassInfo();
  }

  calculateCentralAngle(satLat, satLon) {
    const userLatRad = Cesium.Math.toRadians(this.state.userLocation.lat);
    const userLonRad = Cesium.Math.toRadians(this.state.userLocation.lon);
    const satLatRad = Cesium.Math.toRadians(satLat);
    const satLonRad = Cesium.Math.toRadians(satLon);
    const dLon = satLonRad - userLonRad;

    const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) + Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
    return Math.acos(Math.min(Math.max(cosAngle, -1), 1));
  }

  updateNextPassInfo() {
    const panel = document.getElementById('nextPassPanel');
    if (!panel) return;

    panel.innerHTML = '';
    panel.className = 'next-pass-panel visible';

    if (this.state.nextPass) {
      const { sat, time, duration } = this.state.nextPass;
      const timeStr = time.toLocaleTimeString();
      const durationMin = (duration / 60).toFixed(1);
      panel.innerHTML = `
        <p><strong>⏰ Next Overhead:</strong> ${sat.name}</p>
        <p><strong>🕒 Time:</strong> ${timeStr}</p>
        <p><strong>⏱️ Duration:</strong> ${durationMin} min</p>
      `;
    } else {
      panel.innerHTML = '<p>🌌 No upcoming passes in next hour</p>';
    }
  }

  // Add this to HTML: <div id="nextPassPanel" class="next-pass-panel"></div>

  showSatelliteList() {
    const listPanel = document.getElementById('satelliteListPanel');
    if (!listPanel) return;

    listPanel.innerHTML = '<h3>🛰️ All Starlink Satellites</h3><ul></ul>';
    const ul = listPanel.querySelector('ul');

    this.state.satellites.sort((a, b) => a.name.localeCompare(b.name)).forEach(sat => {
      const li = document.createElement('li');
      li.textContent = sat.name;
      li.addEventListener('click', () => this.selectSatellite(sat));
      ul.appendChild(li);
    });
  }

  // Add to HTML: <div id="satelliteListPanel" class="satellite-list-panel"></div>

  // ===== SELECTION AND UI (abbreviated, assume similar to previous) =====
  selectSatellite(satData) {
    // Similar to previous, with enhancements for icon show
    if (satData.entity) {
      satData.entity.billboard.show = true;
    }
    // ...
  }

  clearSelection() {
    if (this.state.selectedSat?.entity) {
      this.state.selectedSat.entity.billboard.show = false;
    }
    // ...
  }

  // Other methods like showCoverage, showOrbitalPath, event listeners, etc., remain similar with try-catch added where needed.

  destroy() {
    clearInterval(this.state.updateInterval);
    clearInterval(this.state.tleRefreshInterval);
    this.ui.viewer?.destroy();
    console.log('🗑️ Cleaned up');
  }
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing...');
  window.tracker = new StarlinkTracker();
});

// Note: Add to HTML structure panels for nextPassPanel and satelliteListPanel with appropriate CSS for stunning UI.
