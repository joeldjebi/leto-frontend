import { useState } from 'react';
import { Delivery, fcfa, Status, STATUS_LABEL } from '../api';

export default function DeliveriesTable({ deliveries, showCompany = false }: { deliveries: Delivery[]; showCompany?: boolean }) {
  const [filter, setFilter] = useState<Status | ''>('');
  const rows = filter ? deliveries.filter((d) => d.status === filter) : deliveries;

  return (
    <div>
      <select value={filter} onChange={(e) => setFilter(e.target.value as Status | '')}>
        <option value="">Tous les statuts</option>
        {Object.entries(STATUS_LABEL).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Trajet</th><th>Client</th><th>Destinataire</th>
              <th>Livreur</th>{showCompany && <th>Entreprise</th>}<th>Prix</th><th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td>{new Date(d.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                <td>{d.pickupCommune} → {d.dropoffCommune}</td>
                <td>{d.client.name}<br /><small>{d.client.phone}</small></td>
                <td>{d.recipientName}<br /><small>{d.recipientPhone}</small></td>
                <td>{d.driver?.name ?? '—'}</td>
                {showCompany && <td>{d.company?.name ?? '—'}</td>}
                <td>{fcfa(d.price)}</td>
                <td><span className={`badge ${d.status}`}>{STATUS_LABEL[d.status]}</span></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="muted center">Aucune course</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
