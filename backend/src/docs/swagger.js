const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "PayMesh API",
      version: "1.0.0",
      description: `
## PayMesh — Distributed UPI Switch Simulator

A production-grade simulation of how payment processors (Juspay, Razorpay, Stripe, NPCI)
internally handle payment routing, transaction state management, idempotency, failure recovery,
rollbacks, retry orchestration, fraud detection, and monitoring.

### Key Features
- **UPI Switch**: Full transfer orchestration with state machine
- **Idempotency Engine**: Prevent duplicate payments
- **Fraud Detection**: Rule-based scoring (velocity, amount, recipient spread)
- **Retry Engine**: Exponential backoff via BullMQ (1s → 2s → 4s → 8s → 16s)
- **Rollback Engine**: Automatic compensation on credit failure
- **Immutable Ledger**: Append-only double-entry bookkeeping
- **Chaos Testing**: Crash banks, add latency, set failure rates

### Transaction State Machine
\`INITIATED → DEBIT_PENDING → DEBIT_SUCCESS → CREDIT_PENDING → CREDIT_SUCCESS → SUCCESS\`

On failure: \`→ RECOVERY_PENDING → ... → ROLLBACK_INITIATED → ROLLED_BACK\`
      `,
      contact: {
        name: "PayMesh Engineering",
        email: "engineering@paymesh.dev",
      },
    },
    servers: [
      { url: "http://localhost:3001", description: "Local Development" },
    ],
    tags: [
      { name: "Transfer", description: "UPI Transfer operations" },
      { name: "Transactions", description: "Transaction queries and history" },
      { name: "Accounts", description: "Account and user management" },
      { name: "Banks", description: "Virtual bank operations" },
      { name: "Fraud", description: "Fraud detection and reporting" },
      { name: "Monitoring", description: "System metrics and observability" },
      { name: "Admin", description: "Chaos engineering and admin controls" },
      { name: "System", description: "Health checks" },
    ],
  },
  apis: ["./src/routes/*.js"],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;
