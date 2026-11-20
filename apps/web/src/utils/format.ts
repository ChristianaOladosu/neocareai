import type { MeasurementType, Quality, AlertStatus, Priority } from '../types';

export const MEASUREMENTS: Record<MeasurementType, { label: string; short: string; unit: string; decimals: number }> = {
  heart_rate: { label: 'Heart rate', short: 'HR', unit: 'bpm', decimals: 0 },
  respiratory_rate: { label: 'Respiratory rate', short: 'RR', unit: '/min', decimals: 0 },
  spo2: { label: 'Oxygen saturation', short: 'SpO₂', unit: '%', decimals: 0 },
  temperature: { label: 'Temperature', short: 'Temp', unit: '°C', decimals: 1 },
};
export const MEASUREMENT_ORDER: MeasurementType[] = ['heart_rate', 'respiratory_rate', 'spo2', 'temperature'];
export const fmtValue = (t: MeasurementType, v: number) => v.toFixed(MEASUREMENTS[t].decimals);

export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export const dt = (iso: string) => new Date(iso).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export const QUALITY_LABEL: Record<Quality, string> = { good: 'Good signal', questionable: 'Questionable signal', poor: 'Poor signal', unavailable: 'No signal', unknown: 'Quality unknown' };
export const STATUS_LABEL: Record<AlertStatus, string> = { awaiting_acknowledgement: 'Open (awaiting acknowledgement)', acknowledged: 'Acknowledged', under_assessment: 'Under assessment', escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed' };
export const PRIORITY_LABEL: Record<Priority, string> = { high: 'High priority', medium: 'Medium priority', low: 'Low priority' };
export const EVENT_LABEL: Record<string, string> = { generated: 'Alert generated', acknowledged: 'Acknowledged', assessment_recorded: 'Assessment recorded', response_documented: 'Response documented', escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed' };

export const ROLE_LABEL: Record<string, string> = { Doctor: 'Neonatologist / Paediatrician', 'Medical Officer': 'Medical officer', Nurse: 'Nurse', 'Clinical Supervisor': 'Clinical supervisor', Administrator: 'Administrator' };
export const roleLabel = (r: string) => ROLE_LABEL[r] ?? r;
export const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase()).join('');
export const SIGNAL_LABEL: Record<string, string> = { reliable: 'Reliable', reduced_quality: 'Reduced quality', poor_quality: 'Poor quality', missing_data: 'Missing data', device_disconnected: 'Device disconnected', insufficient_information: 'Insufficient information' };
export const STATE_LABEL: Record<string, string> = { normal: 'Normal monitoring', concerning: 'Concerning trend', insufficient_signal: 'Insufficient signal', disconnected: 'Device disconnected', not_monitored: 'Not monitored' };
export const CATEGORY_LABEL: Record<string, string> = { measurement: 'Measurement', trend: 'Trend', signal_quality: 'Signal quality', missing_data: 'Missing data', device_disconnection: 'Device disconnection' };
export const ALERT_STATUS_LABEL: Record<string, string> = { awaiting_acknowledgement: 'Open', acknowledged: 'Acknowledged', under_assessment: 'Under assessment', escalated: 'Escalated', resolved: 'Resolved', closed: 'Closed' };
