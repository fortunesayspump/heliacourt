import cors from '@fastify/cors'
import Fastify from 'fastify'
import { env } from './config/env.js'
import { caseRoutes } from './routes/cases.js'
import { circleRoutes } from './routes/circle.js'
import { healthRoutes } from './routes/health.js'

const app = Fastify({
  logger: true,
})

await app.register(cors, {
  origin: env.APP_ORIGIN,
})

await app.register(healthRoutes)
await app.register(circleRoutes)
await app.register(caseRoutes)

await app.listen({
  host: '0.0.0.0',
  port: env.PORT,
})
