import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Hospital, RoleInfo, Rule, TeamUser, Unit } from '../types';
import { ModeChip } from '../components/alerts/AiPanel';
import type { AiConnectionTest, AiInteraction, AiStatus } from '../types';
import { dt } from '../utils/format';
import { Banner, Dialog, ErrorState, Field, Loading, errMsg, issueMap } from '../components/common/ui';

export default function SettingsPage() {
  const { can } = useAuth(); const [tab, setTab] = useState('profile');
  const tabs = [{ k: 'profile', l: 'Profile' }, { k: 'hospital', l: 'Hospital and units' }, ...(can('user:manage') ? [{ k: 'team', l: 'Team and permissions' }] : []), ...(can('device:read') ? [{ k: 'devices', l: 'Devices' }] : []), ...(can('alert:read') || can('user:manage') ? [{ k: 'rules', l: 'Alert configuration' }] : []), ...(can('audit:read') ? [{ k: 'ai', l: 'AI assistance' }] : []), { k: 'security', l: 'Security' }];
  return (
    <div><div className="pagehead"><div><h1>Settings</h1></div></div>
      <div className="tabs" role="tablist">{tabs.map((t) => <button key={t.k} role="tab" aria-selected={tab === t.k} className={tab === t.k ? 'on' : ''} onClick={() => setTab(t.k)}>{t.l}</button>)}</div>
      {tab === 'profile' && <Profile />}{tab === 'hospital' && <HospitalTab />}{tab === 'team' && <Team />}{tab === 'rules' && <Rules />}{tab === 'ai' && <AiAdmin />}{tab === 'security' && <Security />}
      {tab === 'devices' && <div><p>Register devices, assign them to newborns and review connection state on the Devices page.</p><p style={{ marginTop: 10 }}><Link className="btn" to="/devices">Open devices</Link></p></div>}
    </div>
  );
}

function Profile() { const { me } = useAuth(); return <dl className="kv"><dt>Name</dt><dd>{me!.fullName}</dd><dt>Email</dt><dd>{me!.email}</dd><dt>Role</dt><dd>{me!.roles.join(', ')}</dd><dt>Permissions</dt><dd className="small">{me!.permissions.join(', ') || 'None'}</dd></dl>; }

function HospitalTab() {
  const h = useQuery({ queryKey: ['hospital'], queryFn: () => api<Hospital>('/hospital') }); const u = useQuery({ queryKey: ['units'], queryFn: () => api<Unit[]>('/units') });
  if (h.isLoading || u.isLoading) return <Loading />; if (h.error) return <ErrorState error={h.error} retry={() => h.refetch()} />;
  return <div className="stack"><dl className="kv"><dt>Hospital</dt><dd>{h.data!.name}</dd><dt>Location</dt><dd>{h.data!.location ?? '–'}</dd><dt>Status</dt><dd>{h.data!.status}</dd></dl>
    <div className="tablewrap"><table><thead><tr><th>Neonatal unit</th><th>Type</th><th>Status</th><th>Newborns</th></tr></thead><tbody>{u.data?.map((x) => <tr key={x.id}><td><b>{x.name}</b></td><td>{x.unit_type}</td><td>{x.status}</td><td className="num">{x.newborn_count}</td></tr>)}</tbody></table></div></div>;
}

