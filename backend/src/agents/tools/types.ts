import type { ToolEvidence } from '../../court/types'

export type ToolIntent = {
  capability: ToolEvidence['capability']
  reason: string
}

export type ToolPlan = {
  intents: ToolIntent[]
  primaryCount: number
}
