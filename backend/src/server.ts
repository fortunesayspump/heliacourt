import cors from '@fastify/cors'
import Fastify from 'fastify'
import { startHearingJobWorker } from './agents/hearing-jobs.js'
import { env } from './config/env.js'
import { agentRoutes } from './routes/agents.js'
import { caseRoutes } from './routes/cases.js'
import { circleRoutes } from './routes/circle.js'
import { healthRoutes } from './routes/health.js'
import { telegramRoutes } from './routes/telegram.js'
import { userRoutes } from './routes/users.js'

const app = Fastify({
  logger: true,
})

await app.register(cors, {
  origin: env.APP_ORIGIN,
})

await app.register(healthRoutes)
await app.register(circleRoutes)
await app.register(caseRoutes)
await app.register(agentRoutes)
await app.register(userRoutes)
await app.register(telegramRoutes)

startHearingJobWorker()

await app.listen({
  host: '0.0.0.0',
  port: env.PORT,
})
