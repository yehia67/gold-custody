/**
 * Pairwise divergence in basis points between two source values, mirroring
 * daml/Oracle.daml's `divergenceBps`: |a-b| / min(a,b) * 10000, floored.
 */
export function pairwiseDivergenceBps(a: number, b: number): number {
  if (a <= 0 || b <= 0) {
    throw new Error(`Cannot compute divergence against a non-positive source value (a=${a}, b=${b})`);
  }
  const diff = Math.abs(a - b);
  const base = Math.min(a, b);
  return Math.floor((diff / base) * 10000);
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
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
