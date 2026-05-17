import type { AgentContext, CourtArtifact } from '../../../../court/types'

export function runHeadJudge(context: AgentContext): CourtArtifact {
  return {
    id: `${context.marketCase.id}-verdict`,
    caseId: context.marketCase.id,
    agentId: 'head-judge',
    type: 'verdict',
    summary: 'Issues a watchlist verdict after reviewing the Dikasts jury vote.',
    confidence: 0.62,
    claims: [
      'Two of three jurors support a slight edge with constraints',
      'Risk constraints limit the verdict to intelligence only',
    ],
    risks: ['Defense dissent remains material'],
    costUsd: 0,
    createdAt: new Date().toISOString(),
  }
}
