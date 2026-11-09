import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, post } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Device, Newborn } from '../types';
import { Banner, Dialog, Empty, ErrorState, Field, Loading, QualityChip, SimChip, errMsg, issueMap } from '../components/common/ui';
import { ago } from '../utils/format';

export default function DevicesPage() {
  const { can } = useAuth(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['devices'], queryFn: () => api<Device[]>('/devices'), refetchInterval: 10_000 });
  const [reg, setReg] = useState(false); const [assign, setAssign] = useState<Device | null>(null); const [unassign, setUnassign] = useState<Device | null>(null);
  const un = useMutation({ mutationFn: (d: Device) => post(`/devices/${d.id}/unassign`), onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); qc.invalidateQueries({ queryKey: ['overview'] }); setUnassign(null); } });
  const manage = can('device:manage');
  return (
    <div>
      <div className="pagehead"><div><h1>Devices</h1><p>Registered monitors and their assignments. A device can only send data for the newborn it is currently assigned to.</p></div>{manage && <button className="btn" onClick={() => setReg(true)}><Plus size={16} />Register device</button>}</div>
      <Banner kind="info">No physical medical device has been connected to this prototype. Devices marked “Simulated device” are software simulators producing synthetic data.</Banner>
      {q.isLoading ? <Loading /> : q.error ? <ErrorState error={q.error} retry={() => q.refetch()} /> : !q.data?.length ? <Empty title="No devices registered" /> : (
        <div className="tablewrap"><table><thead><tr><th>Device</th><th>Type</th><th>Assigned newborn</th><th>Connection</th><th>Last observation received</th><th>Last data quality</th>{manage && <th>Actions</th>}</tr></thead>
          <tbody>{q.data.map((d) => <tr key={d.id}><td><b>{d.device_identifier}</b><div className="row" style={{ marginTop: 3 }}>{d.is_simulated && <SimChip />}<span className="small muted">{[d.manufacturer, d.model].filter(Boolean).join(' ')}</span></div></td><td>{d.device_type}</td>
            <td>{d.newborn_id ? <Link to={`/newborns/${d.newborn_id}`}>{d.newborn_identifier}</Link> : <span className="muted">Not assigned</span>}</td>
            <td><span className={`chip ${d.connection_status === 'connected' ? 'good' : d.connection_status === 'disconnected' ? 'poor' : ''}`}>{d.connection_status === 'connected' ? 'Connected' : d.connection_status === 'disconnected' ? 'Disconnected' : 'Unknown'}</span></td>
            <td className="small">{ago(d.last_seen_at)}</td><td>{d.last_quality ? <QualityChip q={d.last_quality} /> : <span className="muted small">No data</span>}</td>
            {manage && <td><div className="row"><button className="btn ghost sm" onClick={() => setAssign(d)}>{d.newborn_id ? 'Reassign' : 'Assign'}</button>{d.newborn_id && <button className="btn danger sm" onClick={() => setUnassign(d)}>Unassign</button>}</div></td>}</tr>)}</tbody></table></div>)}
      {reg && <RegisterDevice onClose={() => setReg(false)} />}
      {assign && <AssignDialog d={assign} onClose={() => setAssign(null)} />}
      {unassign && <Dialog title="Unassign device" onClose={() => setUnassign(null)}><p>Unassign <b>{unassign.device_identifier}</b> from <b>{unassign.newborn_identifier}</b>? The device’s data will no longer be accepted until it is assigned again. This is recorded in the audit log.</p>
        {un.error && <div className="banner err" role="alert" style={{ marginTop: 10 }}>{errMsg(un.error)}</div>}<div className="actions"><button className="btn ghost" onClick={() => setUnassign(null)}>Cancel</button><button className="btn danger" disabled={un.isPending} onClick={() => un.mutate(unassign)}>{un.isPending ? 'Unassigning…' : 'Unassign device'}</button></div></Dialog>}
    </div>
  );
}

function RegisterDevice({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient(); const [id, setId] = useState(''); const [man, setMan] = useState(''); const [model, setModel] = useState(''); const [sim, setSim] = useState(true);
  const m = useMutation({ mutationFn: () => post('/devices', { deviceIdentifier: id.trim(), isSimulated: sim, ...(man && { manufacturer: man }), ...(model && { model }) }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); onClose(); } });
  const iss = issueMap(m.error);
  return <Dialog title="Register device" onClose={onClose}><form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
    {m.error && !Object.keys(iss).length && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
    <Field id="di" label="Device identifier" error={iss.deviceIdentifier}><input id="di" value={id} onChange={(e) => setId(e.target.value)} required /></Field>
    <Field id="dm" label="Manufacturer"><input id="dm" value={man} onChange={(e) => setMan(e.target.value)} /></Field><Field id="dmo" label="Model"><input id="dmo" value={model} onChange={(e) => setModel(e.target.value)} /></Field>
    <div className="field"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}><input type="checkbox" style={{ width: 'auto' }} checked={sim} onChange={(e) => setSim(e.target.checked)} />Simulated device (produces synthetic data)</label><div className="hint">No physical medical device is supported yet. Leave this ticked unless the device really is a registered monitor.</div></div>
    <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!id.trim() || m.isPending}>{m.isPending ? 'Registering…' : 'Register device'}</button></div></form></Dialog>;
}

function AssignDialog({ d, onClose }: { d: Device; onClose: () => void }) {
  const qc = useQueryClient(); const nbs = useQuery({ queryKey: ['newborns', 'assignable'], queryFn: () => api<Newborn[]>('/newborns?status=monitoring') }); const [nb, setNb] = useState('');
  const target = nbs.data?.find((n) => n.id === nb);
  const m = useMutation({ mutationFn: () => post(`/devices/${d.id}/assign`, { newbornId: nb }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); qc.invalidateQueries({ queryKey: ['overview'] }); onClose(); } });
  return <Dialog title={`${d.newborn_id ? 'Reassign' : 'Assign'} ${d.device_identifier}`} onClose={onClose}><form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
    {m.error && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
    <Field id="an" label="Newborn" hint="Check the identifier on the cot before confirming. Data will be attributed to this newborn."><select id="an" value={nb} onChange={(e) => setNb(e.target.value)} required><option value="">Select a newborn</option>{nbs.data?.map((n) => <option key={n.id} value={n.id}>{n.newborn_identifier}{n.unit_name ? ` (${n.unit_name})` : ''}</option>)}</select></Field>
    {target && <div className="banner warn"><div>Any device currently assigned to <b>{target.newborn_identifier}</b>{d.newborn_id ? `, and the current assignment of ${d.device_identifier},` : ''} will be unassigned. This is recorded in the audit log.</div></div>}
    <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={!nb || m.isPending}>{m.isPending ? 'Saving…' : 'Confirm assignment'}</button></div></form></Dialog>;
}
