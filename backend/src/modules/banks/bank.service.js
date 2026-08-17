/**
 * Bank Service — simulates independent virtual bank behaviour
 *
 * Supports:
 *   - Random failure injection (configurable rate per bank)
 *   - Random latency (configurable per bank)
 *   - Simulated downtime (isCrashed flag)
 */

const prisma = require("../../config/database");
const logger = require("../../config/logger");
const { AppError } = require("../../utils/errors");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getBank(bankCode) {
  const bank = await prisma.bank.findUnique({ where: { code: bankCode } });
  if (!bank) throw new AppError(`Bank ${bankCode} not found`, 404);
  return bank;
}

/**
 * Applies chaos: throws if bank is crashed, adds jitter latency,
 * randomly fails based on failureRate.
 */
async function applyChaos(bank) {
  if (bank.isCrashed) {
    throw new AppError(`Bank ${bank.code} is currently offline (simulated crash)`, 503);
  }

  // Add configured delay + up to 20% jitter
  if (bank.delayMs > 0) {
    const jitter = Math.floor(bank.delayMs * 0.2 * Math.random());
    await sleep(bank.delayMs + jitter);
  }

  // Random failure
  if (Math.random() < bank.failureRate) {
    throw new AppError(
      `Bank ${bank.code} returned a transient error (simulated failure)`,
      502
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Debit an account in the given bank.
 * Uses a Prisma transaction to ensure atomicity.
 * @returns {{ newBalance: number, ledgerMeta: object }}
 */
async function debit({ accountId, amount, bankCode }) {
  const bank = await getBank(bankCode);
  await applyChaos(bank);

  return await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { id: true, balance: true, bankId: true },
    });

    if (!account) throw new AppError(`Account ${accountId} not found`, 404);
    if (account.bankId !== bank.id)
      throw new AppError("Account does not belong to this bank", 400);
    if (account.balance < amount)
      throw new AppError(
        `Insufficient funds: balance ₹${account.balance}, requested ₹${amount}`,
        402
      );

    const balanceBefore = account.balance;
    const balanceAfter = parseFloat((balanceBefore - amount).toFixed(2));

    await tx.account.update({
      where: { id: accountId },
      data: { balance: balanceAfter },
    });

    logger.info(`[BANK ${bankCode}] Debit ₹${amount} from ${accountId} | ${balanceBefore} → ${balanceAfter}`);

    return { newBalance: balanceAfter, balanceBefore, balanceAfter };
  });
}

/**
 * Credit an account in the given bank.
 */
async function credit({ accountId, amount, bankCode }) {
  const bank = await getBank(bankCode);
  await applyChaos(bank);

  return await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { id: true, balance: true, bankId: true },
    });

    if (!account) throw new AppError(`Account ${accountId} not found`, 404);
    if (account.bankId !== bank.id)
      throw new AppError("Account does not belong to this bank", 400);

    const balanceBefore = account.balance;
    const balanceAfter = parseFloat((balanceBefore + amount).toFixed(2));

    await tx.account.update({
      where: { id: accountId },
      data: { balance: balanceAfter },
    });

    logger.info(`[BANK ${bankCode}] Credit ₹${amount} to ${accountId} | ${balanceBefore} → ${balanceAfter}`);

    return { newBalance: balanceAfter, balanceBefore, balanceAfter };
  });
}

/**
 * Get balance for an account.
 */
async function getBalance(accountId) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      accountNumber: true,
      balance: true,
      bank: { select: { name: true, code: true, isCrashed: true } },
      user: { select: { name: true, upiId: true } },
    },
  });

  if (!account) throw new AppError(`Account ${accountId} not found`, 404);
  return account;
}

/**
 * List all accounts for a bank.
 */
async function getAccountsByBank(bankCode) {
  return prisma.account.findMany({
    where: { bank: { code: bankCode } },
    include: {
      user: { select: { name: true, upiId: true, email: true } },
      bank: { select: { name: true, code: true } },
    },
    orderBy: { balance: "desc" },
  });
}

module.exports = { debit, credit, getBalance, getAccountsByBank };
