// Configuration and Initialization
const TLE_URL = "https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle";

// Initialize Cesium Viewer
const viewer = new Cesium.Viewer("cesiumContainer", {
  imageryProvider: new Cesium.TileMapServiceImageryProvider({
    url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII")
  }),
  baseLayerPicker: false, geocoder: false, homeButton: false,
  infoBox: false, navigationHelpButton: false, sceneModePicker: false,
  timeline: false, animation: false
});
viewer.scene.globe.enableLighting = true;  // day/night lighting on globe

// Data storage
let satellites = [];
let satByName = {};
let selectedSat = null;
let coverageEntity = null;
let userLocation = null;
let userMarker = null;
let selectedMarker = null;  // marker for selected satellite (billboard icon)

const colorDefault = Cesium.Color.YELLOW;
const colorVisible = Cesium.Color.LIME;
const colorSelected = Cesium.Color.RED;
const crosshairIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDIwIDIwIj4KPGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPgo8bGluZSB4MT0iMTAiIHkxPSIyIiB4Mj0iMTAiIHkyPSIxOCIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPgo8bGluZSB4MT0iMiIgeTE9IjEwIiB4Mj0iMTgiIHkyPSIxMCIgc3Ryb2tlPSJyZWQiIHN0cm9rZS13aWR0aD0iMiIvPgo8L3N2Zz4=';

