# Helia Court App

Primary product app for case filing, wallet flows, hearings, receipts, profiles, and x402 paid reads.

## Source Layout

```text
src/app/
  api/          Next API proxy routes to the backend
  agents/       Agent roster and detail pages
  cases/        Case browse, detail, and filing pages
  components/
    cases/      Case filing, case detail, transcript, and private unlock UI
    layout/     App shell, header/footer, page title, motion helpers
    markets/    Prediction-market logos, previews, and filing entry form
    profile/    Wallet profile/account UI
    wallet/     Wallet connection, balances, Gateway, and wallet notices
    x402/       Browser x402 paid-read playground
  ledger/       Receipt and settlement ledger page
  proof/        Public proof page
  x402/         x402 explainer and playground page
src/lib/
  arc.ts        Arc testnet chain and wallet config
  backend-data.ts  App-facing backend fetchers and response shaping
  backend-url.ts   Shared backend origin resolver
  backend-proxy.ts Shared Next API proxy helper for backend routes
  contracts.ts Contract addresses and ABI fragments
  fixtures/     Preview/demo fallback data kept away from live API code
  market-images.ts Market metadata, Open Graph, and image adapters
```

## Commands

```bash
pnpm --dir app dev
pnpm --dir app build
pnpm --dir app lint
```
