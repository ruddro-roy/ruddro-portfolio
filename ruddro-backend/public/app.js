// Application JavaScript

const TLE_URL = "https://celestrak.org/NORAD/elements/starlink.txt";

// Cesium viewer initialization
const viewer = new Cesium.Viewer("cesiumContainer", {
  imageryProvider: new Cesium.TileMapServiceImageryProvider({ 
    url: Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII") 
  }),
  baseLayerPicker: false, geocoder: false, homeButton: false, infoBox: false,
  navigationHelpButton: false, sceneModePicker: false, timeline: false, animation: false
});
viewer.scene.globe.enableLighting = true;

let satellites = [];
let satByName = {};
let selectedSat = null;
let coverageEntity = null;
let userLocation = null;
let userMarker = null;

const colorDefault = Cesium.Color.YELLOW;
const colorVisible = Cesium.Color.LIME;
const colorSelected = Cesium.Color.RED;

const toDegrees = Cesium.Math.toDegrees;

// 1. Fetch TLE data for all Starlink satellites
fetch(TLE_URL).then(response => response.text()).then(tleText => {
  const lines = tleText.split(/[\r\n]+/);
  for (let i = 0; i < lines.length; ) {
    const name = lines[i++]?.trim();
    const line1 = lines[i++]?.trim();
    const line2 = lines[i++]?.trim();
    if (!name || !line1 || !line2) break; // stop if file ended
    let satrec;
    try {
      satrec = satellite.twoline2satrec(line1, line2);
      if (!satrec) continue;
      // Defensive: skip invalid TLEs (deep check)
      if (satrec.error) continue;
    } catch (error) {
      console.error("TLE parse error for:", name, error);
      continue;
    }
    const satData = { name, line1, line2, satrec };
    satellites.push(satData);
    satByName[name] = satData;
  }
  console.log(`Loaded ${satellites.length} Starlink satellites.`);
  populateDatalist();
  createSatelliteEntities();
  startSimulation();
}).catch(err => {
  console.error("Failed to load TLE data:", err);
});

