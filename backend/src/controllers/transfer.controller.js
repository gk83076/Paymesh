const { z } = require("zod");
const switchService = require("../modules/switch/switch.service");
const metricsService = require("../modules/metrics/metrics.service");
const { AppError } = require("../utils/errors");

const transferSchema = z.object({
  senderId: z.string().uuid("senderId must be a valid UUID"),
  receiverId: z.string().uuid("receiverId must be a valid UUID"),
  amount: z.number().positive("amount must be positive").max(1000000, "amount cannot exceed ₹10,00,000"),
  idempotencyKey: z.string().min(1).max(255),
});

/**
 * POST /api/transfer
 */
async function initiateTransfer(req, res) {
  const startTime = Date.now();

  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "Validation failed: " + parsed.error.errors.map((e) => e.message).join(", "),
      422
    );
  }

  const result = await switchService.transfer(parsed.data);
  metricsService.recordTransaction();
  metricsService.recordLatency(Date.now() - startTime);

  const statusCode = result.status === "SUCCESS" ? 200 : result._idempotencyHit ? 200 : 202;
  res.status(statusCode).json({ ok: true, data: result });
}

/**
 * GET /api/transfer/:id
 */
async function getTransfer(req, res) {
  const { id } = req.params;
  const txn = await switchService.getTransaction(id);
  if (!txn) throw new AppError(`Transaction ${id} not found`, 404);
  res.json({ ok: true, data: txn });
}

/**
 * GET /api/transactions
 */
async function listTransactions(req, res) {
  const { page, limit, status, riskLevel, dateFrom, dateTo } = req.query;
  const result = await switchService.listTransactions({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    status,
    riskLevel,
    dateFrom,
    dateTo,
  });
  res.json({ ok: true, data: result });
}

module.exports = { initiateTransfer, getTransfer, listTransactions };
