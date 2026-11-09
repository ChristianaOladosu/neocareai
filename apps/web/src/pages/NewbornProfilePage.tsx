import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, patch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Alert, LogEvent, MeasurementType, Newborn, Observation, Overview, Unit } from '../types';
import { Dialog, Empty, ErrorState, Field, Loading, QualityChip, SimChip, errMsg } from '../components/common/ui';
import { ReadingCell, isOffline } from '../components/monitoring/Readings';
import { AlertRow } from '../components/alerts/AlertRow';
import { Timeline } from '../components/responses/Timeline';
import { TrendChart } from '../components/charts/TrendChart';
import { MEASUREMENTS, MEASUREMENT_ORDER, dt } from '../utils/format';

export default function NewbornProfilePage() {
  const { id = '' } = useParams(); const { can } = useAuth();
  const [sp, setSp] = useSearchParams(); const tab = sp.get('tab') ?? 'overview';
  const nb = useQuery({ queryKey: ['newborn', id], queryFn: () => api<Newborn>(`/newborns/${id}`) });
  const [edit, setEdit] = useState(false);
  if (nb.isLoading) return <Loading />;
  if (nb.error) return <ErrorState error={nb.error} retry={() => nb.refetch()} />;
  const n = nb.data!;
  const tabs = [{ k: 'overview', l: 'Overview' }, ...(can('observation:read') ? [{ k: 'observations', l: 'Observations' }, { k: 'trends', l: 'Trends' }] : []), ...(can('alert:read') ? [{ k: 'alerts', l: 'Alerts' }] : []), ...(can('response:read') ? [{ k: 'history', l: 'Response History' }] : [])];
  return (
    <div>
      <div className="pagehead"><div><h1>{n.newborn_identifier}</h1><p>{n.unit_name ?? 'No unit assigned'} · {n.monitoring_status}{n.gestational_age_weeks ? ` · ${n.gestational_age_weeks} weeks gestation` : ''}</p></div>{can('newborn:write') && <button className="btn ghost" onClick={() => setEdit(true)}>Edit monitoring details</button>}</div>
      <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setSp({ tab: t.k })}>{t.l}</button>)}</div>
      {tab === 'overview' && <OverviewTab n={n} />}
      {tab === 'observations' && <ObservationsTab id={id} />}
      {tab === 'trends' && <TrendsTab id={id} />}
      {tab === 'alerts' && <AlertsTab id={id} />}
      {tab === 'history' && <HistoryTab ident={n.newborn_identifier} />}
      {edit && <EditDialog n={n} onClose={() => setEdit(false)} />}
    </div>
  );
}

function OverviewTab({ n }: { n: Newborn }) {
  const { can } = useAuth();
  const ov = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/monitoring/overview'), enabled: can('observation:read'), refetchInterval: 10_000 });
  const row = ov.data?.newborns.find((r) => r.id === n.id);
  return (
    <div className="stack">
      <dl className="kv"><dt>Identifier</dt><dd className="num">{n.newborn_identifier}</dd><dt>Date of birth</dt><dd>{n.date_of_birth.slice(0, 10)}</dd><dt>Admitted</dt><dd>{dt(n.admission_date)}</dd><dt>Neonatal unit</dt><dd>{n.unit_name ?? 'Not assigned'}</dd><dt>Monitoring status</dt><dd>{n.monitoring_status}</dd></dl>
      {can('observation:read') && <section className="section"><header><h2>Latest measurements</h2>{row?.is_simulated && <SimChip />}</header>
        {ov.isLoading ? <Loading /> : !row ? <Empty title="Not currently monitored" /> : <>
          {isOffline(row) && <div className="banner warn" role="status">{row.device_identifier ? 'The assigned device is disconnected. Values below are not current.' : 'No device is assigned. No measurements are being received.'}</div>}
          <div className="strip" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>{MEASUREMENT_ORDER.map((t) => <ReadingCell key={t} type={t} m={row.measurements.find((m) => m.measurement_type === t)} offline={isOffline(row)} />)}</div></>}
      </section>}
    </div>
  );
}

