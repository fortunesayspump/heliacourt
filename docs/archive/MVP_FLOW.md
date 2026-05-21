# Helia Court MVP Flow

## MVP Thesis

Helia Court is a prediction-market intelligence court.

Users file market questions. Specialist agents act as witnesses, counsel, clerks, jurors, and magistrates. The court produces a structured verdict with confidence, dissent, evidence, costs, and a receipt trail.

The MVP should be an intelligence layer that helps users understand whether a market probability is mispriced.

## Primary User Flow

### 1. Visitor lands on the marketing site

The public site explains:

- what Helia Court is
- how a prediction case works
- which agents participate
- where Arc, USDC, and Circle infrastructure fit
- why verdicts are auditable instead of black-box AI answers

Primary action: **Enter Court**.

### 2. User enters the app

The app opens as a prediction-market intelligence desk.

The user can:

- browse active cases
- read public verdicts
- inspect agent reputation
- view the ledger of case receipts
- file a new prediction case

Wallet connection should not be required for browsing. It becomes required when money, identity, or reputation is involved.

### 3. User files a prediction case

The case form asks for:

- market question
- market category
- time horizon
- hearing tier
- visibility
- maximum USDC budget
- optional context or evidence links

Example question:

```txt
Will ETH outperform SOL over the next 7 days?
```

Before the user pays, the app should check for similar active or recently completed cases.

If a similar case exists, the user sees three options:

- **Join existing case**: add funding, follow updates, and receive access to the shared verdict.
- **Request fresh hearing**: pay for an updated hearing on the same question when market conditions have changed.
- **Open private fork**: run a separate case privately with custom context, budget, or constraints.

This prevents the court from producing random-looking duplicate verdicts for the same market question while still letting users pay for fresh or private analysis.

MVP hearing tiers:

- **Quick brief**: fewer witnesses, one counsel pass, faster answer.
- **Standard hearing**: main MVP flow with multiple witnesses and both counsel.
- **Deep hearing**: later tier with more follow-up rounds and specialist agents.

Suggested MVP pricing should be closer to real agent costs than tiny demo fees:

- quick brief: 2-4 USDC
- standard hearing: 5-10 USDC
- deep hearing: 15+ USDC later

### 4. User chooses case visibility

Visibility should be explicit because market intelligence can be sensitive.

MVP visibility modes:

- **Public case**: question, evidence summary, verdict, and outcome are visible.
- **Private case**: only the filer can see the full record.
- **Public verdict / private payer**: the verdict becomes public, but the payer is not shown as the sponsor.
- **Delayed public**: private during the active market window, public after resolution.

"Private payer" means the market answer can be public while the paying user remains hidden behind a wallet/session identity unless they choose to reveal themselves.

### 5. Wallet funds the case

For MVP, the user connects a wallet when they file a paid case.

The case budget is reserved before the hearing begins. The app should show a clear estimate:

- witness testimony
- counsel arguments
- juror votes
- court clerk and settlement clerk
- protocol fee
- unused budget returned or left unspent

Arc and Circle fit here as the stablecoin-native payment and receipt layer.

## Detailed User Flow

### Browse-first flow

This is the default flow for a visitor who is not ready to pay.

1. User enters the app.
2. User browses live and resolved cases.
3. User opens a case preview.
4. User sees the question, market, horizon, confidence, agents used, and whether the full record is public.
5. User opens the full public record or follows the case.
6. Wallet is requested only if the user wants alerts, private saves, paid records, voting, filing, or reputation.

### File-new-case flow

This is the main paid MVP flow.

1. User clicks **New Case**.
2. User enters a market question.
3. The app normalizes the question into market, direction, horizon, and resolution condition.
4. The app checks for similar cases.
5. User chooses to join, refresh, or open a new/private case.
6. User selects hearing tier, visibility, and budget.
7. User connects wallet and funds the case.
8. Court hearing begins.
9. User watches the timeline update as agents testify and argue.
10. User receives verdict, confidence, dissent, cost breakdown, and receipt.
11. Case moves into active monitoring until the horizon resolves.
12. Outcome is recorded and agent reputation updates.

### Returning-user flow

This is the flow for someone who already has history.

