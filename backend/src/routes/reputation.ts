import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { getReputationMeta } from '../shared/reputation-meta.js'

const querySchema = z.object({
  service: z.string().trim().min(1).default('helia-court'),
  endpoint: z.string().trim().optional(),
  caseId: z.string().trim().optional(),
  evidenceId: z.string().trim().optional(),
})

export async function reputationRoutes(app: FastifyInstance) {
  app.get('/reputation/meta', async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'invalid reputation metadata query',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      })
    }

    return getReputationMeta(parsed.data)
  })
}
