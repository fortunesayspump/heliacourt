import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'

loadLocalEnvFiles()

const optionalHex = (bytes: number) => z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const normalized = value.trim().replace(/^['"]|['"]$/g, '')
  return normalized || undefined
}, z.string().regex(new RegExp(`^0x[a-fA-F0-9]{${bytes * 2}}$`)).optional())

const optionalUrl = z.preprocess((value) => {
  if (typeof value !== 'string') return value
  const normalized = value.trim().replace(/^['"]|['"]$/g, '')
  return normalized || undefined
}, z.string().url().optional())

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_API_BASE_URL: z.string().url().default('https://api.circle.com'),
  DATABASE_URL: optionalUrl,
  HELIA_HEARING_MAX_CONCURRENT: z.coerce.number().int().positive().default(1),
  HELIA_HEARING_TIMEOUT_MS: z.coerce.number().int().min(0).default(0),
  HELIA_HEARING_STALE_RUNNING_MS: z.coerce.number().int().positive().default(10 * 60 * 1000),
  HELIA_HEARING_JOB_RETENTION_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  HELIA_HEARING_MAX_RETAINED_JOBS: z.coerce.number().int().positive().default(100),
  HELIA_HEARING_QUEUE_POLL_MS: z.coerce.number().int().positive().default(2_000),
  REDIS_URL: optionalUrl,
  HELIA_REDIS_PREFIX: z.string().min(1).default('helia-court'),
  HELIA_ADMIN_KEY: z.string().min(24).optional(),
  ARC_RPC_URL: z.string().url().default('https://rpc.testnet.arc.network'),
  ARC_CHAIN_ID: z.coerce.number().int().positive().default(5_042_002),
  PRIVATE_KEY: optionalHex(32),
  SETTLEMENT_PRIVATE_KEY: optionalHex(32),
  CASE_ESCROW_ADDRESS: optionalHex(20),
  COURT_RECEIPTS_ADDRESS: optionalHex(20),
  PROTOCOL_FEE_BPS: z.coerce.number().int().min(0).max(1_000).default(500),
  HELIA_PROTOCOL_AGENT_PAYOUT_WALLET: optionalHex(20),
  TREASURY_ADDRESS: optionalHex(20),
  HELIA_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_ALERT_CHAT_IDS: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(16).optional(),
  HELIA_X402_RECEIVER_ADDRESS: optionalHex(20),
  HELIA_X402_FACILITATOR_URL: optionalUrl,
  HELIA_X402_SIGNING_SECRET: z.string().min(24).optional(),
  HELIA_X402_PRICE_MICRO_USDC: z.coerce.number().int().positive().default(10_000),
})

export const env = envSchema.parse(process.env)

function loadLocalEnvFiles() {
  const cwd = process.cwd()
  const paths = [
    resolve(cwd, '.env'),
    resolve(cwd, '.env.local'),
    resolve(cwd, '..', '.env'),
    resolve(cwd, '..', '.env.local'),
    resolve(cwd, '..', 'app', '.env'),
    resolve(cwd, '..', 'app', '.env.local'),
    resolve(cwd, 'backend', '.env'),
    resolve(cwd, 'backend', '.env.local'),
    resolve(cwd, 'app', '.env'),
    resolve(cwd, 'app', '.env.local'),
  ]

  for (const path of Array.from(new Set(paths))) {
    if (existsSync(path)) {
      config({ path, override: false, quiet: true })
    }
  }
}
