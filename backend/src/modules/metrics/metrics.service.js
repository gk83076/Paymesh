/**
 * Metrics Service
 *
 * Aggregates real-time and historical metrics for the monitoring dashboard.
 */

const prisma = require("../../config/database");
const retryService = require("../retry/retry.service");

// In-memory TPS tracking (last 60 seconds)
const tpsWindow = [];
let totalLatencyMs = 0;
let totalLatencyCount = 0;

function recordLatency(ms) {
  totalLatencyMs += ms;
  totalLatencyCount++;
}

function recordTransaction() {
  tpsWindow.push(Date.now());
  // Keep only last 60 seconds
  const cutoff = Date.now() - 60000;
  while (tpsWindow.length && tpsWindow[0] < cutoff) tpsWindow.shift();
}

function getCurrentTps() {
  const cutoff = Date.now() - 1000;
  return tpsWindow.filter((t) => t > cutoff).length;
}

function getAverageLatency() {
  if (totalLatencyCount === 0) return 0;
  return Math.round(totalLatencyMs / totalLatencyCount);
}

async function getMetrics() {
  const [
    total,
    successCount,
    failedCount,
    rolledBackCount,
    recoveryCount,
    retryCount,
    fraudHigh,
    fraudSuspicious,
  ] = await Promise.all([
    prisma.transaction.count(),
    prisma.transaction.count({ where: { status: "SUCCESS" } }),
    prisma.transaction.count({ where: { status: "FAILED" } }),
    prisma.transaction.count({ where: { status: "ROLLED_BACK" } }),
    prisma.transaction.count({ where: { status: "RECOVERY_PENDING" } }),
    prisma.retryJob.count(),
    prisma.fraudReport.count({ where: { riskLevel: "HIGH_RISK" } }),
    prisma.fraudReport.count({ where: { riskLevel: "SUSPICIOUS" } }),
  ]);

  const successRate = total > 0 ? ((successCount / total) * 100).toFixed(1) : 0;
  const failureRate = total > 0 ? (((failedCount + rolledBackCount) / total) * 100).toFixed(1) : 0;

  // Transactions per minute (last 5 min)
  const tpmWindow = new Date(Date.now() - 5 * 60 * 1000);
  const recentCount = await prisma.transaction.count({
    where: { createdAt: { gte: tpmWindow } },
  });
  const tpm = Math.round(recentCount / 5);

  // Hourly trends (last 24 hours)
  const hourlyTrends = await getHourlyTrends();

  // Queue stats
  let queueStats = { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  try {
    queueStats = await retryService.getQueueStats();
  } catch {
    // Redis may not be connected
  }

  // Bank statuses
  const banks = await prisma.bank.findMany({
    select: { name: true, code: true, isCrashed: true, delayMs: true, failureRate: true },
  });

  return {
    summary: {
      total,
      successCount,
      failedCount,
      rolledBackCount,
      recoveryCount,
      retryCount,
      successRate: parseFloat(successRate),
      failureRate: parseFloat(failureRate),
    },
    performance: {
      tps: getCurrentTps(),
      tpm,
      avgLatencyMs: getAverageLatency(),
    },
    fraud: {
      highRisk: fraudHigh,
      suspicious: fraudSuspicious,
      total: fraudHigh + fraudSuspicious,
    },
    queue: queueStats,
    banks,
    trends: hourlyTrends,
    timestamp: new Date().toISOString(),
  };
}

async function getHourlyTrends() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gte: since } },
    select: { status: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  // Group by hour
  const hourlyMap = {};
  for (const t of transactions) {
    const hour = new Date(t.createdAt);
    hour.setMinutes(0, 0, 0);
    const key = hour.toISOString();
    if (!hourlyMap[key]) {
      hourlyMap[key] = { time: key, total: 0, success: 0, failed: 0, rolledBack: 0 };
    }
    hourlyMap[key].total++;
    if (t.status === "SUCCESS") hourlyMap[key].success++;
    else if (t.status === "FAILED") hourlyMap[key].failed++;
    else if (t.status === "ROLLED_BACK") hourlyMap[key].rolledBack++;
  }

  return Object.values(hourlyMap).slice(-24);
}

module.exports = { getMetrics, recordLatency, recordTransaction };