function ObservationsTab({ id }: { id: string }) {
  const [type, setType] = useState<'' | MeasurementType>('');
  const q = useQuery({ queryKey: ['observations', id, type], queryFn: () => api<Observation[]>(`/newborns/${id}/observations?limit=200${type ? `&type=${type}` : ''}`), refetchInterval: 15_000 });
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}><label htmlFor="mt" className="small muted" style={{ margin: 0 }}>Measurement</label><select id="mt" style={{ width: 200 }} value={type} onChange={(e) => setType(e.target.value as MeasurementType | '')}><option value="">All measurements</option>{MEASUREMENT_ORDER.map((t) => <option key={t} value={t}>{MEASUREMENTS[t].label}</option>)}</select></div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <Empty title="No observations recorded" /> : (
        <div className="tablewrap"><table><thead><tr><th>Observed</th><th>Measurement</th><th>Value</th><th>Signal quality</th><th>Reason</th><th>Source</th></tr></thead>
          <tbody>{q.data.map((o) => <tr key={o.id}><td className="small">{dt(o.observed_at)}</td><td>{MEASUREMENTS[o.measurement_type].label}</td><td className="num">{o.value} <span className="muted small">{o.unit}</span></td><td><QualityChip q={o.quality_status} /></td><td className="small muted" style={{ maxWidth: 320 }}>{o.quality_reason}</td><td className="small">{o.source}</td></tr>)}</tbody></table></div>)}
    </div>
  );
}

function TrendsTab({ id }: { id: string }) {
  const [mins, setMins] = useState(60);
  const q = useQuery({ queryKey: ['observations', id, 'trend', mins], queryFn: () => api<Observation[]>(`/newborns/${id}/observations?limit=1000&since=${encodeURIComponent(new Date(Date.now() - mins * 60000).toISOString())}`), refetchInterval: 15_000 });
  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}><label htmlFor="rg" className="small muted" style={{ margin: 0 }}>Time range</label><select id="rg" style={{ width: 160 }} value={mins} onChange={(e) => setMins(Number(e.target.value))}><option value={15}>Last 15 min</option><option value={60}>Last hour</option><option value={360}>Last 6 hours</option><option value={1440}>Last 24 hours</option></select></div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : <div className="charts">{MEASUREMENT_ORDER.map((t) => <TrendChart key={t} type={t} points={q.data!.filter((o) => o.measurement_type === t).map((o) => ({ t: new Date(o.observed_at).getTime(), v: o.value, q: o.quality_status }))} />)}</div>}
      <p className="small muted" style={{ marginTop: 8 }}>Hollow markers indicate questionable or poor signal. Trends describe measurements, not diagnoses.</p>
    </div>
  );
}

function AlertsTab({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['alerts', 'nb', id], queryFn: () => api<Alert[]>(`/alerts?newbornId=${id}`) });
  return q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <Empty title="No alerts for this newborn" /> : <div>{q.data.map((a) => <AlertRow key={a.id} a={a} />)}</div>;
}
function HistoryTab({ ident }: { ident: string }) {
  const q = useQuery({ queryKey: ['response-log', 'all'], queryFn: () => api<LogEvent[]>('/response-log?limit=500') });
  const ev = q.data?.filter((e) => e.newborn_identifier === ident);
  return q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !ev?.length ? <Empty title="No response history yet" /> : <Timeline events={ev} showAlert />;
}

function EditDialog({ n, onClose }: { n: Newborn; onClose: () => void }) {
  const qc = useQueryClient(); const units = useQuery({ queryKey: ['units'], queryFn: () => api<Unit[]>('/units') });
  const [unit, setUnit] = useState(n.unit_id ?? ''); const [status, setStatus] = useState(n.monitoring_status);
  const m = useMutation({ mutationFn: () => patch(`/newborns/${n.id}`, { unitId: unit || null, monitoringStatus: status }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['newborn', n.id] }); qc.invalidateQueries({ queryKey: ['newborns'] }); qc.invalidateQueries({ queryKey: ['overview'] }); onClose(); } });
  return (
    <Dialog title="Edit monitoring details" onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
        {m.error && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
        <Field id="eu" label="Neonatal unit"><select id="eu" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Not assigned</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field id="es" label="Monitoring status" hint="Discharged newborns stop accepting new observations."><select id="es" value={status} onChange={(e) => setStatus(e.target.value as Newborn['monitoring_status'])}><option value="monitoring">Monitoring</option><option value="paused">Paused</option><option value="discharged">Discharged</option></select></Field>
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={m.isPending}>{m.isPending ? 'Saving…' : 'Save changes'}</button></div>
      </form>
    </Dialog>
  );
}
export { Link };
