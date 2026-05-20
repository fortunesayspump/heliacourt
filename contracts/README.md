# Helia Court Contracts

Smart-contract package for Helia Court protocol primitives.

## Contracts

- `AgentRegistry.sol`: registers court agents, owners, metadata, fee quotes, and active status.
- `CaseEscrow.sol`: opens market cases, reserves USDC budgets, tracks agent payouts, and closes case escrow.
- `CourtReceipts.sol`: records immutable case events and verdict receipts.

`test/MockUSDC.sol` is only a local test token. Arc Testnet deployment uses the configured Arc Testnet USDC address.

## Commands

```bash
forge build
forge test
forge fmt
```

## Arc Testnet Deploy

Set `contracts/.env` from `.env.example`, then run:

```bash
source .env
forge script script/DeployArcTestnet.s.sol:DeployArcTestnet \
  --rpc-url "$ARC_RPC_URL" \
  --broadcast
```

From the workspace root:

```bash
pnpm build:contracts
pnpm test:contracts
```

Install Foundry if `forge` is not available:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```
