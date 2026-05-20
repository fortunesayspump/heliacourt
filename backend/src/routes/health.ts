import type { FastifyInstance } from 'fastify'
import { getHearingQueueStats } from '../agents/hearing-jobs.js'
import { isDatabaseConfigured } from '../db/client.js'

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const hearingQueue = await getHearingQueueStats().catch((error) => ({
      backend: 'unavailable',
      error: error instanceof Error ? error.message : 'queue stats unavailable',
    }))

    return {
      ok: true,
      service: 'helia-court-backend',
      database: {
        backend: 'postgres',
        configured: isDatabaseConfigured,
      },
      hearingQueue,
    }
  })
}
