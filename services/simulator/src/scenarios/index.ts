/**
 * SYNTHETIC SCENARIOS. All values are fictional demonstration data, not clinical reference data.
 * Demonstration thresholds in the rule engine are illustrative; these curves are designed only to exercise them.
 */
export type Signal = 'ok' | 'weak' | 'poor' | 'lost';
export type Key = 'hr' | 'rr' | 'spo2' | 'temp';
export interface Tick {
  readings: Partial<Record<Key, number>>;
  signal?: Partial<Record<Key, Signal>>;
  /** device link state during this tick; while disconnected, readings are buffered on the device and sent on reconnection */
  link?: 'up' | 'down';
}
export interface Scenario { id: string; name: string; description: string; synthetic: true; ticks: number; tick(i: number, rnd: () => number): Tick; }

const j = (rnd: () => number, base: number, spread: number) => Math.round((base + (rnd() - 0.5) * 2 * spread) * 10) / 10;
const routine = (rnd: () => number): Tick => ({ readings: { hr: j(rnd, 142, 6), rr: j(rnd, 46, 4), spo2: j(rnd, 97, 1.2), temp: j(rnd, 36.8, 0.2) }, signal: { hr: 'ok', rr: 'ok', spo2: 'ok', temp: 'ok' } });
const ramp = (i: number, from: number, to: number, start: number, end: number) => from + (to - from) * Math.min(1, Math.max(0, (i - start) / (end - start)));

export const SCENARIOS: Record<string, Scenario> = {
  A: { id: 'A', name: 'Routine observations', description: 'Synthetic observations with no deliberately concerning pattern.', synthetic: true, ticks: 20, tick: (_i, r) => routine(r) },
  B: {
    id: 'B', name: 'Concerning trend', description: 'Synthetic heart rate and respiratory rate rise past the ILLUSTRATIVE demo thresholds.', synthetic: true, ticks: 16,
    tick: (i, r) => { const t = routine(r); t.readings.hr = j(r, ramp(i, 145, 196, 4, 9), 2); t.readings.rr = j(r, ramp(i, 48, 76, 4, 9), 1.5); return t; },
  },
  C: {
    id: 'C', name: 'Poor signal', description: 'SpO2 and heart rate sensors report poor/weak signal with implausible values. Not evidence of instability or of stability.', synthetic: true, ticks: 14,
    tick: (i, r) => { const t = routine(r); if (i >= 3) { t.signal = { ...t.signal, spo2: 'poor', hr: i % 3 === 0 ? 'lost' : 'weak' }; t.readings.spo2 = j(r, 62, 8); t.readings.hr = i % 4 === 0 ? 310 : j(r, 142, 25); } return t; },
  },
  D: {
    id: 'D', name: 'Missing observations', description: 'SpO2 and temperature stop transmitting; heart rate and respiratory rate continue.', synthetic: true, ticks: 14,
    tick: (i, r) => { const t = routine(r); if (i >= 4) { delete t.readings.spo2; delete t.readings.temp; delete t.signal?.spo2; delete t.signal?.temp; } return t; },
  },
  E: {
    id: 'E', name: 'Device disconnection', description: 'Device link drops for several ticks, then reconnects and flushes buffered readings.', synthetic: true, ticks: 18,
    tick: (i, r) => { const t = routine(r); t.link = i >= 5 && i < 11 ? 'down' : 'up'; return t; },
  },
  F: {
    id: 'F', name: 'Recovery sequence', description: 'Elevated synthetic values return toward routine after a simulated clinical response. Alerts are NOT auto-resolved.', synthetic: true, ticks: 22,
    tick: (i, r) => { const t = routine(r); t.readings.hr = j(r, i < 10 ? ramp(i, 145, 195, 2, 6) : ramp(i, 195, 145, 10, 18), 2); t.readings.rr = j(r, i < 10 ? ramp(i, 48, 75, 2, 6) : ramp(i, 75, 48, 10, 18), 1.5); return t; },
  },
};

/** Small deterministic PRNG so scenarios are repeatable. */
export function mulberry32(seed: number) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
