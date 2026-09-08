# Civil Sarabande Contracts

`GameEscrow` v2: a USDC escrow for two-player games, targeting Base Sepolia
(chain id 84532) and local Anvil (31337). Solidity 0.8.23, Foundry, no
external dependencies beyond the local `IERC20` interface. The full design is
in [`docs/escrow-and-play-design.md`](../../docs/escrow-and-play-design.md).

## How it works

- Each player escrows exactly `stake` USDC: player 1 on `createGame`, player 2
  on `joinGame`. The game holds `2 x stake`.
- The game is played off-chain. There are **no per-bet transactions** (the old
  `depositBet` path is gone).
- When the game ends, the **server** calls `settleGame(gameId, player1Amount,
  player2Amount)` once. The two amounts must sum to the game's deposits.
  Settlement is server-only; players cannot settle.
- Player escape hatches that never need the server:
  - `withdrawUnjoined(gameId)`: player 1 takes their stake back while nobody
    has joined.
  - `claimTimeout(gameId)`: once a game has been active for more than
    `SETTLEMENT_TIMEOUT` (7 days) without settlement, either player can refund
    both stakes.
- The server can also `cancelGame` a created or active game, refunding each
  present player their stake.

`gameId = keccak256(abi.encodePacked(serverGameId))`; `getGameIdFromServerId`
computes it on-chain (pure) and the server computes it locally.

### Status lifecycle

```
None --createGame--> Created --joinGame--> Active --settleGame--> Settled
                        |                    |
                        |  withdrawUnjoined  |  cancelGame -> Cancelled
                        |  cancelGame        |  claimTimeout -> TimedOut
                        v                    v
                    Cancelled           Cancelled / TimedOut
```

`totalDeposits` is zeroed on every exit path. A game id is single-use: once a
game leaves `None` it can never be created again.

### Roles

| Role | Can |
|---|---|
| owner (deployer) | `setServerAddress`, `transferOwnership` |
| server | `settleGame`, `cancelGame` |
| player 1 | `createGame`, `withdrawUnjoined`, `claimTimeout` |
| player 2 | `joinGame`, `claimTimeout` |

The ABI the server and web client compile against lives in
`packages/shared/src/escrowAbi.ts`. Keep it in sync with `src/GameEscrow.sol`.

## Layout

```
src/GameEscrow.sol          the escrow
src/interfaces/IERC20.sol   minimal ERC-20 interface
src/mocks/MockUSDC.sol      6-decimal test token with a public mint (tests + Anvil only)
test/GameEscrow.t.sol       Foundry tests
script/Deploy.s.sol         Base Sepolia deployment
script/DeployLocal.s.sol    Anvil deployment (MockUSDC + escrow + faucet mints)
deployments/                deployment records written by the scripts
get-server-address.mjs      prints the server wallet address from its private key
```

## Setup

Install Foundry:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

Clone with submodules (`lib/forge-std` is a git submodule):

```bash
git submodule update --init --recursive
```

Nothing else to install: the contracts have no OpenZeppelin or other
third-party dependencies.

## Development

```bash
cd packages/contracts
forge build
forge test
forge test -vvv            # with traces
FOUNDRY_PROFILE=ci forge test   # the CI profile (fewer fuzz runs)
forge fmt --check
```

Run `forge` from this directory so it picks up `foundry.toml`. Profiles are
selected with the `FOUNDRY_PROFILE` env var; `forge test` has no `--profile`
flag (`bun run test:ci` wraps the CI profile).

If you are on a machine without access to the Solidity compiler download host,
add `--offline` to `forge build` / `forge test` / `forge script` to use the
cached `solc` 0.8.23. On a normal machine `--offline` is not needed.

## Local deployment (Anvil)

```bash
anvil --port 8545
# in another shell, from packages/contracts:
bun run deploy:local
```

`deploy:local` runs `script/DeployLocal.s.sol` with Anvil account 0 as the
broadcaster. It deploys `MockUSDC` and `GameEscrow` with the server address set
to `SERVER_WALLET_ADDRESS` (default: Anvil account 9,
`0xa0Ee7A142d267C1f36714E4a8F75612F20a79720`), mints 10,000 USDC to Anvil
accounts 0-3 and to the server address, and writes `deployments/local.json`:

```json
{
  "chainId": 31337,
  "escrow": "0x...",
  "usdc": "0x...",
  "server": "0x...",
  "deployedAt": 1700000000
}
```

Copy `escrow` and `usdc` into the server and web `.env` files (or let
`scripts/dev-local.sh` do it). `deployments/local.json` and `broadcast/` are
git-ignored.

## Base Sepolia deployment

See [`DEPLOY.md`](./DEPLOY.md). The script writes `deployments/base-sepolia.json`
with the same keys (`chainId` 84532); that file is meant to be committed.

## Contract addresses

- Base Sepolia:
  - GameEscrow: see `deployments/base-sepolia.json` after deployment
  - USDC: `0x036CbD53842c5426634e7929C8C4E5b8c0C5b6E8`
