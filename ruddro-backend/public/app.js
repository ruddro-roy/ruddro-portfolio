// Application JavaScript

// Configuration: TLE data source URL (Celestrak Starlink supplemental catalog)
const TLE_URL = "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle";

// Cesium viewer initialization
const viewer = new Cesium.Viewer("cesiumContainer", {
  imageryProvider: new Cesium.TileMapServiceImageryProvider({ 
    url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") 
  }),
  baseLayerPicker: false, geocoder: false, homeButton: false, infoBox: false,
  navigationHelpButton: false, sceneModePicker: false, timeline: false, animation: false
});
viewer.scene.globe.enableLighting = true;  // Enable day/night lighting on globe

// We will use an EntityCollection for satellites (viewer.entities) by default.

// Arrays/objects to store satellite data and entities
let satellites = [];        // Array of satellite data objects { name, tleLine1, tleLine2, satrec, entity, ... }
let satByName = {};         // Lookup from satellite name to data object for quick access
let selectedSat = null;     // Currently selected satellite data object
let coverageEntity = null;  // Entity for coverage footprint (if any)
let userLocation = null;    // {lat, lon} for user if available
let userMarker = null;      // Entity for user location marker

// Colors for different states
const colorDefault = Cesium.Color.YELLOW;
const colorVisible = Cesium.Color.LIME;   // visible satellites (above user horizon)
const colorSelected = Cesium.Color.RED;   // selected satellite highlight

// Utility: convert radians to degrees
const toDegrees = Cesium.Math.toDegrees;

// 1. Fetch TLE data for all Starlink satellites
fetch(TLE_URL).then(response => {
  if (!response.ok) {
    throw new Error(`Failed to fetch TLE data: HTTP ${response.status} - ${response.statusText}`);
  }
  return response.text();
}).then(tleText => {
  const lines = tleText.split(/[\r\n]+/);
  for (let i = 0; i < lines.length; ) {
    const name = lines[i++].trim();
    const line1 = lines[i++]?.trim();
    const line2 = lines[i++]?.trim();
    if (!name || !line1 || !line2) break; // stop if incomplete triplet or end
    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      if (satrec.error !== 0) {
        console.warn(`Skipping invalid TLE for ${name} (error code: ${satrec.error})`);
        continue;
      }
      const satData = { name, line1, line2, satrec };
      satellites.push(satData);
      satByName[name] = satData;
    } catch (error) {
      console.error("TLE parse error for:", name, error);
    }
  }
  console.log(`Loaded ${satellites.length} Starlink satellites.`);
  if (satellites.length === 0) {
    console.warn("No valid satellites loaded. Check TLE source.");
  }
  populateDatalist();   // fill search suggestions
  createSatelliteEntities(); // add satellites to Cesium
  startSimulation();    // begin orbit propagation updates
}).catch(err => {
  console.error("Failed to load TLE data:", err);
});

// 2. Populate the datalist for search suggestions
function populateDatalist() {
  const dataList = document.getElementById("satList");
  // Limit number of suggestions for performance (if needed), but here we add all.
  const fragment = document.createDocumentFragment();
  satellites.forEach(sat => {
    const option = document.createElement("option");
    option.value = sat.name;
    fragment.appendChild(option);
  });
  dataList.appendChild(fragment);
}

// 3. Create Cesium point entities for each satellite
function createSatelliteEntities() {
  satellites.forEach(sat => {
    // Initial position (will be updated immediately in simulation loop anyway)
    const initialPos = Cesium.Cartesian3.fromDegrees(0, 0, 0); 
    // Create point entity
    const entity = viewer.entities.add({
      position: initialPos,
      point: {
        pixelSize: 3,
        color: colorDefault,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1
      },
      // Store the satellite name as the entity's id and label for identification
      id: sat.name,
      name: sat.name
    });
    sat.entity = entity;
  });
}

// 4. Start the simulation loop to update satellite positions (and visibility) in real time
function startSimulation() {
  // If the user location is known, compute which satellites are initially visible
  if (userLocation) updateVisibilityForAll();

  // Use Cesium's clock onTick event or a manual interval. Here we'll use setInterval for simplicity.
  const updateIntervalMs = 1000;  // update every 1 second
  let tickCount = 0;
  setInterval(() => {
    const now = new Date();
    const gmst = satellite.gstime(now);
    // Update each satellite's position
    satellites.forEach(sat => {
      const satrec = sat.satrec;
      // Propagate to current time
      const propagation = satellite.propagate(satrec, now);
      const posEci = propagation.position;
      if (!posEci) {
        // propagation failed (satellite might have decayed)
        return;
      }
      // Convert ECI to geodetic (lat, lon, height)
      const positionGd = satellite.eciToGeodetic(posEci, gmst);
      const lat = positionGd.latitude,
            lon = positionGd.longitude,
            height = positionGd.height * 1000; // in meters
      // Update stored coords (in degrees) for this satellite
      sat.lat = toDegrees(lat);
      sat.lon = toDegrees(lon);
      sat.alt = positionGd.height; // in km
      // Update entity position in Cesium
      const newPos = Cesium.Cartesian3.fromRadians(lon, lat, height);
      sat.entity.position = newPos;
      // If selected, and this is the selected satellite, also update its info display
      if (sat === selectedSat) {
        updateSelectedInfo(); // update info panel with new lat/lon/alt/vel
        // Also move coverage footprint if it exists
        if (coverageEntity) {
          coverageEntity.position = newPos.clone(); // move coverage center to new subpoint
          updateCoverageRadius(sat.alt);
        }
      }
    });

    // Update visibility highlighting periodically (not necessarily every tick for performance)
    if (userLocation) {
      tickCount++;
      const visibilityCheckInterval = 5; // seconds
      if (tickCount % visibilityCheckInterval === 0) {
        updateVisibilityForAll();
      }
    }
  }, updateIntervalMs);
}

