import Redis from 'ioredis';

class RedisManager {
  constructor() {
    this.options = {
      host: process.env.REDIS_HOST || 'redis-18909.c305.ap-south-1-1.ec2.redns.redis-cloud.com',
      port: parseInt(process.env.REDIS_PORT || '18909'), 
      password: process.env.REDIS_PASSWORD || "qsWG3H1WQZO6Gz71iaSHUC7lH4y3QgMR",
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