import { useMemo, useState } from 'react';
import { codTotal, dateTime, Delivery, downloadCsv, fcfa, SPEED_LABEL, STATUS_LABEL, VEHICLE_LABEL } from '../api';
import DeliverySheet from '../components/DeliverySheet';
import { useData } from '../data';
import { Card, Empty, Icon, PageHeader, Search, Segmented, StatusBadge } from '../ui';

type StatusFilter = 'all' | 'waiting' | 'active' | 'done' | 'cancelled';
type Period = 'today' | '7d' | '30d' | 'all';

const DAY = 86_400_000;

export default function Deliveries() {
  const { deliveries, companies, isSA } = useData();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [period, setPeriod] = useState<Period>('7d');
  const [company, setCompany] = useState('');
  const [open, setOpen] = useState<Delivery | null>(null);

  const rows = useMemo(() => {
    const since = period === 'today' ? new Date().setHours(0, 0, 0, 0) : period === '7d' ? Date.now() - 7 * DAY : period === '30d' ? Date.now() - 30 * DAY : 0;
    const needle = q.trim().toLowerCase();
    return deliveries.filter((d) => {
      if (new Date(d.createdAt).getTime() < since) return false;
      if (status === 'waiting' && d.status !== 'PENDING') return false;
      if (status === 'active' && d.status !== 'ACCEPTED' && d.status !== 'PICKED_UP') return false;
      if (status === 'done' && d.status !== 'DELIVERED') return false;
      if (status === 'cancelled' && d.status !== 'CANCELLED') return false;
      if (company && d.company?.id !== company) return false;
      if (!needle) return true;
      const hay = [d.id, d.client.name, d.client.phone, d.pickupAddress, d.pickupCommune, d.driver?.name, d.company?.name,
        ...d.stops.flatMap((s) => [s.recipientName, s.recipientPhone, s.address, s.commune])].join(' ').toLowerCase();
      return hay.includes(needle);
    });
  }, [deliveries, q, status, period, company]);

  const total = rows.filter((d) => d.status === 'DELIVERED').reduce((s, d) => s + d.price, 0);

  const exportCsv = () =>
    downloadCsv(`leto-courses-${new Date().toISOString().slice(0, 10)}.csv`, [
      ['Date', 'Référence', 'Statut', 'Client', 'Téléphone client', 'Départ', 'Arrêts', 'Destinataires', 'Livreur', 'Entreprise', 'Offre', 'Délai', 'Distance (km)', 'Prix (F)', 'À encaisser (F)'],
      ...rows.map((d) => [
        new Date(d.createdAt).toLocaleString('fr-FR'), d.id, STATUS_LABEL[d.status], d.client.name, d.client.phone,
        `${d.pickupAddress} (${d.pickupCommune})`, d.stops.length, d.stops.map((s) => s.recipientName).join(', '),
        d.driver?.name, d.company?.name, VEHICLE_LABEL[d.vehicleType], SPEED_LABEL[d.speed], d.distanceKm, d.price, codTotal(d),
      ]),
    ]);

  return (
    <>
      <PageHeader
        title="Courses"
        subtitle={`${rows.length} course(s) · ${fcfa(total)} de courses terminées`}
        actions={<button className="btn secondary" onClick={exportCsv} disabled={!rows.length}><Icon name="download" size={15} />Exporter</button>}
      />
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Client, destinataire, téléphone, adresse…" />
        <Segmented<StatusFilter> value={status} onChange={setStatus} options={[['all', 'Toutes'], ['waiting', 'En attente'], ['active', 'En cours'], ['done', 'Terminées'], ['cancelled', 'Annulées']]} />
        <span className="spacer" />
        {isSA && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Entreprise">
            <option value="">Toutes les entreprises</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <select value={period} onChange={(e) => setPeriod(e.target.value as Period)} aria-label="Période">
          <option value="today">Aujourd’hui</option>
          <option value="7d">7 derniers jours</option>
          <option value="30d">30 derniers jours</option>
          <option value="all">Tout</option>
        </select>
      </div>
      <Card>
        {rows.length === 0 ? <Empty>Aucune course pour ces filtres</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead>
                <tr>
                  <th>Date</th><th>Client</th><th>Trajet</th><th>Destinataires</th><th>Livreur</th>
                  <th className="num">Prix</th><th className="num">À encaisser</th><th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => setOpen(d)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dateTime(d.createdAt)}</td>
                    <td>{d.client.name}<span className="sub">{d.client.phone}</span></td>
                    <td>
                      {d.pickupCommune} → {d.stops.length > 1 ? `${d.stops.length} arrêts` : d.stops[0]?.commune}
                      <span className="sub">{VEHICLE_LABEL[d.vehicleType]} · {SPEED_LABEL[d.speed]}{d.distanceKm != null ? ` · ${d.distanceKm} km` : ''}</span>
                    </td>
                    <td>
                      {d.stops.slice(0, 2).map((s) => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                          <span className="dot" style={{ background: s.status === 'DELIVERED' ? 'var(--green)' : s.status === 'FAILED' ? 'var(--red)' : 'var(--fill-strong)' }} />
                          {s.recipientName}
                        </div>
                      ))}
                      {d.stops.length > 2 && <span className="sub">+ {d.stops.length - 2} autre(s)</span>}
                    </td>
                    <td>{d.driver?.name ?? <span className="muted">—</span>}{isSA && d.company && <span className="sub">{d.company.name}</span>}</td>
                    <td className="num">{fcfa(d.price)}</td>
                    <td className="num">{codTotal(d) ? fcfa(codTotal(d)) : <span className="muted">—</span>}</td>
                    <td><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <DeliverySheet delivery={open} onClose={() => setOpen(null)} />}
    </>
  );
}
