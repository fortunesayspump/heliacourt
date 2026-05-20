# Helia Court Agent Architecture

## Principle

Agents should be separate, role-bound workers.

They can start as local TypeScript modules for the hackathon, but the architecture should let us move them into hosted services or external plugins later.

An agent is not just a name in the UI. It needs:

- stable ID
- court seat
- prompt/brief
- input schema
- output schema
- tools
- permissions
- pricing
- owner wallet or protocol owner
- reputation

## Naming Convention

Agents should have Athenian or ancient-Greek-inspired names, but their court role must always remain visible.

This gives Helia Court a strong world without making the product confusing.

Initial names:

- **Mnemon**: Court Clerk. From memory/remembrance; owns the official court record.
- **Kleio**: Evidence Clerk. Inspired by Clio/Kleio, muse of history; files exhibits and source trails.
- **Pythia**: Prediction Witness. Brings odds, probability, and mispricing testimony.
- **Hermes**: News Witness. Brings headline flow and source freshness testimony.
- **Argos**: Onchain Witness. Brings wallet flow and exchange movement testimony.
- **Solon**: Bull Counsel. Named after the Athenian lawgiver; argues the constructive/upside case.
- **Draco**: Bear Counsel. Named after the strict Athenian lawgiver; challenges weak assumptions.
- **Phylax**: Risk Bailiff. Greek for guard; protects the court from overconfidence and weak evidence.
- **Kallias**: Dikast Juror. Momentum-minded juror.
- **Thraso**: Dikast Juror. Skeptical juror.
- **Sophon**: Dikast Juror. Risk-aware juror.
- **Archon**: Presiding Magistrate. Named after Athenian magistrates; writes the final verdict from the jury vote and court rules.
- **Nomisma**: Settlement Clerk. Greek term associated with coin/currency; handles USDC payouts and receipts.

UI format should be:

```txt
Solon
Bull Counsel
```

or:

```txt
Solon · Bull Counsel
```

Never show only the mythic name without the functional role.

## Required MVP Agents

The MVP should keep the court in order before adding specialist witnesses.

That means the first version needs:

- Court Clerk
- Evidence Clerk
- Witnesses
- Bull Counsel
- Bear Counsel
- Risk Bailiff
- Dikasts Jury
- Head Judge
- Settlement Clerk

The first witness layer is included now, but the court loop should stay disciplined: witnesses testify, Kleio files, counsel argue, Dikasts vote.

### 1. Court Clerk

Owns the case file.

Responsibilities:

- opens the case
- assigns case ID
- timestamps each step
- records agents summoned
- maintains the court timeline
- creates the final court record
- computes hashes for evidence, arguments, and verdict
- prepares the record for Arc anchoring

Paid: yes, small administrative fee.

### 2. Evidence Clerk

Owns exhibits.

Responsibilities:

- receives or prepares initial exhibits
- organizes source trails
- summarizes filed evidence
- labels evidence quality
- submits exhibit artifacts

Important distinction:

Kleio is not the whole data layer. Kleio is the clerk who files evidence into the official case record. Later, specialist witness agents will bring data and testimony to Kleio.

Paid: yes, per evidence packet.

### 3. Witnesses

Bring testimony into the court.

Initial witness agents:

- **Pythia**: Prediction Witness. Looks at prediction-market odds, implied probability, and mispricing.
- **Hermes**: News Witness. Looks at headline flow, source quality, and freshness.
- **Argos**: Onchain Witness. Looks at wallet flow, exchange movement, and onchain behavior.

Responsibilities:

- submit testimony
- cite claims and risks
- state confidence
- charge a small fee when summoned

Paid: yes, only when summoned.

Kleio files their testimony into the official evidence packet.

### 4. Bull Counsel

Argues the positive case.

Responsibilities:

- argues yes/upside
- cites evidence
- states assumptions
- gives confidence
- recommends a verdict framing

Paid: yes, per argument.

### 5. Bear Counsel

Argues the negative case.

Responsibilities:

- argues no/downside
- challenges evidence
- identifies hidden risks
- gives confidence
- recommends a verdict downgrade when evidence is weak

Paid: yes, per argument.

### 6. Risk Bailiff

Owns confidence policy and evidence-risk checks.

Responsibilities:

- checks confidence threshold
- checks source quality
- checks liquidity context
- flags uncertainty
- recommends no clear edge or inconclusive when evidence is weak

Paid: yes, per risk review.

### 7. Dikasts Jury

Owns the vote.

Athens-inspired courts relied heavily on citizen jurors. Helia Court mirrors this with a small panel of juror agents called **Dikasts**.

Each juror has a distinct market temperament:

- **Kallias**: Momentum Juror. Looks for signal freshness, trend continuation, and timing.
- **Thraso**: Skeptic Juror. Challenges overconfidence, weak evidence, and crowded narratives.
- **Sophon**: Risk Juror. Prioritizes uncertainty, liquidity context, and evidence quality.

Responsibilities:

- review the evidence packet
- review both counsel arguments
- respect Phylax risk constraints
- vote on the case
- explain confidence and dissent

Paid: yes, small fee per vote.

MVP recommendation: use three jurors for clarity. Later courts can support larger jury pools.

### 8. Presiding Magistrate

Owns final verdict writing.

Responsibilities:

- weighs evidence
- compares counsel arguments
- accounts for dissent
- counts the Dikasts jury vote
- respects risk constraints
- issues verdict
- explains confidence

Paid: maybe.

MVP recommendation: Archon should not be an all-powerful judge. Archon should write the final verdict from the jury vote, counsel arguments, and risk rules.

