const express = require("express");
const router = express.Router();

const transferController = require("../controllers/transfer.controller");
const accountController = require("../controllers/account.controller");
const fraudController = require("../controllers/fraud.controller");
const metricsController = require("../controllers/metrics.controller");
const adminController = require("../controllers/admin.controller");

// ─── Health ────────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: Service is healthy
 */
router.get("/health", (req, res) => {
  res.json({ ok: true, service: "PayMesh API", timestamp: new Date().toISOString() });
});

// ─── Transfer / Switch ────────────────────────────────────────────────────
/**
 * @openapi
 * /api/transfer:
 *   post:
 *     summary: Initiate a UPI transfer
 *     tags: [Transfer]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [senderId, receiverId, amount, idempotencyKey]
 *             properties:
 *               senderId:
 *                 type: string
 *                 format: uuid
 *               receiverId:
 *                 type: string
 *                 format: uuid
 *               amount:
 *                 type: number
 *                 minimum: 1
 *               idempotencyKey:
 *                 type: string
 *     responses:
 *       200:
 *         description: Transfer successful or idempotency hit
 *       202:
 *         description: Transfer queued for retry
 *       402:
 *         description: Insufficient funds
 *       422:
 *         description: Validation error
 */
router.post("/transfer", transferController.initiateTransfer);

/**
 * @openapi
 * /api/transfer/{id}:
 *   get:
 *     summary: Get transaction details with full state history
 *     tags: [Transfer]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Transaction details
 *       404:
 *         description: Transaction not found
 */
router.get("/transfer/:id", transferController.getTransfer);

// ─── Transactions ─────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/transactions:
 *   get:
 *     summary: List transactions with filters
 *     tags: [Transactions]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [INITIATED, DEBIT_PENDING, DEBIT_SUCCESS, CREDIT_PENDING, CREDIT_SUCCESS, SUCCESS, FAILED, ROLLBACK_INITIATED, ROLLED_BACK, RECOVERY_PENDING]
 *       - in: query
 *         name: riskLevel
 *         schema:
 *           type: string
 *           enum: [NORMAL, SUSPICIOUS, HIGH_RISK]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       200:
 *         description: Paginated transaction list
 */
router.get("/transactions", transferController.listTransactions);

// ─── Accounts / Users ─────────────────────────────────────────────────────
/**
 * @openapi
 * /api/accounts:
 *   get:
 *     summary: List all accounts
 *     tags: [Accounts]
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: bank
 *         schema:
 *           type: string
 *           enum: [BANK_A, BANK_B, BANK_C]
 *     responses:
 *       200:
 *         description: Account list
 */
router.get("/accounts", accountController.listAccounts);
router.get("/accounts/:accountId/balance", accountController.getBalance);
router.get("/accounts/:accountId/ledger", accountController.getLedger);
router.get("/users", accountController.listUsers);

// ─── Bank APIs ────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/banks/debit:
 *   post:
 *     summary: Debit a bank account (internal simulation)
 *     tags: [Banks]
 */
router.post("/banks/debit", accountController.bankDebit);

/**
 * @openapi
 * /api/banks/credit:
 *   post:
 *     summary: Credit a bank account (internal simulation)
 *     tags: [Banks]
 */
router.post("/banks/credit", accountController.bankCredit);
router.get("/banks/:accountId/balance", accountController.getBalance);

// ─── Fraud ───────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/fraud/reports:
 *   get:
 *     summary: Get fraud reports
 *     tags: [Fraud]
 */
router.get("/fraud/reports", fraudController.getFraudReports);

// ─── Metrics ─────────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/metrics:
 *   get:
 *     summary: Get system metrics and monitoring data
 *     tags: [Monitoring]
 *     responses:
 *       200:
 *         description: System metrics
 */
router.get("/metrics", metricsController.getMetrics);

// ─── Admin / Chaos ────────────────────────────────────────────────────────
/**
 * @openapi
 * /api/admin/banks/status:
 *   get:
 *     summary: Get status of all banks
 *     tags: [Admin]
 */
router.get("/admin/banks/status", adminController.getBankStatus);

/**
 * @openapi
 * /api/admin/crash-bank-a:
 *   post:
 *     summary: Take Bank A offline
 *     tags: [Admin]
 */
router.post("/admin/crash-bank-a", adminController.crashBankA);
router.post("/admin/crash-bank-b", adminController.crashBankB);
router.post("/admin/crash-bank-c", adminController.crashBankC);

/**
 * @openapi
 * /api/admin/recover/:bankCode:
 *   post:
 *     summary: Bring a bank back online
 *     tags: [Admin]
 */
router.post("/admin/recover/:bankCode", adminController.recoverBank);

/**
 * @openapi
 * /api/admin/add-delay:
 *   post:
 *     summary: Add artificial latency to a bank
 *     tags: [Admin]
 */
router.post("/admin/add-delay", adminController.addDelay);

/**
 * @openapi
 * /api/admin/set-failure-rate:
 *   post:
 *     summary: Set random failure rate for a bank
 *     tags: [Admin]
 */
router.post("/admin/set-failure-rate", adminController.setFailureRate);

/**
 * @openapi
 * /api/admin/reset-chaos:
 *   post:
 *     summary: Reset all banks to normal operating conditions
 *     tags: [Admin]
 */
router.post("/admin/reset-chaos", adminController.resetChaos);

module.exports = router;
