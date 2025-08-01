const express = require('express');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const satellite = require('satellite.js');
const app = express();
const port = 3000;

app.use(express.static('../ruddro-future'));  // Serve frontend from sibling folder

app.get('/positions', async (req, res) => {
    const tle = await fetchTLE('https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle');
    const debrisTle = await fetchTLE('https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle');
    const now = new Date();
    const sats = tle.map(t => {
        const satrec = satellite.twoline2satrec(t[1], t[2]);
        const posVel = satellite.propagate(satrec, now);
        if (!posVel.position) return null;
        const gmst = satellite.gstime(now);
        const ecf = satellite.eciToEcf(posVel.position, gmst);
        const vel = Math.sqrt(posVel.velocity.x**2 + posVel.velocity.y**2 + posVel.velocity.z**2);
        const alt = Math.sqrt(ecf.x**2 + ecf.y**2 + ecf.z**2) - 6371;
        const a = 398600.4418 ** (1/3) / (satrec.no * (2 * Math.PI / 86400 / 60)) ** (2/3);
        const period = 2 * Math.PI * Math.sqrt(a**3 / 398600.4418) / 60;
        return {id: t[0].trim(), x: ecf.x, y: ecf.y, z: ecf.z, vel, alt, satrec, period};
    }).filter(Boolean);
    // SpaceX launch data (public API, next Starlink mission)
    const launches = await (await fetch('https://api.spacexdata.com/v5/launches/upcoming')).json();
    const nextStarlink = launches.find(l => l.name.includes('Starlink')) || {name: 'None', date: 'N/A'};
    // Python GR integrate for selected (assume req.query.selectedIdx, exec sync for simplicity)
    let gr_sol = [];
    if (req.query.selectedIdx) {
        const selected = sats[parseInt(req.query.selectedIdx)];
        const y0 = [selected.x, selected.y, selected.z, selected.satrec.vel.x, selected.satrec.vel.y, selected.satrec.vel.z];  // Approx vel from SGP4
        const pythonOut = execSync(`python gr_orbit.py "${y0.join(',')}"`).toString();
        gr_sol = JSON.parse(pythonOut);
    }
    res.json({sats, debris: debrisTle, nextLaunch: nextStarlink.name, launchDate: nextStarlink.date_utc, gr_sol});
});

async function fetchTLE(url) {
    const res = await fetch(url);
    const text = await res.text();
    return text.trim().split('\n').reduce((acc, line, i) => {
        if (i % 3 === 0) acc.push([]);
        acc[acc.length - 1].push(line);
        return acc;
    }, []).filter(group => group.length === 3);
}

app.listen(port, () => console.log(`Backend at http://localhost:${port}`));
