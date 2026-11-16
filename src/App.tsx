import { useEffect, useMemo, useState } from 'react';
import { api, ROLE_LABEL, setToken, User } from './api';
import { DataProvider, useData } from './data';
import Clients from './pages/Clients';
import Collections from './pages/Collections';
import Companies from './pages/Companies';
import Deliveries from './pages/Deliveries';
import Disputes from './pages/Disputes';
import Drivers from './pages/Drivers';
import LiveMapPage from './pages/LiveMapPage';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Pricing from './pages/Pricing';
import { Avatar, Icon, ToastProvider } from './ui';

export type Route = 'overview' | 'deliveries' | 'map' | 'disputes' | 'collections' | 'companies' | 'drivers' | 'clients' | 'pricing';

/** Navigation par l'adresse (#/courses…) pour garder la page au rechargement */
const PATHS: Record<Route, string> = {
  overview: 'apercu', deliveries: 'courses', map: 'carte', disputes: 'litiges', collections: 'encaissements',
  companies: 'entreprises', drivers: 'livreurs', clients: 'clients', pricing: 'tarifs',
};
const fromHash = (): Route => (Object.entries(PATHS).find(([, p]) => location.hash === `#/${p}`)?.[0] as Route) ?? 'overview';
export const go = (r: Route) => { location.hash = `/${PATHS[r]}`; };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(!!localStorage.getItem('leto_token'));

  useEffect(() => {
    if (!loading) return;
    api<User>('/auth/me')
      .then((u) => (u.role === 'SUPER_ADMIN' || u.role === 'COMPANY' ? setUser(u) : setToken(null)))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [loading]);

  if (loading) return <div className="center">Chargement…</div>;
  return (
    <ToastProvider>
      {user ? (
        <DataProvider me={user}>
          <Shell onLogout={() => { setToken(null); setUser(null); }} />
        </DataProvider>
      ) : (
        <Login onLogin={setUser} />
      )}
    </ToastProvider>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { me, isSA, stats, deliveries } = useData();
  const [route, setRoute] = useState<Route>(fromHash());
  useEffect(() => {
    const on = () => setRoute(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const active = deliveries.filter((d) => d.status === 'PENDING' || d.status === 'ACCEPTED' || d.status === 'PICKED_UP').length;
  const nav = useMemo(() => {
    const items: { section: string; links: { r: Route; icon: string; label: string; count?: number; alert?: boolean }[] }[] = [
      {
        section: 'Pilotage',
        links: [
          { r: 'overview', icon: 'overview', label: 'Vue d’ensemble' },
          { r: 'deliveries', icon: 'box', label: 'Courses', count: active || undefined },
          { r: 'map', icon: 'map', label: 'Carte en direct', count: stats?.totals.driversOnline || undefined },
          { r: 'disputes', icon: 'alert', label: 'Litiges', count: stats?.totals.disputesOpen || undefined, alert: true },
          { r: 'collections', icon: 'wallet', label: 'Encaissements' },
        ],
      },
      {
        section: 'Réseau',
        links: isSA
          ? [
              { r: 'companies', icon: 'building', label: 'Entreprises' },
              { r: 'drivers', icon: 'bike', label: 'Livreurs' },
              { r: 'clients', icon: 'people', label: 'Clients' },
            ]
          : [{ r: 'drivers', icon: 'bike', label: 'Livreurs' }],
      },
    ];
    if (isSA) items.push({ section: 'Réglages', links: [{ r: 'pricing', icon: 'tag', label: 'Tarifs et règles' }] });
    return items;
  }, [isSA, active, stats]);

  const allowed = nav.flatMap((s) => s.links.map((l) => l.r));
  const current = allowed.includes(route) ? route : 'overview';

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navigation">
        <div className="brand">
          <div className="app-icon"><Icon name="bike" size={20} /></div>
          <div>
            <strong>LETO</strong>
            <small className="muted">{isSA ? 'Super Admin' : me.company?.name}</small>
          </div>
        </div>
        {nav.map((s) => (
          <div key={s.section}>
            <div className="nav-section">{s.section}</div>
            {s.links.map((l) => (
              <button key={l.r} className={`nav-item${current === l.r ? ' active' : ''}`} onClick={() => go(l.r)} aria-current={current === l.r ? 'page' : undefined}>
                <Icon name={l.icon} size={17} />
                {l.label}
                {l.count != null && <span className={`count${l.alert ? ' alert' : ''}`}>{l.count}</span>}
              </button>
            ))}
          </div>
        ))}
        <div className="sidebar-footer">
          <Avatar name={me.name} />
          <div className="who">
            <strong>{me.name}</strong>
            <small className="muted">{ROLE_LABEL[me.role]}</small>
          </div>
          <button className="btn secondary icon-btn" onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter"><Icon name="logout" size={16} /></button>
        </div>
      </nav>
      <main className="main">
        <div className="page">
          {current === 'overview' && <Overview />}
          {current === 'deliveries' && <Deliveries />}
          {current === 'map' && <LiveMapPage />}
          {current === 'disputes' && <Disputes />}
          {current === 'collections' && <Collections />}
          {current === 'companies' && <Companies />}
          {current === 'drivers' && <Drivers />}
          {current === 'clients' && <Clients />}
          {current === 'pricing' && <Pricing />}
        </div>
      </main>
    </div>
  );
}