// 1. Fetch TLE data for all Starlink satellites
fetch(TLE_URL).then(res => {
  if (!res.ok) throw new Error(`TLE fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}).then(tleText => {
  const lines = tleText.split(/[\r\n]+/);
  for (let i = 0; i < lines.length; ) {
    const name = lines[i++].trim();
    const line1 = lines[i++]?.trim();
    const line2 = lines[i++]?.trim();
    if (!name || !line1 || !line2) break;
    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      if (satrec.error) {
        console.warn(`Skipping invalid TLE for ${name} (error: ${satrec.error})`);
        continue;
      }
      const satData = { name, line1, line2, satrec };
      satellites.push(satData);
      satByName[name] = satData;
    } catch (err) {
      console.error("TLE parse error for", name, err);
    }
  }
  console.log(`Loaded ${satellites.length} Starlink satellites.`);
  if (!satellites.length) {
    console.warn("No satellites loaded. Check TLE source.");
  }
  populateDatalist();
  createSatelliteEntities();
  startSimulation();
}).catch(err => {
  console.error("Failed to load TLE data:", err);
});

// 2. Populate the datalist for search suggestions
function populateDatalist() {
  const dataList = document.getElementById("satList");
  const fragment = document.createDocumentFragment();
  satellites.forEach(sat => {
    const opt = document.createElement("option");
    opt.value = sat.name;
    fragment.appendChild(opt);
  });
  dataList.appendChild(fragment);
}

// 3. Create Cesium point entities for each satellite
function createSatelliteEntities() {
  satellites.forEach(sat => {
    const entity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(0, 0, 0),  // temp position, will update
      point: {
        pixelSize: 3,
        color: colorDefault,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1
      },
      id: sat.name,
      name: sat.name
    });
    sat.entity = entity;
  });
}

// 4. Start the simulation loop to update positions in real-time
function startSimulation() {
  if (userLocation) {
    updateVisibilityForAll();  // initial visibility classification
  }
  const updateIntervalMs = 1000;
  let tickCount = 0;
  setInterval(() => {
    const now = new Date();
    const gmst = satellite.gstime(now);
    satellites.forEach(sat => {
      // Propagate satellite to current time
      const { position: posEci } = satellite.propagate(sat.satrec, now);
      if (!posEci) return;  // skip if propagation failed (sat may have decayed)
      // ECI to geodetic coordinates
      const positionGd = satellite.eciToGeodetic(posEci, gmst);
      const lat = positionGd.latitude;
      const lon = positionGd.longitude;
      const altKm = positionGd.height;  // altitude in km
      sat.lat = Cesium.Math.toDegrees(lat);
      sat.lon = Cesium.Math.toDegrees(lon);
      sat.alt = altKm;
      // Update Cesium entity position (in ECEF Cartesian3)
      const newPos = Cesium.Cartesian3.fromRadians(lon, lat, altKm * 1000);
      sat.entity.position = newPos;
      // If this satellite is selected, update its info and related visuals
      if (sat === selectedSat) {
        updateSelectedInfo();
        if (coverageEntity) {
          coverageEntity.position = newPos.clone();
          updateCoverageRadius(sat.alt);
        }
        if (selectedMarker) {
          selectedMarker.position = newPos.clone();
        }
      }
    });
    // Periodically update visibility statuses and overhead info
    if (userLocation) {
      tickCount++;
      if (tickCount % 5 === 0) {
        updateVisibilityForAll();
      }
    }
  }, updateIntervalMs);
}

// 5. Geolocation: get user location and add a marker
if (navigator.geolocation) {
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    console.log("User location:", userLocation);
    // Mark user location on globe
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
        pixelOffset: new Cesium.Cartesian2(8, -5)
      }
    });
    // Show overhead info panel now that location is available
    document.getElementById("overheadPanel").style.display = 'block';
  }, error => {
    console.warn("Geolocation permission denied or unavailable.");
    const overheadPanel = document.getElementById("overheadPanel");
    overheadPanel.style.display = 'block';
    overheadPanel.textContent = "Location permission denied.";
  });
}

// 6. Visibility computation: mark satellites as visible (above horizon) or not
function updateVisibilityForAll() {
  if (!userLocation) return;
  const R = 6371.0;
  const userLatRad = Cesium.Math.toRadians(userLocation.lat);
  const userLonRad = Cesium.Math.toRadians(userLocation.lon);
  satellites.forEach(sat => {
    // Calculate angle between user and satellite (at Earth's center)
    const satLatRad = Cesium.Math.toRadians(sat.lat);
    const satLonRad = Cesium.Math.toRadians(sat.lon);
    const dLon = satLonRad - userLonRad;
    const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) +
                     Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
    const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
    // Horizon angle φ for satellite altitude
    const phi = Math.acos(R / (R + sat.alt));
    const isVisible = (centralAngle <= phi);
    // Update color if not the selected one (selected stays red)
    if (sat !== selectedSat) {
      sat.entity.point.color = isVisible ? colorVisible : colorDefault;
    }
    sat.isVisible = isVisible;
  });
  // Update overhead satellite info panel
  updateOverheadInfo();
}

// 6.5 Helper: Update overhead/next satellite info for user’s location
function updateOverheadInfo() {
  if (!userLocation) return;
  const overheadPanel = document.getElementById("overheadPanel");
  if (!overheadPanel) return;
  // Determine which visible satellite is highest (closest to overhead) and which is next to rise
  let bestSat = null, bestCos = -1;
  let nextSat = null, minAngleDiff = Infinity;
  const R = 6371.0;
  const userLatRad = Cesium.Math.toRadians(userLocation.lat);
  const userLonRad = Cesium.Math.toRadians(userLocation.lon);
  const now = new Date();
  satellites.forEach(sat => {
    const satLatRad = Cesium.Math.toRadians(sat.lat);
    const satLonRad = Cesium.Math.toRadians(sat.lon);
    const dLon = satLonRad - userLonRad;
    const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) +
                     Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
    const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
    const phi = Math.acos(R / (R + sat.alt));
    if (centralAngle <= phi) {
      // Satellite is currently above horizon
      if (cosAngle > bestCos) {
        bestCos = cosAngle;
        bestSat = sat;
      }
    } else {
      // Satellite is below horizon
      const diff = centralAngle - phi;
      if (diff < minAngleDiff) {
        minAngleDiff = diff;
        nextSat = sat;
      }
    }
  });
  // Update the overheadPanel content
  overheadPanel.innerHTML = "";
  const currentP = document.createElement("p");
  currentP.textContent = bestSat 
    ? `Overhead now: ${bestSat.name}` 
    : "No satellite overhead currently";
  overheadPanel.appendChild(currentP);
  if (nextSat) {
    // Estimate time until next satellite rises above horizon
    let etaStr = "";
    try {
      let visible = false;
      let minutes;
      for (minutes = 1; minutes <= 120; minutes++) {
        const future = new Date(now.getTime() + minutes * 60000);
        const gmst = satellite.gstime(future);
        const prop = satellite.propagate(nextSat.satrec, future);
        if (prop.position) {
          const posEci = prop.position;
          const gdPos = satellite.eciToGeodetic(posEci, gmst);
          const lat = gdPos.latitude, lon = gdPos.longitude, alt = gdPos.height;
          const satLatRad = lat, satLonRad = lon;
          const dLon2 = satLonRad - userLonRad;
          const cosAngle2 = Math.sin(userLatRad) * Math.sin(satLatRad) +
                            Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon2);
          const centralAngle2 = Math.acos(Math.min(Math.max(cosAngle2, -1), 1));
          const phi2 = Math.acos(R / (R + alt));
          if (centralAngle2 <= phi2) {
            visible = true;
            break;
          }
        }
      }
      if (visible) {
        etaStr = `in ~${minutes} min`;
      }
    } catch (e) {
      console.error("Next satellite ETA calculation error:", e);
    }
    const nextP = document.createElement("p");
    nextP.textContent = `Next satellite: ${nextSat.name}` + (etaStr ? ` ${etaStr}` : "");
    overheadPanel.appendChild(nextP);
  }
}

// 7. Selection handling: highlight satellite and show info
function selectSatellite(satData) {
  if (!satData || satData === selectedSat) return;
  // Deselect previous selection
  if (selectedSat) {
    const prevSat = selectedSat;
    // Restore its color based on visibility
    prevSat.entity.point.color = (prevSat.isVisible && userLocation) ? colorVisible : colorDefault;
    prevSat.entity.point.pixelSize = 3;
    // Remove previously added marker (if any)
    if (selectedMarker) {
      viewer.entities.remove(selectedMarker);
      selectedMarker = null;
    }
  }
  // Select the new satellite
  selectedSat = satData;
  // Highlight it (red color and larger size)
  selectedSat.entity.point.color = colorSelected;
  selectedSat.entity.point.pixelSize = 6;
  // Add a billboard crosshair icon at the satellite's position for easier tracking
  selectedMarker = viewer.entities.add({
    position: selectedSat.entity.position.clone(),
    billboard: {
      image: crosshairIcon,
      verticalOrigin: Cesium.VerticalOrigin.CENTER,
      horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
      scale: 0.5
    }
  });
  // Fly camera to the selected satellite
  viewer.flyTo(selectedSat.entity, { duration: 1.5 });
  // Populate the info panel with this satellite's details
  showSatelliteInfo(selectedSat);
  // Show coverage footprint on Earth (blue circle) for this satellite
  showCoverage(selectedSat);
}

// Display satellite info in the sidebar info panel
function showSatelliteInfo(sat) {
  const infoPanel = document.getElementById("infoPanel");
  infoPanel.innerHTML = "";
  const title = document.createElement("h3");
  title.textContent = sat.name;
  infoPanel.appendChild(title);
  const posPara = document.createElement("p");
  posPara.innerHTML =
    `Latitude: <span id="infoLat"></span>°<br/>
     Longitude: <span id="infoLon"></span>°<br/>
     Altitude: <span id="infoAlt"></span> km<br/>
     Velocity: <span id="infoVel"></span> km/s`;
  infoPanel.appendChild(posPara);
  const tlePara = document.createElement("p");
  tlePara.textContent = "TLE:";
  infoPanel.appendChild(tlePara);
  const tlePre = document.createElement("pre");
  tlePre.textContent = sat.line1 + "\n" + sat.line2;
  infoPanel.appendChild(tlePre);
  // Fill in the initial values
  updateSelectedInfo();
}

// Update the info panel fields for the selected satellite on each tick
function updateSelectedInfo() {
  if (!selectedSat) return;
  const latSpan = document.getElementById("infoLat");
  const lonSpan = document.getElementById("infoLon");
  const altSpan = document.getElementById("infoAlt");
  const velSpan = document.getElementById("infoVel");
  if (latSpan) {
    latSpan.textContent = selectedSat.lat.toFixed(2);
    lonSpan.textContent = selectedSat.lon.toFixed(2);
    altSpan.textContent = selectedSat.alt.toFixed(1);
    const vel = getCurrentVelocity(selectedSat);
    velSpan.textContent = vel ? vel.toFixed(2) : "?";
  }
}

// Compute current velocity magnitude (km/s) of a satellite from its satrec
function getCurrentVelocity(sat) {
  try {
    const pv = satellite.propagate(sat.satrec, new Date());
    if (pv.velocity) {
      const { x: vx, y: vy, z: vz } = pv.velocity;
      return Math.sqrt(vx*vx + vy*vy + vz*vz);
    }
  } catch (e) {}
  return null;
}

// Show or update coverage footprint (ground coverage circle) for a satellite
function showCoverage(sat) {
  const lat = sat.lat;
  const lon = sat.lon;
  const altKm = sat.alt;
  const R = 6371.0;
  // Radius of coverage (distance to horizon)
  const phi = Math.acos(R / (R + altKm));
  const radiusMeters = R * 1000 * phi;
  if (!coverageEntity) {
    coverageEntity = viewer.entities.add({
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
      ellipse: {
        semiMajorAxis: radiusMeters,
        semiMinorAxis: radiusMeters,
        material: Cesium.Color.BLUE.withAlpha(0.2),
        height: 0
      }
    });
  } else {
    coverageEntity.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    coverageEntity.ellipse.semiMajorAxis = radiusMeters;
    coverageEntity.ellipse.semiMinorAxis = radiusMeters;
  }
}

// Update coverage radius if altitude changes (called during propagation updates)
function updateCoverageRadius(altKm) {
  if (!coverageEntity) return;
  const R = 6371.0;
  const phi = Math.acos(R / (R + altKm));
  const radiusMeters = R * 1000 * phi;
  coverageEntity.ellipse.semiMajorAxis = radiusMeters;
  coverageEntity.ellipse.semiMinorAxis = radiusMeters;
}

// 8. UI Event Listeners

// Search box selection
const searchInput = document.getElementById("searchBox");
searchInput.addEventListener("change", () => {
  const query = searchInput.value.trim();
  if (query && satByName[query]) {
    selectSatellite(satByName[query]);
  }
});
searchInput.addEventListener("keyup", e => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query && satByName[query]) {
      selectSatellite(satByName[query]);
    }
  }
});

// Click on globe to select a satellite
viewer.screenSpaceEventHandler.setInputAction((movement) => {
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
  }
});

// Sidebar toggle (for mobile)
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
    alert("Enable location to determine visible satellites.");
    return;
  }
  let csvContent = "Satellite Name,Latitude (deg),Longitude (deg),Altitude (km)\n";
  satellites.forEach(sat => {
    if (sat.isVisible) {
      csvContent += `${sat.name},${sat.lat.toFixed(2)},${sat.lon.toFixed(2)},${sat.alt.toFixed(1)}\n`;
    }
  });
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

// Reset View button: zoom out to full Earth view and clear selection
document.getElementById("resetViewBtn").addEventListener("click", () => {
  // Deselect any selected satellite
  if (selectedSat) {
    // restore its color and size
    selectedSat.entity.point.color = (selectedSat.isVisible && userLocation) ? colorVisible : colorDefault;
    selectedSat.entity.point.pixelSize = 3;
    selectedSat = null;
  }
  // Remove coverage and marker if they exist
  if (coverageEntity) {
    viewer.entities.remove(coverageEntity);
    coverageEntity = null;
  }
  if (selectedMarker) {
    viewer.entities.remove(selectedMarker);
    selectedMarker = null;
  }
  // Zoom out to show all entities (entire constellation and Earth)
  viewer.zoomTo(viewer.entities);  //:contentReference[oaicite:3]{index=3}
  // On mobile, hide sidebar for a full view
  if (sidebar.classList.contains("show")) {
    sidebar.classList.remove("show");
  }
});
