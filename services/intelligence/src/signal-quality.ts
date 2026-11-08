import type { MeasurementType, Quality } from './types.js';

/**
 * Data-validity checks only. These bounds catch impossible/implausible values (sensor or entry errors).
 * They are NOT clinical reference ranges and say nothing about whether a newborn is stable.
 * This is not clinically validated signal-quality assessment.
 */
const PLAUSIBLE: Record<MeasurementType, [number, number, string]> = {
  heart_rate: [20, 300, 'bpm'], respiratory_rate: [5, 150, 'breaths/min'], spo2: [30, 100, '%'], temperature: [25, 45, '°C'],
};
export const UNITS: Record<MeasurementType, string> = { heart_rate: 'bpm', respiratory_rate: 'breaths/min', spo2: '%', temperature: '°C' };

export interface QualityInput {
  measurementType: MeasurementType; value: number; observedAt: Date; receivedAt: Date;
  deviceQuality?: Quality; deviceConnected?: boolean;
}
export interface QualityResult { status: Quality; reason: string; }

export function assessQuality(i: QualityInput): QualityResult {
  const [lo, hi] = PLAUSIBLE[i.measurementType];
  if (!Number.isFinite(i.value)) return { status: 'unavailable', reason: 'Value missing or not a number' };
  if (i.value < lo || i.value > hi) return { status: 'poor', reason: `Value ${i.value} outside plausible measurement range (${lo}-${hi}); likely sensor or entry error` };
  if (i.observedAt.getTime() > i.receivedAt.getTime() + 60_000) return { status: 'poor', reason: 'Observation timestamp is in the future' };
  if (i.deviceConnected === false) return { status: 'unavailable', reason: 'Device reported disconnected' };
  if (i.deviceQuality === 'poor' || i.deviceQuality === 'unavailable') return { status: i.deviceQuality, reason: 'Device flagged signal as ' + i.deviceQuality };
  if (i.deviceQuality === 'questionable') return { status: 'questionable', reason: 'Device flagged signal as questionable' };
  const delayMs = i.receivedAt.getTime() - i.observedAt.getTime();
  if (delayMs > 5 * 60_000) return { status: 'questionable', reason: `Delayed message (${Math.round(delayMs / 60000)} min after observation)` };
  if (i.deviceQuality === 'good') return { status: 'good', reason: 'Device reported good signal; value within plausible range' };
  return { status: 'unknown', reason: 'No device quality indicator supplied; value within plausible range' };
}
export const plausibleRange = (m: MeasurementType) => PLAUSIBLE[m];
