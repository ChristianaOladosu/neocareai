import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Field, errMsg } from '../components/common/ui';

export default function LoginPage() {
  const { me, login, loading } = useAuth(); const nav = useNavigate();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  if (!loading && me) return <Navigate to="/" replace />;
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setErr(''); try { await login(email, password); nav('/'); } catch (x) { setErr(errMsg(x)); } finally { setBusy(false); } };
  return (
    <div className="login">
      <div className="left">
        <div><div className="brand" style={{ padding: 0, fontSize: 20 }}>NEOCAREAI</div><div className="muted" style={{ color: '#9DB0BE' }}>Clinical Workspace</div></div>
        <div><h1>Earlier awareness. Clearer decisions. More accountable neonatal care.</h1>
          <p style={{ color: '#9DB0BE', marginTop: 16, maxWidth: 440 }}>An early-stage prototype. Every patient record, measurement and threshold shown is synthetic or illustrative. It does not replace clinical judgement and is not a certified medical device.</p></div>
        <div className="small" style={{ color: '#9DB0BE' }}>Competition prototype</div>
      </div>
      <div className="right">
        <form onSubmit={submit} style={{ width: 'min(360px, 100%)' }} noValidate>
          <h2 style={{ marginBottom: 16 }}>Sign in</h2>
          {err && <div className="banner err" role="alert">{err}</div>}
          <Field id="email" label="Email"><input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field id="password" label="Password"><input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          <button className="btn" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted" style={{ marginTop: 18 }}>Demo accounts (synthetic): doctor@, nurse@ or admin@demo.neocareai.test. Password DemoPass#2026</p>
        </form>
      </div>
    </div>
  );
}
