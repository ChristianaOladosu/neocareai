import type { RuleConfig, Reading, Finding, Quality, MeasurementType } from './types.js';

/**
 * ILLUSTRATIVE DEMONSTRATION RULES. Thresholds are placeholders for the competition prototype.
 * They are NOT clinically approved neonatal guidelines and must be reviewed by qualified neonatal clinicians.
 */
export const DEFAULT_RULES: RuleConfig[] = [
  {
    ruleKey: 'demo-sustained-tachycardia-tachypnoea', name: 'Sustained high heart rate with high respiratory rate (illustrative)', version: 1, priority: 'high',
    description: 'Illustrative multivariable rule: both heart rate and respiratory rate above demo thresholds across consecutive good-quality readings.',
    requiredMeasurements: ['heart_rate', 'respiratory_rate'], requiredQuality: ['good', 'unknown'],
    conditions: [
      { kind: 'consecutive_threshold', measurement: 'heart_rate', op: 'gt', value: 180, count: 3, maxSpanMinutes: 15 },
      { kind: 'consecutive_threshold', measurement: 'respiratory_rate', op: 'gt', value: 65, count: 3, maxSpanMinutes: 15 },
    ],
    explanationTemplate: 'Illustrative demo rule: heart rate and respiratory rate were both above the demo thresholds for 3 consecutive good-quality readings. Please review the newborn clinically.',
    illustrative: true, enabled: true,
  },
  {
    ruleKey: 'demo-falling-spo2', name: 'Low oxygen saturation on consecutive readings (illustrative)', version: 1, priority: 'high',
    description: 'Illustrative rule: SpO2 below a demo threshold on consecutive good-quality readings.',
    requiredMeasurements: ['spo2'], requiredQuality: ['good', 'unknown'],
    conditions: [{ kind: 'consecutive_threshold', measurement: 'spo2', op: 'lt', value: 90, count: 3, maxSpanMinutes: 15 }],
    explanationTemplate: 'Illustrative demo rule: SpO2 was below the demo threshold on 3 consecutive good-quality readings. Please review the newborn clinically.',
    illustrative: true, enabled: true,
  },
  {
    ruleKey: 'demo-temperature-low', name: 'Low temperature on consecutive readings (illustrative)', version: 1, priority: 'medium',
    description: 'Illustrative rule: temperature below a demo threshold on consecutive good-quality readings.',
    requiredMeasurements: ['temperature'], requiredQuality: ['good', 'unknown'],
    conditions: [{ kind: 'consecutive_threshold', measurement: 'temperature', op: 'lt', value: 36.0, count: 3, maxSpanMinutes: 30 }],
    explanationTemplate: 'Illustrative demo rule: temperature was below the demo threshold on 3 consecutive good-quality readings.',
    illustrative: true, enabled: true,
  },
  {
    ruleKey: 'demo-unreliable-data', name: 'Measurements unreliable (data-quality notice)', version: 1, priority: 'low',
    description: 'Data-quality notice: repeated poor or unavailable readings. This is NOT a physiological finding.',
    requiredMeasurements: [], requiredQuality: ['poor', 'unavailable'],
    conditions: [{ kind: 'consecutive_quality', quality: ['poor', 'unavailable'], count: 3 }],
    explanationTemplate: 'Recent measurements are unreliable. Poor or missing signal does NOT indicate the newborn is stable; check the sensor and the newborn.',
    illustrative: true, enabled: true,
  },
];

/** readings: newest-last, per measurement type. Returns findings for rules whose conditions all hold. */
export function evaluateRules(rules: RuleConfig[], readings: Record<MeasurementType, Reading[]>): Finding[] {
  const out: Finding[] = [];
  for (const rule of rules.filter((r) => r.enabled)) {
    const triggering: Reading[] = []; let ok = rule.conditions.length > 0;
    for (const c of rule.conditions) {
      if (c.kind === 'consecutive_threshold') {
        const tail = (readings[c.measurement] ?? []).slice(-c.count);
        const pass = tail.length === c.count
          && tail.every((r) => rule.requiredQuality.includes(r.quality) && (c.op === 'gt' ? r.value > c.value : r.value < c.value))
          && (tail[tail.length - 1].observedAt.getTime() - tail[0].observedAt.getTime()) / 60000 <= c.maxSpanMinutes;
        if (!pass) { ok = false; break; }
        triggering.push(...tail);
      } else {
        const all = Object.values(readings).flat().sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());
        const tail = all.slice(-c.count);
        if (!(tail.length === c.count && tail.every((r) => c.quality.includes(r.quality)))) { ok = false; break; }
        triggering.push(...tail);
      }
    }
    if (!ok) continue;
    const ctxTypes = new Set<MeasurementType>(triggering.map((t) => t.measurementType));
    const trigIds = new Set(triggering.map((t) => t.id));
    const context = [...ctxTypes].flatMap((m) => (readings[m] ?? []).slice(-12)).filter((r) => !trigIds.has(r.id));
    out.push({
      ruleKey: rule.ruleKey, ruleVersion: rule.version, priority: rule.priority, title: rule.name, explanation: rule.explanationTemplate,
      evidence: { triggering, context, qualityOfTriggering: triggering.map((t) => t.quality) as Quality[], illustrative: true },
    });
  }
  return out;
}
