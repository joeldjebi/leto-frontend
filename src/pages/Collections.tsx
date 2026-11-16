import { useMemo, useState } from 'react';
import { api, dateTime, fcfa } from '../api';
import { useData } from '../data';
import { Badge, Card, Empty, Modal, PageHeader, Segmented, Stat, useToast } from '../ui';

type Filter = 'pending' | 'remitted' | 'all';

/**
 * Paiement à la livraison : les livreurs encaissent la marchandise pour leur entreprise,
 * qui reverse ensuite aux boutiques. Le gérant marque les reversements ; le SA suit tout.
 */
export default function Collections() {
  const { deliveries, isSA, reload } = useData();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('pending');
  const [confirmRemit, setConfirmRemit] = useState<{ deliveryId: string; stopId: string; amount: number; name: string } | null>(null);

  const cod = useMemo(
    () => deliveries.flatMap((d) => d.stops.filter((s) => s.status === 'DELIVERED' && s.codAmount > 0).map((s) => ({ d, s })))
      .sort((a, b) => (b.s.deliveredAt ?? '').localeCompare(a.s.deliveredAt ?? '')),
    [deliveries],
  );
  const pending = cod.filter((x) => !x.s.codRemittedAt);
  const sum = (l: typeof cod) => l.reduce((t, x) => t + x.s.codAmount, 0);
  const rows = filter === 'pending' ? pending : filter === 'remitted' ? cod.filter((x) => x.s.codRemittedAt) : cod;

  // À reverser, regroupé par entreprise (SA) ou par boutique (gérant)
  const groups = useMemo(() => {
    const m = new Map<string, { name: string; sub: string; total: number; count: number }>();
    for (const { d, s } of pending) {
      const key = isSA ? d.company?.id ?? '—' : d.client.id;
      const g = m.get(key) ?? { name: isSA ? d.company?.name ?? '—' : d.client.name, sub: isSA ? d.company?.phone ?? '' : d.client.phone, total: 0, count: 0 };
      g.total += s.codAmount;
      g.count += 1;
      m.set(key, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [pending, isSA]);

  const remit = async () => {
    if (!confirmRemit) return;
    await api(`/deliveries/${confirmRemit.deliveryId}/stops/${confirmRemit.stopId}/cod-remitted`, { method: 'POST' });
    toast('Reversement enregistré');
    setConfirmRemit(null);
    reload();
  };

  return (
    <>
      <PageHeader title="Encaissements" subtitle="Paiements à la livraison encaissés par les livreurs" />
      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat icon="wallet" label="À reverser" value={fcfa(sum(pending))} foot={`${pending.length} colis`} />
        <Stat icon="check" label="Déjà reversé" value={fcfa(sum(cod) - sum(pending))} foot={`${cod.length - pending.length} colis`} />
        <Stat icon="box" label="Total encaissé" value={fcfa(sum(cod))} foot="toutes périodes" />
      </div>
      <div className="stack">
        <Card title={isSA ? 'À reverser, par entreprise' : 'À reverser, par boutique'}>
          {groups.length === 0 ? <Empty icon="wallet">Rien à reverser</Empty> : (
            <div className="rows">
              {groups.map((g) => (
                <div key={g.name}>
                  <div className="grow"><div className="title">{g.name}</div><small className="muted">{g.sub}</small></div>
                  <span className="muted tabular">{g.count} colis</span>
                  <strong className="tabular">{fcfa(g.total)}</strong>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Détail" actions={<Segmented<Filter> value={filter} onChange={setFilter} options={[['pending', 'À reverser'], ['remitted', 'Reversés'], ['all', 'Tous']]} />}>
          {rows.length === 0 ? <Empty icon="wallet">Aucun encaissement</Empty> : (
            <div className="table-scroll">
              <table className="list">
                <thead>
                  <tr><th>Livré le</th><th>Boutique</th><th>Destinataire</th><th>Livreur</th>{isSA && <th>Entreprise</th>}<th className="num">Montant</th><th>Statut</th>{!isSA && <th />}</tr>
                </thead>
                <tbody>
                  {rows.map(({ d, s }) => (
                    <tr key={s.id}>
                      <td>{dateTime(s.deliveredAt)}</td>
                      <td>{d.client.name}<span className="sub">{d.client.phone}</span></td>
                      <td>{s.recipientName}<span className="sub">{s.commune}</span></td>
                      <td>{d.driver?.name ?? '—'}</td>
                      {isSA && <td>{d.company?.name ?? '—'}</td>}
                      <td className="num">{fcfa(s.codAmount)}</td>
                      <td>{s.codRemittedAt ? <Badge color="green">Reversé le {new Date(s.codRemittedAt).toLocaleDateString('fr-FR')}</Badge> : <Badge color="orange">À reverser</Badge>}</td>
                      {!isSA && <td>{!s.codRemittedAt && <button className="btn plain" onClick={() => setConfirmRemit({ deliveryId: d.id, stopId: s.id, amount: s.codAmount, name: d.client.name })}>Marquer reversé</button>}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {confirmRemit && (
        <Modal title="Confirmer le reversement" subtitle={`${fcfa(confirmRemit.amount)} reversé à ${confirmRemit.name}.`} onClose={() => setConfirmRemit(null)}
          footer={<><button className="btn secondary" onClick={() => setConfirmRemit(null)}>Annuler</button><button className="btn" onClick={remit}>Confirmer</button></>} />
      )}
    </>
  );
}
