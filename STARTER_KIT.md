# Helia Court Starter Kit

This guide is for builders using Helia Court as a GitHub template or reference repo.

Helia Court is a full product, but the reusable pattern is simple:

```text
wallet connects
user funds escrow
backend verifies onchain event
worker runs paid agent job
agents produce transcript, artifacts, and verdict
app records receipts
external clients can pay for structured proof through x402
```

## What This Template Gives You

- A Next.js app with wallet connection, case filing, proof pages, profile pages, ledger views, and an x402 playground.
- A Fastify backend with Postgres persistence, case APIs, user APIs, Telegram linking, x402 resources, and hearing jobs.
- A separate hearing worker so long-running agent work does not block the HTTP service.
- Foundry contracts for Arc testnet case escrow, court receipts, and agent registry.
- A marketing site and docs site that can be deployed separately.
- Well-known metadata files for agent/service discovery.

## Package Layout

```text
app/        Main user-facing app
backend/   API, database, agents, Telegram, x402, worker
contracts/ Solidity contracts and deployment scripts
docs/       Static docs site
marketing/ Public marketing site
```

## First Local Run

Install dependencies:

```bash
pnpm install
git submodule update --init --recursive
```

Create local environment files in the packages you run. They are ignored by git.

Run the backend:

```bash
pnpm dev:backend
```

Run the app:

```bash
pnpm dev:app
```

Optional:

```bash
pnpm dev:marketing
pnpm dev:docs
```

## Configuration Checklist

Frontend:

- App URL and backend URL.
- Reown project id.
- Arc RPC URL.
- Deployed contract addresses.
- Telegram bot URL, if Telegram is enabled.

Backend:

- Postgres database URL.
- Optional Redis URL for queue coordination.
- App origin and public app URL.
- Arc RPC URL.
- Backend wallet private key for chain reads/writes.
- Settlement private key for receipt/settlement operations.
- Contract addresses.
- Telegram bot token and webhook secret.
- x402 receiver address, facilitator URL, and signing secret.
- Model/provider keys for the agent court.

Contracts:

- Arc RPC URL.
- Deployment wallet private key.
- Arc testnet USDC address.
- Owner, signer, and payout wallets.

## Deployment Shape

Use separate services for long-running work:

```text
app service        Next.js app
backend web        Fastify HTTP API, no hearing worker
backend worker     hearing worker only
marketing site     static product site
docs site          static docs site
postgres           shared database
redis              optional queue/concurrency coordination
```

Recommended backend commands:

```bash
pnpm start:web
pnpm start:worker
```

For the web service, disable in-process hearing work with environment configuration. Let the worker service own hearing execution and scale it intentionally.

## What To Customize First

For a new agentic Arc app, start here:

1. `contracts/src/CaseEscrow.sol`
   Change the escrow lifecycle and allowed settlement actions.

2. `contracts/src/CourtReceipts.sol`
   Change receipt event names, receipt payload expectations, and audit semantics.

3. `backend/src/agents/registry.ts`
   Define your agents, tools, roles, pricing, and metadata.

4. `backend/src/agents/prompts.ts`
   Rewrite the court/agent behavior for your domain.

5. `backend/src/agents/tools/providers/`
   Add or remove data providers used by your agents.

6. `backend/src/routes/x402.ts`
   Define which resources external agents can pay to read.

7. `app/src/app/components/`
   Adapt the UI from court/case language to your product language.

8. `app/public/.well-known/`
   Update agent/service metadata before deploying publicly.

9. `marketing/`
   Replace the product story, screenshots, links, and Telegram entry points.

## What To Keep

Keep these boundaries if you want the repo to stay understandable:

- Frontend owns user flows and display state.
- Backend owns persistence, verification, and agent execution.
- Worker owns long-running hearings.
- Contracts own escrow and immutable receipt primitives.
- x402 owns paid information reads, not case capital.
- Gateway balance and escrow balance are separate payment lanes.

## Beginner Notes

- Do not run hearings inside the web service in production if hearings can take a long time.
- Do not use one wallet/private key for every responsibility in production.
- Do not expose private or unlisted cases through x402 reads.
- Do not treat frontend state as proof of payment; verify onchain events in the backend.
- Do not commit env files, generated logs, local videos, screenshots, research clones, or build outputs.

## Quality Checks

Run app lint and build:

```bash
pnpm --dir app lint
pnpm --dir app build
```

Run backend build:

```bash
pnpm --dir backend build
```

Run contract checks when Foundry is installed:

```bash
pnpm --dir contracts build
pnpm --dir contracts test
```

Full workspace check:

```bash
pnpm check
```

## Template Philosophy

Helia Court is not only a demo of a transaction. It is a reference for a complete agentic commerce loop:

```text
pay -> queue work -> run agents -> produce proof -> meter reads -> record receipts
```

That loop is useful for research agents, paid data APIs, arbitration systems, prediction-market tooling, AI audit logs, and other products where users need proof that paid agent work actually happened.
