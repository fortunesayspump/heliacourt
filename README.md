# Agora Court

Agora Court is a multi-agent market tribunal for the Agora Agent Hackathon.

The product is powered by **Heliaia**, a court engine where AI counsel argue both sides of a market question, expert witnesses submit evidence, a risk officer constrains exposure, and a head judge issues an auditable verdict before capital moves.

## Why Arc

Agora Court treats agents as paid intelligence workers. Agents need budgets, paid signals, receipts, and settlement records. Arc and Circle infrastructure give the product a stable USDC layer for agent payments, court records, CCTP movement, and verdict receipts.

## Stack

- Vite, React, TypeScript
- pnpm package manager
- wagmi, viem, TanStack Query
- Arc Testnet chain config
- Circle/Arc placeholders for Wallets, CCTP, Nanopayments, USDC settlement, and ERC-8183 job flows

## Run

```bash
pnpm install
pnpm dev
```

## Build

```bash
pnpm build
```

## Product Pieces

- **Agora Court**: the product users see.
- **Heliaia**: the internal multi-agent court engine.
- **Counsel**: agents arguing bullish and bearish cases.
- **Witnesses**: agents gathering market data, news, social, and prediction-market evidence.
- **Risk Bailiff**: policy agent checking confidence, evidence quality, budget limits, and uncertainty.
- **Head Judge**: agent that issues the verdict, confidence, and dissent.
- **Court Record**: onchain/offchain log of evidence, payments, verdicts, and settlement receipts.

## Next Build Steps

- Add a case intake form for market questions.
- Generate a simulated hearing from the selected question.
- Add verdict history and agent reputation.
- Wire Circle Wallets and Nanopayments once API credentials and exact flow are chosen.

See [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md) for the full product structure, agent model, and build sequence.

See [docs/MVP_FLOW.md](docs/MVP_FLOW.md) for the end-to-end MVP user flow, case lifecycle, agent coordination model, visibility rules, and payment/registry plan.

See [docs/USER_FLOW.md](docs/USER_FLOW.md) for the product-level user journey, wallet gates, duplicate-case routing, page map, and MVP UX states.

See [docs/PROTOCOL_MODEL.md](docs/PROTOCOL_MODEL.md) for how users, markets, Arc, onchain records, and protocol revenue fit together.

See [docs/AGENT_ARCHITECTURE.md](docs/AGENT_ARCHITECTURE.md) for the agent roster, hosting phases, plugin model, and registry design.
