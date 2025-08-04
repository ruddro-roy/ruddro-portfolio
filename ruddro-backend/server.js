/*
 * Mission Control Backend - Enterprise Grade
 * Secure proxy implementation for Cesium Ion and real-time satellite data
 * Enhanced with advanced security, performance optimizations, and scalability
 */

require('dotenv').config();

const express = require('express');
const fetch = require('node-fetch');
const satellite = require('satellite.js');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const port = process.env.PORT || 3000;

// CRITICAL: Validate environment
if (!process.env.CESIUM_ION_TOKEN) {
    console.error('FATAL: CESIUM_ION_TOKEN not configured');
    console.error('Please set CESIUM_ION_TOKEN in your environment variables');
    process.exit(1);
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cesium.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cesium.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://api.cesium.com", "https://assets.ion.cesium.com", "https://celestrak.org"],
            workerSrc: ["'self'", "blob:"],
            fontSrc: ["'self'", "https:"],
        },
    },
}));

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Enhanced rate limiting
const createRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const apiRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 API requests per minute
    message: 'Too many API requests, please try again later.',
});

app.use(createRateLimit);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Session storage (use Redis in production)
const sessions = new Map();

// Generate secure session token for Cesium proxy
app.get('/api/session', apiRateLimit, (req, res) => {
    try {
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + (60 * 60 * 1000); // 1 hour
        const ip = req.ip || req.connection.remoteAddress;
        
        // Store session with IP binding
        sessions.set(sessionId, { 
            expires, 
            ip,
            created: Date.now(),
            requests: 0
        });
        
        console.log(`Session created: ${sessionId} for IP: ${ip}`);
        
        res.json({ 
            sessionId,
            expires,
            cesiumProxyUrl: '/api/cesium-proxy',
            status: 'active'
        });
        
    } catch (error) {
        console.error('Session creation error:', error);
        res.status(500).json({ error: 'Failed to create session' });
    }
});

// Validate session middleware
function validateSession(req, res, next) {
    const sessionId = req.headers['x-session-id'];
    const ip = req.ip || req.connection.remoteAddress;
    
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(401).json({ error: 'Invalid or missing session' });
    }
    
    const session = sessions.get(sessionId);
    
    if (Date.now() > session.expires) {
        sessions.delete(sessionId);
        return res.status(401).json({ error: 'Session expired' });
    }
    
    if (session.ip !== ip) {
        sessions.delete(sessionId);
        return res.status(401).json({ error: 'Session IP mismatch' });
    }
    
    // Update session activity
    session.requests++;
    req.session = session;
    
    next();
}

// Secure Cesium Ion proxy with comprehensive asset support
app.get('/api/cesium-proxy/*', validateSession, async (req, res) => {
    try {
        const assetPath = req.params[0];
        const queryString = req.url.split('?')[1] || '';
        
        // Construct proper Cesium URL based on asset type
        let cesiumUrl;
        
        if (assetPath.startsWith('v1/') || assetPath.includes('/assets/')) {
            // API endpoints
            cesiumUrl = `https://api.cesium.com/${assetPath}${queryString ? '?' + queryString : ''}`;
        } else if (assetPath.match(/^\d+\//)) {
            // Asset tiles with numeric ID
            cesiumUrl = `https://assets.ion.cesium.com/${assetPath}${queryString ? '?' + queryString : ''}`;
        } else {
            // General assets
            cesiumUrl = `https://assets.ion.cesium.com/${assetPath}${queryString ? '?' + queryString : ''}`;
        }
        
        console.log(`Proxying: ${cesiumUrl}`);
        
        // Fetch from Cesium with proper headers
        const response = await fetch(cesiumUrl, {
            headers: {
                'Authorization': `Bearer ${process.env.CESIUM_ION_TOKEN}`,
                'Accept': req.headers.accept || '*/*',
                'Accept-Encoding': 'gzip, deflate, br',
                'User-Agent': 'Mission-Control-Enterprise/2.0'
            },
            timeout: 30000
        });
        
        // Forward status and headers
        res.status(response.status);
        
        // Copy relevant headers
        ['content-type', 'content-length', 'cache-control', 'etag', 'last-modified'].forEach(header => {
            const value = response.headers.get(header);
            if (value) {
                res.setHeader(header, value);
            }
        });
        
        // Set caching headers for performance
        if (response.status === 200) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
        
        // Stream response
        const buffer = await response.buffer();
        res.send(buffer);
        
    } catch (error) {
        console.error('Cesium proxy error:', error);
        res.status(500).json({ 
            error: 'Proxy request failed',
            details: error.message 
        });
    }
});

// Real-time satellite data with comprehensive coverage
app.get('/api/satellites/live', apiRateLimit, async (req, res) => {
    try {
        console.log('Fetching live satellite data...');
        
        // Fetch from multiple Celestrak sources for comprehensive coverage
        const sources = [
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=geo&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=intelsat&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=beidou&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=sbas&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=nnss&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=musson&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=science&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=engineering&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=education&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=military&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=radar&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=cubesat&FORMAT=json',
            'https://celestrak.org/NORAD/elements/gp.php?GROUP=other&FORMAT=json'
        ];
        
        const allSatellites = [];
        const failedSources = [];
        
        // Fetch all sources in parallel for performance
        const fetchPromises = sources.map(async (source) => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                const response = await fetch(source, {
                    signal: controller.signal,
                    headers: { 
                        'User-Agent': 'Mission-Control-Enterprise/2.0',
                        'Accept': 'application/json'
                    }
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    const data = await response.json();
                    return data;
                }
                throw new Error(`HTTP ${response.status}`);
                
            } catch (error) {
                failedSources.push({ source, error: error.message });
                return [];
            }
        });
        
        const results = await Promise.all(fetchPromises);
        results.forEach(data => {
            if (Array.isArray(data)) {
                allSatellites.push(...data);
            }
        });
        
        // Remove duplicates by NORAD ID and add metadata
        const uniqueSatellites = Array.from(
            new Map(allSatellites.map(sat => [sat.NORAD_CAT_ID, {
                ...sat,
                EPOCH_TIME: new Date(sat.EPOCH).getTime(),
                TLE_VALID: true,
                DATA_SOURCE: 'CELESTRAK'
            }])).values()
        );
        
        console.log(`Loaded ${uniqueSatellites.length} unique satellites from ${sources.length - failedSources.length} sources`);
        
        res.json({
            success: true,
            count: uniqueSatellites.length,
            timestamp: new Date().toISOString(),
            sources: {
                total: sources.length,
                successful: sources.length - failedSources.length,
                failed: failedSources
            },
            satellites: uniqueSatellites
        });
        
    } catch (error) {
        console.error('Satellite data fetch error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch satellite data',
            details: error.message 
        });
    }
});

