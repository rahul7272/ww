import IORedis from "ioredis";

let redisClient = null;
let isConnected = false;

/**
 * Get or initialize the application Redis client.
 * Uses process.env.REDIS_URL or defaults to redis://127.0.0.1:6379 on VPS.
 * Gracefully handles offline state without crashing the Node.js process.
 */
export function getRedisClient() {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  try {
    redisClient = new IORedis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null; // do not spam connection attempts if redis is not running
        return Math.min(times * 1000, 3000);
      },
    });

    redisClient.on("connect", () => {
      isConnected = true;
      console.log(`[Redis] ✅ Connected successfully to ${redisUrl}`);
    });

    redisClient.on("error", (err) => {
      isConnected = false;
      // Suppress spammy unhandled error exceptions when Redis is not installed locally
    });

    // Attempt lazy connection
    redisClient.connect().catch(() => {});
  } catch (err) {
    console.warn(`[Redis] Optional Redis not initialized: ${err.message}`);
  }

  return redisClient;
}

/**
 * Check if Redis connection is currently live.
 */
export function isRedisAvailable() {
  return isConnected;
}

export default {
  getRedisClient,
  isRedisAvailable,
};
