# Escrow and Play Design

This is the build spec for taking Civil Sarabande from an off-chain prototype to a playable game with real USDC stakes on Base Sepolia. It fixes the economic model, the contract API, the server protocol, and the client flows so the four workstreams (contract, server, web, art) can proceed in parallel against one source of truth. Where this document and the shared types in `packages/shared/src` disagree, the shared types win.

## 1. Economic model

**The stake is a buy-in. Coins are the stake, denominated in hundredths.**

- Each player escrows exactly `stake` USDC into the contract: player 1 on `createGame`, player 2 on `joinGame`. The escrow for a game therefore holds `2 × stake`.
- The game is played entirely off-chain with the existing coin engine. Each player starts with 100 coins, which represent their stake. Antes, bets, folds, and leave penalties move coins between players exactly as today. Coins are zero-sum: `player1Coins + player2Coins` stays at 200 (pots included) for the whole game.
- **There are no per-bet transactions.** The old `depositBet` path is removed. One transaction to enter, one server-signed transaction to settle.
- **Settlement** happens once, when the game reaches `ended`, and pays each player in proportion to their final coins:

  ```
  total    = 2 × stakeUnits                 (USDC base units, 6 decimals)
  p1Payout = floor(total × p1Coins / (p1Coins + p2Coins))
  p2Payout = total − p1Payout
  ```

  A wipe-out pays the winner everything. A tie or an early exit pays each side what it holds. The rounding remainder (at most 1 base unit) goes to player 2. This function lives in `packages/shared/src/settlement.ts` and is the only place it is defined.

- **Game end** occurs when a player reaches 0 coins (checked at round end, no extra call required), when a player leaves (leave penalty applied first, then settlement by resulting coins), or when a turn timeout forfeits a player (treated as a leave by that player).
- **Cancellation** is only possible while the game is unjoined: player 1 gets their stake back. Once player 2 has joined, the only exits are settlement or the on-chain timeout escape hatch.

## 2. Contract: `GameEscrow` v2

Rewrite `packages/contracts/src/GameEscrow.sol`. Solidity 0.8.23, no external dependencies beyond the local `IERC20`.

### Storage

```solidity
enum Status { None, Created, Active, Settled, Cancelled, TimedOut }

struct Game {
    address player1;
    address player2;
    uint256 stake;          // per player, base units
    uint256 totalDeposits;  // funds currently held for this game; zeroed on exit
    Status  status;
    uint64  createdAt;
    uint64  activatedAt;    // set on joinGame
}

IERC20  public immutable usdcToken;
address public owner;
address public serverAddress;
uint256 public constant SETTLEMENT_TIMEOUT = 7 days;
mapping(bytes32 => Game) public games;
```

`gameId = keccak256(abi.encodePacked(serverGameId))`, unchanged from v1 so the server's `getGameIdFromServerId` keeps working.

### Functions

| Function | Caller | Preconditions | Effect |
|---|---|---|---|
| `createGame(string serverGameId, uint256 stake) returns (bytes32)` | anyone | `stake > 0`; `games[id].status == None` | `transferFrom(msg.sender, this, stake)`; status `Created`; emits `GameCreated` |
| `joinGame(bytes32 gameId)` | anyone except player1 | status `Created` | `transferFrom(msg.sender, this, stake)`; sets player2, `activatedAt`; status `Active`; emits `PlayerJoined` |
| `settleGame(bytes32 gameId, uint256 player1Amount, uint256 player2Amount)` | server | status `Active`; `player1Amount + player2Amount == totalDeposits` | transfers each amount (skip zero); `totalDeposits = 0`; status `Settled`; emits `GameSettled` |
| `cancelGame(bytes32 gameId)` | server | status `Created` or `Active` | refunds each player their `stake`; `totalDeposits = 0`; status `Cancelled`; emits `GameCancelled` |
| `withdrawUnjoined(bytes32 gameId)` | player1 | status `Created` | refunds player1; status `Cancelled`; emits `GameCancelled` |
| `claimTimeout(bytes32 gameId)` | player1 or player2 | status `Active`; `block.timestamp > activatedAt + SETTLEMENT_TIMEOUT` | refunds each player their `stake`; status `TimedOut`; emits `GameTimedOut` |
| `setServerAddress(address)` | owner | non-zero | emits `ServerAddressUpdated` |
| `transferOwnership(address)` | owner | non-zero | |
| `getGame(bytes32) view returns (Game)` | anyone | | |
| `getGameIdFromServerId(string) pure returns (bytes32)` | anyone | | |

