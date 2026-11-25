import { useEffect, useState } from 'react';
import { api, capFromKm, computePrice, PricingGrid, Speed, Vehicle, VEHICLE_LABEL, errText } from '../api';
import { formatMoney, currencySymbol } from '../countries';
import { Badge, Icon, Modal, Switch, useToast } from '../ui';

interface CompanyPricingData { custom: Partial<PricingGrid> | null; effective: PricingGrid; platform: PricingGrid; vehicles: Vehicle[] }
const VEHICLES: Vehicle[] = ['MOTO', 'CAR', 'CARGO'];
const SPEEDS: Speed[] = ['EXPRESS', 'STANDARD', 'SCHEDULED'];
const VEHICLE_ICON: Record<Vehicle, string> = { MOTO: 'moto', CAR: 'car', CARGO: 'truck' };
const VEHICLE_HINT: Record<Vehicle, string> = { MOTO: 'Petits colis, documents', CAR: 'Colis moyens ou fragiles', CARGO: 'Gros volumes' };

const SPEED_SHORT: Record<Speed, string> = { EXPRESS: 'Express', STANDARD: 'Standard', SCHEDULED: '2 h' };

/** Montant éditable, avec la valeur LETO en repère */
function Amount({ label, value, platform, step, onChange, suffix }: { label: string; value: number; platform: number; step: number; onChange: (n: number) => void; suffix?: string }) {
  const diff = value - platform;
  return (
    <label className="cp-amount">
      <span className="cp-amount-label">{label}</span>
      <span className="cp-amount-input">
        <input type="number" min={0} step={step} value={value} onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
        <span>{suffix ?? currencySymbol()}</span>
      </span>
      <small className={diff === 0 ? 'muted' : diff > 0 ? 'up' : 'down'}>
        LETO : {!suffix ? formatMoney(platform) : platform}{diff !== 0 && ` · ${diff > 0 ? '+' : '−'}${!suffix ? formatMoney(Math.abs(diff)) : Math.abs(Math.round(diff * 100) / 100)}`}
      </small>
    </label>
  );
}

