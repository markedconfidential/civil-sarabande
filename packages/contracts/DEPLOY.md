# Deploying GameEscrow to Base Sepolia

## Prerequisites

1. **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`) and
   the git submodule (`git submodule update --init --recursive`).
2. **Deployer wallet** with Base Sepolia ETH for gas. Faucets:
   https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet or
   https://app.chainlink.com/faucets/base-sepolia
3. **Server wallet**. The server signs `settleGame` / `cancelGame` transactions,
   so it also needs a little Base Sepolia ETH. Its private key goes in
   `packages/server/.env` as `SERVER_WALLET_PRIVATE_KEY`; the contract only
   needs its **address**. To print the address from the key:

   ```bash
   cd packages/contracts
   SERVER_WALLET_PRIVATE_KEY=0x... bun get-server-address.mjs
   ```

   The key is read from the environment, never from the command line.
4. **BaseScan API key** (optional, for `--verify`): https://basescan.org/myapikey

## Configure

Create `packages/contracts/.env` (see `.env.example`):

```bash
DEPLOYER_PRIVATE_KEY=0x...
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8   # Base Sepolia USDC
SERVER_WALLET_ADDRESS=0x...                                       # from get-server-address.mjs
BASESCAN_API_KEY=...                                              # optional
```

`.env` is git-ignored. Load it into your shell before running forge
(`set -a; source .env; set +a`) or use `--env-file` tooling of your choice.

## Deploy

```bash
cd packages/contracts
forge script script/Deploy.s.sol:DeployScript --rpc-url base_sepolia --broadcast --verify
# or
bun run deploy:sepolia
```

`base_sepolia` is defined in `foundry.toml` as `https://sepolia.base.org`.
Drop `--verify` if you have no BaseScan key.

The script:

1. deploys `GameEscrow(USDC_CONTRACT_ADDRESS, SERVER_WALLET_ADDRESS)`; the
   deployer becomes `owner`;
2. writes `deployments/base-sepolia.json`:

   ```json
   {
     "chainId": 84532,
     "escrow": "0x...",
     "usdc": "0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8",
     "server": "0x...",
     "deployedAt": 1700000000
   }
   ```

Commit `deployments/base-sepolia.json`; it is the record of the live address.

## After deployment

1. Put the escrow address in:
   - `packages/server/.env` as `GAME_ESCROW_CONTRACT_ADDRESS`
   - `packages/web/.env` as `VITE_ESCROW_CONTRACT_ADDRESS`

   and the USDC address as `USDC_CONTRACT_ADDRESS` / `VITE_USDC_CONTRACT_ADDRESS`.
   Both packages must use chain id 84532 and the same RPC.
2. Check the contract on https://sepolia.basescan.org.
3. Fund the server wallet with a little ETH so it can pay settlement gas.

## Operating the contract

- **Settlement is server-only.** Only `serverAddress` can call `settleGame` and
  `cancelGame`. Players cannot pay themselves out.
- **Rotating the server key.** The owner can call
  `setServerAddress(newServer)` at any time; the old server is locked out
  immediately. Update `SERVER_WALLET_PRIVATE_KEY` on the server to match.
  Ownership itself moves with `transferOwnership(newOwner)`.
- **Player escape hatches.** If the server is down, players are never stuck:
  - player 1 can `withdrawUnjoined(gameId)` while the game is still `Created`;
  - either player can `claimTimeout(gameId)` once an `Active` game is older
    than `SETTLEMENT_TIMEOUT` (7 days since `joinGame`); both stakes are
    refunded.
- USDC on Base Sepolia: `0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8`. Test
  USDC comes from Circle's faucet (https://faucet.circle.com).

## Local Anvil deployment

For engine and end-to-end work without a testnet, use
`script/DeployLocal.s.sol` instead (see `README.md`): it deploys a `MockUSDC`
with a public `mint`, sets the server to Anvil account 9 by default, mints
10,000 USDC to Anvil accounts 0-3 and the server, and writes
`deployments/local.json` (git-ignored).
