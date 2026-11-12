import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { AlertDetail, EvidenceReading, MeasurementType } from '../types';
import { Banner, Dialog, ErrorState, Field, Loading, PriorityChip, QualityChip, StatusChip, errMsg } from '../components/common/ui';
import { Timeline } from '../components/responses/Timeline';
import { TrendChart } from '../components/charts/TrendChart';
import { AiPanel } from '../components/alerts/AiPanel';
import { MEASUREMENTS, dt } from '../utils/format';

type Action = 'assess' | 'escalate' | 'resolve' | null;

export default function AlertDetailPage() {
  const { id = '' } = useParams(); const { can } = useAuth(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['alert', id], queryFn: () => api<AlertDetail>(`/alerts/${id}`), refetchInterval: 15_000 });
  const [action, setAction] = useState<Action>(null); const [toast, setToast] = useState(''); const [draft, setDraft] = useState<{ text: string; id: string; mode: 'demo' | 'azure' } | null>(null);
  const refresh = (msg: string) => { ['alert', 'alerts', 'response-log', 'overview'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); setToast(msg); setTimeout(() => setToast(''), 3500); };
  const ack = useMutation({ mutationFn: () => post(`/alerts/${id}/acknowledge`), onSuccess: () => refresh('Alert acknowledged') });
  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const a = q.data!; const ev = a.evidence; const s = a.status;
  const canAck = s === 'awaiting_acknowledgement' && can('alert:acknowledge');
  const canAssess = (s === 'acknowledged' || s === 'under_assessment') && can('alert:assess');
  const canEsc = (s === 'acknowledged' || s === 'under_assessment') && can('alert:escalate');
  const canRes = (s === 'under_assessment' || s === 'escalated') && can('alert:resolve');
  const types = [...new Set(ev.triggering.map((t) => t.measurementType))] as MeasurementType[];
  const pts = (t: MeasurementType) => [...ev.context, ...ev.triggering].filter((r) => r.measurementType === t).map((r) => ({ t: new Date(r.observedAt).getTime(), v: r.value, q: r.quality }));
  const nobody = !canAck && !canAssess && !canEsc && !canRes && s !== 'resolved';

  return (
    <div>
      <div className="pagehead"><div><div className="row wrap"><PriorityChip p={a.priority} /><StatusChip s={s} /></div><h1 style={{ marginTop: 8 }}>{a.title}</h1>
        <p>Newborn <Link to={`/newborns/${a.newborn_id}`}>{a.newborn_identifier}</Link> · generated {dt(a.created_at)}</p></div></div>
      {ev.illustrative && <Banner kind="warn">This alert comes from an illustrative demonstration rule. Its thresholds are placeholders, not clinically approved guidance. Assess the newborn directly.</Banner>}
      {ack.error && <div className="banner err" role="alert">{errMsg(ack.error)}</div>}

      <div className="row wrap" style={{ margin: '4px 0 8px' }}>
        {canAck && <button className="btn" onClick={() => ack.mutate()} disabled={ack.isPending}>{ack.isPending ? 'Acknowledging…' : 'Acknowledge alert'}</button>}
        {canAssess && <button className="btn" onClick={() => setAction('assess')}>Record assessment</button>}
        {canEsc && <button className="btn danger" onClick={() => setAction('escalate')}>Escalate</button>}
        {canRes && <button className="btn ghost" onClick={() => setAction('resolve')}>Resolve</button>}
        {nobody && <span className="small muted">Your role has no available actions on this alert in its current state.</span>}
        {s === 'awaiting_acknowledgement' && !canAck && <span className="small muted">Waiting for a clinician with acknowledgement rights.</span>}
      </div>
      {s === 'acknowledged' && can('alert:assess') === false && <p className="small muted">A doctor must record the clinical assessment before this alert can be resolved.</p>}

      <AiPanel alertId={id} status={s} canSummarise={can('ai:summarise')} canDraft={can('ai:draft')} canAssess={canAssess} onUseDraft={(text, i, mode) => { setDraft({ text, id: i, mode }); setAction('assess'); }} />

      <div className="cols">
        <div>
          <section className="section"><header><h2>Why this alert was generated</h2></header>
            <p style={{ maxWidth: '70ch' }}>{a.explanation}</p>
            <dl className="kv" style={{ marginTop: 12 }}><dt>Rule</dt><dd>{a.rule_name ?? ev.ruleKey} <span className="muted">(version {a.rule_version ?? ev.ruleVersion})</span></dd><dt>Signal quality of triggering readings</dt><dd className="row wrap">{[...new Set(ev.qualityOfTriggering)].map((qq) => <QualityChip key={qq} q={qq} />)}</dd></dl>
          </section>
          <section className="section"><header><h2>Triggering observations</h2></header>
            <div className="tablewrap"><table><thead><tr><th>Observed</th><th>Measurement</th><th>Value</th><th>Signal</th></tr></thead><tbody>
              {[...ev.triggering].sort((x: EvidenceReading, y: EvidenceReading) => x.observedAt.localeCompare(y.observedAt)).map((r) => <tr key={r.id}><td className="small">{dt(r.observedAt)}</td><td>{MEASUREMENTS[r.measurementType].label}</td><td className="num">{r.value} <span className="muted small">{r.unit}</span></td><td><QualityChip q={r.quality} /></td></tr>)}</tbody></table></div>
          </section>
          <section className="section"><header><h2>Historical context</h2></header><div className="stack">{types.map((t) => <TrendChart key={t} type={t} points={pts(t)} height={150} />)}</div></section>
        </div>
        <div>
          <section className="section"><header><h2>Response history</h2></header><Timeline events={a.events} /></section>
          {!!a.assessments.length && <section className="section"><header><h2>Clinical assessments</h2></header>{a.assessments.map((x) => <div key={x.id} style={{ marginBottom: 12 }}><div className="small muted">{x.clinician} · {dt(x.created_at)}</div><p style={{ maxWidth: '70ch' }}>{x.assessment_text}</p></div>)}</section>}
        </div>
      </div>

      {action && <ActionDialog action={action} id={id} draft={action === 'assess' ? draft : null} onClose={() => { setAction(null); setDraft(null); }} onDone={(m) => { setAction(null); setDraft(null); refresh(m); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

const COPY = { assess: { title: 'Record clinical assessment', btn: 'Record assessment', done: 'Assessment recorded' }, escalate: { title: 'Escalate alert', btn: 'Escalate alert', done: 'Alert escalated' }, resolve: { title: 'Resolve alert', btn: 'Resolve alert', done: 'Alert resolved' } } as const;

function ActionDialog({ action, id, draft, onClose, onDone }: { action: Exclude<Action, null>; id: string; draft: { text: string; id: string; mode: 'demo' | 'azure' } | null; onClose: () => void; onDone: (m: string) => void }) {
  const [text, setText] = useState(draft?.text ?? ''); const [resp, setResp] = useState('');
  const c = COPY[action];
  const m = useMutation({ mutationFn: () => post(`/alerts/${id}/${action === 'assess' ? 'assessment' : action}`, action === 'assess' ? { assessmentText: text.trim(), ...(resp.trim() && { responseText: resp.trim() }), ...(draft && { aiInteractionId: draft.id }) } : action === 'escalate' ? { reason: text.trim() } : { resolutionNote: text.trim() }), onSuccess: () => onDone(c.done) });
  const incomplete = text.includes('[Clinician to complete');
  const label = action === 'assess' ? 'Clinical assessment' : action === 'escalate' ? 'Reason for escalation' : 'Resolution note';
  return (
    <Dialog title={c.title} onClose={onClose}>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
        {action === 'resolve' && <p className="small" style={{ marginBottom: 10 }}>Resolving records that a clinician has reviewed and closed this alert. It is permanent history and cannot be edited.</p>}
        {action === 'escalate' && <p className="small" style={{ marginBottom: 10 }}>Escalation is recorded with your name and the time. The alert stays open until a clinician resolves it.</p>}
        {draft && <div className="banner warn" role="note"><div><b>{draft.mode === 'azure' ? 'Started from an AI-generated draft (Azure OpenAI).' : 'Started from an AI-prepared draft (Demo Mode – Not Connected to Azure).'}</b> It is not a clinical finding. Edit it, replace every bracketed field with your own words, and only then record it. It is attributed to you.</div></div>}
        {incomplete && <p className="small" role="alert" style={{ color: '#8E2F27', marginBottom: 8 }}>Replace every [Clinician to complete …] field before you can record this.</p>}
        {m.error && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
        <Field id="txt" label={label} hint="Minimum 3 characters. Entries are permanent and attributed to you."><textarea id="txt" value={text} onChange={(e) => setText(e.target.value)} required style={draft ? { minHeight: 280, fontFamily: 'var(--font-mono)', fontSize: 13 } : undefined} /></Field>
        {action === 'assess' && <Field id="resp" label="Response taken (optional)" hint="For example, actions taken or follow-up planned."><textarea id="resp" value={resp} onChange={(e) => setResp(e.target.value)} /></Field>}
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className={`btn ${action === 'escalate' ? '' : ''}`} disabled={text.trim().length < 3 || m.isPending || incomplete}>{m.isPending ? 'Saving…' : c.btn}</button></div>
      </form>
    </Dialog>
  );
}
