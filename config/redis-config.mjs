import Redis from 'ioredis';

const redis = new Redis({
    host: process.env.REDIS_HOST || 'redis-18909.c305.ap-south-1-1.ec2.redns.redis-cloud.com',
    port: process.env.REDIS_PORT || 18909,
    password: process.env.REDIS_PASSWORD || "qsWG3H1WQZO6Gz71iaSHUC7lH4y3QgMR",
  });

export default redis;
