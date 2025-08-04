/*
 * Mission Control Backend - Enterprise Grade
 * Secure proxy implementation for Cesium Ion and real-time satellite data
 * Enhanced with advanced security, performance optimizations, and scalability notes.
 */

require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const satellite = require('satellite.js');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

// CRITICAL: Validate environment
if (!process.env.CESIUM_ION_TOKEN) {
    console.error('FATAL: CESIUM_ION_TOKEN not configured');
    process.exit(1);
}

// Security middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true
}));
app.use(express.json());

// Rate limiting for API endpoints (enhanced with sliding window in production)
const rateLimitMap = new Map();
const rateLimit = (req, res, next) => {
    const ip = req.ip;
    const now = Date.now();
    const limit = 100; // requests per minute
    
    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
        return next();
    }
    
    const record = rateLimitMap.get(ip);
    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + 60000;
        return next();
    }
    
    if (record.count >= limit) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    record.count++;
    next();
};

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Generate session token for Cesium proxy (enhanced security: bind to IP)
app.get('/api/session', rateLimit, (req, res) => {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + (30 * 60 * 1000); // 30 minutes
    
    // Store session (in production, use Redis for distributed sessions and scalability)
    // Example: const redisClient = require('redis').createClient(); redisClient.set(sessionId, JSON.stringify({expires, ip: req.ip}));
    global.sessions = global.sessions || new Map();
    global.sessions.set(sessionId, { expires, ip: req.ip });
    
    res.json({ 
        sessionId,
        expires,
        cesiumProxyUrl: '/api/cesium-assets'
    });
});

// Secure Cesium asset proxy (optimized for performance with caching headers)
app.get('/api/cesium-assets/*', async (req, res) => {
    try {
        const sessionId = req.headers['x-session-id'];
        
        // Validate session (strict IP validation for security)
        if (!sessionId || !global.sessions || !global.sessions.has(sessionId)) {
            return res.status(401).json({ error: 'Invalid session' });
        }
        
        const session = global.sessions.get(sessionId);
        if (Date.now() > session.expires || session.ip !== req.ip) {
            global.sessions.delete(sessionId);
            return res.status(401).json({ error: 'Session expired or invalid' });
        }
        
        // Construct Cesium URL
        const assetPath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        let cesiumUrl;
        
        if (assetPath.startsWith('v1/assets/')) {
            cesiumUrl = `https://api.cesium.com/${assetPath}${queryString ? '?' + queryString : ''}`;
        } else {
            cesiumUrl = `https://assets.ion.cesium.com/${assetPath}${queryString ? '?' + queryString : ''}`;
        }
        
        // Proxy request to Cesium
        const response = await fetch(cesiumUrl, {
            headers: {
                'Authorization': `Bearer ${process.env.CESIUM_ION_TOKEN}`,
                'Accept': req.headers.accept || '*/*',
                'Accept-Encoding': 'gzip, deflate, br'
            }
        });
        
        // Forward response with caching for performance (enterprise optimization: adjust based on content)
        res.status(response.status);
        response.headers.forEach((value, key) => {
            if (key.toLowerCase() !== 'content-encoding') {
                res.setHeader(key, value);
            }
        });
        if (response.status === 200) {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour cache for static assets
        }
        
        const buffer = await response.buffer();
        res.send(buffer);
        
    } catch (error) {
        console.error('Cesium proxy error:', error);
        res.status(500).json({ error: 'Proxy failed' });
    }
});

