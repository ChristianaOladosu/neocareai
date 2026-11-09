import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Alert, Device, LogEvent, Newborn, Observation, Overview, MeasurementType } from '../types';
import { Banner, Empty, ErrorState, Loading, SimChip } from '../components/common/ui';
import { ReadingCell, isOffline, worstQuality } from '../components/monitoring/Readings';
import { AlertRow } from '../components/alerts/AlertRow';
import { Timeline } from '../components/responses/Timeline';
import { TrendChart } from '../components/charts/TrendChart';
import { MEASUREMENT_ORDER, ago } from '../utils/format';
import { QualityChip } from '../components/common/ui';

export default function OverviewPage() {
  const { can, me } = useAuth();
  const clinical = can('observation:read');
  if (!clinical) return <AdminOverview />;
  return <ClinicalOverview name={me!.fullName} />;
}

function ClinicalOverview({ name }: { name: string }) {
  const { can } = useAuth();
  const ov = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/monitoring/overview'), refetchInterval: 10_000 });
  const alerts = useQuery({ queryKey: ['alerts', 'open'], queryFn: () => api<Alert[]>('/alerts?status=awaiting_acknowledgement,acknowledged,under_assessment,escalated&limit=8'), enabled: can('alert:read') });
  const log = useQuery({ queryKey: ['response-log', 8], queryFn: () => api<LogEvent[]>('/response-log?limit=8'), enabled: can('response:read') });
  const [sel, setSel] = useState('');
  const rows = ov.data?.newborns ?? [];
  const chosen = sel || rows[0]?.id || '';
  const obs = useQuery({ queryKey: ['observations', chosen, 'overview'], queryFn: () => api<Observation[]>(`/newborns/${chosen}/observations?limit=120`), enabled: !!chosen, refetchInterval: 15_000 });

  if (ov.isLoading) return <Loading label="Loading overview" />;
  if (ov.error) return <ErrorState error={ov.error} retry={() => ov.refetch()} />;
  const monitored = rows.filter((r) => r.monitoring_status === 'monitoring').length;
  const awaiting = rows.reduce((n, r) => n + r.unacknowledgedAlerts, 0);
  const concerning = rows.filter((r) => r.openAlerts > 0).length;
  const qualityIssues = rows.filter((r) => { const w = worstQuality(r.measurements.filter((m) => !m.isStale)); return isOffline(r) || w === 'poor' || w === 'unavailable' || w === 'questionable'; }).length;
  const by = (t: MeasurementType) => (obs.data ?? []).filter((o) => o.measurement_type === t).map((o) => ({ t: new Date(o.observed_at).getTime(), v: o.value, q: o.quality_status }));

  return (
    <div>
      <div className="pagehead"><div><h1>Overview</h1><p>Hello, {name}. Here is the current picture across your units.</p></div></div>
      <Banner kind="info">Demonstration data is synthetic and every alert rule is illustrative, not clinically approved. Clinicians remain responsible for all decisions.</Banner>
      <div className="figures">
        <div className="figure"><div className="big">{monitored}</div><div className="lbl">Newborns currently monitored</div></div>
        <div className="figure"><div className="big" style={awaiting ? { color: '#A8392F' } : undefined}>{awaiting}</div><div className="lbl">Alerts awaiting acknowledgement</div></div>
        <div className="figure"><div className="big">{concerning}</div><div className="lbl">Newborns with open alerts</div></div>
        <div className="figure"><div className="big">{qualityIssues}</div><div className="lbl">Newborns with signal-quality or connection issues</div></div>
      </div>

      <section className="section"><header><h2>Live monitoring</h2><Link to="/monitoring">Open full monitoring view</Link></header>
        {!rows.length ? <Empty title="No newborns are being monitored">Register a newborn and assign a device to begin.</Empty> : (
          <div className="tablewrap"><table><thead><tr><th>Newborn</th>{MEASUREMENT_ORDER.map((t) => <th key={t}>{t === 'spo2' ? 'SpO₂' : t === 'heart_rate' ? 'Heart rate' : t === 'temperature' ? 'Temp.' : 'Resp. rate'}</th>)}<th>Signal quality</th><th>Last observation</th><th>Status</th></tr></thead>
            <tbody>{rows.map((r) => { const off = isOffline(r); const cur = r.measurements.filter((m) => !m.isStale && !off); const w = worstQuality(cur); const last = r.measurements.map((m) => m.observed_at).sort().pop();
              return <tr key={r.id}><td><Link to={`/newborns/${r.id}`}><b>{r.newborn_identifier}</b></Link>{r.is_simulated && <div><SimChip /></div>}</td>
                {MEASUREMENT_ORDER.map((t) => { const m = r.measurements.find((x) => x.measurement_type === t); const stale = !m || m.isStale || off; return <td key={t} className="num" style={{ fontSize: 17, color: stale ? '#8896A2' : undefined, textDecoration: m && stale ? 'line-through' : undefined }}>{m ? `${m.value}` : '–'}</td>; })}
                <td>{off ? <span className="chip poor">Disconnected</span> : w ? <QualityChip q={w} /> : <span className="chip">No current data</span>}</td>
                <td className="small">{ago(last)}</td><td className="small">{r.monitoring_status}{!r.dataCurrent && r.monitoring_status === 'monitoring' ? ' · data not current' : ''}</td></tr>; })}</tbody></table></div>)}
      </section>

      <div className="cols">
        {can('alert:read') && <section className="section"><header><h2>Clinical alerts</h2><Link to="/alerts">All alerts</Link></header>
          {alerts.isLoading ? <Loading /> : alerts.error ? <ErrorState error={alerts.error} retry={() => alerts.refetch()} /> : !alerts.data?.length ? <Empty title="No open alerts">New alerts appear here as soon as a rule is triggered.</Empty> : alerts.data.map((a) => <AlertRow key={a.id} a={a} />)}</section>}
        {can('response:read') && <section className="section"><header><h2>Response activity</h2><Link to="/response-log">Full log</Link></header>
          {log.isLoading ? <Loading /> : log.error ? <ErrorState error={log.error} retry={() => log.refetch()} /> : !log.data?.length ? <Empty title="No response activity yet" /> : <Timeline events={log.data} showAlert />}</section>}
      </div>

      <section className="section"><header><h2>Trends</h2>
        <div className="row"><label htmlFor="tn" className="small muted" style={{ margin: 0 }}>Newborn</label><select id="tn" style={{ width: 'auto' }} value={chosen} onChange={(e) => setSel(e.target.value)}>{rows.map((r) => <option key={r.id} value={r.id}>{r.newborn_identifier}</option>)}</select></div></header>
        {obs.isLoading ? <Loading /> : obs.error ? <ErrorState error={obs.error} retry={() => obs.refetch()} /> : <div className="charts">{MEASUREMENT_ORDER.map((t) => <TrendChart key={t} type={t} points={by(t)} />)}</div>}
        <p className="small muted" style={{ marginTop: 8 }}>Hollow markers are readings with questionable or poor signal. They are shown for transparency and are not used to trigger physiological alerts.</p>
      </section>
    </div>
  );
}

