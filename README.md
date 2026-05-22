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

## Run

```bash
pnpm install
pnpm dev:app
pnpm dev:backend
```

## Build

```bash
pnpm build
```

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
- Generated hearing logs live under `backend/tmp/` and are ignored by git.
- Local OSS research clones live under `research/open-source/` and are ignored by git.

## Docs

Start with [docs/README.md](docs/README.md).

Current architecture:

- [docs/court-engine-architecture.md](docs/court-engine-architecture.md)
- [docs/production-intelligence-stack.md](docs/production-intelligence-stack.md)
- [backend/AGENT_TOOLS.md](backend/AGENT_TOOLS.md)

Older planning docs are archived under [docs/archive](docs/archive).
