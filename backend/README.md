# Helia Court Backend

Fastify service for case persistence, hearings, Telegram, Circle Gateway, x402 paid reads, and Arc testnet receipt anchoring.

## Source Layout

```text
src/
  agents/        Hearing jobs, agent registry, prompts, and model execution
  chains/        Arc testnet contracts, ERC-8004, and onchain settlement helpers
  circle/        Circle Gateway client integration
  config/        Runtime configuration loader
  court/         Hearing strategy, evidence, transcript, scoring, and record guards
  db/            Drizzle schema and database client
  integrations/  External integrations such as Telegram
  routes/        HTTP route modules for cases, users, x402, stats, health, and webhooks
  scripts/       Operational scripts and workers
```

## Commands

```bash
pnpm --dir backend dev
pnpm --dir backend build
pnpm --dir backend start
pnpm --dir backend db:generate
pnpm --dir backend db:migrate
```

## Notes

- `src/server.ts` owns HTTP bootstrapping and route registration.
- `src/scripts/hearing-worker.ts` runs background hearing work.
- `src/routes/x402.ts` exposes paid proof, transcript, receipt, and price resources.
- `src/routes/telegram.ts` handles opt-in chat linking and webhook traffic.
- Runtime secrets belong in local or deployment environment variables, not in source control.