// 2. Populate the datalist for search suggestions
function populateDatalist() {
  const dataList = document.getElementById("satList");
  dataList.innerHTML = ""; // Clear previous if any
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
    // Initial dummy position, will update in sim loop
    const initialPos = Cesium.Cartesian3.fromDegrees(0, 0, 0); 
    const entity = viewer.entities.add({
      position: initialPos,
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

// 4. Start the simulation loop to update satellite positions
function startSimulation() {
  if (userLocation) updateVisibilityForAll();

  const updateIntervalMs = 1000;  // update every 1 second
  let tickCount = 0;
  setInterval(() => {
    const now = new Date();
    const gmst = satellite.gstime(now);
    satellites.forEach(sat => {
      try {
        const satrec = sat.satrec;
        // Defensive: skip satellites with bad satrec
        if (!satrec) return;
        // Propagate to current time
        const propagation = satellite.propagate(satrec, now);
        const posEci = propagation.position;
        if (!posEci
          || isNaN(posEci.x) || isNaN(posEci.y) || isNaN(posEci.z)) {
          return;
        }
        // Convert ECI to geodetic
        const positionGd = satellite.eciToGeodetic(posEci, gmst);
        const lat = positionGd.latitude;
        const lon = positionGd.longitude;
        const height = positionGd.height * 1000; // meters
        if ([lat, lon, height].some(isNaN)) return;

        // Defensive: ensure Cesium input is valid
        const newPos = Cesium.Cartesian3.fromRadians(lon, lat, height);
        if (!newPos) return;

        sat.lat = toDegrees(lat);
        sat.lon = toDegrees(lon);
        sat.alt = positionGd.height; // in km
        sat.entity.position = newPos;

        if (sat === selectedSat) {
          updateSelectedInfo();
          if (coverageEntity) {
            coverageEntity.position = newPos.clone();
            updateCoverageRadius(sat.alt);
          }
        }
      } catch (err) {
        // Defensive: never let a single satellite break rendering
        return;
      }
    });

    if (userLocation) {
      tickCount++;
      const visibilityCheckInterval = 5;
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
  }, error => {
    console.warn("Geolocation permission denied or unavailable.");
  });
}

// 6. Visibility computation: mark satellites as visible or not (change color)
function updateVisibilityForAll() {
  if (!userLocation) return;
  const userLatRad = Cesium.Math.toRadians(userLocation.lat);
  const userLonRad = Cesium.Math.toRadians(userLocation.lon);
  const R = 6371.0;
  satellites.forEach(sat => {
    if (
      typeof sat.lat !== "number" || typeof sat.lon !== "number" ||
      typeof sat.alt !== "number" || isNaN(sat.lat) || isNaN(sat.lon) || isNaN(sat.alt)
    ) return;
    const satLatRad = Cesium.Math.toRadians(sat.lat);
    const satLonRad = Cesium.Math.toRadians(sat.lon);
    const dLon = satLonRad - userLonRad;
    const cosAngle = Math.sin(userLatRad) * Math.sin(satLatRad) +
      Math.cos(userLatRad) * Math.cos(satLatRad) * Math.cos(dLon);
    const centralAngle = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
    const phi = Math.acos(R / (R + sat.alt));
    const isVisible = centralAngle <= phi;
    if (sat !== selectedSat) {
      sat.entity.point.color = isVisible ? colorVisible : colorDefault;
    }
    sat.isVisible = isVisible;
  });
}

// 7. Satellite selection, info display, coverage
function selectSatellite(satData) {
  if (!satData || satData === selectedSat) return;
  if (selectedSat) {
    const prevSat = selectedSat;
    if (prevSat.isVisible && userLocation) {
      prevSat.entity.point.color = colorVisible;
    } else {
      prevSat.entity.point.color = colorDefault;
    }
    prevSat.entity.point.pixelSize = 3;
  }
  selectedSat = satData;
  selectedSat.entity.point.color = colorSelected;
  selectedSat.entity.point.pixelSize = 6;
  viewer.flyTo(selectedSat.entity, { duration: 1.5 });
  showSatelliteInfo(selectedSat);
  showCoverage(selectedSat);
}

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
  updateSelectedInfo();
}

function updateSelectedInfo() {
  if (!selectedSat) return;
  const latSpan = document.getElementById("infoLat");
  const lonSpan = document.getElementById("infoLon");
  const altSpan = document.getElementById("infoAlt");
  const velSpan = document.getElementById("infoVel");
  if (latSpan) {
    latSpan.textContent = isNaN(selectedSat.lat) ? "?" : selectedSat.lat.toFixed(2);
    lonSpan.textContent = isNaN(selectedSat.lon) ? "?" : selectedSat.lon.toFixed(2);
    altSpan.textContent = isNaN(selectedSat.alt) ? "?" : selectedSat.alt.toFixed(1);
    const vel = getCurrentVelocity(selectedSat);
    velSpan.textContent = vel ? vel.toFixed(2) : "?";
  }
}

function getCurrentVelocity(sat) {
  try {
    const pv = satellite.propagate(sat.satrec, new Date());
    if (pv.velocity) {
      const vx = pv.velocity.x, vy = pv.velocity.y, vz = pv.velocity.z;
      return Math.sqrt(vx*vx + vy*vy + vz*vz);
    }
  } catch(e) {}
  return null;
}

function showCoverage(sat) {
  const lat = sat.lat;
  const lon = sat.lon;
  const altKm = sat.alt;
  const R = 6371.0;
  if (
    typeof lat !== "number" || typeof lon !== "number" ||
    typeof altKm !== "number" || isNaN(lat) || isNaN(lon) || isNaN(altKm)
  ) return;
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

function updateCoverageRadius(altKm) {
  if (!coverageEntity) return;
  const R = 6371.0;
  const phi = Math.acos(R / (R + altKm));
  const radiusMeters = R * 1000 * phi;
  coverageEntity.ellipse.semiMajorAxis = radiusMeters;
  coverageEntity.ellipse.semiMinorAxis = radiusMeters;
}

// 8. Event listeners for UI interactions
const searchInput = document.getElementById("searchBox");
searchInput.addEventListener("change", () => {
  const query = searchInput.value.trim();
  if (query && satByName[query]) {
    selectSatellite(satByName[query]);
  }
});
searchInput.addEventListener("keyup", (e) => {
  if (e.key === "Enter") {
    const query = searchInput.value.trim();
    if (query && satByName[query]) {
      selectSatellite(satByName[query]);
    }
  }
});
viewer.screenSpaceEventHandler.setInputAction(function onLeftClick(movement) {
  const picked = viewer.scene.pick(movement.position);
  if (Cesium.defined(picked) && picked.id) {
    const pickedName = picked.id.id || picked.id.name;
    if (pickedName && satByName[pickedName]) {
      selectSatellite(satByName[pickedName]);
    }
  }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

document.getElementById("toggleThemeBtn").addEventListener("click", () => {
  const body = document.body;
  if (body.classList.contains("dark")) {
    body.classList.remove("dark");
    body.classList.add("light");
  } else if (body.classList.contains("light")) {
    body.classList.remove("light");
    body.classList.add("dark");
  } else {
    body.classList.add("dark");
  }
});

const sidebar = document.getElementById("sidebar");
const panelToggleBtn = document.getElementById("togglePanelBtn");
panelToggleBtn.addEventListener("click", () => {
  if (sidebar.classList.contains("show")) {
    sidebar.classList.remove("show");
  } else {
    sidebar.classList.add("show");
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  if (!userLocation) {
    alert("User location not available. Visible satellite data cannot be determined.");
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
