export type MeasurementType = 'heart_rate' | 'respiratory_rate' | 'spo2' | 'temperature';
export type DeviceQuality = 'good' | 'questionable' | 'poor' | 'unavailable';

/** Standard internal observation format produced by every adapter. */
export interface StandardObservation {
  deviceIdentifier: string;
  measurementType: MeasurementType;
  value: number;
  unit: string;
  observedAt: string;      // ISO-8601 with offset
  receivedAt: string;      // gateway receipt time
  deviceQuality?: DeviceQuality;
  source: { adapter: string; synthetic: boolean };
}

export interface DeviceAdapter {
  name: string;
  /** Validate and convert a vendor payload into zero or more standard observations. Throws on malformed input. */
  parse(raw: unknown, receivedAt: Date): StandardObservation[];
}
