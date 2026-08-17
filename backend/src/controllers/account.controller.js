const prisma = require("../config/database");
const bankService = require("../modules/banks/bank.service");
const { AppError } = require("../utils/errors");

/**
 * GET /api/accounts
 */
async function listAccounts(req, res) {
  const { search, bank, page, limit } = req.query;
  const take = parseInt(limit) || 20;
  const skip = ((parseInt(page) || 1) - 1) * take;

  const where = {};
  if (bank) where.bank = { code: bank };
  if (search) {
    where.OR = [
      { user: { name: { contains: search, mode: "insensitive" } } },
      { user: { upiId: { contains: search, mode: "insensitive" } } },
      { accountNumber: { contains: search, mode: "insensitive" } },
    ];
  }

  const [accounts, total] = await Promise.all([
    prisma.account.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, upiId: true, email: true, phone: true } },
        bank: { select: { id: true, name: true, code: true, isCrashed: true } },
      },
      orderBy: { user: { name: "asc" } },
      take,
      skip,
    }),
    prisma.account.count({ where }),
  ]);

  res.json({
    ok: true,
    data: { accounts, total, page: parseInt(page) || 1, limit: take, totalPages: Math.ceil(total / take) },
  });
}

/**
 * GET /api/accounts/:accountId/balance
 */
async function getBalance(req, res) {
  const balance = await bankService.getBalance(req.params.accountId);
  res.json({ ok: true, data: balance });
}

/**
 * GET /api/accounts/:accountId/ledger
 */
async function getLedger(req, res) {
  const { accountId } = req.params;
  const entries = await prisma.ledgerEntry.findMany({
    where: { accountId },
    include: {
      transaction: { select: { id: true, amount: true, status: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
    take: parseInt(req.query.limit) || 50,
    skip: parseInt(req.query.offset) || 0,
  });
  res.json({ ok: true, data: entries });
}

/**
 * GET /api/users
 */
async function listUsers(req, res) {
  const users = await prisma.user.findMany({
    include: {
      accounts: {
        include: { bank: { select: { name: true, code: true } } },
      },
    },
    orderBy: { name: "asc" },
  });
  res.json({ ok: true, data: users });
}

/**
 * POST /api/banks/debit (internal bank API simulation)
 */
async function bankDebit(req, res) {
  const { accountId, amount, bankCode } = req.body;
  if (!accountId || !amount || !bankCode) {
    throw new AppError("accountId, amount, and bankCode are required", 400);
  }
  const result = await bankService.debit({ accountId, amount, bankCode });
  res.json({ ok: true, data: result });
}

/**
 * POST /api/banks/credit (internal bank API simulation)
 */
async function bankCredit(req, res) {
  const { accountId, amount, bankCode } = req.body;
  if (!accountId || !amount || !bankCode) {
    throw new AppError("accountId, amount, and bankCode are required", 400);
  }
  const result = await bankService.credit({ accountId, amount, bankCode });
  res.json({ ok: true, data: result });
}

module.exports = { listAccounts, getBalance, getLedger, listUsers, bankDebit, bankCredit };
