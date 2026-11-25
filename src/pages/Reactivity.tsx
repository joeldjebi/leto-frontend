import { useEffect, useState } from 'react';
import { api } from '../api';
import { Badge, Card, Empty, PageHeader, Stat } from '../ui';

interface Row {
  id: string; name: string; company: string | null; vehicleType: string | null;
  alerts: number; accepted: number; proposed: number; declined: number; expired: number; taken: number;
  duringCourse: number; reactionMs: number | null; delivered: number;
}
interface Data { days: number; totals: { alerts: number; accepted: number; declined: number; expired: number }; drivers: Row[] }

const PERIODS = [[7, '7 jours'], [30, '30 jours'], [90, '3 mois']] as const;
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);
const secs = (ms: number | null) => (ms == null ? '—' : ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}`);

/** Réactivité des livreurs : alertes « nouvelle course » reçues et ce qu'ils en ont fait */
export default function Reactivity({ superAdmin }: { superAdmin: boolean }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    api<Data>(`/deliveries/driver-stats?days=${days}`).then((d) => { setData(d); setError(''); }).catch((e) => setError((e as Error).message));
  }, [days]);

  const t = data?.totals;
  // Les alertes « prises par un autre livreur » ne comptent pas contre le livreur
  const answerable = (r: Row) => r.alerts - r.taken;
  return (
    <>
      <PageHeader
        title="Réactivité des livreurs"
        subtitle="Alertes « nouvelle course » reçues par chaque livreur, et ce qu’il en a fait."
        actions={
          <div className="chips">
            {PERIODS.map(([n, l]) => <button key={n} className={`chip${days === n ? ' on' : ''}`} onClick={() => setDays(n)}>{l}</button>)}
          </div>
        }
      />
      {error && <div className="banner warn">{error}</div>}
      {t && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <Stat icon="bell" label="Alertes envoyées" value={t.alerts} foot={`Sur ${data!.days} jours`} />
          <Stat icon="check" label="Acceptées" value={t.alerts ? `${pct(t.accepted, t.alerts)} %` : '—'} foot={`${t.accepted} course${t.accepted > 1 ? 's' : ''}`} />
          <Stat icon="close" label="Refusées" value={t.declined} foot="Bouton « Refuser » de l’alerte" />
          <Stat icon="clock" label="Sans réponse" value={t.expired} foot="Alerte laissée sans réponse jusqu’à la fin" />
        </div>
      )}
      <Card>
        {!data ? <Empty icon="bike">Chargement…</Empty> : data.drivers.length === 0 ? <Empty icon="bike">Aucune alerte sur cette période.</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead>
                <tr>
                  <th>Livreur</th>
                  <th className="num">Alertes</th>
                  <th className="num">Acceptées</th>
                  <th className="num">Prix proposé</th>
                  <th className="num">Refusées</th>
                  <th className="num">Sans réponse</th>
                  <th className="num">Temps de réaction</th>
                  <th className="num">Livrées</th>
                </tr>
              </thead>
              <tbody>
                {data.drivers.map((r) => {
                  const rate = pct(r.accepted + r.proposed, answerable(r));
                  const missed = pct(r.expired, answerable(r));
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        <span className="sub">
                          {[superAdmin ? r.company : null, r.duringCourse ? `${r.duringCourse} pendant une course` : null].filter(Boolean).join(' · ') || ' '}
                        </span>
                      </td>
                      <td className="num">{r.alerts}{r.taken > 0 && <span className="sub">dont {r.taken} prise{r.taken > 1 ? 's' : ''} par un autre</span>}</td>
                      <td className="num">
                        {r.accepted}
                        {rate != null && <> <Badge color={rate >= 50 ? 'green' : rate >= 20 ? 'orange' : 'red'}>{rate} %</Badge></>}
                      </td>
                      <td className="num">{r.proposed || <span className="muted">0</span>}</td>
                      <td className="num">{r.declined || <span className="muted">0</span>}</td>
                      <td className="num">{r.expired || <span className="muted">0</span>}{missed != null && missed >= 30 && <span className="sub" style={{ color: 'var(--red)' }}>{missed} % des alertes</span>}</td>
                      <td className="num">{secs(r.reactionMs)}</td>
                      <td className="num">{r.delivered}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        Taux d’acceptation : courses acceptées ou prix proposé, sur les alertes auxquelles le livreur pouvait répondre (sans celles prises entre-temps par un autre).
        Temps de réaction : délai médian entre l’alerte et la réponse.
      </p>
    </>
  );
}
