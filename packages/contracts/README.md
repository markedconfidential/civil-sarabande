# Civil Sarabande Smart Contracts

Smart contracts for USDC escrow on Base Sepolia testnet.

## Setup

1. Install Foundry:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. Install dependencies:
   ```bash
   forge install OpenZeppelin/openzeppelin-contracts --no-commit
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your private keys and API keys
   ```

## Development

Compile contracts:
```bash
forge build
```

Run tests:
```bash
forge test
```

Deploy to Base Sepolia:
```bash
forge script script/Deploy.s.sol:DeployScript --rpc-url base_sepolia --broadcast --verify
```

## Contract Addresses

- Base Sepolia Testnet:
  - GameEscrow: `TBD`
  - USDC Testnet: `0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8` (Base Sepolia USDC)
