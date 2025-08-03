const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cesium.com', 'https://unpkg.com'],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'", 'https://celestrak.org', 'https://cesium.com'],
            workerSrc: ["'self'", 'blob:']
        }
    }
}));
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Assume files in public/

// Health Check
app.get('/health', (req, res) => res.json({ status: 'healthy', uptime: process.uptime() }));

// TLE Proxy (Starlink Supplemental, timeout 10s)
app.get('/api/tle', async (req, res) => {
    try {
        const response = await fetch('https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle', { timeout: 10000 });
        if (!response.ok) throw new Error('Fetch failed');
        const data = await response.text();
        res.set({ 'Content-Type': 'text/plain', 'Cache-Control': 'max-age=300' }).send(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'TLE fetch error' });
    }
});

// SATCAT Proxy (For details, if CORS issues arise)
app.get('/api/satcat', async (req, res) => {
    try {
        const { catnr } = req.query;
        const response = await fetch(`${SATCAT_URL_BASE}?CATNR=${catnr}&FORMAT=JSON`, { timeout: 5000 });
        if (!response.ok) throw new Error('Fetch failed');
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'SATCAT fetch error' });
    }
});

// Fallback to index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Server on port ${PORT}`));
