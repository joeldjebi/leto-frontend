import { useEffect, useState } from 'react';
import { api, COMMUNES, dateTime, PricingGrid, SurchargeRules } from '../api';
import { Card, Segmented, Switch } from '../ui';

interface SurchargeNow {
  weather: { mm: number | null; raining: boolean; checkedAt: string | null; error: string | null };
  raining: boolean;
  now: { items: { key: string; label: string; pct: number }[]; pct: number };
}

const num = (v: string) => (v === '' ? 0 : Number(v));

/**
 * Tournées (réduction par arrêt) et majorations : heures de pointe (embouteillages), nuit,
 * pluie (météo en direct ou forcée) et communes inondables. Fait partie de la grille « Tarifs et règles ».
 */
export default function SurchargeSettings({ grid, setGrid }: { grid: PricingGrid; setGrid: (g: PricingGrid) => void }) {
  const [now, setNow] = useState<SurchargeNow | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sc = grid.surcharges;
  const set = (patch: Partial<SurchargeRules>) => setGrid({ ...grid, surcharges: { ...sc, ...patch } });

  useEffect(() => {
    const load = () => api<SurchargeNow>('/admin/surcharges').then(setNow).catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  const refresh = async () => {
    setRefreshing(true);
    try { setNow(await api<SurchargeNow>('/admin/surcharges/refresh', { method: 'POST' })); } finally { setRefreshing(false); }
  };

  const example = (n: number) => Math.min(grid.multiStopDiscountMaxPct, grid.multiStopDiscountPct * (n - 1));

  return (
    <div className="grid grid-2">
      <Card title="Tournées : plus d’arrêts, moins cher" pad>
        <p className="muted" style={{ marginTop: 0 }}>Réduction sur le prix total d’une tournée, pour chaque adresse au-delà de la première.</p>
        <div className="rows" style={{ margin: '0 -20px' }}>
          <div>
            <div className="grow"><div className="title">Réduction par arrêt supplémentaire</div></div>
            <input type="number" min={0} max={50} step={1} value={grid.multiStopDiscountPct} onChange={(e) => setGrid({ ...grid, multiStopDiscountPct: num(e.target.value) })} style={{ width: 80, textAlign: 'right' }} /><span className="muted">%</span>
          </div>
          <div>
            <div className="grow"><div className="title">Réduction maximum</div></div>
            <input type="number" min={0} max={80} step={1} value={grid.multiStopDiscountMaxPct} onChange={(e) => setGrid({ ...grid, multiStopDiscountMaxPct: num(e.target.value) })} style={{ width: 80, textAlign: 'right' }} /><span className="muted">%</span>
          </div>
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          {[2, 3, 4, 6, 10].map((n) => <span key={n} className="pf down">{n} adresses : −{example(n)} %</span>)}
        </div>
      </Card>

      <Card title="Majorations : heure, météo, inondations" pad>
        <div className="weather">
          <span style={{ fontSize: 22 }} aria-hidden>{now?.raining ? '🌧️' : '☀️'}</span>
          <div className="grow">
            <strong>{now ? (now.raining ? 'Il pleut à Abidjan : majoration pluie active' : 'Pas de pluie : pas de majoration pluie') : 'Météo…'}</strong>
            <small className="muted" style={{ display: 'block' }}>
              {now?.weather.checkedAt ? `${now.weather.mm ?? 0} mm sur la dernière heure · mesuré le ${dateTime(now.weather.checkedAt)}` : 'Météo en direct (Open-Meteo)'}
              {now?.weather.error && ` · erreur : ${now.weather.error}`}
              {now && ` · maintenant : ${now.now.items.length ? now.now.items.map((i) => `${i.label} +${i.pct} %`).join(', ') : 'aucune majoration'}`}
            </small>
          </div>
          <button className="btn secondary" onClick={refresh} disabled={refreshing}>{refreshing ? '…' : 'Actualiser'}</button>
        </div>
        <div className="rows" style={{ margin: '0 -20px' }}>
          <div>
            <div className="grow"><div className="title">Heures de pointe (embouteillages)</div><small className="muted">Lundi au samedi · plages « HH:MM-HH:MM », séparées par des virgules</small></div>
            <input value={sc.rushRanges.join(', ')} onChange={(e) => set({ rushRanges: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} style={{ width: 190 }} disabled={!sc.rushEnabled} aria-label="Plages des heures de pointe" />
            <input type="number" min={0} max={100} value={sc.rushPct} onChange={(e) => set({ rushPct: num(e.target.value) })} style={{ width: 64, textAlign: 'right' }} disabled={!sc.rushEnabled} aria-label="Majoration heures de pointe" /><span className="muted">%</span>
            <Switch checked={sc.rushEnabled} onChange={(on) => set({ rushEnabled: on })} label={sc.rushEnabled ? 'Désactiver' : 'Activer'} />
          </div>
          <div>
            <div className="grow"><div className="title">Nuit</div><small className="muted">Tous les jours</small></div>
            <input value={sc.nightRange} onChange={(e) => set({ nightRange: e.target.value })} style={{ width: 120 }} disabled={!sc.nightEnabled} aria-label="Plage de nuit" />
            <input type="number" min={0} max={100} value={sc.nightPct} onChange={(e) => set({ nightPct: num(e.target.value) })} style={{ width: 64, textAlign: 'right' }} disabled={!sc.nightEnabled} aria-label="Majoration de nuit" /><span className="muted">%</span>
            <Switch checked={sc.nightEnabled} onChange={(on) => set({ nightEnabled: on })} label={sc.nightEnabled ? 'Désactiver' : 'Activer'} />
          </div>
          <div>
            <div className="grow"><div className="title">Pluie</div><small className="muted">Automatique : dès {sc.rainThresholdMm} mm de pluie sur la dernière heure</small></div>
            <Segmented<SurchargeRules['rainMode']> value={sc.rainMode} onChange={(m) => set({ rainMode: m })} options={[['AUTO', 'Météo'], ['ON', 'Forcée'], ['OFF', 'Jamais']]} />
            <input type="number" min={0} max={100} value={sc.rainPct} onChange={(e) => set({ rainPct: num(e.target.value) })} style={{ width: 64, textAlign: 'right' }} aria-label="Majoration pluie" /><span className="muted">%</span>
          </div>
          <div>
            <div className="grow"><div className="title">Seuil de pluie</div><small className="muted">Pour le mode Météo</small></div>
            <input type="number" min={0.1} max={50} step={0.5} value={sc.rainThresholdMm} onChange={(e) => set({ rainThresholdMm: num(e.target.value) })} style={{ width: 80, textAlign: 'right' }} /><span className="muted">mm</span>
          </div>
          <div style={{ flexWrap: 'wrap' }}>
            <div className="grow"><div className="title">Zones inondables</div><small className="muted">Quand il pleut, en plus, si le trajet touche une de ces communes</small></div>
            <input type="number" min={0} max={100} value={sc.floodPct} onChange={(e) => set({ floodPct: num(e.target.value) })} style={{ width: 64, textAlign: 'right' }} aria-label="Majoration zone inondable" /><span className="muted">%</span>
            <div className="chips" style={{ flexBasis: '100%' }}>
              {COMMUNES.map((c) => {
                const on = sc.floodCommunes.includes(c);
                return <button key={c} className={`chip${on ? ' on' : ''}`} onClick={() => set({ floodCommunes: on ? sc.floodCommunes.filter((x) => x !== c) : [...sc.floodCommunes, c] })}>{c}</button>;
              })}
            </div>
          </div>
          <div>
            <div className="grow"><div className="title">Majorations au-dessus du prix maximum</div><small className="muted">Désactivé : le prix maximum du Grand Abidjan reste la limite, même sous la pluie ou la nuit</small></div>
            <Switch checked={sc.aboveCap} onChange={(on) => set({ aboveCap: on })} label={sc.aboveCap ? 'Désactiver' : 'Activer'} />
          </div>
        </div>
      </Card>
    </div>
  );
}
