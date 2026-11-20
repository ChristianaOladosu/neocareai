import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Baby, Bell, BrainCircuit, ChevronsLeft, ChevronsRight, FileBarChart, History, LayoutDashboard, LogOut, Menu, Moon, Search, Settings, ShieldAlert, Cpu, Sun, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useRealtime } from '../hooks/useRealtime';
import { api, post } from '../services/api';
import type { Alert, Hospital, NotificationList, SearchResults } from '../types';
import { PriorityChip } from '../components/common/ui';
import { Wordmark } from '../components/common/Brand';
import { ago, initials, roleLabel } from '../utils/format';

type Item = { to: string; label: string; icon: typeof Baby; perm?: string[]; badge?: 'alerts' | 'notifications'; end?: boolean };
const NAV: Array<{ group: string; items: Item[] }> = [
  { group: 'Workspace', items: [{ to: '/overview', label: 'Overview', icon: LayoutDashboard }, { to: '/newborns', label: 'Newborns', icon: Baby, perm: ['newborn:read'] }, { to: '/monitoring', label: 'Live Monitoring', icon: Activity, perm: ['observation:read'] }, { to: '/clinical-intelligence', label: 'Clinical Intelligence', icon: BrainCircuit, perm: ['observation:read'] }] },
  { group: 'Response', items: [{ to: '/alerts', label: 'Clinical Alerts', icon: ShieldAlert, perm: ['alert:read'], badge: 'alerts' }, { to: '/response-log', label: 'Response Log', icon: History, perm: ['response:read'] }] },
  { group: 'Operations', items: [{ to: '/devices', label: 'Devices', icon: Cpu, perm: ['device:read'] }, { to: '/reports', label: 'Reports', icon: FileBarChart, perm: ['reports:clinical', 'reports:operational'] }, { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'notifications' }, { to: '/settings', label: 'Settings', icon: Settings }] },
];
const TITLES: Record<string, string> = { overview: 'Overview', newborns: 'Newborns', monitoring: 'Live Monitoring', 'clinical-intelligence': 'Clinical Intelligence', alerts: 'Clinical Alerts', 'response-log': 'Response Log', devices: 'Devices', reports: 'Reports', notifications: 'Notifications', settings: 'Settings' };

