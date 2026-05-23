import type { FastifyInstance } from 'fastify'
import { getAgentRegistryWithOnchainProfiles } from '../agents/registry.js'
import { listHearingJobs } from '../agents/hearing-jobs.js'
import { env } from '../config/env.js'

type SettlementReceipt = {
  txHash?: string
  recordHash?: string
  amountUsdc?: string
}

export async function statsRoutes(app: FastifyInstance) {
  app.get('/stats', async () => {
    const [jobs, agents] = await Promise.all([
      listHearingJobs(),
      Promise.resolve(getAgentRegistryWithOnchainProfiles()),
    ])
    const publicJobs = jobs.filter((job) => (job.marketCase.visibility ?? 'public') === 'public')
    const completedJobs = publicJobs.filter((job) => job.status === 'completed')
    const receiptRows = publicJobs.flatMap((job) => {
      const result = job.result as { onchainSettlement?: { receipts?: SettlementReceipt[] } } | undefined
      return Array.isArray(result?.onchainSettlement?.receipts) ? result.onchainSettlement.receipts : []
    })
    const totalUsdc = receiptRows.reduce((total, receipt) => total + parseAmount(receipt.amountUsdc), 0)
    const txCount = receiptRows.filter((receipt) => receipt.txHash).length
    const hashCount = receiptRows.filter((receipt) => receipt.recordHash).length

    return {
      cases: {
        total: publicJobs.length,
        queued: publicJobs.filter((job) => job.status === 'queued').length,
        hearing: publicJobs.filter((job) => job.status === 'running').length,
        verdict: completedJobs.length,
      },
      agents: {
        total: agents.length,
        enabled: agents.filter((agent) => agent.enabled).length,
        toolBacked: agents.filter((agent) => agent.runMode === 'tool-backed-model').length,
      },
      receipts: {
        rows: receiptRows.length,
        txCount,
        hashCount,
        totalUsdc: formatAmount(totalUsdc),
      },
      integrations: {
        telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
        x402: Boolean(env.HELIA_X402_RECEIVER_ADDRESS ?? env.HELIA_PROTOCOL_AGENT_PAYOUT_WALLET ?? env.TREASURY_ADDRESS),
      },
    }
  })
}

function parseAmount(value?: string) {
  if (!value) return 0
  const match = value.match(/^\d+(?:\.\d+)?/)
  return match ? Number(match[0]) : 0
}

function formatAmount(value: number) {
  return value.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}
