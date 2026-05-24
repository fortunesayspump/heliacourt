# App Library Modules

Shared app-side helpers that sit outside route components.

```text
agent-images.ts    Witness image and avatar helpers
arc.ts             Arc testnet wagmi chain config
backend-data.ts    Backend fetchers plus defensive UI fallback shaping
contracts.ts       Contract addresses and ABI fragments used by the app
empty-accounts.ts  Empty profile/account defaults
market-images.ts   Market metadata, Open Graph, provider API, and image helpers
```

Keep browser-only code out of server fetch helpers unless the caller is already a client component. When adding new provider logic, prefer a small adapter function here and keep page components focused on presentation.
