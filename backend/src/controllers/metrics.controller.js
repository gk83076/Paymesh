const metricsService = require("../modules/metrics/metrics.service");

/**
 * GET /api/metrics
 */
async function getMetrics(req, res) {
  const metrics = await metricsService.getMetrics();
  res.json({ ok: true, data: metrics });
}

module.exports = { getMetrics };
