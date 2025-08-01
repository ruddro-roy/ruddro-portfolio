const express = require('express');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const satellite = require('satellite.js');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('../ruddro-future/starlink'));  // Serve frontend index.html from future/starlink

async function fetchTLE(url) {
  const res = await fetch(url);
  const text = await res.text();
  return text.trim().split('\n').reduce((acc, line, i) => {
    if (i % 3 === 0) acc.push([]);
    acc[acc.length - 1].push(line);
    return acc;
  }, []).filter(group => group.length === 3);
}

app.get('/positions', async (req, res) => {
  try {
    const tle = await fetchTLE('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle');
    const debrisTle = await fetchTLE('https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle');
    const now = new Date();
    const gmst = satellite.gstime(now);
    const sats = tle.map(t => {
      const satrec = satellite.twoline2satrec(t[1], t[2]);
      const posVel = satellite.propagate(satrec, now);
      if (!posVel.position) return null;
      const ecf = satellite.eciToEcf(posVel.position, gmst);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = satellite.degreesLong(geo.longitude);
      const alt = geo.height;
      const vel = Math.sqrt(posVel.velocity.x**2 + posVel.velocity.y**2 + posVel.velocity.z**2);
      const meanMotion = satrec.no * (2 * Math.PI / 86400);  // rad/s
      const a = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3);
      const period = (2 * Math.PI * Math.sqrt(a**3 / 398600.4418)) / 60;
      return { id: t[0].trim(), x: ecf.x, y: ecf.y, z: ecf.z, lat, lon, alt, vel, period, satrec };
    }).filter(Boolean);
    const debris = debrisTle.slice(0, 500).map(t => {
      const satrec = satellite.twoline2satrec(t[1], t[2]);
      const posVel = satellite.propagate(satrec, now);
      if (!posVel.position) return null;
      const ecf = satellite.eciToEcf(posVel.position, gmst);
      const geo = satellite.eciToGeodetic(posVel.position, gmst);
      const lat = satellite.degreesLat(geo.latitude);
      const lon = satellite.degreesLong(geo.longitude);
      const alt = geo.height;
      return { id: t[0].trim(), x: ecf.x, y: ecf.y, z: ecf.z, lat, lon, alt };
    }).filter(Boolean);
    const launches = await (await fetch('https://api.spacexdata.com/v5/launches/upcoming')).json();
    const nextStarlink = launches.find(l => l.name.includes('Starlink')) || {name: 'None', date_utc: 'N/A'};
    let gr_sol = [];
    if (req.query.selectedIdx && sats[parseInt(req.query.selectedIdx)]) {
      const selected = sats[parseInt(req.query.selectedIdx)];
      const posVel = satellite.propagate(selected.satrec, now);
      const y0 = [selected.x, selected.y, selected.z, posVel.velocity.x, posVel.velocity.y, posVel.velocity.z];
      const pythonOut = execSync(`python3 gr_orbit.py "${y0.join(',')}"`).toString();
      gr_sol = JSON.parse(pythonOut);
    }
    res.json({sats, debris, nextLaunch: nextStarlink.name, launchDate: nextStarlink.date_utc, gr_sol});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

app.listen(port, () => console.log(`Backend at port ${port}`));