1. User opens dashboard.
2. Dashboard shows active cases, followed cases, private cases, and resolved outcomes.
3. User checks which verdicts were correct or wrong.
4. User sees which agents performed well.
5. User can re-open a question, fund a fresh hearing, or follow similar markets.

### External-builder flow

This is later, but the MVP UI should leave room for it.

1. Builder opens the agent registry.
2. Builder submits a witness agent profile.
3. Agent declares role, endpoint, schema, tools, pricing, wallet, and sample output.
4. Helia Court validates the agent in a sandbox.
5. Approved agent becomes available as an optional witness.
6. The agent earns when summoned and builds reputation over time.

External-builder support should not block the MVP. It should be represented as a future slot in the product.

## Similar Case Policy

Similar cases are not a problem if the system treats them carefully.

Two users might ask the same question at different times, with different budgets, court settings, or private context. Those can produce different verdicts without being contradictions.

The product should distinguish between:

- **Duplicate case**: same market, same direction, same horizon, same resolution condition, still active.
- **Fresh hearing**: same question, but enough time has passed or market conditions changed.
- **Private fork**: same public question, but the filer adds private context or wants private access.
- **Related case**: similar market, but different horizon, asset pair, resolution condition, or action.

### MVP Similarity Check

The MVP can use a simple matching layer:

- normalized asset/entity tags
- market category
- time horizon
- direction
- resolution date
- text similarity

Example:

```txt
Question A: Will ETH outperform SOL over the next 7 days?
Question B: ETH vs SOL, who performs better this week?
Result: duplicate or joinable existing case.

Question C: Will ETH outperform SOL over the next 30 days?
Result: related case, not duplicate.

Question D: Is ETH more likely than SOL to outperform this week after ETF flow headlines?
Result: related/private fork because the resolution condition and context are different.
```

### Avoiding Contradictory Verdicts

The court should show verdict versioning instead of hiding differences.

If a new hearing disagrees with an older one, the app should explain:

- what changed
- which witnesses shifted
- which evidence changed
- whether the horizon is different
- whether confidence improved or fell

Example:

```txt
Previous verdict: ETH slight outperform, 58% confidence, issued May 17.
Fresh verdict: No edge, 51% confidence, issued May 19.
Change reason: SOL funding normalized and ETH ETF flow signal weakened.
```

That makes disagreement feel like market updating, not the app contradicting itself.

## Court Execution Flow

### 1. Mnemon opens the case

Mnemon is the Court Clerk.

Responsibilities:

- assign case ID
- timestamp filing
- record filer visibility settings
- open the court timeline
- track which agents are summoned
- prepare the final case record

### 2. Kleio prepares the evidence packet

Kleio is the Evidence Clerk.

Responsibilities:

- normalize the user's question
- organize user-provided links
- define what testimony is needed
- file every witness response into the case record
- hash evidence artifacts for later receipt anchoring

Kleio does not own all data collection. Witness agents bring data. Kleio files it.

### 3. Witness agents testify

Witness agents are the data and signal specialists.

MVP witness bench:

- **Pythia**: prediction-market odds, implied probability, market pricing, liquidity.
- **Hermes**: web search, news freshness, source quality, event timeline.
- **Argos**: onchain flows, exchange movements, wallet behavior, stablecoin flows.
- **Notus**: weather, real-world data APIs, event-specific data when relevant.
- **Phylax**: confidence thresholds, liquidity context, budget constraints, and evidence-quality checks.

Users do not manually choose witnesses in the MVP. Heliaia seats witnesses based on the normalized case, category, horizon, hearing tier, and approved budget. The user can choose hearing depth and provide context; the court decides which specialists are needed.

Each witness returns structured testimony:

```json
{
  "agentId": "pythia",
  "role": "Prediction Witness",
  "claim": "ETH has a slight edge over SOL for the next 7 days.",
  "confidence": 0.57,
  "evidence": [
    "prediction-market implied probability moved from 51% to 56%",
    "liquidity remains thin, so signal quality is medium"
  ],
  "risks": [
    "ETF flow headline may already be priced",
    "SOL beta can reverse quickly in risk-on markets"
  ],
  "cost": "0.80 USDC"
}
```

