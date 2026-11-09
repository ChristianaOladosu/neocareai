import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { api, post } from '../../services/api';
import type { AiResult, AiStatus, AlertStatus } from '../../types';
import { Banner, errMsg } from '../common/ui';

export function AiModeChip({ s }: { s?: AiStatus }) {
  const demo = !s || s.mode === 'demo';
  return <span className="chip" style={{ background: demo ? 'var(--amber-bg)' : 'var(--mist)', color: demo ? '#7A5A12' : '#0E5A56' }} title={demo ? 'Local template provider. No Azure or other external AI service is used.' : s?.label}>{demo ? 'Demo Mode – Not Connected to Azure' : s!.label}</span>;
}

export function AiPanel({ alertId, status, canSummarise, canDraft, canAssess, onUseDraft }: { alertId: string; status: AlertStatus; canSummarise: boolean; canDraft: boolean; canAssess: boolean; onUseDraft: (text: string, interactionId: string) => void }) {
  const st = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api<AiStatus>('/ai/status') });
  const [res, setRes] = useState<AiResult | null>(null);
  const run = useMutation({ mutationFn: (kind: 'summary' | 'draft-assessment') => post<AiResult>(`/alerts/${alertId}/ai/${kind}`), onSuccess: setRes });
  if (!canSummarise && !canDraft) return null;
  const off = st.data && !st.data.enabled;
  const assessable = (status === 'acknowledged' || status === 'under_assessment') && canAssess;
  return (
    <section className="section" aria-labelledby="ai-h">
      <header><h2 id="ai-h" className="row" style={{ gap: 8 }}><Sparkles size={17} />AI assistance</h2><AiModeChip s={st.data} /></header>
      <p className="small" style={{ maxWidth: '75ch' }}>Summarises the stored data for this alert and prepares a draft for you to review. It does <b>not</b> diagnose, recommend treatment, decide, or change this alert or any record. You remain responsible for every clinical judgement.</p>
      {off ? <Banner kind="info">AI assistance is switched off. The alert workflow is unaffected.</Banner> : (
        <div className="row wrap" style={{ margin: '10px 0' }}>
          {canSummarise && <button className="btn ghost" disabled={run.isPending} onClick={() => run.mutate('summary')}>{run.isPending && run.variables === 'summary' ? 'Summarising…' : 'Summarise this alert'}</button>}
          {canDraft && <button className="btn ghost" disabled={run.isPending} onClick={() => run.mutate('draft-assessment')}>{run.isPending && run.variables === 'draft-assessment' ? 'Preparing…' : 'Prepare draft assessment'}</button>}
        </div>)}
      {run.error && <div className="banner err" role="alert">{errMsg(run.error)} The alert workflow is unaffected.</div>}
      {res && (
        <div style={{ borderLeft: '3px solid var(--amber)', paddingLeft: 14, marginTop: 6 }} aria-live="polite">
          <div className="row wrap small" style={{ marginBottom: 6 }}><AiModeChip s={{ mode: res.mode, label: res.label } as AiStatus} /><span className="muted">{res.notice}</span></div>
          {res.status === 'fallback' && <p className="small muted">Azure was unavailable, so the local demo provider was used.</p>}
          <h3 style={{ marginBottom: 6 }}>{res.output.title}</h3>
          {res.output.sections.map((s) => <div key={s.heading} style={{ marginBottom: 10 }}><div className="small muted" style={{ fontWeight: 600 }}>{s.heading}</div><p style={{ whiteSpace: 'pre-line', maxWidth: '75ch' }}>{s.text}</p></div>)}
          {res.output.draftText && <>
            <pre style={{ whiteSpace: 'pre-wrap', background: '#fff', border: '1px solid var(--rule)', borderRadius: 6, padding: 12, font: '13px/1.5 var(--font-mono)', maxWidth: '85ch' }}>{res.output.draftText}</pre>
            <div className="row wrap"><button className="btn" disabled={!assessable} onClick={() => onUseDraft(res.output.draftText!, res.interactionId)}>Edit draft in assessment form</button>
              {!assessable && <span className="small muted">{canAssess ? 'Acknowledge the alert first, then you can edit this draft into an assessment.' : 'Your role cannot record assessments.'}</span>}</div></>}
          <details style={{ marginTop: 10 }}><summary className="small" style={{ cursor: 'pointer' }}>Sources and limitations</summary>
            <ul className="small">{res.output.sources.map((s) => <li key={s.id}><b>{s.id}</b> · {s.title} <span className="muted">({s.kind === 'system-data' ? 'stored alert data' : 'system documentation, not clinical guidance'})</span></li>)}</ul>
            <ul className="small muted">{res.output.limitations.map((l) => <li key={l}>{l}</li>)}</ul></details>
        </div>)}
    </section>
  );
}