function AdminOverview() {
  const nb = useQuery({ queryKey: ['newborns', {}], queryFn: () => api<Newborn[]>('/newborns') });
  const dev = useQuery({ queryKey: ['devices'], queryFn: () => api<Device[]>('/devices'), enabled: true });
  if (nb.isLoading || dev.isLoading) return <Loading />;
  if (nb.error) return <ErrorState error={nb.error} retry={() => nb.refetch()} />;
  const n = nb.data ?? []; const d = dev.data ?? [];
  return (
    <div><div className="pagehead"><div><h1>Overview</h1><p>Operational summary for your hospital.</p></div></div>
      <Banner kind="info">Administrator accounts do not include access to clinical observations or alerts. Clinical access is granted by hospital governance.</Banner>
      <div className="figures">
        <div className="figure"><div className="big">{n.filter((x) => x.monitoring_status === 'monitoring').length}</div><div className="lbl">Newborns registered and monitored</div></div>
        <div className="figure"><div className="big">{n.filter((x) => !x.unit_id).length}</div><div className="lbl">Newborns without a unit</div></div>
        <div className="figure"><div className="big">{d.length}</div><div className="lbl">Registered devices</div></div>
        <div className="figure"><div className="big">{d.filter((x) => !x.newborn_id).length}</div><div className="lbl">Devices not assigned</div></div>
      </div>
      <p style={{ marginTop: 18 }}><Link className="btn" to="/newborns">Register or manage newborns</Link>{' '}<Link className="btn ghost" to="/devices">Manage devices</Link></p>
    </div>
  );
}
