import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import { body, validationResult } from 'express-validator';
import winston from 'winston';
import cron from 'node-cron';
import fetch from 'node-fetch';
import satellite from 'satellite.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ================================================
// CONFIGURATION
// ================================================

const config = {
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  cesiumToken: process.env.CESIUM_ION_TOKEN || '',
  
  // TLE Data Sources
  dataSources: {
    primary: process.env.TLE_URL || 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle',
    starlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle',
    stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle',
    weather: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle'
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 100 : 1000
  },
  
  // Caching
  cache: {
    tleUpdateInterval: '0 */6 * * *', // Every 6 hours
    maxAge: 6 * 60 * 60 * 1000 // 6 hours in milliseconds
  }
};

// ================================================
// LOGGING SETUP
// ================================================

const logger = winston.createLogger({
  level: config.nodeEnv === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// ================================================
// SATELLITE DATA MANAGER
// ================================================

class SatelliteDataManager {
  constructor() {
    this.cache = new Map();
    this.lastUpdate = null;
    this.updateInProgress = false;
  }

  async fetchTLEData(url) {
    try {
      logger.info(`Fetching TLE data from: ${url}`);
      const response = await fetch(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Orbital-Dynamics/2.0 (https://your-domain.com)'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.text();
      logger.info(`Successfully fetched ${data.split('\n').length / 3} satellite records`);
      return data;
    } catch (error) {
      logger.error(`Failed to fetch TLE data: ${error.message}`);
      throw error;
    }
  }

  parseTLEData(tleText) {
    const satellites = [];
    const lines = tleText.split(/\r?\n/).filter(line => line.trim());

    for (let i = 0; i < lines.length - 2; i += 3) {
      const name = lines[i].trim();
      const line1 = lines[i + 1].trim();
      const line2 = lines[i + 2].trim();

      if (name && line1 && line2 && line1.startsWith('1 ') && line2.startsWith('2 ')) {
        try {
          const satrec = satellite.twoline2satrec(line1, line2);
          
          if (satrec.error === 0) {
            satellites.push({
              name,
              noradId: satrec.satnum,
              tle1: line1,
              tle2: line2,
              constellation: this.identifyConstellation(name),
              lastUpdate: new Date().toISOString()
            });
          }
        } catch (error) {
          logger.warn(`Failed to parse TLE for ${name}: ${error.message}`);
        }
      }
    }

    return satellites;
  }

  identifyConstellation(name) {
    const upperName = name.toUpperCase();
    
    if (upperName.includes('STARLINK')) return 'starlink';
    if (upperName.includes('ONEWEB')) return 'oneweb';
    if (upperName.includes('IRIDIUM')) return 'iridium';
    if (upperName.includes('GLOBALSTAR')) return 'globalstar';
    if (upperName.includes('ISS') || upperName.includes('STATION')) return 'station';
    if (upperName.includes('NOAA') || upperName.includes('WEATHER')) return 'weather';
    if (upperName.includes('AMSAT') || upperName.includes('AO-') || upperName.includes('FO-')) return 'amateur';
    
    return 'other';
  }

  async updateSatelliteData() {
    if (this.updateInProgress) {
      logger.info('Update already in progress, skipping...');
      return;
    }

    this.updateInProgress = true;
    
    try {
      logger.info('Starting satellite data update...');
      
      // Fetch data from primary source
      let tleData;
      try {
        tleData = await this.fetchTLEData(config.dataSources.primary);
      } catch (error) {
        logger.warn('Primary source failed, trying Starlink data as backup...');
        tleData = await this.fetchTLEData(config.dataSources.starlink);
      }

      // Parse and cache data
      const satellites = this.parseTLEData(tleData);
      this.cache.set('satellites', satellites);
      this.cache.set('lastUpdate', new Date());
      this.lastUpdate = new Date();

      logger.info(`Successfully updated ${satellites.length} satellite records`);
      
    } catch (error) {
      logger.error(`Failed to update satellite data: ${error.message}`);
      throw error;
    } finally {
      this.updateInProgress = false;
    }
  }

  getSatellites() {
    return this.cache.get('satellites') || [];
  }

  getLastUpdate() {
    return this.lastUpdate;
  }

  isDataStale() {
    if (!this.lastUpdate) return true;
    return Date.now() - this.lastUpdate.getTime() > config.cache.maxAge;
  }
}

// ================================================
// EXPRESS APP SETUP
// ================================================

const app = express();
const dataManager = new SatelliteDataManager();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cesium.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cesium.com", "https://cdnjs.cloudflare.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://celestrak.org", "https://cesium.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:"]
    }
  }
}));