// Real-time satellite data endpoint (optimized for reliability with multiple sources)
app.get('/api/satellites/active', rateLimit, async (req, res) => {
    try {
        // Fetch from multiple sources for reliability
        const sources = [
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json'
        ];
        
        const allSatellites = [];
        
        for (const source of sources) {
            try {
                const response = await fetch(source, {
                    timeout: 15000,
                    headers: { 'User-Agent': 'Mission-Control-Enterprise/1.0' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    allSatellites.push(...data);
                }
            } catch (sourceError) {
                console.warn(`Source ${source} failed:`, sourceError.message);
            }
        }
        
        // Remove duplicates by NORAD ID (performance optimization: use Map for O(1) lookups)
        const uniqueSatellites = Array.from(
            new Map(allSatellites.map(sat => [sat.NORAD_CAT_ID, sat])).values()
        );
        
        res.json({
            count: uniqueSatellites.length,
            timestamp: new Date().toISOString(),
            satellites: uniqueSatellites
        });
        
    } catch (error) {
        console.error('Satellite data error:', error);
        res.status(500).json({ error: 'Failed to fetch satellite data' });
    }
});

// Satellite detail endpoint with real SATCAT data
app.get('/api/satellite/:noradId', rateLimit, async (req, res) => {
    try {
        const noradId = req.params.noradId;
        
        // Fetch from SATCAT database
        const response = await fetch(
            `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=json`,
            {
                timeout: 10000,
                headers: { 'User-Agent': 'Mission-Control-Enterprise/1.0' }
            }
        );
        
        if (!response.ok) {
            throw new Error('SATCAT query failed');
        }
        
        const data = await response.json();
        res.json(data[0] || null);
        
    } catch (error) {
        console.error('SATCAT query error:', error);
        res.status(500).json({ error: 'Failed to fetch satellite details' });
    }
});

// Real-time orbital calculations endpoint
app.get('/api/satellite/:noradId/position', rateLimit, async (req, res) => {
    try {
        const noradId = req.params.noradId;
        
        // Fetch current TLE
        const tleResponse = await fetch(
            `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=json`,
            {
                timeout: 10000,
                headers: { 'User-Agent': 'Mission-Control-Enterprise/1.0' }
            }
        );
        
        if (!tleResponse.ok) {
            throw new Error('TLE fetch failed');
        }
        
        const tleData = await tleResponse.json();
        if (!tleData.length) {
            return res.status(404).json({ error: 'Satellite not found' });
        }
        
        const tle = tleData[0];
        const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2);
        
        // Calculate current position
        const now = new Date();
        const positionAndVelocity = satellite.propagate(satrec, now);
        
        if (!positionAndVelocity.position) {
            throw new Error('Propagation failed');
        }
        
        const gmst = satellite.gstime(now);
        const position = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
        
        res.json({
            timestamp: now.toISOString(),
            noradId: tle.NORAD_CAT_ID,
            name: tle.OBJECT_NAME,
            latitude: satellite.degreesLat(position.latitude),
            longitude: satellite.degreesLong(position.longitude),
            altitude: position.height,
            velocity: Math.sqrt(
                positionAndVelocity.velocity.x ** 2 +
                positionAndVelocity.velocity.y ** 2 +
                positionAndVelocity.velocity.z ** 2
            )
        });
        
    } catch (error) {
        console.error('Position calculation error:', error);
        res.status(500).json({ error: 'Failed to calculate position' });
    }
});

// Health check (enhanced for monitoring in CI/CD pipelines)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
            cesiumProxy: 'active',
            satelliteData: 'active',
            sessionManager: 'active'
        }
    });
});

// Cleanup expired sessions (in production, use a distributed scheduler)
setInterval(() => {
    if (global.sessions) {
        const now = Date.now();
        for (const [id, session] of global.sessions.entries()) {
            if (now > session.expires) {
                global.sessions.delete(id);
            }
        }
    }
}, 60000); // Every minute

// Error handling (log for monitoring)
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// Serve SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(port, () => {
    console.log(`Mission Control Backend operational on port ${port}`);
    console.log(`Cesium proxy: Secured with session management`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    // Scalability note: For production, deploy with PM2 or Kubernetes for clustering/load balancing.
    // Database optimization: If adding DB (e.g., MongoDB for caching satellite data), use indexes on NORAD_ID and TTL for expiration.
    // CI/CD: Use GitHub Actions/Jenkins for automated testing (unit/integration) and deployment to Render.
    // Testing: Implement Jest for unit tests on endpoints; aim for 80%+ coverage.
});
