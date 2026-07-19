import { describe, expect, it } from "vitest";
import { average, maxPairwiseDivergenceBps, pairwiseDivergenceBps } from "../src/divergence";

describe("pairwiseDivergenceBps", () => {
  it("computes basis-point divergence between two values", () => {
    // (1.25 / 2650) * 10000 = 4.716..., floored to 4.
    expect(pairwiseDivergenceBps(2650, 2651.25)).toBe(4);
  });

  it("is zero for equal values", () => {
    expect(pairwiseDivergenceBps(2650, 2650)).toBe(0);
  });

  it("throws for non-positive inputs", () => {
    expect(() => pairwiseDivergenceBps(0, 2650)).toThrow(/non-positive/);
    expect(() => pairwiseDivergenceBps(2650, -1)).toThrow(/non-positive/);
  });

  it("avoids float-drift false positives on values that are exact in decimal but not in binary floating point", () => {
    // 0.1 + 0.2 !== 0.3 in IEEE754; a naive (diff/base)*10000 float
    // computation over decimal-looking source prices can drift across an
    // integer bps threshold. 2650.10 and 2650.20 diverge by exactly
    // (0.10/2650.10)*10000 ≈ 0.377 bps, which floors to 0.
    expect(pairwiseDivergenceBps(2650.1, 2650.2)).toBe(0);
  });

  it("is symmetric regardless of argument order", () => {
    expect(pairwiseDivergenceBps(2650, 2651.25)).toBe(pairwiseDivergenceBps(2651.25, 2650));
  });
});

describe("maxPairwiseDivergenceBps", () => {
  it("returns 0 for zero or one source values", () => {
    expect(maxPairwiseDivergenceBps([])).toBe(0);
    expect(maxPairwiseDivergenceBps([2650])).toBe(0);
  });

  it("returns the largest pairwise divergence across three or more sources", () => {
    const values = [2650, 2651, 3000];
    const expected = Math.max(
      pairwiseDivergenceBps(2650, 2651),
      pairwiseDivergenceBps(2650, 3000),
      pairwiseDivergenceBps(2651, 3000),
    );
    expect(maxPairwiseDivergenceBps(values)).toBe(expected);
  });
});

describe("average", () => {
  it("averages a set of values without float drift", () => {
    expect(average([2650, 2651.25])).toBeCloseTo(2650.625);
  });

  it("throws for an empty array", () => {
    expect(() => average([])).toThrow(/empty/);
  });

  it("matches the naive float average for well-behaved decimal inputs", () => {
    const values = [0.1, 0.2, 0.3];
    expect(average(values)).toBeCloseTo(0.2);
  });
});
