import { useEffect, useState } from 'react';
import { api, dateTime, DriverRatings, errText, RATING_TAG_LABEL, stars } from '../api';
import { Badge, Empty } from '../ui';

/** Avis des clients : moyenne générale, moyenne récente (fenêtre du SA), répartition, derniers avis */
export function RatingSummary({ driverId, withList = false }: { driverId: string; withList?: boolean }) {
  const [r, setR] = useState<DriverRatings | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api<DriverRatings>(`/deliveries/driver-ratings/${driverId}`).then(setR).catch((e) => setError(errText(e)));
  }, [driverId]);
  if (error) return <div className="alert error">{error}</div>;
  if (!r) return null;
  if (!r.count) return <Empty icon="check">Aucun avis de client pour l’instant</Empty>;
  const max = Math.max(1, ...r.distribution);
  const recentLow = r.recent.avg != null && r.recent.avg < 3.5;
  return (
    <div className="rating-summary">
      <div className="rating-head">
        <div>
          <div className="rating-big">{r.avg != null ? Number(r.avg).toFixed(1) : '—'}<span>★</span></div>
          <small className="muted">{r.count} avis au total</small>
        </div>
        <div>
          <div className="title">Récemment : {r.recent.avg != null ? `${r.recent.avg.toFixed(1)}★` : '—'} {recentLow && <Badge color="red">Basse</Badge>}</div>
          <small className="muted">Sur les {r.recent.n} dernières courses notées{r.recent.low ? ` · ${r.recent.low} note(s) à 1-2★ sur les 10 dernières` : ''}</small>
        </div>
      </div>
      <div className="rating-bars" aria-label="Répartition des notes">
        {[5, 4, 3, 2, 1].map((s) => (
          <div key={s}>
            <span>{s}★</span>
            <div className="bar"><div style={{ width: `${(r.distribution[s - 1] / max) * 100}%`, background: s >= 4 ? 'var(--green)' : s === 3 ? '#FBC02D' : 'var(--orange)' }} /></div>
            <span className="muted">{r.distribution[s - 1]}</span>
          </div>
        ))}
      </div>
      {withList && (
        <ul className="rating-list">
          {r.items.slice(0, 20).map((x) => (
            <li key={x.deliveryId}>
              <span style={{ color: x.rating >= 4 ? 'var(--green)' : 'var(--orange)' }} aria-label={`${x.rating} sur 5`}>{stars(x.rating)}</span>
              <div>
                {x.tags?.length ? <div>{x.tags.map((t) => RATING_TAG_LABEL[t] ?? t).join(', ')}</div> : null}
                {x.comment && <div className="muted">« {x.comment} »</div>}
                <small className="muted">{x.clientName ?? 'Client'} · {dateTime(x.ratedAt)}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
