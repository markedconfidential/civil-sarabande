/**
 * Settlement math: how final coin balances map to USDC payouts.
 *
 * The stake is a buy-in. Each player's 100 starting coins represent their
 * stake, so at game end each side is paid the escrow total in proportion to
 * the coins they hold. This is the only definition of that rule; the server
 * uses it to settle on chain and the client uses it to preview payouts.
 */

export const USDC_DECIMALS = 6;
const UNIT = 10n ** BigInt(USDC_DECIMALS);

export interface Settlement {
  player1Amount: bigint;
  player2Amount: bigint;
}

/**
 * Split the escrow (2 × stake) between the players in proportion to their
 * final coins. The rounding remainder, at most one base unit, goes to
 * player 2 so the amounts always sum to the total.
 */
export function computeSettlement(
  stakeUnits: bigint,
  player1Coins: number,
  player2Coins: number
): Settlement {
  if (stakeUnits < 0n) throw new Error("stakeUnits must be non-negative");
  if (!Number.isInteger(player1Coins) || !Number.isInteger(player2Coins)) {
    throw new Error("coin counts must be integers");
  }
  const p1 = Math.max(0, player1Coins);
  const p2 = Math.max(0, player2Coins);
  const total = stakeUnits * 2n;
  const coinTotal = BigInt(p1 + p2);

  if (coinTotal === 0n) {
    // Degenerate: nobody holds coins. Refund evenly.
    const half = total / 2n;
    return { player1Amount: half, player2Amount: total - half };
  }

  const player1Amount = (total * BigInt(p1)) / coinTotal;
  return { player1Amount, player2Amount: total - player1Amount };
}

/**
 * Convert a USDC amount expressed as a decimal number (e.g. 1.5) to base
 * units without floating-point drift. Accepts up to 6 decimal places.
 */
export function usdcToUnits(amount: number | string): bigint {
  const text = typeof amount === "number" ? amount.toString() : amount.trim();
  if (!/^\d+(\.\d+)?$/.test(text)) {
    throw new Error(`Invalid USDC amount: ${text}`);
  }
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > USDC_DECIMALS) {
    throw new Error(`USDC supports at most ${USDC_DECIMALS} decimal places`);
  }
  const padded = (fraction + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return BigInt(whole) * UNIT + BigInt(padded);
}

/** Format base units as a decimal USDC string with trailing zeros trimmed. */
export function unitsToUsdc(units: bigint): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / UNIT;
  const fraction = (abs % UNIT).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "");
  const text = fraction.length > 0 ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${text}` : text;
}