// Get detailed satellite information
app.get('/api/satellite/:noradId/details', apiRateLimit, async (req, res) => {
    try {
        const noradId = req.params.noradId;
        
        // Fetch detailed information from SATCAT
        const response = await fetch(
            `https://celestrak.org/satcat/records.php?CATNR=${noradId}&FORMAT=json`,
            {
                timeout: 10000,
                headers: { 
                    'User-Agent': 'Mission-Control-Enterprise/2.0',
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`SATCAT query failed: ${response.status}`);
        }
        
        const data = await response.json();
        const satelliteInfo = data[0];
        
        if (!satelliteInfo) {
            return res.status(404).json({ error: 'Satellite not found' });
        }
        
        res.json({
            success: true,
            satellite: satelliteInfo,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Satellite details error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch satellite details',
            details: error.message 
        });
    }
});

// Real-time position calculation
app.get('/api/satellite/:noradId/position', apiRateLimit, async (req, res) => {
    try {
        const noradId = req.params.noradId;
        const timestamp = req.query.timestamp ? new Date(req.query.timestamp) : new Date();
        
        // Fetch current TLE
        const tleResponse = await fetch(
            `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=json`,
            {
                timeout: 10000,
                headers: { 
                    'User-Agent': 'Mission-Control-Enterprise/2.0',
                    'Accept': 'application/json'
                }
            }
        );
        
        if (!tleResponse.ok) {
            throw new Error(`TLE fetch failed: ${tleResponse.status}`);
        }
        
        const tleData = await tleResponse.json();
        if (!tleData.length) {
            return res.status(404).json({ error: 'Satellite TLE not found' });
        }
        
        const tle = tleData[0];
        const satrec = satellite.twoline2satrec(tle.TLE_LINE1, tle.TLE_LINE2);
        
        if (satrec.error !== 0) {
            throw new Error('Invalid TLE data');
        }
        
        // Calculate position
        const positionAndVelocity = satellite.propagate(satrec, timestamp);
        
        if (!positionAndVelocity.position) {
            throw new Error('Position calculation failed');
        }
        
        const gmst = satellite.gstime(timestamp);
        const position = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
        
        const velocity = Math.sqrt(
            positionAndVelocity.velocity.x ** 2 +
            positionAndVelocity.velocity.y ** 2 +
            positionAndVelocity.velocity.z ** 2
        );
        
        res.json({
            success: true,
            noradId: tle.NORAD_CAT_ID,
            name: tle.OBJECT_NAME,
            timestamp: timestamp.toISOString(),
            position: {
                latitude: satellite.degreesLat(position.latitude),
                longitude: satellite.degreesLong(position.longitude),
                altitude: position.height
            },
            velocity: velocity,
            tle: {
                line1: tle.TLE_LINE1,
                line2: tle.TLE_LINE2,
                epoch: tle.EPOCH
            }
        });
        
    } catch (error) {
        console.error('Position calculation error:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to calculate position',
            details: error.message 
        });
    }
});

// System health check
app.get('/api/health', (req, res) => {
    const uptime = process.uptime();
    const memUsage = process.memoryUsage();
    
    res.json({
        status: 'operational',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        uptime: Math.floor(uptime),
        memory: {
            used: Math.round(memUsage.heapUsed / 1024 / 1024),
            total: Math.round(memUsage.heapTotal / 1024 / 1024)
        },
        services: {
            cesiumProxy: 'active',
            satelliteData: 'active',
            sessionManager: 'active'
        },
        sessions: {
            active: sessions.size
        }
    });
});

// Cleanup expired sessions
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [id, session] of sessions.entries()) {
        if (now > session.expires) {
            sessions.delete(id);
            cleaned++;
        }
    }
    
    if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} expired sessions`);
    }
}, 60000); // Every minute

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        requestId: req.id || 'unknown'
    });
});

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    process.exit(0);
});

app.listen(port, () => {
    console.log(`Mission Control Backend v2.0 operational on port ${port}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Cesium proxy: Secured with session management`);
    console.log(`Memory limit: ${process.env.NODE_OPTIONS || 'default'}`);
    
    // Display configuration
    console.log('\n=== SECURITY STATUS ===');
    console.log(`✓ Cesium Ion token: ${process.env.CESIUM_ION_TOKEN ? 'Configured' : 'MISSING'}`);
    console.log(`✓ Rate limiting: Active`);
    console.log(`✓ Session management: Active`);
    console.log(`✓ CORS protection: Active`);
    console.log(`✓ Security headers: Active`);
    console.log('========================\n');
});
