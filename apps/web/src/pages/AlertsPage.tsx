import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Alert } from '../types';
import { Empty, ErrorState, Loading } from '../components/common/ui';
import { AlertRow } from '../components/alerts/AlertRow';

const FILTERS = [{ k: 'open', l: 'Needs attention', s: 'awaiting_acknowledgement,acknowledged,under_assessment,escalated' }, { k: 'awaiting', l: 'Awaiting acknowledgement', s: 'awaiting_acknowledgement' }, { k: 'escalated', l: 'Escalated', s: 'escalated' }, { k: 'resolved', l: 'Resolved', s: 'resolved' }, { k: 'all', l: 'All', s: '' }];

export default function AlertsPage() {
  const [sp, setSp] = useSearchParams(); const f = FILTERS.find((x) => x.k === sp.get('f')) ?? FILTERS[0]; const nb = sp.get('newbornId');
  const q = useQuery({ queryKey: ['alerts', f.k, nb], queryFn: () => api<Alert[]>(`/alerts?${new URLSearchParams({ ...(f.s && { status: f.s }), ...(nb && { newbornId: nb }) })}`), refetchInterval: 15_000 });
  return (
    <div>
      <div className="pagehead"><div><h1>Clinical alerts</h1><p>Alerts stay open until a clinician records a response. Opening an alert never dismisses it.</p></div></div>
      <div className="tabs" role="tablist">{FILTERS.map((x) => <button key={x.k} role="tab" aria-selected={f.k === x.k} className={f.k === x.k ? 'on' : ''} onClick={() => setSp({ f: x.k, ...(nb && { newbornId: nb }) })}>{x.l}</button>)}</div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <Empty title="No alerts here">{f.k === 'open' ? 'Nothing needs attention right now.' : 'No alerts match this filter.'}</Empty> : q.data.map((a) => <AlertRow key={a.id} a={a} />)}
    </div>
  );
}
