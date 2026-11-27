import { useEffect, useState } from 'react';
import { go, usePoolNews } from '../App';
import { formatMoney } from '../countries';
import { useData } from '../data';
import { BarChart, Card, Empty, Icon, PageHeader, Segmented, Stat, Switch, useToast } from '../ui';
import { api, Availability, errText, OpeningHours } from '../api';

type Metric = 'created' | 'volume';

export default function Overview() {
  const { stats, isSA, me, deliveries, reload } = useData();
  const [metric, setMetric] = useState<Metric>('created');
  const pool = usePoolNews(isSA);

  if (!stats) return <PageHeader title="Vue d’ensemble" subtitle="Chargement des indicateurs…" />;
  const t = stats.totals;
  const raw = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const today = raw.charAt(0).toUpperCase() + raw.slice(1);
  const waiting = deliveries.filter((d) => d.status === 'PENDING' && Date.now() - new Date(d.createdAt).getTime() > 10 * 60_000);

  const series = stats.series.map((s) => ({
    key: s.day,
    label: new Date(s.day + 'T12:00:00Z').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
    value: metric === 'created' ? s.created : s.volume,
  }));
  const total = series.reduce((a, b) => a + b.value, 0);

  return (
    <>
      <PageHeader
        title="Vue d’ensemble"
        subtitle={`${today}${!isSA && me.company ? ` · ${me.company.name}` : ''}`}
        actions={<button className="btn secondary" onClick={() => reload()}><Icon name="refresh" size={15} />Actualiser</button>}
      />

      {!isSA && <AvailabilityCard />}

      {pool.count > 0 && (
        <div className="banner info">
          <Icon name="shield" size={18} />
          <span className="grow">
            <strong>{pool.count === 1 ? 'Nouveau livreur indépendant' : `${pool.count} nouveaux livreurs indépendants`}</strong> dans le vivier depuis votre dernière visite
            {pool.names.length > 0 && ` : ${pool.names.join(', ')}${pool.count > pool.names.length ? ` et ${pool.count - pool.names.length} autre(s)` : ''}`}. Validés par VITE, prêts à être invités.
          </span>
          <button className="btn" onClick={() => go('independents')}>Voir le vivier</button>
        </div>
      )}

      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat icon="box" label="Courses aujourd’hui" value={t.createdToday} foot={`${t.deliveredToday} terminée(s)`} onClick={() => go('deliveries')} />
        <Stat icon="wallet" label="Volume du jour" value={formatMoney(t.volumeToday)} foot={`${formatMoney(t.volumeWeek)} sur 7 jours`} />
        <Stat icon="clock" label="En cours" value={t.inProgress + t.pending} foot={`${t.pending} en attente d’un livreur`} onClick={() => go('deliveries')} />
        <Stat icon="bike" label="Livreurs en ligne" value={`${t.driversOnline} / ${t.drivers}`} foot="position reçue il y a moins de 2 min" onClick={() => go('map')} />
        <Stat icon="alert" label="Litiges ouverts" value={t.disputesOpen} foot={`Taux d’échec 7 j : ${t.failureRateWeek} %`} onClick={() => go('disputes')} />
        <Stat icon="wallet" label="À reverser aux boutiques" value={formatMoney(t.codToRemit)} foot="paiements à la livraison encaissés" onClick={() => go('collections')} />
      </div>

      <div className="stack">
        <Card
          title={metric === 'created' ? 'Courses créées · 14 jours' : 'Volume des courses terminées · 14 jours'}
          actions={<Segmented<Metric> value={metric} onChange={setMetric} options={[['created', 'Courses'], ['volume', 'Volume']]} />}
        >
          <div style={{ padding: '4px 20px 16px' }}>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              Total : <strong style={{ color: 'var(--label)' }}>{metric === 'created' ? `${total} course(s)` : formatMoney(total)}</strong>
              {isSA && ` · ${t.companies} entreprise(s), ${t.clients} client(s)`}
            </p>
            <BarChart
              data={series}
              format={(n) => (metric === 'created' ? `${n} course(s)` : formatMoney(n))}
              label={metric === 'created' ? 'Courses créées par jour, 14 derniers jours' : 'Volume des courses terminées par jour'}
            />
          </div>
        </Card>

        <div className="grid grid-2">
          {isSA && (
            <Card title="Entreprises les plus actives" actions={<button className="btn plain" onClick={() => go('companies')}>Tout voir</button>}>
              {stats.topCompanies.length === 0 ? <Empty icon="building">Aucune course terminée sur la période</Empty> : (
                <div className="rows">
                  {stats.topCompanies.map((c, i) => (
                    <div key={c.id}>
                      <span className="muted tabular" style={{ width: 18 }}>{i + 1}</span>
                      <span className="grow title">{c.name}</span>
                      <span className="muted tabular">{c.delivered} course(s)</span>
                      <strong className="tabular">{formatMoney(c.volume)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
          <Card title="Meilleurs clients" actions={isSA ? <button className="btn plain" onClick={() => go('clients')}>Tout voir</button> : undefined}>
            {stats.topClients.length === 0 ? <Empty icon="people">Aucun client sur la période</Empty> : (
              <div className="rows">
                {stats.topClients.map((c, i) => (
                  <div key={c.id}>
                    <span className="muted tabular" style={{ width: 18 }}>{i + 1}</span>
                    <span className="grow title">{c.name}</span>
                    <span className="muted tabular">{c.deliveries} course(s)</span>
                    <strong className="tabular">{formatMoney(c.volume)}</strong>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card title="À traiter">
            <div className="rows">
              <div>
                <Icon name="alert" className="muted" />
                <span className="grow">Litiges à trancher</span>
                <strong className="tabular">{t.disputesOpen}</strong>
                <button className="btn plain" onClick={() => go('disputes')}>Ouvrir</button>
              </div>
              <div>
                <Icon name="clock" className="muted" />
                <span className="grow">Courses sans livreur depuis plus de 10 min</span>
                <strong className="tabular">{waiting.length}</strong>
                <button className="btn plain" onClick={() => go('deliveries')}>Voir</button>
              </div>
              <div>
                <Icon name="wallet" className="muted" />
                <span className="grow">Montants à reverser</span>
                <strong className="tabular">{formatMoney(t.codToRemit)}</strong>
                <button className="btn plain" onClick={() => go('collections')}>Voir</button>
              </div>
              <div>
                <Icon name="box" className="muted" />
                <span className="grow">Courses annulées (7 jours)</span>
                <strong className="tabular">{t.cancelledWeek}</strong>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

const DAYS: [number, string][] = [[1, 'Lun'], [2, 'Mar'], [3, 'Mer'], [4, 'Jeu'], [5, 'Ven'], [6, 'Sam'], [7, 'Dim']];

/** Entreprise : ouverte ou fermée aux commandes des clients, horaires automatiques */
function AvailabilityCard() {
  const toast = useToast();
  const [a, setA] = useState<Availability | null>(null);
  const [hours, setHours] = useState<OpeningHours>({ open: '07:00', close: '21:00', days: [1, 2, 3, 4, 5, 6] });
  const [editing, setEditing] = useState(false);
  const load = () => api<Availability>('/companies/me/availability').then((x) => { setA(x); if (x.openingHours) setHours(x.openingHours); }).catch(() => {});
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000); // horaires : ouverture / fermeture automatiques
    return () => window.clearInterval(t);
  }, []);
  if (!a) return null;
  const save = async (body: Partial<Availability>, msg: string) => {
    try {
      const x = await api<Availability>('/companies/me/availability', { method: 'PUT', body });
      setA(x);
      if (x.openingHours) setHours(x.openingHours);
      toast(msg);
      setEditing(false);
    } catch (e) {
      toast(errText(e));
    }
  };
  const fmt = (h: OpeningHours) => `${h.open} – ${h.close} · ${DAYS.filter(([d]) => h.days.includes(d)).map(([, l]) => l).join(', ')}`;
  return (
    <Card title="Commandes des clients" pad>
      <div className="rows" style={{ margin: '-8px -20px' }}>
        <div>
          <span className="status-dot" style={{ background: a.openNow ? 'var(--green)' : 'var(--tertiary)' }} />
          <div className="grow">
            <div className="title">{a.openNow ? 'Ouverte aux commandes' : 'Fermée'}</div>
            <small className="muted">{a.openNow ? 'Les clients vous voient dans l’app et peuvent vous passer commande.' : `${a.status}. Vous n’apparaissez plus dans la liste des clients ; les courses en cours continuent.`}</small>
          </div>
          <Switch checked={a.acceptingOrders} label={a.acceptingOrders ? 'Fermer aux commandes' : 'Ouvrir aux commandes'}
            onChange={(v) => save({ acceptingOrders: v }, v ? 'Entreprise ouverte aux commandes' : 'Entreprise fermée aux commandes des clients')} />
        </div>
        <div style={{ flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <div className="title">Horaires d’ouverture</div>
            <small className="muted">{a.openingHours ? `Ouverture et fermeture automatiques : ${fmt(a.openingHours)}` : 'Aucun horaire : ouverte tant que l’interrupteur est activé.'}</small>
          </div>
          {!editing && <button className="btn secondary" onClick={() => setEditing(true)}>{a.openingHours ? 'Modifier' : 'Définir des horaires'}</button>}
          {!editing && a.openingHours && <button className="btn plain" onClick={() => save({ openingHours: null }, 'Horaires retirés')}>Retirer</button>}
        </div>
        {editing && (
          <div style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="muted">De <input type="time" value={hours.open} onChange={(e) => setHours({ ...hours, open: e.target.value })} /></label>
            <label className="muted">à <input type="time" value={hours.close} onChange={(e) => setHours({ ...hours, close: e.target.value })} /></label>
            <div className="day-chips">
              {DAYS.map(([d, l]) => (
                <button key={d} type="button" className={hours.days.includes(d) ? 'on' : ''} aria-pressed={hours.days.includes(d)}
                  onClick={() => setHours({ ...hours, days: hours.days.includes(d) ? hours.days.filter((x) => x !== d) : [...hours.days, d].sort() })}>{l}</button>
              ))}
            </div>
            <span className="grow" />
            <button className="btn secondary" onClick={() => setEditing(false)}>Annuler</button>
            <button className="btn" disabled={!hours.days.length || hours.open === hours.close} onClick={() => save({ openingHours: hours }, 'Horaires enregistrés')}>Enregistrer</button>
          </div>
        )}
        {(!a.openOrders || !a.liOpenOrders) && (
          <div>
            <small className="muted grow">
              Réglage de VITE : {!a.openOrders && !a.liOpenOrders ? 'vos livreurs et vos livreurs indépendants' : !a.openOrders ? 'vos livreurs' : 'vos livreurs indépendants'} ne voient que les commandes passées à votre nom et celles que vous leur affectez.
            </small>
          </div>
        )}
      </div>
    </Card>
  );
}
