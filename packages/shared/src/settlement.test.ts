import { describe, expect, test } from "bun:test";
import { computeSettlement, unitsToUsdc, usdcToUnits } from "./settlement";

const ONE_USDC = 1_000_000n;

describe("computeSettlement", () => {
  test("wipe-out pays the winner everything", () => {
    const s = computeSettlement(5n * ONE_USDC, 200, 0);
    expect(s.player1Amount).toBe(10n * ONE_USDC);
    expect(s.player2Amount).toBe(0n);
  });

  test("even coins split evenly", () => {
    const s = computeSettlement(5n * ONE_USDC, 100, 100);
    expect(s.player1Amount).toBe(5n * ONE_USDC);
    expect(s.player2Amount).toBe(5n * ONE_USDC);
  });

  test("proportional split always sums to the total", () => {
    const stake = 1234567n;
    for (let c1 = 0; c1 <= 200; c1 += 7) {
      const s = computeSettlement(stake, c1, 200 - c1);
      expect(s.player1Amount + s.player2Amount).toBe(stake * 2n);
      expect(s.player1Amount).toBe((stake * 2n * BigInt(c1)) / 200n);
    }
  });

  test("rounding remainder goes to player 2", () => {
    const s = computeSettlement(1n, 1, 2); // total 2 units, p1 gets floor(2/3) = 0
    expect(s.player1Amount).toBe(0n);
    expect(s.player2Amount).toBe(2n);
  });

  test("zero coins on both sides refunds evenly", () => {
    const s = computeSettlement(3n * ONE_USDC, 0, 0);
    expect(s.player1Amount).toBe(3n * ONE_USDC);
    expect(s.player2Amount).toBe(3n * ONE_USDC);
  });

  test("negative coins are treated as zero", () => {
    const s = computeSettlement(ONE_USDC, -5, 205);
    expect(s.player1Amount).toBe(0n);
    expect(s.player2Amount).toBe(2n * ONE_USDC);
  });

  test("rejects non-integer coins", () => {
    expect(() => computeSettlement(ONE_USDC, 1.5, 198.5)).toThrow();
  });
});

describe("usdcToUnits", () => {
  test("converts whole and fractional amounts exactly", () => {
    expect(usdcToUnits(1)).toBe(ONE_USDC);
    expect(usdcToUnits(1.5)).toBe(1_500_000n);
    expect(usdcToUnits("0.1")).toBe(100_000n);
    expect(usdcToUnits("0.000001")).toBe(1n);
    expect(usdcToUnits("12345.678901")).toBe(12_345_678_901n);
  });

  test("rejects too many decimals and bad input", () => {
    expect(() => usdcToUnits("0.0000001")).toThrow();
    expect(() => usdcToUnits("-1")).toThrow();
    expect(() => usdcToUnits("abc")).toThrow();
  });
});

describe("unitsToUsdc", () => {
  test("formats and trims trailing zeros", () => {
    expect(unitsToUsdc(ONE_USDC)).toBe("1");
    expect(unitsToUsdc(1_500_000n)).toBe("1.5");
    expect(unitsToUsdc(1n)).toBe("0.000001");
    expect(unitsToUsdc(0n)).toBe("0");
    expect(unitsToUsdc(-2_250_000n)).toBe("-2.25");
  });

  test("round-trips with usdcToUnits", () => {
    for (const v of ["0.5", "3", "99.999999", "1000000"]) {
      expect(unitsToUsdc(usdcToUnits(v))).toBe(v);
    }
  });
});
