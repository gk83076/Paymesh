/**
 * Recovery (Rollback) Service
 *
 * Handles compensation when debit succeeds but credit ultimately fails
 * after all retries are exhausted.
 *
 * Flow:
 *   ROLLBACK_INITIATED
 *     → credit sender back (reverse debit)
 *     → write reversal ledger entry
 *     → ROLLED_BACK
 *
 * An audit log is created for every rollback.
 */

const prisma = require("../../config/database");
const bankService = require("../banks/bank.service");
const stateMachine = require("../transactions/stateMachine");
const ledgerService = require("../ledger/ledger.service");
const auditService = require("../../utils/audit");
const logger = require("../../config/logger");
const { AppError } = require("../../utils/errors");

/**
 * Execute rollback for a transaction where debit succeeded but credit failed.
 * @param {string} transactionId
 */
async function executeRollback(transactionId) {
  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      senderAccount: { include: { bank: true } },
      receiverAccount: { include: { bank: true } },
    },
  });

  if (!transaction) throw new AppError(`Transaction ${transactionId} not found`, 404);

  const allowedStates = ["CREDIT_PENDING", "RECOVERY_PENDING", "ROLLBACK_INITIATED"];
  if (!allowedStates.includes(transaction.status)) {
    throw new AppError(
      `Cannot rollback transaction in state ${transaction.status}`,
      422
    );
  }

  logger.info(`[ROLLBACK] Initiating rollback for ${transactionId}`);

  // Transition to ROLLBACK_INITIATED
  if (transaction.status !== "ROLLBACK_INITIATED") {
    await stateMachine.transition({
      transactionId,
      toState: "ROLLBACK_INITIATED",
      reason: "Credit failed after all retries. Initiating refund to sender.",
    });
  }

  try {
    // Credit sender back (reverse the original debit)
    const senderAccount = transaction.senderAccount;
    const refundResult = await bankService.credit({
      accountId: senderAccount.id,
      amount: transaction.amount,
      bankCode: senderAccount.bank.code,
    });

    // Write reversal ledger entry
    await ledgerService.recordCredit({
      transactionId,
      accountId: senderAccount.id,
      amount: transaction.amount,
      balanceBefore: refundResult.balanceBefore,
      balanceAfter: refundResult.balanceAfter,
      description: `Refund for failed transaction ${transactionId}`,
    });

    // Transition to ROLLED_BACK
    await stateMachine.transition({
      transactionId,
      toState: "ROLLED_BACK",
      reason: "Refund credited to sender successfully.",
      metadata: {
        refundAmount: transaction.amount,
        senderNewBalance: refundResult.newBalance,
      },
    });

    // Audit log
    await auditService.log({
      entity: "Transaction",
      entityId: transactionId,
      action: "ROLLBACK_COMPLETED",
      metadata: {
        refundAmount: transaction.amount,
        senderAccountId: senderAccount.id,
      },
    });

    logger.info(`[ROLLBACK] ✅ Rollback completed for ${transactionId} | Refund: ₹${transaction.amount}`);

    return { success: true, refundAmount: transaction.amount };
  } catch (err) {
    logger.error(`[ROLLBACK] ❌ Rollback failed for ${transactionId}:`, err);

    // If refund itself fails, mark as FAILED (requires manual intervention)
    await stateMachine.transition({
      transactionId,
      toState: "FAILED",
      reason: `Rollback failed: ${err.message}. Manual intervention required.`,
    });

    await auditService.log({
      entity: "Transaction",
      entityId: transactionId,
      action: "ROLLBACK_INITIATED",
      metadata: { error: err.message, requiresManualIntervention: true },
    });

    throw err;
  }
}

module.exports = { executeRollback };
