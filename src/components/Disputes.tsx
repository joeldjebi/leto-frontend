import { API_URL, Delivery, FAILURE_LABEL, Stop } from '../api';

/**
 * Échecs de livraison et contestations.
 * Preuves du livreur : arrivée détectée par GPS, durée d'attente, photo du lieu, position au signalement.
 */
export default function Disputes({ deliveries }: { deliveries: Delivery[] }) {
  const failed = deliveries
    .flatMap((d) => d.stops.filter((s) => s.status === 'FAILED').map((s) => ({ d, s })))
    .sort((a, b) => Number(!!b.s.disputedAt) - Number(!!a.s.disputedAt) || (b.s.failedAt ?? '').localeCompare(a.s.failedAt ?? ''));
  const disputed = failed.filter((x) => x.s.disputedAt).length;

  const waited = (s: Stop) =>
    s.arrivedAt && s.failedAt ? Math.round((new Date(s.failedAt).getTime() - new Date(s.arrivedAt).getTime()) / 60000) : null;

  return (
    <>
      <p className="muted">
        {failed.length} échec(s) de livraison · <strong>{disputed} contesté(s)</strong> par l'expéditeur
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th><th>Motif</th><th>Expéditeur</th><th>Destinataire</th><th>Livreur</th>
              <th>Preuves</th><th>Photo</th><th>Contestation</th>
            </tr>
          </thead>
          <tbody>
            {failed.map(({ d, s }) => (
              <tr key={s.id}>
                <td>{s.failedAt ? new Date(s.failedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                <td>{s.failureReason ? FAILURE_LABEL[s.failureReason] : '—'}{s.failureNote && <><br /><small>« {s.failureNote} »</small></>}</td>
                <td>{d.client.name}<br /><small>{d.client.phone}</small></td>
                <td>{s.recipientName}<br /><small>{s.recipientPhone} · {s.address}</small></td>
                <td>{d.driver?.name ?? '—'}<br /><small>{d.company?.name ?? ''}</small></td>
                <td>
                  <small>
                    Arrivée GPS : {s.arrivedAt ? new Date(s.arrivedAt).toLocaleTimeString('fr-FR', { timeStyle: 'short' }) : 'non détectée'}
                    <br />Attente : {waited(s) != null ? `${waited(s)} min` : '—'}
                    <br />
                    {s.failureLat != null && (
                      <a href={`https://www.openstreetmap.org/?mlat=${s.failureLat}&mlon=${s.failureLng}#map=18/${s.failureLat}/${s.failureLng}`} target="_blank" rel="noreferrer">
                        Position au signalement
                      </a>
                    )}
                  </small>
                </td>
                <td>
                  {s.failurePhotoUrl && (
                    <a href={API_URL + s.failurePhotoUrl} target="_blank" rel="noreferrer">
                      <img className="photo-thumb" src={API_URL + s.failurePhotoUrl} alt="Photo du lieu" />
                    </a>
                  )}
                </td>
                <td>
                  {s.disputedAt ? (
                    <>
                      <span className="tag">Contesté</span>
                      {s.disputeNote && <><br /><small>« {s.disputeNote} »</small></>}
                    </>
                  ) : (
                    <span className="tag ok">Non contesté</span>
                  )}
                </td>
              </tr>
            ))}
            {failed.length === 0 && <tr><td colSpan={8} className="muted center">Aucun échec de livraison</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