function Team() {
  const qc = useQueryClient(); const users = useQuery({ queryKey: ['users'], queryFn: () => api<TeamUser[]>('/users') }); const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<RoleInfo[]>('/roles') }); const [open, setOpen] = useState(false);
  if (users.isLoading) return <Loading />; if (users.error) return <ErrorState error={users.error} retry={() => users.refetch()} />;
  return <div className="stack">
    <div className="row"><p className="grow muted">Administrators manage accounts. They do not automatically receive clinical access.</p><button className="btn" onClick={() => setOpen(true)}>Add team member</button></div>
    <div className="tablewrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead><tbody>{users.data?.map((u) => <tr key={u.id}><td><b>{u.full_name}</b></td><td>{u.email}</td><td>{u.roles.join(', ')}</td><td>{u.account_status}</td></tr>)}</tbody></table></div>
    <section className="section"><header><h2>What each role can do</h2></header>{roles.data?.map((r) => <div key={r.name} style={{ marginBottom: 12 }}><b>{r.name}</b><div className="small muted">{r.permissions.join(', ')}</div></div>)}</section>
    {open && <AddUser onClose={() => { setOpen(false); qc.invalidateQueries({ queryKey: ['users'] }); }} />}</div>;
}
function AddUser({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ fullName: '', email: '', password: '', role: 'Nurse' }); const m = useMutation({ mutationFn: () => post('/auth/register', f), onSuccess: onClose }); const iss = issueMap(m.error);
  return <Dialog title="Add team member" onClose={onClose}><form onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(); }}>
    {m.error && !Object.keys(iss).length && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
    <Field id="fn" label="Full name" error={iss.fullName}><input id="fn" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></Field>
    <Field id="em" label="Email" error={iss.email}><input id="em" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
    <Field id="pw" label="Temporary password" hint="At least 10 characters. Ask the person to change it after signing in." error={iss.password}><input id="pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
    <Field id="ro" label="Role"><select id="ro" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option>Nurse</option><option>Doctor</option><option>Administrator</option></select></Field>
    <div className="actions"><button type="button" className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={m.isPending || f.password.length < 10 || !f.fullName || !f.email}>{m.isPending ? 'Adding…' : 'Add team member'}</button></div></form></Dialog>;
}

function Rules() {
  const q = useQuery({ queryKey: ['rules'], queryFn: () => api<Rule[]>('/alert-rules') });
  if (q.isLoading) return <Loading />; if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  return <div className="stack"><Banner kind="warn">These are illustrative demonstration rules, shown read-only. Clinical rules must be reviewed and approved by qualified neonatal clinicians before any real use or change.</Banner>
    {q.data?.map((r) => <div key={r.id} style={{ borderTop: '1px solid var(--rule)', paddingTop: 12 }}><div className="row wrap"><h3>{r.name}</h3><span className="chip">Version {r.rule_version}</span><span className={`chip ${r.configuration.priority}`}>{r.configuration.priority} priority</span><span className="chip">{r.enabled ? 'Enabled' : 'Disabled'}</span></div><p className="small" style={{ maxWidth: '70ch', marginTop: 4 }}>{r.description}</p><p className="small muted">Counts readings only when signal quality is {r.configuration.requiredQuality.join(' or ')}.</p></div>)}</div>;
}

function Security() {
  const [cur, setCur] = useState(''); const [pw, setPw] = useState(''); const [ok, setOk] = useState(false);
  const m = useMutation({ mutationFn: () => post('/auth/change-password', { currentPassword: cur, newPassword: pw }), onSuccess: () => { setOk(true); setCur(''); setPw(''); } }); const iss = issueMap(m.error);
  return <form onSubmit={(e: FormEvent) => { e.preventDefault(); setOk(false); m.mutate(); }} style={{ maxWidth: 380 }}><h2 style={{ marginBottom: 10 }}>Change password</h2>
    {ok && <div className="banner info" role="status">Password changed.</div>}{m.error && !Object.keys(iss).length && <div className="banner err" role="alert">{errMsg(m.error)}</div>}
    <Field id="cp" label="Current password"><input id="cp" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></Field>
    <Field id="np" label="New password" hint="At least 10 characters." error={iss.newPassword}><input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></Field>
    <button className="btn" disabled={m.isPending || pw.length < 10 || !cur}>{m.isPending ? 'Changing…' : 'Change password'}</button>
    <p className="small muted" style={{ marginTop: 14 }}>Sessions expire after 8 hours. Every sign-in, failed sign-in and password change is recorded in the audit log.</p></form>;
}

