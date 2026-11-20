import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BadgeCheck, Baby, BrainCircuit, ClipboardCheck, Cpu, Eye, FileSearch, Gauge, Layers, LayoutDashboard, Menu, ShieldAlert, ShieldCheck, Signal, Waves, X, Network, UserCheck, HeartHandshake } from 'lucide-react';
import { Wordmark } from '../components/common/Brand';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { useParallax, useRevealOnScroll } from '../animations/hooks';
import { Bullet, HeroPreview, SignalDemo, Stat } from '../features/landing/Visuals';

const CAPS = [
  { icon: Activity, t: 'Physiological monitoring', s: 'Four parameters, one picture', d: 'Heart rate, respiratory rate, oxygen saturation and temperature arrive from a device gateway and are shown with their timestamps, source and reliability.', b: ['Latest values with the time they were measured', 'Multi-newborn and single-newborn views', 'Disconnection and interruption detection'] },
  { icon: Signal, t: 'Signal-quality intelligence', s: 'Reliable? Reduced? Missing?', d: 'Every measurement is assessed before it is interpreted, using six clear categories, so unreliable data is never mistaken for a clinical finding.', b: ['Poor, missing and disconnected data kept separate from clinical concern', 'Plain-language reasons for each classification', 'Stale values are never shown as live'] },
  { icon: Waves, t: 'Transparent trend analysis', s: 'What changed, and over what period', d: 'Trends are described from reliable readings only and compared with configured criteria. There are no hidden scores and no predictions.', b: ['Rising, falling, stable or insufficient data', 'Each configured rule shows met, not met or insufficient data, with the reason', 'Criteria are illustrative until clinically approved'] },
  { icon: ShieldAlert, t: 'Explainable alerts', s: 'Every alert shows its working', d: 'An alert carries its triggering readings, the criteria that fired, signal reliability, the period involved and what information is missing.', b: ['Measurement, trend, signal-quality, missing-data and device alerts', 'High, medium and low priority', 'Opening an alert never dismisses it'] },
  { icon: ClipboardCheck, t: 'Response accountability', s: 'Who did what, and when', d: 'Acknowledgement, assessment, response, escalation and resolution are recorded with the person and the time, in an append-only history.', b: ['Alerts are never closed automatically', 'Reminders for unacknowledged alerts', 'A complete audit trail'] },
  { icon: BrainCircuit, t: 'Controlled AI assistance', s: 'Summaries that cite their sources', d: 'AI can summarise an alert and draft documentation from stored, anonymised data. It cannot diagnose, advise treatment, or change any record.', b: ['Every fact cites a stored record', 'Clinician completes and records every draft', 'Demo Mode or Azure OpenAI, never confused'] },
] as const;

