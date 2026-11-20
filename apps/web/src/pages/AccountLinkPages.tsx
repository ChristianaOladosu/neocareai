import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle } from 'lucide-react';
import { Wordmark } from '../components/common/Brand';
import { ApiError, post } from '../services/api';
import { Spinner } from '../components/common/ui';

function Shell({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return <div className="auth" style={{ gridTemplateColumns: '1fr' }}><div className="orb" style={{ width: 380, height: 380, right: '12%', top: '10%', background: 'rgb(197 185 232 / .24)' }} />
    <div className="auth-stage" style={{ minHeight: '100vh' }}><div className="portal"><div className="face face-swap" style={{ gridArea: 'auto' }}><div style={{ marginBottom: 22 }}><Link to="/" aria-label="NeocareAI home"><Wordmark variant="on-dark" size={24} /></Link></div><h2>{title}</h2>{sub && <p className="sub">{sub}</p>}{children}</div></div></div></div>;
}

export function VerifyEmailPage() {
  const [sp] = useSearchParams(); const token = sp.get('token') ?? ''; const [state, setState] = useState<'working' | 'ok' | 'bad'>('working'); const [msg, setMsg] = useState('');
  useEffect(() => { if (!token) { setState('bad'); setMsg('This link is incomplete.'); return; }
    post<{ status: string }>('/auth/verify-email', { token }).then((r) => { setState('ok'); setMsg(r.status === 'pending_approval' ? 'Your email address is verified. An administrator now needs to approve your account before you can sign in.' : 'Your email address is verified.'); })
      .catch((e) => { setState('bad'); setMsg(e instanceof ApiError ? e.message : 'Something went wrong.'); }); }, [token]);
  return <Shell title="Email verification">{state === 'working' && <div role="status" className="row" style={{ justifyContent: 'center', padding: 20 }}><Spinner /> Verifying…</div>}
    {state === 'ok' && <div className="banner ok" role="status"><CheckCircle2 size={18} style={{ flex: 'none' }} /><div>{msg}</div></div>}{state === 'bad' && <div className="banner err" role="alert"><XCircle size={18} style={{ flex: 'none' }} /><div>{msg} You can request a new link by signing up again or asking an administrator.</div></div>}
    <p className="foot"><Link className="linkbtn" to="/login">Go to sign in</Link></p></Shell>;
}

export function ResetPasswordPage() {
  const [sp] = useSearchParams(); const token = sp.get('token') ?? ''; const [pw, setPw] = useState(''); const [pw2, setPw2] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [ok, setOk] = useState(false);
  const submit = async (e: FormEvent) => { e.preventDefault(); if (pw.length < 10) { setErr('Use at least 10 characters.'); return; } if (pw !== pw2) { setErr('The passwords do not match.'); return; } setBusy(true); setErr('');
    try { await post('/auth/reset-password', { token, password: pw }); setOk(true); } catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong.'); } finally { setBusy(false); } };
  return <Shell title="Choose a new password" sub={ok ? undefined : 'Use at least 10 characters.'}>{ok ? <><div className="banner ok" role="status"><CheckCircle2 size={18} style={{ flex: 'none' }} /><div>Your password has been changed.</div></div><p className="foot"><Link className="linkbtn" to="/login">Sign in</Link></p></> :
    <form onSubmit={submit} noValidate>{err && <div className="banner err" role="alert">{err}</div>}
      <div className="field"><label htmlFor="np1">New password</label><input id="np1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required /></div>
      <div className="field"><label htmlFor="np2">Confirm new password</label><input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required /></div>
      <button className="btn gold" disabled={busy || !token}>{busy ? <><Spinner /> Saving…</> : 'Change password'}</button>{!token && <p className="foot">This link is incomplete. Request a new reset link from the sign-in page.</p>}</form>}</Shell>;
}
