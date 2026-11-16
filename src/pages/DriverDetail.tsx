import { useMemo, useState } from 'react';
import { go, goTo } from '../App';
import { api, dateTime, Delivery, fcfa, FAILURE_LABEL, isOnline, Stop, time } from '../api';
import DeliverySheet, { FailureProof, ResolveDialog } from '../components/DeliverySheet';
import { EarningsTab } from '../components/Remittances';
import { useData } from '../data';
import { Avatar, Badge, BarChart, Card, Empty, Icon, Segmented, Stat, Switch, useToast } from '../ui';
import { CollectionsTab, DeliveriesTab } from './CompanyDetail';

type Tab = 'deliveries' | 'earnings' | 'stops' | 'collections' | 'disputes';
type Metric = 'created' | 'volume';
type StatusFilter = 'all' | 'active' | 'done' | 'cancelled';
const DAY = 86_400_000;
const STOP_LABEL = { PENDING: ['À livrer', 'gray'], DELIVERED: ['Livré', 'green'], FAILED: ['Échec', 'red'], CANCELLED: ['Annulé', 'gray'] } as const;

/** Fiche complète d'un livreur (SA : tous ; gérant : les siens) */
export default function DriverDetail({ id }: { id: string }) {
  const { drivers, deliveries, isSA, reload } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('deliveries');
  const [metric, setMetric] = useState<Metric>('created');
  const [open, setOpen] = useState<Delivery | null>(null);
  const [resolve, setResolve] = useState<{ d: Delivery; s: Stop } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const driver = drivers.find((u) => u.id === id);
  const mine = useMemo(() => deliveries.filter((d) => d.driver?.id === id), [deliveries, id]);

  const k = useMemo(() => {
    const done = mine.filter((d) => d.status === 'DELIVERED');
    const current = mine.find((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP') ?? null;
    const stops = mine.flatMap((d) => d.stops.map((s) => ({ d, s })));
    const delivered = stops.filter((x) => x.s.status === 'DELIVERED');
    const failed = stops.filter((x) => x.s.status === 'FAILED');
    const handled = delivered.length + failed.length;
    const cod = stops.filter((x) => x.s.status === 'DELIVERED' && x.s.codAmount > 0);
    // Durée moyenne d'une tournée : de la récupération des colis à la fin
    const durations = done.filter((d) => d.pickedUpAt && d.deliveredAt).map((d) => new Date(d.deliveredAt!).getTime() - new Date(d.pickedUpAt!).getTime());
    const weekAgo = Date.now() - 7 * DAY;
    return {
      total: mine.length,
      done: done.length,
      cancelled: mine.filter((d) => d.status === 'CANCELLED').length,
      current,
      volume: done.reduce((t, d) => t + d.price, 0),
      volumeWeek: done.filter((d) => d.deliveredAt && new Date(d.deliveredAt).getTime() > weekAgo).reduce((t, d) => t + d.price, 0),
      km: Math.round(done.reduce((t, d) => t + (d.distanceKm ?? 0), 0)),
      avgMin: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60000) : null,
      stops,
      delivered: delivered.length,
      failed,
      successRate: handled ? Math.round((delivered.length / handled) * 1000) / 10 : null,
      disputes: failed.filter((x) => x.s.disputedAt),
      disputesLost: failed.filter((x) => x.s.disputeDecision === 'UPHELD').length,
      cod,
      codHeld: cod.filter((x) => !x.s.codRemittedAt).reduce((t, x) => t + x.s.codAmount, 0),
      commissions: done.reduce((t, d) => t + (d.commissionChargedAt ? (d.commissionAmount ?? 0) - d.commissionRefunded : 0), 0),
      clients: new Set(mine.map((d) => d.client.id)).size,
      first: mine.reduce<string | null>((m, d) => (!m || d.createdAt < m ? d.createdAt : m), null),
      last: mine.reduce<string | null>((m, d) => (!m || d.createdAt > m ? d.createdAt : m), null),
    };
  }, [mine]);

  const series = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 30 }, (_, i) => {
      const day = new Date(start.getTime() - (29 - i) * DAY);
      const next = day.getTime() + DAY;
      const inDay = mine.filter((d) => {
        const t = new Date(metric === 'created' ? d.acceptedAt ?? d.createdAt : d.deliveredAt ?? 0).getTime();
        return t >= day.getTime() && t < next && (metric === 'created' || d.status === 'DELIVERED');
      });
      return {
        key: day.toISOString().slice(0, 10),
        label: day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        value: metric === 'created' ? inDay.length : inDay.reduce((t, d) => t + d.price, 0),
      };
    });
  }, [mine, metric]);

  if (!driver) {
    return (
      <>
        <button className="back-link" onClick={() => go('drivers')}><Icon name="chevron" size={15} />Livreurs</button>
        <Card><Empty icon="bike">Livreur introuvable</Empty></Card>
      </>
    );
  }

  const online = isOnline(driver);
  const toggle = async (active: boolean) => {
    await api(isSA ? `/users/${driver.id}/active?value=${active}` : `/companies/me/drivers/${driver.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${driver.name} débloqué` : `${driver.name} bloqué — accès coupé immédiatement`);
    reload();
  };

  return (
    <>
      <button className="back-link" onClick={() => go('drivers')}><Icon name="chevron" size={15} />Livreurs</button>

      <header className="page-header">
        <div className="hero">
          <Avatar name={driver.name} />
          <div>
            <h1>
              {driver.name}{' '}
              {!driver.active ? <Badge color="red">Bloqué</Badge> : online ? <Badge color={k.current ? 'purple' : 'green'}>{k.current ? 'En course' : 'En ligne'}</Badge> : <Badge>Hors ligne</Badge>}
            </h1>
            <div className="meta-row">
              <span><Icon name="phone" size={14} />{driver.phone}</span>
              {isSA && driver.company && (
                <span><Icon name="building" size={14} /><button className="btn plain" style={{ padding: 0 }} onClick={() => goTo('companies', driver.company!.id)}>{driver.company.name}</button></span>
              )}
              <span><Icon name="clock" size={14} />Inscrit le {new Date(driver.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              {driver.lastLocationAt && (
                <span>
                  <Icon name="pin" size={14} />
                  {online ? 'Position en direct' : `Vu le ${dateTime(driver.lastLocationAt)}`}
                  {driver.lastLat != null && (
                    <a href={`https://www.openstreetmap.org/?mlat=${driver.lastLat}&mlon=${driver.lastLng}#map=17/${driver.lastLat}/${driver.lastLng}`} target="_blank" rel="noreferrer">· voir sur la carte</a>
                  )}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="actions">
          <span className="muted">{driver.active ? 'Accès actif' : 'Bloqué'}</span>
          <Switch checked={driver.active} onChange={toggle} label={driver.active ? 'Bloquer' : 'Débloquer'} />
        </div>
      </header>

      {k.current && (
        <div className="banner warn" style={{ cursor: 'pointer' }} onClick={() => setOpen(k.current)}>
          <Icon name="bike" size={18} />
          <span className="grow">
            <strong>Course en cours</strong> depuis {time(k.current.acceptedAt)} · {k.current.client.name} · {k.current.pickupCommune} → {k.current.stops.length > 1 ? `${k.current.stops.length} arrêts (${k.current.stops.filter((s) => s.status !== 'PENDING').length} traités)` : k.current.stops[0]?.commune}
          </span>
          <button className="btn secondary">Voir</button>
        </div>
      )}

      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat icon="box" label="Courses" value={k.total} foot={`${k.done} terminée(s) · ${k.cancelled} annulée(s) · ${k.clients} client(s)`} />
        <Stat icon="check" label="Taux de réussite" value={k.successRate == null ? '—' : `${k.successRate} %`} foot={`${k.delivered} colis livré(s) · ${k.failed.length} échec(s)`} onClick={() => setTab('stops')} />
        <Stat icon="wallet" label="Volume des courses" value={fcfa(k.volume)} foot={`${fcfa(k.volumeWeek)} sur 7 jours · ${fcfa(k.commissions)} de commission LETO`} />
        <Stat icon="map" label="Distance parcourue" value={`${k.km.toLocaleString('fr-FR')} km`} foot={k.avgMin != null ? `${k.avgMin} min en moyenne par tournée` : 'Aucune tournée terminée'} />
        <Stat icon="wallet" label="Espèces à reverser" value={fcfa(k.codHeld)} foot={`${k.cod.length} paiement(s) à la livraison encaissé(s)`} onClick={() => setTab('collections')} />
        <Stat icon="alert" label="Litiges" value={k.disputes.length} foot={`${k.disputesLost} donné(s) au client · ${k.disputes.length - k.disputesLost} au livreur ou en attente`} onClick={() => setTab('disputes')} />
      </div>

      <div className="stack">
        <Card
          title={metric === 'created' ? 'Courses acceptées · 30 jours' : 'Volume terminé · 30 jours'}
          actions={<Segmented<Metric> value={metric} onChange={setMetric} options={[['created', 'Courses'], ['volume', 'Volume']]} />}
        >
          <div style={{ padding: '4px 20px 16px' }}>
            <BarChart data={series} format={(n) => (metric === 'created' ? `${n} course(s)` : fcfa(n))} label={`Activité de ${driver.name} sur 30 jours`} />
            <small className="muted">
              {k.first ? `Première course le ${new Date(k.first).toLocaleDateString('fr-FR')} · dernière le ${dateTime(k.last)}` : 'Aucune course pour l’instant'}
            </small>
          </div>
        </Card>

        <div>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              ['deliveries', `Courses (${k.total})`],
              ['earnings', 'Gains et versements'],
              ['stops', `Colis (${k.stops.length})`],
              ['collections', `Encaissements (${k.cod.length})`],
              ['disputes', `Échecs et litiges (${k.failed.length})`],
            ]}
          />
        </div>

        {tab === 'earnings' && <EarningsTab driver={driver} canManage={!isSA} />}
        {tab === 'deliveries' && <DeliveriesTab deliveries={mine} q={q} setQ={setQ} status={status} setStatus={setStatus} onOpen={setOpen} />}
        {tab === 'stops' && (
          <Card>
            {k.stops.length === 0 ? <Empty>Aucun colis</Empty> : (
              <div className="table-scroll">
                <table className="list">
                  <thead><tr><th>Date</th><th>Destinataire</th><th>Adresse</th><th>Expéditeur</th><th className="num">À encaisser</th><th>Statut</th></tr></thead>
                  <tbody>
                    {[...k.stops].sort((a, b) => b.d.createdAt.localeCompare(a.d.createdAt)).map(({ d, s }) => {
                      const [label, color] = STOP_LABEL[s.status];
                      return (
                        <tr key={s.id} className="clickable" onClick={() => setOpen(d)}>
                          <td style={{ whiteSpace: 'nowrap' }}>{dateTime(s.deliveredAt ?? s.failedAt ?? d.createdAt)}</td>
                          <td>{s.recipientName}<span className="sub">{s.recipientPhone}</span></td>
                          <td>{s.address}<span className="sub">{s.commune}</span></td>
                          <td>{d.client.name}</td>
                          <td className="num">{s.codAmount ? fcfa(s.codAmount) : <span className="muted">—</span>}</td>
                          <td><Badge color={color}>{label}</Badge>{s.failureReason && <span className="sub">{FAILURE_LABEL[s.failureReason]}</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
        {tab === 'collections' && <CollectionsTab cod={k.cod} />}
        {tab === 'disputes' && (
          k.failed.length === 0 ? <Card><Empty icon="shield">Aucun échec de livraison</Empty></Card> : (
            <div className="stack">
              {k.failed.map(({ d, s }) => (
                <Card key={s.id}>
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{FAILURE_LABEL[s.failureReason!]} · {s.recipientName}</strong>
                      {s.disputedAt && !s.disputeResolvedAt && <Badge color="red">À trancher</Badge>}
                      <span className="muted" style={{ marginLeft: 'auto' }}>{dateTime(s.failedAt)}</span>
                    </div>
                    <span className="muted">Expéditeur : {d.client.name} · {s.address} ({s.commune})</span>
                    <div style={{ marginLeft: -34 }}><FailureProof stop={s} onResolve={() => setResolve({ d, s })} /></div>
                    <div><button className="btn plain" style={{ paddingLeft: 0 }} onClick={() => setOpen(d)}>Voir la course</button></div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {open && <DeliverySheet delivery={open} onClose={() => setOpen(null)} />}
      {resolve && <ResolveDialog delivery={resolve.d} stop={resolve.s} onClose={() => setResolve(null)} />}
    </>
  );
}
