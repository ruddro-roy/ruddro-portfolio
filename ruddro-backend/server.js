const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Starlink Tracker Server...');
console.log('📁 Current directory:', __dirname);
console.log('🌐 Port:', PORT);
console.log('🌍 Environment:', process.env.NODE_ENV || 'development');

// Test if public directory exists
const publicDir = path.join(__dirname, 'public');
console.log('📂 Looking for public directory at:', publicDir);
console.log('📂 Public directory exists:', fs.existsSync(publicDir));

// List files in current directory for debugging
console.log('📋 Files in current directory:');
try {
  const files = fs.readdirSync(__dirname);
  files.forEach(file => console.log('  -', file));
} catch (error) {
  console.error('❌ Could not read directory:', error.message);
}

// Security middleware with relaxed CSP for development
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

// Serve static files - try multiple paths
if (fs.existsSync(publicDir)) {
  console.log('✅ Serving static files from public/ directory');
  app.use(express.static(publicDir));
} else {
  console.log('⚠️ Public directory not found, serving from current directory');
  app.use(express.static(__dirname));
}

// Health check endpoint (essential for Render)
app.get('/health', (req, res) => {
  console.log('🔍 Health check requested');
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    publicDir: publicDir,
    publicExists: fs.existsSync(publicDir)
  });
});

// API endpoint to proxy TLE data (to avoid CORS issues)
app.get('/api/tle', async (req, res) => {
  console.log('📡 TLE data requested');
  try {
    const fetch = (await import('node-fetch')).default;
    console.log('🌐 Fetching TLE data from CelesTrak...');
    
    const response = await fetch('https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=tle', {
      timeout: 10000 // 10 second timeout
    });
    
    if (!response.ok) {
      throw new Error(`TLE fetch failed: ${response.status}`);
    }
    
    const tleData = await response.text();
    console.log(`✅ TLE data fetched successfully (${tleData.length} bytes)`);
    
    // Set appropriate headers
    res.set({
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      'Access-Control-Allow-Origin': '*'
    });
    
    res.send(tleData);
  } catch (error) {
    console.error('❌ Error fetching TLE data:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch TLE data',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    message: 'Server is working!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  const indexPaths = [
    path.join(publicDir, 'index.html'),
    path.join(__dirname, 'index.html')
  ];
  
  let indexPath = null;
  for (const testPath of indexPaths) {
    if (fs.existsSync(testPath)) {
      indexPath = testPath;
      break;
    }
  }
  
  if (indexPath) {
    console.log(`📄 Serving index.html from: ${indexPath}`);
    res.sendFile(indexPath);
  } else {
    console.log('❌ index.html not found, sending fallback');
    res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Starlink Tracker - Setup Required</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; background: #1a1a2e; color: white; }
          .container { max-width: 600px; margin: 0 auto; text-align: center; }
          .error { background: #e74c3c; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .info { background: #3498db; padding: 20px; border-radius: 8px; margin: 20px 0; }
          pre { background: #2c3e50; padding: 15px; border-radius: 5px; text-align: left; overflow-x: auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🛰️ Starlink Tracker</h1>
          <div class="error">
            <h2>Setup Required</h2>
            <p>The index.html file was not found. Please ensure your project structure is correct.</p>
          </div>
          <div class="info">
            <h3>Server Status: Running ✅</h3>
            <p>Environment: ${process.env.NODE_ENV || 'development'}</p>
            <p>Port: ${PORT}</p>
            <p>Time: ${new Date().toISOString()}</p>
          </div>
          <div class="info">
            <h3>Project Structure Should Be:</h3>
            <pre>
project-root/
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── style.css
    └── app.js
            </pre>
          </div>
          <p><a href="/health" style="color: #3498db;">Check Health Status</a></p>
        </div>
      </body>
      </html>
    `);
  }
});

// Global error handling
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('💥 Express Error:', err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log('🎉 ========================================');
  console.log(`🚀 Starlink Tracker Server STARTED!`);
  console.log(`📡 URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📁 Serving files from: ${fs.existsSync(publicDir) ? 'public/' : 'current directory'}`);
  console.log('🎉 ========================================');
}).on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use`);
  } else {
    console.error('❌ Server failed to start:', error);
  }
  process.exit(1);
});
