import type { FastifyInstance } from 'fastify'

export async function caseRoutes(app: FastifyInstance) {
  app.post('/cases', async () => ({
    status: 'draft',
    message: 'Case creation endpoint reserved for escrow and Arc receipt wiring.',
  }))
}
