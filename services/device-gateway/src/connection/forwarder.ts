import type { StandardObservation } from '../normalisation/types.js';

export interface ForwarderConfig { apiUrl: string; gatewayKey: string; hospitalId: string; maxBuffer?: number; fetchImpl?: typeof fetch; }
export type SendResult = { status: 'stored' | 'duplicate' | 'rejected' | 'buffered'; detail?: unknown };

/**
 * Forwards standard observations to the backend ingestion API.
 * - 4xx from the API (validation/association errors) = rejected, never retried.
 * - Network failure or 5xx = buffered in memory and retried in order (synchronisation after reconnection).
 * The buffer is in-memory only in this prototype: a gateway restart loses unsent data (documented limitation).
 */
export class Forwarder {
  private buffer: StandardObservation[] = [];
  readonly rejected: Array<{ obs: StandardObservation; error: unknown }> = [];
  private f: typeof fetch;
  constructor(private cfg: ForwarderConfig) { this.f = cfg.fetchImpl ?? fetch; }
  get buffered() { return this.buffer.length; }

  private headers() { return { 'content-type': 'application/json', 'x-gateway-key': this.cfg.gatewayKey }; }

  private async post(o: StandardObservation): Promise<SendResult> {
    let res: Response;
    try {
      res = await this.f(`${this.cfg.apiUrl}/api/gateway/observations`, {
        method: 'POST', headers: this.headers(),
        body: JSON.stringify({
          hospitalId: this.cfg.hospitalId, deviceIdentifier: o.deviceIdentifier, measurementType: o.measurementType, value: o.value, unit: o.unit,
          observedAt: o.observedAt, deviceQuality: o.deviceQuality, metadata: { adapter: o.source.adapter, synthetic: o.source.synthetic, gatewayReceivedAt: o.receivedAt },
        }),
      });
    } catch { return { status: 'buffered' }; }
    if (res.status >= 500) return { status: 'buffered' };
    const body = await res.json().catch(() => ({}));
    if (res.status >= 400) { this.rejected.push({ obs: o, error: body }); return { status: 'rejected', detail: body }; }
    return { status: (body as any).duplicate ? 'duplicate' : 'stored', detail: body };
  }

  async send(o: StandardObservation): Promise<SendResult> {
    if (this.buffer.length) { await this.flush(); }
    if (this.buffer.length) return this.enqueue(o); // keep ordering while the API is still unreachable
    const r = await this.post(o);
    return r.status === 'buffered' ? this.enqueue(o) : r;
  }
  private enqueue(o: StandardObservation): SendResult {
    if (this.buffer.length >= (this.cfg.maxBuffer ?? 5000)) this.buffer.shift(); // drop oldest; documented limitation
    this.buffer.push(o);
    return { status: 'buffered' };
  }
  async flush() {
    while (this.buffer.length) {
      const r = await this.post(this.buffer[0]);
      if (r.status === 'buffered') return;
      this.buffer.shift();
    }
  }
  async setConnection(deviceIdentifier: string, status: 'connected' | 'disconnected') {
    try {
      const res = await this.f(`${this.cfg.apiUrl}/api/gateway/devices/${encodeURIComponent(deviceIdentifier)}/connection`, {
        method: 'POST', headers: this.headers(), body: JSON.stringify({ hospitalId: this.cfg.hospitalId, status }),
      });
      if (status === 'connected') await this.flush();
      return res.ok;
    } catch { return false; }
  }
}
