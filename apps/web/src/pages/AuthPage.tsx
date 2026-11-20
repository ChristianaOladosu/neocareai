import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail, UserPlus } from 'lucide-react';
import { Wordmark } from '../components/common/Brand';
import { useAuth } from '../context/AuthContext';
import { api, ApiError, post } from '../services/api';
import { Spinner } from '../components/common/ui';

type Mode = 'login' | 'register' | 'forgot';
const strength = (p: string) => [p.length >= 10, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
const toPath = (link: string) => { try { const u = new URL(link); return u.pathname + u.search; } catch { return link; } };

function Pw({ id, label, value, set, auto, err, hint, meter }: { id: string; label: string; value: string; set: (v: string) => void; auto: string; err?: string; hint?: string; meter?: boolean }) {
  const [show, setShow] = useState(false); const s = strength(value);
  return <div className="field"><label htmlFor={id}>{label}</label><div className="pw-wrap"><input id={id} type={show ? 'text' : 'password'} autoComplete={auto} value={value} onChange={(e) => set(e.target.value)} aria-invalid={!!err} aria-describedby={`${id}-m`} required />
    <button type="button" className="iconbtn" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
    {meter && value && <div className="meter" aria-hidden="true">{[0, 1, 2, 3].map((n) => <i key={n} className={n < s ? 'on' : ''} />)}</div>}<div id={`${id}-m`}>{err ? <div className="err" role="alert">{err}</div> : hint ? <div className="hint">{hint}</div> : null}</div></div>;
}

export default function AuthPage() {
  const { me, login, loading } = useAuth(); const nav = useNavigate(); const [sp] = useSearchParams();
  const [mode, setMode] = useState<Mode>(sp.get('mode') === 'register' ? 'register' : 'login'); const face = mode === 'register' ? 'back' : 'front';
  const [enabled, setEnabled] = useState(true);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState<{ kind: 'err' | 'ok' | 'info'; text: string } | null>(null); const [shake, setShake] = useState(0);
  const [name, setName] = useState(''); const [code, setCode] = useState(''); const [pw2, setPw2] = useState(''); const [errs, setErrs] = useState<Record<string, string>>({}); const [dev, setDev] = useState<{ link: string; note: string } | null>(null); const [done, setDone] = useState('');
  const front = useRef<HTMLDivElement>(null); const back = useRef<HTMLDivElement>(null);
  useEffect(() => { api<{ enabled: boolean }>('/auth/registration-info').then((r) => setEnabled(r.enabled)).catch(() => {}); }, []);
  useEffect(() => { const t = setTimeout(() => (face === 'back' ? back : front).current?.querySelector<HTMLElement>('input')?.focus(), 520); return () => clearTimeout(t); }, [face, mode]);
  if (!loading && me) return <Navigate to="/overview" replace />;
  const to = (m: Mode) => { setMode(m); setMsg(null); setErrs({}); setDev(null); setDone(''); };
  const fail = (text: string) => { setMsg({ kind: 'err', text }); setShake((x) => x + 1); };

  const doLogin = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setMsg(null);
    try { await login(email.trim(), password); setMsg({ kind: 'ok', text: 'Signed in. Opening your workspace…' }); nav('/overview'); }
    catch (x) { if (x instanceof ApiError && (x.code === 'account_pending_verification' || x.code === 'account_pending_approval')) setMsg({ kind: 'info', text: x.message }); else fail(x instanceof ApiError ? (x.status === 429 ? 'Too many attempts. Please wait a few minutes and try again.' : x.message) : 'Something went wrong. Try again.'); }
    finally { setBusy(false); } };
  const doRegister = async (e: FormEvent) => { e.preventDefault(); const er: Record<string, string> = {};
    if (name.trim().length < 2) er.name = 'Enter your full name.'; if (!/^\S+@\S+\.\S+$/.test(email)) er.email = 'Enter a valid email address.'; if (password.length < 10) er.password = 'Use at least 10 characters.'; else if (strength(password) < 3) er.password = 'Add upper and lower case letters, a number or a symbol.';
    if (pw2 !== password) er.pw2 = 'The passwords do not match.'; if (code.trim().length < 4) er.code = 'Enter the organisation code from your administrator.'; setErrs(er); if (Object.keys(er).length) { setShake((x) => x + 1); return; }
    setBusy(true); setMsg(null);
    try { const r = await post<{ message: string; devLink?: string; devNote?: string }>('/auth/signup', { fullName: name.trim(), email: email.trim(), password, organisationCode: code.trim() }); setDone(r.message); if (r.devLink) setDev({ link: toPath(r.devLink), note: r.devNote ?? '' }); }
    catch (x) { if (x instanceof ApiError && x.code === 'invalid_organisation_code') setErrs({ code: x.message }); else fail(x instanceof ApiError ? x.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); } };
  const doForgot = async (e: FormEvent) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) { setErrs({ email: 'Enter a valid email address.' }); return; } setBusy(true); setErrs({});
    try { const r = await post<{ message: string; devLink?: string; devNote?: string }>('/auth/forgot-password', { email: email.trim() }); setDone(r.message); if (r.devLink) setDev({ link: toPath(r.devLink), note: r.devNote ?? '' }); }
    catch (x) { fail(x instanceof ApiError ? x.message : 'Something went wrong. Try again.'); } finally { setBusy(false); } };
  const devBox = dev && <div className="devnote"><b>Development mode.</b> {dev.note} <br /><Link to={dev.link}>Open the link</Link></div>;

  return (
    <div className="auth"><div className="orb" style={{ width: 380, height: 380, right: '6%', top: '8%', background: 'rgb(197 185 232 / .26)' }} /><div className="orb" style={{ width: 300, height: 300, left: '30%', bottom: '-6%', background: 'rgb(216 184 120 / .14)', animationDelay: '-4s' }} />
      <div className="auth-brand"><div><Link to="/" aria-label="Back to the NeocareAI home page"><Wordmark variant="on-dark" size={30} /></Link></div>
        <div><h1>Neonatal clinical intelligence, <em>with accountability.</em></h1><p>Capture, validate, interpret, alert, respond. Sign in to the prototype workspace to explore the workflow with synthetic data.</p></div>
        <p className="legal">Prototype with synthetic data. Not a medical device. Not clinically validated. Clinical decisions remain with authorised healthcare professionals.</p></div>
      <div className="auth-stage"><div className="back-home"><Link to="/"><ArrowLeft size={14} style={{ verticalAlign: -2 }} /> Home</Link></div>
        <div className="portal" data-face={face}><div className="portal-inner">
          <section className="face front" ref={front} aria-hidden={face === 'back'} {...({ inert: face === 'back' ? '' : undefined } as object)} aria-label={mode === 'forgot' ? 'Forgot password' : 'Sign in'}>
            {mode === 'login' && <form onSubmit={doLogin} noValidate className="face-swap" key="login"><h2>Welcome back</h2><p className="sub">Sign in to your clinical workspace.</p>
              {msg && <div className={`banner ${msg.kind === 'err' ? 'err' : msg.kind === 'ok' ? 'ok' : ''} ${msg.kind === 'err' ? 'shake' : ''}`} key={shake} role={msg.kind === 'err' ? 'alert' : 'status'}>{msg.text}</div>}
              <div className="field"><label htmlFor="li-email">Email</label><input id="li-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <Pw id="li-pw" label="Password" value={password} set={setPassword} auto="current-password" />
              <div className="row" style={{ justifyContent: 'flex-end', margin: '-4px 0 16px' }}><button type="button" className="linkbtn small" onClick={() => to('forgot')}>Forgot password?</button></div>
              <button className="btn gold" disabled={busy || !email || !password}>{busy ? <><Spinner /> Signing in…</> : <><LockKeyhole size={16} /> Sign in</>}</button>
              {enabled ? <p className="foot">New to NeocareAI? <button type="button" className="linkbtn" onClick={() => to('register')}>Create an account</button></p> : <p className="foot">Self-registration is not enabled. Ask an administrator for an account.</p>}
              <p className="foot small" style={{ marginTop: 10 }}>Demo accounts (synthetic): doctor@, nurse@, admin@, mo@, supervisor@demo.neocareai.test · DemoPass#2026</p></form>}
            {mode === 'forgot' && <form onSubmit={doForgot} noValidate className="face-swap" key="forgot"><h2>Reset your password</h2><p className="sub">Enter your email and we will send a reset link.</p>
              {done ? <><div className="banner ok" role="status">{done}</div>{devBox}</> : <>{msg && <div className="banner err" role="alert">{msg.text}</div>}<div className="field"><label htmlFor="fp-email">Email</label><input id="fp-email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errs.email} required />{errs.email && <div className="err" role="alert">{errs.email}</div>}</div>
              <button className="btn gold" disabled={busy || !email}>{busy ? <><Spinner /> Sending…</> : <><Mail size={16} /> Send reset link</>}</button></>}
              <p className="foot"><button type="button" className="linkbtn" onClick={() => to('login')}>Back to sign in</button></p></form>}
          </section>
          <section className="face back" ref={back} aria-hidden={face === 'front'} {...({ inert: face === 'front' ? '' : undefined } as object)} aria-label="Create an account">
            {done && mode === 'register' ? <div className="face-swap"><h2>Check your email</h2><p className="sub">One more step.</p><div className="banner ok" role="status">{done}</div>{devBox}<p className="foot"><button type="button" className="linkbtn" onClick={() => to('login')}>Back to sign in</button></p></div> :
            <form onSubmit={doRegister} noValidate><h2>Create your account</h2><p className="sub">Accounts need your hospital's organisation code, a verified email and administrator approval.</p>
              {msg && mode === 'register' && <div className={`banner err ${shake ? 'shake' : ''}`} key={shake} role="alert">{msg.text}</div>}
              <div className="field"><label htmlFor="rg-name">Full name</label><input id="rg-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={!!errs.name} required />{errs.name && <div className="err" role="alert">{errs.name}</div>}</div>
              <div className="field"><label htmlFor="rg-email">Work email</label><input id="rg-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!errs.email} required />{errs.email && <div className="err" role="alert">{errs.email}</div>}</div>
              <Pw id="rg-pw" label="Password" value={password} set={setPassword} auto="new-password" err={errs.password} hint="At least 10 characters with mixed case and a number or symbol." meter />
              <Pw id="rg-pw2" label="Confirm password" value={pw2} set={setPw2} auto="new-password" err={errs.pw2} />
              <div className="field"><label htmlFor="rg-code">Organisation code</label><input id="rg-code" value={code} onChange={(e) => setCode(e.target.value)} aria-invalid={!!errs.code} autoComplete="off" required />{errs.code ? <div className="err" role="alert">{errs.code}</div> : <div className="hint">Given to you by your hospital administrator. Demo code: DEMO-GENERAL-2026</div>}</div>
              <button className="btn gold" disabled={busy}>{busy ? <><Spinner /> Creating…</> : <><UserPlus size={16} /> Create account</>}</button>
              <p className="foot">Already registered? <button type="button" className="linkbtn" onClick={() => to('login')}>Sign in</button></p></form>}
          </section>
        </div></div></div></div>
  );
}
