import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, post } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Newborn, Unit } from '../types';
import { Dialog, Empty, ErrorState, Field, Loading, errMsg, issueMap } from '../components/common/ui';

export default function NewbornsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState(''); const [unitId, setUnitId] = useState(''); const [status, setStatus] = useState(''); const [open, setOpen] = useState(false);
  const params = new URLSearchParams({ ...(search && { search }), ...(unitId && { unitId }), ...(status && { status }) }).toString();
  const list = useQuery({ queryKey: ['newborns', params], queryFn: () => api<Newborn[]>(`/newborns?${params}`) });
  const units = useQuery({ queryKey: ['units'], queryFn: () => api<Unit[]>('/units') });
  return (
    <div>
      <div className="pagehead"><div><h1>Newborns</h1><p>Directory of newborns in your hospital.</p></div>{can('newborn:write') && <button className="btn" onClick={() => setOpen(true)}><Plus size={16} />Register newborn</button>}</div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        <div style={{ width: 240 }}><label htmlFor="s" className="sr-only">Search by identifier</label><input id="s" placeholder="Search by identifier" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div style={{ width: 200 }}><label htmlFor="u" className="sr-only">Unit</label><select id="u" value={unitId} onChange={(e) => setUnitId(e.target.value)}><option value="">All units</option>{units.data?.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></div>
        <div style={{ width: 200 }}><label htmlFor="st" className="sr-only">Monitoring status</label><select id="st" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option><option value="monitoring">Monitoring</option><option value="paused">Paused</option><option value="discharged">Discharged</option></select></div>
      </div>
      {list.isLoading ? <Loading /> : list.error ? <ErrorState error={list.error} retry={() => list.refetch()} /> : !list.data?.length ? <Empty title={search || unitId || status ? 'No newborns match these filters' : 'No newborns registered yet'}>{can('newborn:write') ? 'Use “Register newborn” to add the first one.' : 'An administrator can register newborns.'}</Empty> : (
        <div className="tablewrap"><table><thead><tr><th>Identifier</th><th>Unit</th><th>Gestational age</th><th>Date of birth</th><th>Monitoring status</th><th /></tr></thead>
          <tbody>{list.data.map((n) => <tr key={n.id}><td><Link to={`/newborns/${n.id}`}><b>{n.newborn_identifier}</b></Link></td><td>{n.unit_name ?? <span className="muted">Not assigned</span>}</td><td className="num">{n.gestational_age_weeks ? `${n.gestational_age_weeks} wk` : '–'}</td><td className="num">{n.date_of_birth.slice(0, 10)}</td><td><span className="chip">{n.monitoring_status}</span></td><td><Link to={`/newborns/${n.id}`}>View profile</Link></td></tr>)}</tbody></table></div>)}
      {open && <RegisterDialog units={units.data ?? []} onClose={() => setOpen(false)} />}
    </div>
  );
}

function RegisterDialog({ units, onClose }: { units: Unit[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [id, setId] = useState(''); const [dob, setDob] = useState(new Date().toISOString().slice(0, 10)); const [ga, setGa] = useState(''); const [unit, setUnit] = useState('');
  const m = useMutation({ mutationFn: () => post('/newborns', { newbornIdentifier: id.trim(), dateOfBirth: dob, ...(ga && { gestationalAgeWeeks: Number(ga) }), ...(unit && { unitId: unit }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['newborns'] }); qc.invalidateQueries({ queryKey: ['overview'] }); onClose(); } });
  const issues = issueMap(m.error); const gaBad = ga !== '' && (Number(ga) < 20 || Number(ga) > 45);
  return (
    <Dialog title="Register newborn" onClose={onClose}>
      <p className="small muted" style={{ marginBottom: 12 }}>Use a hospital-assigned identifier. Do not enter names or other identifying details in this prototype.</p>
      <form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }} noValidate>
        {m.error && !Object.keys(issues).length && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
        <Field id="nid" label="Newborn identifier" error={issues.newbornIdentifier}><input id="nid" value={id} onChange={(e) => setId(e.target.value)} maxLength={40} required /></Field>
        <Field id="dob" label="Date of birth" error={issues.dateOfBirth}><input id="dob" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} required /></Field>
        <Field id="ga" label="Gestational age (weeks)" hint="Optional. Between 20 and 45." error={gaBad ? 'Enter a value between 20 and 45.' : issues.gestationalAgeWeeks}><input id="ga" type="number" step="0.1" value={ga} onChange={(e) => setGa(e.target.value)} /></Field>
        <Field id="un" label="Neonatal unit"><select id="un" value={unit} onChange={(e) => setUnit(e.target.value)}><option value="">Assign later</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!id.trim() || !dob || gaBad || m.isPending}>{m.isPending ? 'Registering…' : 'Register newborn'}</button></div>
      </form>
    </Dialog>
  );
}
