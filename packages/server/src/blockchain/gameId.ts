/**
 * Server game id → escrow contract game id.
 *
 * Kept separate from the chain client so the pure engine can import it
 * without pulling in RPC clients.
 */

import { keccak256, stringToBytes } from "viem";

/** keccak256(abi.encodePacked(serverGameId)), identical to GameEscrow.getGameIdFromServerId. */
export function contractGameIdFor(serverGameId: string): `0x${string}` {
  return keccak256(stringToBytes(serverGameId));
}
