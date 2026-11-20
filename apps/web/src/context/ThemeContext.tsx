import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'light' | 'dark';
const Ctx = createContext<{ theme: Theme; toggle: () => void; set: (t: Theme) => void }>({ theme: 'light', toggle: () => {}, set: () => {} });
export const useTheme = () => useContext(Ctx);
const read = (): Theme => { try { const s = localStorage.getItem('neocare:theme'); if (s === 'light' || s === 'dark') return s; } catch { /* storage unavailable */ } return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; };

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(read);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('neocare:theme', theme); } catch { /* ignore */ } }, [theme]);
  return <Ctx.Provider value={{ theme, set: setTheme, toggle: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) }}>{children}</Ctx.Provider>;
}
