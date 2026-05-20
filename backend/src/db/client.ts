import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { env } from '../config/env.js'
import * as schema from './schema.js'

const connection = env.DATABASE_URL
  ? postgres(env.DATABASE_URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : undefined

export const db = connection ? drizzle(connection, { schema }) : undefined
export const isDatabaseConfigured = Boolean(connection)
