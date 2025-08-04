import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import winston from 'winston';

// Import middleware and routes
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { validateRequest } from './middleware/validation';
import { loggerMiddleware } from './middleware/logger';

// Import routes
import authRoutes from './routes/auth';
import satelliteRoutes from './routes/satellites';
import orbitalRoutes from './routes/orbital';
import userRoutes from './routes/users';
import alertRoutes from './routes/alerts';

// Import services
import { connectDatabase } from './services/database';
import { connectRedis } from './services/redis';
import { setupCronJobs } from './services/cron';
import { SatelliteService } from './services/satelliteService';
import { OrbitalService } from './services/orbitalService';

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = createServer(app);

// Configure logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'orbital-guard-api' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cesium.com"],
      scriptSrc: ["'self'", "https://cesium.com", "https://cesiumjs.org"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https://cesium.com", "wss:", "ws:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil(parseInt(process.env.RATE_LIMIT_WINDOW || '900000') / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false
});

app.use(limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:80'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use(loggerMiddleware(logger));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/satellites', satelliteRoutes);
app.use('/api/orbital', orbitalRoutes);
app.use('/api/users', userRoutes);
app.use('/api/alerts', alertRoutes);

// Cesium proxy endpoint
app.get('/api/cesium-proxy/*', authMiddleware, async (req, res) => {
  try {
    const cesiumToken = process.env.CESIUM_ION_TOKEN;
    if (!cesiumToken) {
      return res.status(500).json({ error: 'Cesium token not configured' });
    }

    const targetUrl = req.url.replace('/api/cesium-proxy/', '');
    const response = await fetch(`https://cesium.com/ion/${targetUrl}`, {
      headers: {
        'Authorization': `Bearer ${cesiumToken}`,
        'User-Agent': 'OrbitalGuard/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Cesium request failed' });
    }

    const data = await response.arrayBuffer();
    res.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
    res.send(Buffer.from(data));
  } catch (error) {
    logger.error('Cesium proxy error:', error);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

// WebSocket setup for real-time updates
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:80'],
    credentials: true
  }
});

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  // Verify JWT token here
  next();
});

// WebSocket connection handling
io.on('connection', (socket) => {
  logger.info(`Client connected: ${socket.id}`);

  socket.on('join-satellite-updates', (data) => {
    socket.join('satellite-updates');
    logger.info(`Client ${socket.id} joined satellite updates`);
  });

  socket.on('join-alerts', (data) => {
    socket.join('alerts');
    logger.info(`Client ${socket.id} joined alerts`);
  });

  socket.on('disconnect', () => {
    logger.info(`Client disconnected: ${socket.id}`);
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Initialize services
async function initializeServices() {
  try {
    // Connect to database
    await connectDatabase();
    logger.info('Database connected successfully');

    // Connect to Redis
    await connectRedis();
    logger.info('Redis connected successfully');

    // Initialize satellite service
    const satelliteService = new SatelliteService();
    await satelliteService.initialize();
    logger.info('Satellite service initialized');

    // Initialize orbital service
    const orbitalService = new OrbitalService();
    await orbitalService.initialize();
    logger.info('Orbital service initialized');

    // Setup cron jobs
    setupCronJobs(io);
    logger.info('Cron jobs configured');

    // Start server
    const port = process.env.PORT || 3000;
    server.listen(port, () => {
      logger.info(`Orbital Guard API server running on port ${port}`);
      logger.info(`Environment: ${process.env.NODE_ENV}`);
    });

  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Initialize the application
initializeServices();

export { app, server, io };