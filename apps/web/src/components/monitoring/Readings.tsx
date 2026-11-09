import { Link } from 'react-router-dom';
import type { Latest, MeasurementType, OverviewRow, Quality } from '../../types';
import { MEASUREMENTS, MEASUREMENT_ORDER, QUALITY_LABEL, ago, fmtValue } from '../../utils/format';
import { QualityChip, SimChip } from '../common/ui';

const RANK: Record<Quality, number> = { good: 0, unknown: 1, questionable: 2, poor: 3, unavailable: 4 };
export const worstQuality = (ms: Latest[]): Quality | null => ms.length ? ms.reduce((w, m) => (RANK[m.quality_status] > RANK[w] ? m.quality_status : w), 'good' as Quality) : null;
export const isOffline = (r: OverviewRow) => r.connection_status === 'disconnected' || !r.device_identifier;

/** One measurement. Stale or disconnected values are struck through and never styled as live; quality is shown separately from the value. */
export function ReadingCell({ m, type, offline }: { m?: Latest; type: MeasurementType; offline: boolean }) {
  const meta = MEASUREMENTS[type];
  if (!m) return <div className="reading none"><span className="name">{meta.label}</span><span className="val">–</span><span className="meta muted">No data received</span></div>;
  const stale = m.isStale || offline;
  const cls = stale ? 'stale' : m.quality_status === 'poor' || m.quality_status === 'unavailable' ? 'bad' : m.quality_status === 'questionable' ? 'weak' : '';
  return (
    <div className={`reading ${cls}`}>
      <span className="name">{meta.label}</span>
      <span className="val" aria-label={`${meta.label} ${fmtValue(type, m.value)} ${meta.unit}${stale ? ', not current' : ''}`}>{fmtValue(type, m.value)}<small>{meta.unit}</small></span>
      <span className="meta">{stale ? <span className="chip">Not current</span> : <QualityChip q={m.quality_status} />}<span className="muted">{ago(m.observed_at)}</span></span>
    </div>
  );
}

export function Strip({ row }: { row: OverviewRow }) {
  const off = isOffline(row);
  const by = Object.fromEntries(row.measurements.map((m) => [m.measurement_type, m])) as Partial<Record<MeasurementType, Latest>>;
  return (
    <div className={`strip ${off ? 'offline' : ''}`} role="group" aria-label={`Newborn ${row.newborn_identifier}`}>
      <div className="who"><Link to={`/newborns/${row.id}`}>{row.newborn_identifier}</Link><div className="small muted">{row.unit_name ?? 'No unit'} · {row.monitoring_status}</div>
        {row.unacknowledgedAlerts > 0 && <Link to={`/alerts?newbornId=${row.id}`} className="chip await" style={{ marginTop: 6 }}>{row.unacknowledgedAlerts} to acknowledge</Link>}</div>
      {MEASUREMENT_ORDER.map((t) => <ReadingCell key={t} m={by[t]} type={t} offline={off} />)}
      <div className="dev small">
        <div className="row wrap" style={{ gap: 6 }}>{row.is_simulated && <SimChip />}</div>
        <div style={{ marginTop: 6 }}><b>{row.device_identifier ?? 'No device assigned'}</b></div>
        <div className={off ? '' : 'muted'} style={off ? { color: '#8E2F27', fontWeight: 600 } : undefined}>{!row.device_identifier ? 'Measurements unavailable' : off ? 'Disconnected, data not current' : 'Connected'}</div>
        <div className="muted">Last data {ago(row.last_seen_at)}</div>
      </div>
    </div>
  );
}
export { QUALITY_LABEL };
