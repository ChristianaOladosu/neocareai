export type Quality = 'good' | 'questionable' | 'poor' | 'unavailable' | 'unknown';
export type MeasurementType = 'heart_rate' | 'respiratory_rate' | 'spo2' | 'temperature';
export type Priority = 'low' | 'medium' | 'high';
export type AlertStatus = 'awaiting_acknowledgement' | 'acknowledged' | 'under_assessment' | 'escalated' | 'resolved';

export interface Me { id: string; fullName: string; email: string; hospitalId: string; roles: string[]; permissions: string[] }
export interface Hospital { id: string; name: string; location: string | null; status: string }
export interface Unit { id: string; name: string; unit_type: string; status: string; newborn_count: number }
export interface Newborn { id: string; newborn_identifier: string; date_of_birth: string; gestational_age_weeks: number | null; admission_date: string; monitoring_status: 'monitoring' | 'paused' | 'discharged'; unit_id: string | null; unit_name: string | null }
export interface Latest { newborn_id: string; measurement_type: MeasurementType; value: number; unit: string; observed_at: string; quality_status: Quality; isStale: boolean }
export interface OverviewRow { id: string; newborn_identifier: string; monitoring_status: string; unit_name: string | null; device_identifier: string | null; connection_status: string | null; last_seen_at: string | null; is_simulated: boolean | null; measurements: Latest[]; openAlerts: number; unacknowledgedAlerts: number; dataCurrent: boolean }
export interface Overview { staleAfterSeconds: number; newborns: OverviewRow[] }
export interface Observation { id: string; measurement_type: MeasurementType; value: number; unit: string; observed_at: string; received_at: string; source: string; quality_status: Quality; device_identifier: string | null; quality_reason: string | null }
export interface EvidenceReading { id: string; measurementType: MeasurementType; value: number; unit: string; observedAt: string; quality: Quality }
export interface Evidence { triggering: EvidenceReading[]; context: EvidenceReading[]; qualityOfTriggering: Quality[]; illustrative: boolean; ruleKey: string; ruleVersion: number }
export interface Alert { id: string; newborn_id: string; newborn_identifier: string; priority: Priority; title: string; explanation: string; status: AlertStatus; created_at: string; updated_at: string; evidence: Evidence }
export interface ResponseEvent { id: string; event_type: string; previous_status: string | null; new_status: string | null; event_details: Record<string, unknown>; created_at: string; user_name: string | null }
export interface AlertDetail extends Alert { rule_version: number | null; rule_name: string | null; events: ResponseEvent[]; assessments: Array<{ id: string; assessment_text: string; created_at: string; clinician: string }> }
export interface LogEvent extends ResponseEvent { alert_id: string; newborn_identifier: string; alert_title: string }
export interface Device { id: string; device_identifier: string; manufacturer: string | null; model: string | null; device_type: string; is_simulated: boolean; connection_status: string; last_seen_at: string | null; newborn_id: string | null; newborn_identifier: string | null; last_quality: Quality | null }
export interface TeamUser { id: string; full_name: string; email: string; account_status: string; created_at: string; roles: string[] }
export interface RoleInfo { name: string; permissions: string[] }
export interface Rule { id: string; rule_key: string; name: string; description: string; rule_version: number; enabled: boolean; configuration: { priority: Priority; explanationTemplate: string; conditions: unknown[]; requiredMeasurements: string[]; requiredQuality: Quality[] } }
export interface AiStatus { enabled: boolean; defaultMode: 'demo' | 'azure'; mode: 'demo' | 'azure'; label: string; provider: string;
  azure: { configured: boolean; requested: boolean; deployment?: string; apiVersion?: string; auth?: string; configurationProblem?: string | null; lastConnectionTest: { ok: boolean; category: string | null; model: string | null; at: string } | null };
  capabilities: string[]; cannot: string[]; tools: Array<{ name: string; needs: string }> }
export interface AiStatement { kind: 'fact' | 'uncertainty' | 'question'; text: string; refs: string[] }
export interface AiCheck { name: string; ok: boolean; detail?: string }
export interface AiResult { interactionId: string; kind: 'summary' | 'draft_assessment' | 'documentation_help'; mode: 'demo' | 'azure'; generated: boolean; label: string; model: string; status: 'completed' | 'blocked'; notice: string;
  validation: { passed: boolean; checks: AiCheck[]; flags: string[]; note: string };
  output: { title: string; sections: Array<{ heading: string; text: string; statements?: AiStatement[] }>; draftText?: string; sourceRecords?: Array<{ id: string; label: string }>; missingInformation?: string[]; sources: Array<{ id: string; title: string; kind: string }>; limitations: string[] } }
export interface AiInteraction { id: string; kind: string; provider: string; mode: string; status: string; tool_calls: Array<{ tool: string; allowed: boolean }>; safeguard_flags: string[]; created_at: string; alert_id: string | null; model_id: string | null; user_role: string | null; latency_ms: number | null; error_category: string | null; validation: { passed?: boolean }; decision: 'recorded' | 'rejected' | null; decision_modified: boolean | null; user_name: string; newborn_identifier: string | null }
export interface AiConnectionTest { ok: boolean; category: string | null; model?: string | null; message: string; latencyMs?: number }
