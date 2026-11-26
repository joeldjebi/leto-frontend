import { useEffect, useMemo, useState } from 'react';
import { api, BillingOverview, getToken, PoolNews, ROLE_LABEL, setToken, User } from './api';
import { DataProvider, useData } from './data';
import Clients from './pages/Clients';
import Collections from './pages/Collections';
import Companies from './pages/Companies';
import Deliveries from './pages/Deliveries';
import Disputes from './pages/Disputes';
import Drivers from './pages/Drivers';
import LiveMapPage from './pages/LiveMapPage';
import Login from './pages/Login';
import Billing from './pages/Billing';
import Payments from './pages/Payments';
import Logbook from './pages/Logbook';
import CompanyPricing from './pages/CompanyPricing';
import Overview from './pages/Overview';
import Pricing from './pages/Pricing';
import Independents from './pages/Independents';
import CompanyIndependents from './pages/CompanyIndependents';
import Withdrawals from './pages/Withdrawals';
import Sounds from './pages/Sounds';
import CancelReasons from './pages/CancelReasons';
import Landing from './pages/Landing';
import PublicTracking from './pages/PublicTracking';
import { connectRealtime } from './realtime';
import { OfficeBell, OfficeInvite, OfficeToast } from './components/OfficeBell';
import { attachOffice, initOfficeStore, OfficeNotification, registerOfficeWorker } from './officeNotify';
import { loadCountries, useCountries } from './countries';
import Countries from './pages/Countries';
import VideoVisits from './pages/VideoVisits';
import Prospects from './pages/Prospects';
import Reactivity from './pages/Reactivity';
import { useTheme } from './theme';
import { Avatar, Icon, Segmented, ToastProvider, LetoMark } from './ui';

export type Route = 'overview' | 'deliveries' | 'map' | 'disputes' | 'collections' | 'companies' | 'drivers' | 'clients' | 'pricing' | 'billing' | 'payments' | 'myPricing' | 'logbook' | 'independents' | 'sounds' | 'landing' | 'cancelReasons' | 'countries' | 'videoVisits' | 'prospects' | 'reactivity' | 'withdrawals';

/** Navigation par l'adresse (#/courses…) pour garder la page au rechargement */
const PATHS: Record<Route, string> = {
  overview: 'apercu', deliveries: 'courses', map: 'carte', disputes: 'litiges', collections: 'encaissements',
  companies: 'entreprises', drivers: 'livreurs', clients: 'clients', pricing: 'tarifs',
  billing: 'credit', payments: 'paiements', myPricing: 'mes-tarifs', logbook: 'carnet', independents: 'independants', sounds: 'sons', landing: 'landing', cancelReasons: 'motifs-annulation', countries: 'pays', videoVisits: 'visites-video', prospects: 'prospection', reactivity: 'reactivite', withdrawals: 'retraits',
};
const fromHash = (): Route =>
  (Object.entries(PATHS).find(([, p]) => location.hash === `#/${p}` || location.hash.startsWith(`#/${p}/`))?.[0] as Route) ?? 'overview';

