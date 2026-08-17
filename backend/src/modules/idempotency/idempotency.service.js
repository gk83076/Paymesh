/**
 * Idempotency Service
 *
 * Prevents duplicate transaction execution.
 * If an idempotency key has been used, return the stored response.
 *
 * Pattern:
 *   1. Before processing: checkKey(key) — returns null or cached response
 *   2. After processing: storeKey(key, transactionId, response)
 */

const prisma = require("../../config/database");
const logger = require("../../config/logger");

/**
 * Check if an idempotency key already exists.
 * @returns {object|null} stored response snapshot, or null
 */
async function checkKey(key) {
  const record = await prisma.idempotencyKey.findUnique({
    where: { key },
    include: {
      transaction: {
        select: { id: true, status: true, amount: true, createdAt: true },
      },
    },
  });

  if (record) {
    logger.info(`[IDEMPOTENCY] Cache hit for key: ${key}`);
    return record;
  }

  return null;
}

/**
 * Store an idempotency key with the response snapshot.
 */
async function storeKey({ key, transactionId, responseSnapshot }) {
  const record = await prisma.idempotencyKey.create({
    data: {
      key,
      transactionId,
      responseSnapshot,
    },
  });
  logger.info(`[IDEMPOTENCY] Stored key: ${key} → txn ${transactionId}`);
  return record;
}

/**
 * Delete a key (used when transaction fails before completion).
 */
async function deleteKey(key) {
  try {
    await prisma.idempotencyKey.delete({ where: { key } });
  } catch {
    // Key may not exist yet — ignore
  }
}

module.exports = { checkKey, storeKey, deleteKey };
