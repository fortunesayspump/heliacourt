# Helia Court

Helia Court is a multi-agent forecasting court for prediction-market questions, built as a full-stack Arc starter kit.

Use it as a reference for apps where users fund work with USDC, background agents perform asynchronous tasks, and the product leaves behind proof, transcripts, x402 paid reads, and onchain receipt records.

## What You Can Fork

This repository is intentionally organized as a complete product template, not a tiny code sample:

- **Prediction-market court**: paste a Polymarket, Kalshi, or Manifold URL and open a funded case.
- **Escrow-funded agent work**: Arc testnet USDC funds a case before the hearing worker runs.
- **Async worker flow**: the web API queues hearings; a separate worker processes them safely.
- **x402 paid reads**: external agents can pay for proof, transcript, receipt, and price JSON.
- **Circle Gateway lane**: small paid reads are separate from case escrow capital.
- **Telegram opt-in alerts**: users can link chat accounts to wallet accounts.
- **Proof and ledger surfaces**: receipts, hashes, verdicts, and paid reads stay inspectable.

## Why Arc

Helia Court treats agents as paid intelligence workers. Agents need budgets, paid signals, receipts, and settlement records. Arc and Circle infrastructure give the product a stable USDC layer for escrow, metered reads, agent accounting, and audit trails.

## Stack

- Next.js, React, TypeScript
- Fastify backend API and hearing worker
- pnpm package manager
- wagmi, viem, TanStack Query
- Arc Testnet chain config
- Circle Gateway, x402, Arc USDC escrow, and receipt records
- Foundry contracts for escrow, receipts, and agent registry
- Postgres persistence for cases, users, transcripts, artifacts, receipts, and x402 activity

## Repository Map

```text
app/        Product app, wallet flows, case filing, case pages, x402 playground
marketing/ Public site and product story
docs/       Static documentation site
backend/   Fastify API, hearing worker, agents, Telegram, x402, persistence
contracts/ Foundry contracts for Arc escrow, receipts, and agent registry
```

## Start Here

1. Read the starter guide: [STARTER_KIT.md](STARTER_KIT.md)
2. Install dependencies:

```bash
pnpm install
git submodule update --init --recursive
```

3. Configure local environment variables in ignored `.env` / `.env.local` files.
4. Run the app and backend in separate terminals:

```bash
pnpm dev:backend
pnpm dev:app
```

5. Optional surfaces:

```bash
pnpm dev:marketing
pnpm dev:docs
```

OpenZeppelin Solidity dependencies are installed through pnpm in the contracts package. Only `forge-std` is kept as a Foundry submodule.

## Common Commands

```bash
pnpm dev:app
pnpm dev:backend
pnpm dev:marketing
pnpm dev:docs
pnpm build
pnpm check
```

Package-level builds are also available:

```bash
pnpm build:app
pnpm build:marketing
pnpm build:docs
pnpm build:backend
pnpm build:contracts
```

Production backend processes are split by role:

```bash
pnpm start:web      # HTTP API only
pnpm start:worker   # hearing worker only
```

## Configuration

Local and production configuration is provided through `.env` / `.env.local` files and deployment platform secrets. These files are intentionally ignored by git. This repo does not include committed env examples because deployment secrets and contract addresses are environment-specific.

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

## Template Customization Points

Start by changing these areas for your own Arc agent app:

- `contracts/src/`: escrow, receipts, and agent registry primitives.
- `backend/src/agents/`: agent roster, prompts, tools, hearings, and verdict logic.
- `backend/src/routes/x402.ts`: paid resource definitions and proof payloads.
- `backend/src/integrations/telegram.ts`: bot commands and notification flows.
- `app/src/app/components/`: wallet, filing, ledger, proof, profile, and x402 UI.
- `app/public/.well-known/`: ERC-8004, MCP, and agent discovery metadata.
- `marketing/`: public story, screenshots, Telegram entry, and protocol pages.

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
- Settlement retry is a privileged backend action.
- Generated hearing logs live under ignored local runtime folders and are never committed.
- Local reference research lives under `research/` and is ignored by git.

## Docs

Start with:

- [STARTER_KIT.md](STARTER_KIT.md)
- [docs/README.md](docs/README.md)

Current architecture:

- [docs/reference/court-engine-architecture.md](docs/reference/court-engine-architecture.md)
- [docs/reference/production-intelligence-stack.md](docs/reference/production-intelligence-stack.md)
- [backend/AGENT_TOOLS.md](backend/AGENT_TOOLS.md)

## License

Helia Court is open source under the [MIT License](LICENSE). See [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow and repo hygiene rules.
