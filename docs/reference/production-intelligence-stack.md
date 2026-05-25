# Production intelligence stack

Helia Court should split light app work from heavy evidence work.

## Recommended deployment

- **Vercel**: Next.js UI, wallet flows, regular API routes, case pages.
- **Railway**: `backend`, long-running court/hearing jobs, rendered scraping, local Chrome screenshots, OCR, crawler services, optional SearXNG.
- **Railway Postgres**: durable source for cases, hearing jobs, transcript turns, artifacts, tool evidence, verdicts, settlement rows, and onchain receipt pointers.
- **Queue**: Postgres-backed hearing jobs for the MVP. Redis can be added later for higher-throughput job locking, rate limits, and cache-heavy work.

## Current Production Shape

The app is now a hybrid DB/onchain system:

- Postgres is the operational source of truth for case records, transcript turns, profiles, participants, ledger rows, and receipt pointers.
- Arc testnet contracts hold economic proof: case escrow, case close, verdict receipts, and settlement receipts.
- First-party agents are protocol-owned for the MVP. Their payout rows are recorded per agent in the ledger and receipt payloads.
- Users are stored by wallet address. A filer is linked to each case through `case_participants`.
- Profile writes are protected by short-lived wallet-signature challenges.
- Browse routes only expose public cases. Unlisted cases are excluded from case/ledger lists but remain open by direct link. Private cases are hidden from public case detail routes.
- Private owner reads use one-use wallet-signature challenges and require the wallet to be recorded in `case_participants`.
- Case follows are wallet-owned records in `case_follows`, written through signed one-use challenges and surfaced in the profile watchlist.
- Fresh hearings and private forks use the same onchain filing path as original cases, then store `parent_case_id` and `filing_kind` on the backend record.
- Existing-case funding joins call `CaseEscrow.addFunding`, then the backend verifies the emitted `CaseFunded` event before writing a `backer` participant and `case-added-funding` receipt.
- x402 paid API reads use Circle Gateway on Arc testnet. This is separate from case escrow: filing and join-funding spend normal wallet USDC, while x402 callers need Gateway balance for low-value bot/API reads.

The remaining production gaps are deploying the upgraded escrow implementation and adding a stronger session layer if the app needs repeated authenticated reads without signing each action.

## Why split it

Vercel is great for the product surface, but browser rendering and OCR can exceed serverless limits. Railway is better for workers because it can run Chrome, hold longer processes, and keep optional services warm.

## Free/default evidence path

- Static scraping: `fetch` + Readability + Cheerio.
- Search discovery: DuckDuckGo/Bing HTML fallbacks.
- Rendered scraping: Playwright Core + local Chrome on the worker.
- Screenshots: Playwright Core + local Chrome on the worker.
- OCR: Tesseract.js.
- Optional vision: OpenRouter vision model when `OPENROUTER_API_KEY` is configured.

## Optional production services

- `SEARXNG_BASE_URL`: self-host SearXNG on Railway for stronger no-key search discovery.
- `BROWSERLESS_WS_ENDPOINT` / `PLAYWRIGHT_WS_ENDPOINT`: use a remote browser service if local Chrome becomes too heavy.
- `FIRECRAWL_API_KEY` / `FIRECRAWL_API_URL`: hosted or self-hosted Firecrawl fallback for difficult pages.

## Environment notes

On Vercel, do not rely on `HELIA_CHROME_EXECUTABLE_PATH`. Route heavy extraction to the Railway worker instead.

On Railway, install Chrome or use a base image with Chrome available, then set:

```env
DATABASE_URL=postgres://user:password@host:port/db
HELIA_CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome
HELIA_OCR_CACHE_PATH=/tmp/helia-court-ocr-cache
SEARXNG_BASE_URL=https://your-searxng-service.up.railway.app
HELIA_HEARING_MAX_CONCURRENT=3
HELIA_HEARING_TIMEOUT_MS=180000
HELIA_HEARING_JOB_RETENTION_MS=3600000
HELIA_HEARING_MAX_RETAINED_JOBS=100
HELIA_HEARING_QUEUE_POLL_MS=2000
REDIS_URL=redis://default:password@host:port
HELIA_REDIS_PREFIX=helia-court
HELIA_X402_RECEIVER_ADDRESS=0x...
HELIA_X402_FACILITATOR_URL=https://gateway-api-testnet.circle.com
HELIA_X402_PRICE_MICRO_USDC=10000
HELIA_X402_SIGNING_SECRET=replace-with-a-long-random-secret
```

Run migrations from the backend package after attaching Railway Postgres:

```sh
pnpm --dir backend db:migrate
```

Keep `OPENROUTER_API_KEY`, search provider keys, crawler keys, `SETTLEMENT_PRIVATE_KEY`, and `HELIA_ADMIN_KEY` server-only. Case filing is accepted only after the backend verifies the Arc `CaseOpened` receipt, and manual settlement retry requires the admin key.

## Hearing API shape

- `POST /agents/hearing`: synchronous compatibility endpoint. Returns `429` when the worker is busy.
- `POST /agents/hearing/jobs`: production MVP endpoint. Enqueues the hearing and returns a job record.
- `GET /agents/hearing/jobs/:jobId`: poll for `queued`, `running`, `completed`, or `failed`.

Use the job endpoint from the Vercel app for real hearings so the browser does not wait on a long crawler/agent run. With `DATABASE_URL` set, completed and partial hearings survive backend restarts.

## Web and worker split

Run the public API and hearing worker as two Railway services that point at the same Postgres database.

- Web service command: `pnpm start:web`
- Web service env: `HELIA_ENABLE_HEARING_WORKER=false`
- Worker service command: `pnpm start:worker`
- Worker service env: `HELIA_HEARING_MAX_CONCURRENT=3`

Scale the worker, not the web service, when the hearing queue grows. A single worker can usually move from `3` toward `10` concurrent hearings after provider limits are verified. Keep one worker instance while using one settlement signer, because final onchain receipt writes are serialized inside a process to avoid nonce collisions. Multiple worker instances need separate settlement signers or a shared distributed nonce/settlement lock.
