/*
 * Professional Mission Control Backend
 * Enhanced for comprehensive satellite data and professional APIs
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
app.use(express.json());

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// Professional config endpoint
app.get('/api/config', (req, res) => {
  res.json({
    cesiumToken: process.env.CESIUM_ION_TOKEN || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    hasGemini: !!(process.env.GEMINI_API_KEY),
    professional: true
  });
});

// Enhanced config.js for professional features
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  const cesiumToken = process.env.CESIUM_ION_TOKEN || '';
  const geminiApiKey = process.env.GEMINI_API_KEY || '';
  res.send(`
    window.CESIUM_ION_TOKEN = "${cesiumToken}";
    window.GEMINI_API_KEY = "${geminiApiKey}";
    window.PROFESSIONAL_MODE = true;
  `);
});

// Professional Cesium proxy with enhanced error handling
app.get('/api/cesium-proxy/*', async (req, res) => {
  try {
    const endpoint = req.params[0];
    const queryString = req.url.split('?')[1] || '';
    
    // Handle different types of requests
    let targetUrl;
    if (endpoint.includes('satcat')) {
      targetUrl = `https://celestrak.org/${endpoint}${queryString ? '?' + queryString : ''}`;
    } else {
      targetUrl = `https://api.cesium.com/${endpoint}${queryString ? '?' + queryString : ''}`;
    }
    
    console.log('Professional proxy request:', targetUrl);
    
    const response = await fetch(targetUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.CESIUM_TOKEN || process.env.CESIUM_ION_TOKEN}`,
        'User-Agent': 'Mission-Control-Professional/2.0',
        'Accept': 'application/json'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`Professional API returned ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Professional proxy error:', error);
    res.status(500).json({ 
      error: 'Professional proxy failed', 
      details: error.message,
      endpoint: req.params[0]
    });
  }
});

// Enhanced satellite data with comprehensive information
app.get('/api/satellite-data', async (req, res) => {
  try {
    const tleUrl = process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
    console.log('Fetching professional satellite data from:', tleUrl);
    
    const response = await fetch(tleUrl, {
      timeout: 20000,
      headers: {
        'User-Agent': 'Mission-Control-Professional/2.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Professional TLE fetch failed: ${response.status} ${response.statusText}`);
    }
    
    const tleText = await response.text();
    
    if (!tleText || tleText.length < 100) {
      throw new Error('Invalid professional TLE data received');
    }
    
    // Enhanced TLE parsing with satellite categorization
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
            // Enhanced satellite data with categorization
            const category = categorizeSatellite(name);
            const engineeringData = generateEngineeringData(name, line1, line2, satrec, category);
            
            satellites.push({
              name,
              tle1: line1,
              tle2: line2,
              noradId: line2.substring(2, 7),
              category: category,
              engineeringData: engineeringData,
              satrec: {
                // Include essential orbital parameters for frontend
                no_kozai: satrec.no_kozai,
                inclo: satrec.inclo,
                ecco: satrec.ecco,
                argpo: satrec.argpo,
                mo: satrec.mo,
                nodeo: satrec.nodeo
              }
            });
          }
        } catch (parseError) {
          console.warn(`Failed to parse satellite ${name}:`, parseError.message);
        }
      }
    }
    
    console.log(`Successfully parsed ${satellites.length} professional satellites`);
    
    res.json({
      satellites,
      timestamp: Date.now(),
      source: tleUrl,
      count: satellites.length,
      professional: true
    });
    
  } catch (error) {
    console.error('Professional satellite data error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch professional satellite data', 
      details: error.message 
    });
  }
});

// Professional satellite categorization
function categorizeSatellite(name) {
  const nameUpper = name.toUpperCase();
  
  if (nameUpper.includes('STARLINK')) return 'STARLINK';
  if (nameUpper.includes('GPS') || nameUpper.includes('NAVSTAR') || nameUpper.includes('GLONASS') || nameUpper.includes('GALILEO') || nameUpper.includes('BEIDOU')) return 'GPS';
  if (nameUpper.includes('ISS') || nameUpper.includes('ZARYA') || nameUpper.includes('STATION')) return 'ISS';
  if (nameUpper.includes('GOES') || nameUpper.includes('NOAA') || nameUpper.includes('METOP') || nameUpper.includes('WEATHER')) return 'WEATHER';
  if (nameUpper.includes('INTELSAT') || nameUpper.includes('EUTELSAT') || nameUpper.includes('ASTRA') || nameUpper.includes('TELECOM')) return 'COMMUNICATION';
  if (nameUpper.includes('LANDSAT') || nameUpper.includes('SENTINEL') || nameUpper.includes('TERRA') || nameUpper.includes('AQUA')) return 'SCIENTIFIC';
  if (nameUpper.includes('MILSTAR') || nameUpper.includes('DSCS') || nameUpper.includes('USA-')) return 'MILITARY';
  
  return 'OTHER';
}

// Generate comprehensive engineering data
function generateEngineeringData(name, line1, line2, satrec, category) {
  const noradId = line2.substring(2, 7);
  const intlDesignator = line1.substring(9, 17);
  
  // Calculate orbital parameters
  const meanMotion = satrec.no_kozai * (2 * Math.PI / 86400); // rad/s
  const semiMajorAxis = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3); // km
  const period = (2 * Math.PI * Math.sqrt(Math.pow(semiMajorAxis, 3) / 398600.4418)) / 60; // minutes
  const apogee = semiMajorAxis * (1 + satrec.ecco) - 6371; // km above Earth
  const perigee = semiMajorAxis * (1 - satrec.ecco) - 6371; // km above Earth
  const inclination = satrec.inclo * 180 / Math.PI; // degrees
  
  // Category-specific data
  let objectType = 'SATELLITE';
  let owner = 'UNSPECIFIED';
  let launchSite = 'VARIOUS';
  let launchYear = intlDesignator.substring(0, 2);
  let country = 'INTERNATIONAL';
  let purpose = 'UNSPECIFIED';
  let status = 'OPERATIONAL';
  let expectedLife = 'VARIES';
  
  if (launchYear.length === 2) {
    const year = parseInt(launchYear);
    launchYear = year < 57 ? `20${year}` : `19${year}`;
  }
  
  switch (category) {
    case 'STARLINK':
      objectType = 'COMMUNICATION SATELLITE';
      owner = 'SPACEX';
      launchSite = 'CAPE CANAVERAL, FL';
      country = 'UNITED STATES';
      purpose = 'BROADBAND INTERNET';
      expectedLife = '5-7 YEARS';
      break;
      
    case 'GPS':
      objectType = 'NAVIGATION SATELLITE';
      owner = 'US SPACE FORCE';
      launchSite = 'CAPE CANAVERAL, FL';
      country = 'UNITED STATES';
      purpose = 'GLOBAL POSITIONING';
      expectedLife = '12-15 YEARS';
      break;
      
    case 'ISS':
      objectType = 'SPACE STATION';
      owner = 'INTERNATIONAL';
      launchSite = 'BAIKONUR/KSC';
      country = 'INTERNATIONAL';
      purpose = 'RESEARCH LABORATORY';
      expectedLife = '2030+';
      break;
      
    case 'WEATHER':
      objectType = 'METEOROLOGICAL SATELLITE';
      owner = 'NOAA/EUMETSAT';
      launchSite = 'VARIOUS';
      country = 'INTERNATIONAL';
      purpose = 'WEATHER MONITORING';
      expectedLife = '7-10 YEARS';
      break;
      
    case 'COMMUNICATION':
      objectType = 'COMMUNICATION SATELLITE';
      owner = 'COMMERCIAL';
      launchSite = 'VARIOUS';
      country = 'INTERNATIONAL';
      purpose = 'TELECOMMUNICATIONS';
      expectedLife = '15 YEARS';
      break;
      
    case 'SCIENTIFIC':
      objectType = 'RESEARCH SATELLITE';
      owner = 'NASA/ESA';
      launchSite = 'VARIOUS';
      country = 'INTERNATIONAL';
      purpose = 'SCIENTIFIC RESEARCH';
      expectedLife = '5-10 YEARS';
      break;
      
    case 'MILITARY':
      objectType = 'MILITARY SATELLITE';
      owner = 'US SPACE FORCE';
      launchSite = 'VANDENBERG SFB';
      country = 'UNITED STATES';
      purpose = 'DEFENSE/SURVEILLANCE';
      expectedLife = '5-15 YEARS';
      break;
  }
  
  // Determine RCS size based on altitude and category
  let rcsSize = 'MEDIUM';
  if (category === 'ISS') rcsSize = 'LARGE';
  else if (category === 'STARLINK') rcsSize = 'SMALL';
  else if (apogee > 35000) rcsSize = 'LARGE';
  else if (apogee < 1000) rcsSize = 'SMALL';
  
  return {
    OBJECT_NAME: name,
    NORAD_CAT_ID: noradId,
    OBJECT_ID: intlDesignator,
    OBJECT_TYPE: objectType,
    OWNER: owner,
    COUNTRY: country,
    LAUNCH_DATE: launchYear,
    LAUNCH_SITE: launchSite,
    PURPOSE: purpose,
    STATUS: status,
    EXPECTED_LIFE: expectedLife,
    PERIOD: period.toFixed(2),
    INCLINATION: inclination.toFixed(2),
    APOGEE: apogee.toFixed(0),
    PERIGEE: perigee.toFixed(0),
    SEMI_MAJOR_AXIS: semiMajorAxis.toFixed(0),
    ECCENTRICITY: satrec.ecco.toFixed(6),
    RCS_SIZE: rcsSize,
    MEAN_MOTION: (meanMotion * 86400 / (2 * Math.PI)).toFixed(8) // revs/day
  };
}

// Enhanced positions endpoint for professional tracking
async function handleProfessionalPositions(req, res) {
  try {
    const tleUrl = process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
    console.log('Professional position calculation from:', tleUrl);
    
    const tle = await fetchTLE(tleUrl);
    const now = new Date();
    const gmst = satellite.gstime(now);

    const satellites = [];
    const sats = [];
    
    tle.forEach((t, index) => {
      try {
        const name = t[0].trim();
        const satrec = satellite.twoline2satrec(t[1], t[2]);
        
        if (satrec.error !== 0) return;
        
        const posVel = satellite.propagate(satrec, now);
        if (!posVel.position) return;

        // Enhanced position calculations
        const ecf = satellite.eciToEcf(posVel.position, gmst);
        const geo = satellite.eciToGeodetic(posVel.position, gmst);
        const lat = satellite.degreesLat(geo.latitude);
        const lon = satellite.degreesLong(geo.longitude);
        const alt = geo.height;

        const v = posVel.velocity;
        const vel = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);

        // Professional orbital calculations
        const meanMotion = satrec.no_kozai * (2 * Math.PI / 86400);
        const semiMajor = Math.pow(398600.4418 / (meanMotion * meanMotion), 1 / 3);
        const period = (2 * Math.PI * Math.sqrt(Math.pow(semiMajor, 3) / 398600.4418)) / 60;
        
        // Enhanced satellite object with professional data
        const category = categorizeSatellite(name);
        const engineeringData = generateEngineeringData(name, t[1], t[2], satrec, category);
        
        sats.push({ 
          id: name, 
          x: ecf.x, 
          y: ecf.y, 
          z: ecf.z, 
          vel, 
          alt, 
          satrec: {
            no_kozai: satrec.no_kozai,
            inclo: satrec.inclo,
            ecco: satrec.ecco,
            argpo: satrec.argpo,
            mo: satrec.mo,
            nodeo: satrec.nodeo,
            error: satrec.error
          }, 
          period,
          noradId: t[2].substring(2, 7),
          category: category,
          engineeringData: engineeringData
        });
        
        satellites.push({ lat, lon, alt, name, category });
      } catch (error) {
        console.warn(`Error processing satellite ${t[0]}:`, error.message);
      }
    });

    console.log(`Professional tracking: ${satellites.length} satellites processed`);
    
    res.json({
      satellites,
      timestamp: Date.now(),
      sats,
      gr_sol: [], // Simplified for professional deployment
      source: tleUrl,
      professional: true,
      categories: {
        STARLINK: sats.filter(s => s.category === 'STARLINK').length,
        GPS: sats.filter(s => s.category === 'GPS').length,
        ISS: sats.filter(s => s.category === 'ISS').length,
        WEATHER: sats.filter(s => s.category === 'WEATHER').length,
        COMMUNICATION: sats.filter(s => s.category === 'COMMUNICATION').length,
        SCIENTIFIC: sats.filter(s => s.category === 'SCIENTIFIC').length,
        MILITARY: sats.filter(s => s.category === 'MILITARY').length,
        OTHER: sats.filter(s => s.category === 'OTHER').length
      }
    });
    
  } catch (err) {
    console.error('Professional positions error:', err);
    res.status(500).json({ 
      error: 'Professional tracking system temporarily unavailable', 
      details: err.message,
      timestamp: Date.now()
    });
  }
}

// Utility function for professional TLE fetching
async function fetchTLE(url) {
  try {
    const res = await fetch(url, { 
      timeout: 20000,
      headers: {
        'User-Agent': 'Mission-Control-Professional/2.0'
      }
    });
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
    console.error('Professional TLE fetch error:', error);
    throw error;
  }
}

// Professional API endpoints
app.get('/positions', handleProfessionalPositions);
app.get('/api/starlink/positions', handleProfessionalPositions);
app.get('/api/positions', handleProfessionalPositions);
app.get('/api/professional/positions', handleProfessionalPositions);

// Professional health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'professional-operational',
    timestamp: Date.now(),
    environment: {
      node: process.version,
      cesiumConfigured: !!(process.env.CESIUM_ION_TOKEN || process.env.CESIUM_TOKEN),
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      professionalMode: true
    },
    capabilities: {
      satelliteTracking: true,
      realTimeCalculations: true,
      professionalVisualization: true,
      comprehensiveData: true,
      multiSelect: true
    }
  });
});

// Professional error handling
app.use((error, req, res, next) => {
  console.error('Professional system error:', error);
  res.status(500).json({
    error: 'Professional system temporarily unavailable',
    details: error.message,
    timestamp: Date.now()
  });
});

// Catch-all for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

// Professional server startup
app.listen(port, () => {
  console.log(`🚀 Professional Mission Control backend operational on port ${port}`);
  console.log(`📊 Professional health: http://localhost:${port}/api/health`);
  console.log(`🛰️  Professional tracking: http://localhost:${port}/api/professional/positions`);
  console.log(`🎯 Professional configuration:`);
  console.log(`   - Cesium Ion: ${process.env.CESIUM_ION_TOKEN ? '✅ Professional credentials active' : '❌ Professional credentials required'}`);
  console.log(`   - AI Analysis: ${process.env.GEMINI_API_KEY ? '✅ Advanced AI enabled' : '⚠️  Basic analysis only'}`);
  console.log(`   - Mode: Professional Mission Control`);
});