All state-changing functions are `nonReentrant`. Checks happen before any transfer. Every `transferFrom`/`transfer` return value is required to be true.

### Events

```solidity
event GameCreated(bytes32 indexed gameId, string serverGameId, address indexed player1, uint256 stake);
event PlayerJoined(bytes32 indexed gameId, address indexed player2);
event GameSettled(bytes32 indexed gameId, uint256 player1Amount, uint256 player2Amount);
event GameCancelled(bytes32 indexed gameId, uint256 refund1, uint256 refund2);
event GameTimedOut(bytes32 indexed gameId, address indexed claimant);
event ServerAddressUpdated(address indexed previous, address indexed current);
event OwnershipTransferred(address indexed previous, address indexed current);
```

`serverGameId` is **not** indexed so it is readable from logs.

### Tests (Foundry)

Cover: create (happy, zero stake, duplicate id, insufficient allowance); join (happy, self-join, wrong status, second joiner reverts before any transfer); settle (winner-take-all, split, tie, sum mismatch high and low, not server, not active, double settle); cancel (created, active, after settle reverts, not server); withdrawUnjoined (happy, after join reverts, not player1); claimTimeout (before deadline reverts, after deadline both players can claim once, non-player reverts, after settle reverts); ownership and server rotation; a fuzz test that any `(a, b)` with `a + b == total` settles and leaves the contract holding exactly the other games' funds; `vm.expectEmit` on every event. Cross-game isolation: two games funded, one settled, the other's `cancelGame` refunds exactly its own deposits.

### Deploy

- `script/Deploy.s.sol`: reads `DEPLOYER_PRIVATE_KEY`, `USDC_CONTRACT_ADDRESS`, `SERVER_WALLET_ADDRESS`; deploys; writes `deployments/base-sepolia.json` (`{ "chainId": 84532, "escrow": "0x…", "usdc": "0x…", "server": "0x…", "deployedAt": … }`) via `vm.writeJson`.
- `script/DeployLocal.s.sol`: for Anvil (chain id 31337). Deploys `src/mocks/MockUSDC.sol` (6 decimals, public `mint`) and the escrow with `serverAddress` = Anvil account 9; mints 10,000 USDC to Anvil accounts 0 to 3; writes `deployments/local.json`.
- Fix `packages/contracts/.gitignore` so `lib/` is not ignored (it is a submodule), and give the CI checkout `submodules: recursive`.

## 3. Shared package

`packages/shared/src`:

- `escrowAbi.ts`: the v2 ABI (functions and events above) and the `ERC20_ABI` subset (`approve`, `allowance`, `balanceOf`, `decimals`). This is the **only** copy; server and web import it.
- `settlement.ts`: `computeSettlement(stakeUnits: bigint, player1Coins: number, player2Coins: number): { player1Amount: bigint; player2Amount: bigint }` plus `usdcToUnits(stake: number): bigint` and `unitsToUsdc(units: bigint): string`.
- `types.ts` additions: `EscrowStatus`, `HIDDEN_MOVE`, `RoundResult`, and the new `GameState` fields.
- `api.ts` additions: new `GameStateView` fields, request/response types for the new routes, and `WSSubscribeMessage.token`.

See the files themselves for the exact shapes.

## 4. Server

### Environment

```
AUTH_MODE=privy|dev            # dev only allowed when NODE_ENV != production
PRIVY_APP_ID, PRIVY_APP_SECRET # required when AUTH_MODE=privy
CHAIN_ID=84532|31337
RPC_URL                        # BASE_SEPOLIA_RPC_URL accepted as a fallback alias
GAME_ESCROW_CONTRACT_ADDRESS
USDC_CONTRACT_ADDRESS
SERVER_WALLET_PRIVATE_KEY
TURN_TIMEOUT_SECONDS=120
SETTLEMENT_ENABLED=true
CORS_ALLOWED_ORIGINS, LOG_LEVEL, PORT, DATABASE_PATH
```

`api/wallet.ts` must use the same chain, RPC, and USDC address as the escrow (no mainnet mixing).

### Auth modes

- `privy`: unchanged verification. **Wallet addresses are no longer self-asserted.** On `GET /users/me` the server calls `getPrivyUser` and stores the user's embedded/linked wallet; `POST /users/wallet` only accepts an address that Privy lists for that user.
- `dev`: bearer tokens of the form `dev:<userId>`; the WS `token` field uses the same form. `POST /users/wallet` accepts any well-formed address. A `POST /dev/faucet { address, amount }` route mints MockUSDC via the server wallet. All `/dev/*` routes 404 outside dev mode.

