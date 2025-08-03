/**
 * SIMPLIFIED MISSION CONTROL BACKEND
 * Lightweight server for satellite tracking with CORS and TLE proxy
 */

const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const path = require('path');

const app = express();
const port = process.env.PORT || 3001;

// Enable CORS for all routes
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Serve static files from multiple directories
app.use('/starlink', express.static(path.join(__dirname, '../ruddro-future/starlink')));
app.use('/', express.static(path.join(__dirname, '../ruddro-future')));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: Date.now(),
        service: 'mission-control-backend',
        version: '1.0.0'
    });
});

// TLE data proxy with caching and fallbacks
let tleCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const TLE_SOURCES = [
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
    'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle'
];

async function fetchTLEWithRetry(sourceIndex = 0) {
    if (sourceIndex >= TLE_SOURCES.length) {
        throw new Error('All TLE sources failed');
    }

    const source = TLE_SOURCES[sourceIndex];
    console.log(`Fetching TLE data from source ${sourceIndex + 1}: ${source}`);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(source, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mission-Control-Backend/1.0',
                'Accept': 'text/plain'
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.text();
        
        if (!data || data.length < 100) {
            throw new Error('Invalid or empty TLE data');
        }

        console.log(`✅ Successfully fetched ${data.split('\n').length / 3} satellites from source ${sourceIndex + 1}`);
        return data;

    } catch (error) {
        console.warn(`⚠️ Source ${sourceIndex + 1} failed: ${error.message}`);
        
        if (sourceIndex < TLE_SOURCES.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return fetchTLEWithRetry(sourceIndex + 1);
        }
        
        throw error;
    }
}

// TLE data endpoint with caching
app.get('/api/tle', async (req, res) => {
    try {
        const now = Date.now();
        
        // Return cached data if still valid
        if (tleCache && (now - cacheTimestamp) < CACHE_DURATION) {
            console.log('📦 Serving cached TLE data');
            res.set({
                'Content-Type': 'text/plain',
                'Cache-Control': 'public, max-age=300',
                'X-Data-Source': 'cache'
            });
            return res.send(tleCache);
        }

        // Fetch fresh data
        const tleData = await fetchTLEWithRetry();
        
        // Update cache
        tleCache = tleData;
        cacheTimestamp = now;

        res.set({
            'Content-Type': 'text/plain',
            'Cache-Control': 'public, max-age=300',
            'X-Data-Source': 'live'
        });
        
        res.send(tleData);

    } catch (error) {
        console.error('❌ TLE fetch failed:', error);
        
        // Return cached data if available, even if stale
        if (tleCache) {
            console.log('⚠️ Serving stale cached data due to fetch failure');
            res.set({
                'Content-Type': 'text/plain',
                'Cache-Control': 'public, max-age=60',
                'X-Data-Source': 'stale-cache'
            });
            return res.send(tleCache);
        }

        res.status(500).json({
            error: 'Failed to fetch TLE data',
            message: error.message,
            timestamp: Date.now()
        });
    }
});

// CORS proxy for external APIs
app.get('/api/proxy/*', async (req, res) => {
    try {
        const targetUrl = decodeURIComponent(req.params[0]);
        
        // Security check - only allow specific domains
        const allowedDomains = [
            'celestrak.org',
            'api.celestrak.org',
            'api.n2yo.com'
        ];
        
        const urlObj = new URL(targetUrl);
        if (!allowedDomains.includes(urlObj.hostname)) {
            return res.status(403).json({
                error: 'Domain not allowed',
                domain: urlObj.hostname
            });
        }

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mission-Control-Backend/1.0',
                'Accept': 'application/json, text/plain'
            },
            timeout: 10000
        });

        if (!response.ok) {
            throw new Error(`Proxy request failed: ${response.status} ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            const data = await response.json();
            res.json(data);
        } else {
            const data = await response.text();
            res.set('Content-Type', contentType || 'text/plain');
            res.send(data);
        }

    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Proxy request failed',
            message: error.message
        });
    }
});

// Configuration endpoint for frontend
app.get('/api/config', (req, res) => {
    res.json({
        cesiumToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkYWY0MjU5MS1iNjkzLTQ1ZjMtYjc4Ni1hY2VjNWRmZTcxOGEiLCJpZCI6MjM3MjA5LCJpYXQiOjE3MzU0MTIzNzJ9.zM7_6cGPihCdnYNQJn6_l_TrReA4D1ohNJuqHyA4y_k',
        tleEndpoint: '/api/tle',
        proxyEndpoint: '/api/proxy',
        maxSatellites: 1000,
        updateInterval: 30000
    });
});

// Serve config as JavaScript for direct inclusion
app.get('/config.js', (req, res) => {
    res.set('Content-Type', 'application/javascript');
    res.send(`
window.CESIUM_ION_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkYWY0MjU5MS1iNjkzLTQ1ZjMtYjc4Ni1hY2VjNWRmZTcxOGEiLCJpZCI6MjM3MjA5LCJpYXQiOjE3MzU0MTIzNzJ9.zM7_6cGPihCdnYNQJn6_l_TrReA4D1ohNJuqHyA4y_k";
window.TLE_ENDPOINT = "/api/tle";
window.PROXY_ENDPOINT = "/api/proxy";
console.log("✅ Mission Control configuration loaded");
    `);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Express error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: err.message,
        timestamp: Date.now()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path,
        timestamp: Date.now()
    });
});

// Start server
app.listen(port, () => {
    console.log(`🚀 Mission Control Backend running on port ${port}`);
    console.log(`📊 Health check: http://localhost:${port}/api/health`);
    console.log(`🛰️  TLE data: http://localhost:${port}/api/tle`);
    console.log(`🌐 Starlink app: http://localhost:${port}/starlink/`);
    console.log(`📡 Configuration: http://localhost:${port}/api/config`);
    
    // Pre-warm the TLE cache
    setTimeout(async () => {
        try {
            console.log('🔄 Pre-warming TLE cache...');
            await fetchTLEWithRetry();
            console.log('✅ TLE cache pre-warmed');
        } catch (error) {
            console.warn('⚠️ TLE cache pre-warming failed:', error.message);
        }
    }, 1000);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Mission Control Backend shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Mission Control Backend terminated');
    process.exit(0);
});
