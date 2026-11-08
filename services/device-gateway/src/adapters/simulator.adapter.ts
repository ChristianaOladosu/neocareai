import { z } from 'zod';
import type { DeviceAdapter, DeviceQuality, MeasurementType, StandardObservation } from '../normalisation/types.js';

/**
 * Adapter for the NeocareAI synthetic monitor. Vendor-style payload:
 *   { deviceId, ts, synthetic: true, readings: { hr, rr, spo2, temp }, signal: { hr, rr, spo2, temp } }
 * Missing readings are simply absent: the gateway never fabricates a value for a measurement the device did not send.
 * Future adapters (HL7 v2, FHIR, IEEE 11073, manufacturer interfaces) implement the same DeviceAdapter interface;
 * they require manufacturer documentation, compatible hardware, authorisation and testing, and do not exist yet.
 */
const sig = z.enum(['ok', 'weak', 'poor', 'lost']);
const rawSchema = z.object({
  deviceId: z.string().min(1).max(60),
  ts: z.string().datetime({ offset: true }),
  synthetic: z.literal(true),
  readings: z.object({ hr: z.number().finite().optional(), rr: z.number().finite().optional(), spo2: z.number().finite().optional(), temp: z.number().finite().optional() }),
  signal: z.object({ hr: sig.optional(), rr: sig.optional(), spo2: sig.optional(), temp: sig.optional() }).default({}),
});
export type SimulatorMessage = z.infer<typeof rawSchema>;

const MAP: Record<'hr' | 'rr' | 'spo2' | 'temp', [MeasurementType, string]> = {
  hr: ['heart_rate', 'bpm'], rr: ['respiratory_rate', 'breaths/min'], spo2: ['spo2', '%'], temp: ['temperature', '°C'],
};
const QUALITY: Record<z.infer<typeof sig>, DeviceQuality> = { ok: 'good', weak: 'questionable', poor: 'poor', lost: 'unavailable' };

export const simulatorAdapter: DeviceAdapter = {
  name: 'simulator',
  parse(raw, receivedAt) {
    const m = rawSchema.parse(raw);
    const out: StandardObservation[] = [];
    for (const k of ['hr', 'rr', 'spo2', 'temp'] as const) {
      const v = m.readings[k];
      if (v === undefined) continue;
      const s = m.signal[k];
      out.push({
        deviceIdentifier: m.deviceId, measurementType: MAP[k][0], value: v, unit: MAP[k][1], observedAt: m.ts, receivedAt: receivedAt.toISOString(),
        deviceQuality: s ? QUALITY[s] : undefined, source: { adapter: 'simulator', synthetic: true },
      });
    }
    return out;
  },
};
