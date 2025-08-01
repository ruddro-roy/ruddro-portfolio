const express = require('express');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const satellite = require('satellite.js');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public')); // serve index.html from ruddro-backend/public

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
    .filter((group) => group.length === 3);
}

async function handlePositions(req, res) {
  try {
    const tle = await fetchTLE('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle');
    const now = new Date();
    const gmst = satellite.gstime(now);

    const satellites = [];
    const sats = [];

    tle.forEach((t) => {
      const satrec = satellite.twoline2satrec(t[1], t[2]);
      const posVel = satellite.propagate(satrec, now);
      if (!posVel.position) return;

      // Cartesian ECF
      const ecf = satellite.eciToEcf(posVel.position, gmst);
      // Geodetic coordinates
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = satellite.degreesLong(geo.longitude);
      const alt = geo.height; // km

      // Speed for future use
      const v = posVel.velocity;
      const vel = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

      // Orbital period in minutes
      const meanMotion = satrec.no * (2 * Math.PI / 86400);
      const semiMajor = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3);
      const period = (2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / 398600.4418)) / 60;

      sats.push({ id: t[0].trim(), x: ecf.x, y: ecf.y, z: ecf.z, vel, alt, satrec, period });
      satellites.push({ lat, lon, alt });
    });

    // optional GR integration if selectedIdx is present
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
      satellites,    // for Three.js front‑end {lat, lon, alt}
      timestamp: Date.now(),
      sats,          // full ECF + period data
      gr_sol,
    });
  } catch (err) {
    console.error('/positions error:', err);
    res.status(500).json({ error: 'Failed to compute positions', details: err.message });
  }
}

// expose both paths with the same handler
app.get('/positions', handlePositions);
app.get('/api/starlink/positions', handlePositions);

app.listen(port, () => {
  console.log(`Backend running on port ${port}`);
});
