/*
 * Mission Control Backend - Enhanced with proper API integration
 * This Node/Express server provides satellite data and integrates with external APIs
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
app.use(express.json()); // Add JSON parsing for POST requests

// Serve static assets from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced config endpoint - returns JSON for API calls
app.get('/api/config', (req, res) => {
  res.json({
    cesiumToken: process.env.CESIUM_ION_TOKEN || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    hasGemini: !!(process.env.GEMINI_API_KEY)
  });
});

// Original config.js endpoint for script loading
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  const cesiumToken = process.env.CESIUM_ION_TOKEN || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  res.send(`
    window.CESIUM_ION_TOKEN = "${cesiumToken}";
    window.GEMINI_API_KEY = "${geminiApiKey}";
  `);
});

// Enhanced Cesium proxy with better error handling
app.get('/api/cesium-proxy/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    const cesiumUrl = `https://api.cesium.com/${endpoint}${queryString ? '?' + queryString : ''}`;
    
    console.log('Proxying Cesium request to:', cesiumUrl);
    
    const response = await fetch(cesiumUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.CESIUM_TOKEN || process.env.CESIUM_ION_TOKEN}`,
        'User-Agent': 'Mission-Control/1.0'
      },
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`Cesium API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Cesium proxy error:', error);
    res.status(500).json({ 
      error: 'Cesium proxy failed', 
      details: error.message,
      endpoint: req.params[0]
    });
  }
});

// New Gemini AI proxy endpoint
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Gemini API not configured' });
    }
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }]
    };
    
    console.log('Sending request to Gemini API...');
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'Mission-Control/1.0'
      },
      body: JSON.stringify(payload),
      timeout: 15000 // 15 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.candidates && result.candidates[0]?.content?.parts[0]?.text) {
      res.json({ text: result.candidates[0].content.parts[0].text });
    } else {
      throw new Error('Invalid response structure from Gemini API');
    }
    
  } catch (error) {
    console.error('Gemini API error:', error);
    res.status(500).json({ 
      error: 'Gemini API request failed', 
      details: error.message 
    });
  }
});

// Enhanced satellite data endpoint with better error handling
app.get('/api/satellite-data', async (req, res) => {
  try {
    const tleUrl = process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
    console.log('Fetching TLE data from:', tleUrl);
    
    const response = await fetch(tleUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mission-Control/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`TLE fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const tleText = await response.text();
    
    if (!tleText || tleText.length < 100) {
      throw new Error('Invalid or empty TLE data received');
    }
    
    // Parse TLE data
    const lines = tleText.trim().split('\n');
    const satellites = [];
    
    for (let i = 0; i < lines.length - 2; i += 3) {
      const name = lines[i].trim();
      if (name) {
        try {
          const line1 = lines[i + 1].trim();
          const line2 = lines[i + 2].trim();
          const satrec = satellite.twoline2satrec(line1, line2);
          
          if (satrec.error === 0) {
            satellites.push({
              name,
              tle1: line1,
              tle2: line2,
              noradId: line2.substring(2, 7)
            });
          }
        } catch (parseError) {
          console.warn(`Failed to parse satellite ${name}:`, parseError.message);
        }
      }
    }
    
    console.log(`Successfully parsed ${satellites.length} satellites`);
    
    res.json({
      satellites,
      timestamp: Date.now(),
      source: tleUrl,
      count: satellites.length
    });
    
  } catch (error) {
    console.error('Satellite data error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch satellite data', 
      details: error.message 
    });
  }
});

// Utility function to fetch and parse TLE data
async function fetchTLE(url) {
  try {
    const res = await fetch(url, { timeout: 15000 });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const text = await res.text();
    return text
      .trim()
      .split('\n')
      .reduce((acc, line, idx) => {
        if (idx % 3 === 0) acc.push([]);
        if (acc.length > 0) acc[acc.length - 1].push(line);
        return acc;
      }, [])
      .filter(group => group.length === 3);
  } catch (error) {
    console.error('TLE fetch error:', error);
    throw error;
  }
}

// Enhanced positions endpoint with better error handling
async function handlePositions(req, res) {
  try {
    // Use Starlink-specific URL or fall back to active satellites
    const tleUrl = process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle';
    console.log('Fetching positions from:', tleUrl);
    
    const tle = await fetchTLE(tleUrl);
    const now = new Date();
    const gmst = satellite.gstime(now);

    const satellites = [];
    const sats = [];
    
    tle.forEach((t, index) => {
      try {
        const name = t[0].trim();
        const satrec = satellite.twoline2satrec(t[1], t[2]);
        
        if (satrec.error !== 0) {
          console.warn(`Satellite ${name} has propagation error: ${satrec.error}`);
          return;
        }
        
        const posVel = satellite.propagate(satrec, now);
        if (!posVel.position) {
          console.warn(`No position calculated for ${name}`);
          return;
        }

        // Earth-centered, Earth-fixed coordinates
        const ecf = satellite.eciToEcf(posVel.position, gmst);
        // Geodetic coordinates
        const geo = satellite.eciToGeodetic(posVel.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lon = satellite.degreesLong(geo.longitude);
        const alt = geo.height; // km

        // Velocity magnitude
        const v = posVel.velocity;
        const vel = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

        // Orbital period calculation
        const meanMotion = satrec.no * (2 * Math.PI / 86400);
        const semiMajor = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3);
        const period = (2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / 398600.4418)) / 60;

        sats.push({ 
          id: name, 
          x: ecf.x, 
          y: ecf.y, 
          z: ecf.z, 
          vel, 
          alt, 
          satrec, 
          period,
          noradId: t[2].substring(2, 7)
        });
        
        satellites.push({ lat, lon, alt });
      } catch (error) {
        console.warn(`Error processing satellite ${t[0]}:`, error.message);
      }
    });

    // Optional relativistic calculation (only if Python is available)
    let gr_sol = [];
    const idx = parseInt(req.query.selectedIdx);
    if (!isNaN(idx) && idx >= 0 && idx < sats.length) {
      try {
        const selected = sats[idx];
        const posVel = satellite.propagate(selected.satrec, now);
        const y0 = [
          selected.x, selected.y, selected.z,
          posVel.velocity.x, posVel.velocity.y, posVel.velocity.z,
        ];
        
        console.log('Running relativistic calculation...');
        const pythonOut = execSync(`python3 gr_orbit.py "${y0.join(',')}"`, {
          timeout: 10000 // 10 second timeout
        }).toString().trim();
        gr_sol = JSON.parse(pythonOut);
        console.log('Relativistic calculation completed');
      } catch (err) {
        console.warn('Relativistic calculation failed (this is optional):', err.message);
        // Continue without GR solution
      }
    }

    console.log(`Returning ${satellites.length} satellite positions`);
    
    res.json({
      satellites,
      timestamp: Date.now(),
      sats,
      gr_sol,
      source: tleUrl,
      pythonAvailable: gr_sol.length > 0
    });
    
  } catch (err) {
    console.error('Positions endpoint error:', err);
    res.status(500).json({ 
      error: 'Failed to compute positions', 
      details: err.message,
      timestamp: Date.now()
    });
  }
}

// Register API endpoints
app.get('/positions', handlePositions);
app.get('/api/starlink/positions', handlePositions);
app.get('/api/positions', handlePositions);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    environment: {
      node: process.version,
      cesiumConfigured: !!(process.env.CESIUM_ION_TOKEN || process.env.CESIUM_TOKEN),
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      pythonAvailable: (() => {
        try {
          execSync('python3 --version', { timeout: 3000 });
          return true;
        } catch {
          return false;
        }
      })()
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    details: error.message
  });
});

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Start server with enhanced logging
app.listen(port, () => {
  console.log(`🚀 Mission Control backend listening on port ${port}`);
  console.log(`📊 Health check: http://localhost:${port}/api/health`);
  console.log(`🛰️  Satellite data: http://localhost:${port}/api/starlink/positions`);
  console.log(`🎯 Configuration status:`);
  console.log(`   - Cesium Token: ${process.env.CESIUM_ION_TOKEN ? '✅ Configured' : '❌ Missing'}`);
  console.log(`   - Gemini API: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing (AI features disabled)'}`);
  
  // Test Python availability
  try {
    execSync('python3 --version', { timeout: 3000 });
    console.log(`   - Python3: ✅ Available (relativistic calculations enabled)`);
  } catch {
    console.log(`   - Python3: ⚠️  Not available (basic calculations only)`);
  }
});
