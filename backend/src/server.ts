import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

import { logger } from '@/utils/logger';
import { connectDatabase } from '@/config/database';
import { connectRedis } from '@/config/redis';
import { errorHandler } from '@/middleware/errorHandler';
import { authMiddleware } from '@/middleware/auth';
import { validateRequest } from '@/middleware/validation';

// Route imports
import authRoutes from '@/routes/auth';
import satelliteRoutes from '@/routes/satellites';
import threatRoutes from '@/routes/threats';
import healthRoutes from '@/routes/health';
import cesiumRoutes from '@/routes/cesium';

// Service imports
import { SatelliteTracker } from '@/services/SatelliteTracker';
import { ThreatAnalyzer } from '@/services/ThreatAnalyzer';
import { AutonomousManager } from '@/services/AutonomousManager';
import { WebSocketHandler } from '@/services/WebSocketHandler';

// Load environment variables
dotenv.config();

class SatelliteTrackingServer {
  private app: express.Application;
  private server: any;
  private wss: WebSocketServer;
  private satelliteTracker: SatelliteTracker;
  private threatAnalyzer: ThreatAnalyzer;
  private autonomousManager: AutonomousManager;
  private wsHandler: WebSocketHandler;

  constructor() {
    this.app = express();
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeServices();
    this.initializeWebSocket();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
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
      crossOriginEmbedderPolicy: false,
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.getAllowedOrigins(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-ID', 'X-API-Key'],
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
      message: { error: 'Too many requests, please try again later' },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api', limiter);

    // Body parsing and compression
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      logger.info({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      }, 'Incoming request');
      next();
    });
  }

  private getAllowedOrigins(): string[] {
    const origins = process.env.ALLOWED_ORIGINS;
    if (!origins) return ['http://localhost:3001', 'http://localhost:3000'];
    return origins.split(',').map(origin => origin.trim());
  }

  private initializeRoutes(): void {
    // Health check (no auth required)
    this.app.use('/api/health', healthRoutes);

    // Authentication routes
    this.app.use('/api/auth', authRoutes);

    // Protected routes
    this.app.use('/api/satellites', authMiddleware, satelliteRoutes);
    this.app.use('/api/threats', authMiddleware, threatRoutes);
    this.app.use('/api/cesium-proxy', authMiddleware, cesiumRoutes);

    // Static file serving (if needed)
    this.app.use('/static', express.static('public'));

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }

  private async initializeServices(): Promise<void> {
    try {
      // Initialize tracking services
      this.satelliteTracker = new SatelliteTracker();
      this.threatAnalyzer = new ThreatAnalyzer();
      this.autonomousManager = new AutonomousManager();

      // Start autonomous operations
      await this.autonomousManager.initialize();
      
      logger.info('All services initialized successfully');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize services');
      throw error;
    }
  }

  private initializeWebSocket(): void {
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.wsHandler = new WebSocketHandler(this.wss, this.satelliteTracker);
    
    logger.info('WebSocket server initialized');
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to databases
      await connectDatabase();
      await connectRedis();

      const port = process.env.PORT || 3000;
      
      this.server.listen(port, () => {
        logger.info({
          port,
          environment: process.env.NODE_ENV,
          features: {
            autonomousOperations: process.env.AUTO_TOKEN_ROTATION === 'true',
            threatAnalysis: process.env.THREAT_ANALYSIS_ENABLED === 'true',
            selfHealing: process.env.SELF_HEALING_ENABLED === 'true',
          }
        }, 'Satellite tracking server started');
      });

      // Graceful shutdown handling
      this.setupGracefulShutdown();

    } catch (error) {
      logger.error({ error }, 'Failed to start server');
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
      
      try {
        // Stop accepting new connections
        this.server.close(() => {
          logger.info('HTTP server closed');
        });

        // Close WebSocket connections
        this.wss.close(() => {
          logger.info('WebSocket server closed');
        });

        // Stop autonomous operations
        await this.autonomousManager.shutdown();

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Error during graceful shutdown');
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  }
}

// Start the server
if (require.main === module) {
  const server = new SatelliteTrackingServer();
  server.start().catch((error) => {
    logger.error({ error }, 'Failed to start application');
    process.exit(1);
  });
}

export default SatelliteTrackingServer;