### Routes (changes only)

| Route | Change |
|---|---|
| `POST /games` | Creates the game with `escrowStatus: "unfunded"`. Response adds `escrow` (see view). Unfunded games are **not** listed by `/games/waiting` and are hidden from `/games/waiting` entirely after 1 hour. |
| `POST /games/:id/confirm-funding` | Player 1 only. Reads `getGame(contractGameId)` on chain; requires `player1 == user wallet`, `stake` matches, status `Created`. Sets `escrowStatus: "funded"`. Idempotent. |
| `POST /games/:id/join` | Requires `escrowStatus == "funded"`, `user != player1`. Reads chain; requires `player2 == user wallet` and status `Active`. Joins, sets `escrowStatus: "active"`, transitions to `move1`. Idempotent for the same user. |
| `GET /games/:id` | For a waiting funded game, reconciles with chain: if the contract shows a `player2` whose wallet maps to a known user, auto-joins them (safety net for a client that paid but never called join). |
| `POST /games/:id/cancel` | Player 1 only, `waiting` phase, escrow `funded`. Server calls `cancelGame`; sets `escrowStatus: "cancelled"`, phase `ended`. (Unfunded games are simply deleted.) |
| `GET /games/mine` | Returns the caller's most recent game that is not `ended`, or null. |
| `/contracts/game/:id/payout`, `/cancel`, `/prepare-*` | **Removed.** Settlement is server-initiated only. |

### Settlement

When any mutation leaves the game in `ended` (round end wipe-out, next-round, leave, timeout), the store enqueues settlement. A single in-process queue serialises all chain writes from the server wallet (one nonce stream). The worker: computes amounts with `computeSettlement`, sets `escrowStatus: "settling"`, calls `settleGame`, waits for the receipt, **checks `receipt.status === "success"`**, stores `payout_tx_hash` and both amounts, sets `escrowStatus: "settled"`, broadcasts. On failure: `escrowStatus: "failed"`, `settlementError` stored, retried with backoff (up to 5 times, then left for manual action). On boot, the server re-enqueues any `ended` game whose escrow is `active`, `settling`, or `failed`. If `SETTLEMENT_ENABLED=false` games end without touching the chain (for engine-only local play).

### Engine fixes

1. **Hidden information.** In `toGameStateView` (single shared implementation; delete the duplicate), `theirMoves` masks the opponent's self-column choices (even indices 0, 2, 4) with `HIDDEN_MOVE` (`-1`) until the phase is `roundEnd` or `ended`. Index 6 (their reveal) is public once both players have revealed. Row assignments (odd indices) are always public.
2. **Double actions.** `makeMove` rejects a player who already has `phaseNumber × 2` moves; `makeRevealMove` rejects a player with 7 moves.
3. **Self-join** rejected.
4. **Auto game-end.** `endRound` sets phase `ended` (not `roundEnd`) when either player is at 0 coins after distribution.
5. **Leaving an ended game** is a no-op (no second history row).
6. **Round result.** At `roundEnd`/`ended`, the view carries `roundResult` computed server-side.
7. **Turn timeouts.** `phaseDeadline` (ms epoch) is set whenever the phase changes or whenever a player's action leaves the other player to act. A sweeper (every 5 s) forfeits a player who has not acted by the deadline: treated as `leaveGame` by that player. If neither has acted, the game is abandoned: pots return to their owners and the game ends with settlement by coins. `waiting` has no deadline.
8. **WebSocket subscribe requires a token** (privy or dev). Unauthenticated subscribe is rejected.
9. `shared/src/api.ts` request types are corrected to what the server reads.

### Tests

Fix `scoring.test.ts` with hand-computed expected values including the player 2 mirror. Add engine tests for masking, double-action rejection, auto-end, timeout forfeit, and `computeSettlement`. Add an end-to-end test (`test/e2e.test.ts`) that starts Anvil, runs `DeployLocal`, boots the server in dev auth mode with `SETTLEMENT_ENABLED=true`, and drives two players through funding, a full game to a wipe-out (or a leave), and asserts the on-chain USDC balances after settlement. This test is the definition of "playable".

## 5. Web

### Environment

