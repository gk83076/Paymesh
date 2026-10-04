# PayMesh — Distributed UPI Switch Simulator

> A production-grade simulation of how payment processors like Juspay, Razorpay, PhonePe, and NPCI internally handle payment routing, transaction state management, idempotency, failure recovery, rollbacks, retry orchestration, fraud detection, and observability.

---

## Table of Contents

- [Project Overview](#project-overview)
- [Architecture](#architecture)
- [Database Design](#database-design)
- [State Machine](#state-machine)
- [Ledger Design](#ledger-design)
- [Retry Strategy](#retry-strategy)
- [Fraud Engine](#fraud-engine)
- [Docker Setup](#docker-setup)
- [Local Setup](#local-setup)
- [Automated Interview Demo Suite](#automated-interview-demo-suite)
- [Interactive UI Demo Walkthrough](#interactive-ui-demo-walkthrough)
- [API Reference](#api-reference)
- [Future Improvements](#future-improvements)

---

## Project Overview

PayMesh simulates a UPI payment network. **All money is virtual.** There is no real payment provider, no Razorpay, no PhonePe, no real money movement. Balances are stored in PostgreSQL.

The project exists to demonstrate backend engineering concepts valued at companies like Juspay, Stripe, Razorpay, Uber, and Google:

| Concept | Implementation |
|---------|---------------|
| Distributed State Machine | 9-state transaction lifecycle with immutable history |
| Idempotency | UUID-keyed request deduplication with response caching |
| Ledger | Append-only double-entry bookkeeping |
| Retry Orchestration | BullMQ exponential backoff (1s → 2s → 4s → 8s → 16s) |
| Rollback Engine | Automatic compensation on credit failure |
| Fraud Detection | Rule-based scoring (0–100) |
| Chaos Engineering | Bank crash, latency, failure rate injection |
| Observability | Metrics API, TPS, latency, queue depth |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Vite)                      │
│  Dashboard │ Accounts │ Transfer │ Transactions │ Fraud       │
│  Chaos Panel │ Monitoring                                     │
└────────────────────────┬────────────────────────────────────┘
                         │ REST/JSON
┌────────────────────────▼────────────────────────────────────┐
│                   Express.js Backend                          │
│                                                               │
│  POST /api/transfer  ←── Core UPI Switch                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Idempotency → Fraud Check → State Machine           │    │
│  │  → Bank Debit → Ledger → Bank Credit → Ledger        │    │
│  │  → Retry (BullMQ) → Rollback (on exhaustion)         │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                               │
│  Modules:                                                     │
│  banks │ switch │ ledger │ idempotency │ fraud                │
│  retry │ recovery │ metrics │ admin                           │
└────────────┬──────────────────────┬────────────────────────-┘
             │                      │
  ┌──────────▼──────┐   ┌──────────▼─────────────────┐
  │   PostgreSQL     │   │   Redis + BullMQ            │
  │   (Prisma ORM)  │   │   Credit Retry Queue         │
  └─────────────────┘   └────────────────────────────-┘
```

### Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| `switch` | Main transfer orchestration. Calls all other modules. |
| `banks` | Simulated bank debit/credit with chaos injection |
| `ledger` | Append-only balance history |
| `idempotency` | Duplicate request prevention |
| `fraud` | Pre-transfer risk scoring |
| `retry` | BullMQ job scheduling |
| `recovery` | Rollback/refund on exhausted retries |
| `metrics` | Aggregate stats for monitoring |
| `admin` | Chaos controls |

---

## Database Design

### Schema Overview

```
Users ──────────────── Accounts ──────── Banks
  │                       │
  ├── sentTransactions     ├── LedgerEntries
  └── receivedTransactions │
                           │
Transactions ─────────────┤
  │                        ├── TransactionStateHistory (immutable)
  ├── LedgerEntries        ├── IdempotencyKeys
  ├── FraudReports         ├── RetryJobs
  └── RetryJobs            └── AuditLogs
```

### Key Tables

**Transactions** — Core entity tracking every transfer
- `idempotencyKey` (unique) — prevents duplicates
- `status` — current state in the state machine
- `fraudScore` — 0–100 risk score
- `retryCount` — number of retry attempts made

**TransactionStateHistory** — Immutable audit trail
- One row per state transition
- Never deleted, never updated
- Stores `fromState`, `toState`, `reason`, `metadata`

**LedgerEntries** — Append-only balance log
- One row per debit/credit
- Stores `balanceBefore` + `balanceAfter`
- Can reconstruct any account balance from scratch

**IdempotencyKeys** — Response cache
- Keyed by client-provided UUID
- Stores entire response snapshot
- Any repeat request returns cached response instantly

---

## State Machine

```
                    ┌─────────────┐
                    │  INITIATED  │ (transaction created)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │DEBIT_PENDING│ (calling sender bank)
                    └──────┬──────┘
                    fail ↙   ↘ success
              ┌──────┐    ┌──────────────┐
              │FAILED│    │DEBIT_SUCCESS │
              └──────┘    └──────┬───────┘
                                 │
                          ┌──────▼──────┐
                          │CREDIT_PENDING│ (calling receiver bank)
                          └──────┬───────┘
              fail ↙             │ success
      ┌────────────────┐  ┌──────▼──────────┐
      │RECOVERY_PENDING│  │ CREDIT_SUCCESS   │
      │ (retry queued) │  └──────┬───────────┘
      └───────┬────────┘         │
  retry   ↙   ↘ exhausted ┌──────▼────┐
CREDIT_PENDING  ↓          │  SUCCESS  │ (terminal ✅)
         ┌──────▼──────┐   └───────────┘
         │ROLLBACK_    │
         │INITIATED    │
         └──────┬──────┘
         fail ↙   ↘ success
       ┌──────┐  ┌────────────┐
       │FAILED│  │ROLLED_BACK │ (terminal ⚠️)
       └──────┘  └────────────┘
```

Every transition is:
1. Validated against allowed transitions
2. Written to `TransactionStateHistory` (immutable)
3. Logged with reason and metadata

---

## Ledger Design

The ledger implements **double-entry bookkeeping**:

```
Transfer: Sender → Receiver (₹5,000)

LedgerEntry 1:
  account:       sender_account_id
  type:          DEBIT
  amount:        5000
  balanceBefore: 50000
  balanceAfter:  45000

LedgerEntry 2:
  account:       receiver_account_id
  type:          CREDIT
  amount:        5000
  balanceBefore: 10000
  balanceAfter:  15000
```

On rollback, a reversal credit entry is created for the sender:

```
LedgerEntry 3 (reversal):
  account:       sender_account_id
  type:          CREDIT
  amount:        5000
  balanceBefore: 45000
  balanceAfter:  50000
  description:   "Refund for failed transaction <id>"
```

**Ledger invariants:**
- Never deleted
- Never updated
- Balance = sum of CREDITs - sum of DEBITs from ledger
- `balanceAfter` must equal next entry's `balanceBefore`

---

## Retry Strategy

When a credit operation fails, PayMesh uses exponential backoff:

```
Attempt 1 → delay 1s  → retry credit
Attempt 2 → delay 2s  → retry credit
Attempt 3 → delay 4s  → retry credit
Attempt 4 → delay 8s  → retry credit
Attempt 5 → delay 16s → retry credit
           ↓ (if still failing)
       ROLLBACK_INITIATED → ROLLED_BACK
```

Implementation:
- Jobs are queued in **BullMQ** (Redis-backed)
- Each job has `transactionId`, `attempt`, `retryJobId`
- `RetryJob` table tracks every attempt with status/error
- Worker has concurrency of 5 (configurable)
- On final failure, `recovery.service.js` executes the rollback

---

## Fraud Engine

Three rule-based checks, each contributing to a 0–100 score:

| Rule | Condition | Score Weight |
|------|-----------|-------------|
| `VELOCITY` | >5 transactions from sender in 30s | +40 |
| `LARGE_AMOUNT` | Amount > ₹50,000 | +35 |
| `RECIPIENT_SPREAD` | >3 unique recipients in 60s | +25 |

**Risk levels:**
- `NORMAL`: 0–39
- `SUSPICIOUS`: 40–69
- `HIGH_RISK`: 70–100

`HIGH_RISK` transactions are **blocked** and immediately marked `FAILED`. `SUSPICIOUS` transactions proceed but are flagged in `FraudReports`.

---

## Local Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- npm

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your DATABASE_URL and REDIS_URL

npx prisma migrate dev --name init
node prisma/seed.js     # Creates 3 banks + 50 users
npm run dev             # Starts on :3001
```

### Frontend

```bash
cd frontend
npm install
npm run dev             # Starts on :5173
```

Open: [http://localhost:5173](http://localhost:5173)  
API Docs: [http://localhost:3001/api/docs](http://localhost:3001/api/docs)

---

## Docker Setup

```bash
# From project root
docker compose up --build
```

Services:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Swagger Docs: http://localhost:3001/api/docs
- PostgreSQL: localhost:5432
- Redis: localhost:6379

The backend container automatically runs database sync and seeds 50 users and 3 banks on start.

---

## Automated Interview Demo Suite

PayMesh includes a standalone automated test suite (`backend/tests/demo-suite.test.js`) that runs all 6 core interviewer demos with live assertions against the switch:

```bash
cd backend
npm test
```

### What the test suite verifies:
1. **Happy Path & State Machine**: `INITIATED → DEBIT_PENDING → DEBIT_SUCCESS → CREDIT_PENDING → CREDIT_SUCCESS → SUCCESS`
2. **Distributed Idempotency**: Duplicate payment prevention without double-debiting
3. **Chaos & Automatic Rollback**: Bank outage simulation, compensating transaction refund, and recovery
4. **Retry Engine & Observability**: BullMQ queue health and real-time TPS/metrics aggregation
5. **Rule-Based Fraud Detection**: High-value anomaly and velocity spike scoring with audit reports
6. **Immutable Ledger Accounting**: Invariant mathematical verification across all double-entry ledger records

---

## Interactive UI Demo Walkthrough

The web dashboard is running at [http://localhost:5173](http://localhost:5173). Here is the guide to presenting each demo live:

### 1. Happy Path & Real-time State Machine (`/transfer`)
- Select a sender from Axis Bank and receiver from HDFC Bank.
- Enter an amount (e.g. `₹500`) and click **Send Transfer**.
- Watch the live state machine step through:
  `INITIATED → DEBIT_PENDING → DEBIT_SUCCESS → CREDIT_PENDING → CREDIT_SUCCESS → SUCCESS`.
- Inspect the timestamped audit log below the visual nodes.

### 2. Distributed Idempotency (`/transfer`)
- Submit a transfer with the pre-filled Idempotency Key.
- After success, click **Resend (Idempotency Test)** with the **exact same key**.
- The switch intercepts the replay and returns the cached snapshot without double-debiting the sender.
- A blue **⚡ Distributed Idempotency Hit** banner confirms duplicate protection.

### 3. Downstream Bank Outage & Compensating Rollback (`/chaos` & `/transfer`)
- Go to `/chaos` and click **Crash Bank** on HDFC Sim Bank (Bank B).
- Go to `/transfer` and attempt a transfer to a Bank B receiver.
- The debit succeeds, but credit fails due to the simulated 503 outage.
- State safely enters `RECOVERY_PENDING`.
- Click the **Trigger Rollback** button to initiate an immediate compensating refund transaction (`ROLLBACK_INITIATED → ROLLED_BACK`).
- Return to `/chaos` and click **Bring Online** to recover Bank B.

### 4. Asynchronous Retry Engine & Observability (`/monitoring`)
- Open `/monitoring` to view real-time system metrics (TPS, Avg Latency, Success Rate).
- Inspect the **Retry Queue (BullMQ)** live health bars (`Waiting`, `Active`, `Completed`, `Failed`, `Delayed`).
- View 24-hour transaction trends and bank health indicators.

### 5. Real-Time Rule-Based Fraud Detection (`/transfer` & `/fraud`)
- In `/transfer`, click **₹55,000 (Fraud Spike)** to exceed the ₹50,000 threshold.
- The transaction flags `LARGE_AMOUNT` with an elevated fraud score.
- Firing >5 rapid transfers triggers the `VELOCITY` rule and elevates the risk level to `SUSPICIOUS`.
- In `/fraud`, review the detailed fraud report with rule contributions.

### 6. Immutable Double-Entry Ledger (`/accounts` & `/transactions`)
- In `/accounts`, click the **Ledger** button on any account row.
- The **Immutable Account Ledger Modal** displays every historical `DEBIT` and `CREDIT` entry.
- Demonstrates the accounting invariant: `Balance Before ± Amount ≡ Balance After`.
- In `/transactions`, click **Inspect** on any transaction to view its full lifecycle audit log.

---

## API Reference

Full interactive Swagger docs available at [http://localhost:3001/api/docs](http://localhost:3001/api/docs).

### Core Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/transfer` | Initiate UPI transfer |
| `GET` | `/api/transfer/:id` | Get transaction with state history |
| `POST` | `/api/transfer/:id/rollback` | Execute compensating rollback/refund |
| `GET` | `/api/transactions` | List transactions (paginated, filterable) |
| `GET` | `/api/accounts` | List accounts with search |
| `GET` | `/api/accounts/:id/ledger` | Get immutable double-entry ledger entries |
| `GET` | `/api/accounts/:id/balance` | Get real-time account balance |
| `GET` | `/api/fraud/reports` | Paginated fraud reports |
| `GET` | `/api/metrics` | System metrics & BullMQ queue health |
| `GET` | `/api/health` | Health check endpoint |

### Admin / Chaos Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/crash-bank-a` | Take Bank A offline (HTTP 503) |
| `POST` | `/api/admin/crash-bank-b` | Take Bank B offline (HTTP 503) |
| `POST` | `/api/admin/crash-bank-c` | Take Bank C offline (HTTP 503) |
| `POST` | `/api/admin/recover/:bankCode` | Bring bank back online |
| `POST` | `/api/admin/add-delay` | Inject artificial network latency |
| `POST` | `/api/admin/set-failure-rate` | Set simulated failure probability (0.0–1.0) |
| `POST` | `/api/admin/reset-chaos` | Reset all banks to normal operation |
| `GET` | `/api/admin/banks/status` | Current status of all banks |


### Transfer Request

```json
POST /api/transfer
{
  "senderId": "uuid",
  "receiverId": "uuid",
  "amount": 5000,
  "idempotencyKey": "unique-client-key-uuid"
}
```

---

## Simulated Banks

| Bank | Code | Default Latency | Default Failure Rate |
|------|------|----------------|---------------------|
| Axis Virtual Bank | `BANK_A` | 80ms | 5% |
| HDFC Sim Bank | `BANK_B` | 120ms | 8% |
| SBI Sim Bank | `BANK_C` | 200ms | 12% |

---

## Future Improvements

| Feature | Description |
|---------|-------------|
| WebSocket streaming | Real-time state transitions pushed to frontend |
| Multi-hop routing | Route through multiple banks based on least-cost path |
| Settlement engine | End-of-day batch settlement between banks |
| Rate limiting | Per-sender TPS limits enforced at switch layer |
| Dead letter queue | Failed retry jobs requiring manual intervention |
| Webhook delivery | Push transaction status to external URLs |
| Account-level reconciliation | Automated ledger vs balance audits |
| mTLS between services | Mutual TLS simulation for bank API calls |
| Prometheus metrics | Export to Grafana dashboard |
| Event sourcing | Rebuild transaction state from event log |

---

## Project Structure

```
PayMesh/
├── docker-compose.yml
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # Database schema
│   │   └── seed.js             # 50 users + 3 banks
│   ├── tests/
│   │   └── demo-suite.test.js  # 6 automated interview demo tests
│   └── src/
│       ├── app.js              # Express app
│       ├── server.js           # Entry point + graceful shutdown
│       ├── config/             # DB, Redis, logger, env
│       ├── routes/             # All API routes
│       ├── controllers/        # HTTP handlers
│       ├── middlewares/        # Error handler, request logger
│       ├── modules/
│       │   ├── banks/          # Virtual bank debit/credit
│       │   ├── switch/         # Core UPI transfer orchestration
│       │   ├── transactions/   # State machine
│       │   ├── ledger/         # Append-only bookkeeping
│       │   ├── idempotency/    # Duplicate prevention
│       │   ├── retry/          # BullMQ job scheduling
│       │   ├── recovery/       # Rollback engine
│       │   ├── fraud/          # Rule-based scoring
│       │   ├── metrics/        # Observability
│       │   └── admin/          # Chaos engineering
│       ├── jobs/               # BullMQ processor
│       ├── utils/              # Errors, audit logger
│       └── docs/               # Swagger spec
└── frontend/
    └── src/
        ├── pages/              # 7 dashboard pages
        ├── components/         # Sidebar, Toast, shared UI
        ├── lib/                # API client, constants
        └── store/              # Zustand state
```

---

*Built to demonstrate production-grade backend engineering concepts for high-scale payment infrastructure interviews.*
