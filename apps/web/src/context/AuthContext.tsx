import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, post } from '../services/api';
import type { Me } from '../types';

interface Ctx { me: Me | null; loading: boolean; can: (p: string) => boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void> }
const AuthCtx = createContext<Ctx>(null!);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/auth/me'), retry: false, staleTime: 60_000 });
  useEffect(() => { const h = () => qc.setQueryData(['me'], null); window.addEventListener('neocare:unauthenticated', h); return () => window.removeEventListener('neocare:unauthenticated', h); }, [qc]);
  const me = q.data ?? null;
  const value: Ctx = {
    me, loading: q.isLoading,
    can: (p) => !!me?.permissions.includes(p),
    login: async (email, password) => { await post('/auth/login', { email, password }); await qc.invalidateQueries({ queryKey: ['me'] }); await qc.refetchQueries({ queryKey: ['me'] }); },
    logout: async () => { try { await post('/auth/logout'); } catch (e) { if (!(e instanceof ApiError)) throw e; } qc.clear(); qc.setQueryData(['me'], null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
