import { useEffect, useRef, useState } from 'react';

export const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function usePrefersReducedMotion() {
  const [r, setR] = useState(prefersReducedMotion());
  useEffect(() => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); const h = () => setR(m.matches); m.addEventListener('change', h); return () => m.removeEventListener('change', h); }, []);
  return r;
}

/** Marks [data-reveal] descendants as visible when they scroll into view. Content stays visible if JS or IntersectionObserver is unavailable. */
export function useRevealOnScroll(root = '.js-reveal') {
  useEffect(() => {
    const host = document.querySelector(root) as HTMLElement | null; if (!host) return;
    const els = [...host.querySelectorAll<HTMLElement>('[data-reveal], .draw-line')];
    if (!('IntersectionObserver' in window) || prefersReducedMotion()) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.14, rootMargin: '0px 0px -6% 0px' });
    els.forEach((e) => io.observe(e)); return () => io.disconnect();
  }, [root]);
}

/** Animated counter that starts when scrolled into view. Shows the final value immediately under reduced motion. */
export function useCountUp(target: number, duration = 1100) {
  const ref = useRef<HTMLElement | null>(null); const [v, setV] = useState(prefersReducedMotion() ? target : 0);
  useEffect(() => {
    if (prefersReducedMotion()) { setV(target); return; }
    const el = ref.current; let raf = 0; let started = false;
    const run = () => { if (started) return; started = true; const t0 = performance.now(); const step = (t: number) => { const p = Math.min(1, (t - t0) / duration); setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };
    if (!el || !('IntersectionObserver' in window)) { run(); return; }
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) { run(); io.disconnect(); } }, { threshold: 0.4 }); io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [target, duration]);
  return [v, ref] as const;
}

/** Lightweight parallax: sets --py on [data-parallax] elements from scroll position (transform only, rAF-throttled). */
export function useParallax() {
  useEffect(() => {
    if (prefersReducedMotion()) return; const els = [...document.querySelectorAll<HTMLElement>('[data-parallax]')]; let raf = 0;
    const update = () => { raf = 0; const y = window.scrollY; els.forEach((e) => e.style.setProperty('--py', `${(y * parseFloat(e.dataset.parallax || '0.1')).toFixed(1)}px`)); };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); }; update(); window.addEventListener('scroll', on, { passive: true }); return () => { window.removeEventListener('scroll', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
}
