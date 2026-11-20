/**
 * PLACEHOLDER BRAND ASSETS. The supplied NeocareAI wordmark file was not available in this environment, so this is a recreation in the
 * Midnight Elegance palette (a ribbon-style "N" in lavender and champagne gold). Replace `Mark` and `Wordmark` with the official
 * asset (inspect first: a PNG is not a transparent SVG) when it is provided. All usages go through these two components.
 */
export function Mark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} role="img" aria-label="NeocareAI mark" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="nm-l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E3DBF7" /><stop offset="1" stopColor="#B3A4E0" /></linearGradient>
        <linearGradient id="nm-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#EBD3A0" /><stop offset="1" stopColor="#C9A55E" /></linearGradient>
      </defs>
      <path d="M8 40V9c0-1.4 1.7-2 2.6-1l17 19.5V9" fill="none" stroke="url(#nm-l)" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M40 8v31c0 1.4-1.7 2-2.6 1L20.5 20.8" fill="none" stroke="url(#nm-g)" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" opacity=".96" />
    </svg>
  );
}
export function Wordmark({ variant = 'auto', compact = false, size = 22 }: { variant?: 'auto' | 'on-dark' | 'on-light'; compact?: boolean; size?: number }) {
  const cls = variant === 'on-dark' ? 'wm wm-dark' : variant === 'on-light' ? 'wm wm-light' : 'wm';
  return <span className={cls} style={{ fontSize: size }}><Mark size={Math.round(size * 1.45)} />{!compact && <span className="wm-text">Neocare<b>AI</b></span>}</span>;
}
