const fraudService = require("../modules/fraud/fraud.service");

/**
 * GET /api/fraud/reports
 */
async function getFraudReports(req, res) {
  const { page, limit, riskLevel } = req.query;
  const result = await fraudService.getFraudReports({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    riskLevel,
  });
  res.json({ ok: true, data: result });
}

module.exports = { getFraudReports };
