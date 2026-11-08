export type MeasurementType = 'heart_rate' | 'respiratory_rate' | 'spo2' | 'temperature';
export type Quality = 'good' | 'questionable' | 'poor' | 'unavailable' | 'unknown';

export interface Reading { id: string; measurementType: MeasurementType; value: number; unit: string; observedAt: Date; quality: Quality; }

export type Condition =
  | { kind: 'consecutive_threshold'; measurement: MeasurementType; op: 'gt' | 'lt'; value: number; count: number; maxSpanMinutes: number }
  | { kind: 'consecutive_quality'; quality: Quality[]; count: number };

export interface RuleConfig {
  ruleKey: string; name: string; description: string; version: number; priority: 'low' | 'medium' | 'high';
  requiredMeasurements: MeasurementType[]; conditions: Condition[];
  /** Only readings with these quality statuses may satisfy threshold conditions. */
  requiredQuality: Quality[];
  explanationTemplate: string; illustrative: true; enabled: boolean;
}

export interface Finding {
  ruleKey: string; ruleVersion: number; priority: RuleConfig['priority']; title: string; explanation: string;
  evidence: { triggering: Reading[]; context: Reading[]; qualityOfTriggering: Quality[]; illustrative: true };
}
