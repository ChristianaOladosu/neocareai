# Device Integration

**Honest status: only a software simulator has been integrated. No physical medical device has been connected to NeocareAI.** Real integration needs manufacturer documentation, compatible hardware, authorisation and testing.

## Path of a measurement

```
Monitor/Simulator -> Adapter -> Standard observation -> Gateway validation -> Forwarder
   -> API: device->newborn association -> timestamp checks -> quality assessment -> store -> rules
```

## Standard observation format (gateway)

`deviceIdentifier, measurementType, value, unit, observedAt, receivedAt, deviceQuality?, source {adapter, synthetic}`. The API adds the newborn from the active device assignment and stores `source = device:<id>`, `received_at`, `quality_status` and the quality reason.

## Adapters

`DeviceAdapter { name; parse(raw, receivedAt) -> StandardObservation[] }`. The only adapter is `simulator`. A new adapter (HL7 v2, FHIR, IEEE 11073, manufacturer API) implements `parse` and is registered in `adapters/index.ts`. Not every device supports these standards, and none has been implemented or tested here.

Adapter rules: reject malformed messages (HTTP 400); never invent a value for a measurement the device did not send; map device signal indicators to `good / questionable / poor / unavailable`.

## Controlled association

- A device has at most one active assignment, and a newborn at most one (partial unique indexes).
- The gateway cannot choose the newborn. A message naming a different newborn is rejected with `association_mismatch`.
- Assignment, reassignment and unassignment are audited. The UI warns that reassignment unassigns any existing device and asks for confirmation.
- Messages from an unassigned device are rejected, not guessed.

## Reliability behaviour

| Situation | Behaviour (tested) |
|---|---|
| Disconnection | Recorded in audit; UI shows "Disconnected, data not current"; readings struck through |
| Reconnection | Buffered readings are flushed in order; none lost (scenario E: 72 of 72) |
| Missing measurement | Shown as stale/missing, never filled in (scenario D) |
| Duplicate message | Stored once (unique key); second send returns `duplicate:true` |
| Delayed message | Kept, marked `questionable` if older than 5 minutes when received |
| Invalid/future/old timestamp | Rejected with 422 |
| Poor signal | Stored as poor; excluded from physiological rules; repeated poor readings raise a data-quality notice |
| API outage | Gateway buffers in memory and retries in order (tested with a fake outage) |

**Limitation:** the gateway buffer is in memory; a gateway restart loses unsent messages. A durable queue is needed for real use.

## Simulator

Six scenarios, all labelled synthetic: A routine, B concerning trend, C poor signal, D missing observations, E disconnection/reconnection, F recovery (the alert is *not* auto-resolved). Run `npm run simulate -- --list`. The values are fictional and are not clinical reference data. Devices appear as "Simulated device" in the UI.

## Future integration checklist

Manufacturer interface documentation and licence · compatible hardware and test rig · authorisation from the hospital · message-level conformance and fault-injection testing · durable buffering · network segmentation and mutual TLS · clinical engineering and cybersecurity review · regulatory assessment of the combined system.
