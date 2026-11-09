import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { LogEvent } from '../types';
import { Empty, ErrorState, Loading } from '../components/common/ui';
import { Timeline } from '../components/responses/Timeline';

export default function ResponseLogPage() {
  const q = useQuery({ queryKey: ['response-log', 'page'], queryFn: () => api<LogEvent[]>('/response-log?limit=300'), refetchInterval: 15_000 });
  return (
    <div><div className="pagehead"><div><h1>Response log</h1><p>A chronological, tamper-resistant record of every alert, acknowledgement, assessment, escalation and resolution. Entries cannot be edited or deleted.</p></div></div>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <Empty title="No response activity yet">Events appear here when alerts are generated or acted on.</Empty> : <Timeline events={q.data} showAlert />}
    </div>
  );
}
