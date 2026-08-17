/**
 * Transaction State Machine
 *
 * Enforces valid state transitions and records immutable history.
 * This is the core reliability primitive of PayMesh.
 *
 * Valid transitions:
 *   INITIATED          → DEBIT_PENDING
 *   DEBIT_PENDING      → DEBIT_SUCCESS | FAILED
 *   DEBIT_SUCCESS      → CREDIT_PENDING
 *   CREDIT_PENDING     → CREDIT_SUCCESS | RECOVERY_PENDING | ROLLBACK_INITIATED
 *   CREDIT_SUCCESS     → SUCCESS
 *   RECOVERY_PENDING   → CREDIT_PENDING | ROLLBACK_INITIATED
 *   ROLLBACK_INITIATED → ROLLED_BACK | FAILED
 *   ROLLED_BACK        → (terminal)
 *   SUCCESS            → (terminal)
 *   FAILED             → (terminal)
 */

const prisma = require("../../config/database");
const logger = require("../../config/logger");
const { AppError } = require("../../utils/errors");

const TRANSITIONS = {
  INITIATED: ["DEBIT_PENDING"],
  DEBIT_PENDING: ["DEBIT_SUCCESS", "FAILED"],
  DEBIT_SUCCESS: ["CREDIT_PENDING"],
  CREDIT_PENDING: ["CREDIT_SUCCESS", "RECOVERY_PENDING", "ROLLBACK_INITIATED"],
  CREDIT_SUCCESS: ["SUCCESS"],
  RECOVERY_PENDING: ["CREDIT_PENDING", "ROLLBACK_INITIATED"],
  ROLLBACK_INITIATED: ["ROLLED_BACK", "FAILED"],
  // Terminal states — no outgoing transitions
  SUCCESS: [],
  FAILED: [],
  ROLLED_BACK: [],
};

/**
 * Transition a transaction to a new state.
 * Validates the transition, updates the Transaction record,
 * and writes an immutable TransactionStateHistory entry.
 *
 * @param {object} params
 * @param {string} params.transactionId
 * @param {string} params.toState
 * @param {string} [params.reason]
 * @param {object} [params.metadata]
 * @param {object} [params.tx] - optional Prisma transaction context
 */
async function transition({ transactionId, toState, reason, metadata, tx }) {
  const db = tx || prisma;

  const transaction = await db.transaction.findUnique({
    where: { id: transactionId },
    select: { id: true, status: true },
  });

  if (!transaction) {
    throw new AppError(`Transaction ${transactionId} not found`, 404);
  }

  const fromState = transaction.status;

  const allowed = TRANSITIONS[fromState];
  if (!allowed) {
    throw new AppError(`Unknown state: ${fromState}`, 500);
  }

  if (!allowed.includes(toState)) {
    throw new AppError(
      `Invalid state transition: ${fromState} → ${toState}. Allowed: [${allowed.join(", ")}]`,
      422
    );
  }

  const updateData = {
    status: toState,
    ...(["SUCCESS", "FAILED", "ROLLED_BACK"].includes(toState)
      ? { completedAt: new Date() }
      : {}),
  };

  // Write state history and update transaction atomically
  const [updatedTx] = await Promise.all([
    db.transaction.update({
      where: { id: transactionId },
      data: updateData,
    }),
    db.transactionStateHistory.create({
      data: {
        transactionId,
        fromState,
        toState,
        reason: reason || null,
        metadata: metadata || null,
      },
    }),
  ]);

  logger.info(
    `[STATE] ${transactionId} | ${fromState} → ${toState}${reason ? ` | ${reason}` : ""}`
  );

  return updatedTx;
}

/**
 * Get full state history for a transaction.
 */
async function getHistory(transactionId) {
  return prisma.transactionStateHistory.findMany({
    where: { transactionId },
    orderBy: { createdAt: "asc" },
  });
}

module.exports = { transition, getHistory, TRANSITIONS };
