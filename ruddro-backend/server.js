/*
 * Mission Control Backend - Enterprise Grade
 * Secure proxy implementation for Cesium Ion and real-time satellite data
 * Version: 3.0.0
 */

require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const satellite = require('satellite.js');
const cors = require('cors');
const path = require('path');
const { PythonShell } = require('python-shell');

const app = express();
const port = process.env.PORT || 3000;

// CRITICAL: Validate environment variables
if (!process.env.CESIUM_ION_TOKEN) {
    console.error('FATAL: CESIUM_ION_TOKEN is not configured. This is required for Cesium asset proxying.');
    process.exit(1);
}

// --- Middleware ---

// Security and Parsing Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Rate Limiting Middleware
const rateLimitMap = new Map();
const rateLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const limit = 100; // requests per minute
    const windowMs = 60000;

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
    }

    const record = rateLimitMap.get(ip);
    if (now > record.resetTime) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
        return next();
    }

    if (record.count >= limit) {
        return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
    }

    record.count++;
    next();
};


// --- API Endpoints ---

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
    });
});

/**
 * Secure Cesium Ion Asset Proxy
 * This endpoint forwards requests to Cesium's servers, injecting the secret token.
 * The token is never exposed to the client.
 */
app.get('/api/cesium-assets/*', async (req, res) => {
    const assetPath = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    let cesiumUrl;

    // Route to the correct Cesium API based on the request path
    if (assetPath.startsWith('v1/assets/')) {
        cesiumUrl = `https://api.cesium.com/${assetPath}`;
    } else {
        cesiumUrl = `https://assets.cesium.com/${assetPath}`;
    }

    const fullUrl = `${cesiumUrl}${queryString ? '?' + queryString : ''}`;

    try {
        const response = await fetch(fullUrl, {
            headers: {
                'Authorization': `Bearer ${process.env.CESIUM_ION_TOKEN}`,
                'Accept': req.headers.accept || '*/*',
                'Accept-Encoding': req.headers['accept-encoding'] || 'gzip, deflate, br',
                'User-Agent': req.headers['user-agent']
            }
        });

        if (!response.ok) {
            console.error(`Cesium proxy error for ${fullUrl}: ${response.status} ${response.statusText}`);
            return res.status(response.status).send(await response.text());
        }

        // Forward headers from Cesium's response to the client
        response.headers.forEach((value, key) => {
            // Let Express handle content encoding
            if (key.toLowerCase() !== 'content-encoding' && key.toLowerCase() !== 'transfer-encoding') {
                res.setHeader(key, value);
            }
        });

        // Stream the response body directly to the client
        response.body.pipe(res);

    } catch (error) {
        console.error('Cesium proxy internal error:', error);
        res.status(500).json({ error: 'Proxy request failed due to an internal server error.' });
    }
});


/**
 * Fetches active satellite TLE data from CelesTrak.
 * This endpoint gets the raw orbital data required for propagation.
 */
app.get('/api/satellites/active', rateLimit, async (req, res) => {
    try {
        const sources = [
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json'
        ];

        let allSatellites = [];
        const fetchPromises = sources.map(source =>
            fetch(source, {
                timeout: 15000,
                headers: { 'User-Agent': 'Mission-Control-Enterprise/3.0' }
            })
            .then(response => {
                if (response.ok) return response.json();
                console.warn(`Source ${source} failed with status: ${response.status}`);
                return [];
            })
            .catch(sourceError => {
                console.warn(`Source ${source} failed:`, sourceError.message);
                return [];
            })
        );

        const results = await Promise.all(fetchPromises);
        results.forEach(sats => allSatellites.push(...sats));

        // Remove duplicates by NORAD ID, ensuring data integrity
        const uniqueSatellites = Array.from(
            new Map(allSatellites.map(sat => [sat.NORAD_CAT_ID, sat])).values()
        );

        res.json({
            count: uniqueSatellites.length,
            timestamp: new Date().toISOString(),
            satellites: uniqueSatellites
        });

    } catch (error) {
        console.error('Satellite data fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch satellite TLE data.' });
    }
});


/**
 * Fetches detailed satellite metadata from the SATCAT database.
 * This provides rich information like owner, launch date, etc.
 */
app.get('/api/satellite/:noradId', rateLimit, async (req, res) => {
    try {
        const { noradId } = req.params;
        if (!/^\d+$/.test(noradId)) {
            return res.status(400).json({ error: 'Invalid NORAD ID format.' });
        }

        const response = await fetch(
            `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=json`,
            {
                timeout: 10000,
                headers: { 'User-Agent': 'Mission-Control-Enterprise/3.0' }
            }
        );

        if (!response.ok) {
            throw new Error(`SATCAT query failed with status ${response.status}`);
        }

        const data = await response.json();
        if (!data || data.length === 0) {
            return res.status(404).json({ error: 'No satellite details found for this NORAD ID.' });
        }

        res.json(data[0]);

    } catch (error) {
        console.error('SATCAT query error:', error);
        res.status(500).json({ error: 'Failed to fetch satellite details from SATCAT.' });
    }
});

/**
 * NEW: High-Precision Orbit Calculation Endpoint
 * Executes the gr_orbit.py script to get a highly accurate orbit path.
 */
app.post('/api/satellite/:noradId/propagate-gr', rateLimit, async (req, res) => {
    try {
        const { tle1, tle2 } = req.body;
        if (!tle1 || !tle2) {
            return res.status(400).json({ error: 'TLE Line 1 and TLE Line 2 are required.' });
        }

        const satrec = satellite.twoline2satrec(tle1, tle2);
        if (satrec.error !== 0) {
            return res.status(400).json({ error: 'Invalid TLE data provided.' });
        }
        
        const now = new Date();
        const { position, velocity } = satellite.propagate(satrec, now);
        
        if (!position || !velocity) {
             return res.status(500).json({ error: 'Initial satellite propagation failed.' });
        }

        const initialState = [position.x, position.y, position.z, velocity.x, velocity.y, velocity.z].join(',');

        const options = {
            mode: 'text',
            pythonOptions: ['-u'], // Unbuffered output
            scriptPath: __dirname, // Path to your script
            args: [initialState]
        };

        const results = await PythonShell.run('gr_orbit.py', options);
        const positions = JSON.parse(results[0]);
        res.json(positions);

    } catch (error) {
        console.error('High-precision orbit propagation error:', error);
        res.status(500).json({ error: 'Failed to execute orbit propagation model.' });
    }
});


// --- Error Handling and Server Startup ---

// Centralized Error Handler
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err);
    res.status(500).json({
        error: 'An unexpected internal server error occurred.',
        timestamp: new Date().toISOString()
    });
});

// Serve the Single Page Application (SPA) for any other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
    console.log(`Mission Control Backend operational on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('Cesium proxy: ACTIVE and secured.');
});
