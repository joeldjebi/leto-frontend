import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, Company, Delivery, Stats, User } from './api';

/** Données partagées du back-office (rechargées toutes les 30 s et après chaque action) */
export interface BOData {
  me: User;
  isSA: boolean;
  deliveries: Delivery[];
  companies: Company[];
  users: User[]; // SA : tous les comptes ; gérant : ses livreurs
  drivers: User[];
  stats: Stats | null;
  loading: boolean;
  reload: () => Promise<void>;
}

const Ctx = createContext<BOData | null>(null);
export const useData = () => useContext(Ctx)!;

export function DataProvider({ me, children }: { me: User; children: ReactNode }) {
  const isSA = me.role === 'SUPER_ADMIN';
  const [state, setState] = useState<Omit<BOData, 'me' | 'isSA' | 'reload'>>({
    deliveries: [], companies: [], users: [], drivers: [], stats: null, loading: true,
  });

  const reload = useCallback(async () => {
    const [deliveries, users, companies, stats] = await Promise.all([
      api<Delivery[]>(isSA ? '/deliveries' : '/deliveries/company'),
      api<User[]>(isSA ? '/users' : '/companies/me/drivers'),
      isSA ? api<Company[]>('/companies') : Promise.resolve(me.company ? [me.company] : []),
      api<Stats>('/admin/stats?days=14').catch(() => null),
    ]);
    setState({ deliveries, users, companies, stats, drivers: users.filter((u) => u.role === 'DRIVER'), loading: false });
  }, [isSA, me.company]);

  useEffect(() => {
    reload().catch(() => setState((s) => ({ ...s, loading: false })));
    const t = window.setInterval(() => reload().catch(() => {}), 30_000);
    return () => window.clearInterval(t);
  }, [reload]);

  return <Ctx.Provider value={{ ...state, me, isSA, reload }}>{children}</Ctx.Provider>;
}