```
VITE_API_URL, VITE_WS_URL
VITE_AUTH_MODE=privy|dev
VITE_PRIVY_APP_ID              # privy mode
VITE_CHAIN_ID=84532|31337
VITE_RPC_URL
VITE_ESCROW_CONTRACT_ADDRESS
VITE_USDC_CONTRACT_ADDRESS
VITE_EXPLORER_URL              # optional; tx links
```

Addresses are validated at startup with a clear error page if missing.

### Wallet

`lib/chain.ts` replaces `lib/contract.ts`. It exposes `getWalletClient()`, `ensureAllowance(amount)`, `createGameOnChain(serverGameId, stakeUnits)`, `joinGameOnChain(contractGameId)`, `withdrawUnjoinedOnChain`, `getEscrowGame`, `getUsdcBalance`, and `waitForTx(hash)` with `receipt.status` checking. Amounts use `usdcToUnits` from shared. The chain object comes from `VITE_CHAIN_ID` (a local Anvil chain definition for 31337). Before any write the client switches the wallet to that chain.

- **Privy mode:** wallet client from the Privy embedded provider, account = the user's wallet address from the auth store.
- **Dev mode:** a login screen offering four preset identities (Anvil accounts 0 to 3, each with a name). The chosen identity's private key backs a viem local account over `http(VITE_RPC_URL)`; the auth store gets `dev:<userId>` as its token. The preset is remembered in `localStorage` so two browsers can hold two identities. On login the client calls `POST /users/wallet` and, if the USDC balance is zero, `POST /dev/faucet`.

### Flows

**Create.** `POST /games {stake}` → `ensureAllowance(stakeUnits)` → `createGameOnChain` → `waitForTx` → `POST /games/:id/confirm-funding` → navigate. Each step drives a `Seal` state (pending / stamping / sealed). On any failure after the server game exists, navigate to the game page anyway: it shows a "Fund escrow" seal for player 1 that re-runs the chain steps, and a "Cancel" that deletes the unfunded game.

**Join.** `ensureAllowance` → `joinGameOnChain(contractGameId)` → `waitForTx` → `POST /games/:id/join` → navigate. If the server join fails after the chain succeeded, retrying is safe (the server reconciles from chain).

**Play.** Unchanged, plus: a countdown from `phaseDeadline`; masked opponent cells rendered as unknown; the opponent's revealed column highlighted during `finalBet`; `roundResult` from the server instead of recomputing.

**End.** The game-over panel shows the settlement seal: settling (animated), settled with both payouts and a tx link, or failed with the error. Player 1 in a `waiting` funded game gets a "Cancel and refund" button.

### Client fixes

Apply the REST response to state immediately (do not wait for the socket); clear `gameState` on unsubscribe; guard the `CONNECTING` state; offer a manual reconnect after the retry budget; filter your own games out of the join list; home page shows "Resume game" via `GET /games/mine`.

## 6. Art integration

Everything in `docs/art-bible.md` at spec size, integrated into the live game (not only `/design`):

- Board: parchment cell surface with a watercolor wash and ink grid; the 36 numerals as unique suited glyph sprites; your/their highlights as burgundy and gold washes; masked opponent cells drawn as a face-down card back.
- Player sigils generated deterministically from the player id (32×32, symmetric, palette pair from the hash) in the players bar and on results.
- Coin sprites with counts in the players bar and pot.
- JRPG window treatment on the action panel and cards (parchment default, ink for modals and seals, blood for fold/leave).
- Watercolor page backgrounds (generated SVG) for lobby, game, and end.
- `Seal` component with the four on-chain states, used by the create, join, and settlement flows.
- Floating score numbers at reveal and round end; a round-result crest; a game-over tableau with both sigils.
- Fonts loaded (Cinzel, Crimson Text, JetBrains Mono); favicon.
- Synthesized audio cues (WebAudio, no files) for cursor, commit, coin, reveal, win, lose, with a mute toggle remembered in `localStorage`.

## 7. Running it

**Local, no testnet, no Privy** (`scripts/dev-local.sh`): starts Anvil, runs `DeployLocal`, writes both `.env` files from `deployments/local.json`, starts the server in dev auth mode and the web app. Open two browsers, pick two different dev identities, play.

**Base Sepolia with Privy** (`docs/playtest-runbook.md`): create a Privy app, fund a deployer wallet (Sepolia ETH from a faucet, test USDC from Circle's faucet), fund the server wallet with a little ETH for settlement gas, run `Deploy.s.sol`, copy the addresses into the two `.env` files, run server and web, sign in with two Privy accounts on two browsers, fund each embedded wallet with test USDC, play.
