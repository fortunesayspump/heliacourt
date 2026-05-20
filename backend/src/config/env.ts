import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { z } from 'zod'

loadLocalEnvFiles()

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_API_BASE_URL: z.string().url().default('https://api.circle.com'),
  DATABASE_URL: z.string().url().optional(),
  HELIA_HEARING_MAX_CONCURRENT: z.coerce.number().int().positive().default(1),
  HELIA_HEARING_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  HELIA_HEARING_JOB_RETENTION_MS: z.coerce.number().int().positive().default(60 * 60 * 1000),
  HELIA_HEARING_MAX_RETAINED_JOBS: z.coerce.number().int().positive().default(100),
  HELIA_HEARING_QUEUE_POLL_MS: z.coerce.number().int().positive().default(2_000),
  REDIS_URL: z.string().url().optional(),
  HELIA_REDIS_PREFIX: z.string().min(1).default('helia-court'),
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
