import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

/**
 * A helper function to get a required environment variable.
 * Throws an error if the variable is not set.
 * @param {string} name The name of the environment variable.
 * @returns {string} The value of the environment variable.
 */
const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`FATAL ERROR: Environment variable "${name}" is not set.`);
  }
  return value;
};

class RedisManager {
  constructor() {
    this.options = {
      host: getRequiredEnv('REDIS_HOST'),
      port: parseInt(getRequiredEnv('REDIS_PORT'), 10), 
      password: getRequiredEnv('REDIS_PASSWORD'),
      enableReadyCheck: true, // Verify Redis is ready
      reconnectOnError: (err) => {
        // Reconnect only on non-network errors
        const targetErrors = [/READONLY/, /ETIMEDOUT/];
        return targetErrors.some(pattern => pattern.test(err.message));
      }
    };
    this.clients = {};
    this.initialize();
}

initialize() {
  this.clients.redis = new Redis({
    ...this.options,
    maxRetriesPerRequest: 3,
  });

  // Pub/Sub clients
  this.clients.pubClient = new Redis(this.options);
  this.clients.subClient = this.clients.pubClient.duplicate();

  // BullMQ-specific client
  this.clients.bullRedis = new Redis({
    ...this.options,
    maxRetriesPerRequest: null // Critical for BullMQ
  });

   this.setupEventHandlers();
   this.setupGracefulShutdown()
}

setupEventHandlers() {
  const clientTypes = ['redis', 'pubClient', 'subClient', 'bullRedis'];
        
        clientTypes.forEach(type => {
            const client = this.clients[type];
            
            ['connect', 'ready', 'error', 'close', 'reconnecting', 'end'].forEach(event => {
                client.on(event, () => {
                    console.log(`[Redis-${type}] ${event}`, 
                        event === 'error' ? client.lastError : '');
                });
            });

            // Enhanced error handling
            client.on('error', (err) => {
                console.error(`[Redis-${type}] Error:`, err);
                if (!['ECONNREFUSED', 'ENOTFOUND'].includes(err.code)) {
                    setTimeout(() => client.connect(), 5000);
                }
            });
        });
    }

    setupGracefulShutdown() {
      const shutdown = async () => {
        console.log('\nStarting Redis connection shutdown...');

        try {
          await Promise.all([
              this.clients.redis.quit(),
              this.clients.pubClient.quit(),
              this.clients.subClient.quit(),
              this.clients.bullRedis.quit()
          ].map(p => p.catch(e => console.error('Error closing connection:', e))));
          
          console.log('All Redis connections closed gracefully');
          process.exit(0);
        } catch (err) {
          console.error('Shutdown error:', err);
          process.exit(1);
        }
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);
        process.on('SIGHUP', shutdown);
      }

    getClients() {
      return this.clients;
    }
}

export const redisManager = new RedisManager();
export const { redis, pubClient, subClient, bullRedis } = redisManager.getClients();