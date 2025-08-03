/*
 * Mission Control backend
 *
 * This Node/Express server exposes a JSON API for real‑time Starlink positions
 * computed from fresh TLE data using satellite.js and an optional GR integrator.
 * It also serves a static front‑end (public/) which visualises the constellation
 * with Cesium.  A minimal config script (`/config.js`) is generated on each
 * request to expose secret values (like the Cesium Ion token) to the browser
 * without hard‑coding them into the repository.
 */

require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const satellite = require('satellite.js');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
// Serve static assets from the public directory.  Assets in public/ are never
// processed by Node; index.html will load our app.js and other resources.
app.use(express.static(path.join(__dirname, 'public')));

// Generate a tiny config script on the fly.  This allows us to inject
// environment variables (e.g. Cesium Ion token) into the browser at runtime
// without committing secrets to version control.
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  const cesiumToken = process.env.CESIUM_ION_TOKEN || '';
  res.send(`window.CESIUM_ION_TOKEN = "${cesiumToken}";`);
});

// Utility to fetch and parse TLE data.  Given a Celestrak URL it returns an
// array of [name, line1, line2] tuples.  We split the response on newlines
// and group every three lines, ignoring incomplete groups.
async function fetchTLE(url) {
  const res = await fetch(url);
  const text = await res.text();
  return text
    .trim()
    .split('\n')
    .reduce((acc, line, idx) => {
      if (idx % 3 === 0) acc.push([]);
      acc[acc.length - 1].push(line);
      return acc;
    }, [])
    .filter(group => group.length === 3);
}

// Handler for both /positions and /api/starlink/positions endpoints.  It
// requests the latest Starlink TLE data from Celestrak and uses satellite.js
// to propagate each orbit to the current epoch.  Optionally, when
// `selectedIdx` is provided it runs a GR integrator (Python) for that index.
async function handlePositions(req, res) {
  try {
    // Use the Active group by default.  Override via env if needed.
    const tleUrl = process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle';
    const tle = await fetchTLE(tleUrl);
    const now = new Date();
    const gmst = satellite.gstime(now);

    const satellites = [];
    const sats = [];
    tle.forEach(t => {
      const name = t[0].trim();
      // Convert TLE lines to a satellite record
      const satrec = satellite.twoline2satrec(t[1], t[2]);
      const posVel = satellite.propagate(satrec, now);
      if (!posVel.position) return;

      // Cartesian Earth‑centered, Earth‑fixed coordinates
      const ecf = satellite.eciToEcf(posVel.position, gmst);
      // Geodetic coordinates (lat, lon, alt)
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = satellite.degreesLong(geo.longitude);
      const alt = geo.height; // km

      // Speed magnitude for telemetry display
      const v = posVel.velocity;
      const vel = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

      // Approximate orbital period in minutes using mean motion
      const meanMotion = satrec.no * (2 * Math.PI / 86400);
      const semiMajor = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3);
      const period = (2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / 398600.4418)) / 60;

      sats.push({ id: name, x: ecf.x, y: ecf.y, z: ecf.z, vel, alt, satrec, period });
      satellites.push({ lat, lon, alt });
    });

    // Optionally compute a relativistic orbit for a selected satellite.  The
    // integrator is implemented in Python (gr_orbit.py) and invoked via
    // execSync.  The command takes an initial state vector [r, v] and returns
    // an array of positions.  If anything goes wrong the GR data is omitted.
    let gr_sol = [];
    const idx = parseInt(req.query.selectedIdx);
    if (!isNaN(idx) && idx >= 0 && idx < sats.length) {
      const selected = sats[idx];
      const posVel = satellite.propagate(selected.satrec, now);
      const y0 = [
        selected.x,
        selected.y,
        selected.z,
        posVel.velocity.x,
        posVel.velocity.y,
        posVel.velocity.z,
      ];
      try {
        const pythonOut = execSync(`python3 gr_orbit.py "${y0.join(',')}"`).toString().trim();
        gr_sol = JSON.parse(pythonOut);
      } catch (err) {
        console.error('Error running gr_orbit.py:', err.message);
      }
    }

    res.json({
      satellites,    // lat/lon/alt used by the Three.js front‑end
      timestamp: Date.now(),
      sats,          // full ECEF coordinates and period information
      gr_sol,
    });
  } catch (err) {
    console.error('/positions error:', err);
    res.status(500).json({ error: 'Failed to compute positions', details: err.message });
  }
}

// Register API endpoints
app.get('/positions', handlePositions);
app.get('/api/starlink/positions', handlePositions);

// Catch‑all route to support client‑side routing.  If the request doesn’t match
// a file in public/ or one of the API routes we send index.html.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
  console.log(`Mission Control backend listening on port ${port}`);
});