### 9. Settlement Clerk

Owns money movement.

Responsibilities:

- calculates agent payouts
- calculates protocol fee
- creates payment plan
- records simulated or real USDC transfers
- prepares Arc events
- links payment receipts to the court record

Paid: yes, small settlement fee.

## Later Witnesses

Additional specialists can be added after the first witness layer:

- Macro Witness
- Quant Witness
- Sentiment Witness
- Liquidity Witness
- Geopolitical Witness

### Outcome Reviewer

Owns post-case review.

Responsibilities:

- checks what happened after the verdict
- compares outcome to verdict
- updates agent reputation
- marks evidence quality
- creates postmortem

Paid: later, not required for first demo.

## Hosting Model

### Phase 1: Local Agents

Agents run as TypeScript functions in the app or local backend.

Best for the hackathon because:

- fast to build
- easy to demo
- no external deployment required
- deterministic sample mode is possible

### Phase 2: Internal Hosted Agents

Agents run behind our API.

Benefits:

- hide API keys
- run LLM calls server-side
- connect to market data
- persist court records
- control costs

### Phase 3: External Plugin Agents

Third parties host their own agents and register them with Helia Court.

Benefits:

- specialist marketplace
- external data providers
- community-built strategies
- agents can earn USDC

Risks:

- bad outputs
- spam agents
- malicious endpoints
- unreliable latency
- tool permission abuse
- payment disputes

So external agents need strict schemas, reputation, spending limits, and permissions.

## Agent Registry

Every agent should be defined in a registry entry.

```ts
type AgentRegistryEntry = {
  id: string
  name: string
  seat: CourtSeat
  owner: 'protocol' | `0x${string}`
  mode: 'local' | 'hosted' | 'external'
  endpoint?: string
  priceUsd: number
  permissions: AgentPermission[]
  inputSchema: string
  outputSchema: string
  enabled: boolean
}
```

This makes agents easy to add, edit, disable, price, or replace.

## External Agent Plugin Shape

External agents should expose a simple HTTPS endpoint.

Request:

```json
{
  "caseId": "case-001",
  "seat": "witness",
  "question": "Will ETH outperform BTC this week?",
  "caseType": "crypto-market",
  "evidence": [],
  "budget": "0.10",
  "currency": "USDC"
}
```

Response:

```json
{
  "agentId": "whale-watcher",
  "artifactType": "evidence",
  "confidence": 0.72,
  "summary": "Large wallets accumulated ETH over the last 24 hours.",
  "claims": [
    "Net whale inflow increased",
    "Exchange deposits stayed flat"
  ],
  "risks": [
    "Wallet labels may be stale",
    "Accumulation does not guarantee near-term outperformance"
  ],
  "sources": [
    "https://example.com/source"
  ],
  "cost": "0.05"
}
```

## Permissions

Initial permissions:

- `read_case`
- `read_public_evidence`
- `submit_evidence`
- `submit_argument`
- `submit_risk_review`
- `submit_verdict_recommendation`
- `request_payment`

Helia Court is verdict-only intelligence, so agents only submit evidence, arguments, reviews, votes, verdicts, and payment requests.

## Editing Agents

To make future editing easy:

- keep all agent metadata in one registry
- keep prompts separate from UI components
- keep output schemas strict
- make agents swappable by ID
- store agent version with every court artifact
- show disabled agents in admin tools later

## Suggested Repo Structure

```txt
src/
  agents/
    registry.ts
    types.ts
    local/
      clerks/
      counsel/
      bailiffs/
      dikasts/
      magistrates/
      settlement/
  court/
    types.ts
    heliaia.ts
    records.ts
```

Current implementation uses Athenian court groups with folder-per-agent modules:

```txt
src/agents/local/
  clerks/
    mnemon-court-clerk/index.ts
    kleio-evidence-clerk/index.ts
      counsel/
        solon-bull-counsel/index.ts
        draco-bear-counsel/index.ts
      witnesses/
        pythia-prediction-witness/index.ts
        hermes-news-witness/index.ts
        argos-onchain-witness/index.ts
  bailiffs/
    phylax-risk-bailiff/index.ts
  dikasts/
    kallias-momentum-juror/index.ts
    thraso-skeptic-juror/index.ts
    sophon-risk-juror/index.ts
  magistrates/
    archon-presiding-magistrate/index.ts
  settlement/
    nomisma-settlement-clerk/index.ts
```

Folder naming convention:

```txt
<agent-name>-<functional-role>
```

Examples:

- `kallias-momentum-juror`
- `solon-bull-counsel`
- `archon-presiding-magistrate`

The parent folder should represent the court group. The child folder should show both the lore name and practical role.

Each folder can later contain:

- `index.ts` for the runner
- `prompt.md` for the role prompt
- `schema.ts` for stricter inputs/outputs
- `tools.ts` for APIs or chain reads
- `fixtures.ts` for demo inputs
- `test.ts` for agent-specific tests

This keeps each agent easy to edit, replace, host, or open to plugins without rewriting the whole court engine.

## First Build Target

Build local agents first.

The first complete loop should be:

1. user files case
2. Court Clerk opens case
3. Witnesses testify
4. Evidence Clerk files exhibits
5. Bull Counsel argues
6. Bear Counsel argues
7. Risk Bailiff constrains action
8. Dikasts jury votes
9. Archon writes verdict
10. Settlement Clerk creates payment plan
11. Court Clerk finalizes record hash

After that loop works locally, we can host agents separately or open plugin registration.
