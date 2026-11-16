import { useMemo, useState } from 'react';
import { dateTime, Delivery, FAILURE_LABEL, Stop } from '../api';
import DeliverySheet, { FailureProof, ResolveDialog } from '../components/DeliverySheet';
import { useData } from '../data';
import { Badge, Card, Empty, PageHeader, Segmented } from '../ui';

type Filter = 'open' | 'resolved' | 'failures';

/** Échecs de livraison et contestations des expéditeurs, avec les preuves du livreur */
export default function Disputes() {
  const { deliveries } = useData();
  const [filter, setFilter] = useState<Filter>('open');
  const [resolve, setResolve] = useState<{ d: Delivery; s: Stop } | null>(null);
  const [open, setOpen] = useState<Delivery | null>(null);

  const failed = useMemo(
    () => deliveries.flatMap((d) => d.stops.filter((s) => s.status === 'FAILED').map((s) => ({ d, s })))
      .sort((a, b) => (b.s.disputedAt ?? b.s.failedAt ?? '').localeCompare(a.s.disputedAt ?? a.s.failedAt ?? '')),
    [deliveries],
  );
  const openCount = failed.filter((x) => x.s.disputedAt && !x.s.disputeResolvedAt).length;
  const rows = failed.filter(({ s }) =>
    filter === 'open' ? s.disputedAt && !s.disputeResolvedAt : filter === 'resolved' ? !!s.disputeResolvedAt : true);

  return (
    <>
      <PageHeader title="Litiges" subtitle={`${openCount} contestation(s) à trancher · ${failed.length} échec(s) de livraison`} />
      <div className="toolbar">
        <Segmented<Filter> value={filter} onChange={setFilter} options={[['open', `À trancher (${openCount})`], ['resolved', 'Tranchés'], ['failures', 'Tous les échecs']]} />
      </div>
      {rows.length === 0 ? (
        <Card><Empty icon="shield">{filter === 'open' ? 'Aucune contestation en attente' : 'Rien à afficher'}</Empty></Card>
      ) : (
        <div className="stack">
          {rows.map(({ d, s }) => (
            <Card key={s.id}>
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15 }}>{FAILURE_LABEL[s.failureReason!]} · {s.recipientName}</strong>
                  {s.disputedAt && !s.disputeResolvedAt && <Badge color="red">À trancher</Badge>}
                  {s.disputeResolvedAt && <Badge color={s.disputeDecision === 'UPHELD' ? 'orange' : 'green'}>{s.disputeDecision === 'UPHELD' ? 'Raison au client' : 'Raison au livreur'}</Badge>}
                  {!s.disputedAt && <Badge>Non contesté</Badge>}
                  <span className="muted" style={{ marginLeft: 'auto' }}>{dateTime(s.failedAt)}</span>
                </div>
                <span className="muted">
                  Expéditeur : {d.client.name} · Livreur : {d.driver?.name ?? '—'}{d.company ? ` (${d.company.name})` : ''} · {s.address} ({s.commune})
                </span>
                <div style={{ marginLeft: -34 }}><FailureProof stop={s} onResolve={() => setResolve({ d, s })} /></div>
                <div><button className="btn plain" style={{ paddingLeft: 0 }} onClick={() => setOpen(d)}>Voir la course</button></div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {resolve && <ResolveDialog delivery={resolve.d} stop={resolve.s} onClose={() => setResolve(null)} />}
      {open && <DeliverySheet delivery={open} onClose={() => setOpen(null)} />}
    </>
  );
}
