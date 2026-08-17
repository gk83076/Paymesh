/**
 * Retry Service — BullMQ-based exponential backoff retry orchestration
 *
 * When a credit operation fails, a retry job is queued with exponential delay.
 * Max 5 attempts: 1s → 2s → 4s → 8s → 16s
 *
 * After all retries are exhausted, the rollback engine takes over.
 */

const { Queue } = require("bullmq");
const { getRedisClient } = require("../../config/redis");
const prisma = require("../../config/database");
const config = require("../../config");
const logger = require("../../config/logger");

const QUEUE_NAME = "credit-retry";

let queue = null;

function getQueue() {
  if (queue) return queue;
  const connection = getRedisClient();
  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 200,
    },
  });
  return queue;
}

/**
 * Schedule a credit retry job with exponential backoff.
 * @param {string} transactionId
 * @param {number} attempt - current attempt number (1-based)
 */
async function scheduleRetry(transactionId, attempt) {
  if (attempt > config.retry.maxAttempts) {
    logger.warn(`[RETRY] Max attempts (${config.retry.maxAttempts}) reached for ${transactionId}. Triggering rollback.`);
    return null;
  }

  const delayMs = config.retry.backoffDelays[attempt - 1] || 16000;
  const scheduledAt = new Date(Date.now() + delayMs);

  // Record retry job in DB
  const retryJob = await prisma.retryJob.create({
    data: {
      transactionId,
      attempt,
      status: "PENDING",
      scheduledAt,
    },
  });

  // Enqueue BullMQ job
  const q = getQueue();
  const bullJob = await q.add(
    "retry-credit",
    { transactionId, attempt, retryJobId: retryJob.id },
    { delay: delayMs, jobId: `txn-${transactionId}-attempt-${attempt}` }
  );

  // Update with BullMQ job id
  await prisma.retryJob.update({
    where: { id: retryJob.id },
    data: { jobId: bullJob.id },
  });

  logger.info(`[RETRY] Queued attempt ${attempt} for ${transactionId} | delay: ${delayMs}ms`);
  return retryJob;
}

/**
 * Mark a retry job as succeeded or failed.
 */
async function updateRetryJob(retryJobId, { status, errorMessage }) {
  return prisma.retryJob.update({
    where: { id: retryJobId },
    data: {
      status,
      executedAt: new Date(),
      errorMessage: errorMessage || null,
    },
  });
}

/**
 * Get all retry jobs for a transaction.
 */
async function getRetryHistory(transactionId) {
  return prisma.retryJob.findMany({
    where: { transactionId },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Get queue statistics.
 */
async function getQueueStats() {
  const q = getQueue();
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    q.getWaitingCount(),
    q.getActiveCount(),
    q.getCompletedCount(),
    q.getFailedCount(),
    q.getDelayedCount(),
  ]);
  return { waiting, active, completed, failed, delayed };
}

module.exports = {
  scheduleRetry,
  updateRetryJob,
  getRetryHistory,
  getQueueStats,
  QUEUE_NAME,
};
