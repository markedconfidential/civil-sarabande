# Scripts

## dev-local.sh

One-command local playtest loop with no testnet and no Privy: starts Anvil, deploys `MockUSDC` and `GameEscrow`, writes `packages/server/.env.local` and `packages/web/.env.local`, and starts the server (dev auth mode) and the web app.

```bash
scripts/dev-local.sh            # start everything
scripts/dev-local.sh --reset    # wipe the local database first
```

Open http://localhost:5173 in two browsers, pick two different dev identities, create a game in one and join it in the other. See `docs/playtest-runbook.md` for the full walkthrough and the Base Sepolia path.

Environment overrides: `ANVIL_PORT`, `SERVER_PORT`, `WEB_PORT`, `TURN_TIMEOUT_SECONDS`, `LOG_LEVEL`, and `FORGE_FLAGS` (set to `--offline` when the compiler download host is unreachable).

## Automated playthroughs

The old curl-based playthrough script predates authentication and escrow and has been removed. The end-to-end coverage now lives in the test suites:

- `packages/server/test/e2e.test.ts` spawns Anvil, deploys the contracts from the Foundry artifacts, boots the server in dev auth mode, funds and joins a game through the API with two players, plays to a finish, and asserts the settled USDC balances on chain. Run it with `bun test` from `packages/server` (it skips itself when `anvil` is not on `PATH`).
- `packages/contracts/test/GameEscrow.t.sol` covers the contract; run `forge test` from `packages/contracts`.

## check-analytics.sh

Prints the most recent rows of `game_history` from the local SQLite database.
