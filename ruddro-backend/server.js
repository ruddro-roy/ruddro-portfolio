const express = require('express');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const satellite = require('satellite.js');

const app = express();
const port = 3000;

// Serve your frontend from the `public` directory
app.use(express.static('public'));

// Helper to fetch and parse TLE data into groups of three lines
async function fetchTLE(url) {
  const res = await fetch(url);
  const text = await res.text();
  return text
    .trim()
    .split('\n')
    .reduce((acc, line, i) => {
      if (i % 3 === 0) acc.push([]);
      acc[acc.length - 1].push(line);
      return acc;
    }, [])
    .filter((group) => group.length === 3);
}

// Main API endpoint
app.get('/positions', async (req, res) => {
  try {
    const tle = await fetchTLE(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle'
    );
    const debrisTle = await fetchTLE(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle'
    );
    const now = new Date();

    // Convert each TLE entry into position/velocity data
    const sats = tle
      .map((t) => {
        const satrec = satellite.twoline2satrec(t[1], t[2]);
        const posVel = satellite.propagate(satrec, now);
        if (!posVel.position) return null;

        const gmst = satellite.gstime(now);
        const ecf = satellite.eciToEcf(posVel.position, gmst);

        const velVec = posVel.velocity;
        const speed = Math.sqrt(
          velVec.x * velVec.x + velVec.y * velVec.y + velVec.z * velVec.z
        );
        const alt = Math.sqrt(ecf.x * ecf.x + ecf.y * ecf.y + ecf.z * ecf.z) - 6371;

        // Compute orbital period from mean motion
        const meanMotion = satrec.no * (2 * Math.PI / 86400); // rad/s
        const semiMajor = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3);
        const period = (2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / 398600.4418)) / 60;

        return {
          id: t[0].trim(),
          x: ecf.x,
          y: ecf.y,
          z: ecf.z,
          vel: speed,
          alt,
          satrec,
          period,
        };
      })
      .filter(Boolean);

    // Fetch upcoming Starlink launch
    const launches = await (await fetch('https://api.spacexdata.com/v5/launches/upcoming')).json();
    const nextStarlink =
      launches.find((launch) => launch.name && launch.name.includes('Starlink')) ||
      { name: 'None', date_utc: 'N/A' };

    // Optional GR integration for a selected satellite
    let gr_sol = [];
    if (req.query.selectedIdx) {
      const idx = parseInt(req.query.selectedIdx);
      if (!isNaN(idx) && idx >= 0 && idx < sats.length) {
        const selected = sats[idx];

        // Recompute velocity for the selected satellite
        const posVel = satellite.propagate(selected.satrec, now);
        const velVec = posVel.velocity || { x: 0, y: 0, z: 0 };

        const y0 = [selected.x, selected.y, selected.z, velVec.x, velVec.y, velVec.z];
        try {
          // Use python3 to run GR integration (requires numpy+scipy installed)
          const pythonOut = execSync(`python3 gr_orbit.py "${y0.join(',')}"`).toString().trim();
          gr_sol = JSON.parse(pythonOut);
        } catch (err) {
          console.error('Error running gr_orbit.py:', err.message);
        }
      }
    }

    res.json({
      sats,
      debris: debrisTle,
      nextLaunch: nextStarlink.name,
      launchDate: nextStarlink.date_utc,
      gr_sol,
    });
  } catch (err) {
    console.error('Error in /positions:', err.message);
    res.status(500).json({ error: 'Failed to compute positions', details: err.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`);
});
