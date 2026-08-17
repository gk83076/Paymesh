/**
 * PayMesh Database Seed
 * Creates: 3 banks, 50 users distributed across banks with realistic balances
 */

const { PrismaClient } = require("@prisma/client");
const { faker } = require("@faker-js/faker/locale/en_IN");

const prisma = new PrismaClient();

const BANKS = [
  { name: "Axis Virtual Bank", code: "BANK_A", failureRate: 0.05, delayMs: 80 },
  { name: "HDFC Sim Bank", code: "BANK_B", failureRate: 0.08, delayMs: 120 },
  { name: "SBI Sim Bank", code: "BANK_C", failureRate: 0.12, delayMs: 200 },
];

const BALANCE_TIERS = [1000, 5000, 10000, 50000, 100000];

// Deterministic UPI handle suffix per bank
const UPI_SUFFIX = { BANK_A: "@axisv", BANK_B: "@hdfcsim", BANK_C: "@sbisim" };

async function main() {
  console.log("🌱 Starting PayMesh seed...");

  // ── Clean existing data (in dependency order) ──────────────────────────────
  await prisma.auditLog.deleteMany();
  await prisma.retryJob.deleteMany();
  await prisma.fraudReport.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.transactionStateHistory.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
  await prisma.bank.deleteMany();

  console.log("🧹 Cleared existing data");

  // ── Create Banks ───────────────────────────────────────────────────────────
  const banks = await Promise.all(
    BANKS.map((b) =>
      prisma.bank.create({
        data: {
          name: b.name,
          code: b.code,
          failureRate: b.failureRate,
          delayMs: b.delayMs,
        },
      })
    )
  );

  const bankMap = Object.fromEntries(banks.map((b) => [b.code, b]));
  console.log(`✅ Created ${banks.length} banks`);

  // ── Create 50 Users with Accounts ─────────────────────────────────────────
  const bankCodes = ["BANK_A", "BANK_B", "BANK_C"];
  const usedEmails = new Set();
  const usedPhones = new Set();
  const usedUpiIds = new Set();

  for (let i = 0; i < 50; i++) {
    const bankCode = bankCodes[i % 3];
    const bank = bankMap[bankCode];

    // Generate unique values
    let email, phone, upiId, firstName, lastName;
    do {
      firstName = faker.person.firstName();
      lastName = faker.person.lastName();
      email = faker.internet.email({ firstName, lastName }).toLowerCase();
    } while (usedEmails.has(email));
    usedEmails.add(email);

    do {
      phone = `9${faker.string.numeric(9)}`;
    } while (usedPhones.has(phone));
    usedPhones.add(phone);

    const upiHandle = `${firstName.toLowerCase()}${faker.string.numeric(4)}`;
    upiId = `${upiHandle}${UPI_SUFFIX[bankCode]}`;
    if (usedUpiIds.has(upiId)) {
      upiId = `${upiHandle}${faker.string.numeric(2)}${UPI_SUFFIX[bankCode]}`;
    }
    usedUpiIds.add(upiId);

    const balance =
      BALANCE_TIERS[Math.floor(Math.random() * BALANCE_TIERS.length)];
    const accountNumber = `PM${bankCode.replace("_", "")
      .slice(-1)}${faker.string.numeric(10)}`;

    await prisma.user.create({
      data: {
        name: `${firstName} ${lastName}`,
        email,
        upiId,
        phone,
        accounts: {
          create: {
            accountNumber,
            balance,
            bankId: bank.id,
          },
        },
      },
    });
  }

  console.log("✅ Created 50 users with accounts");
  console.log("");
  console.log("📊 Bank distribution:");
  console.log("   BANK_A (Axis Virtual): ~17 users");
  console.log("   BANK_B (HDFC Sim): ~17 users");
  console.log("   BANK_C (SBI Sim): ~16 users");
  console.log("");
  console.log("💰 Sample balances: ₹1,000 | ₹5,000 | ₹10,000 | ₹50,000 | ₹1,00,000");
  console.log("");
  console.log("🎉 PayMesh seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
