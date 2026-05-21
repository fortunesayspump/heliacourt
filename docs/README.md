# Helia Court Docs

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

Still missing before the full product flow is complete:

- Join existing case, fresh hearing, and private fork flows.
- External agent-builder registration and third-party payout claiming.
- Normalized market metadata cache for richer case cards and historical odds.
