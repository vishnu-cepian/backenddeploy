import redis from '../config/redis-config.mjs';

const DEFAULT_EXPIRY = 60; // seconds

export const setCache = async (key, data, ttl = DEFAULT_EXPIRY) => {
  try {
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
  } catch (err) {
    console.error('Redis setCache error:', err);
  }
};

export const getCache = async (key) => {
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.error('Redis getCache error:', err);
    return null;
  }
};

export const delCache = async (key) => {
  try {
    await redis.del(key);
  } catch (err) {
    console.error('Redis delCache error:', err);
  }
};

// Generic cache wrapper for any async function
export const cacheOrFetch = async (key, fetchFn, ttl = DEFAULT_EXPIRY) => {
  const cached = await getCache(key);
  if (cached) return cached;

  const freshData = await fetchFn();
  if (freshData) await setCache(key, freshData, ttl);
  return freshData;
};

export default redis;
