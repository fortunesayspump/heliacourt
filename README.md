# Helia Court

Helia Court is a multi-agent forecasting court for prediction-market questions.

The product is powered by **Heliaia**, a court engine where AI counsel argue both sides of a market question, expert witnesses submit evidence, a risk officer constrains exposure, and a head judge issues an auditable verdict before capital moves.

## Why Arc

Helia Court treats agents as paid intelligence workers. Agents need budgets, paid signals, receipts, and settlement records. Arc and Circle infrastructure give the product a stable USDC layer for agent payments, court records, CCTP movement, and verdict receipts.

## Stack

- Next.js, React, TypeScript
- Fastify backend worker for hearings, evidence tools, and agent orchestration
- pnpm package manager
- wagmi, viem, TanStack Query
- Arc Testnet chain config
- Circle/Arc integration points for Wallets, CCTP, Nanopayments, USDC settlement, and receipt records

## Repository Map

```text
app/        Product app, wallet flows, case filing, case pages, x402 playground
marketing/ Public site and product story
docs/       Static documentation site
backend/   Fastify API, hearing worker, agents, Telegram, x402, persistence
contracts/ Foundry contracts for Arc escrow, receipts, and agent registry
```

## Setup

Install JavaScript dependencies and contract submodules:

```bash
pnpm install
git submodule update --init --recursive
```

OpenZeppelin Solidity dependencies are installed through pnpm in the contracts package. Only `forge-std` is kept as a Foundry submodule.

Run services:

```bash
pnpm dev:app
pnpm dev:backend
```

## Build

```bash
pnpm build
```

Package-level builds are also available:

```bash
pnpm build:app
pnpm build:marketing
pnpm build:docs
pnpm build:backend
pnpm build:contracts
```

Before committing, run the full local check:

```bash
pnpm check
```

## Configuration

Local and production configuration is provided through `.env` / `.env.local` files and deployment platform secrets. These files are intentionally ignored by git.

Common frontend variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_REOWN_PROJECT_ID`
- `NEXT_PUBLIC_ARC_RPC_URL`
- `NEXT_PUBLIC_CASE_ESCROW_ADDRESS`
- `NEXT_PUBLIC_COURT_RECEIPTS_ADDRESS`
- `NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_TELEGRAM_BOT_URL`

Common backend variables:

- `DATABASE_URL`
- `REDIS_URL`
- `APP_ORIGIN`
- `HELIA_PUBLIC_APP_URL`
- `ARC_RPC_URL`
- `PRIVATE_KEY`
- `SETTLEMENT_PRIVATE_KEY`
- `CASE_ESCROW_ADDRESS`
- `COURT_RECEIPTS_ADDRESS`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `HELIA_X402_RECEIVER_ADDRESS`
- `HELIA_X402_FACILITATOR_URL`
- `HELIA_X402_SIGNING_SECRET`

## Product Pieces

- **Helia Court**: the product users see.
- **Heliaia**: the internal multi-agent court engine.
- **Counsel**: agents arguing bullish and bearish cases.
- **Witnesses**: agents gathering market data, news, social, and prediction-market evidence.
- **Risk Bailiff**: policy agent checking confidence, evidence quality, budget limits, and uncertainty.
- **Head Judge**: agent that issues the verdict, confidence, and dissent.
- **Court Record**: onchain/offchain log of evidence, payments, verdicts, and settlement receipts.

## Current Architecture

- The frontend is UI and API proxy only.
- The backend owns the court engine, agents, witnesses, tools, memory, hearing jobs, and logs.
- Railway Postgres is the production database; set `DATABASE_URL` and run `pnpm --dir backend db:migrate`.
- Case filing is contract-backed: the backend verifies the Arc `CaseOpened` event before queueing a hearing.
- Settlement retry is a privileged backend action; set `HELIA_ADMIN_KEY` before using the retry route.
- Generated hearing logs live under ignored local runtime folders and are never committed.
- Local OSS research clones live under `research/open-source/` and are ignored by git.

## Docs

Start with [docs/README.md](docs/README.md).

Current architecture:

- [docs/reference/court-engine-architecture.md](docs/reference/court-engine-architecture.md)
- [docs/reference/production-intelligence-stack.md](docs/reference/production-intelligence-stack.md)
- [backend/AGENT_TOOLS.md](backend/AGENT_TOOLS.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The repo is MIT licensed; keep generated files, logs, local screenshots, and secrets out of commits.
