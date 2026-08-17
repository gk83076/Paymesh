/**
 * UPI Switch Service — Core Transfer Orchestration
 *
 * This is the heart of PayMesh. It orchestrates:
 *   1. Idempotency check
 *   2. Fraud pre-evaluation
 *   3. Balance validation
 *   4. Transaction creation
 *   5. State machine transitions
 *   6. Bank debit
 *   7. Ledger entry (debit)
 *   8. Bank credit (with retry on failure)
 *   9. Ledger entry (credit)
 *  10. Final state → SUCCESS
 *  11. Rollback if credit ultimately fails
 *
 * Every step is audited. The state machine enforces valid transitions.
 * The ledger records every balance change immutably.
 */

const { v4: uuidv4 } = require("uuid");

const prisma = require("../../config/database");
const config = require("../../config");
const logger = require("../../config/logger");

const bankService = require("../banks/bank.service");
const stateMachine = require("../transactions/stateMachine");
const ledgerService = require("../ledger/ledger.service");
const idempotencyService = require("../idempotency/idempotency.service");
const fraudService = require("../fraud/fraud.service");
const retryService = require("../retry/retry.service");
const recoveryService = require("../recovery/recovery.service");
const auditService = require("../../utils/audit");
const { AppError } = require("../../utils/errors");

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TRANSFER FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute a UPI transfer.
 *
 * @param {object} params
 * @param {string} params.senderId      - User ID of sender
 * @param {string} params.receiverId    - User ID of receiver
 * @param {number} params.amount        - Transfer amount in INR
 * @param {string} params.idempotencyKey - Unique client-provided key
 *
 * @returns {object} Transfer result with transaction details
 */
