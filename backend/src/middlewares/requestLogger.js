const logger = require("../config/logger");

/**
 * Request logger middleware using morgan-style manual logging.
 */
function requestLogger(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level](
      `${req.method} ${req.path} ${res.statusCode} — ${duration}ms`
    );
  });

  next();
}

module.exports = requestLogger;
