const Redis = require("ioredis");
const config = require("./index");
const logger = require("./logger");

function createRedisClient() {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: null, // Required for BullMQ
    enableReadyCheck: false,
  });

  client.on("connect", () => logger.info("Redis connected"));
  client.on("error", (err) => logger.error("Redis error:", err.message));
  client.on("close", () => logger.warn("Redis connection closed"));

  return client;
}

module.exports = { getRedisClient: createRedisClient, createRedisClient };
