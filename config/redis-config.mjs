import Redis from 'ioredis';

const redisOptions = {
  host: process.env.REDIS_HOST || 'redis-18909.c305.ap-south-1-1.ec2.redns.redis-cloud.com',
  port: parseInt(process.env.REDIS_PORT || '18909'), 
  password: process.env.REDIS_PASSWORD || "qsWG3H1WQZO6Gz71iaSHUC7lH4y3QgMR",
  maxRetriesPerRequest: 3, // Fail fast on connection issues
  enableReadyCheck: true, // Verify Redis is ready
  reconnectOnError: (err) => {
    // Reconnect only on non-network errors
    const targetErrors = [/READONLY/, /ETIMEDOUT/];
    return targetErrors.some(pattern => pattern.test(err.message));
  }
};

export const redis = new Redis(redisOptions);
export const pubClient = new Redis(redisOptions);
export const subClient = pubClient.duplicate();

// Handle connection events
['connect', 'ready', 'error', 'close', 'reconnecting'].forEach(event => {
  redis.on(event, () => console.log(`[Redis] ${event}`));
  pubClient.on(event, () => console.log(`[Redis-Pub] ${event}`));
  subClient.on(event, () => console.log(`[Redis-Sub] ${event}`));
});

// Graceful shutdown handler
const shutdown = async () => {
  await Promise.all([
    redis.quit(),
    pubClient.quit(),
    subClient.quit()
  ]);
  console.log('Redis connections closed');
};

subClient.on('error', (err) => {
  console.error('Redis sub error:', err);
  setTimeout(() => subClient.connect(), 1000);
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