async function transfer({ senderId, receiverId, amount, idempotencyKey }) {
  const startTime = Date.now();

  logger.info(
    `[SWITCH] Transfer initiated | sender: ${senderId} → receiver: ${receiverId} | ₹${amount} | key: ${idempotencyKey}`
  );

  // ── Step 1: Idempotency Check ─────────────────────────────────────────────
  const existingKey = await idempotencyService.checkKey(idempotencyKey);
  if (existingKey) {
    logger.info(`[SWITCH] Idempotency hit for key ${idempotencyKey}`);
    await auditService.log({
      entity: "Transaction",
      entityId: existingKey.transactionId,
      action: "IDEMPOTENCY_HIT",
      metadata: { key: idempotencyKey },
    });
    return {
      ...existingKey.responseSnapshot,
      _idempotencyHit: true,
      _cached: true,
    };
  }

  // ── Step 2: Validate Sender and Receiver ──────────────────────────────────
  const [sender, receiver] = await Promise.all([
    prisma.user.findUnique({
      where: { id: senderId },
      include: { accounts: { include: { bank: true } } },
    }),
    prisma.user.findUnique({
      where: { id: receiverId },
      include: { accounts: { include: { bank: true } } },
    }),
  ]);

  if (!sender) throw new AppError(`Sender ${senderId} not found`, 404);
  if (!receiver) throw new AppError(`Receiver ${receiverId} not found`, 404);
  if (senderId === receiverId) throw new AppError("Sender and receiver cannot be the same", 400);

  const senderAccount = sender.accounts[0];
  const receiverAccount = receiver.accounts[0];

  if (!senderAccount) throw new AppError(`Sender has no account`, 404);
  if (!receiverAccount) throw new AppError(`Receiver has no account`, 404);

  // ── Step 3: Balance Check ────────────────────────────────────────────────
  if (senderAccount.balance < amount) {
    throw new AppError(
      `Insufficient balance. Available: ₹${senderAccount.balance}, Requested: ₹${amount}`,
      402
    );
  }

  if (amount <= 0) throw new AppError("Amount must be positive", 400);

  // ── Step 4: Fraud Pre-Check ───────────────────────────────────────────────
  const { fraudScore, riskLevel, triggeredRules } = await fraudService.evaluate({
    senderId,
    receiverId,
    amount,
  });

  // Reject HIGH_RISK immediately
  if (riskLevel === "HIGH_RISK") {
    logger.warn(`[SWITCH] HIGH_RISK transaction blocked | sender: ${senderId} | score: ${fraudScore}`);
  }

  // ── Step 5: Create Transaction (INITIATED) ────────────────────────────────
  const transaction = await prisma.transaction.create({
    data: {
      idempotencyKey,
      amount,
      status: "INITIATED",
      fraudScore,
      riskLevel,
      senderId,
      receiverId,
      senderAccountId: senderAccount.id,
      receiverAccountId: receiverAccount.id,
      metadata: {
        senderUpiId: sender.upiId,
        receiverUpiId: receiver.upiId,
        senderBank: senderAccount.bank.code,
        receiverBank: receiverAccount.bank.code,
      },
    },
  });

  // Write initial state history
  await prisma.transactionStateHistory.create({
    data: {
      transactionId: transaction.id,
      fromState: null,
      toState: "INITIATED",
      reason: "Transaction created",
      metadata: { fraudScore, riskLevel, triggeredRules },
    },
  });

  // Save fraud report if flagged
  if (triggeredRules.length > 0) {
    await fraudService.saveFraudReport({
      transactionId: transaction.id,
      userId: senderId,
      fraudScore,
      riskLevel,
      triggeredRules,
    });

    await auditService.log({
      entity: "Transaction",
      entityId: transaction.id,
      action: "FRAUD_FLAGGED",
      metadata: { fraudScore, riskLevel, triggeredRules },
    });
  }

  await auditService.log({
    entity: "Transaction",
    entityId: transaction.id,
    action: "TRANSACTION_CREATED",
    metadata: { senderId, receiverId, amount },
  });

  // Block if HIGH_RISK
  if (riskLevel === "HIGH_RISK") {
    await stateMachine.transition({
      transactionId: transaction.id,
      toState: "FAILED",
      reason: `Transaction blocked: HIGH_RISK (score: ${fraudScore})`,
    });

    const response = buildResponse(transaction, "FAILED", {
      error: "Transaction blocked due to high fraud risk",
      fraudScore,
      riskLevel,
      triggeredRules,
      latencyMs: Date.now() - startTime,
    });

    await idempotencyService.storeKey({
      key: idempotencyKey,
      transactionId: transaction.id,
      responseSnapshot: response,
    });

    return response;
  }

  // ── Step 6: Debit Sender ──────────────────────────────────────────────────
  await stateMachine.transition({
    transactionId: transaction.id,
    toState: "DEBIT_PENDING",
    reason: "Initiating debit from sender",
  });

  let debitResult;
  try {
    debitResult = await bankService.debit({
      accountId: senderAccount.id,
      amount,
      bankCode: senderAccount.bank.code,
    });
  } catch (err) {
    logger.error(`[SWITCH] Debit failed for ${transaction.id}:`, err);

    await stateMachine.transition({
      transactionId: transaction.id,
      toState: "FAILED",
      reason: `Debit failed: ${err.message}`,
      metadata: { error: err.message },
    });

    const response = buildResponse(transaction, "FAILED", {
      error: err.message,
      latencyMs: Date.now() - startTime,
    });

    await idempotencyService.storeKey({
      key: idempotencyKey,
      transactionId: transaction.id,
      responseSnapshot: response,
    });

    return response;
  }

  // Record debit ledger entry
  await ledgerService.recordDebit({
    transactionId: transaction.id,
    accountId: senderAccount.id,
    amount,
    balanceBefore: debitResult.balanceBefore,
    balanceAfter: debitResult.balanceAfter,
    description: `UPI transfer to ${receiver.upiId}`,
  });

  await stateMachine.transition({
    transactionId: transaction.id,
    toState: "DEBIT_SUCCESS",
    reason: "Debit from sender successful",
    metadata: { newBalance: debitResult.newBalance },
  });

  // ── Step 7: Credit Receiver ───────────────────────────────────────────────
  await stateMachine.transition({
    transactionId: transaction.id,
    toState: "CREDIT_PENDING",
    reason: "Initiating credit to receiver",
  });

  const creditResult = await attemptCredit({
    transaction,
    receiverAccount,
    receiver,
    amount,
    attempt: 1,
    startTime,
    idempotencyKey,
    fraudScore,
    riskLevel,
    triggeredRules,
  });

  return creditResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// CREDIT ATTEMPT (called by switch and retry processor)
// ─────────────────────────────────────────────────────────────────────────────

async function attemptCredit({ transaction, receiverAccount, receiver, amount, attempt, startTime, idempotencyKey, fraudScore, riskLevel, triggeredRules }) {
  try {
    const creditResult = await bankService.credit({
      accountId: receiverAccount.id,
      amount,
      bankCode: receiverAccount.bank.code,
    });

    // Record credit ledger entry
    await ledgerService.recordCredit({
      transactionId: transaction.id,
      accountId: receiverAccount.id,
      amount,
      balanceBefore: creditResult.balanceBefore,
      balanceAfter: creditResult.balanceAfter,
      description: `UPI received from sender`,
    });

    await stateMachine.transition({
      transactionId: transaction.id,
      toState: "CREDIT_SUCCESS",
      reason: "Credit to receiver successful",
      metadata: { newBalance: creditResult.newBalance, attempt },
    });

    await stateMachine.transition({
      transactionId: transaction.id,
      toState: "SUCCESS",
      reason: "Transfer completed successfully",
      metadata: { latencyMs: Date.now() - startTime },
    });

    // Update retry count
    if (attempt > 1) {
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: { retryCount: attempt - 1 },
      });
    }

    const response = buildResponse(transaction, "SUCCESS", {
      amount,
      senderNewBalance: null, // not re-fetched here
      receiverNewBalance: creditResult.newBalance,
      fraudScore,
      riskLevel,
      triggeredRules,
      latencyMs: Date.now() - startTime,
    });

    if (idempotencyKey) {
      await idempotencyService.storeKey({
        key: idempotencyKey,
        transactionId: transaction.id,
        responseSnapshot: response,
      });
    }

    logger.info(`[SWITCH] ✅ Transfer SUCCESS ${transaction.id} | ₹${amount} | ${Date.now() - startTime}ms`);
    return response;
  } catch (creditErr) {
    logger.error(`[SWITCH] Credit attempt ${attempt} failed for ${transaction.id}:`, creditErr);

    if (attempt < config.retry.maxAttempts) {
      // Queue retry
      await stateMachine.transition({
        transactionId: transaction.id,
        toState: "RECOVERY_PENDING",
        reason: `Credit failed (attempt ${attempt}). Scheduling retry.`,
        metadata: { error: creditErr.message, attempt },
      });

      await retryService.scheduleRetry(transaction.id, attempt + 1);

      await auditService.log({
        entity: "Transaction",
        entityId: transaction.id,
        action: "RETRY_QUEUED",
        metadata: { attempt: attempt + 1, error: creditErr.message },
      });

      return buildResponse(transaction, "RECOVERY_PENDING", {
        message: "Credit failed. Retry scheduled.",
        attempt,
        nextAttempt: attempt + 1,
        latencyMs: Date.now() - startTime,
      });
    } else {
      // All retries exhausted — rollback
      logger.warn(`[SWITCH] All retries exhausted for ${transaction.id}. Initiating rollback.`);

      await recoveryService.executeRollback(transaction.id);

      const response = buildResponse(transaction, "ROLLED_BACK", {
        error: "Credit failed after all retries. Amount refunded to sender.",
        latencyMs: Date.now() - startTime,
      });

      if (idempotencyKey) {
        await idempotencyService.storeKey({
          key: idempotencyKey,
          transactionId: transaction.id,
          responseSnapshot: response,
        });
      }

      return response;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RETRY HANDLER (called by BullMQ processor)
// ─────────────────────────────────────────────────────────────────────────────

async function processRetry({ transactionId, attempt, retryJobId }) {
  logger.info(`[SWITCH] Processing retry ${attempt} for ${transactionId}`);

  const transaction = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      receiverAccount: { include: { bank: true } },
      receiver: true,
    },
  });

  if (!transaction) throw new AppError(`Transaction ${transactionId} not found`, 404);

  // Only retry if in RECOVERY_PENDING
  if (!["RECOVERY_PENDING", "CREDIT_PENDING"].includes(transaction.status)) {
    logger.warn(`[SWITCH] Skip retry — transaction ${transactionId} is in state ${transaction.status}`);
    return;
  }

  // Transition back to CREDIT_PENDING
  await stateMachine.transition({
    transactionId,
    toState: "CREDIT_PENDING",
    reason: `Retry attempt ${attempt}`,
  });

  return attemptCredit({
    transaction,
    receiverAccount: transaction.receiverAccount,
    receiver: transaction.receiver,
    amount: transaction.amount,
    attempt,
    startTime: Date.now(),
    idempotencyKey: null, // idempotency key already stored or will be updated
    fraudScore: transaction.fraudScore,
    riskLevel: transaction.riskLevel,
    triggeredRules: [],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function buildResponse(transaction, status, extra = {}) {
  return {
    success: status === "SUCCESS",
    transactionId: transaction.id,
    status,
    amount: transaction.amount,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION QUERIES
// ─────────────────────────────────────────────────────────────────────────────

async function getTransaction(transactionId) {
  return prisma.transaction.findUnique({
    where: { id: transactionId },
    include: {
      sender: { select: { name: true, upiId: true } },
      receiver: { select: { name: true, upiId: true } },
      senderAccount: { include: { bank: { select: { name: true, code: true } } } },
      receiverAccount: { include: { bank: { select: { name: true, code: true } } } },
      stateHistory: { orderBy: { createdAt: "asc" } },
      ledgerEntries: { orderBy: { createdAt: "asc" } },
      retryJobs: { orderBy: { createdAt: "asc" } },
      fraudReports: true,
    },
  });
}

async function listTransactions({ page = 1, limit = 20, status, riskLevel, dateFrom, dateTo } = {}) {
  const where = {};
  if (status) where.status = status;
  if (riskLevel) where.riskLevel = riskLevel;
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo) where.createdAt.lte = new Date(dateTo);
  }

  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      include: {
        sender: { select: { name: true, upiId: true } },
        receiver: { select: { name: true, upiId: true } },
        senderAccount: { include: { bank: { select: { name: true, code: true } } } },
        receiverAccount: { include: { bank: { select: { name: true, code: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.transaction.count({ where }),
  ]);

  return { transactions, total, page, limit, totalPages: Math.ceil(total / limit) };
}

module.exports = { transfer, processRetry, getTransaction, listTransactions, attemptCredit };
