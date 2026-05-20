# Helia Court Protocol Model

## Short Version

Helia Court is not only a UI. It is a prediction-market intelligence protocol.

Users file market cases. AI agents argue and investigate those cases. The court produces an intelligence verdict with confidence, dissent, evidence, and receipts. Arc is the settlement and record layer for filing fees, agent payments, and court receipts.

## Where Users Come In

Users are case filers, followers, and intelligence consumers.

### Case Filer

A user files a market question:

- "Will ETH outperform BTC this week?"
- "Will the Fed cut rates before September?"
- "Is this prediction market mispriced?"
- "Is this probability too low given current evidence?"

The user pays a small filing fee in USDC.

### Follower

A user follows courts, judges, agents, or case categories.

Examples:

- follow macro cases
- follow crypto prediction cases
- follow a high-performing judge
- follow a specialist witness agent

Followers can pay for alerts, case access, or premium verdicts.

### Intelligence Consumer

A user reads verdicts, compares confidence, and tracks outcomes.

MVP: verdict-only intelligence.

Helia Court stays verdict-only.

## Where Prediction Markets Come In

The clean framing is **market intelligence**.

Helia Court can analyze:

- prediction-market probabilities
- event odds
- market narratives
- evidence conflicts
- probability mispricing
- outcome history

For the hackathon, the MVP should produce verdicts and receipts only.

If users later act somewhere else, that happens outside Helia Court:

1. user files a case
2. agents debate whether a market is mispriced
3. Archon issues a verdict
4. settlement clerk records the case receipt
5. outcome reviewer later checks whether the verdict was right

## Where Arc Comes In

Arc is the stablecoin settlement and court-record layer.

### Filing Fees

Users pay USDC to file cases.

Example:

- public case: 0.25 USDC
- private case: 1.00 USDC
- complex case with specialist witnesses: variable fee

### Agent Payments

Agents can earn USDC for useful work.

Examples:

- Evidence Clerk earns 0.03 USDC for exhibits
- Macro Witness earns 0.05 USDC for testimony
- Risk Bailiff earns 0.02 USDC for policy review
- external plugin agent earns its listed price

### Court Receipts

Each completed case can produce a receipt:

- case ID
- question
- agents used
- evidence hashes
- verdict
- confidence
- dissent
- payments
- timestamp

Some data can stay offchain. Hashes, receipts, payment events, and final verdict references can be recorded onchain.

### Verdict Receipts

Arc records the court's economic and audit trail:

- case budget
- agent payments
- protocol fee
- verdict hash
- final outcome review

## Where Onchain Comes In

Not everything should be onchain.

Onchain should be used for things that benefit from public proof, payments, and settlement.

### Onchain MVP Candidates

- case filing payment
- agent payment events
- court receipt hash
- verdict hash
- agent reputation updates

### Offchain MVP Candidates

- long evidence text
- full LLM reasoning
- private user notes
- raw API data
- draft arguments

### Hybrid Court Record

The court record can store full data offchain and anchor it onchain with hashes.

Example:

```json
{
  "caseId": "case-001",
  "verdict": "watchlist",
  "confidence": 0.62,
  "recordHash": "0xabc...",
  "payments": [
    { "agent": "evidence-clerk", "amount": "0.03 USDC" },
    { "agent": "macro-witness", "amount": "0.05 USDC" }
  ]
}
```

## Hybrid Court Record Design

Helia Court should use a hybrid record:

- full court file offchain
- proof and payment events onchain

This gives us transparency without making every LLM thought expensive, public, or hard to edit.

### Offchain Court File

The offchain file contains the full record:

- case question
- case type
- full evidence text
- raw source links
- agent arguments
- witness testimony
- risk notes
- final verdict explanation
- private user notes
- UI timeline

This can start in local app state or a database. Later it can move to IPFS, Arweave, or another storage layer.

### Onchain Arc Record

The onchain record should contain proof and economics:

- case opened
- filing fee paid
- agents summoned
- agent payment events
- evidence hashes
- argument hashes
- verdict hash
- final court record hash
- protocol fee
- outcome/reputation update

### Suggested Events

```solidity
event CaseOpened(
    bytes32 indexed caseId,
    address indexed filer,
    uint256 filingFee,
    string caseType
);

event AgentSummoned(
    bytes32 indexed caseId,
    bytes32 indexed agentId,
    uint256 quotedFee
);

event AgentPaid(
    bytes32 indexed caseId,
    bytes32 indexed agentId,
    address indexed recipient,
    uint256 amount
);

event CaseFinalized(
    bytes32 indexed caseId,
    bytes32 recordHash,
    bytes32 verdictHash,
    uint256 protocolFee
);

event OutcomeReviewed(
    bytes32 indexed caseId,
    bytes32 indexed agentId,
    int256 reputationDelta
);
```

### MVP Implementation

For the first version:

1. Generate a full court record in the frontend.
2. Create deterministic hashes for evidence, arguments, and verdict.
3. Show a simulated Arc event timeline.
4. Later replace the simulated timeline with Arc Testnet contract writes.

The product should make it clear what is currently simulated and what will be onchain.

## Where Protocol Profit Comes In

Helia Court can earn through protocol fees.

### Filing Fee Take Rate

Every case filing has a small protocol fee.

Example:

- user pays 1.00 USDC
- 0.80 USDC goes to agents
- 0.15 USDC goes to protocol
- 0.05 USDC goes to settlement/network/accounting costs

### Agent Marketplace Take Rate

When external agents are plugged in, Helia Court takes a marketplace fee.

Example:

- witness agent charges 0.10 USDC
- agent receives 0.085 USDC
- protocol keeps 0.015 USDC

### Premium Court Access

Users pay for:

- private cases
- faster hearings
- specialist witness pools
- premium market feeds
- historical court analytics
- agent reputation dashboards

### Verdict Subscription

Users subscribe to courts or agents.

Examples:

- 5 USDC/month for macro court alerts
- 10 USDC/month for advanced prediction-market mispricing cases
- per-alert nanopayment for one-off signals

## Why This Needs Arc Instead Of Just A Database

A normal database can store cases, but Arc gives us money and proof.

Arc lets Helia Court:

- collect USDC case fees
- pay AI agents
- pay external plugin agents
- create transparent court receipts
- anchor verdict records
- build agent reputation from paid work
- move USDC through Circle infrastructure

The point is not "put all AI reasoning onchain." The point is to make the economic layer of agent work real, stable, and auditable.

## MVP Flow With Arc

1. User files a case in the UI.
2. User pays a simulated or testnet USDC filing fee.
3. Heliaia assigns internal agents.
4. Agents submit artifacts.
5. Judge issues verdict.
6. Settlement Clerk creates a court receipt.
7. The app shows simulated agent payouts.
8. Later: receipt hash and payment events are written to Arc.

## Mainnet Vision

1. Users file cases with USDC.
2. Built-in and external agents compete to serve cases.
3. Agents get paid for evidence, arguments, and risk checks.
4. Courts produce verdicts and confidence.
5. Outcomes update agent reputation.
6. Protocol earns from filing, marketplace, subscription, and premium data fees.

## One-Sentence Economic Loop

Users pay USDC to file market cases, agents earn USDC to produce useful intelligence, Arc records the payments and verdict receipts, and Helia Court takes a protocol fee for coordinating the court.
