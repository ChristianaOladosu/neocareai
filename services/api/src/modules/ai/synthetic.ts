import type { Bundle } from './types.js';
import { retrieve } from './guidance.js';

/** A fixed, fictional alert bundle used only to test an Azure connection. It contains no patient data of any kind. */
export function syntheticBundle(): Bundle {
  const base = Date.UTC(2026, 0, 1, 12, 0, 0); const at = (m: number) => new Date(base + m * 60000).toISOString();
  const r = (t: 'heart_rate' | 'respiratory_rate', v: number, u: string, m: number) => ({ measurementType: t, value: v, unit: u, observedAt: at(m), quality: 'good' as const });
  return {
    alert: { priority: 'high', title: 'Connection test alert (synthetic)', explanation: 'Synthetic test data used to check the AI connection.', status: 'awaiting_acknowledgement', createdAt: at(5), ruleName: 'Synthetic test rule', ruleVersion: 1, illustrative: true,
      triggering: [r('heart_rate', 190, 'bpm', 1), r('heart_rate', 192, 'bpm', 2), r('heart_rate', 195, 'bpm', 3)], context: [r('heart_rate', 140, 'bpm', -3)] },
    recent: [], history: [{ eventType: 'generated', at: at(5), byRole: 'System' }], guidance: retrieve('rule signal quality'), unavailable: [],
  };
}