export default function LandingPage() {
  const { me } = useAuth(); const [solid, setSolid] = useState(false); const [open, setOpen] = useState(false); const [cap, setCap] = useState(0); const [reg, setReg] = useState(false);
  useRevealOnScroll(); useParallax();
  useEffect(() => { const on = () => setSolid(window.scrollY > 24); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  useEffect(() => { api<{ enabled: boolean }>('/auth/registration-info').then((r) => setReg(r.enabled)).catch(() => setReg(false)); }, []);
  const C = CAPS[cap]; const go = () => setOpen(false);
  return (
    <div className="landing js-reveal">
      <a className="skip-link" href="#platform">Skip to content</a>
      <header className={`l-nav ${solid ? 'solid' : ''}`}><div className="l-wrap">
        <Link to="/" aria-label="NeocareAI home"><Wordmark variant="on-dark" size={25} /></Link>
        <button className="iconbtn l-burger" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
        <nav className={`l-links ${open ? 'open' : ''}`} aria-label="Main">
          <a href="#platform" onClick={go}>Platform</a><a href="#capabilities" onClick={go}>Capabilities</a><a href="#how" onClick={go}>How it works</a><a href="#about" onClick={go}>About</a>
          {me ? <Link className="btn gold" to="/overview">Open workspace</Link> : <><Link to="/login" onClick={go}>Login</Link>{reg && <Link className="btn gold" to="/login?mode=register">Get started</Link>}</>}
        </nav></div></header>

      <section className="l-hero" id="top"><div className="l-glow" style={{ width: 420, height: 420, right: '8%', top: '12%', background: 'rgb(197 185 232 / .28)' }} data-parallax="0.12" /><div className="l-glow" style={{ width: 320, height: 320, left: '-6%', bottom: '4%', background: 'rgb(216 184 120 / .16)', animationDelay: '-3s' }} data-parallax="0.2" />
        <div className="l-wrap grid"><div>
          <div className="pill-note stag"><i />Prototype · synthetic data · not a medical device</div>
          <h1 className="stag" style={{ ['--i' as string]: 1 }}>Intelligent Neonatal Monitoring.<em>More Informed Clinical Responses.</em></h1>
          <p className="sub stag" style={{ ['--i' as string]: 2 }}>NeocareAI brings physiological monitoring, signal-quality intelligence, explainable clinical insights and response tracking into one unified neonatal clinical workspace.</p>
          <div className="cta stag" style={{ ['--i' as string]: 3 }}><Link className="btn gold lg" to={me ? '/overview' : '/login'}>{me ? 'Open the workspace' : 'Sign in to the workspace'} <ArrowRight size={18} /></Link><a className="btn ghost lg" href="#how">See how it works</a></div>
        </div><HeroPreview /></div><div className="scroll-cue" aria-hidden="true">SCROLL</div></section>

      <section className="l-sec" id="platform"><div className="l-wrap">
        <div data-reveal><div className="l-eyebrow">The neonatal monitoring challenge</div><h2 className="l-h2">Measuring is not the same as recognising, and recognising is not the same as responding.</h2>
          <p className="l-lead">Newborns, especially premature ones, can change quickly. Teams watch several babies at once, observations may be periodic, information sits in different systems, and sensors fail. A concerning pattern across several measurements is easy to miss.</p></div>
        <div className="l-cards">{[[Layers, 'Monitoring complexity', 'Several newborns, each with different needs, observed at once.'], [Eye, 'Easy-to-miss patterns', 'Changes across measurements and between periodic observations are hard to see.'], [Cpu, 'Unreliable signals', 'Disconnected sensors and poor signals look like data. They are not findings.'], [FileSearch, 'Response gaps', 'An alert only helps if someone acknowledges it, assesses it and the response is recorded.']].map(([I, t, d], n) => { const Ic = I as typeof Eye; return <div className="l-card hover-lift" data-reveal key={t as string} style={{ ['--i' as string]: n }}><div className="ico"><Ic size={22} /></div><h3>{t as string}</h3><p>{d as string}</p></div>; })}</div></div></section>

      <section className="l-sec l-alt" id="how"><div className="l-wrap">
        <div data-reveal><div className="l-eyebrow">Our approach</div><h2 className="l-h2">Capture. Validate. Interpret. Alert. Respond.</h2><p className="l-lead">Every feature in NeocareAI supports one workflow, from the first measurement to an accountable clinical response.</p></div>
        <div className="flow" data-reveal>{[[Network, 'Capture', 'Measurements arrive from compatible sources. Today: a clearly labelled simulator.'], [BadgeCheck, 'Validate', 'Quality, completeness and plausibility are assessed before anything is interpreted.'], [Gauge, 'Interpret', 'Transparent trend analysis against configured, reviewable criteria.'], [ShieldAlert, 'Alert', 'Explainable alerts say what was detected, why, and how reliable the data was.'], [UserCheck, 'Respond', 'A clinician acknowledges, documents, escalates or resolves. Everything is audited.']].map(([I, t, d]) => { const Ic = I as typeof Eye; return <div className="fnode" key={t as string}><div className="dot"><Ic size={26} /></div><div><h3>{t as string}</h3><p>{d as string}</p></div></div>; })}</div></div></section>

      <section className="l-sec" id="capabilities"><div className="l-wrap">
        <div data-reveal><div className="l-eyebrow">Platform overview</div><h2 className="l-h2">One workspace. Six capabilities that work together.</h2></div>
        <div className="caps" data-reveal><div className="cap-list" role="tablist" aria-label="Capabilities">{CAPS.map((c, n) => <button key={c.t} role="tab" aria-selected={cap === n} className="cap-btn" onClick={() => setCap(n)}><c.icon size={22} /><span><b>{c.t}</b><span>{c.s}</span></span></button>)}</div>
          <div className="cap-detail" role="tabpanel" key={cap}><h3>{C.t}</h3><p className="muted" style={{ lineHeight: 1.65, maxWidth: '56ch' }}>{C.d}</p><ul className="checks">{C.b.map((x) => <Bullet key={x} b="">{x}</Bullet>)}</ul><p className="small muted" style={{ marginTop: 22 }}>Working in the prototype with simulated device data.</p></div></div></div></section>

      <section className="l-sec l-alt"><div className="l-wrap split">
        <div data-reveal="left"><div className="l-eyebrow">Physiological monitoring</div><h2 className="l-h2">See what is current, and what is not.</h2><p className="l-lead">Live measurement cards show the value, when it was measured and how reliable it was. If a device disconnects, the value is struck through and marked not current. It is never presented as a live normal reading.</p>
          <ul className="checks"><Bullet b="Four parameters.">Heart rate, respiratory rate, SpO₂ and temperature.</Bullet><Bullet b="Individual and multi-newborn views.">With configurable time ranges.</Bullet><Bullet b="Interruptions are detected.">Not just disconnections, but data that silently stops.</Bullet></ul></div>
        <div className="panel" data-reveal="right"><div className="cap"><span>Simulated trend, last 60 minutes</span><span>Heart rate · Respiratory rate</span></div>
          <svg viewBox="0 0 400 140" width="100%" role="img" aria-label="Illustrative animated trend lines"><defs><linearGradient id="gA" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#49416D" stopOpacity=".28" /><stop offset="1" stopColor="#49416D" stopOpacity="0" /></linearGradient></defs>{[35, 70, 105].map((y) => <line key={y} x1="0" x2="400" y1={y} y2={y} stroke="var(--border)" />)}
            <path d="M0 80 C 30 50, 60 100, 100 70 S 160 30, 200 64 S 270 110, 310 60 S 370 30, 400 62 L400 140 L0 140Z" fill="url(#gA)" /><path className="draw-line" style={{ ['--len' as string]: 900 }} d="M0 80 C 30 50, 60 100, 100 70 S 160 30, 200 64 S 270 110, 310 60 S 370 30, 400 62" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
            <path className="draw-line" style={{ ['--len' as string]: 900 }} d="M0 108 C 50 100, 90 112, 140 104 S 240 96, 290 106 S 360 98, 400 104" fill="none" stroke="var(--highlight)" strokeWidth="2.4" strokeLinecap="round" /></svg>
          <div className="row wrap" style={{ marginTop: 10 }}><span className="chip good">✓ Reliable</span><span className="chip sim">Simulated data</span></div></div></div></section>

      <section className="l-sec"><div className="l-wrap split rev">
        <div data-reveal="left"><div className="panel"><SignalDemo /></div></div>
        <div data-reveal="right"><div className="l-eyebrow">Signal-quality intelligence</div><h2 className="l-h2">An unreliable signal is not a clinical finding.</h2><p className="l-lead">NeocareAI separates three different concerns, so a sensor problem never looks like deterioration, and a missing reading never looks like a normal one.</p>
          <ul className="checks"><Bullet b="Clinical concern:">criteria met on reliable readings.</Bullet><Bullet b="Data-quality concern:">reduced, poor or missing signal.</Bullet><Bullet b="Device concern:">disconnected or interrupted transmission.</Bullet></ul></div></div></section>

      <section className="l-sec l-dark"><div className="l-glow" style={{ width: 460, height: 460, left: '-8%', top: '10%', background: 'rgb(197 185 232 / .16)' }} data-parallax="0.1" /><div className="l-wrap split">
        <div data-reveal="left"><div className="l-eyebrow">AI clinical intelligence</div><h2 className="l-h2">Trends described plainly. Criteria shown openly.</h2><p className="l-lead">The intelligence layer describes how measurements changed over a period and which configured criteria were met, not met, or could not be judged. It does not produce risk scores or predictions, and every threshold is labelled illustrative until clinicians approve it.</p>
          <ul className="checks"><Bullet b="Multi-parameter analysis">across heart rate, respiratory rate, SpO₂ and temperature.</Bullet><Bullet b="Trend comparison">between the current window and the one before it.</Bullet><Bullet b="Uncertainty is shown:">what the analysis could not see is always listed.</Bullet></ul></div>
        <div className="panel" data-reveal="right"><div className="cap"><span>Rule evaluation (illustrative)</span><span>Simulated</span></div><div className="crit-list">
          <div><span className="chip medium" style={{ flex: 'none' }}>Met</span><div><b>Rapid fall in oxygen saturation</b><span>Fitted change −17.2 over 2.8 min across 6 reliable readings.</span></div></div>
          <div><span className="chip good" style={{ flex: 'none' }}>Not met</span><div><b>Sustained high heart rate</b><span>Latest 3 readings: 142, 145, 140 (0 of 3 beyond the threshold).</span></div></div>
          <div><span className="chip missing" style={{ flex: 'none' }}>Insufficient</span><div><b>Low temperature</b><span>Some readings had poor signal, so the condition cannot be judged.</span></div></div></div></div></div></section>

      <section className="l-sec"><div className="l-wrap split rev">
        <div data-reveal="left"><div className="panel" style={{ padding: 0, overflow: 'hidden' }}><div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><span className="chip high">High priority</span><span className="chip await">Open</span><span className="chip sim">Simulated</span></div>
          <div style={{ padding: 22 }}><h3 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, marginBottom: 14 }}>Sustained high heart rate with high respiratory rate</h3>
            <div className="crit-list">{[['What was detected', 'Two measurements above the configured criteria together.'], ['Which measurements', 'Heart rate and respiratory rate, 6 readings.'], ['Period and change', 'About 2 minutes, both rising.'], ['Was the signal reliable?', 'All six readings had a good signal.'], ['What is missing', 'No bedside findings. Rules are illustrative.']].map(([a, b]) => <div key={a}><BadgeCheck size={18} style={{ flex: 'none', color: 'var(--highlight)', marginTop: 2 }} /><div><b>{a}</b><span>{b}</span></div></div>)}</div></div></div></div>
        <div data-reveal="right"><div className="l-eyebrow">Explainable clinical alerts</div><h2 className="l-h2">An alert that can explain itself.</h2><p className="l-lead">Alerts are generated by configured rules, never by a black box. Each shows the readings that triggered it, the criteria, the signal reliability and what is not known, so a clinician can judge it quickly.</p>
          <ul className="checks"><Bullet b="Five categories:">measurement, trend, signal quality, missing data and device disconnection.</Bullet><Bullet b="Duplicates are counted,">not re-raised, so alerts stay actionable.</Bullet></ul></div></div></section>

      <section className="l-sec l-alt"><div className="l-wrap split">
        <div data-reveal="left"><div className="l-eyebrow">Clinical response accountability</div><h2 className="l-h2">From measurement to a recorded response.</h2><p className="l-lead">Each step is recorded with who did it and when, in a history that cannot be quietly edited. Alerts are never closed automatically, even if a value returns to normal.</p>
          <ul className="checks"><Bullet b="Acknowledge, assess, document, escalate, resolve,">then close, each as its own recorded step.</Bullet><Bullet b="Role-based permissions">enforced by the backend, not just hidden in the interface.</Bullet></ul></div>
        <div className="panel" data-reveal="right"><div className="cap"><span>Response timeline (illustrative)</span><span>Every step attributed</span></div>
          <div className="tl" data-reveal>{[['Measurement received', 'Device gateway · 10:55:03'], ['Signal assessed', 'Reliable · 10:55:03'], ['Trend identified', 'Criteria met · 10:55:27'], ['Alert generated', 'High priority · 10:55:27', 1], ['Alert acknowledged', 'Nurse · 10:56:10', 1], ['Clinical response recorded', 'Doctor · 10:58:41', 1], ['Resolved', 'By a clinician, with a note', 1]].map(([t, s, k], n) => <div key={t as string} className={k ? 'k' : ''} style={{ ['--i' as string]: n }}><b>{t as string}</b><span>{s as string}</span></div>)}</div></div></div></section>

      <section className="l-sec"><div className="l-wrap">
        <div data-reveal><div className="l-eyebrow">Unified clinical workspace</div><h2 className="l-h2">Everything a team needs in one place.</h2><p className="l-lead">Newborn registration and profiles, live monitoring, clinical intelligence, alerts, response log, devices, reports and notifications, with the sections each role may see.</p></div>
        <div className="stats"><Stat n={4} label="Physiological parameters" /><Stat n={6} label="Signal-quality states" /><Stat n={5} label="Workflow stages" /><Stat n={5} label="Role-based access levels" /></div>
        <div className="l-cards">{[[LayoutDashboard, 'Clinical dashboard', 'Status at a glance, with every card opening its filtered view.'], [Baby, 'Newborn records', 'Registration, lifecycle, team, notes and history.'], [Activity, 'Live monitoring', 'Current readings with explicit staleness and quality.'], [FileSearch, 'Reports', 'Clinical and operational reports as CSV and PDF.']].map(([I, t, d], n) => { const Ic = I as typeof Eye; return <div className="l-card hover-lift" data-reveal key={t as string} style={{ ['--i' as string]: n }}><div className="ico"><Ic size={22} /></div><h3>{t as string}</h3><p>{d as string}</p></div>; })}</div></div></section>

      <section className="l-sec l-dark" id="about"><div className="l-wrap">
        <div data-reveal><div className="l-eyebrow">Responsible AI and clinical oversight</div><h2 className="l-h2">Support for clinicians, never a replacement.</h2><p className="l-lead">NeocareAI is an early-stage prototype built to demonstrate a workflow. It uses synthetic data, its alert criteria are illustrative, and it has not been clinically validated or approved by any regulator. Clinical decisions remain with authorised healthcare professionals.</p></div>
        <div className="promise">{[[ShieldCheck, 'Human oversight', 'Alerts need a clinician. Drafts need a clinician to complete and record them. Nothing closes automatically.'], [Eye, 'Explainable and honest', 'Every alert and AI statement shows its sources, its limits and what is not known.'], [HeartHandshake, 'What it will not do', 'It will not diagnose, prescribe, recommend medication or make autonomous clinical decisions.']].map(([I, t, d], n) => { const Ic = I as typeof Eye; return <div className="l-card" data-reveal key={t as string} style={{ ['--i' as string]: n }}><div className="ico"><Ic size={22} /></div><h3>{t as string}</h3><p style={{ color: '#B6B3CE' }}>{d as string}</p></div>; })}</div></div></section>

      <section className="l-cta"><div className="l-wrap" data-reveal><h2 className="l-h2">See the workflow from first measurement to recorded response.</h2><p className="l-lead" style={{ margin: '18px auto 0', color: '#CFCBE6' }}>Explore the working prototype with synthetic data.</p>
        <div className="cta"><Link className="btn gold lg" to={me ? '/overview' : '/login'}>{me ? 'Open the workspace' : 'Sign in'} <ArrowRight size={18} /></Link>{!me && reg && <Link className="btn ghost lg" to="/login?mode=register">Request an account</Link>}</div></div></section>

      <footer className="l-foot"><div className="l-wrap"><div className="cols4"><div><Wordmark variant="on-dark" size={22} /><p style={{ marginTop: 14, maxWidth: '36ch', lineHeight: 1.6 }}>Neonatal clinical intelligence: capture, validate, interpret, alert, respond.</p></div>
        <div><h4>Product</h4><a href="#platform">Platform</a><a href="#capabilities">Capabilities</a><a href="#how">How it works</a></div><div><h4>Company</h4><a href="#about">About</a><Link to="/login">Login</Link></div><div><h4>Status</h4><span>Competition prototype</span><span style={{ display: 'block' }}>Synthetic data only</span></div></div>
        <p className="legal">NeocareAI is an early-stage prototype. All patient records, measurements and device data shown are synthetic, and all alert criteria are illustrative and not clinically approved. It is not a medical device, has not been clinically validated, is not connected to any real monitor, and has no regulatory approval. It does not diagnose, treat or replace clinical judgement.</p></div></footer>
    </div>
  );
}
