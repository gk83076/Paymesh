const Redis = require("ioredis");
const config = require("./index");
const logger = require("./logger");

let redisClient = null;

function getRedisClient() {
  if (redisClient) return redisClient;

  redisClient = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
    lazyConnect: true,
  });

  redisClient.on("connect", () => logger.info("Redis connected"));
  redisClient.on("error", (err) => logger.error("Redis error:", err));
  redisClient.on("close", () => logger.warn("Redis connection closed"));

  return redisClient;
}

module.exports = { getRedisClient };
