import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

let redisClient = null;

export function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 200, 2000);
        return delay;
      },
    });

    redisClient.on("connect", () => {
      console.log("⚡ [Redis] Connected successfully to", REDIS_URL);
    });

    redisClient.on("error", (err) => {
      console.error("❌ [Redis] Connection error:", err.message);
    });
  }
  return redisClient;
}

export function createNewRedisConnection() {
  return new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      return Math.min(times * 200, 2000);
    },
  });
}

export default getRedisClient;
