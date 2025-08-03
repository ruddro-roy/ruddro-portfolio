const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "'unsafe-eval'",
        "https://cdnjs.cloudflare.com",
        "https://cesiumjs.org",
        "https://cdn.jsdelivr.net"
      ],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'",
        "https://cdnjs.cloudflare.com",
        "https://cesiumjs.org"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "blob:",
        "https:",
        "https://basemap.nationalmap.gov",
        "https://cesiumjs.org"
      ],
      connectSrc: [
        "'self'",
        "https://celestrak.org",
        "https://basemap.nationalmap.gov",
        "https://cesiumjs.org"
      ],
      workerSrc: ["'self'", "blob:"],
      frameSrc: ["'none'"]
    }
  }
}));

// Enable CORS for all routes
app.use(cors());

// Enable gzip compression
app.use(compression());

// Parse JSON bodies
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to proxy TLE data (to avoid CORS issues)
app.get('/api/tle', async (catch, res) => {
  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle');
    
    if (!response.ok) {
      throw new Error(`TLE fetch failed: ${response.status}`);
    }
    
    const tleData = await response.text();
    
    // Set appropriate headers
    res.set({
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(tleData);
  } catch (error) {
    console.error('Error fetching TLE data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch TLE data',
      message: error.message 
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Starlink Tracker Server running on port ${PORT}`);
  console.log(`📡 Access the application at: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});
