import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:3000'),
  CIRCLE_API_KEY: z.string().optional(),
  CIRCLE_API_BASE_URL: z.string().url().default('https://api.circle.com'),
})

export const env = envSchema.parse(process.env)
