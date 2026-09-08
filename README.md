# Civil Sarabande

A crypto-enabled reimagining of Cordial Minuet.

## Project Structure

```
civil-sarabande/
├── packages/
│   ├── server/      # Game server (Bun + TypeScript)
│   ├── shared/      # Shared types and utilities
│   ├── web/         # Frontend (SvelteKit)
│   └── contracts/   # Solidity smart contracts (Foundry)
├── reference/       # Original Cordial Minuet source for reference
└── ...
```

## Development

### Prerequisites

- [Bun](https://bun.sh/) v1.0 or later

### Setup

```bash
bun install
```

### Running the dev server

```bash
bun run dev
```

### Running tests

```bash
bun test
```

### Type checking

```bash
bun run typecheck
```

## Reference

The `reference/` directory contains the original Cordial Minuet source code:
- `reference/server/` - PHP server implementation with game logic
- `reference/server/protocol.txt` - API protocol documentation
- `reference/server/magicSquare6.cpp` - Magic square generation algorithm
- `reference/gameSource/` - C++ client source

## Blockchain Integration

The project uses smart contracts on Base Sepolia testnet for USDC escrow:

- **Smart Contracts**: Foundry-based contracts in `packages/contracts/`
- **Network**: Base Sepolia testnet
- **Token**: USDC (testnet)
- **Escrow**: Game stakes and bets are held on-chain, payouts are automatic

### Contract Setup

1. Install Foundry:
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. Set up contracts:
   ```bash
   cd packages/contracts
   forge install OpenZeppelin/openzeppelin-contracts --no-commit
   forge build
   forge test
   ```

3. Deploy to Base Sepolia:
   ```bash
   forge script script/Deploy.s.sol:DeployScript --rpc-url base_sepolia --broadcast --verify
   ```

### Environment Variables

**Server** (`packages/server/.env`, see `packages/server/.env.example` for Anvil and Sepolia examples):
- `AUTH_MODE` - `privy` or `dev` (`dev` accepts `Bearer dev:<userId>` tokens; refused in production)
- `PRIVY_APP_ID`, `PRIVY_APP_SECRET` - Privy credentials (required when `AUTH_MODE=privy`)
- `CHAIN_ID` - `31337` (Anvil) or `84532` (Base Sepolia)
- `RPC_URL` - JSON-RPC endpoint (`BASE_SEPOLIA_RPC_URL` accepted as an alias)
- `GAME_ESCROW_CONTRACT_ADDRESS` - Deployed escrow contract address
- `USDC_CONTRACT_ADDRESS` - USDC token address (testnet: `0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8`)
- `SERVER_WALLET_PRIVATE_KEY` - Server wallet private key (signs settlements and cancellations)
- `TURN_TIMEOUT_SECONDS` - Seconds a player has to act before being forfeited (default 120; 0 disables)
- `SETTLEMENT_ENABLED` - `true` to verify deposits and settle on chain; `false` for engine-only play (default true)
- `CORS_ALLOWED_ORIGINS` - Comma-separated allowlist of origins (required in production)
- `LOG_LEVEL` - Structured log level (`debug`, `info`, `warn`, `error`)
- `PORT`, `DATABASE_PATH` - HTTP port (default 3001) and SQLite path

**Frontend** (`packages/web/.env`):
- `VITE_API_URL` - Backend API URL
- `VITE_PRIVY_APP_ID` - Privy application ID
- `VITE_ESCROW_CONTRACT_ADDRESS` - Deployed escrow contract address
- `VITE_USDC_CONTRACT_ADDRESS` - USDC token address
- `VITE_CHAIN_ID` - Chain ID (84532 for Base Sepolia)

## License

See `no_copyright.txt`
