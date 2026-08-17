/**
 * BullMQ Credit Retry Processor
 *
 * Consumes jobs from the "credit-retry" queue.
 * Each job carries: { transactionId, attempt, retryJobId }
 */

const { Worker } = require("bullmq");
const { getRedisClient } = require("../config/redis");
const switchService = require("../modules/switch/switch.service");
const retryService = require("../modules/retry/retry.service");
const recoveryService = require("../modules/recovery/recovery.service");
const logger = require("../config/logger");
const config = require("../config");

let worker = null;

function startWorker() {
  if (worker) return worker;

  const connection = getRedisClient();

  worker = new Worker(
    retryService.QUEUE_NAME,
    async (job) => {
      const { transactionId, attempt, retryJobId } = job.data;

      logger.info(`[WORKER] Processing retry job | txn: ${transactionId} | attempt: ${attempt}`);

      try {
        await retryService.updateRetryJob(retryJobId, { status: "PROCESSING" });

        const result = await switchService.processRetry({ transactionId, attempt, retryJobId });

        await retryService.updateRetryJob(retryJobId, { status: "SUCCEEDED" });

        logger.info(`[WORKER] Retry ${attempt} SUCCEEDED for ${transactionId}`);
        return result;
      } catch (err) {
        logger.error(`[WORKER] Retry ${attempt} FAILED for ${transactionId}:`, err);

        await retryService.updateRetryJob(retryJobId, {
          status: "FAILED",
          errorMessage: err.message,
        });

        // If final attempt failed, trigger rollback
        if (attempt >= config.retry.maxAttempts) {
          logger.warn(`[WORKER] All retries exhausted for ${transactionId}. Triggering rollback.`);
          await recoveryService.executeRollback(transactionId).catch((rbErr) => {
            logger.error(`[WORKER] Rollback also failed for ${transactionId}:`, rbErr);
          });
        } else {
          // Schedule next retry
          await retryService.scheduleRetry(transactionId, attempt + 1);
        }

        throw err; // Let BullMQ mark job as failed
      }
    },
    {
      connection,
      concurrency: 5,
      settings: {
        backoffStrategy: (attemptMade) => {
          const delays = config.retry.backoffDelays;
          return delays[Math.min(attemptMade - 1, delays.length - 1)];
        },
      },
    }
  );

  worker.on("completed", (job) => {
    logger.info(`[WORKER] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[WORKER] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on("error", (err) => {
    logger.error("[WORKER] Worker error:", err);
  });

  logger.info(`[WORKER] Credit retry worker started (concurrency: 5)`);
  return worker;
}

async function stopWorker() {
  if (worker) {
    await worker.close();
    worker = null;
    logger.info("[WORKER] Credit retry worker stopped");
  }
}

module.exports = { startWorker, stopWorker };
