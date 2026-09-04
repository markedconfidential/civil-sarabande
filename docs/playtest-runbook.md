# Playtest Runbook

Two ways to play. Start with the local loop to learn the flow, then move to Base Sepolia when you want real wallets and a public chain.

The economic model, contract, and protocol are specified in `escrow-and-play-design.md`. The short version: each player escrows the stake in USDC to enter; the game is played in coins that represent the stake; at the end the server settles the escrow on chain in proportion to final coins.

---

## A. Local loop (no testnet, no Privy)

Everything runs on your machine against a local Anvil chain with a mock USDC. Identities are four preset dev accounts, so there is nothing to sign up for.

### Prerequisites

- Bun 1.0 or later
- Foundry (`anvil`, `forge`, `cast`). Install with `curl -L https://foundry.paradigm.xyz | bash && foundryup`.
- Initialize the contracts submodule once: `git submodule update --init --recursive`
- `bun install` at the repo root

### Run

```bash
scripts/dev-local.sh
```

The script starts Anvil, deploys `MockUSDC` and `GameEscrow`, writes `packages/server/.env.local` and `packages/web/.env.local` from the deployment, and starts the server and the web app. Add `--reset` to wipe the local database first.

If your machine cannot download the Solidity compiler (some proxies block it), put the `solc-static-linux` 0.8.23 binary from the Solidity GitHub releases at `~/.svm/0.8.23/solc-0.8.23` and run with `FORGE_FLAGS=--offline scripts/dev-local.sh`.

### Play

1. Open http://localhost:5173 in one browser and pick a dev identity (say Aldric). The client registers the wallet, sets the username, and mints test USDC if the balance is zero.
2. Open a second browser or a private window and pick a different identity (Morwenna).
3. In the first window, enter a stake and create a game. You will see the seal go pending → stamping → sealed as the stake is approved and escrowed.
4. In the second window, the game appears in the open games list. Join it; the same seal sequence runs for the second stake.
5. Play. Each phase has a turn clock; a player who does not act by the deadline forfeits.
6. The game ends when a player is out of coins, when a player leaves, or on a timeout. The game-over screen shows the settlement seal turning to released with both payouts once the server's settlement transaction confirms.

Anvil state is in memory; stopping the script discards the chain (the server database persists unless you `--reset`).

---

## B. Base Sepolia with Privy

Real embedded wallets via Privy, real testnet USDC, and a public contract.

### 1. Accounts and funds you need

| What | Where |
|---|---|
| Privy app id and secret | https://dashboard.privy.io → create an app, enable email/SMS login and embedded wallets, add your web origin |
| A deployer wallet with Base Sepolia ETH | any wallet; ETH from https://www.alchemy.com/faucets/base-sepolia or the Coinbase developer faucet |
| A server wallet with a little Base Sepolia ETH | a separate key; it pays settlement gas only |
| Test USDC for each player's embedded wallet | https://faucet.circle.com (select Base Sepolia). USDC contract: `0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8` |
| An RPC URL | `https://sepolia.base.org` works; an Alchemy or Infura Base Sepolia URL is more reliable |

Derive the server wallet's address from its key without pasting the key on the command line:

```bash
cd packages/contracts
SERVER_WALLET_PRIVATE_KEY=0x... bun get-server-address.mjs
```

### 2. Deploy the contract

```bash
cd packages/contracts
cp .env.example .env    # fill DEPLOYER_PRIVATE_KEY, USDC_CONTRACT_ADDRESS, SERVER_WALLET_ADDRESS, BASESCAN_API_KEY (optional)
forge script script/Deploy.s.sol:DeployScript --rpc-url base_sepolia --broadcast --verify
```

The script writes `deployments/base-sepolia.json` with the escrow address. Commit that file.

### 3. Configure

`packages/server/.env`:

```
NODE_ENV=development
AUTH_MODE=privy
PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
CHAIN_ID=84532
RPC_URL=https://sepolia.base.org
GAME_ESCROW_CONTRACT_ADDRESS=<escrow from deployments/base-sepolia.json>
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8
SERVER_WALLET_PRIVATE_KEY=0x...
TURN_TIMEOUT_SECONDS=120
SETTLEMENT_ENABLED=true
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

`packages/web/.env`:

```
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
VITE_AUTH_MODE=privy
VITE_PRIVY_APP_ID=...
VITE_CHAIN_ID=84532
VITE_RPC_URL=https://sepolia.base.org
VITE_ESCROW_CONTRACT_ADDRESS=<escrow>
VITE_USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8
VITE_EXPLORER_URL=https://sepolia.basescan.org
```

Both packages ship a `.env.example` with these keys.

### 4. Run

```bash
bun run dev                              # server, from the repo root
cd packages/web && bun run dev           # web, in another terminal
```

### 5. Play

1. Open the web app in two browsers and sign in with two different emails or phone numbers. Privy creates an embedded wallet for each.
2. On the Fund page, copy each wallet address and send it test USDC from the Circle faucet. Each embedded wallet also needs a little Base Sepolia ETH for gas on the approve and enter transactions; send some from the deployer wallet.
3. Create a game in one browser, join it in the other, play to the end. Settlement transactions show a BaseScan link on the game-over screen.

---

## What to look at while playtesting

- Turn clock length (`TURN_TIMEOUT_SECONDS`), and whether forfeiting on timeout feels fair.
- The stake-to-coins mapping: 100 coins per stake. Does the ante schedule escalate at a good pace for the stake sizes you care about?
- The reveal moment, the round crest, and the settlement seal timing.
- Anything the opponent should not be able to see (the client only receives the opponent's row assignments and their revealed column until the round ends).

## Troubleshooting

- **Server refuses to start:** it validates its environment at boot and names the missing or malformed variable.
- **"Chain mismatch" card on the home page:** the client's `VITE_CHAIN_ID` / contract addresses disagree with the server's `GET /config`. Make both `.env` files match.
- **Approve or enter transaction fails with insufficient balance:** the embedded wallet needs both USDC (stake) and a little ETH (gas).
- **Game ended but the seal stays on "Settling":** the server retries settlement with backoff; check the server log for the revert reason. The escrow contract also lets either player call `claimTimeout` after 7 days to recover their stake if settlement never happens.
- **Local: "cannot connect to Anvil":** something else is on port 8545; set `ANVIL_PORT=8546 scripts/dev-local.sh`.
