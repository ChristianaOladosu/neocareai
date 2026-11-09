import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import type { Overview } from '../types';
import { Banner, Empty, ErrorState, Loading } from '../components/common/ui';
import { Strip } from '../components/monitoring/Readings';

export default function MonitoringPage() {
  const [unit, setUnit] = useState('');
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/monitoring/overview'), refetchInterval: 10_000 });
  if (q.isLoading) return <Loading label="Loading monitoring" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const units = [...new Set(q.data!.newborns.map((r) => r.unit_name).filter(Boolean))] as string[];
  const rows = q.data!.newborns.filter((r) => !unit || r.unit_name === unit);
  return (
    <div>
      <div className="pagehead"><div><h1>Live monitoring</h1><p>Latest available observations. Values older than {Math.round(q.data!.staleAfterSeconds / 60)} min, or from a disconnected device, are marked not current.</p></div>
        <div><label htmlFor="mu" className="sr-only">Unit</label><select id="mu" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: 200 }}><option value="">All units</option>{units.map((u) => <option key={u}>{u}</option>)}</select></div></div>
      <Banner kind="info">Readings come from synthetic simulated monitors, not real medical devices. Signal quality describes the measurement, not the newborn’s condition: a poor or missing signal is never a sign that a newborn is stable.</Banner>
      {!rows.length ? <Empty title="No newborns to show">Newborns appear here once they are registered and monitored.</Empty> : <div className="strips">{rows.map((r) => <Strip key={r.id} row={r} />)}</div>}
    </div>
  );
}
