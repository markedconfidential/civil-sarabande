/**
 * GameEscrow v2 ABI and the ERC-20 subset the app needs.
 *
 * This is the only copy of the escrow ABI. The server, the web client and the
 * tests all import it from here; keep it in sync with
 * packages/contracts/src/GameEscrow.sol.
 */

/** Mirrors `enum Status` in GameEscrow.sol. */
export const ESCROW_STATUS = {
  None: 0,
  Created: 1,
  Active: 2,
  Settled: 3,
  Cancelled: 4,
  TimedOut: 5,
} as const;

export type EscrowChainStatus = (typeof ESCROW_STATUS)[keyof typeof ESCROW_STATUS];

export const GAME_ESCROW_ABI = [
  // ---- reads ----------------------------------------------------------
  {
    type: "function",
    name: "usdcToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "serverAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "SETTLEMENT_TIMEOUT",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getGame",
    stateMutability: "view",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "player1", type: "address" },
          { name: "player2", type: "address" },
          { name: "stake", type: "uint256" },
          { name: "totalDeposits", type: "uint256" },
          { name: "status", type: "uint8" },
          { name: "createdAt", type: "uint64" },
          { name: "activatedAt", type: "uint64" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getGameIdFromServerId",
    stateMutability: "pure",
    inputs: [{ name: "serverGameId", type: "string" }],
    outputs: [{ name: "", type: "bytes32" }],
  },
  // ---- player writes --------------------------------------------------
  {
    type: "function",
    name: "createGame",
    stateMutability: "nonpayable",
    inputs: [
      { name: "serverGameId", type: "string" },
      { name: "stake", type: "uint256" },
    ],
    outputs: [{ name: "gameId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "joinGame",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawUnjoined",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimTimeout",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  // ---- server writes --------------------------------------------------
  {
    type: "function",
    name: "settleGame",
    stateMutability: "nonpayable",
    inputs: [
      { name: "gameId", type: "bytes32" },
      { name: "player1Amount", type: "uint256" },
      { name: "player2Amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelGame",
    stateMutability: "nonpayable",
    inputs: [{ name: "gameId", type: "bytes32" }],
    outputs: [],
  },
  // ---- owner writes ---------------------------------------------------
  {
    type: "function",
    name: "setServerAddress",
    stateMutability: "nonpayable",
    inputs: [{ name: "newServer", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
  },
  // ---- events ---------------------------------------------------------
  {
    type: "event",
    name: "GameCreated",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "serverGameId", type: "string", indexed: false },
      { name: "player1", type: "address", indexed: true },
      { name: "stake", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PlayerJoined",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "player2", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "GameSettled",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "player1Amount", type: "uint256", indexed: false },
      { name: "player2Amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GameCancelled",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "refund1", type: "uint256", indexed: false },
      { name: "refund2", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GameTimedOut",
    inputs: [
      { name: "gameId", type: "bytes32", indexed: true },
      { name: "claimant", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "ServerAddressUpdated",
    inputs: [
      { name: "previous", type: "address", indexed: true },
      { name: "current", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "OwnershipTransferred",
    inputs: [
      { name: "previous", type: "address", indexed: true },
      { name: "current", type: "address", indexed: true },
    ],
  },
] as const;

/** The ERC-20 surface the app uses for USDC. */
export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

/** MockUSDC (local Anvil only) adds a public mint. */
export const MOCK_USDC_ABI = [
  ...ERC20_ABI,
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;