// CORS configuration
app.use(cors({
  origin: config.nodeEnv === 'development' ? true : [
    'https://your-domain.com',
    'https://www.your-domain.com'
  ],
  credentials: true
}));

// Compression and parsing
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: config.nodeEnv === 'production' ? '1d' : '0',
  etag: true,
  lastModified: true
}));

// ================================================
// API ROUTES
// ================================================

// Health check endpoint
app.get('/health', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime)}s`,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    },
    lastDataUpdate: dataManager.getLastUpdate(),
    satelliteCount: dataManager.getSatellites().length
  });
});

// Configuration endpoint
app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`
    window.CESIUM_ION_TOKEN = "${config.cesiumToken}";
    window.API_BASE_URL = "${req.protocol}://${req.get('host')}";
    window.NODE_ENV = "${config.nodeEnv}";
  `);
});

// Get all satellites
app.get('/api/satellites', async (req, res) => {
  try {
    // Check if data needs updating
    if (dataManager.isDataStale()) {
      await dataManager.updateSatelliteData();
    }

    const satellites = dataManager.getSatellites();
    const { constellation, limit = 1000 } = req.query;

    let filteredSatellites = satellites;
    
    // Filter by constellation if specified
    if (constellation) {
      filteredSatellites = satellites.filter(sat => 
        sat.constellation === constellation
      );
    }

    // Limit results
    filteredSatellites = filteredSatellites.slice(0, parseInt(limit));

    res.json({
      satellites: filteredSatellites,
      totalCount: satellites.length,
      filteredCount: filteredSatellites.length,
      lastUpdate: dataManager.getLastUpdate(),
      constellations: [...new Set(satellites.map(s => s.constellation))]
    });

  } catch (error) {
    logger.error(`Error fetching satellites: ${error.message}`);
    res.status(500).json({
      error: 'Failed to fetch satellites',
      message: error.message
    });
  }
});

// Search satellites
app.get('/api/search', (req, res) => {
  try {
    const { q: query, limit = 20 } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        error: 'Query parameter "q" must be at least 2 characters long'
      });
    }

    const satellites = dataManager.getSatellites();
    const upperQuery = query.toUpperCase();
    
    const results = satellites
      .filter(sat => 
        sat.name.toUpperCase().includes(upperQuery) ||
        sat.noradId.toString().includes(query)
      )
      .slice(0, parseInt(limit))
      .map(sat => ({
        noradId: sat.noradId,
        name: sat.name,
        constellation: sat.constellation
      }));

    res.json({
      query,
      results,
      totalFound: results.length
    });

  } catch (error) {
    logger.error(`Error searching satellites: ${error.message}`);
    res.status(500).json({
      error: 'Search failed',
      message: error.message
    });
  }
});

// Catch-all route for SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ================================================
// ERROR HANDLING
// ================================================

// Global error handler
app.use((err, req, res, next) => {
  logger.error(`Global error: ${err.message}`, err);
  
  res.status(err.status || 500).json({
    error: config.nodeEnv === 'development' ? err.message : 'Internal Server Error',
    ...(config.nodeEnv === 'development' && { stack: err.stack })
  });
});

// ================================================
// SCHEDULED TASKS
// ================================================

// Update satellite data every 6 hours
cron.schedule(config.cache.tleUpdateInterval, async () => {
  logger.info('Running scheduled satellite data update...');
  try {
    await dataManager.updateSatelliteData();
    logger.info('Scheduled update completed successfully');
  } catch (error) {
    logger.error(`Scheduled update failed: ${error.message}`);
  }
});

// ================================================
// SERVER STARTUP
// ================================================

async function startServer() {
  try {
    // Initial data load
    logger.info('Loading initial satellite data...');
    await dataManager.updateSatelliteData();
    
    // Start server
    const server = app.listen(config.port, config.host, () => {
      logger.info(`🚀 Orbital Dynamics server running on ${config.host}:${config.port}`);
      logger.info(`📡 Environment: ${config.nodeEnv}`);
      logger.info(`🛰️  Loaded ${dataManager.getSatellites().length} satellites`);
    });

    // Graceful shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

// Start the application
startServer();
