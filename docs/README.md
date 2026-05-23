# Helia Court Docs

This directory is also the standalone docs app for `docs.heliacourt.xyz`.

Run it locally with:

```bash
pnpm dev:docs
```

Deployment notes live in `DEPLOYMENT.md`.

Current implementation docs:

- `court-engine-architecture.md`: target architecture for the AI court engine.
- `production-intelligence-stack.md`: Railway/Vercel/backend deployment split and evidence tooling.

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

Still missing before the full product flow is complete:

- Deploy/upgrade the production CaseEscrow proxy to the implementation that includes `addFunding`.
- External agent-builder registration and third-party payout claiming.
- Normalized market metadata cache for richer case cards and historical odds.
