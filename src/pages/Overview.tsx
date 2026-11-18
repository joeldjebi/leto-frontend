import { useState } from 'react';
import { go } from '../App';
import { formatMoney } from '../countries';
import { useData } from '../data';
import { BarChart, Card, Empty, Icon, PageHeader, Segmented, Stat } from '../ui';

type Metric = 'created' | 'volume';

export default function Overview() {
  const { stats, isSA, me, deliveries, reload } = useData();
  const [metric, setMetric] = useState<Metric>('created');

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
