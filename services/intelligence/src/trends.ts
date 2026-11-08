import type { Reading } from './types.js';

/** Least-squares slope in units per minute. Returns null with fewer than 2 points. */
export function slopePerMinute(rs: Reading[]): number | null {
  if (rs.length < 2) return null;
  const t0 = rs[0].observedAt.getTime();
  const xs = rs.map((r) => (r.observedAt.getTime() - t0) / 60000);
  const ys = rs.map((r) => r.value);
  const n = rs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  if (den === 0) return null;
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
}

export function maxGapMinutes(rs: Reading[]): number {
  let g = 0;
  for (let i = 1; i < rs.length; i++) g = Math.max(g, (rs[i].observedAt.getTime() - rs[i - 1].observedAt.getTime()) / 60000);
  return g;
}
