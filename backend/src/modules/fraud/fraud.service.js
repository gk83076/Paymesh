/**
 * Fraud Detection Engine
 *
 * Rule-based scoring system that evaluates risk before executing a transfer.
 *
 * Rules:
 *   1. VELOCITY       — >5 transactions from sender in 30 seconds
 *   2. LARGE_AMOUNT   — Transaction amount > ₹50,000
 *   3. RECIPIENT_SPREAD — >3 unique recipients in 60 seconds
 *
 * Scoring:
 *   Each rule contributes to a 0–100 fraud score.
 *   NORMAL: 0–39 | SUSPICIOUS: 40–69 | HIGH_RISK: 70–100
 */

const prisma = require("../../config/database");
const config = require("../../config");
const logger = require("../../config/logger");

const RULE_WEIGHTS = {
  VELOCITY: 40,
  LARGE_AMOUNT: 35,
  RECIPIENT_SPREAD: 25,
};

function computeRiskLevel(score) {
  if (score >= 70) return "HIGH_RISK";
  if (score >= 40) return "SUSPICIOUS";
  return "NORMAL";
}

/**
 * Evaluate fraud rules for a given sender and amount.
 * @returns {{ fraudScore, riskLevel, triggeredRules }}
 */
async function evaluate({ senderId, receiverId, amount }) {
  const now = new Date();
  const triggeredRules = [];
  let score = 0;

  // ── Rule 1: Velocity ──────────────────────────────────────────────────────
  const velocityWindow = new Date(now - config.fraud.velocityWindowSec * 1000);
  const recentTxnCount = await prisma.transaction.count({
    where: {
      senderId,
      createdAt: { gte: velocityWindow },
      status: { notIn: ["FAILED", "ROLLED_BACK"] },
    },
  });

  if (recentTxnCount >= config.fraud.velocityMaxTxns) {
    score += RULE_WEIGHTS.VELOCITY;
    triggeredRules.push({
      rule: "VELOCITY",
      detail: `${recentTxnCount} transactions in last ${config.fraud.velocityWindowSec}s (limit: ${config.fraud.velocityMaxTxns})`,
      weight: RULE_WEIGHTS.VELOCITY,
    });
  }

  // ── Rule 2: Large Amount ──────────────────────────────────────────────────
  if (amount > config.fraud.largeAmountThreshold) {
    score += RULE_WEIGHTS.LARGE_AMOUNT;
    triggeredRules.push({
      rule: "LARGE_AMOUNT",
      detail: `Amount ₹${amount} exceeds threshold ₹${config.fraud.largeAmountThreshold}`,
      weight: RULE_WEIGHTS.LARGE_AMOUNT,
    });
  }

  // ── Rule 3: Recipient Spread ──────────────────────────────────────────────
  const spreadWindow = new Date(now - config.fraud.recipientSpreadWindowSec * 1000);
  const uniqueRecipients = await prisma.transaction.findMany({
    where: {
      senderId,
      createdAt: { gte: spreadWindow },
      status: { notIn: ["FAILED", "ROLLED_BACK"] },
    },
    select: { receiverId: true },
    distinct: ["receiverId"],
  });

  if (uniqueRecipients.length >= config.fraud.recipientSpreadMax) {
    score += RULE_WEIGHTS.RECIPIENT_SPREAD;
    triggeredRules.push({
      rule: "RECIPIENT_SPREAD",
      detail: `${uniqueRecipients.length} unique recipients in last ${config.fraud.recipientSpreadWindowSec}s (limit: ${config.fraud.recipientSpreadMax})`,
      weight: RULE_WEIGHTS.RECIPIENT_SPREAD,
    });
  }

  score = Math.min(score, 100);
  const riskLevel = computeRiskLevel(score);

  logger.info(
    `[FRAUD] Sender ${senderId} | Score: ${score} | Level: ${riskLevel} | Rules: ${triggeredRules.map(r => r.rule).join(", ") || "none"}`
  );

  return { fraudScore: score, riskLevel, triggeredRules };
}

/**
 * Save fraud report to DB.
 */
async function saveFraudReport({ transactionId, userId, fraudScore, riskLevel, triggeredRules, metadata }) {
  return prisma.fraudReport.create({
    data: {
      transactionId,
      userId,
      fraudScore,
      riskLevel,
      rules: triggeredRules,
      metadata: metadata || null,
    },
  });
}

/**
 * Get all fraud reports (paginated).
 */
async function getFraudReports({ page = 1, limit = 20, riskLevel } = {}) {
  const where = riskLevel ? { riskLevel } : {};
  const [reports, total] = await Promise.all([
    prisma.fraudReport.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            amount: true,
            status: true,
            sender: { select: { name: true, upiId: true } },
            receiver: { select: { name: true, upiId: true } },
          },
        },
        user: { select: { name: true, upiId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    }),
    prisma.fraudReport.count({ where }),
  ]);

  return { reports, total, page, limit };
}

module.exports = { evaluate, saveFraudReport, getFraudReports };
