import type { FastifyInstance } from 'fastify'
import { getHearingQueueStats } from '../agents/hearings/index.js'
import { env } from '../config/env.js'
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
      worker: {
        enabled: env.HELIA_ENABLE_HEARING_WORKER,
        maxConcurrent: env.HELIA_HEARING_MAX_CONCURRENT,
      },
      onchain: {
        chainId: env.ARC_CHAIN_ID,
        rpcUrl: env.ARC_RPC_URL,
        caseEscrowConfigured: Boolean(env.CASE_ESCROW_ADDRESS),
        courtReceiptsConfigured: Boolean(env.COURT_RECEIPTS_ADDRESS),
        settlementSignerConfigured: Boolean(env.SETTLEMENT_PRIVATE_KEY ?? env.PRIVATE_KEY),
        settlementUsesDedicatedKey: Boolean(env.SETTLEMENT_PRIVATE_KEY),
        adminRetryConfigured: Boolean(env.HELIA_ADMIN_KEY),
      },
    }
  })
}
