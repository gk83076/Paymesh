"use strict";

const app = require("./app");
const config = require("./config");
const logger = require("./config/logger");
const prisma = require("./config/database");
const { startWorker, stopWorker } = require("./jobs/creditRetryProcessor");

let server;

async function main() {
  // Test database connection
  try {
    await prisma.$connect();
    logger.info("✅ Database connected");
  } catch (err) {
    logger.error("❌ Database connection failed:", err);
    process.exit(1);
  }

  // Start BullMQ worker
  try {
    startWorker();
    logger.info("✅ BullMQ worker started");
  } catch (err) {
    logger.warn("⚠️  BullMQ worker failed to start (Redis may be unavailable):", err.message);
  }

  // Start HTTP server
  server = app.listen(config.port, () => {
    logger.info(`🚀 PayMesh API running on http://localhost:${config.port}`);
    logger.info(`📚 Swagger docs: http://localhost:${config.port}/api/docs`);
    logger.info(`🌍 Environment: ${config.env}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`Port ${config.port} is already in use`);
    } else {
      logger.error("Server error:", err);
    }
    process.exit(1);
  });
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
async function shutdown(signal) {
  logger.info(`${signal} received. Graceful shutdown...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => logger.info("HTTP server closed"));
  }

  // Stop BullMQ worker
  await stopWorker();

  // Disconnect Prisma
  await prisma.$disconnect();
  logger.info("Database disconnected");

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle unhandled rejections
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err);
  process.exit(1);
});

main();
