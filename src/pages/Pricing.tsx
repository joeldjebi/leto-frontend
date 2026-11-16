import { useEffect, useState } from 'react';
import { api, dateTime, fcfa, PricingGrid, Speed, Vehicle } from '../api';
import { Card, Modal, PageHeader, Switch, useToast } from '../ui';

const VEHICLES: Vehicle[] = ['MOTO', 'CAR', 'CARGO'];
const SPEEDS: Speed[] = ['EXPRESS', 'STANDARD', 'SCHEDULED'];

/** Même formule que le serveur (pricing.ts) — pour la simulation en direct */
function price(g: PricingGrid, km: number, v: Vehicle, s: Speed, stops: number, cod: number) {
  const c = g.vehicles[v];
  const raw = (Math.max(c.min, c.base + c.perKm * km) + g.extraStopFee * Math.max(0, stops - 1)) * g.speeds[s].factor + g.codFee * cod;
  return Math.ceil(raw / 50) * 50;
}

/** Tarifs et règles de la plateforme (SA) */
export default function Pricing() {
  const toast = useToast();
  const [saved, setSaved] = useState<PricingGrid | null>(null);
  const [grid, setGrid] = useState<PricingGrid | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sim, setSim] = useState({ km: 6, stops: 1, cod: 0 });

  useEffect(() => {
    api<PricingGrid>('/admin/settings').then((g) => { setSaved(g); setGrid(g); });
  }, []);
  if (!grid || !saved) return <PageHeader title="Tarifs et règles" subtitle="Chargement…" />;

  const dirty = JSON.stringify({ ...grid, updatedAt: 0, updatedBy: 0 }) !== JSON.stringify({ ...saved, updatedAt: 0, updatedBy: 0 });
  const setVehicle = (v: Vehicle, patch: Partial<PricingGrid['vehicles'][Vehicle]>) =>
    setGrid({ ...grid, vehicles: { ...grid.vehicles, [v]: { ...grid.vehicles[v], ...patch } } });
  const setSpeed = (s: Speed, factor: number) => setGrid({ ...grid, speeds: { ...grid.speeds, [s]: { ...grid.speeds[s], factor } } });
  const num = (v: string) => (v === '' ? 0 : Number(v));

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const g = await api<PricingGrid>('/admin/settings', {
        method: 'PUT',
        body: { vehicles: grid.vehicles, speeds: grid.speeds, codFee: grid.codFee, extraStopFee: grid.extraStopFee, maxStops: grid.maxStops, absenceWaitMin: grid.absenceWaitMin },
      });
      setSaved(g);
      setGrid(g);
      toast('Tarifs enregistrés — appliqués aux nouvelles commandes');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    const g = await api<PricingGrid>('/admin/settings/reset', { method: 'POST' });
    setSaved(g);
    setGrid(g);
    setConfirmReset(false);
    toast('Valeurs par défaut rétablies');
  };

  return (
    <>
      <PageHeader
        title="Tarifs et règles"
        subtitle={saved.updatedAt ? `Modifié par ${saved.updatedBy} · ${dateTime(saved.updatedAt)}` : 'Valeurs par défaut'}
        actions={
          <>
            <button className="btn secondary" onClick={() => setConfirmReset(true)}>Valeurs par défaut</button>
            <button className="btn secondary" disabled={!dirty} onClick={() => setGrid(saved)}>Annuler</button>
            <button className="btn" disabled={!dirty || busy} onClick={save}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </>
        }
      />
      {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="stack">
        <Card title="Offres" pad>
          <p className="muted" style={{ marginTop: 0 }}>Prix = max(minimum, base + prix par km × distance) × coefficient du délai, arrondi aux 50 F supérieurs.</p>
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Offre</th><th>Nom affiché</th><th>Description</th><th className="num">Base (F)</th><th className="num">Par km (F)</th><th className="num">Minimum (F)</th><th>Active</th></tr></thead>
              <tbody>
                {VEHICLES.map((v) => {
                  const c = grid.vehicles[v];
                  return (
                    <tr key={v} style={{ opacity: c.enabled ? 1 : 0.55 }}>
                      <td><strong>{v === 'MOTO' ? 'Moto' : v === 'CAR' ? 'Voiture' : 'Cargo'}</strong></td>
                      <td><input value={c.label} onChange={(e) => setVehicle(v, { label: e.target.value })} style={{ width: 160 }} /></td>
                      <td><input value={c.description} onChange={(e) => setVehicle(v, { description: e.target.value })} style={{ width: 200 }} /></td>
                      <td className="num"><input type="number" min={0} step={50} value={c.base} onChange={(e) => setVehicle(v, { base: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /></td>
                      <td className="num"><input type="number" min={0} step={10} value={c.perKm} onChange={(e) => setVehicle(v, { perKm: num(e.target.value) })} style={{ width: 90, textAlign: 'right' }} /></td>
                      <td className="num"><input type="number" min={0} step={50} value={c.min} onChange={(e) => setVehicle(v, { min: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /></td>
                      <td><Switch checked={c.enabled} onChange={(on) => setVehicle(v, { enabled: on })} label={c.enabled ? 'Désactiver' : 'Activer'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-2">
          <Card title="Délais" pad>
            <div className="rows" style={{ margin: '0 -20px' }}>
              {SPEEDS.map((s) => (
                <div key={s}>
                  <div className="grow"><div className="title">{grid.speeds[s].label}</div><small className="muted">{grid.speeds[s].description}</small></div>
                  <span className="muted">×</span>
                  <input type="number" min={0.3} max={5} step={0.05} value={grid.speeds[s].factor} onChange={(e) => setSpeed(s, num(e.target.value))} style={{ width: 80, textAlign: 'right' }} aria-label={`Coefficient ${grid.speeds[s].label}`} />
                </div>
              ))}
            </div>
          </Card>

          <Card title="Règles" pad>
            <div className="rows" style={{ margin: '0 -20px' }}>
              <div>
                <div className="grow"><div className="title">Paiement à la livraison</div><small className="muted">Frais par arrêt où le livreur encaisse la marchandise</small></div>
                <input type="number" min={0} step={50} value={grid.codFee} onChange={(e) => setGrid({ ...grid, codFee: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">F</span>
              </div>
              <div>
                <div className="grow"><div className="title">Supplément par arrêt</div><small className="muted">Tournées : par adresse au-delà de la première</small></div>
                <input type="number" min={0} step={50} value={grid.extraStopFee} onChange={(e) => setGrid({ ...grid, extraStopFee: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">F</span>
              </div>
              <div>
                <div className="grow"><div className="title">Adresses maximum par tournée</div><small className="muted">De 1 à 10</small></div>
                <input type="number" min={1} max={10} value={grid.maxStops} onChange={(e) => setGrid({ ...grid, maxStops: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} />
              </div>
              <div>
                <div className="grow"><div className="title">Attente avant « destinataire absent »</div><small className="muted">Après l’arrivée du livreur, détectée par GPS</small></div>
                <input type="number" min={1} max={60} value={grid.absenceWaitMin} onChange={(e) => setGrid({ ...grid, absenceWaitMin: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">min</span>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Simulation" pad>
          <div className="toolbar">
            <label className="field"><span>Distance (km)</span><input type="number" min={0} step={0.5} value={sim.km} onChange={(e) => setSim({ ...sim, km: num(e.target.value) })} style={{ width: 110 }} /></label>
            <label className="field"><span>Arrêts</span><input type="number" min={1} max={10} value={sim.stops} onChange={(e) => setSim({ ...sim, stops: Math.max(1, num(e.target.value)) })} style={{ width: 90 }} /></label>
            <label className="field"><span>Dont paiement à la livraison</span><input type="number" min={0} max={sim.stops} value={sim.cod} onChange={(e) => setSim({ ...sim, cod: Math.min(sim.stops, num(e.target.value)) })} style={{ width: 90 }} /></label>
          </div>
          <table className="list">
            <thead><tr><th>Offre</th>{SPEEDS.map((s) => <th key={s} className="num">{grid.speeds[s].label}</th>)}</tr></thead>
            <tbody>
              {VEHICLES.filter((v) => grid.vehicles[v].enabled).map((v) => (
                <tr key={v}>
                  <td>{grid.vehicles[v].label}</td>
                  {SPEEDS.map((s) => {
                    const now = price(grid, sim.km, v, s, sim.stops, sim.cod);
                    const before = price(saved, sim.km, v, s, sim.stops, sim.cod);
                    return (
                      <td key={s} className="num">
                        <strong>{fcfa(now)}</strong>
                        {now !== before && <span className="sub">avant : {fcfa(before)}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {confirmReset && (
        <Modal title="Rétablir les valeurs par défaut ?" subtitle="Toutes les modifications de tarifs et de règles seront perdues." onClose={() => setConfirmReset(false)}
          footer={<><button className="btn secondary" onClick={() => setConfirmReset(false)}>Annuler</button><button className="btn danger" onClick={reset}>Rétablir</button></>} />
      )}
    </>
  );
}
