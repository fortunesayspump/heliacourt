# Helia Court Product Plan

## Core Idea

Helia Court is a multi-agent market tribunal.

Users submit a market case. Heliaia, the internal court engine, assigns specialized AI agents to argue, investigate, check uncertainty, and issue an intelligence verdict. Arc and Circle infrastructure are used for agent budgets, signal payments, court records, and verdict receipts.

The product is not "an AI that is always right." It is a structured decision system for markets:

- gather evidence
- argue both sides
- show confidence and dissent
- apply risk rules
- record the reasoning trail
- learn from outcomes

## What Is An Agent?

An agent is a role-bound AI worker with:

- **Seat**: the court role it plays.
- **Brief**: what it is responsible for.
- **Tools**: APIs, data sources, contracts, or internal functions it can call.
- **Budget**: USDC or simulated USDC it can spend on signals or work.
- **Output format**: the exact structure it must return.
- **Reputation**: how useful or accurate it has been over time.

Agents are not just chat messages. Each one produces a filed court artifact.

Example agent artifact:

```json
{
  "agentId": "bull-counsel",
  "caseId": "case-oil-volatility-001",
  "side": "for",
  "confidence": 0.64,
  "claim": "Oil volatility is underpriced",
  "evidence": ["shipping-risk-index-up", "options-skew-change"],
  "risks": ["headline already priced", "thin prediction-market liquidity"],
  "verdictRecommendation": "watchlist"
}
```

## Court Roles

### User / Case Filer

Submits the market question.

Examples:

- "Will ETH outperform BTC this week?"
- "Is oil volatility underpriced?"
- "Will the Fed cut rates before September?"
- "Is this prediction market probability too low?"

### Evidence Clerk

Files exhibits and organizes source trails for the court.

MVP version: files witness testimony into seeded/sample evidence packets.

Later version: receives live testimony from hosted or external specialist witness agents.

### Witnesses

Bring testimony before counsel argues the case.

Initial witnesses:

- Pythia: Prediction Witness
- Hermes: News Witness
- Argos: Onchain Witness

Later witnesses:

- Macro Witness
- Quant Witness
- Sentiment Witness
- Liquidity Witness
- Geopolitics Witness

### Bull Counsel

Argues the positive or "yes/upside" side of the case.

### Bear Counsel

Argues the negative or "no/downside" side of the case.

### Risk Bailiff

Enforces rules:

- confidence threshold
- source quality threshold
- liquidity context
- budget limits

### Dikasts Jury

Votes on the case after hearing the evidence, both counsel arguments, and risk constraints.

Initial jurors:

- Kallias: momentum-minded juror
- Thraso: skeptical juror
- Sophon: risk-aware juror

### Presiding Magistrate

Archon combines the arguments, evidence, jury vote, dissent, and risk checks into the final written verdict.

Possible verdicts:

- bullish
- bearish
- no clear edge
- watchlist
- evidence conflict
- inconclusive

### Settlement Clerk

Handles the economic trail:

- pays agents for work
- logs signal payments
- prepares USDC settlement
- records the court receipt
- later: writes selected records to Arc

## Should Other People Plug In Cases?

Yes. This should be part of the product from the beginning.

Helia Court should let outside users submit cases. The app then runs the court process and returns a verdict.

MVP:

- anyone can enter a market question
- choose a case type
- run a simulated court hearing
- see the verdict and court record

Later:

- users pay USDC to file a case
- specialist agents get paid when used
- public case feed
- private cases for teams
- followable judges and agents
- agent reputation and leaderboards

## Should Other People Plug In Agents?

Eventually yes, but not in the first MVP.

External agents are powerful, but they add security, quality, spam, and trust problems.

Suggested phases:

### Phase 1: Internal Agents Only

We define the core court agents ourselves.

Goal: prove the court flow feels good.

### Phase 2: Configurable Agents

Users can choose which court seats to enable and adjust risk rules.

Goal: make courts customizable.

### Phase 3: External Agent Registry

Third-party agents can register capabilities and pricing.

Goal: make Helia Court an agent marketplace.

Requirements before this phase:

- agent identity
- output schemas
- reputation
- cost limits
- permissioning
- audit logs
- sandboxed tools

## Product Flow

1. User files a case.
2. Court Clerk opens the case file.
3. Witnesses testify.
4. Evidence Clerk files exhibits.
5. Bull Counsel argues the yes/upside interpretation.
6. Bear Counsel argues the no/downside interpretation.
7. Risk Bailiff applies policy.
8. Dikasts jury votes.
9. Archon writes the verdict.
10. Settlement Clerk records payments and receipts.
11. Court Clerk finalizes the court record.
12. Outcome is later reviewed for reputation.

## MVP Scope

Build this first:

- case intake form
- case type selector
- witness testimony outputs
- seeded evidence packet generation
- bull and bear counsel outputs
- risk bailiff result
- Dikasts jury votes
- Archon verdict
- court record view
- simulated USDC payments between agents
- Arc Testnet config visible in the settlement layer

For the hackathon, the demo should stay verdict-only while showing where Circle Wallets, CCTP, Nanopayments, and Arc records fit for case funding, agent payments, and receipts.

## Technical Shape

Frontend:

- React app
- case intake
- court dashboard
- verdict view
- court record timeline

Agent engine:

- TypeScript modules for each agent
- shared case schema
- shared court artifact schema
- deterministic sample mode for demos
- later: LLM calls and live data tools

Chain/Circle layer:

- Arc Testnet config
- mock USDC budgets first
- later: Circle Wallets
- later: Nanopayments for paid signals
- later: write court receipts or job records to Arc

## Near-Term Build Order

1. Add case intake form.
2. Create TypeScript schemas for Case, Agent, Evidence, Argument, Verdict, Payment.
3. Build local mock Heliaia engine.
4. Wire the UI so filing a case generates a full hearing.
5. Add court record timeline.
6. Add simulated agent payments.
7. Add wallet connection and Arc Testnet display.
8. Replace mock witness testimony with one live market/news/prediction source.
9. Add verdict history and reputation.

## One-Line Pitch

Helia Court lets users file prediction-market intelligence cases that AI agents debate like a court, producing transparent verdicts, dissent, confidence, and USDC-settled agent records on Arc.
