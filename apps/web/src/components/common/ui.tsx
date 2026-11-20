import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, WifiOff, XCircle, ShieldAlert, Info } from 'lucide-react';
import type { AlertStatus, Priority, Quality } from '../../types';
import { PRIORITY_LABEL, QUALITY_LABEL, STATUS_LABEL } from '../../utils/format';
import { ApiError } from '../../services/api';

export function Loading({ label = 'Loading' }: { label?: string }) { return <div className="state" role="status"><div className="spin" /><p>{label}…</p></div>; }
export function Empty({ title, children }: { title: string; children?: ReactNode }) { return <div className="state"><h3>{title}</h3>{children && <p>{children}</p>}</div>; }
export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'Something went wrong.';
  return <div className="state" role="alert"><h3>Could not load this data</h3><p>{msg}</p>{retry && <p style={{ marginTop: 10 }}><button className="btn ghost sm" onClick={retry}>Try again</button></p>}</div>;
}
export function Banner({ kind, children }: { kind: 'warn' | 'info' | 'err'; children: ReactNode }) {
  const Icon = kind === 'info' ? Info : kind === 'err' ? ShieldAlert : AlertTriangle;
  return <div className={`banner ${kind}`} role={kind === 'err' ? 'alert' : 'note'}><Icon size={18} style={{ flex: 'none', marginTop: 2 }} /><div>{children}</div></div>;
}

const QI: Record<Quality, ReactNode> = { good: <CheckCircle2 size={13} />, questionable: <AlertTriangle size={13} />, poor: <XCircle size={13} />, unavailable: <WifiOff size={13} />, unknown: <CircleHelp size={13} /> };
export const QualityChip = ({ q }: { q: Quality }) => <span className={`chip ${q === 'unknown' ? '' : q}`}>{QI[q]}{QUALITY_LABEL[q]}</span>;
export const PriorityChip = ({ p }: { p: Priority }) => <span className={`chip ${p}`}>{p === 'high' && <ShieldAlert size={13} />}{PRIORITY_LABEL[p]}</span>;
export const StatusChip = ({ s }: { s: AlertStatus }) => <span className={`chip ${s === 'resolved' ? 'resolved' : s === 'awaiting_acknowledgement' ? 'await' : ''}`}>{STATUS_LABEL[s]}</span>;
export const SimChip = () => <span className="chip sim" title="Synthetic device. Not a real medical monitor.">Simulated device</span>;
export const Working = () => <Loader2 size={15} className="spin-i" style={{ animation: 'sp .8s linear infinite' }} />;

/** Accessible modal: focus moves in, Escape closes, focus returns on close. */
export function Dialog({ title, children, onClose, labelledBy = 'dlg-title' }: { title: string; children: ReactNode; onClose: () => void; labelledBy?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input, textarea, select')];
        if (!f.length) return; const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus(); };
  }, [onClose]);
  return <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}><h2 id={labelledBy}>{title}</h2>{children}</div></div>;
}

export function Field({ label, error, hint, children, id }: { label: string; error?: string; hint?: string; children: ReactNode; id: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{hint && <div className="hint">{hint}</div>}{error && <div className="err" role="alert">{error}</div>}</div>;
}
export const issueMap = (e: unknown): Record<string, string> => e instanceof ApiError && e.issues ? Object.fromEntries(e.issues.map((i) => [i.path, i.message])) : {};
export const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.');

export const Spinner = () => <span aria-hidden="true" style={{ width: 15, height: 15, border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin .7s linear infinite' }} />;
