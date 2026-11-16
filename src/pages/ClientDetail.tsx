import { useMemo, useState } from 'react';
import { go } from '../App';
import { api, dateTime, Delivery, fcfa, FAILURE_LABEL, photoUrl, Stop } from '../api';
import DeliverySheet, { FailureProof, ResolveDialog } from '../components/DeliverySheet';
import { useData } from '../data';
import { Avatar, Badge, BarChart, Card, Empty, Icon, Segmented, Stat, Switch, useToast } from '../ui';
import { CollectionsTab, DeliveriesTab } from './CompanyDetail';

type Tab = 'deliveries' | 'recipients' | 'collections' | 'failures' | 'cancellations';
type Metric = 'created' | 'volume';
type StatusFilter = 'all' | 'active' | 'done' | 'cancelled';
const DAY = 86_400_000;

/** Fiche complète d'un client (particulier ou boutique) pour le SA */
export default function ClientDetail({ id }: { id: string }) {
  const { users, deliveries, reload } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('deliveries');
  const [metric, setMetric] = useState<Metric>('created');
  const [open, setOpen] = useState<Delivery | null>(null);
  const [resolve, setResolve] = useState<{ d: Delivery; s: Stop } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const client = users.find((u) => u.id === id && u.role === 'CLIENT');
  const mine = useMemo(() => deliveries.filter((d) => d.client.id === id), [deliveries, id]);

  const k = useMemo(() => {
    const done = mine.filter((d) => d.status === 'DELIVERED');
    const cancelled = mine.filter((d) => d.status === 'CANCELLED');
    const stops = mine.flatMap((d) => d.stops.map((s) => ({ d, s })));
    const delivered = stops.filter((x) => x.s.status === 'DELIVERED');
    const failed = stops.filter((x) => x.s.status === 'FAILED');
    const cancelledStops = stops.filter((x) => x.s.status === 'CANCELLED');
    const handled = delivered.length + failed.length;
    const cod = stops.filter((x) => x.s.status === 'DELIVERED' && x.s.codAmount > 0);
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const fees = cancelled.filter((d) => (d.cancellationFee ?? 0) > 0);

    // Destinataires regroupés par téléphone
    const recipients = Object.values(
      stops.reduce<Record<string, { name: string; phone: string; count: number; delivered: number; failed: number; last: string; communes: Set<string> }>>((acc, { d, s }) => {
        const r = (acc[s.recipientPhone] ??= { name: s.recipientName, phone: s.recipientPhone, count: 0, delivered: 0, failed: 0, last: d.createdAt, communes: new Set() });
        r.count++;
        if (s.status === 'DELIVERED') r.delivered++;
        if (s.status === 'FAILED') r.failed++;
        if (d.createdAt > r.last) { r.last = d.createdAt; r.name = s.recipientName; }
        r.communes.add(s.commune);
        return acc;
      }, {}),
    ).sort((a, b) => b.count - a.count);

    const top = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((m, v) => ({ ...m, [v]: (m[v] ?? 0) + 1 }), {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 4);

    return {
      total: mine.length,
      done: done.length,
      cancelled,
      active: mine.filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP' || d.status === 'PENDING').length,
      spent: done.reduce((t, d) => t + d.price, 0),
      spentMonth: done.filter((d) => d.deliveredAt && new Date(d.deliveredAt) >= monthStart).reduce((t, d) => t + d.price, 0),
      avg: done.length ? Math.round(done.reduce((t, d) => t + d.price, 0) / done.length) : 0,
      stops: stops.length,
      delivered: delivered.length,
      failed,
      cancelledStops,
      successRate: handled ? Math.round((delivered.length / handled) * 1000) / 10 : null,
      cod,
      codPending: cod.filter((x) => !x.s.codRemittedAt).reduce((t, x) => t + x.s.codAmount, 0),
      fees,
      feesDue: fees.filter((d) => !d.cancellationFeeSettledAt).reduce((t, d) => t + (d.cancellationFee ?? 0), 0),
      disputes: failed.filter((x) => x.s.disputedAt),
      recipients,
      companies: top(mine.filter((d) => d.company).map((d) => d.company!.name)),
      communes: top(stops.map((x) => x.s.commune)),
      tours: mine.filter((d) => d.stops.length > 1).length,
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
        const t = new Date(metric === 'created' ? d.createdAt : d.deliveredAt ?? 0).getTime();
        return t >= day.getTime() && t < next && (metric === 'created' || d.status === 'DELIVERED');
      });
      return {
        key: day.toISOString().slice(0, 10),
        label: day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        value: metric === 'created' ? inDay.length : inDay.reduce((t, d) => t + d.price, 0),
      };
    });
  }, [mine, metric]);

  if (!client) {
    return (
      <>
        <button className="back-link" onClick={() => go('clients')}><Icon name="chevron" size={15} />Clients</button>
        <Card><Empty icon="people">Client introuvable</Empty></Card>
      </>
    );
  }

  const shop = client.accountType === 'SHOP';
  const toggle = async (active: boolean) => {
    await api(`/users/${client.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${client.name} débloqué` : `${client.name} bloqué — il ne peut plus commander`);
    reload();
  };

  return (
    <>
      <button className="back-link" onClick={() => go('clients')}><Icon name="chevron" size={15} />Clients</button>

      <header className="page-header">
        <div className="hero">
          {client.avatarUrl ? <img className="avatar-photo" src={photoUrl(client.avatarUrl)} alt="" /> : <Avatar name={client.name} />}
          <div>
            <h1>
              {client.name}{' '}
              {client.accountType ? <Badge color={shop ? 'purple' : 'gray'}>{shop ? 'Boutique' : 'Particulier'}</Badge> : <Badge>Type non précisé</Badge>}{' '}
              {!client.active && <Badge color="red">Bloqué</Badge>}
            </h1>
            <div className="meta-row">
              <span><Icon name="phone" size={14} />{client.phone}</span>
              <span><Icon name="clock" size={14} />Inscrit le {new Date(client.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span><Icon name="box" size={14} />{k.last ? `Dernière commande le ${dateTime(k.last)}` : 'Aucune commande'}</span>
            </div>
          </div>
        </div>
        <div className="actions">
          <span className="muted">{client.active ? 'Accès actif' : 'Bloqué'}</span>
          <Switch checked={client.active} onChange={toggle} label={client.active ? 'Bloquer' : 'Débloquer'} />
        </div>
      </header>

      {(k.feesDue > 0 || k.disputes.some((x) => !x.s.disputeResolvedAt)) && (
        <div className="banner warn">
          <Icon name="alert" size={18} />
          <span className="grow">
            {k.feesDue > 0 && <>Frais de déplacement non réglés : <strong>{fcfa(k.feesDue)}</strong>. </>}
            {k.disputes.some((x) => !x.s.disputeResolvedAt) && <>Litige(s) en attente de décision.</>}
          </span>
          <button className="btn secondary" onClick={() => setTab(k.feesDue > 0 ? 'cancellations' : 'failures')}>Voir</button>
        </div>
      )}

      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat icon="box" label="Courses" value={k.total} foot={`${k.done} terminée(s) · ${k.active} en cours · ${k.cancelled.length} annulée(s)`} />
        <Stat icon="wallet" label="Dépensé" value={fcfa(k.spent)} foot={`${fcfa(k.spentMonth)} ce mois · panier moyen ${fcfa(k.avg)}`} />
        <Stat icon="people" label="Colis envoyés" value={k.stops} foot={`${k.recipients.length} destinataire(s) · ${k.tours} tournée(s)`} onClick={() => setTab('recipients')} />
        <Stat icon="check" label="Taux de réussite" value={k.successRate == null ? '—' : `${k.successRate} %`} foot={`${k.delivered} livré(s) · ${k.failed.length} échec(s) · ${k.cancelledStops.length} annulé(s)`} onClick={() => setTab('failures')} />
        <Stat icon="wallet" label="Encaissé pour lui" value={fcfa(k.cod.reduce((t, x) => t + x.s.codAmount, 0))} foot={k.codPending ? `${fcfa(k.codPending)} encore à lui reverser` : 'Tout lui a été reversé'} onClick={() => setTab('collections')} />
        <Stat icon="alert" label="Annulations et litiges" value={k.cancelled.length + k.disputes.length} foot={`${fcfa(k.feesDue)} de frais non réglés · ${k.disputes.length} contestation(s)`} onClick={() => setTab('cancellations')} />
      </div>

      <div className="stack">
        <div className="grid grid-2">
          <Card
            title={metric === 'created' ? 'Commandes · 30 jours' : 'Dépenses · 30 jours'}
            actions={<Segmented<Metric> value={metric} onChange={setMetric} options={[['created', 'Commandes'], ['volume', 'Dépenses']]} />}
          >
            <div style={{ padding: '4px 20px 16px' }}>
              <BarChart data={series} format={(n) => (metric === 'created' ? `${n} commande(s)` : fcfa(n))} label={`Activité de ${client.name} sur 30 jours`} />
            </div>
          </Card>
          <Card title="Habitudes">
            <div className="rows">
              <div><div className="grow"><div className="title">Client depuis</div><small className="muted">{k.first ? `Première commande le ${new Date(k.first).toLocaleDateString('fr-FR')}` : 'Aucune commande'}</small></div></div>
              <div>
                <div className="grow">
                  <div className="title">Entreprises de livraison</div>
                  <small className="muted">{k.companies.length ? k.companies.map(([n, c]) => `${n} (${c})`).join(' · ') : '—'}</small>
                </div>
              </div>
              <div>
                <div className="grow">
                  <div className="title">Communes les plus livrées</div>
                  <small className="muted">{k.communes.length ? k.communes.map(([n, c]) => `${n} (${c})`).join(' · ') : '—'}</small>
                </div>
              </div>
              <div>
                <div className="grow">
                  <div className="title">Destinataire le plus fréquent</div>
                  <small className="muted">{k.recipients[0] ? `${k.recipients[0].name} · ${k.recipients[0].phone} (${k.recipients[0].count} colis)` : '—'}</small>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              ['deliveries', `Courses (${k.total})`],
              ['recipients', `Destinataires (${k.recipients.length})`],
              ['collections', `Encaissements (${k.cod.length})`],
              ['failures', `Échecs et litiges (${k.failed.length})`],
              ['cancellations', `Annulations (${k.cancelled.length + k.cancelledStops.length})`],
            ]}
          />
        </div>

        {tab === 'deliveries' && <DeliveriesTab deliveries={mine} q={q} setQ={setQ} status={status} setStatus={setStatus} onOpen={setOpen} />}
        {tab === 'recipients' && (
          <Card>
            {k.recipients.length === 0 ? <Empty icon="people">Aucun destinataire</Empty> : (
              <div className="table-scroll">
                <table className="list">
                  <thead><tr><th>Destinataire</th><th>Communes</th><th className="num">Colis</th><th className="num">Livrés</th><th className="num">Échecs</th><th>Dernier envoi</th></tr></thead>
                  <tbody>
                    {k.recipients.map((r) => (
                      <tr key={r.phone}>
                        <td>{r.name}<span className="sub">{r.phone}</span></td>
                        <td>{[...r.communes].join(', ')}</td>
                        <td className="num">{r.count}</td>
                        <td className="num">{r.delivered}</td>
                        <td className="num">{r.failed || <span className="muted">—</span>}</td>
                        <td>{dateTime(r.last)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
        {tab === 'collections' && <CollectionsTab cod={k.cod} />}
        {tab === 'failures' && (
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
                    <span className="muted">Livreur : {d.driver?.name ?? '—'} ({d.company?.name ?? '—'}) · {s.address} ({s.commune})</span>
                    <div style={{ marginLeft: -34 }}><FailureProof stop={s} onResolve={() => setResolve({ d, s })} /></div>
                    <div><button className="btn plain" style={{ paddingLeft: 0 }} onClick={() => setOpen(d)}>Voir la course</button></div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
        {tab === 'cancellations' && (
          <Card>
            {k.cancelled.length + k.cancelledStops.length === 0 ? <Empty icon="box">Aucune annulation</Empty> : (
              <div className="table-scroll">
                <table className="list">
                  <thead><tr><th>Date</th><th>Quoi</th><th>Par</th><th>Motif</th><th className="num">Frais</th><th /></tr></thead>
                  <tbody>
                    {[
                      ...k.cancelled.map((d) => ({ key: d.id, d, at: d.cancelledAt, what: `Course entière (${d.stops.length} arrêt${d.stops.length > 1 ? 's' : ''})`, by: d.cancelledBy, reason: d.cancelReason, fee: d.cancellationFee, settled: d.cancellationFeeSettledAt })),
                      ...k.cancelledStops.map(({ d, s }) => ({ key: s.id, d, at: s.cancelledAt, what: `Arrêt · ${s.recipientName}`, by: s.cancelledBy, reason: s.cancelReason, fee: null, settled: null })),
                    ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? '')).map((x) => (
                      <tr key={x.key} className="clickable" onClick={() => setOpen(x.d)}>
                        <td style={{ whiteSpace: 'nowrap' }}>{dateTime(x.at)}</td>
                        <td>{x.what}<span className="sub">{x.d.company?.name ?? 'Avant acceptation'}</span></td>
                        <td>{x.by ?? '—'}</td>
                        <td>{x.reason ?? <span className="muted">—</span>}</td>
                        <td className="num">{x.fee ? fcfa(x.fee) : <span className="muted">—</span>}</td>
                        <td>{x.fee ? (x.settled ? <Badge color="green">Réglés</Badge> : <Badge color="orange">À régler</Badge>) : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>

      {open && <DeliverySheet delivery={open} onClose={() => setOpen(null)} />}
      {resolve && <ResolveDialog delivery={resolve.d} stop={resolve.s} onClose={() => setResolve(null)} />}
    </>
  );
}

