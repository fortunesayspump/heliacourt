import type { FastifyInstance } from 'fastify'
import { env } from '../config/env.js'

export async function circleRoutes(app: FastifyInstance) {
  app.get('/circle/status', async () => ({
    configured: Boolean(env.CIRCLE_API_KEY),
    mode: 'server-managed',
  }))

  app.post('/circle/session', async (_request, reply) => {
    if (!env.CIRCLE_API_KEY) {
      return reply.code(501).send({
        error: 'circle_not_configured',
        message: 'Add CIRCLE_API_KEY to backend/.env before creating Circle wallet sessions.',
      })
    }

    return reply.code(501).send({
      error: 'circle_session_not_implemented',
      message: 'Circle wallet session creation is scaffolded. Wire the exact Modular Wallets endpoint after keys are created.',
    })
  })
}