/** Gérant : grille tarifaire de l'entreprise (prix libres ; sinon grille LETO) */
export default function CompanyPricing() {
  const toast = useToast();
  const [data, setData] = useState<CompanyPricingData | null>(null);
  const [grid, setGrid] = useState<PricingGrid | null>(null);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [km, setKm] = useState(5);
  const [stops, setStops] = useState(1);
  const [saving, setSaving] = useState(false);
  const [abidjan, setAbidjan] = useState(true);
  const price = (g: PricingGrid, km: number, v: Vehicle, s: Speed, n: number) => computePrice(g, km, v, s, n, 0, abidjan);
  const load = (d: CompanyPricingData) => { setData(d); setGrid(structuredClone(d.effective)); };
  useEffect(() => { api<CompanyPricingData>('/companies/me/pricing').then(load); }, []);
  if (!data || !grid) return <div className="cp"><h1 className="cp-title">Mes tarifs</h1><p className="muted">Chargement…</p></div>;

  const P = data.platform;
  const dirty = JSON.stringify(grid) !== JSON.stringify(data.effective);
  const setVehicle = (v: Vehicle, patch: Partial<PricingGrid['vehicles'][Vehicle]>) =>
    setGrid({ ...grid, vehicles: { ...grid.vehicles, [v]: { ...grid.vehicles[v], ...patch } } });
  const setCap = (v: Vehicle, s: Speed, n: number) => setVehicle(v, { maxAbidjan: { ...grid.vehicles[v].maxAbidjan, [s]: n } });
  /** Engins dont l'entreprise dispose : enregistré tout de suite, sans toucher aux prix en cours de saisie */
  const toggleVehicle = async (v: Vehicle, on: boolean) => {
    const next = on ? [...new Set([...data.vehicles, v])] : data.vehicles.filter((x) => x !== v);
    try {
      const d = await api<CompanyPricingData>('/companies/me/vehicles', { method: 'PUT', body: { vehicles: next } });
      setData(d);
      setGrid({ ...grid, vehicles: Object.fromEntries(VEHICLES.map((x) => [x, { ...grid.vehicles[x], enabled: d.effective.vehicles[x].enabled }])) as PricingGrid['vehicles'] });
      toast(on ? `${VEHICLE_LABEL[v]} : proposé à vos clients` : `${VEHICLE_LABEL[v]} : retiré de vos offres`);
    } catch (e) {
      toast(errText(e));
    }
  };
  const setFactor = (s: Speed, factor: number) => setGrid({ ...grid, speeds: { ...grid.speeds, [s]: { ...grid.speeds[s], factor } } });

  const save = async () => {
    setError('');
    setSaving(true);
    try {
      load(await api<CompanyPricingData>('/companies/me/pricing', {
        method: 'PUT',
        body: {
          vehicles: Object.fromEntries(VEHICLES.map((v) => [v, { base: grid.vehicles[v].base, perKm: grid.vehicles[v].perKm, min: grid.vehicles[v].min, maxAbidjan: grid.vehicles[v].maxAbidjan }])),
          speeds: grid.speeds, extraStopFee: grid.extraStopFee, codFee: grid.codFee,
        },
      }));
      toast('Tarifs enregistrés — appliqués aux prochaines commandes');
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving(false);
    }
  };
  const reset = async () => {
    load(await api<CompanyPricingData>('/companies/me/pricing', { method: 'DELETE' }));
    setConfirmReset(false);
    toast('Grille LETO rétablie');
  };

  return (
    <div className="cp">
      <header className="cp-head">
        <div>
          <h1 className="cp-title">Mes tarifs</h1>
          <p className="muted">Appliqués quand une boutique choisit votre entreprise et pour les courses que vous créez.</p>
        </div>
        <div className="cp-head-side">
          {data.custom ? <Badge color="purple">Grille propre</Badge> : <Badge>Grille LETO</Badge>}
          {data.custom && <button className="btn secondary" onClick={() => setConfirmReset(true)}>Revenir à la grille LETO</button>}
        </div>
      </header>

      {error && <div className="alert error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="cp-layout">
        <div className="cp-main">
          <div className="cp-section-title">Engins</div>
          <div className="cp-vehicles">
            {VEHICLES.map((v) => {
              const c = grid.vehicles[v];
              const letoOff = !P.vehicles[v].enabled;
              const has = data.vehicles.includes(v);
              return (
                <section key={v} className={`cp-vehicle${c.enabled ? '' : ' off'}`}>
                  <div className="cp-vehicle-head">
                    <span className="cp-vehicle-icon"><Icon name={VEHICLE_ICON[v]} size={28} /></span>
                    <div className="grow"><strong>{VEHICLE_LABEL[v]}</strong><small className="muted">{VEHICLE_HINT[v]}</small></div>
                    {letoOff ? <Badge>Désactivé par LETO</Badge> : (
                      <label className="cp-has">
                        <span>{has ? 'J’en dispose' : 'Je n’en ai pas'}</span>
                        <Switch checked={has} onChange={(on) => toggleVehicle(v, on)} label={has ? `Je n’ai pas de ${VEHICLE_LABEL[v].toLowerCase()}` : `Je dispose de ${VEHICLE_LABEL[v].toLowerCase()}`} />
                      </label>
                    )}
                  </div>
                  <div className="cp-amounts">
                    <Amount label="Prise en charge" value={c.base} platform={P.vehicles[v].base} step={50} onChange={(n) => setVehicle(v, { base: n })} />
                    <Amount label="Par kilomètre" value={c.perKm} platform={P.vehicles[v].perKm} step={10} onChange={(n) => setVehicle(v, { perKm: n })} />
                    <Amount label="Minimum" value={c.min} platform={P.vehicles[v].min} step={50} onChange={(n) => setVehicle(v, { min: n })} />
                  </div>
                  <div className="cp-caps">
                    <span className="cp-amount-label">Prix maximum · Grand Abidjan</span>
                    <div className="cp-caps-row">
                      {SPEEDS.map((s) => {
                        const cap = c.maxAbidjan?.[s] ?? 0;
                        const leto = P.vehicles[v].maxAbidjan?.[s] ?? 0;
                        return (
                          <label key={s} className="cp-cap">
                            <small>{SPEED_SHORT[s]}</small>
                            <input type="number" min={0} step={50} value={cap} onChange={(e) => setCap(v, s, e.target.value === '' ? 0 : Number(e.target.value))} aria-label={`Prix maximum ${VEHICLE_LABEL[v]} ${SPEED_SHORT[s]}`} />
                            <small className={cap === leto ? 'muted' : cap > leto && leto ? 'up' : 'down'} title={`LETO : ${leto ? formatMoney(leto) : 'aucun plafond'}`}>{cap === leto ? '= LETO' : leto ? `LETO ${leto}` : 'LETO : —'}</small>
                          </label>
                        );
                      })}
                    </div>
                    <small className="muted">{(() => { const f = capFromKm(grid, v, 'STANDARD'); return c.maxAbidjan?.STANDARD ? (f !== null ? `Standard plafonné dès ${f} km` : 'Plafonné') : '0 = pas de plafond'; })()}</small>
                  </div>
                  <div className="cp-vehicle-foot">
                    {c.enabled ? <>Course de {km} km : <strong>{formatMoney(price(grid, km, v, 'STANDARD', stops))}</strong></> : <span className="muted">{letoOff ? 'Désactivé par LETO' : 'Non proposé : vous n’en disposez pas'}</span>}
                  </div>
                </section>
              );
            })}
          </div>

          <div className="cp-section-title">Délais</div>
          <div className="cp-speeds">
            {SPEEDS.map((s) => {
              const f = grid.speeds[s].factor;
              return (
                <section key={s} className="cp-speed">
                  <strong>{grid.speeds[s].label}</strong>
                  <div className="cp-factor">
                    <span>×</span>
                    <input type="number" min={0.3} max={5} step={0.05} value={f} onChange={(e) => setFactor(s, e.target.value === '' ? 0 : Number(e.target.value))} aria-label={`Coefficient ${grid.speeds[s].label}`} />
                  </div>
                  <small className="muted">{f === 1 ? 'Prix de base' : f > 1 ? `+${Math.round((f - 1) * 100)} % sur le prix` : `−${Math.round((1 - f) * 100)} % sur le prix`} · LETO × {P.speeds[s].factor}</small>
                </section>
              );
            })}
            <section className="cp-speed">
              <strong>Arrêt supplémentaire</strong>
              <div className="cp-factor"><input type="number" min={0} step={50} value={grid.extraStopFee} onChange={(e) => setGrid({ ...grid, extraStopFee: e.target.value === '' ? 0 : Number(e.target.value) })} aria-label="Supplément par arrêt" /><span>{currencySymbol()}</span></div>
              <small className="muted">Par adresse en plus dans une tournée · LETO {formatMoney(P.extraStopFee)}</small>
            </section>
          </div>
        </div>

        <aside className="cp-sim">
          <div className="cp-section-title" style={{ marginTop: 0 }}>Simulateur</div>
          <section className="cp-sim-card">
            <label className="cp-range">
              <span>Distance <strong>{km} km</strong></span>
              <input type="range" min={1} max={30} step={0.5} value={km} onChange={(e) => setKm(Number(e.target.value))} />
            </label>
            <div className="cp-stepper">
              <span>Zone</span>
              <div className="cp-zone">
                <button className={abidjan ? 'on' : ''} onClick={() => setAbidjan(true)}>Abidjan</button>
                <button className={abidjan ? '' : 'on'} onClick={() => setAbidjan(false)}>Hors</button>
              </div>
            </div>
            <div className="cp-stepper">
              <span>Adresses de livraison</span>
              <div>
                <button onClick={() => setStops(Math.max(1, stops - 1))} aria-label="Moins">−</button>
                <strong>{stops}</strong>
                <button onClick={() => setStops(Math.min(10, stops + 1))} aria-label="Plus">+</button>
              </div>
            </div>
            <div className="cp-sim-table">
              <div className="cp-sim-row head"><span /><span>Express</span><span>Standard</span><span>2 h</span></div>
              {VEHICLES.filter((v) => grid.vehicles[v].enabled).map((v) => (
                <div key={v} className="cp-sim-row">
                  <span className="cp-sim-v"><Icon name={VEHICLE_ICON[v]} size={18} />{VEHICLE_LABEL[v]}</span>
                  {SPEEDS.map((s) => {
                    const mine = price(grid, km, v, s, stops), leto = price(P, km, v, s, stops);
                    return <span key={s}><strong>{formatMoney(mine)}</strong><small className={mine === leto ? 'muted' : mine > leto ? 'up' : 'down'}>LETO {formatMoney(leto)}</small></span>;
                  })}
                </div>
              ))}
            </div>
            <small className="muted">Prix = max(minimum, prise en charge + prix par km × distance) × coefficient du délai, sans dépasser le prix maximum dans le Grand Abidjan, + arrêts supplémentaires, arrondi aux 50 F.</small>
          </section>
        </aside>
      </div>

      {dirty && (
        <div className="cp-savebar">
          <span>Modifications non enregistrées</span>
          <button className="btn secondary" onClick={() => setGrid(structuredClone(data.effective))}>Annuler</button>
          <button className="btn" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer mes tarifs'}</button>
        </div>
      )}

      {confirmReset && (
        <Modal title="Revenir à la grille LETO ?" subtitle="Vos prix seront remplacés par ceux de LETO pour les prochaines commandes." onClose={() => setConfirmReset(false)}
          footer={<><button className="btn secondary" onClick={() => setConfirmReset(false)}>Annuler</button><button className="btn danger" onClick={reset}>Rétablir</button></>} />
      )}
    </div>
  );
}
