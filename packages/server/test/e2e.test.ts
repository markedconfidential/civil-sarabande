/**
 * End-to-end: Anvil + GameEscrow + the server, two players, real
 * settlement. This test is the definition of "playable".
 *
 * Flow: start anvil on :8546, deploy MockUSDC and GameEscrow from the
 * Foundry artifacts, mint USDC to two player accounts, boot the server
 * in-process in dev auth mode, then drive Alice (Anvil account 1) and Bob
 * (account 2) through onboarding, funding, joining, a full round that
 * wipes one player out, and assert the escrow settles on chain with the
 * exact amounts computeSettlement predicts.
 *
 * Skipped with a message when `anvil` is not available. Waits (up to 25
 * minutes) for the contract artifacts if they are missing or stale.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type Hash,
  type Chain,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  GAME_ESCROW_ABI,
  MOCK_USDC_ABI,
  computeSettlement,
  usdcToUnits,
  type GameStateView,
} from "@civil-sarabande/shared";
import { computeScores } from "../src/game/scoring";

// ---- environment ------------------------------------------------------------

const ANVIL_PORT = 8546;
const RPC_URL = `http://127.0.0.1:${ANVIL_PORT}`;
const CONTRACTS_OUT = resolve(import.meta.dir, "../../contracts/out");
const ESCROW_ARTIFACT = resolve(CONTRACTS_OUT, "GameEscrow.sol/GameEscrow.json");
const USDC_ARTIFACT = resolve(CONTRACTS_OUT, "MockUSDC.sol/MockUSDC.json");

// Well-known Anvil accounts (public test keys).
const ANVIL_KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  alice: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  bob: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  server: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
} as const;

const anvilChain: Chain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
});

function findAnvil(): string | null {
  const onPath = Bun.which("anvil");
  if (onPath) return onPath;
  const home = process.env.HOME ?? "/root";
  const candidate = `${home}/.foundry/bin/anvil`;
  return existsSync(candidate) ? candidate : null;
}

const ANVIL = findAnvil();

interface Artifact {
  abi: readonly unknown[];
  bytecode: { object: `0x${string}` };
}

function readArtifact(path: string): Artifact | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (!parsed?.abi || !parsed?.bytecode?.object) return null;
    return parsed as Artifact;
  } catch {
    return null;
  }
}

function artifactsReady(): boolean {
  const escrow = readArtifact(ESCROW_ARTIFACT);
  const usdc = readArtifact(USDC_ARTIFACT);
  if (!escrow || !usdc) return false;
  const names = new Set(
    (escrow.abi as Array<{ type: string; name?: string }>)
      .filter((item) => item.type === "function")
      .map((item) => item.name)
  );
  return names.has("settleGame") && names.has("cancelGame") && names.has("getGame");
}

/** Poll for the v2 artifacts (another workstream builds them). */
async function waitForArtifacts(maxMs: number, everyMs: number): Promise<boolean> {
  const deadline = Date.now() + maxMs;
  while (!artifactsReady()) {
    if (Date.now() >= deadline) return false;
    console.log(
      `[e2e] waiting for contract artifacts at ${CONTRACTS_OUT} (GameEscrow with settleGame)...`
    );
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
  return true;
}

// ---- helpers ----------------------------------------------------------------

const publicClient = createPublicClient({ chain: anvilChain, transport: http(RPC_URL) });

function wallet(key: `0x${string}`) {
  return createWalletClient({
    account: privateKeyToAccount(key),
    chain: anvilChain,
    transport: http(RPC_URL),
  });
}

async function confirmed(hash: Hash): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tx ${hash} reverted`);
}

async function waitForRpc(maxMs = 15_000): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const id = await publicClient.getChainId();
      if (id === 31337) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("anvil did not come up");
}

interface Api {
  get: (path: string) => Promise<{ status: number; body: any }>;
  post: (path: string, body?: unknown) => Promise<{ status: number; body: any }>;
}

function client(baseUrl: string, token: string | null): Api {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const parse = async (res: Response) => ({ status: res.status, body: await res.json() });
  return {
    get: (path) => fetch(`${baseUrl}${path}`, { headers }).then(parse),
    post: (path, body) =>
      fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }).then(parse),
  };
}

async function ok(promise: Promise<{ status: number; body: any }>, expected = 200) {
  const res = await promise;
  if (res.status !== expected) {
    throw new Error(`expected ${expected}, got ${res.status}: ${JSON.stringify(res.body)}`);
  }
  return res.body;
}

/**
 * Pick move lists that produce a decisive round (no tie) on `board`, so
 * an all-in showdown wipes one player out. Scoring is a pure function of
 * the six committed cells, so the test can choose them up front.
 */
function decisiveMoves(board: readonly number[]): { p1: number[]; p2: number[] } {
  const candidates: Array<[number[], number[]]> = [
    [[0, 3, 1, 4, 2, 5], [0, 3, 1, 4, 2, 5]],
    [[5, 0, 4, 1, 3, 2], [5, 0, 4, 1, 3, 2]],
    [[0, 0, 1, 1, 2, 2], [3, 3, 4, 4, 5, 5]],
    [[2, 4, 0, 1, 5, 3], [1, 2, 3, 0, 4, 5]],
  ];
  for (let i = 0; i < 100; i++) {
    const [p1, p2] =
      i < candidates.length
        ? candidates[i]
        : [
            Array.from({ length: 6 }, () => Math.floor(Math.random() * 6)),
            Array.from({ length: 6 }, () => Math.floor(Math.random() * 6)),
          ];
    const { p1Score, p2Score } = computeScores(board, p1, p2);
    if (p1Score !== p2Score) return { p1, p2 };
  }
  throw new Error("could not find a decisive move set");
}

// ---- the test ---------------------------------------------------------------

const SKIP = !ANVIL;
if (SKIP) {
  console.log("[e2e] anvil not found on PATH or in ~/.foundry/bin; skipping end-to-end test");
}

describe.skipIf(SKIP)("End-to-end: escrow, play, settlement", () => {
  let anvil: ReturnType<typeof Bun.spawn> | null = null;
  let escrowAddress: Address;
  let usdcAddress: Address;
  let running: { url: string; stop: () => Promise<void> } | null = null;

  const deployer = wallet(ANVIL_KEYS.deployer);
  const alice = wallet(ANVIL_KEYS.alice);
  const bob = wallet(ANVIL_KEYS.bob);
  const serverAddress = privateKeyToAccount(ANVIL_KEYS.server).address;

  const STAKE = 5;
  const STAKE_UNITS = usdcToUnits(STAKE);

  async function usdcBalance(address: Address): Promise<bigint> {
    return publicClient.readContract({
      address: usdcAddress,
      abi: MOCK_USDC_ABI,
      functionName: "balanceOf",
      args: [address],
    });
  }

  async function approve(who: typeof alice, amount: bigint): Promise<void> {
    await confirmed(
      await who.writeContract({
        address: usdcAddress,
        abi: MOCK_USDC_ABI,
        functionName: "approve",
        args: [escrowAddress, amount],
      })
    );
  }

  beforeAll(async () => {
    const ready = await waitForArtifacts(25 * 60 * 1000, 60 * 1000);
    if (!ready) throw new Error("contract artifacts never appeared; run `forge build` in packages/contracts");

    anvil = Bun.spawn([ANVIL!, "--port", String(ANVIL_PORT), "--silent"], {
      stdout: "ignore",
      stderr: "inherit",
    });
    await waitForRpc();

    // Deploy MockUSDC and GameEscrow(usdc, server) from account 0.
    const usdcArtifact = readArtifact(USDC_ARTIFACT)!;
    const escrowArtifact = readArtifact(ESCROW_ARTIFACT)!;

    const usdcHash = await deployer.deployContract({
      abi: usdcArtifact.abi as typeof MOCK_USDC_ABI,
      bytecode: usdcArtifact.bytecode.object,
      args: [],
    });
    const usdcReceipt = await publicClient.waitForTransactionReceipt({ hash: usdcHash });
    usdcAddress = usdcReceipt.contractAddress!;

    const escrowHash = await deployer.deployContract({
      abi: escrowArtifact.abi as unknown as readonly [
        { type: "constructor"; inputs: readonly [{ type: "address" }, { type: "address" }] },
      ],
      bytecode: escrowArtifact.bytecode.object,
      args: [usdcAddress, serverAddress],
    });
    const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowHash });
    escrowAddress = escrowReceipt.contractAddress!;

    expect(
      await publicClient.readContract({
        address: escrowAddress,
        abi: GAME_ESCROW_ABI,
        functionName: "serverAddress",
      })
    ).toBe(serverAddress);

    // Fund the players.
    for (const who of [alice.account.address, bob.account.address]) {
      await confirmed(
        await deployer.writeContract({
          address: usdcAddress,
          abi: MOCK_USDC_ABI,
          functionName: "mint",
          args: [who, usdcToUnits(1000)],
        })
      );
    }

    // Boot the server in-process with a fresh config and database.
    process.env.NODE_ENV = "test";
    process.env.AUTH_MODE = "dev";
    process.env.CHAIN_ID = "31337";
    process.env.RPC_URL = RPC_URL;
    process.env.GAME_ESCROW_CONTRACT_ADDRESS = escrowAddress;
    process.env.USDC_CONTRACT_ADDRESS = usdcAddress;
    process.env.SERVER_WALLET_PRIVATE_KEY = ANVIL_KEYS.server;
    process.env.SETTLEMENT_ENABLED = "true";
    process.env.TURN_TIMEOUT_SECONDS = "0";
    process.env.DATABASE_PATH = ":memory:";
    delete process.env.PRIVY_APP_ID;
    delete process.env.PRIVY_APP_SECRET;

    const { resetConfig } = await import("../src/config/env");
    const { closeDatabase } = await import("../src/db/database");
    const { resetChainClients } = await import("../src/blockchain/chainClient");
    const { setSettlementWorker } = await import("../src/blockchain/settlement");
    resetConfig();
    closeDatabase();
    resetChainClients();
    setSettlementWorker(null);

    const { startServer } = await import("../src/server");
    running = startServer({ port: 0 });
  }, 30 * 60 * 1000);

  afterAll(async () => {
    if (running) await running.stop();
    if (anvil) {
      anvil.kill();
      await anvil.exited;
    }
  });

  test(
    "two players fund, play to a wipe-out, and are paid out on chain",
    async () => {
      const base = running!.url;
      const anon = client(base, null);
      const a = client(base, "dev:alice");
      const b = client(base, "dev:bob");

      // Public config
      const cfg = await ok(anon.get("/config"));
      expect(cfg).toEqual({
        authMode: "dev",
        chainId: 31337,
        escrowAddress,
        usdcAddress,
        turnTimeoutSeconds: 0,
        settlementEnabled: true,
      });

      // Auth is required
      expect((await anon.get("/users/me")).status).toBe(401);
      expect((await client(base, "dev:bad id!").get("/users/me")).status).toBe(401);

      // Onboarding
      for (const [api, name, address] of [
        [a, "alice", alice.account.address],
        [b, "bob", bob.account.address],
      ] as const) {
        const me = await ok(api.get("/users/me"));
        expect(me.user.needsUsername).toBe(true);
        await ok(api.post("/users/username", { username: name }));
        const walletRes = await ok(api.post("/users/wallet", { walletAddress: address }));
        expect(walletRes.user.walletAddress).toBe(address);
        const balance = await ok(api.get("/wallet/balance"));
        expect(balance).toEqual({ address, balance: "1000", balanceUnits: "1000000000" });
      }

      // Faucet works in dev mode (server wallet mints).
      const faucet = await ok(a.post("/dev/faucet", { address: alice.account.address, amount: 1 }));
      expect(faucet.success).toBe(true);
      const aliceStart = await usdcBalance(alice.account.address);
      const bobStart = await usdcBalance(bob.account.address);
      expect(aliceStart).toBe(usdcToUnits(1001));

      // Create (unfunded)
      const created = await ok(a.post("/games", { stake: STAKE }), 201);
      const game: GameStateView = created.game;
      const gameId = game.gameId;
      expect(game.escrow.status).toBe("unfunded");
      expect(game.escrow.stakeUnits).toBe(STAKE_UNITS.toString());
      expect(game.phase).toBe("waiting");
      expect(game.phaseDeadline).toBeNull();

      // Unfunded games are not listed and cannot be joined.
      expect((await ok(anon.get("/games/waiting"))).games).toEqual([]);
      expect((await b.post(`/games/${gameId}/join`)).status).toBe(400);
      // Confirming before the deposit is a clean 400.
      const early = await a.post(`/games/${gameId}/confirm-funding`);
      expect(early.status).toBe(400);
      expect(early.body.error).toContain("Escrow not found");
      // Only player 1 may confirm.
      expect((await b.post(`/games/${gameId}/confirm-funding`)).status).toBe(403);

      // Alice funds on chain, then confirms.
      await approve(alice, STAKE_UNITS);
      await confirmed(
        await alice.writeContract({
          address: escrowAddress,
          abi: GAME_ESCROW_ABI,
          functionName: "createGame",
          args: [gameId, STAKE_UNITS],
        })
      );
      const funded = await ok(a.post(`/games/${gameId}/confirm-funding`, { txHash: "0x" }));
      expect(funded.game.escrow.status).toBe("funded");
      expect(funded.game.escrow.contractGameId).toBe(
        await publicClient.readContract({
          address: escrowAddress,
          abi: GAME_ESCROW_ABI,
          functionName: "getGameIdFromServerId",
          args: [gameId],
        })
      );
      // Idempotent
      expect((await ok(a.post(`/games/${gameId}/confirm-funding`))).game.escrow.status).toBe("funded");

      // Listed now; Alice can resume it via /games/mine.
      const waiting = await ok(anon.get("/games/waiting"));
      expect(waiting.games.map((g: { gameId: string }) => g.gameId)).toEqual([gameId]);
      expect((await ok(a.get("/games/mine"))).game.gameId).toBe(gameId);
      expect((await ok(b.get("/games/mine"))).game).toBeNull();

      // Bob cannot join before depositing; Alice cannot join her own game.
      const noDeposit = await b.post(`/games/${gameId}/join`);
      expect(noDeposit.status).toBe(400);
      expect(noDeposit.body.error).toContain("no player 2 deposit");
      expect((await a.post(`/games/${gameId}/join`)).body.error).toBe("Cannot join your own game");
      // An open table is readable by a prospective joiner (they need the
      // escrow id and stake before depositing), seen as player 2.
      const openTable = await ok(b.get(`/games/${gameId}`));
      expect(openTable.game.yourRole).toBe("player2");
      expect(openTable.game.escrow.contractGameId).toBe(funded.game.escrow.contractGameId);

      // Bob deposits and joins.
      await approve(bob, STAKE_UNITS);
      await confirmed(
        await bob.writeContract({
          address: escrowAddress,
          abi: GAME_ESCROW_ABI,
          functionName: "joinGame",
          args: [game.escrow.contractGameId],
        })
      );
      const joined = await ok(b.post(`/games/${gameId}/join`));
      expect(joined.game.phase).toBe("move1");
      expect(joined.game.escrow.status).toBe("active");
      expect(joined.game.yourRole).toBe("player2");
      // Idempotent for the same user
      expect((await ok(b.post(`/games/${gameId}/join`))).game.phase).toBe("move1");
      expect((await ok(anon.get("/games/waiting"))).games).toEqual([]);

      // WebSocket: a subscribe without a token is rejected; with one it works.
      await new Promise<void>((resolveWs, rejectWs) => {
        const ws = new WebSocket(`${base.replace("http", "ws")}/ws`);
        const timer = setTimeout(() => rejectWs(new Error("ws timeout")), 5000);
        let stage = 0;
        ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", gameId }));
        ws.onmessage = (event) => {
          const msg = JSON.parse(String(event.data));
          if (stage === 0) {
            expect(msg.type).toBe("error");
            expect(msg.error).toContain("token");
            stage = 1;
            ws.send(JSON.stringify({ type: "subscribe", gameId, token: "dev:alice" }));
          } else {
            expect(msg.type).toBe("subscribed");
            expect(msg.game.yourRole).toBe("player1");
            clearTimeout(timer);
            ws.close();
            resolveWs();
          }
        };
        ws.onerror = () => rejectWs(new Error("ws error"));
      });

      // Play: choose a decisive board outcome, go all in at bet1.
      const board = joined.game.board as number[];
      const { p1, p2 } = decisiveMoves(board);
      const { p1Score, p2Score } = computeScores(board, p1, p2);

      let view = (await ok(a.post(`/games/${gameId}/move`, { selfColumn: p1[0], otherRow: p1[1] }))).game;
      expect(view.yourTurn).toBe(false);
      // A second move in the same phase is rejected.
      expect((await a.post(`/games/${gameId}/move`, { selfColumn: 0, otherRow: 0 })).status).toBe(400);
      view = (await ok(b.post(`/games/${gameId}/move`, { selfColumn: p2[0], otherRow: p2[1] }))).game;
      expect(view.phase).toBe("bet1");
      // Bob's view hides Alice's column but shows her row assignment.
      expect(view.theirMoves).toEqual([-1, p1[1]]);

      view = (await ok(a.post(`/games/${gameId}/bet`, { amount: 99 }))).game;
      expect(view.yourCoins).toBe(0);
      view = (await ok(b.post(`/games/${gameId}/bet`, { amount: 99 }))).game;
      expect(view.phase).toBe("move2");

      for (const i of [1, 2]) {
        await ok(a.post(`/games/${gameId}/move`, { selfColumn: p1[i * 2], otherRow: p1[i * 2 + 1] }));
        await ok(b.post(`/games/${gameId}/move`, { selfColumn: p2[i * 2], otherRow: p2[i * 2 + 1] }));
        await ok(a.post(`/games/${gameId}/bet`, { amount: 0 }));
        view = (await ok(b.post(`/games/${gameId}/bet`, { amount: 0 }))).game;
      }
      expect(view.phase).toBe("reveal");

      await ok(a.post(`/games/${gameId}/reveal`, { revealColumn: p1[0] }));
      view = (await ok(b.post(`/games/${gameId}/reveal`, { revealColumn: p2[0] }))).game;
      expect(view.phase).toBe("finalBet");
      expect(view.theirRevealedColumn).toBe(p1[0]);

      await ok(a.post(`/games/${gameId}/bet`, { amount: 0 }));
      view = (await ok(b.post(`/games/${gameId}/bet`, { amount: 0 }))).game;
      expect(view.phase).toBe("roundEnd");

      await ok(a.post(`/games/${gameId}/end-round`));
      view = (await ok(b.post(`/games/${gameId}/end-round`))).game;

      // The wipe-out ends the game without /next-round.
      expect(view.phase).toBe("ended");
      expect(view.roundResult).toEqual({
        roundNumber: 1,
        player1Score: p1Score,
        player2Score: p2Score,
        winner: p1Score > p2Score ? "player1" : "player2",
        potWon: 200,
        byFold: false,
      });
      const p1Coins = p1Score > p2Score ? 200 : 0;
      const p2Coins = 200 - p1Coins;
      expect(view.theirCoins).toBe(p1Coins);
      expect(view.yourCoins).toBe(p2Coins);

      // Settlement lands on chain.
      let settled: GameStateView | null = null;
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const current: GameStateView = (await ok(a.get(`/games/${gameId}`))).game;
        if (current.escrow.status === "settled") {
          settled = current;
          break;
        }
        if (current.escrow.status === "failed") {
          throw new Error(`settlement failed: ${current.escrow.error}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(settled).not.toBeNull();

      const expected = computeSettlement(STAKE_UNITS, p1Coins, p2Coins);
      expect(settled!.escrow.payoutTxHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(settled!.escrow.yourPayout).toBe(expected.player1Amount.toString());
      expect(settled!.escrow.theirPayout).toBe(expected.player2Amount.toString());
      expect(settled!.escrow.error).toBeNull();

      const bobView: GameStateView = (await ok(b.get(`/games/${gameId}`))).game;
      expect(bobView.escrow.yourPayout).toBe(expected.player2Amount.toString());

      const receipt = await publicClient.getTransactionReceipt({
        hash: settled!.escrow.payoutTxHash as Hash,
      });
      expect(receipt.status).toBe("success");
      expect(receipt.from.toLowerCase()).toBe(serverAddress.toLowerCase());

      expect(await usdcBalance(alice.account.address)).toBe(
        aliceStart - STAKE_UNITS + expected.player1Amount
      );
      expect(await usdcBalance(bob.account.address)).toBe(bobStart - STAKE_UNITS + expected.player2Amount);
      expect(await usdcBalance(escrowAddress)).toBe(0n);

      const onChain = await publicClient.readContract({
        address: escrowAddress,
        abi: GAME_ESCROW_ABI,
        functionName: "getGame",
        args: [game.escrow.contractGameId],
      });
      expect(onChain.status).toBe(3); // Settled
      expect(onChain.totalDeposits).toBe(0n);

      // Leaving an ended game is a no-op; the game is out of /games/mine.
      expect((await ok(a.post(`/games/${gameId}/leave`))).game.phase).toBe("ended");
      expect((await ok(a.get("/games/mine"))).game).toBeNull();

      console.log(
        `[e2e] settled: alice ${expected.player1Amount} units, bob ${expected.player2Amount} units, tx ${settled!.escrow.payoutTxHash}`
      );
    },
    120_000
  );

  test(
    "player 1 can cancel a funded, unjoined game and is refunded",
    async () => {
      const base = running!.url;
      const a = client(base, "dev:alice");
      const b = client(base, "dev:bob");

      const created = await ok(a.post("/games", { stake: 2 }), 201);
      const gameId: string = created.game.gameId;
      const before = await usdcBalance(alice.account.address);

      await approve(alice, usdcToUnits(2));
      await confirmed(
        await alice.writeContract({
          address: escrowAddress,
          abi: GAME_ESCROW_ABI,
          functionName: "createGame",
          args: [gameId, usdcToUnits(2)],
        })
      );
      expect(await usdcBalance(alice.account.address)).toBe(before - usdcToUnits(2));

      // GET reconciles the deposit even without confirm-funding.
      const reconciled = await ok(a.get(`/games/${gameId}`));
      expect(reconciled.game.escrow.status).toBe("funded");

      expect((await b.post(`/games/${gameId}/cancel`)).status).toBe(403);
      const cancelled = await ok(a.post(`/games/${gameId}/cancel`));
      expect(cancelled.game.phase).toBe("ended");
      expect(cancelled.game.escrow.status).toBe("cancelled");
      expect(cancelled.game.escrow.payoutTxHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(await usdcBalance(alice.account.address)).toBe(before);
    },
    60_000
  );

  test(
    "an unfunded game is deleted on cancel",
    async () => {
      const base = running!.url;
      const a = client(base, "dev:alice");
      const created = await ok(a.post("/games", { stake: 1 }), 201);
      const gameId: string = created.game.gameId;
      const cancelled = await ok(a.post(`/games/${gameId}/cancel`));
      expect(cancelled.game.escrow.status).toBe("cancelled");
      expect((await a.get(`/games/${gameId}`)).status).toBe(404);
    },
    30_000
  );

  test(
    "a chain-joined game is reconciled on GET for player 1",
    async () => {
      const base = running!.url;
      const a = client(base, "dev:alice");
      const b = client(base, "dev:bob");

      const created = await ok(a.post("/games", { stake: 1 }), 201);
      const gameId: string = created.game.gameId;
      const contractGameId = created.game.escrow.contractGameId;

      await approve(alice, usdcToUnits(1));
      await confirmed(
        await alice.writeContract({
          address: escrowAddress,
          abi: GAME_ESCROW_ABI,
          functionName: "createGame",
          args: [gameId, usdcToUnits(1)],
        })
      );
      await ok(a.post(`/games/${gameId}/confirm-funding`));

      // Bob pays but never calls /join.
      await approve(bob, usdcToUnits(1));
      await confirmed(
        await bob.writeContract({
          address: escrowAddress,
          abi: GAME_ESCROW_ABI,
          functionName: "joinGame",
          args: [contractGameId],
        })
      );

      const view = await ok(a.get(`/games/${gameId}`));
      expect(view.game.phase).toBe("move1");
      expect(view.game.player2.id).toBe("bob");
      expect(view.game.escrow.status).toBe("active");
      expect((await ok(b.get("/games/mine"))).game.gameId).toBe(gameId);

      // Bob leaves: settlement by coins after the penalty.
      const left = await ok(b.post(`/games/${gameId}/leave`));
      expect(left.game.phase).toBe("ended");
      expect(left.game.yourCoins).toBe(93);
      expect(left.game.theirCoins).toBe(107);

      const bobBefore = await usdcBalance(bob.account.address);
      let status = "";
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        status = (await ok(b.get(`/games/${gameId}`))).game.escrow.status;
        if (status === "settled" || status === "failed") break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(status).toBe("settled");
      const expected = computeSettlement(usdcToUnits(1), 107, 93);
      expect(await usdcBalance(bob.account.address)).toBe(bobBefore + expected.player2Amount);
    },
    60_000
  );
});
