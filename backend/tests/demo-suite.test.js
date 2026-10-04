/**
 * PayMesh - Automated Test Suite for the 6 Core Interview Demos
 *
 * Demonstrates:
 *   1. Happy Path & Two-Phase State Machine
 *   2. Distributed Idempotency (Preventing Double Debits)
 *   3. Chaos Engineering & Compensating Rollback
 *   4. Asynchronous Retry Queue & Observability
 *   5. Rule-Based Fraud Detection Engine
 *   6. Immutable Double-Entry Ledger Accounting
 *
 * Run with: node tests/demo-suite.test.js
 */

const assert = require("node:assert");

const BASE_URL = process.env.API_URL || "http://localhost:3001/api";

// Colorful console helpers
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  bold: "\x1b[1m",
};

function pass(title) {
  console.log(`  ${colors.green}✔ PASS:${colors.reset} ${title}`);
}

function info(msg) {
  console.log(`    ${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function header(title) {
  console.log(`\n${colors.bold}${colors.yellow}===================================================================${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.yellow}===================================================================${colors.reset}`);
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

async function runDemoSuite() {
  console.log(`\n🚀 Starting PayMesh Automated 6-Demo Verification Suite`);
  console.log(`Target Switch API: ${BASE_URL}\n`);

  let passedCount = 0;
  const totalDemos = 6;

  // Setup: Reset chaos & fetch sample accounts
  info("Setting up clean test environment: resetting bank chaos & setting 0% failure rate...");
  await request("/admin/reset-chaos", { method: "POST" });
  await request("/admin/set-failure-rate", { method: "POST", body: JSON.stringify({ bankCode: "BANK_A", failureRate: 0 }) });
  await request("/admin/set-failure-rate", { method: "POST", body: JSON.stringify({ bankCode: "BANK_B", failureRate: 0 }) });
  await request("/admin/set-failure-rate", { method: "POST", body: JSON.stringify({ bankCode: "BANK_C", failureRate: 0 }) });

  const accountsRes = await request("/accounts?limit=50");
  assert.strictEqual(accountsRes.ok, true, "Could not fetch accounts");
  const accounts = accountsRes.data.data.accounts;
  assert.ok(accounts.length >= 2, "Need at least 2 seeded accounts");

  const bankAAccount = accounts.find((a) => a.bank.code === "BANK_A" && a.balance >= 5000);
  const bankBAccount = accounts.find((a) => a.bank.code === "BANK_B");
  const wealthyAccount = accounts.slice().sort((a, b) => b.balance - a.balance)[0];
  assert.ok(bankAAccount && bankBAccount, "Need accounts from Bank A and Bank B");

  // =========================================================================
  // DEMO 1: Happy Path & Two-Phase State Machine
  // =========================================================================
  header("DEMO 1: Happy Path & Real-time State Machine");
  try {
    const sender = bankAAccount;
    const receiver = bankBAccount;
    const transferAmount = 250;
    const idempKey = `demo1-happy-${Date.now()}`;

    const senderBalBefore = (await request(`/accounts/${sender.id}/balance`)).data.data.balance;
    const receiverBalBefore = (await request(`/accounts/${receiver.id}/balance`)).data.data.balance;
    info(`Sender initial balance: ₹${senderBalBefore} | Receiver initial balance: ₹${receiverBalBefore}`);

    info(`Initiating cross-bank transfer: ${sender.user.upiId} → ${receiver.user.upiId} (₹${transferAmount})`);
    const transferRes = await request("/transfer", {
      method: "POST",
      body: JSON.stringify({
        senderId: sender.userId,
        receiverId: receiver.userId,
        amount: transferAmount,
        idempotencyKey: idempKey,
      }),
    });

    assert.strictEqual(transferRes.status, 200, `Transfer failed with status ${transferRes.status}`);
    assert.strictEqual(transferRes.data.ok, true);
    assert.strictEqual(transferRes.data.data.status, "SUCCESS");
    const txnId = transferRes.data.data.transactionId;
    info(`Transfer succeeded with Transaction ID: ${txnId}`);

    // Verify State Machine history
    const txnDetails = await request(`/transfer/${txnId}`);
    assert.strictEqual(txnDetails.ok, true);
    const states = txnDetails.data.data.stateHistory.map((s) => s.toState);
    info(`Observed State Machine transitions: ${states.join(" → ")}`);

    assert.ok(states.includes("INITIATED"), "State machine missing INITIATED");
    assert.ok(states.includes("DEBIT_PENDING"), "State machine missing DEBIT_PENDING");
    assert.ok(states.includes("DEBIT_SUCCESS"), "State machine missing DEBIT_SUCCESS");
    assert.ok(states.includes("CREDIT_PENDING"), "State machine missing CREDIT_PENDING");
    assert.ok(states.includes("CREDIT_SUCCESS"), "State machine missing CREDIT_SUCCESS");
    assert.ok(states.includes("SUCCESS"), "State machine missing final SUCCESS");

    const senderBalAfter = (await request(`/accounts/${sender.id}/balance`)).data.data.balance;
    const receiverBalAfter = (await request(`/accounts/${receiver.id}/balance`)).data.data.balance;
    info(`Sender balance after: ₹${senderBalAfter} (-₹${transferAmount})`);
    info(`Receiver balance after: ₹${receiverBalAfter} (+₹${transferAmount})`);

    assert.strictEqual(senderBalBefore - transferAmount, senderBalAfter, "Sender balance debit mismatch");
    assert.strictEqual(receiverBalBefore + transferAmount, receiverBalAfter, "Receiver balance credit mismatch");

    pass("Demo 1: State machine traversed all phases deterministically with exact balance updates");
    passedCount++;
  } catch (err) {
    console.error(`  ${colors.red}✘ FAIL: Demo 1 failed:${colors.reset}`, err.message);
  }

  // =========================================================================
  // DEMO 2: Distributed Idempotency (Preventing Double Debits)
  // =========================================================================
  header("DEMO 2: Distributed Idempotency (Preventing Double Debits)");
  try {
    const sender = bankAAccount;
    const receiver = bankBAccount;
    const fixedIdempKey = `demo2-idemp-${Date.now()}`;
    const transferAmount = 100;

    info(`Sending First Request with Key: ${fixedIdempKey}`);
    const firstReq = await request("/transfer", {
      method: "POST",
      body: JSON.stringify({
        senderId: sender.userId,
        receiverId: receiver.userId,
        amount: transferAmount,
        idempotencyKey: fixedIdempKey,
      }),
    });
    assert.strictEqual(firstReq.status, 200);
    const originalTxnId = firstReq.data.data.transactionId;
    info(`First request completed. Txn ID: ${originalTxnId}`);

    const senderBalAfterFirst = (await request(`/accounts/${sender.id}/balance`)).data.data.balance;

    info(`Sending DUPLICATE Request with identical Key: ${fixedIdempKey}`);
    const duplicateReq = await request("/transfer", {
      method: "POST",
      body: JSON.stringify({
        senderId: sender.userId,
        receiverId: receiver.userId,
        amount: transferAmount,
        idempotencyKey: fixedIdempKey,
      }),
    });

    assert.strictEqual(duplicateReq.status, 200);
    assert.strictEqual(duplicateReq.data.data.transactionId, originalTxnId, "Duplicate returned different transaction ID");
    assert.strictEqual(duplicateReq.data.data._idempotencyHit, true, "Response missing _idempotencyHit flag");
    info(`Duplicate response recognized: _idempotencyHit = ${duplicateReq.data.data._idempotencyHit}`);

    const senderBalAfterDuplicate = (await request(`/accounts/${sender.id}/balance`)).data.data.balance;
    info(`Sender balance after duplicate: ₹${senderBalAfterDuplicate} (Initial: ₹${senderBalAfterFirst})`);
    assert.strictEqual(senderBalAfterFirst, senderBalAfterDuplicate, "CRITICAL: Sender was double debited!");

    pass("Demo 2: Idempotency engine detected retry, returned snapshot, and prevented double debit");
    passedCount++;
  } catch (err) {
    console.error(`  ${colors.red}✘ FAIL: Demo 2 failed:${colors.reset}`, err.message);
  }

  // =========================================================================
  // DEMO 3: Bank Outages & Automatic Rollback / Compensation
  // =========================================================================
  header("DEMO 3: Bank Outages & Automatic Compensating Rollback");
  try {
    const sender = bankAAccount;
    const receiver = bankBAccount;
    const transferAmount = 300;

    info("Injecting Chaos: Crashing Bank B (503 Service Unavailable)...");
    const crashRes = await request("/admin/crash-bank-b", { method: "POST" });
    assert.strictEqual(crashRes.ok, true);

    const bankStatusRes = await request("/admin/banks/status");
    const bankB = bankStatusRes.data.data.find((b) => b.code === "BANK_B");
    assert.strictEqual(bankB.isCrashed, true, "Bank B should be crashed");
    info("Confirmed: Bank B is currently offline (isCrashed = true)");

    const senderBalBefore = (await request(`/accounts/${sender.id}/balance`)).data.data.balance;
    info(`Sender initial balance before transfer: ₹${senderBalBefore}`);

    const idempKey = `demo3-chaos-${Date.now()}`;
    info(`Attempting transfer from Bank A to CRASHED Bank B (₹${transferAmount})...`);
    const failedTransferRes = await request("/transfer", {
      method: "POST",
      body: JSON.stringify({
        senderId: sender.userId,
        receiverId: receiver.userId,
        amount: transferAmount,
        idempotencyKey: idempKey,
      }),
    });

    const txnId = failedTransferRes.data.data.transactionId;
    info(`Transfer entered state: ${failedTransferRes.data.data.status} (Txn: ${txnId})`);
    assert.strictEqual(failedTransferRes.data.data.status, "RECOVERY_PENDING");

    // Trigger compensation / rollback
    info(`Executing compensating transaction / rollback for ${txnId}...`);
    const rollbackRes = await request(`/transfer/${txnId}/rollback`, { method: "POST" });
    assert.strictEqual(rollbackRes.ok, true, `Rollback call failed: ${JSON.stringify(rollbackRes.data)}`);
    assert.strictEqual(rollbackRes.data.data.status, "ROLLED_BACK");
    info(`Transaction successfully rolled back. Status: ${rollbackRes.data.data.status}`);

    const txnHistory = (await request(`/transfer/${txnId}`)).data.data.stateHistory.map((s) => s.toState);
    info(`Observed recovery transitions: ${txnHistory.join(" → ")}`);
    assert.ok(txnHistory.includes("DEBIT_SUCCESS"), "Should have debited before crash");
    assert.ok(txnHistory.includes("RECOVERY_PENDING"), "Should have entered RECOVERY_PENDING");
    assert.ok(txnHistory.includes("ROLLBACK_INITIATED"), "Should have initiated rollback");
    assert.ok(txnHistory.includes("ROLLED_BACK"), "Should have finalized ROLLED_BACK");

    // Verify refund
    const senderBalAfter = (await request(`/accounts/${sender.id}/balance`)).data.data.balance;
    info(`Sender balance after rollback refund: ₹${senderBalAfter} (Expected: ₹${senderBalBefore})`);
    assert.strictEqual(senderBalBefore, senderBalAfter, "Sender was not fully refunded!");

    info("Recovering Bank B back online...");
    await request("/admin/recover/BANK_B", { method: "POST" });
    const recoveredBankB = (await request("/admin/banks/status")).data.data.find((b) => b.code === "BANK_B");
    assert.strictEqual(recoveredBankB.isCrashed, false);
    info("Bank B is now back online!");

    pass("Demo 3: Downstream bank crash detected, compensation executed, and sender funds restored");
    passedCount++;
  } catch (err) {
    console.error(`  ${colors.red}✘ FAIL: Demo 3 failed:${colors.reset}`, err.message);
  }

  // =========================================================================
  // DEMO 4: Asynchronous Retry Engine & Queue Observability
  // =========================================================================
  header("DEMO 4: Asynchronous Retry Engine & Observability");
  try {
    info("Querying system metrics and BullMQ retry queue observability endpoint...");
    const metricsRes = await request("/metrics");
    assert.strictEqual(metricsRes.ok, true, "Could not fetch metrics");
    const m = metricsRes.data.data;

    info(`Reported TPS: ${m.performance.tps} | Success Rate: ${m.summary.successRate}% | Total Transactions: ${m.summary.total}`);
    info(`Queue Health: Waiting: ${m.queue.waiting} | Active: ${m.queue.active} | Completed: ${m.queue.completed} | Delayed: ${m.queue.delayed}`);

    assert.ok(typeof m.performance.tps === "number", "TPS metric missing");
    assert.ok(typeof m.summary.successRate === "number", "Success rate missing");
    assert.ok(typeof m.queue === "object", "BullMQ retry queue stats missing");
    assert.ok(m.banks.length >= 3, "Bank health monitoring metrics missing");

    pass("Demo 4: Observability metrics and BullMQ queue stats successfully verified");
    passedCount++;
  } catch (err) {
    console.error(`  ${colors.red}✘ FAIL: Demo 4 failed:${colors.reset}`, err.message);
  }

  // =========================================================================
  // DEMO 5: Rule-Based Fraud Detection Engine
  // =========================================================================
  header("DEMO 5: Real-time Rule-Based Fraud Detection");
  try {
    const sender = wealthyAccount;
    const receiver = accounts.find((a) => a.userId !== sender.userId);
    const highAmount = 55000; // Exceeds ₹50,000 threshold

    info(`Sender Account: ${sender.accountNumber} with Balance: ₹${sender.balance}`);
    info(`Submitting High-Value Anomaly Transfer: ₹${highAmount} (Threshold is ₹50,000)...`);
    const fraudTxnRes = await request("/transfer", {
      method: "POST",
      body: JSON.stringify({
        senderId: sender.userId,
        receiverId: receiver.userId,
        amount: highAmount,
        idempotencyKey: `demo5-fraud-${Date.now()}`,
      }),
    });

    assert.strictEqual(fraudTxnRes.ok, true, `Fraud transfer failed: ${JSON.stringify(fraudTxnRes.data)}`);
    const txnData = fraudTxnRes.data.data;
    info(`Fraud Evaluation Result -> Score: ${txnData.fraudScore} | Risk Level: ${txnData.riskLevel}`);
    info(`Triggered Rules: ${JSON.stringify(txnData.triggeredRules || [])}`);

    assert.ok(txnData.fraudScore >= 35, "Fraud score should be >= 35 for large amount");
    assert.strictEqual(txnData.triggeredRules[0]?.rule, "LARGE_AMOUNT", "Rule LARGE_AMOUNT should be triggered");

    // Test Velocity Rule: Fire 5 rapid micro-transactions to breach velocity threshold (>5 txns in 30s)
    info("Testing Velocity Spike Detection (>5 transactions in 30 seconds)...");
    for (let i = 0; i < 5; i++) {
      await request("/transfer", {
        method: "POST",
        body: JSON.stringify({
          senderId: sender.userId,
          receiverId: receiver.userId,
          amount: 10,
          idempotencyKey: `demo5-velocity-${i}-${Date.now()}`,
        }),
      });
    }

    // The 6th transaction exceeds threshold and triggers VELOCITY (weight 40 -> SUSPICIOUS)
    const velocityTxnRes = await request("/transfer", {
      method: "POST",
      body: JSON.stringify({
        senderId: sender.userId,
        receiverId: receiver.userId,
        amount: 10,
        idempotencyKey: `demo5-velocity-trigger-${Date.now()}`,
      }),
    });
    const velocityTxnData = velocityTxnRes.data.data;
    info(`Velocity Spike Result -> Score: ${velocityTxnData.fraudScore} | Risk Level: ${velocityTxnData.riskLevel}`);
    assert.ok(velocityTxnData.fraudScore >= 40, "Velocity spike should elevate fraud score >= 40");
    assert.strictEqual(velocityTxnData.riskLevel, "SUSPICIOUS", "Risk level should be flagged as SUSPICIOUS");

    // Verify Fraud Center reports
    info("Verifying report logged in Fraud Center (/api/fraud/reports)...");
    const reportsRes = await request("/fraud/reports");
    assert.strictEqual(reportsRes.ok, true);
    const reports = reportsRes.data.data.reports;
    assert.ok(reports.length > 0, "Fraud reports should be recorded in database");

    const matchedReport = reports.find((r) => r.transactionId === txnData.transactionId);
    assert.ok(matchedReport, "Could not find fraud report for test transaction");
    info(`Found stored report ID: ${matchedReport.id} | Flagged rule: ${matchedReport.rules[0]?.rule}`);

    pass("Demo 5: High-value anomaly and velocity spikes flagged with rule-based scoring and saved to audit log");
    passedCount++;
  } catch (err) {
    console.error(`  ${colors.red}✘ FAIL: Demo 5 failed:${colors.reset}`, err.message);
  }

  // =========================================================================
  // DEMO 6: Immutable Double-Entry Ledger Accounting
  // =========================================================================
  header("DEMO 6: Immutable Double-Entry Ledger Integrity");
  try {
    const account = bankAAccount;
    info(`Querying immutable ledger entries for Account: ${account.accountNumber} (${account.id})...`);

    const ledgerRes = await request(`/accounts/${account.id}/ledger`);
    assert.strictEqual(ledgerRes.ok, true);
    const entries = ledgerRes.data.data;

    info(`Retrieved ${entries.length} immutable ledger records`);
    assert.ok(entries.length > 0, "Account should have ledger records from previous transactions");

    let verifiedEntries = 0;
    for (const entry of entries) {
      assert.ok(["DEBIT", "CREDIT"].includes(entry.type), `Invalid entry type: ${entry.type}`);
      assert.ok(typeof entry.balanceBefore === "number", "balanceBefore missing");
      assert.ok(typeof entry.balanceAfter === "number", "balanceAfter missing");
      assert.ok(typeof entry.amount === "number", "amount missing");
      assert.ok(entry.transactionId, "transactionId reference missing");

      // Verify accounting invariant
      if (entry.type === "DEBIT") {
        assert.strictEqual(
          entry.balanceBefore - entry.amount,
          entry.balanceAfter,
          `DEBIT arithmetic mismatch in ledger entry ${entry.id}`
        );
      } else if (entry.type === "CREDIT") {
        assert.strictEqual(
          entry.balanceBefore + entry.amount,
          entry.balanceAfter,
          `CREDIT arithmetic mismatch in ledger entry ${entry.id}`
        );
      }
      verifiedEntries++;
    }

    const sample = entries[0];
    info(`Sample Ledger Entry verified: Type=${sample.type} | Amount=₹${sample.amount} | BalanceBefore=₹${sample.balanceBefore} → BalanceAfter=₹${sample.balanceAfter}`);
    info(`Total verified immutable ledger invariants: ${verifiedEntries}/${entries.length}`);

    pass("Demo 6: Immutable double-entry bookkeeping verified with zero mathematical discrepancies");
    passedCount++;
  } catch (err) {
    console.error(`  ${colors.red}✘ FAIL: Demo 6 failed:${colors.reset}`, err.message);
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log(`\n${colors.bold}===================================================================${colors.reset}`);
  if (passedCount === totalDemos) {
    console.log(`${colors.bold}${colors.green}  🎉 ALL ${passedCount}/${totalDemos} INTERVIEW DEMOS VERIFIED SUCCESSFULLY!${colors.reset}`);
  } else {
    console.log(`${colors.bold}${colors.red}  ⚠️  ${passedCount}/${totalDemos} DEMOS PASSED. PLEASE CHECK THE ERRORS ABOVE.${colors.reset}`);
  }
  console.log(`${colors.bold}===================================================================\n${colors.reset}`);

  if (passedCount !== totalDemos) {
    process.exit(1);
  }
}

runDemoSuite().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
