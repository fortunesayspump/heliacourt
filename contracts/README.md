# Helia Court Contracts

Smart-contract package for Helia Court protocol primitives.

## Contracts

- `AgentRegistry.sol`: registers court agents, owners, metadata, fee quotes, and active status.
- `CaseEscrow.sol`: opens market cases, reserves/top-ups USDC budgets, tracks agent payouts, and closes case escrow.
- `CourtReceipts.sol`: records immutable case events and verdict receipts.

`test/MockUSDC.sol` is only a local test token. Arc Testnet deployment uses the configured Arc Testnet USDC address.

## Commands

From a fresh clone, initialize the Foundry helper submodule first:

```bash
git submodule update --init --recursive
```

```bash
forge build
forge test
forge fmt
```

## Arc Testnet Deploy

Create `contracts/.env` locally with the Arc RPC URL and deployer key, then run:

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

## Upgrade CaseEscrow

`CaseEscrow` is UUPS-upgradeable. To deploy a new implementation and upgrade the existing proxy:

```bash
source .env
CASE_ESCROW_PROXY="$CASE_ESCROW_ADDRESS" \
forge script script/UpgradeCaseEscrowArcTestnet.s.sol:UpgradeCaseEscrowArcTestnet \
  --rpc-url "$ARC_RPC_URL" \
  --broadcast
```

The broadcast wallet must be the current `CaseEscrow` owner.

Install Foundry if `forge` is not available:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```
