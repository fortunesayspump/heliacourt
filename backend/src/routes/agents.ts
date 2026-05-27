import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { deleteUnfundedHearingJob, enqueueHearingJob, getHearingJob, HearingBusyError, runHearingNow } from '../agents/hearings/index.js'
import { getAgentRegistryWithOnchainProfiles } from '../agents/registry.js'
import type { CaseType, MarketCase } from '../court/types.js'
import { getReputationMeta } from '../shared/reputation-meta.js'

const hearingRequestSchema = z.object({
  id: z.string().trim().optional(),
  question: z.string().trim().min(1),
  context: z.string().trim().optional(),
  links: z.array(z.string().trim().url()).optional(),
  imageUrl: z.string().trim().url().optional(),
  type: z.enum(['crypto-market', 'prediction-market', 'macro', 'real-world-event']).optional(),
  filer: z.custom<`0x${string}`>((value) => typeof value === 'string' && /^0x[a-fA-F0-9]+$/.test(value)).optional(),
})

export async function agentRoutes(app: FastifyInstance) {
  app.get('/agents/registry', async () => ({
    agents: getAgentRegistryWithOnchainProfiles().map((agent) => ({
      id: agent.id,
      name: agent.name,
      seat: agent.seat,
      description: agent.description,
      mode: agent.mode,
      runMode: agent.runMode,
      priceUsd: agent.priceUsd,
      toolCapabilities: agent.toolCapabilities,
      enabled: agent.enabled,
      version: agent.version,
      onchain: agent.onchain,
    })),
  }))

  app.post('/agents/hearing', async (request, reply) => {
    const parsed = parseHearingRequest(request.body)

    if (!parsed.ok) return reply.status(400).send(parsed.response)

    try {
      const hearing = await runHearingNow(parsed.marketCase)

      return reply.send({
        ...hearing,
        reputation: getReputationMeta({
          service: 'hearing',
          endpoint: request.url,
          caseId: parsed.marketCase.id,
          evidenceId: hearing.recordHash,
        }),
      })
    } catch (error) {
      if (error instanceof HearingBusyError) {
        return reply.status(429).send({
          error: error.message,
          hint: 'POST /agents/hearing/jobs to enqueue long-running hearings.',
        })
      }

      throw error
    }
  })

  app.post('/agents/hearing/jobs', async (request, reply) => {
    const parsed = parseHearingRequest(request.body)

    if (!parsed.ok) return reply.status(400).send(parsed.response)

    const job = await enqueueHearingJob(parsed.marketCase)

    return reply.status(202).send({
      ...job,
      reputation: getReputationMeta({
        service: 'hearing-job',
        endpoint: request.url,
        caseId: parsed.marketCase.id,
        evidenceId: job.id,
      }),
    })
  })

  app.delete('/agents/hearing/jobs/:jobId', async (request, reply) => {
    const params = z.object({ jobId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'jobId is required' })

    const result = await deleteUnfundedHearingJob(params.data.jobId)
    if (!result.deleted) {
      if (result.reason === 'not-found') return reply.status(404).send({ error: 'hearing job not found' })
      return reply.status(409).send({ error: 'funded or wallet-owned cases must be cancelled through the normal case flow' })
    }

    return {
      deleted: true,
      jobId: result.job.id,
      caseId: result.job.caseId,
    }
  })

  app.get('/agents/hearing/jobs/:jobId', async (request, reply) => {
    const params = z.object({ jobId: z.string().min(1) }).safeParse(request.params)
    if (!params.success) return reply.status(400).send({ error: 'jobId is required' })

    const job = await getHearingJob(params.data.jobId)
    if (!job) return reply.status(404).send({ error: 'hearing job not found' })

    return reply.send({
      ...job,
      reputation: getReputationMeta({
        service: 'hearing-job-status',
        endpoint: request.url,
        caseId: job.marketCase.id,
        evidenceId: job.id,
      }),
    })
  })
}

function parseHearingRequest(body: unknown): { ok: true; marketCase: MarketCase } | { ok: false; response: unknown } {
  const parsed = hearingRequestSchema.safeParse(body)

  if (!parsed.success) {
    return {
      ok: false,
      response: {
        error: 'invalid hearing request',
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
    }
  }

  const data = parsed.data

  return {
    ok: true,
    marketCase: {
      id: data.id || `case-${Date.now()}`,
      question: data.question,
      context: data.context || undefined,
      links: data.links?.filter(Boolean),
      imageUrl: data.imageUrl,
      type: (data.type ?? 'prediction-market') as CaseType,
      filer: data.filer,
      visibility: data.filer ? 'public' : 'unlisted',
      createdAt: new Date().toISOString(),
    },
  }
}
