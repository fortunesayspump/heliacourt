import type { AgentContext, CourtArtifact } from '../../../../court/types'
import { buildRecordBrief, compactRecordItems, issueFromInstruction, makeArtifact, summarizeVerdictPosture } from '../../courtroom-record'

export function runHeadJudge(context: AgentContext): CourtArtifact {
  const brief = buildRecordBrief(context)
  const issue = issueFromInstruction(context)
  const posture = summarizeVerdictPosture(brief)
  const facts = compactRecordItems([...brief.admittedFacts, ...brief.witnessFacts, ...brief.primaryFacts], 3)
  const factText = facts.length ? facts.join(' / ') : 'No merits evidence is admitted yet.'
  const gap = brief.gaps[0] ?? 'the court needs a clearer probability bridge before assigning strong forecast weight'
  const phase = context.courtPhase

  if (phase === 'judge-framing') {
    return makeArtifact(context, {
      agentId: 'head-judge',
      type: 'evidence',
      summary: 'Frames the forecast issues without reaching merits.',
      transcriptMessage: `The court will hear this as verdict-only market intelligence. No merits finding is made at framing. Counsel must forecast Yes or No from admitted clues, catalysts, blockers, timing, source quality, and clearly labeled inference bridges; witnesses supply facts and limits.`,
      confidence: 0.5,
      claims: [],
      risks: ['No evidence has been admitted yet.'],
      costUsd: 0,
    })
  }

  if (phase === 'direct' || phase === 'judge-question') {
    return makeArtifact(context, {
      agentId: 'head-judge',
      type: 'evidence',
      summary: `Judicial clarification on ${issue}.`,
      transcriptMessage: `I’ll admit this much for now: ${factText}. The live question is simple: does ${gap} break the forecast, or just cap confidence?`,
      confidence: 0.58,
      claims: facts,
      risks: [gap],
      costUsd: 0,
    })
  }

  if (phase === 'admission') {
    return makeArtifact(context, {
      agentId: 'head-judge',
      type: 'evidence',
      summary: `Assigns forecast weight on ${issue}.`,
      transcriptMessage: `Ruling: ${factText} is admitted only as a catalyst, blocker, timing clue, or source-quality signal. Nobody gets to treat it as the whole verdict while ${gap} remains open.`,
      confidence: 0.6,
      claims: facts,
      risks: [gap],
      costUsd: 0,
    })
  }

  if (phase === 'jury-instruction') {
    return makeArtifact(context, {
      agentId: 'head-judge',
      type: 'risk-review',
      summary: 'Instructs Dikasts to vote from admitted evidence, forecast bridges, and risk caps.',
      transcriptMessage: `Dikasts, treat ${factText} as the admitted record, not automatic proof. Reward the side that best explains how it changes probability, and keep this reservation live: ${gap}.`,
      confidence: 0.6,
      claims: facts,
      risks: [gap],
      costUsd: 0,
    })
  }

  if (phase === 'calibration') {
    return makeArtifact(context, {
      agentId: 'head-judge',
      type: 'risk-review',
      summary: `Calibrates the record around ${issue}.`,
      transcriptMessage:
        `Calibration: ${factText} is useful, but not a shortcut. Yes still needs a bridge from catalyst to qualifying event; No still has to explain why ${gap} is strong enough to beat tail risk.`,
      confidence: 0.62,
      claims: facts,
      risks: [gap, 'Calibration memo only; final verdict still requires Dikast votes and closing/risk weighting.'],
      costUsd: 0,
    })
  }

  return makeArtifact(context, {
    agentId: 'head-judge',
    type: 'verdict',
    summary: `Issues ${posture.label} after weighing admitted evidence, counsel, risk, and Dikast votes.`,
    transcriptMessage: `Verdict: ${posture.label}. The record turns on ${factText}; the cap is ${gap}. This is a calibrated forecast posture, not certainty or a trade instruction.`,
    confidence: posture.confidence,
    claims: [
      posture.label,
      ...facts.slice(0, 2),
    ],
    risks: [gap],
    costUsd: 0,
  })
}
