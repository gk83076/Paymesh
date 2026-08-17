/**
 * Audit logging utility
 */

const prisma = require("../config/database");
const logger = require("../config/logger");

async function log({ entity, entityId, action, metadata, actorId }) {
  try {
    await prisma.auditLog.create({
      data: {
        entity,
        entityId,
        action,
        metadata: metadata || null,
        actorId: actorId || "system",
      },
    });
  } catch (err) {
    // Audit logging should never crash the main flow
    logger.error("[AUDIT] Failed to write audit log:", err);
  }
}

async function getLogs({ entity, entityId, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (entity) where.entity = entity;
  if (entityId) where.entityId = entityId;

  return prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
}

module.exports = { log, getLogs };