export default function AppLayout() {
  const { me, can, logout } = useAuth(); const { theme, toggle } = useTheme(); const nav = useNavigate(); const loc = useLocation(); const qc = useQueryClient(); const live = useRealtime(true);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('neocare:collapsed') === '1'; } catch { return false; } });
  const [drawer, setDrawer] = useState(false); const [bell, setBell] = useState(false); const [menu, setMenu] = useState(false); const [q, setQ] = useState(''); const [dq, setDq] = useState('');
  const bellRef = useRef<HTMLDivElement>(null); const menuRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLDivElement>(null);
  useEffect(() => { try { localStorage.setItem('neocare:collapsed', collapsed ? '1' : '0'); } catch { /* ignore */ } }, [collapsed]);
  useEffect(() => { setDrawer(false); setBell(false); setMenu(false); setQ(''); }, [loc.pathname]);
  useEffect(() => { const t = setTimeout(() => setDq(q.trim()), 220); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const h = (e: MouseEvent) => { const t = e.target as Node; if (bellRef.current && !bellRef.current.contains(t)) setBell(false); if (menuRef.current && !menuRef.current.contains(t)) setMenu(false); if (searchRef.current && !searchRef.current.contains(t)) setQ(''); };
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { setBell(false); setMenu(false); setQ(''); setDrawer(false); } if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); searchRef.current?.querySelector('input')?.focus(); } };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, []);

  const hospital = useQuery({ queryKey: ['hospital'], queryFn: () => api<Hospital>('/hospital') });
  const pending = useQuery({ queryKey: ['alerts', 'pending'], queryFn: () => api<Alert[]>('/alerts?status=awaiting_acknowledgement'), enabled: can('alert:read'), refetchInterval: live === 'live' ? false : 10_000 });
  const notes = useQuery({ queryKey: ['notifications', 'bell'], queryFn: () => api<NotificationList>('/notifications?limit=8'), refetchInterval: live === 'live' ? 60_000 : 10_000 });
  const found = useQuery({ queryKey: ['search', dq], queryFn: () => api<SearchResults>(`/search?q=${encodeURIComponent(dq)}`), enabled: dq.length >= 1 });

  const seg = loc.pathname.split('/').filter(Boolean); const title = TITLES[seg[0]] ?? 'NeocareAI';
  const crumbs = [{ to: '/overview', label: 'Home' }, ...(seg[0] && seg[0] !== 'overview' ? [{ to: '/' + seg[0], label: title }] : []), ...(seg[1] ? [{ to: loc.pathname, label: seg[0] === 'newborns' ? 'Profile' : 'Details' }] : [])];
  const count = pending.data?.length ?? 0; const unread = notes.data?.unread ?? 0;
  const allowed = (i: Item) => !i.perm || i.perm.some((p) => can(p));
  const badge = (i: Item) => (i.badge === 'alerts' ? count : i.badge === 'notifications' ? unread : 0);
  const open = async (id: string, link: string | null) => { await post(`/notifications/${id}/read`).catch(() => {}); qc.invalidateQueries({ queryKey: ['notifications'] }); setBell(false); if (link) nav(link); };
  const hasResults = !!found.data && (found.data.newborns.length + found.data.alerts.length + found.data.devices.length) > 0;

  return (
    <div className="app" data-collapsed={collapsed} data-drawer={drawer ? 'open' : 'closed'}>
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="scrim-drawer" onClick={() => setDrawer(false)} aria-hidden="true" />
      <aside className="side" aria-label="Primary">
        <div className="side-head"><Link to="/overview" aria-label="NeocareAI overview"><Wordmark variant="on-dark" compact={collapsed} size={21} /></Link>
          <button className="iconbtn collapse" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}</button></div>
        <nav className="nav" aria-label="Main navigation">{NAV.map((g) => { const items = g.items.filter(allowed); if (!items.length) return null; return (<div key={g.group} style={{ display: 'contents' }}><div className="nav-group">{g.group}</div>
          {items.map((i) => { const n = badge(i); return <NavLink key={i.to} to={i.to} end={i.end} data-tip={i.label} aria-label={i.label + (n ? `, ${n} ${i.badge === 'alerts' ? 'awaiting acknowledgement' : 'unread'}` : '')}><i.icon size={20} /><span className="lbl">{i.label}</span>{n > 0 && <span className="badge">{n > 99 ? '99+' : n}</span>}</NavLink>; })}</div>); })}</nav>
        <div className="profile"><div className="avatar" aria-hidden="true">{initials(me?.fullName ?? '?')}</div><div className="who"><b>{me?.fullName}</b><span>{me ? roleLabel(me.roles[0] ?? '') : ''}</span></div></div>
        <div className="side-foot">{hospital.data?.name}<br />Prototype · synthetic data</div>
      </aside>
      <div className="main">
        <header className="top">
          <button className="iconbtn menu-btn" aria-label="Open navigation" onClick={() => setDrawer(true)}>{drawer ? <X /> : <Menu />}</button>
          <div><div className="crumbs"><nav aria-label="Breadcrumb">{crumbs.map((c, i) => <span key={c.to}>{i > 0 && ' / '}{i === crumbs.length - 1 ? <span aria-current="page">{c.label}</span> : <Link to={c.to}>{c.label}</Link>}</span>)}</nav></div><div className="title">{title}</div></div>
          <div className="grow" />
          {(can('newborn:read') || can('alert:read')) && <div className="search" ref={searchRef} role="search"><Search size={16} /><input aria-label="Search newborns, alerts and devices" placeholder="Search…  press / to focus" value={q} onChange={(e) => setQ(e.target.value)} />
            {q && <div className="results" role="listbox" aria-label="Search results">{found.isFetching && !found.data ? <div className="state small">Searching…</div> : !hasResults ? <div className="state small">No results for “{q}”.</div> : <>
              {found.data!.newborns.length > 0 && <><div className="grp">Newborns</div>{found.data!.newborns.map((n) => <Link key={n.id} to={`/newborns/${n.id}`}><b>{n.newborn_identifier}</b><span className="muted small">{n.unit_name ?? 'No unit'}</span></Link>)}</>}
              {found.data!.alerts.length > 0 && <><div className="grp">Alerts</div>{found.data!.alerts.map((a) => <Link key={a.id} to={`/alerts/${a.id}`}><span>{a.newborn_identifier}: {a.title}</span><span className={`chip ${a.priority}`}>{a.priority}</span></Link>)}</>}
              {found.data!.devices.length > 0 && <><div className="grp">Devices</div>{found.data!.devices.map((d) => <Link key={d.id} to={`/devices?q=${d.device_identifier}`}><b>{d.device_identifier}</b><span className="muted small">{d.connection_status}</span></Link>)}</>}</>}</div>}</div>}
          <span className="small muted" style={{ whiteSpace: 'nowrap' }} title={live === 'live' ? 'Receiving updates as they arrive' : 'Real-time link is down; the page refreshes on a timer'}>{live === 'live' ? '● Live' : live === 'connecting' ? 'Connecting…' : 'Reconnecting'}</span>
          <button className="iconbtn" aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={toggle}>{theme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}</button>
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button className="iconbtn" aria-label={`Notifications, ${unread} unread`} aria-expanded={bell} onClick={() => setBell(!bell)}><Bell size={20} />{unread > 0 && <span className={notes.data?.unread_high ? 'pulse' : ''} style={{ position: 'absolute', top: 1, right: 1, background: 'var(--c-high)', color: '#fff', borderRadius: 9, fontSize: 10.5, padding: '0 5px', fontWeight: 700, minWidth: 17, textAlign: 'center' }}>{unread > 99 ? '99+' : unread}</span>}</button>
            {bell && <div className="pop" role="region" aria-label="Notifications"><div className="row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}><b className="grow">Notifications</b><Link className="small" to="/notifications">View all</Link></div>
              {!notes.data?.items.length ? <div className="state small">You are all caught up.</div> : notes.data.items.map((n) => <button key={n.id} onClick={() => open(n.id, n.link)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border)', background: n.read_at ? 'transparent' : 'var(--accent-soft)', border: 0, borderBottomWidth: 1, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>
                <div className="row"><b className="small">{n.title}</b>{n.priority === 'high' && <PriorityChip p="high" />}</div>{n.body && <div className="small muted">{n.body}</div>}<div className="small muted">{ago(n.created_at)}</div></button>)}</div>}
          </div>
          <div ref={menuRef} style={{ position: 'relative' }}><button className="iconbtn" aria-label="Account menu" aria-expanded={menu} onClick={() => setMenu(!menu)} style={{ padding: 3 }}><span className="avatar" style={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--lavender), var(--gold))', color: 'var(--midnight)', fontWeight: 700, fontSize: 13 }}>{initials(me?.fullName ?? '?')}</span></button>
            {menu && <div className="pop" style={{ width: 280 }} role="menu"><div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}><b>{me?.fullName}</b><div className="small muted">{me?.email}</div><div className="small muted">{me ? roleLabel(me.roles[0] ?? '') : ''} · {hospital.data?.name}</div></div>
              <Link role="menuitem" to="/settings" style={{ display: 'flex', gap: 10, padding: '11px 16px', color: 'inherit' }}><Settings size={17} />Settings</Link>
              <button role="menuitem" onClick={toggle} style={{ display: 'flex', gap: 10, padding: '11px 16px', width: '100%', background: 'none', border: 0, color: 'inherit', font: 'inherit', cursor: 'pointer' }}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}{theme === 'dark' ? 'Light theme' : 'Dark theme'}</button>
              <button role="menuitem" onClick={async () => { await logout(); nav('/login'); }} style={{ display: 'flex', gap: 10, padding: '11px 16px', width: '100%', background: 'none', border: 0, borderTop: '1px solid var(--border)', color: 'var(--c-error)', font: 'inherit', cursor: 'pointer' }}><LogOut size={17} />Sign out</button></div>}</div>
        </header>
        <main id="main" className="content" tabIndex={-1}><div className="page-body" key={loc.pathname}><Outlet /></div></main>
      </div>
    </div>
  );
}
