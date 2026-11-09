import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, Baby, Bell, Cpu, History, LayoutDashboard, LogOut, Search, Settings, ShieldAlert, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRealtime } from '../hooks/useRealtime';
import { api } from '../services/api';
import type { Alert, Hospital, Newborn } from '../types';
import { PriorityChip } from '../components/common/ui';
import { ago } from '../utils/format';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/newborns', label: 'Newborns', icon: Baby, perm: 'newborn:read' },
  { to: '/monitoring', label: 'Live Monitoring', icon: Activity, perm: 'observation:read' },
  { to: '/alerts', label: 'Clinical Alerts', icon: ShieldAlert, perm: 'alert:read', badge: true },
  { to: '/response-log', label: 'Response Log', icon: History, perm: 'response:read' },
  { to: '/devices', label: 'Devices', icon: Cpu, perm: 'device:read' },
  { to: '/settings', label: 'Settings', icon: Settings },
];
const CRUMB: Record<string, string> = { newborns: 'Newborns', monitoring: 'Live Monitoring', alerts: 'Clinical Alerts', 'response-log': 'Response Log', devices: 'Devices', settings: 'Settings' };

export default function AppLayout() {
  const { me, can, logout } = useAuth();
  const nav = useNavigate(); const loc = useLocation();
  const live = useRealtime(true);
  const [bell, setBell] = useState(false); const [q, setQ] = useState('');
  const bellRef = useRef<HTMLDivElement>(null);
  const hospital = useQuery({ queryKey: ['hospital'], queryFn: () => api<Hospital>('/hospital') });
  const pending = useQuery({ queryKey: ['alerts', 'pending'], queryFn: () => api<Alert[]>('/alerts?status=awaiting_acknowledgement'), enabled: can('alert:read'), refetchInterval: live === 'live' ? false : 10_000 });
  const found = useQuery({ queryKey: ['newborns', 'search', q], queryFn: () => api<Newborn[]>(`/newborns?search=${encodeURIComponent(q)}`), enabled: q.length >= 1 && can('newborn:read') });
  useEffect(() => { setBell(false); setQ(''); }, [loc.pathname]);
  useEffect(() => { const h = (e: MouseEvent) => { if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBell(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);

  const seg = loc.pathname.split('/').filter(Boolean);
  const crumbs = [{ to: '/', label: 'Overview' }, ...(seg[0] ? [{ to: '/' + seg[0], label: CRUMB[seg[0]] ?? seg[0] }] : []), ...(seg[1] ? [{ to: loc.pathname, label: seg[0] === 'newborns' ? 'Newborn profile' : 'Details' }] : [])];
  const items = NAV.filter((n) => !n.perm || can(n.perm));
  const count = pending.data?.length ?? 0;

  return (
    <div className="shell">
      <aside className="side" aria-label="Primary">
        <div className="brand">NEOCAREAI</div><div className="brand-sub">Clinical Workspace</div>
        <nav className="nav">{items.map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={18} />{n.label}{n.badge && count > 0 && <span className="badge" aria-label={`${count} awaiting acknowledgement`}>{count}</span>}</NavLink>)}</nav>
        <div className="side-foot"><div className="row" style={{ marginBottom: 4 }}><Building2 size={14} /><span>{hospital.data?.name ?? '…'}</span></div>Prototype. Synthetic data only. Not a medical device.</div>
      </aside>
      <div className="main">
        <header className="top">
          <nav aria-label="Breadcrumb" className="crumbs">{crumbs.map((c, i) => <span key={c.to}>{i > 0 && ' / '}{i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}</span>)}</nav>
          <div className="grow" />
          {can('newborn:read') && <div className="search"><Search size={15} /><input aria-label="Search newborns by identifier" placeholder="Search newborn ID" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <div className="results">{found.isLoading ? <div className="state small">Searching…</div> : found.data?.length ? found.data.slice(0, 8).map((n) => <button key={n.id} onClick={() => nav(`/newborns/${n.id}`)}><b>{n.newborn_identifier}</b> <span className="muted small">{n.unit_name ?? 'No unit'}</span></button>) : <div className="state small">No newborn matches “{q}”.</div>}</div>}</div>}
          <span className="small muted" title={live === 'live' ? 'Receiving updates as they arrive' : 'Real-time link is down; the page refreshes on a timer'}>{live === 'live' ? 'Live updates' : live === 'connecting' ? 'Connecting…' : 'Reconnecting, refreshing every 10 s'}</span>
          {can('alert:read') && <div ref={bellRef} style={{ position: 'relative' }}>
            <button className="iconbtn" aria-label={`Notifications, ${count} awaiting acknowledgement`} aria-expanded={bell} onClick={() => setBell(!bell)}><Bell size={19} />{count > 0 && <span className="badge" style={{ position: 'absolute', top: 0, right: 0, background: 'var(--coral)', color: '#fff', borderRadius: 9, fontSize: 10.5, padding: '0 5px', fontWeight: 700 }}>{count}</span>}</button>
            {bell && <div className="pop" role="region" aria-label="Notifications">{!count ? <div className="state small">No alerts are awaiting acknowledgement.</div> : pending.data!.slice(0, 6).map((a) => <Link key={a.id} to={`/alerts/${a.id}`} style={{ display: 'block', padding: '10px 12px', borderBottom: '1px solid var(--rule)', color: 'inherit' }}><div className="row"><b>{a.newborn_identifier}</b><PriorityChip p={a.priority} /></div><div className="small">{a.title}</div><div className="small muted">{ago(a.created_at)}</div></Link>)}</div>}
          </div>}
          <div className="row small"><div style={{ textAlign: 'right' }}><div style={{ fontWeight: 600 }}>{me?.fullName}</div><div className="muted">{me?.roles.join(', ')}</div></div>
            <button className="iconbtn" aria-label="Sign out" onClick={async () => { await logout(); nav('/login'); }}><LogOut size={18} /></button></div>
        </header>
        <main className="content"><Outlet /></main>
        <nav className="mobile-nav" aria-label="Primary mobile">{items.slice(0, 5).map((n) => <NavLink key={n.to} to={n.to} end={n.end}><n.icon size={20} />{n.label.replace('Clinical ', '').replace('Live ', '')}</NavLink>)}</nav>
      </div>
    </div>
  );
}
