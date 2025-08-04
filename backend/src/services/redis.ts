import { createClient, RedisClientType } from 'redis';
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

class RedisService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis connection failed after 10 retries');
            return new Error('Redis connection failed');
          }
          return Math.min(retries * 100, 3000);
        }
      }
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.quit();
      this.isConnected = false;
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      return await this.client.get(key);
    } catch (error) {
      logger.error(`Error getting key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (error) {
      logger.error(`Error setting key ${key}:`, error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      await this.client.del(key);
    } catch (error) {
      logger.error(`Error deleting key ${key}:`, error);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  async expire(key: string, seconds: number): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      await this.client.expire(key, seconds);
    } catch (error) {
      logger.error(`Error setting expiry for key ${key}:`, error);
    }
  }

  async incr(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      return await this.client.incr(key);
    } catch (error) {
      logger.error(`Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      return await this.client.hGet(key, field);
    } catch (error) {
      logger.error(`Error getting hash field ${field} from key ${key}:`, error);
      return null;
    }
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      await this.client.hSet(key, field, value);
    } catch (error) {
      logger.error(`Error setting hash field ${field} for key ${key}:`, error);
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      return await this.client.hGetAll(key);
    } catch (error) {
      logger.error(`Error getting all hash fields for key ${key}:`, error);
      return {};
    }
  }

  async sadd(key: string, ...members: string[]): Promise<void> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      await this.client.sAdd(key, members);
    } catch (error) {
      logger.error(`Error adding set members to key ${key}:`, error);
    }
  }

  async smembers(key: string): Promise<string[]> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      return await this.client.sMembers(key);
    } catch (error) {
      logger.error(`Error getting set members for key ${key}:`, error);
      return [];
    }
  }

  async sismember(key: string, member: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis not connected');
      }
      return await this.client.sIsMember(key, member);
    } catch (error) {
      logger.error(`Error checking set membership for key ${key}:`, error);
      return false;
    }
  }

  // Cache helper methods
  async getCached<T>(key: string, ttl: number = 3600): Promise<T | null> {
    try {
      const cached = await this.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error(`Error getting cached data for key ${key}:`, error);
      return null;
    }
  }

  async setCached<T>(key: string, data: T, ttl: number = 3600): Promise<void> {
    try {
      await this.set(key, JSON.stringify(data), ttl);
    } catch (error) {
      logger.error(`Error setting cached data for key ${key}:`, error);
    }
  }

  // Session management
  async setSession(sessionId: string, data: any, ttl: number = 86400): Promise<void> {
    await this.set(`session:${sessionId}`, JSON.stringify(data), ttl);
  }

  async getSession(sessionId: string): Promise<any | null> {
    const data = await this.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.del(`session:${sessionId}`);
  }

  // Rate limiting
  async incrementRateLimit(key: string, window: number = 3600): Promise<number> {
    const current = await this.incr(key);
    if (current === 1) {
      await this.expire(key, window);
    }
    return current;
  }

  async getRateLimit(key: string): Promise<number> {
    const current = await this.get(key);
    return current ? parseInt(current) : 0;
  }
}

// Create singleton instance
export const redisService = new RedisService();
export const redisClient = redisService.client;

// Connect function for initialization
export const connectRedis = async (): Promise<void> => {
  await redisService.connect();
};