// 5. Geolocation: get user location and add marker (triggered on load)
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude
    };
    console.log("User location obtained:", userLocation);
    // Add a marker on the globe for user location
    userMarker = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(userLocation.lon, userLocation.lat, 0),
      point: {
        pixelSize: 10,
        color: Cesium.Color.CYAN,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2
      },
      label: {
        text: "You",
        showBackground: true,
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.5),
        horizontalOrigin: Cesium.HorizontalOrigin.LEFT,
        pixelOffset: new Cesium.Cartesian2(8, -5) // offset right a bit
      }
    });
  }, error => {
    console.warn("Geolocation permission denied or unavailable.");
  });
}

// 6. Visibility computation: mark satellites as visible or not (change color)
function updateVisibilityForAll() {
  if (!userLocation) return;
  const userLatRad = Cesium.Math.toRadians(userLocation.lat);
  const userLonRad = Cesium.Math.toRadians(userLocation.lon);
  const R = 6371.0; // Earth radius in km (approx)
  satellites.forEach(sat => {
    // Compute central angle between user and satellite subpoint using haversine
    const satLatRad = Cesium.Math.toRadians(sat.lat);
    const satLonRad = Cesium.Math.toRadians(sat.lon);
    const dLon = satLonRad - userLonRad;
    const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) +
                     Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
    // Clamp cosAngle between -1 and 1
    const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
    // Horizon angle φ = arccos(R/(R+h))
    const phi = Math.acos(R / (R + sat.alt));
    const isVisible = centralAngle <= phi;
    // Update color if not selected (selected gets its own color)
    if (sat !== selectedSat) {
      sat.entity.point.color = isVisible ? colorVisible : colorDefault;
    }
    sat.isVisible = isVisible;
  });
}

// 7. When a satellite is selected (from search or click), highlight it and show info
function selectSatellite(satData) {
  if (!satData || satData === selectedSat) return;
  // Deselect previous selection
  if (selectedSat) {
    // Reset color of previously selected satellite based on visibility or default state
    const prevSat = selectedSat;
    if (prevSat.isVisible && userLocation) {
      prevSat.entity.point.color = colorVisible;
    } else {
      prevSat.entity.point.color = colorDefault;
    }
    prevSat.entity.point.pixelSize = 3;
  }
  // Set new selected
  selectedSat = satData;
  // Highlight this satellite
  selectedSat.entity.point.color = colorSelected;
  selectedSat.entity.point.pixelSize = 6;
  // Fly camera to the satellite
  viewer.flyTo(selectedSat.entity, { duration: 1.5 });
  // Update the info panel content
  showSatelliteInfo(selectedSat);
  // Create or move coverage footprint
  showCoverage(selectedSat);
}

// Display satellite info in the sidebar info panel
function showSatelliteInfo(sat) {
  const infoPanel = document.getElementById("infoPanel");
  // Clear previous content
  infoPanel.innerHTML = "";
  // Satellite title
  const title = document.createElement("h3");
  title.textContent = sat.name;
  infoPanel.appendChild(title);
  // Create elements for each piece of info
  const posPara = document.createElement("p");
  posPara.innerHTML = 
    `Latitude: <span id="infoLat"></span>°<br/>
     Longitude: <span id="infoLon"></span>°<br/>
     Altitude: <span id="infoAlt"></span> km<br/>
     Velocity: <span id="infoVel"></span> km/s`;
  infoPanel.appendChild(posPara);
  // TLE lines
  const tlePara = document.createElement("p");
  tlePara.textContent = "TLE:";
  infoPanel.appendChild(tlePara);
  const tlePre = document.createElement("pre");
  tlePre.textContent = sat.line1 + "\n" + sat.line2;
  infoPanel.appendChild(tlePre);
  // Now fill initial values
  updateSelectedInfo();
}

