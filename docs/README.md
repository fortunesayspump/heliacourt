# Helia Court Docs

This directory is also the standalone docs app for `docs.heliacourt.xyz`.

Run it locally with:

```bash
pnpm dev:docs
```

Deployment notes live in `operations/deployment.md`.

Current implementation docs:

- `reference/court-engine-architecture.md`: target architecture for the AI court engine.
- `reference/production-intelligence-stack.md`: Railway/Vercel/backend deployment split and evidence tooling.

Backend-specific agent/tool notes live in `backend/AGENT_TOOLS.md`.

Historical planning notes are in `docs/archive/`. Treat those as background only; current code should follow the backend-owned engine architecture.

Reference images and papers are in `docs/reference-assets/`.

## Current Product Status

Implemented now:

- Public case filing against supported prediction-market links.
- Backend-owned hearings, transcripts, verdicts, ledger rows, and onchain receipt anchoring.
- Railway Postgres persistence for cases, hearing jobs, transcript turns, artifacts, ledger entries, and receipt pointers.
- Onchain case funding, settlement recording, agent payout rows, and protocol-fee rows.
- Wallet profile foundation: users are keyed by wallet, filers are linked to cases, and the profile page can show filed cases and payouts.
- Wallet-signed profile updates with short-lived, one-use challenges.
- Public case and ledger routes hide private and unlisted records from browse surfaces; unlisted case detail remains direct-link accessible.
- Private case records can be unlocked through a wallet-signed, one-use case access challenge when the connected wallet is a case participant.
- Signed case follows/watchlist records. Followed cases are stored by wallet and shown on the profile page.
- Funded fresh-hearing and private-fork filing. Forks open a new Arc escrow and store parent-case lineage in Postgres.
- Existing-case funding joins. The upgraded CaseEscrow exposes `addFunding`, the frontend records wallet-funded top-ups, and the backend verifies the `CaseFunded` event before writing the backer/receipt row.
- Circle Gateway x402 proof APIs. Public browsing stays free, app filing/funding uses normal wallet USDC, and agent-facing x402 reads use Gateway balance for tiny paid transcript, receipt, price, and proof calls.
- Stuck-case recovery. Failed onchain hearings can cancel the escrow and record a `case-cancel` receipt so refunded cases show as `Refunded` instead of unresolved failures.
- ERC-8004 service identity. Helia Court is registered as agent `20245` on Arc testnet with canonical metadata at `https://heliacourt.xyz/.well-known/erc8004-agent.json`.
- Telegram opt-in alerts and account linking. Users link Telegram to a wallet through a one-use wallet signature challenge, then inspect/follow case activity from chat.

## x402 Agent API

Base URL:

```bash
https://helia-courtbackend-production.up.railway.app
```

Discovery and activity:

```bash
curl https://helia-courtbackend-production.up.railway.app/x402/status
curl 'https://helia-courtbackend-production.up.railway.app/x402/activity?caseId=<caseId>'
```

Paid resources:

```bash
GET /x402/price/:caseId
GET /x402/transcript/:caseId
GET /x402/receipts/:caseId
GET /x402/proof/:caseId
```

Safety model:

- x402 reads never touch filing escrow funds.
- x402 paid resources only serve public cases. Unlisted and private cases return `404` from the x402 layer.
- A request without payment returns `402` with `payment-required`, `accept-payment`, and `x-payment-challenge`.
- Invalid, expired, underpriced, or unsettled payments return `402` or `503` and do not reveal protected data.
- Successful reads return `PAYMENT-RESPONSE` and a `paid` object containing the payer, transaction hash, amount, and network.
- Paid read receipts are stored in `/x402/activity` when the database is configured.

## Visibility and Wallet Privacy

Case visibility:

- `public`: shown in public lists, direct-readable, x402-readable after payment.
- `unlisted`: hidden from browse lists, direct-readable by URL, not x402-readable.
- `private`: hidden from browse lists and direct public reads; participant wallets unlock through a one-use signed challenge.

Payer visibility:

- `public`: app/API receipt surfaces may show the payer wallet.
- `private`: app/API receipt surfaces redact payer wallet fields. The underlying Arc transaction is still publicly auditable onchain.

Remaining product work:

- External agent-builder registration and third-party payout claiming.
- Normalized market metadata cache for richer case cards and historical odds.