/** Identifiant dans l'adresse : #/entreprises/<id> → <id> */
export function useHashParam(route: Route): string | null {
  const read = () => {
    const m = location.hash.match(new RegExp(`^#/${PATHS[route]}/([^/?#]+)`));
    return m ? decodeURIComponent(m[1]) : null;
  };
  const [v, setV] = useState(read);
  useEffect(() => {
    const on = () => setV(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return v;
}
export const goTo = (route: Route, id: string) => { location.hash = `/${PATHS[route]}/${encodeURIComponent(id)}`; };
export const go = (r: Route) => { location.hash = `/${PATHS[r]}`; };

/** Lien de suivi public : #/suivi/<jeton> (sans connexion) */
const trackingToken = () => location.hash.match(/^#\/suivi\/([0-9a-f]{32})/)?.[1] ?? null;

export default function App() {
  const [token] = useState(trackingToken);
  // Pays actifs (indicatifs, devises) : chargés une fois, rechargés sur `countries:changed` ; tout se redessine au changement
  useCountries();
  useEffect(() => { loadCountries(); }, []);
  return token ? <PublicTracking token={token} /> : <BackOffice />;
}

function BackOffice() {
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
  // Temps réel : fond de carte mis à jour dès que l'admin le change
  const [toast, setToast] = useState<OfficeNotification | null>(null);
  useEffect(() => {
    const t = getToken();
    if (!t) return;
    initOfficeStore(me.id);
    registerOfficeWorker();
    const s = connectRealtime({ token: t });
    // Notifications locales (SA et gérants) : son, bandeau, notification du navigateur
    const detach = attachOffice(s, setToast);
    return () => { detach(); s.disconnect(); };
  }, []);
  const [route, setRoute] = useState<Route>(fromHash());
  const [theme, setTheme] = useTheme();
  useEffect(() => {
    const on = () => setRoute(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const { n: billingAlert, subscriptions } = useBillingBadge(isSA);
  const liPending = useIndependentsBadge(isSA);
  const poolNews = usePoolNews(isSA);
  const coPending = useCompaniesBadge(isSA);
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
              { r: 'companies', icon: 'building', label: 'Entreprises', count: coPending || undefined, alert: true },
              { r: 'drivers', icon: 'bike', label: 'Livreurs' },
              { r: 'reactivity', icon: 'clock', label: 'Réactivité' },
              { r: 'independents', icon: 'shield', label: 'Indépendants', count: liPending || undefined, alert: true },
              { r: 'logbook', icon: 'book', label: 'Carnet des livreurs' },
              { r: 'clients', icon: 'people', label: 'Clients' },
            ]
          : [
              { r: 'drivers', icon: 'bike', label: 'Livreurs' },
              { r: 'independents', icon: 'shield', label: 'Indépendants', count: poolNews.count || undefined },
              { r: 'reactivity', icon: 'clock', label: 'Réactivité' },
              { r: 'logbook', icon: 'book', label: 'Carnet des livreurs' },
            ],
      },
      isSA
        ? { section: 'Facturation', links: [
            { r: 'payments', icon: 'receipt', label: 'Paiements', count: billingAlert || undefined, alert: true },
            { r: 'withdrawals', icon: 'wallet', label: 'Retraits' },
          ] }
        : { section: 'Compte', links: [
            { r: 'myPricing', icon: 'tag', label: 'Mes tarifs' },
            { r: 'billing', icon: 'card', label: subscriptions ? 'Crédit et abonnement' : 'Crédit', count: billingAlert || undefined, alert: true },
          ] },
    ];
    if (isSA) items.push({ section: 'Commercial', links: [
      { r: 'prospects', icon: 'target', label: 'Prospection' },
      { r: 'videoVisits', icon: 'play', label: 'Visites vidéo' },
    ] });
    if (isSA) items.push({ section: 'Réglages', links: [
      { r: 'pricing', icon: 'tag', label: 'Tarifs et règles' },
      { r: 'cancelReasons', icon: 'close', label: 'Motifs d’annulation' },
      { r: 'countries', icon: 'flag', label: 'Pays' },
      { r: 'sounds', icon: 'bell', label: 'Sons' },
      { r: 'landing', icon: 'globe', label: 'Landing page' },
    ] });
    return items;
  }, [isSA, active, stats, billingAlert, subscriptions, liPending, coPending, poolNews.count]);

  const allowed = nav.flatMap((s) => s.links.map((l) => l.r));
  const current = allowed.includes(route) ? route : 'overview';

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navigation">
        <div className="brand">
          <div className="app-icon"><LetoMark size={22} /></div>
          <div>
            <strong className="brand-word">LETO</strong>
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
        <div className="theme-switch" title="Apparence">
          <Segmented
            value={theme}
            onChange={setTheme}
            options={[
              ['auto', <Icon key="a" name="auto" size={15} />],
              ['light', <Icon key="l" name="sun" size={15} />],
              ['dark', <Icon key="d" name="moon" size={15} />],
            ]}
            labels={{ auto: 'Automatique', light: 'Clair', dark: 'Sombre' }}
          />
        </div>
        <div className="sidebar-footer">
          <Avatar name={me.name} />
          <div className="who">
            <strong>{me.name}</strong>
            <small className="muted">{ROLE_LABEL[me.role]}</small>
          </div>
          <OfficeBell isSA={isSA} />
          <button className="btn secondary icon-btn" onClick={onLogout} title="Se déconnecter" aria-label="Se déconnecter"><Icon name="logout" size={16} /></button>
        </div>
      </nav>
      <main className="main">
        <OfficeToast n={toast} onClose={() => setToast(null)} />
        <div className="page">
          <OfficeInvite />
          {current === 'overview' && <Overview />}
          {current === 'deliveries' && <Deliveries />}
          {current === 'map' && <LiveMapPage />}
          {current === 'disputes' && <Disputes />}
          {current === 'collections' && <Collections />}
          {current === 'companies' && <Companies />}
          {current === 'drivers' && <Drivers />}
          {current === 'clients' && <Clients />}
          {current === 'pricing' && <Pricing />}
          {current === 'billing' && <Billing />}
          {current === 'payments' && <Payments />}
          {current === 'myPricing' && <CompanyPricing />}
          {current === 'logbook' && <Logbook />}
          {current === 'independents' && (isSA ? <Independents /> : <CompanyIndependents />)}
          {current === 'withdrawals' && <Withdrawals />}
          {current === 'sounds' && <Sounds />}
          {current === 'cancelReasons' && <CancelReasons />}
          {current === 'countries' && <Countries />}
          {current === 'landing' && <Landing />}
          {current === 'videoVisits' && <VideoVisits />}
          {current === 'prospects' && <Prospects />}
          {current === 'reactivity' && <Reactivity superAdmin={isSA} />}
        </div>
      </main>
    </div>
  );
}

/** Pastille du menu : SA = paiements à vérifier ; gérant = 1 si l'entreprise ne peut pas travailler */
function useBillingBadge(isSA: boolean) {
  const [state, setState] = useState({ n: 0, subscriptions: true });
  useEffect(() => {
    const load = () =>
      (isSA
        ? api<{ pending: number }>('/billing/summary').then((s) => ({ n: s.pending, subscriptions: true }))
        : api<BillingOverview>('/billing/me').then((b) => ({
            // Pendant l'essai : alerte seulement dans les 3 derniers jours
            n: (b.inTrial ? b.trialDaysLeft <= 3 : !b.subscribed || b.available <= 0) ? 1 : 0,
            subscriptions: b.subscriptionRequired,
          }))
      ).then(setState).catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [isSA]);
  return state;
}

/** Pastille du menu (SA) : dossiers de livreurs indépendants à vérifier */
function useIndependentsBadge(isSA: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!isSA) return;
    const load = () => api<{ counts: { pending: number } }>('/independents?status=PENDING').then((r) => setN(r.counts.pending)).catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    window.addEventListener('independents:changed', load);
    return () => { window.clearInterval(t); window.removeEventListener('independents:changed', load); };
  }, [isSA]);
  return n;
}

/** Entreprise : nouveaux livreurs indépendants dans le vivier depuis la dernière visite (menu et Vue d'ensemble) */
export function usePoolNews(isSA: boolean) {
  const [news, setNews] = useState<PoolNews>({ count: 0, names: [] });
  useEffect(() => {
    if (isSA) return;
    const load = () => api<PoolNews>('/affiliations/company/pool-news').then(setNews).catch(() => {});
    load();
    const t = window.setInterval(load, 60_000);
    window.addEventListener('affiliations:changed', load);
    return () => { window.clearInterval(t); window.removeEventListener('affiliations:changed', load); };
  }, [isSA]);
  return news;
}

/** Pastille du menu (SA) : demandes d'inscription d'entreprises à traiter */
function useCompaniesBadge(isSA: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!isSA) return;
    const load = () => api<unknown[]>('/companies?status=PENDING').then((r) => setN(r.length)).catch(() => {});
    load();
    const t = window.setInterval(load, 30_000);
    window.addEventListener('companies:changed', load);
    return () => { window.clearInterval(t); window.removeEventListener('companies:changed', load); };
  }, [isSA]);
  return n;
}