### 4. Follow-up questioning happens when needed

Cases should not be one-shot if the first testimony conflicts.

The hearing should be counsel-led. Solon and Draco request testimony, examine witnesses, object to weak or leading questions, and cross-examine weak claims. Archon controls order in the room, asks clarifying questions, and rules on objections. The orchestrator can trigger follow-up questions when:

- witnesses disagree strongly
- confidence is too low
- source quality is weak
- a risk rule blocks the suggested verdict
- counsel requests clarification

MVP rule: allow one follow-up round in the standard hearing tier.

Later: deep hearings can support multiple cross-examination rounds.

### 5. Solon and Draco argue both sides

Solon is Bull Counsel. Draco is Bear Counsel.

They receive:

- the evidence packet
- witness testimony
- user question and horizon
- risk constraints

Solon argues the "yes/upside" case.

Draco argues the "no/downside" case.

Both must cite evidence, state assumptions, and identify weak points.

### 6. Phylax performs risk review

Phylax is both a witness and a policy guard.

Responsibilities:

- check liquidity
- check confidence threshold
- check market horizon
- check budget and exposure constraints
- recommend no clear edge, watchlist, or inconclusive when evidence is weak

MVP is **verdict only**.

### 7. Dikasts vote

Dikasts are jurors.

MVP jury:

- **Kallias**: momentum juror
- **Thraso**: skeptic juror
- **Sophon**: risk juror

Each juror reviews:

- witness testimony
- counsel arguments
- risk review
- time horizon

Each juror outputs:

- vote
- confidence
- reason
- dissent if any

### 8. Archon writes the verdict

Archon is the Presiding Magistrate.

Archon does not invent a verdict from nowhere. It summarizes and finalizes the court result based on:

- witness evidence
- Solon argument
- Draco argument
- Phylax risk review
- Dikast vote

Verdict format:

```json
{
  "caseId": "case-eth-sol-7d",
  "question": "Will ETH outperform SOL over the next 7 days?",
  "verdict": "ETH slight outperform",
  "confidence": 0.58,
  "output": "verdict only",
  "horizon": "7 days",
  "juryVote": {
    "yes": 2,
    "no": 1
  },
  "dissent": "Thraso believes SOL beta risk is underweighted.",
  "costUsed": "6.75 USDC",
  "visibility": "Public verdict / private payer"
}
```

### 9. Nomisma records payments and receipts

Nomisma is the Settlement Clerk.

Responsibilities:

- calculate final agent payouts
- record unused budget
- calculate protocol fee
- prepare payment receipt
- prepare Arc record hash

The MVP now records ledger rows in Postgres and anchors settlement/verdict receipts on Arc testnet. The ledger is still app-indexed for readability, while the contracts provide the economic proof trail.

### 10. Case resolves and reputation updates

After the market horizon ends, the case receives an outcome.

The system updates:

- verdict accuracy
- witness usefulness
- counsel quality
- juror calibration
- user-visible case history

This is how the product becomes more than a chat app. It creates a memory of which agents were useful.

## Agent Execution Architecture

The app should not call agents directly.

Recommended MVP flow:

```txt
App UI
  -> Backend API
    -> Case Orchestrator
      -> Agent Registry
      -> Agent Runner
      -> Tool Connectors
      -> Court Record Store
    -> Ledger / Receipt Writer
  -> App UI
```

### Agent Definition

Each agent should be defined as:

- stable agent ID
- name
- court role
- category
- system prompt
- input schema
- output schema
- tools allowed
- price
- owner wallet
- reputation score
- enabled/disabled status

This lets us edit each agent separately and add new agents later.

### First MVP Hosting Model

Use one backend service with separate agent modules.

Each agent can live in its own folder and export a standard handler:

```txt
backend/src/agents/
  pythia-prediction-witness/
  hermes-news-witness/
  argos-onchain-witness/
  notus-weather-witness/
  phylax-risk-bailiff/
  solon-bull-counsel/
  draco-bear-counsel/
  dikasts/
  archon-magistrate/
  mnemon-court-clerk/
  kleio-evidence-clerk/
  nomisma-settlement-clerk/
```

This keeps the code clean without forcing every agent to have its own server too early.

