import { useEffect, useState } from 'react';
import { api, dateTime } from '../api';
import { Badge, Card, Empty, PageHeader, Stat } from '../ui';

interface Visit {
  id: string; createdAt: string; lastSeenAt: string | null;
  country: string | null; city: string | null; device: string; os: string | null; source: string | null;
  video: string; watchedSec: number; durationSec: number | null; returning: boolean;
}
interface Data { stats: { total: number; lastWeek: number; visitors: number; avgWatchedSec: number }; visits: Visit[] }

const country = (code: string | null) => {
  if (!code) return null;
  try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(code) ?? code; } catch { return code; }
};
const flag = (code: string | null) => (code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((c) => 127397 + c.charCodeAt(0))) : '');
const dur = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')}`);

/** Admin : visites de la page de présentation vidéo (quand, où, appareil, provenance, durée regardée) */
export default function VideoVisits() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api<Data>('/admin/video-visits').then((d) => { setData(d); setError(''); }).catch((e) => setError((e as Error).message));
    load();
    const t = window.setInterval(load, 20_000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <>
      <PageHeader title="Visites vidéo" subtitle={<>Ouvertures de la page <a href="https://leto.performx.online/video/" target="_blank" rel="noreferrer">leto.performx.online/video</a> : quand, d’où et combien de temps.</>} />
      {error && <div className="banner warn">{error}</div>}
      {data && (
        <div className="grid grid-stats" style={{ marginBottom: 16 }}>
          <Stat icon="play" label="Visites" value={data.stats.total} foot={`${data.stats.lastWeek} sur les 7 derniers jours`} />
          <Stat icon="people" label="Visiteurs différents" value={data.stats.visitors} foot="Même appareil et même réseau = un visiteur" />
          <Stat icon="clock" label="Durée regardée en moyenne" value={data.stats.avgWatchedSec ? dur(data.stats.avgWatchedSec) : '—'} foot="Parmi les visites où la vidéo a été lancée" />
        </div>
      )}
      <Card>
        {!data ? <Empty icon="play">Chargement…</Empty> : data.visits.length === 0 ? <Empty icon="play">Aucune visite pour l’instant. Elles apparaîtront ici dès que quelqu’un ouvrira le lien.</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Date et heure</th><th>Lieu</th><th>Appareil</th><th>Provenance</th><th className="num">Regardé</th></tr></thead>
              <tbody>
                {data.visits.map((v) => {
                  const where = [v.city, country(v.country)].filter(Boolean).join(', ');
                  const pct = v.durationSec ? Math.min(100, Math.round((v.watchedSec / v.durationSec) * 100)) : null;
                  return (
                    <tr key={v.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateTime(v.createdAt)}{v.returning && <> <Badge>Retour</Badge></>}</td>
                      <td>{where ? <>{flag(v.country)} {where}</> : <span className="muted">Inconnu</span>}</td>
                      <td>{v.device}{v.os && <span className="sub">{v.os}</span>}</td>
                      <td>{v.source ?? <span className="muted">—</span>}</td>
                      <td className="num">
                        {v.watchedSec ? dur(v.watchedSec) : <span className="muted">Pas lancée</span>}
                        {pct != null && v.watchedSec > 0 && <span className="sub">{pct} % de la vidéo</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        Le lieu est déduit de l’adresse IP, qui n’est pas conservée : c’est souvent le pays, parfois la ville. On ne peut pas savoir qui a ouvert le lien.
      </p>
    </>
  );
}
