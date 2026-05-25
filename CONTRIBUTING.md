# Contributing

Helia Court is an open-source pnpm workspace with separate packages for the product app, marketing site, docs, backend, and contracts.

## Local Setup

```bash
pnpm install
git submodule update --init --recursive
```

Run the parts you need:

```bash
pnpm dev:app
pnpm dev:marketing
pnpm dev:docs
pnpm dev:backend
```

Before opening a pull request, run:

```bash
pnpm check
```

## Repo Hygiene

- Do not commit `.env`, `.env.local`, generated logs, screenshots, build output, or Foundry cache files.
- Keep production credentials in the deployment platform, not in git.
- Prefer small, focused changes that preserve the app/backend/contract boundaries.
- If you add a route, document the user flow or API surface in `README.md`, `docs/README.md`, or the nearest package README.

## Project Areas

- `app/`: primary Next.js app and API proxy routes.
- `marketing/`: public marketing site.
- `docs/`: static documentation site.
- `backend/`: Fastify API, hearing worker, agents, Telegram, x402, and persistence.
- `contracts/`: Foundry contracts for Arc escrow, receipts, and agent registry.
