/**
 * API Types
 *
 * Request and response types for the REST API and the WebSocket protocol.
 *
 * Identity always comes from the bearer token; request bodies never carry a
 * player id. In dev auth mode the token is `dev:<userId>`.
 */

import type {
  EscrowStatus,
  GamePhase,
  MagicSquare,
  MoveList,
  Player,
  RoundResult,
} from "./types";

// ============================================================================
// Request Types
// ============================================================================

/** POST /games */
export interface CreateGameRequest {
  /** Stake per player in USDC (decimal, up to 6 places) */
  stake: number;
}

/**
 * POST /games/:id/confirm-funding — player 1 reports that their createGame
 * transaction is mined. The hash is informational; the server verifies the
 * escrow state on chain.
 */
export interface ConfirmFundingRequest {
  txHash?: string;
}

/**
 * POST /games/:id/join — player 2 has already called joinGame on chain. The
 * server verifies the escrow shows them as player2 before joining.
 */
export interface JoinGameRequest {
  txHash?: string;
}

/** POST /games/:id/move */
export interface MakeMoveRequest {
  /** Column the player chooses for themselves (0-5) */
  selfColumn: number;
  /** Row the player assigns to their opponent (0-5) */
  otherRow: number;
}

/** POST /games/:id/bet */
export interface MakeBetRequest {
  /** Number of coins to add to the pot (0 = check) */
  amount: number;
}

/** POST /games/:id/reveal */
export interface RevealMoveRequest {
  /** Which of their 3 columns to reveal (must be one they chose) */
  revealColumn: number;
}

/** POST /users/wallet */
export interface SetWalletRequest {
  walletAddress: string;
}

/** POST /dev/faucet (dev auth mode only) */
export interface FaucetRequest {
  address: string;
  /** USDC amount as a decimal number */
  amount: number;
}

// Routes with no body: /games/:id/fold, /end-round, /next-round, /leave, /cancel

// ============================================================================
// Response Types
// ============================================================================

/** Escrow state as seen by one player. Amounts are USDC base units as strings. */
export interface EscrowView {
  status: EscrowStatus;
  contractGameId: `0x${string}`;
  /** Stake per player in base units */
  stakeUnits: string;
  payoutTxHash: string | null;
  yourPayout: string | null;
  theirPayout: string | null;
  error: string | null;
}

/** Player-specific view of the game state */
export interface GameStateView {
  /** Unique game identifier */
  gameId: string;
  /** The 6x6 magic square board */
  board: MagicSquare;
  /** Current phase of the game */
  phase: GamePhase;
  /** Player 1 info */
  player1: Player;
  /** Player 2 info (null if waiting) */
  player2: Player | null;
  /** Current round number */
  roundNumber: number;
  /** Stake per player in USDC */
  stake: number;
  /** Timestamp when game was created */
  createdAt: number;

  // Player-specific coin info
  /** Your remaining coins */
  yourCoins: number;
  /** Opponent's remaining coins */
  theirCoins: number;
  /** Your coins in the pot */
  yourPotCoins: number;
  /** Opponent's coins in the pot */
  theirPotCoins: number;

  // Betting state
  /** Whether you have made your bet this round */
  yourBetMade: boolean;
  /** Whether opponent has made your bet this round */
  theirBetMade: boolean;
  /** Last matched pot amount */
  settledPotCoins: number;

  // Round end state
  /** Whether you have signaled round end */
  yourEndedRound: boolean;
  /** Whether opponent has signaled round end */
  theirEndedRound: boolean;

  // Moves
  /** Your moves so far */
  yourMoves: MoveList;
  /**
   * Opponent's moves, truncated to the committed length. Their own column
   * choices (even indices 0, 2, 4) are HIDDEN_MOVE until the round ends; row
   * assignments (odd indices) are always visible; their reveal (index 6) is
   * visible once both players have revealed.
   */
  theirMoves: MoveList;
  /** The column the opponent revealed, once both have revealed; else null */
  theirRevealedColumn: number | null;

  /** Which player you are */
  yourRole: "player1" | "player2";

  // Timing and results
  /** Epoch ms deadline for the pending action(s); null when no clock runs */
  phaseDeadline: number | null;
  /** Whether it is you who must act before the deadline */
  yourTurn: boolean;
  /** Result of the most recent completed round; null before the first roundEnd */
  roundResult: RoundResult | null;

