export type Quality = 'good' | 'questionable' | 'poor' | 'unavailable' | 'unknown';
export type MeasurementType = 'heart_rate' | 'respiratory_rate' | 'spo2' | 'temperature';
export type Priority = 'low' | 'medium' | 'high';
export type AlertStatus = 'awaiting_acknowledgement' | 'acknowledged' | 'under_assessment' | 'escalated' | 'resolved' | 'closed';

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
export interface Alert { category?: AlertCategory; occurrence_count?: number; id: string; newborn_id: string; newborn_identifier: string; priority: Priority; title: string; explanation: string; status: AlertStatus; created_at: string; updated_at: string; evidence: Evidence }
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

// ---- platform expansion ----
export type SignalCategory = 'reliable' | 'reduced_quality' | 'poor_quality' | 'missing_data' | 'device_disconnected' | 'insufficient_information';
export type NewbornState = 'normal' | 'concerning' | 'insufficient_signal' | 'disconnected' | 'not_monitored';
export type AlertCategory = 'measurement' | 'trend' | 'signal_quality' | 'missing_data' | 'device_disconnection';
export interface SignalInfo { category: SignalCategory; label: string; explanation: string }
export interface DashboardSummary { registered: number; monitored: number; recentlyRegistered: number; devices: { total: number; connected: number; disconnected: number; unassigned: number } | null;
  clinical: null | { states: Record<'normal' | 'concerning' | 'insufficient_signal' | 'disconnected', number>; signalDistribution: Record<SignalCategory, number>; signalLabels: Record<SignalCategory, string>; alerts: { open: number; high: number; unacknowledged: number } } }
export interface AvailabilityPoint { t: string; good: number; questionable: number; poor: number; unavailable: number; unknown: number }
export interface ActivityItem { at: string; type: string; text: string; link?: string; newborn?: string }
export interface SearchResults { newborns: Array<{ id: string; newborn_identifier: string; monitoring_status: string; unit_name: string | null }>; alerts: Array<{ id: string; title: string; priority: Priority; status: AlertStatus; newborn_identifier: string }>; devices: Array<{ id: string; device_identifier: string; connection_status: string }> }
export interface NotificationItem { id: string; type: string; priority: Priority; title: string; body: string | null; link: string | null; alert_id: string | null; newborn_id: string | null; created_at: string; read_at: string | null; acknowledged_at: string | null }
export interface NotificationList { items: NotificationItem[]; unread: number; unread_high: number }
export interface NewbornRow extends Newborn { birth_weight_grams: number | null; birth_time: string | null; admission_source: string | null; created_at: string; state?: NewbornState | null; signal?: SignalInfo | null; alerts?: { open: number; high: number; unacknowledged: number; clinical: number } | null }
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }
export interface NewbornDetail extends NewbornRow { clinical_summary?: string | null; discharged_at: string | null; discharge_reason: string | null; transferred_to: string | null; team: Array<{ user_id: string; full_name: string; roles: string | null }>; currentSession: { id: string; started_at: string; reason: string | null } | null }
export interface MonitoringRow extends OverviewRow { state: NewbornState; signal: SignalInfo; alerts: { open: number; high: number; unacknowledged: number; clinical: number } }
export interface Trend { classification: 'rising' | 'falling' | 'stable' | 'insufficient_data'; readings: number; reliableReadings: number; reliableShare: number | null; note?: string; first?: number; last?: number; min?: number; max?: number; spanMinutes?: number; changePerMinute?: number; netChange?: number; mean?: number; unit?: string; comparison?: { previousMean: number; currentMean: number; delta: number } | null }
export interface RuleEval { ruleKey: string; name: string; version: number; category: AlertCategory; priority: Priority; illustrative: boolean; status: 'met' | 'not_met' | 'insufficient_data'; conditions: Array<{ met: boolean | null; requirement: string; observed: string }> }
export interface IntelligenceItem { id: string; identifier: string; state: NewbornState; signal: SignalInfo; trends: Record<MeasurementType, Trend>; rulesMet: number; rulesInsufficient: number; assessment: { status: string; evaluated_at: string } | null }
export interface IntelligenceDetail { windowMinutes: number; state: NewbornState; signal: SignalInfo; trends: Record<MeasurementType, Trend>; evaluation: RuleEval[]; assessmentHistory: Array<{ status: string; evaluated_at: string; details: { criteriaMet?: string[] } }>; missingInformation: string[]; disclaimer: string }
export interface ReportKind { key: string; label: string; group: 'clinical' | 'operational'; needsNewborn: boolean }
export interface ReportData { kind: string; title: string; generatedAt: string; summary: Array<[string, string | number]>; sections: Array<{ title: string; columns: string[]; rows: Array<Array<string | number | null>> }>; note: string }
export interface ReportHistoryRow { id: string; kind: string; params: { from?: string; to?: string; newbornId?: string | null }; row_count: number; format: string; created_at: string; generated_by: string }
export interface RoleRow { name: string; label: string; permissions: string[] }
export interface UserRow { id: string; full_name: string; email: string; account_status: string; email_verified_at: string | null; last_login_at: string | null; created_at: string; roles: string[] }
export interface DeviceHistory { assignments: Array<{ assigned_at: string; unassigned_at: string | null; newborn_identifier: string; assigned_by: string | null }>; maintenance: Array<{ id: string; kind: string; notes: string; performed_at: string; next_due: string | null; performed_by: string | null }>; connection: Array<{ action: string; created_at: string }> }
export interface NoteRow { id: string; note_type: string; note_text: string; created_at: string; author: string }
export interface SettingRow { key: string; label: string; min: number; max: number; value: number; default: number }
export interface AuditRow { id: string; action: string; resource_type: string; resource_id: string | null; metadata: Record<string, unknown>; created_at: string; user_name: string | null }
