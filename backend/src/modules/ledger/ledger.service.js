/**
 * Ledger Service — Append-only, immutable double-entry bookkeeping
 *
 * Every balance change MUST produce a ledger entry.
 * Ledger can be used to reconstruct balances from scratch.
 */

const prisma = require("../../config/database");
const logger = require("../../config/logger");

/**
 * Record a debit ledger entry.
 */
async function recordDebit({ transactionId, accountId, amount, balanceBefore, balanceAfter, description, tx }) {
  const db = tx || prisma;
  const entry = await db.ledgerEntry.create({
    data: {
      transactionId,
      accountId,
      type: "DEBIT",
      amount,
      balanceBefore,
      balanceAfter,
      description: description || `Debit ₹${amount}`,
    },
  });
  logger.debug(`[LEDGER] DEBIT entry ${entry.id} | account ${accountId} | ₹${amount}`);
  return entry;
}

/**
 * Record a credit ledger entry.
 */
async function recordCredit({ transactionId, accountId, amount, balanceBefore, balanceAfter, description, tx }) {
  const db = tx || prisma;
  const entry = await db.ledgerEntry.create({
    data: {
      transactionId,
      accountId,
      type: "CREDIT",
      amount,
      balanceBefore,
      balanceAfter,
      description: description || `Credit ₹${amount}`,
    },
  });
  logger.debug(`[LEDGER] CREDIT entry ${entry.id} | account ${accountId} | ₹${amount}`);
  return entry;
}

/**
 * Get ledger entries for a transaction (ordered chronologically).
 */
async function getByTransaction(transactionId) {
  return prisma.ledgerEntry.findMany({
    where: { transactionId },
    include: {
      account: {
        select: {
          accountNumber: true,
          user: { select: { name: true, upiId: true } },
          bank: { select: { name: true, code: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get ledger history for an account.
 */
async function getByAccount(accountId, { limit = 50, offset = 0 } = {}) {
  return prisma.ledgerEntry.findMany({
    where: { accountId },
    include: {
      transaction: {
        select: { id: true, amount: true, status: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

/**
 * Recompute account balance from ledger (audit utility).
 * Useful to verify the balance column matches ledger history.
 */
async function recomputeBalance(accountId) {
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
  });

  let balance = 0;
  for (const entry of entries) {
    if (entry.type === "CREDIT") balance += entry.amount;
    else balance -= entry.amount;
    balance = parseFloat(balance.toFixed(2));
  }
  return balance;
}

module.exports = { recordDebit, recordCredit, getByTransaction, getByAccount, recomputeBalance };
