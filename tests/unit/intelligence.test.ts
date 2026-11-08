import { describe, it, expect } from 'vitest';
import { assessQuality, slopePerMinute, evaluateRules, DEFAULT_RULES, type Reading } from '../../services/intelligence/src/index.js';

const now = new Date();
const rd = (id: string, t: Reading['measurementType'], v: number, minAgo: number, q: Reading['quality'] = 'good'): Reading =>
  ({ id, measurementType: t, value: v, unit: '', observedAt: new Date(now.getTime() - minAgo * 60000), quality: q });
const empty = () => ({ heart_rate: [], respiratory_rate: [], spo2: [], temperature: [] }) as Record<Reading['measurementType'], Reading[]>;

describe('signal quality', () => {
  it('flags implausible values as poor', () => expect(assessQuality({ measurementType: 'spo2', value: 140, observedAt: now, receivedAt: now }).status).toBe('poor'));
  it('preserves device-reported poor quality', () => expect(assessQuality({ measurementType: 'heart_rate', value: 150, observedAt: now, receivedAt: now, deviceQuality: 'poor' }).status).toBe('poor'));
  it('marks delayed messages questionable', () => expect(assessQuality({ measurementType: 'heart_rate', value: 150, observedAt: new Date(now.getTime() - 10 * 60000), receivedAt: now, deviceQuality: 'good' }).status).toBe('questionable'));
  it('does not claim good without a device indicator', () => expect(assessQuality({ measurementType: 'heart_rate', value: 150, observedAt: now, receivedAt: now }).status).toBe('unknown'));
});
describe('trends and rules', () => {
  it('computes slope per minute', () => expect(slopePerMinute([rd('a', 'heart_rate', 100, 2), rd('b', 'heart_rate', 110, 1), rd('c', 'heart_rate', 120, 0)])).toBeCloseTo(10, 5));
  it('fires the multivariable demo rule on good readings', () => {
    const r = empty();
    r.heart_rate = [rd('h1', 'heart_rate', 190, 4), rd('h2', 'heart_rate', 192, 2), rd('h3', 'heart_rate', 195, 0)];
    r.respiratory_rate = [rd('r1', 'respiratory_rate', 70, 4), rd('r2', 'respiratory_rate', 72, 2), rd('r3', 'respiratory_rate', 75, 0)];
    const f = evaluateRules(DEFAULT_RULES, r);
    expect(f.map((x) => x.ruleKey)).toContain('demo-sustained-tachycardia-tachypnoea');
    expect(f[0].evidence.illustrative).toBe(true);
  });
  it('does NOT fire physiological rules on poor-quality readings', () => {
    const r = empty();
    r.spo2 = [rd('s1', 'spo2', 80, 4, 'poor'), rd('s2', 'spo2', 80, 2, 'poor'), rd('s3', 'spo2', 80, 0, 'poor')];
    const keys = evaluateRules(DEFAULT_RULES, r).map((x) => x.ruleKey);
    expect(keys).not.toContain('demo-falling-spo2');
    expect(keys).toContain('demo-unreliable-data');
  });
  it('regression: healthy readings from other sensors cannot mask a failing sensor', () => {
    const r = empty();
    r.spo2 = [rd('s1', 'spo2', 62, 4, 'poor'), rd('s2', 'spo2', 60, 2, 'poor'), rd('s3', 'spo2', 64, 0, 'poor')];
    r.heart_rate = [rd('h1', 'heart_rate', 140, 4), rd('h2', 'heart_rate', 141, 2), rd('h3', 'heart_rate', 139, 0)];
    r.temperature = [rd('t1', 'temperature', 36.8, 0)];
    expect(evaluateRules(DEFAULT_RULES, r).map((x) => x.ruleKey)).toContain('demo-unreliable-data');
  });
});
