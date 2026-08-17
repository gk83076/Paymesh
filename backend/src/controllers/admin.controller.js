const adminService = require("../modules/admin/admin.service");
const { AppError } = require("../utils/errors");

async function getBankStatus(req, res) {
  const banks = await adminService.getBankStatus();
  res.json({ ok: true, data: banks });
}

async function crashBankA(req, res) {
  const result = await adminService.crashBank("BANK_A");
  res.json({ ok: true, data: result });
}

async function crashBankB(req, res) {
  const result = await adminService.crashBank("BANK_B");
  res.json({ ok: true, data: result });
}

async function crashBankC(req, res) {
  const result = await adminService.crashBank("BANK_C");
  res.json({ ok: true, data: result });
}

async function recoverBank(req, res) {
  const { bankCode } = req.params;
  const result = await adminService.recoverBank(bankCode);
  res.json({ ok: true, data: result });
}

async function addDelay(req, res) {
  const { bankCode, delayMs } = req.body;
  if (!bankCode || delayMs === undefined) {
    throw new AppError("bankCode and delayMs are required", 400);
  }
  const result = await adminService.addDelay(bankCode, parseInt(delayMs));
  res.json({ ok: true, data: result });
}

async function setFailureRate(req, res) {
  const { bankCode, failureRate } = req.body;
  if (!bankCode || failureRate === undefined) {
    throw new AppError("bankCode and failureRate are required", 400);
  }
  const result = await adminService.setFailureRate(bankCode, parseFloat(failureRate));
  res.json({ ok: true, data: result });
}

async function resetChaos(req, res) {
  const result = await adminService.resetChaos();
  res.json({ ok: true, data: result });
}

module.exports = {
  getBankStatus,
  crashBankA,
  crashBankB,
  crashBankC,
  recoverBank,
  addDelay,
  setFailureRate,
  resetChaos,
};
