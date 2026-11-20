import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { usePrefersReducedMotion, useCountUp } from '../../animations/hooks';

/** Illustrative interface preview. All numbers here are SIMULATED. */
export function HeroPreview() {
  return (
    <div className="preview stag" style={{ ['--i' as string]: 3 }} data-parallax="-0.06" aria-label="Illustrative preview of the NeocareAI workspace, with simulated data">
      <div className="win">
        <div className="bar"><i /><i /><i /><span className="cap">Illustrative preview · simulated data</span></div>
        <div className="mrow">
          <div className="mcard"><small>Heart rate</small><b>142<span>bpm</span></b><div className="tag ok">✓ Reliable</div></div>
          <div className="mcard"><small>Respiratory rate</small><b>46<span>/min</span></b><div className="tag ok">✓ Reliable</div></div>
          <div className="mcard"><small>Oxygen saturation</small><b style={{ opacity: .55 }}>96<span>%</span></b><div className="tag poor">◌ Poor quality</div></div>
        </div>
        <div className="graph" aria-hidden="true">
          <svg viewBox="0 0 400 100" preserveAspectRatio="none">
            {[20, 50, 80].map((y) => <line key={y} className="ax" x1="0" x2="400" y1={y} y2={y} />)}
            <path className="draw-line in" style={{ ['--len' as string]: 900 }} d="M0 62 C 28 28, 58 84, 92 52 S 152 18, 184 50 S 252 88, 292 42 S 362 14, 400 50" fill="none" stroke="#D8B878" strokeWidth="2.6" strokeLinecap="round" />
            <path className="draw-line in" style={{ ['--len' as string]: 900, animationDelay: '.5s' }} d="M0 78 C 40 70, 70 82, 110 74 S 190 64, 230 70 S 330 80, 400 66" fill="none" stroke="#C5B9E8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <div className="float f1"><b>Explainable alert</b><span>Which rule, which readings, how reliable the signal was.</span></div>
      <div className="float f2"><b>Signal ≠ condition</b><span>A poor signal is flagged as a data concern, never read as deterioration.</span></div>
      <div className="float f3"><b>Acknowledged by a clinician</b><span>Every response is attributed, timed and audited.</span></div>
    </div>
  );
}

const STATES = [
  { k: 'reliable', label: 'Reliable', val: '142', unit: 'bpm', note: 'Received with a good signal. Shown and used by the configured criteria.' },
  { k: 'reduced_quality', label: 'Reduced quality', val: '139', unit: 'bpm', note: 'Signal questionable or delayed. Shown with a warning and not counted by physiological rules.' },
  { k: 'poor_quality', label: 'Poor quality', val: '88', unit: 'bpm', note: 'Implausible or flagged by the device. Preserved for transparency and never interpreted as deterioration.' },
  { k: 'missing_data', label: 'Missing data', val: '–', unit: '', note: 'No recent reading. A missing reading is a data concern, not an abnormal reading.' },
  { k: 'device_disconnected', label: 'Device disconnected', val: '142', unit: 'bpm', note: 'The last value is struck through and marked not current. Never shown as a live normal reading.' },
  { k: 'insufficient_information', label: 'Insufficient information', val: '142', unit: 'bpm', note: 'No device quality indicator was supplied, so reliability cannot be stated.' },
] as const;

export function SignalDemo() {
  const [i, setI] = useState(0); const [hold, setHold] = useState(false); const reduced = usePrefersReducedMotion();
  useEffect(() => { if (hold || reduced) return; const t = setInterval(() => setI((x) => (x + 1) % STATES.length), 3200); return () => clearInterval(t); }, [hold, reduced]);
  const s = STATES[i];
  return (
    <div onMouseEnter={() => setHold(true)} onMouseLeave={() => setHold(false)} onFocus={() => setHold(true)} onBlur={() => setHold(false)}>
      <div className="sig-tabs" role="group" aria-label="Signal-quality states">{STATES.map((x, n) => <button key={x.k} aria-pressed={n === i} onClick={() => setI(n)}>{x.label}</button>)}</div>
      <div className={`sig s-${s.k}`} aria-live="polite">
        <div className="small muted">Heart rate · simulated reading</div>
        <div className="v">{s.val}<small>{s.unit}</small></div>
        <div className="row wrap" style={{ marginTop: 12 }}><span className={`chip ${s.k === 'reliable' ? 'good' : s.k === 'reduced_quality' ? 'questionable' : s.k === 'poor_quality' ? 'poor' : s.k === 'missing_data' ? 'missing' : s.k === 'device_disconnected' ? 'disconnected' : ''}`}>{s.label}</span>{s.k === 'device_disconnected' && <span className="chip">Not current</span>}</div>
        <p className="small" style={{ marginTop: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{s.note}</p>
      </div>
    </div>
  );
}

export function Stat({ n, label }: { n: number; label: string }) { const [v, ref] = useCountUp(n); return <div className="stat" data-reveal><div className="n" ref={ref as React.RefObject<HTMLDivElement>}>{v}</div><p>{label}</p></div>; }
export const Bullet = ({ b, children }: { b: string; children: React.ReactNode }) => <li><CheckCircle2 size={18} /><span><b>{b}</b> {children}</span></li>;
