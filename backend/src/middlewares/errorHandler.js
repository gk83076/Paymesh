const logger = require("../config/logger");

/**
 * Global error handler middleware.
 * Must be registered last in Express.
 */
function errorHandler(err, req, res, next) {
  // Log the error
  if (err.isOperational) {
    logger.warn(`[ERROR] ${err.message} (${err.statusCode})`);
  } else {
    logger.error("[CRITICAL] Unexpected error:", err);
  }

  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : "Internal server error";

  res.status(statusCode).json({
    ok: false,
    error: {
      message,
      code: err.code || null,
      details: err.details || null,
      ...(process.env.NODE_ENV === "development" && !err.isOperational
        ? { stack: err.stack }
        : {}),
    },
  });
}

module.exports = errorHandler;
