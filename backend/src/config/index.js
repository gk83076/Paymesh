/**
 * Environment configuration with validation
 */

require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT || "3001", 10),

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },

  logging: {
    level: process.env.LOG_LEVEL || "info",
  },

  // BullMQ retry configuration
  retry: {
    maxAttempts: 5,
    backoffDelays: [1000, 2000, 4000, 8000, 16000], // ms
  },

  // Fraud thresholds
  fraud: {
    velocityWindowSec: 30,
    velocityMaxTxns: 5,
    largeAmountThreshold: 50000,
    recipientSpreadWindowSec: 60,
    recipientSpreadMax: 3,
  },
};

// Validate required fields
if (!config.database.url) {
  throw new Error("DATABASE_URL is required");
}

module.exports = config;
