export type AgentRoleColorClass =
  | 'agent-role-solon'
  | 'agent-role-draco'
  | 'agent-role-archon'
  | 'agent-role-jury'
  | 'agent-role-risk'
  | 'agent-role-settlement'
  | 'agent-role-clerk'

export function getAgentRoleColorClass(input: { agentId?: string; agentName?: string; seat?: string }): AgentRoleColorClass | undefined {
  const value = `${input.agentId ?? ''} ${input.agentName ?? ''} ${input.seat ?? ''}`.toLowerCase()

  if (value.includes('solon') || value.includes('bull-counsel')) return 'agent-role-solon'
  if (value.includes('draco') || value.includes('bear-counsel')) return 'agent-role-draco'
  if (value.includes('archon') || value.includes('head-judge') || value.includes('magistrate')) return 'agent-role-archon'
  if (value.includes('juror') || value.includes('jury') || value.includes('dikast')) return 'agent-role-jury'
  if (value.includes('phylax') || value.includes('risk') || value.includes('bailiff')) return 'agent-role-risk'
  if (value.includes('nomisma') || value.includes('settlement')) return 'agent-role-settlement'
  if (value.includes('kleio') || value.includes('mnemon') || value.includes('clerk')) return 'agent-role-clerk'

  return undefined
}
