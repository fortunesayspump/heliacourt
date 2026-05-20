# Helia Court Agent Tools

The court engine is free-first. It should run with no paid provider keys, then get stronger as keys are added.

## Free by default

- Prediction markets: Polymarket Gamma, Manifold, public Kalshi endpoints when available.
- Market data: CoinGecko and public quote fallbacks.
- News/search/reference: GDELT, Wikipedia, Crossref, Hacker News.
- Weather/calendar: Open-Meteo, Nager.Date.
- Sports: TheSportsDB test key.
- Scraping: static HTML fetch plus Readability and Cheerio extraction.

## Optional upgrades

- `OPENROUTER_API_KEY`: model-backed courtroom turns.
- `BRAVE_SEARCH_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `SERPAPI_API_KEY`: stronger web search coverage.
- `BROWSERLESS_WS_ENDPOINT` or `PLAYWRIGHT_WS_ENDPOINT`: render JavaScript-heavy pages for Aletheia.
- `FIRECRAWL_API_KEY`: fallback page extraction when static/browser extraction is not enough.
- `ETHERSCAN_API_KEY`: better EVM source coverage.
- `ALPHA_VANTAGE_API_KEY`: equity and macro quote support.
- `THE_ODDS_API_KEY`: sports-market odds.

## Smoke tests

From the repo root:

```sh
pnpm --dir backend agents:smoke
```

This prints provider readiness and runs a tool-only configurable market test across Aletheia, Pythia, Hermes, Notus, Skepsis, Chronos, Sophia, and Numeros. Override the default fixture with `HELIA_SMOKE_QUESTION`, `HELIA_SMOKE_CONTEXT`, and `HELIA_SMOKE_LINKS`.

For a full hearing log, pass a case through the backend hearing runner:

```sh
HELIA_HEARING_CASE_JSON='{"question":"Will the referenced prediction market resolve Yes by its deadline?","type":"prediction-market"}' pnpm --dir backend hearing
```

The hearing log is written to `backend/tmp/hearings/*`.

## Aletheia scraping behavior

Aletheia uses the following ladder:

1. Static fetch, Readability article extraction, Cheerio metadata/body fallback.
2. Browser-rendered extraction when `BROWSERLESS_WS_ENDPOINT` or `PLAYWRIGHT_WS_ENDPOINT` exists.
3. Firecrawl extraction when `FIRECRAWL_API_KEY` exists.

If a page returns empty or irrelevant static text, the witness must say that exact limitation. It should not infer facts, historical patterns, or future outcomes from a failed scrape.

## Expanded witness bench

- Skepsis: grades source authority, freshness, directness, and conflicts from search/scrape evidence.
- Chronos: builds chronology from source dates, event timing, horizons, and calendar evidence.
- Sophia: synthesizes broad research while separating direct proof from background context.
- Numeros: checks prediction-market and market-data numerical constraints.