// Update the info panel fields for selected satellite (called on each propagation update)
function updateSelectedInfo() {
  if (!selectedSat) return;
  // selectedSat.lat, .lon, .alt are updated in propagation loop
  const latSpan = document.getElementById("infoLat");
  const lonSpan = document.getElementById("infoLon");
  const altSpan = document.getElementById("infoAlt");
  const velSpan = document.getElementById("infoVel");
  if (latSpan) {
    latSpan.textContent = selectedSat.lat.toFixed(2);
    lonSpan.textContent = selectedSat.lon.toFixed(2);
    altSpan.textContent = selectedSat.alt.toFixed(1);
    // Compute velocity magnitude from satrec if possible
    const vel = getCurrentVelocity(selectedSat);
    velSpan.textContent = vel ? vel.toFixed(2) : "?";
  }
}

// Compute current velocity magnitude (km/s) of a satellite (using its satrec and now)
function getCurrentVelocity(sat) {
  try {
    const pv = satellite.propagate(sat.satrec, new Date());
    if (pv.velocity) {
      const vx = pv.velocity.x, vy = pv.velocity.y, vz = pv.velocity.z;
      // velocity vector is in km/s in ECI coordinates
      return Math.sqrt(vx*vx + vy*vy + vz*vz);
    }
  } catch(e) {}
  return null;
}

// Show or update coverage footprint for a satellite
function showCoverage(sat) {
  const lat = sat.lat;
  const lon = sat.lon;
  const altKm = sat.alt;
  const R = 6371.0;
  // Compute coverage radius (distance from sub-point to horizon on Earth's surface)
  const phi = Math.acos(R / (R + altKm)); // central angle in radians
  const radiusMeters = R * 1000 * phi;    // arc length = R * phi (converted to meters)
  if (!coverageEntity) {
    // Create a new coverage ellipse entity
    coverageEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0), // on Earth's surface
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: Cesium.Color.BLUE.withAlpha(0.2),
        height: 0  // on ground
      }
    });
  } else {
    // Update existing coverage entity
    coverageEntity.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    coverageEntity.ellipse.semiMajorAxis = radiusMeters;
    coverageEntity.ellipse.semiMinorAxis = radiusMeters;
  }
}

// Update coverage radius if altitude changes significantly (called during propagation updates for selected sat)
function updateCoverageRadius(altKm) {
  if (!coverageEntity) return;
  const R = 6371.0;
  const phi = Math.acos(R / (R + altKm));
  const radiusMeters = R * 1000 * phi;
  coverageEntity.ellipse.semiMajorAxis = radiusMeters;
  coverageEntity.ellipse.semiMinorAxis = radiusMeters;
}

// 8. Event listeners for UI interactions

// Search box selection (when user picks a name from the datalist or presses enter)
const searchInput = document.getElementById("searchBox");
searchInput.addEventListener("change", () => {
  const query = searchInput.value.trim();
  if (query && satByName[query]) {
    selectSatellite(satByName[query]);
  }
});

// Optional: also handle pressing "Enter" in the search box
searchInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query && satByName[query]) {
      selectSatellite(satByName[query]);
    }
  }
});

// Handle clicking on the globe to select a satellite
viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
  const picked = viewer.scene.pick(movement.position);
  if (Cesium.defined(picked) && picked.id) {
    const pickedName = picked.id.id || picked.id.name;
    if (pickedName && satByName[pickedName]) {
      selectSatellite(satByName[pickedName]);
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Theme toggle button
document.getElementById("toggleThemeBtn").addEventListener("click", () => {
  const body = document.body;
  if (body.classList.contains("dark")) {
    body.classList.remove("dark");
    body.classList.add("light");
  } else if (body.classList.contains("light")) {
    body.classList.remove("light");
    body.classList.add("dark");
  } else {
    // if no class (shouldn't happen, default is dark), add dark
    body.classList.add("dark");
  }
});

// Sidebar toggle for mobile
const sidebar = document.getElementById("sidebar");
const panelToggleBtn = document.getElementById("togglePanelBtn");
panelToggleBtn.addEventListener("click", () => {
  if (sidebar.classList.contains("show")) {
    sidebar.classList.remove("show");
  } else {
    sidebar.classList.add("show");
  }
});

// Export visible satellites to CSV
document.getElementById("exportBtn").addEventListener("click", () => {
  if (!userLocation) {
    alert("User location not available. Visible satellite data cannot be determined.");
    return;
  }
  // Prepare CSV content
  let csvContent = "Satellite Name,Latitude (deg),Longitude (deg),Altitude (km)\n";
  satellites.forEach(sat => {
    if (sat.isVisible) {
      csvContent += `${sat.name},${sat.lat.toFixed(2)},${sat.lon.toFixed(2)},${sat.alt.toFixed(1)}\n`;
    }
  });
  // Create a downloadable blob
  const blob = new Blob([csvContent], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `visible_starlinks_${userLocation.lat.toFixed(2)}_${userLocation.lon.toFixed(2)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