Later, external agents can be separate hosted services.

## Agent Registry

MVP should use an internal registry first.

The registry should define:

```json
{
  "agentId": "pythia",
  "name": "Pythia",
  "courtRole": "Prediction Witness",
  "category": "prediction-markets",
  "endpoint": "internal://agents/pythia",
  "pricing": {
    "base": "0.80 USDC",
    "followUp": "0.35 USDC"
  },
  "wallet": "protocol-owned",
  "schema": "predictionWitness.v1",
  "toolsAllowed": ["predictionMarketSearch", "marketLiquidityCheck"],
  "reputationScore": 0.92,
  "firstParty": true,
  "x402Enabled": false,
  "erc8004AgentId": null,
  "status": "active"
}
```

### Later Registry Direction

External agents should be added after the internal court works.

Later requirements:

- agent owner wallet
- permissioned tools
- fixed output schema
- pricing and refund policy
- quality score
- slashing or dispute rules if needed
- onchain identity / reputation mapping

ERC-8004-style agent identity and reputation can become the public registry layer later, while Helia Court keeps its own operational registry for the MVP.

## x402 and External Payments

x402 is useful when Helia Court needs to call external paid agents, paid APIs, or paid data services.

MVP recommendation:

- do not require x402 for first-party internal agents
- use internal accounting for first-party agent payouts
- keep x402 compatibility in the registry
- use x402 later when a third-party witness charges per call

Example later flow:

```txt
Helia Court wants weather testimony
  -> Registry finds Notus or external Weather Witness
  -> Endpoint requires x402 payment
  -> Backend pays the quoted amount
  -> Agent returns structured testimony
  -> Nomisma records payment in the case ledger
```

## Onchain and Arc Scope

Not every detail should go onchain.

### Offchain

Store the full court file offchain:

- question
- user context
- full witness testimony
- source links
- counsel arguments
- juror reasoning
- private notes
- UI timeline

### Onchain / Arc

Record proofs and economics:

- case opened
- budget reserved
- agents summoned
- agent payment events
- protocol fee
- evidence hash
- verdict hash
- final court record hash
- reputation update reference

The current MVP records the payment and receipt trail through Postgres plus Arc testnet contracts. Full payout claiming and external-agent settlement are later production steps.

## Protocol Revenue

Helia Court earns from:

- filing fee
- protocol percentage on agent work
- premium/private cases
- later subscription alerts
- later external agent listing fees
- later API access to court intelligence

Suggested MVP fee:

- 10% protocol fee on used case budget
- no fee on unused budget

Example:

```txt
User reserves: 8.00 USDC
Agents use: 6.20 USDC
Protocol fee: 0.62 USDC
Unused: 1.18 USDC
```

## Public Case History

The app should have case history and outcomes.

Each completed case should show:

- original question
- verdict
- confidence
- horizon
- outcome
- whether the court was correct
- cost used
- agents used
- receipt hash

This becomes the product's credibility layer.

## MVP Pages

Required app pages:

- Dashboard: market intelligence overview and live cases.
- Cases: active, completed, and watchlist cases.
- Case Preview: quick modal or drawer before opening a full case.
- Case Detail: court transcript, testimony, arguments, vote, verdict, and ledger. Verdict sealing is internal after Archon and Nomisma finish the record.
- New Case: file a prediction case.
- Agents: witness bench, counsel, jurors, reputation.
- Ledger: payments, receipts, protocol fees.
- Docs / Help: user-facing explanation.
- Profile: wallet, private cases, preferences.

Hearing room should not be a main nav item. It should be reached from a case.

## MVP Cut Line

Build now:

- internal agents
- standard prediction case flow
- case visibility modes
- case budgets in realistic USDC ranges
- simulated ledger and receipts
- public verdict/history surfaces
- app UI that feels like a prediction market desk

Keep a gap for later:

- external agent plugins
- x402 paid external calls
- ERC-8004-style registry mapping
- large juries
- private team workspaces

## Product Rule

Helia Court does not need to always be right.

It needs to be:

- structured
- auditable
- priced clearly
- honest about confidence
- able to show dissent
- able to learn from outcomes

That is the difference between a prediction court and a black-box answer.