function AiAdmin() {
  const { can } = useAuth(); const qc = useQueryClient();
  const st = useQuery({ queryKey: ['ai', 'status'], queryFn: () => api<AiStatus>('/ai/status') }); const q = useQuery({ queryKey: ['ai', 'interactions'], queryFn: () => api<AiInteraction[]>('/ai/interactions'), refetchInterval: 15_000 });
  const test = useMutation({ mutationFn: () => post<AiConnectionTest>('/ai/test-connection'), onSuccess: () => qc.invalidateQueries({ queryKey: ['ai'] }) });
  if (st.isLoading || q.isLoading) return <Loading />; if (st.error) return <ErrorState error={st.error} retry={() => st.refetch()} />;
  const s = st.data!; const a = s.azure; const lt = a.lastConnectionTest;
  return <div className="stack">
    <div className="row wrap"><ModeChip mode={s.defaultMode} /><span className="chip">Default: {s.defaultMode === 'azure' ? 'Azure OpenAI' : 'Demo Mode'}</span><span className="chip">{s.enabled ? 'AI enabled' : 'AI switched off'}</span><span className={`chip ${a.configured ? 'good' : ''}`}>{a.configured ? 'Azure configured' : 'Azure not configured'}</span></div>
    <Banner kind={a.configured ? 'info' : 'warn'}>{a.configured
      ? `Azure OpenAI is configured${a.deployment ? ` (deployment ${a.deployment}, API ${a.apiVersion}, ${a.auth} auth)` : ''}. Configured does not mean verified: run the connection test. Only anonymised, minimum-necessary data is sent, and credentials stay on the server.`
      : `Azure OpenAI is not configured${a.configurationProblem ? `: ${a.configurationProblem}` : ''}. Only Demo Mode (template text, no AI model) is available. See the README section "Connecting Azure OpenAI".`}</Banner>
    {a.configured && <div className="row wrap">{can('ai:manage') && <button className="btn" disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Testing…' : 'Test Azure connection'}</button>}
      <span className="small">{lt ? <>Last test: <b>{lt.ok ? 'connected' : `failed (${lt.category})`}</b>{lt.model ? `, model ${lt.model}` : ''}, {dt(lt.at)}.</> : <span className="muted">No connection test has been run. The integration has not been verified against Azure from this system.</span>}</span></div>}
    {test.data && <Banner kind={test.data.ok ? 'info' : 'err'}>{test.data.message}{test.data.latencyMs !== undefined ? ` (${test.data.latencyMs} ms)` : ''}</Banner>}{test.error && <div className="banner err" role="alert">{errMsg(test.error)}</div>}
    <div className="cols"><div><h3>What it can do</h3><ul>{s.capabilities.map((c) => <li key={c}>{c}</li>)}</ul></div><div><h3>What it can never do</h3><ul>{s.cannot.map((c) => <li key={c}>{c}</li>)}</ul></div></div>
    <div><h3>Tools and the permission each requires</h3><p className="small muted">All tools are read-only and limited to the requesting user's own hospital and permissions.</p><ul className="small">{s.tools.map((t) => <li key={t.name}><code>{t.name}</code> needs <code>{t.needs}</code></li>)}</ul></div>
    <section className="section"><header><h2>Recent AI activity</h2><span className="small muted">Every request, tool call, outcome and clinician decision is recorded and cannot be edited.</span></header>
      {!q.data?.length ? <p className="muted">No AI assistance has been used yet.</p> : <div className="tablewrap"><table><thead><tr><th>When</th><th>User (role)</th><th>Newborn</th><th>Request</th><th>Source</th><th>Outcome</th><th>Checks</th><th>Clinician decision</th><th>Tools</th></tr></thead><tbody>{q.data.map((i) => <tr key={i.id}>
        <td className="small">{dt(i.created_at)}</td><td>{i.user_name}<div className="small muted">{i.user_role}</div></td><td>{i.newborn_identifier ?? '–'}</td>
        <td>{i.kind === 'summary' ? 'Summary' : i.kind === 'draft_assessment' ? 'Draft assessment' : 'Checklist'}</td>
        <td>{i.mode === 'demo' ? 'Demo (template)' : 'Azure OpenAI'}<div className="small muted">{i.model_id ?? ''}</div></td>
        <td><span className={`chip ${i.status === 'completed' ? 'good' : 'poor'}`}>{i.status}</span>{i.error_category && <div className="small muted">{i.error_category.replace(/_/g, ' ')}</div>}{i.latency_ms !== null && <div className="small muted">{i.latency_ms} ms</div>}</td>
        <td className="small">{i.validation?.passed === undefined ? '–' : i.validation.passed ? 'passed' : 'failed'}{i.safeguard_flags.length > 0 && <div className="muted">{i.safeguard_flags.join(', ')}</div>}</td>
        <td className="small">{i.decision === 'recorded' ? `Recorded${i.decision_modified ? ' (edited)' : ' (unedited)'}` : i.decision === 'rejected' ? 'Rejected' : i.kind === 'draft_assessment' && i.status === 'completed' ? <span className="muted">No decision yet</span> : '–'}</td>
        <td className="small">{i.tool_calls.map((t) => `${t.tool}${t.allowed ? '' : ' (denied)'}`).join(', ')}</td></tr>)}</tbody></table></div>}</section></div>;
}
