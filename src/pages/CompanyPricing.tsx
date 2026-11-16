import { useEffect, useState } from 'react';
import { api, fcfa, PricingGrid, Speed, Vehicle, VEHICLE_LABEL } from '../api';
import { Badge, Card, Modal, PageHeader, Switch, useToast } from '../ui';

interface CompanyPricingData { custom: Partial<PricingGrid> | null; effective: PricingGrid; platform: PricingGrid }
const VEHICLES: Vehicle[] = ['MOTO', 'CAR', 'CARGO'];
const SPEEDS: Speed[] = ['EXPRESS', 'STANDARD', 'SCHEDULED'];

/** Même formule que le serveur (pricing.ts) */
function price(g: PricingGrid, km: number, v: Vehicle, s: Speed, stops: number) {
  const c = g.vehicles[v];
  const raw = (Math.max(c.min, c.base + c.perKm * km) + g.extraStopFee * Math.max(0, stops - 1)) * g.speeds[s].factor;
  return Math.ceil(raw / 50) * 50;
}

/** Gérant : grille tarifaire de l'entreprise (prix libres ; sinon grille LETO) */
export default function CompanyPricing() {
  const toast = useToast();
  const [data, setData] = useState<CompanyPricingData | null>(null);
  const [grid, setGrid] = useState<PricingGrid | null>(null);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [km, setKm] = useState(5);
  const load = (d: CompanyPricingData) => { setData(d); setGrid(structuredClone(d.effective)); };
  useEffect(() => { api<CompanyPricingData>('/companies/me/pricing').then(load); }, []);
  if (!data || !grid) return <PageHeader title="Mes tarifs" subtitle="Chargement…" />;

  const dirty = JSON.stringify(grid) !== JSON.stringify(data.effective);
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const setVehicle = (v: Vehicle, patch: Partial<PricingGrid['vehicles'][Vehicle]>) =>
    setGrid({ ...grid, vehicles: { ...grid.vehicles, [v]: { ...grid.vehicles[v], ...patch } } });

  const save = async () => {
    setError('');
    try {
      load(await api<CompanyPricingData>('/companies/me/pricing', {
        method: 'PUT',
        body: { vehicles: grid.vehicles, speeds: grid.speeds, extraStopFee: grid.extraStopFee, codFee: grid.codFee },
      }));
      toast('Tarifs enregistrés — appliqués aux prochaines commandes adressées à votre entreprise');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const reset = async () => {
    load(await api<CompanyPricingData>('/companies/me/pricing', { method: 'DELETE' }));
    setConfirmReset(false);
    toast('Grille LETO rétablie');
  };

  return (
    <>
      <PageHeader
        title="Mes tarifs"
        subtitle={<>{data.custom ? <Badge color="purple">Grille propre</Badge> : <Badge>Grille LETO</Badge>} Prix appliqués quand une boutique choisit votre entreprise et pour les courses que vous créez.</>}
        actions={<>
          {data.custom && <button className="btn secondary" onClick={() => setConfirmReset(true)}>Revenir à la grille LETO</button>}
          <button className="btn secondary" disabled={!dirty} onClick={() => setGrid(structuredClone(data.effective))}>Annuler</button>
          <button className="btn" disabled={!dirty} onClick={save}>Enregistrer</button>
        </>}
      />
      {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}
      <div className="stack">
        <Card title="Engins" pad>
          <p className="muted" style={{ marginTop: 0 }}>Prix = max(minimum, base + prix par km × distance) × coefficient du délai, arrondi aux 50 F supérieurs.</p>
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Engin</th><th className="num">Base (F)</th><th className="num">Par km (F)</th><th className="num">Minimum (F)</th><th className="num">Grille LETO</th><th>Proposé</th></tr></thead>
              <tbody>
                {VEHICLES.map((v) => {
                  const c = grid.vehicles[v], p = data.platform.vehicles[v];
                  return (
                    <tr key={v} style={{ opacity: c.enabled ? 1 : 0.55 }}>
                      <td><strong>{VEHICLE_LABEL[v]}</strong></td>
                      <td className="num"><input type="number" min={0} step={50} value={c.base} onChange={(e) => setVehicle(v, { base: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /></td>
                      <td className="num"><input type="number" min={0} step={10} value={c.perKm} onChange={(e) => setVehicle(v, { perKm: num(e.target.value) })} style={{ width: 90, textAlign: 'right' }} /></td>
                      <td className="num"><input type="number" min={0} step={50} value={c.min} onChange={(e) => setVehicle(v, { min: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /></td>
                      <td className="num muted">{fcfa(p.base)} + {fcfa(p.perKm)}/km · min {fcfa(p.min)}</td>
                      <td><Switch checked={c.enabled} onChange={(on) => setVehicle(v, { enabled: on })} label={c.enabled ? 'Ne plus proposer' : 'Proposer'} /></td>
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
                  <div className="grow"><div className="title">{grid.speeds[s].label}</div><small className="muted">LETO : × {data.platform.speeds[s].factor}</small></div>
                  <span className="muted">×</span>
                  <input type="number" min={0.3} max={5} step={0.05} value={grid.speeds[s].factor} onChange={(e) => setGrid({ ...grid, speeds: { ...grid.speeds, [s]: { ...grid.speeds[s], factor: num(e.target.value) } } })} style={{ width: 80, textAlign: 'right' }} aria-label={`Coefficient ${grid.speeds[s].label}`} />
                </div>
              ))}
              <div>
                <div className="grow"><div className="title">Supplément par arrêt</div><small className="muted">Tournées · LETO : {fcfa(data.platform.extraStopFee)}</small></div>
                <input type="number" min={0} step={50} value={grid.extraStopFee} onChange={(e) => setGrid({ ...grid, extraStopFee: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">F</span>
              </div>
            </div>
          </Card>
          <Card title="Aperçu" pad>
            <label className="field" style={{ marginBottom: 12 }}><span>Distance (km)</span><input type="number" min={0} step={0.5} value={km} onChange={(e) => setKm(num(e.target.value))} style={{ width: 110 }} /></label>
            <table className="list">
              <thead><tr><th>Engin</th>{SPEEDS.map((s) => <th key={s} className="num">{grid.speeds[s].label}</th>)}</tr></thead>
              <tbody>
                {VEHICLES.filter((v) => grid.vehicles[v].enabled).map((v) => (
                  <tr key={v}>
                    <td>{VEHICLE_LABEL[v]}</td>
                    {SPEEDS.map((s) => <td key={s} className="num"><strong>{fcfa(price(grid, km, v, s, 1))}</strong><span className="sub">LETO {fcfa(price(data.platform, km, v, s, 1))}</span></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
      {confirmReset && (
        <Modal title="Revenir à la grille LETO ?" subtitle="Vos prix seront remplacés par ceux de LETO pour les prochaines commandes." onClose={() => setConfirmReset(false)}
          footer={<><button className="btn secondary" onClick={() => setConfirmReset(false)}>Annuler</button><button className="btn danger" onClick={reset}>Rétablir</button></>} />
      )}
    </>
  );
}