  /** Escrow state */
  escrow: EscrowView;
}

/** Response for game creation and every state-returning game route */
export interface GameResponse {
  game: GameStateView;
}

/** Alias kept for callers that predate GameResponse */
export type CreateGameResponse = GameResponse;

/** GET /games/waiting */
export interface WaitingGamesResponse {
  /** Funded games available to join */
  games: Array<{
    gameId: string;
    player1: Player;
    stake: number;
    createdAt: number;
  }>;
}

/** GET /games/mine */
export interface MyGameResponse {
  game: GameStateView | null;
}

/** GET /wallet/balance */
export interface WalletBalanceResponse {
  address: string;
  /** USDC balance as a decimal string */
  balance: string;
  /** USDC balance in base units */
  balanceUnits: string;
}

/** GET /config — public runtime configuration the client needs */
export interface ClientConfigResponse {
  authMode: "privy" | "dev";
  chainId: number;
  escrowAddress: string;
  usdcAddress: string;
  turnTimeoutSeconds: number;
  settlementEnabled: boolean;
}

/** Generic error response */
export interface ErrorResponse {
  /** Error message */
  error: string;
}

/** Generic success response */
export interface SuccessResponse {
  /** Success indicator */
  success: true;
  /** Updated game state */
  game: GameStateView;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

/** Client -> Server: Subscribe to a game */
export interface WSSubscribeMessage {
  type: "subscribe";
  /** Game ID to subscribe to */
  gameId: string;
  /** Bearer token (privy access token or dev:<userId>); required */
  token: string;
  /** Player ID; must match the token's identity when present */
  playerId?: string;
}

/** Client -> Server: Unsubscribe from a game */
export interface WSUnsubscribeMessage {
  type: "unsubscribe";
  /** Game ID to unsubscribe from */
  gameId: string;
  playerId?: string;
}

/** Client -> Server: Ping to keep connection alive */
export interface WSPingMessage {
  type: "ping";
}

/** All possible client -> server messages */
export type WSClientMessage =
  | WSSubscribeMessage
  | WSUnsubscribeMessage
  | WSPingMessage;

/** Server -> Client: Subscription confirmed */
export interface WSSubscribedMessage {
  type: "subscribed";
  /** Game ID subscribed to */
  gameId: string;
  /** Current game state */
  game: GameStateView;
}

/** Server -> Client: Unsubscription confirmed */
export interface WSUnsubscribedMessage {
  type: "unsubscribed";
  /** Game ID unsubscribed from */
  gameId: string;
}

/** What triggered a game state update */
export type GameUpdateAction =
  | "join"
  | "funded"
  | "move"
  | "bet"
  | "fold"
  | "reveal"
  | "endRound"
  | "nextRound"
  | "leave"
  | "timeout"
  | "settlement"
  | "cancel";

/** Server -> Client: Game state update */
export interface WSGameStateUpdateMessage {
  type: "gameStateUpdate";
  /** Game ID that was updated */
  gameId: string;
  /** Updated game state (player-specific view) */
  game: GameStateView;
  /** What action triggered this update */
  action: GameUpdateAction | string;
}

/** Server -> Client: Player joined the game */
export interface WSPlayerJoinedMessage {
  type: "playerJoined";
  /** Game ID */
  gameId: string;
  /** Player who joined */
  player: Player;
  /** Updated game state */
  game: GameStateView;
}

/** Server -> Client: Player left the game */
export interface WSPlayerLeftMessage {
  type: "playerLeft";
  /** Game ID */
  gameId: string;
  /** Player who left */
  playerId: string;
  /** Updated game state */
  game: GameStateView;
}

/** Server -> Client: Error message */
export interface WSErrorMessage {
  type: "error";
  /** Error description */
  error: string;
  /** Related game ID (if applicable) */
  gameId?: string;
}

/** Server -> Client: Pong response */
export interface WSPongMessage {
  type: "pong";
  /** Server timestamp */
  timestamp: number;
}

/** All possible server -> client messages */
export type WSServerMessage =
  | WSSubscribedMessage
  | WSUnsubscribedMessage
  | WSGameStateUpdateMessage
  | WSPlayerJoinedMessage
  | WSPlayerLeftMessage
  | WSErrorMessage
  | WSPongMessage;
