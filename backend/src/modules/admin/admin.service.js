/**
 * Admin / Chaos Engineering Service
 *
 * Provides endpoints to simulate bank failures, delays, and outages.
 * Used to demonstrate system resilience through the Chaos Control Panel.
 */

const prisma = require("../../config/database");
const auditService = require("../../utils/audit");
const logger = require("../../config/logger");
const { AppError } = require("../../utils/errors");

async function getBank(code) {
  const bank = await prisma.bank.findUnique({ where: { code } });
  if (!bank) throw new AppError(`Bank ${code} not found`, 404);
  return bank;
}

/**
 * Crash a specific bank (isCrashed = true).
 * All subsequent operations to this bank will fail immediately.
 */
async function crashBank(bankCode) {
  const bank = await getBank(bankCode);
  const updated = await prisma.bank.update({
    where: { code: bankCode },
    data: { isCrashed: true },
  });

  await auditService.log({
    entity: "Bank",
    entityId: bank.id,
    action: "BANK_CRASHED",
    metadata: { bankCode },
  });

  logger.warn(`[CHAOS] Bank ${bankCode} CRASHED`);
  return { message: `Bank ${bankCode} is now offline`, bank: updated };
}

/**
 * Recover a specific bank (isCrashed = false).
 */
async function recoverBank(bankCode) {
  const bank = await getBank(bankCode);
  const updated = await prisma.bank.update({
    where: { code: bankCode },
    data: { isCrashed: false },
  });

  await auditService.log({
    entity: "Bank",
    entityId: bank.id,
    action: "BANK_RECOVERED",
    metadata: { bankCode },
  });

  logger.info(`[CHAOS] Bank ${bankCode} RECOVERED`);
  return { message: `Bank ${bankCode} is back online`, bank: updated };
}

/**
 * Add artificial latency to a bank.
 */
async function addDelay(bankCode, delayMs) {
  if (delayMs < 0 || delayMs > 30000) {
    throw new AppError("Delay must be between 0 and 30000ms", 400);
  }

  const bank = await getBank(bankCode);
  const updated = await prisma.bank.update({
    where: { code: bankCode },
    data: { delayMs },
  });

  await auditService.log({
    entity: "Bank",
    entityId: bank.id,
    action: "CHAOS_DELAY_ADDED",
    metadata: { bankCode, delayMs },
  });

  logger.info(`[CHAOS] Bank ${bankCode} delay set to ${delayMs}ms`);
  return { message: `Bank ${bankCode} delay set to ${delayMs}ms`, bank: updated };
}

/**
 * Set failure rate for a bank (0.0 - 1.0).
 */
async function setFailureRate(bankCode, failureRate) {
  if (failureRate < 0 || failureRate > 1) {
    throw new AppError("Failure rate must be between 0.0 and 1.0", 400);
  }

  const bank = await getBank(bankCode);
  const updated = await prisma.bank.update({
    where: { code: bankCode },
    data: { failureRate },
  });

  logger.info(`[CHAOS] Bank ${bankCode} failure rate set to ${failureRate}`);
  return { message: `Bank ${bankCode} failure rate set to ${failureRate}`, bank: updated };
}

/**
 * Reset all banks to default state.
 */
async function resetChaos() {
  await prisma.bank.updateMany({
    data: {
      isCrashed: false,
      delayMs: 0,
      failureRate: 0.05,
    },
  });

  await auditService.log({
    entity: "Bank",
    entityId: "all",
    action: "CHAOS_RESET",
    metadata: {},
  });

  logger.info("[CHAOS] All banks reset to normal");
  return { message: "All banks reset to normal operating conditions" };
}

/**
 * Get current status of all banks.
 */
async function getBankStatus() {
  return prisma.bank.findMany({
    select: {
      id: true,
      name: true,
      code: true,
      isCrashed: true,
      delayMs: true,
      failureRate: true,
      updatedAt: true,
    },
    orderBy: { code: "asc" },
  });
}

module.exports = { crashBank, recoverBank, addDelay, setFailureRate, resetChaos, getBankStatus };
