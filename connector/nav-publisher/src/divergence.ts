import { Decimal } from "decimal.js";

/**
 * Pairwise divergence in basis points between two source values, mirroring
 * daml/Oracle.daml's `divergenceBps`: |a-b| / min(a,b) * 10000, floored.
 *
 * Computed with decimal.js rather than raw floating-point arithmetic:
 * `Math.abs`/division/multiplication on JS numbers can drift by a few ULPs
 * for the decimal fractions XAU sources typically report (e.g. "2650.005"),
 * and since this value is compared directly against an integer bps
 * threshold, that drift could flip a result across the threshold boundary.
 */
export function pairwiseDivergenceBps(a: number, b: number): number {
  if (a <= 0 || b <= 0) {
    throw new Error(`Cannot compute divergence against a non-positive source value (a=${a}, b=${b})`);
  }
  const da = new Decimal(a);
  const db = new Decimal(b);
  const diff = da.minus(db).abs();
  const base = Decimal.min(da, db);
  return diff.dividedBy(base).times(10000).floor().toNumber();
}

/** The maximum divergence, in bps, across every pair of source values. Zero for 0 or 1 sources. */
export function maxPairwiseDivergenceBps(values: number[]): number {
  let max = 0;
  for (let i = 0; i < values.length; i += 1) {
    for (let j = i + 1; j < values.length; j += 1) {
      max = Math.max(max, pairwiseDivergenceBps(values[i], values[j]));
    }
  }
  return max;
}

export function average(values: number[]): number {
  if (values.length === 0) {
    throw new Error("Cannot average an empty set of values");
  }
  const sum = values.reduce((acc, v) => acc.plus(v), new Decimal(0));
  return sum.dividedBy(values.length).toNumber();
}
