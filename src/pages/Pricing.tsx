import { useEffect, useState } from 'react';
import { api, capFromKm, computePrice, dateTime, PricingGrid, Speed, Vehicle } from '../api';
import { formatMoney, currencySymbol } from '../countries';
import BillingSettings from '../components/BillingSettings';
import MapSettings from '../components/MapSettings';
import SurchargeSettings from '../components/SurchargeSettings';
import { Card, Modal, PageHeader, Switch, useToast } from '../ui';

const VEHICLES: Vehicle[] = ['MOTO', 'CAR', 'CARGO'];
const SPEEDS: Speed[] = ['EXPRESS', 'STANDARD', 'SCHEDULED'];

const price = (g: PricingGrid, km: number, v: Vehicle, s: Speed, stops: number, cod: number, abidjan: boolean, up = 0) => computePrice(g, km, v, s, stops, cod, abidjan, up);
const VNAME: Record<Vehicle, string> = { MOTO: 'Moto', CAR: 'Voiture', CARGO: 'Cargo' };

/** Tarifs et règles de la plateforme (SA) */
export default function Pricing() {
  const toast = useToast();
  const [saved, setSaved] = useState<PricingGrid | null>(null);
  const [grid, setGrid] = useState<PricingGrid | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sim, setSim] = useState({ km: 6, stops: 1, cod: 0, abidjan: true, up: 0 });

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
        // Toute la page (offres, règles, annulations, répartition), sans les infos de dernière modification
        body: (({ updatedAt: _a, updatedBy: _b, ...rest }) => rest)(grid),
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
          <p className="muted" style={{ marginTop: 0 }}>Prix = max(minimum, base + prix par km × distance) × coefficient du délai, arrondi aux 50 {currencySymbol()} supérieurs, sans dépasser le prix maximum dans le Grand Abidjan. Un engin désactivé n’est proposé par aucune entreprise ; chaque entreprise indique aussi les engins dont elle dispose.</p>
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Offre</th><th>Nom affiché</th><th>Description</th><th className="num">Base ({currencySymbol()})</th><th className="num">Par km ({currencySymbol()})</th><th className="num">Minimum ({currencySymbol()})</th><th>Active</th></tr></thead>
              <tbody>
                {VEHICLES.map((v) => {
                  const c = grid.vehicles[v];
                  return (
                    <tr key={v} style={{ opacity: c.enabled ? 1 : 0.55 }}>
                      <td><strong>{VNAME[v]}</strong></td>
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

        <Card title="Prix maximum dans le Grand Abidjan" pad>
          <p className="muted" style={{ marginTop: 0 }}>
            Quand le départ et toutes les adresses sont dans le Grand Abidjan (13 communes, de Songon à Bingerville, d’Anyama à Port-Bouët), le prix d’une course ne dépasse pas ce montant. Les arrêts supplémentaires s’ajoutent. Laissez 0 pour ne pas plafonner.
          </p>
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Offre</th>{SPEEDS.map((s) => <th key={s} className="num">{grid.speeds[s].label}</th>)}</tr></thead>
              <tbody>
                {VEHICLES.map((v) => (
                  <tr key={v} style={{ opacity: grid.vehicles[v].enabled ? 1 : 0.55 }}>
                    <td><strong>{VNAME[v]}</strong></td>
                    {SPEEDS.map((s) => {
                      const cap = grid.vehicles[v].maxAbidjan?.[s] ?? 0;
                      const from = capFromKm(grid, v, s);
                      return (
                        <td key={s} className="num">
                          <input type="number" min={0} step={50} value={cap} onChange={(e) => setVehicle(v, { maxAbidjan: { ...grid.vehicles[v].maxAbidjan, [s]: num(e.target.value) } })} style={{ width: 100, textAlign: 'right' }} aria-label={`Prix maximum ${VNAME[v]} ${grid.speeds[s].label}`} />
                          <span className="sub">{cap ? (from !== null ? `atteint dès ${from} km` : 'plafonné') : 'pas de plafond'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
                <div className="grow"><div className="title">Proposer le paiement à la livraison</div><small className="muted">Le client peut demander au livreur d’encaisser la marchandise (désactivé par défaut)</small></div>
                <Switch checked={grid.codEnabled} onChange={(on) => setGrid({ ...grid, codEnabled: on })} label={grid.codEnabled ? 'Désactiver' : 'Activer'} />
              </div>
              <div style={{ opacity: grid.codEnabled ? 1 : 0.5 }}>
                <div className="grow"><div className="title">Frais de paiement à la livraison</div><small className="muted">Par arrêt où le livreur encaisse la marchandise</small></div>
                <input type="number" min={0} step={50} value={grid.codFee} onChange={(e) => setGrid({ ...grid, codFee: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">{currencySymbol()}</span>
              </div>
              <div>
                <div className="grow"><div className="title">Supplément par arrêt</div><small className="muted">Tournées : par adresse au-delà de la première</small></div>
                <input type="number" min={0} step={50} value={grid.extraStopFee} onChange={(e) => setGrid({ ...grid, extraStopFee: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">{currencySymbol()}</span>
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

        <SurchargeSettings grid={grid} setGrid={setGrid} />

        <Card title="Annulations et retours" pad>
          <div className="rows" style={{ margin: '0 -20px' }}>
            <div>
              <div className="grow"><div className="title">Frais de déplacement</div><small className="muted">Dus par l’expéditeur s’il annule alors que le livreur est déjà en route (récupérés par l’entreprise)</small></div>
              <Switch checked={grid.cancelFeeEnabled} onChange={(on) => setGrid({ ...grid, cancelFeeEnabled: on })} label={grid.cancelFeeEnabled ? 'Désactiver' : 'Activer'} />
            </div>
            <div style={{ opacity: grid.cancelFeeEnabled ? 1 : 0.5 }}>
              <div className="grow"><div className="title">Montant des frais</div><small className="muted">Pourcentage du prix de la course ou montant fixe</small></div>
              <select value={grid.cancelFeeType} onChange={(e) => setGrid({ ...grid, cancelFeeType: e.target.value as 'PERCENT' | 'FIXED' })} aria-label="Type de frais" disabled={!grid.cancelFeeEnabled}>
                <option value="FIXED">Montant fixe</option>
                <option value="PERCENT">Pourcentage</option>
              </select>
              <input type="number" min={0} step={grid.cancelFeeType === 'PERCENT' ? 5 : 50} value={grid.cancelFeeValue} disabled={!grid.cancelFeeEnabled}
                onChange={(e) => setGrid({ ...grid, cancelFeeValue: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Valeur des frais" />
              <span className="muted">{grid.cancelFeeType === 'PERCENT' ? '%' : currencySymbol()}</span>
            </div>
            <div style={{ opacity: grid.cancelFeeEnabled ? 1 : 0.5 }}>
              <div className="grow"><div className="title">Annulation gratuite</div><small className="muted">Pendant ces minutes après l’acceptation par le livreur</small></div>
              <input type="number" min={0} max={60} value={grid.cancelFreeMinutes} disabled={!grid.cancelFeeEnabled} onChange={(e) => setGrid({ ...grid, cancelFreeMinutes: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">min</span>
            </div>
            <div>
              <div className="grow"><div className="title">Annulation signalée par le livreur</div><small className="muted">Le destinataire annule : l’expéditeur confirme ; sans réponse, acceptée après ce délai</small></div>
              <input type="number" min={1} max={120} value={grid.cancelRequestAutoMin} onChange={(e) => setGrid({ ...grid, cancelRequestAutoMin: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} /><span className="muted">min</span>
            </div>
            <div>
              <div className="grow"><div className="title">Expiration des commandes</div><small className="muted">{grid.orderExpiryMin > 0 ? `Une commande qu’aucun livreur n’a acceptée est annulée automatiquement après ${grid.orderExpiryMin} min ; le client est prévenu` : 'Désactivée : une commande attend un livreur sans limite de temps'} · 0 = jamais</small></div>
              <input type="number" min={0} max={1440} value={grid.orderExpiryMin} onChange={(e) => setGrid({ ...grid, orderExpiryMin: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Expiration des commandes en minutes" /><span className="muted">min</span>
            </div>
            <div>
              <div className="grow"><div className="title">Code de livraison</div><small className="muted">Le destinataire donne son code à 4 chiffres au livreur pour confirmer la réception. Désactivé : le livreur valide seul la livraison</small></div>
              <Switch checked={grid.deliveryCodeEnabled !== false} onChange={(on) => setGrid({ ...grid, deliveryCodeEnabled: on })} label={grid.deliveryCodeEnabled !== false ? 'Désactiver' : 'Activer'} />
            </div>
            <div>
              <div className="grow"><div className="title">Code de retour</div><small className="muted">Les colis non livrés (absence, refus, annulation après récupération) sont rapportés à l’expéditeur, qui confirme avec un code</small></div>
              <Switch checked={grid.returnCodeEnabled} onChange={(on) => setGrid({ ...grid, returnCodeEnabled: on })} label={grid.returnCodeEnabled ? 'Désactiver' : 'Activer'} />
            </div>
          </div>
        </Card>

        <Card title="Répartition des commandes" pad>
          <div className="rows" style={{ margin: '0 -20px' }}>
            <div>
              <div className="grow"><div className="title">Rayon des nouvelles commandes</div><small className="muted">Les livreurs libres à moins de cette distance du départ sont prévenus</small></div>
              <input type="number" min={1} max={50} step={1} value={grid.dispatchRadiusKm} onChange={(e) => setGrid({ ...grid, dispatchRadiusKm: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Rayon des nouvelles commandes" /><span className="muted">km</span>
            </div>
            <div>
              <div className="grow"><div className="title">Livreur en course : autour de lui</div><small className="muted">Il reçoit aussi les commandes dont le départ est à moins de cette distance de lui</small></div>
              <input type="number" min={0} max={20} step={0.5} value={grid.busyRadiusKm} onChange={(e) => setGrid({ ...grid, busyRadiusKm: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Livreur en course : autour de lui" /><span className="muted">km</span>
            </div>
            <div>
              <div className="grow"><div className="title">Livreur en course : sur son trajet</div><small className="muted">… ou dont le départ est à moins de cette distance de son trajet restant</small></div>
              <input type="number" min={0} max={5000} step={100} value={grid.routeCorridorM} onChange={(e) => setGrid({ ...grid, routeCorridorM: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Livreur en course : sur son trajet" /><span className="muted">m</span>
            </div>
            <div>
              <div className="grow"><div className="title">Courses en même temps</div><small className="muted">Maximum par livreur (les courses affectées par son entreprise passent toujours)</small></div>
              <input type="number" min={1} max={10} step={1} value={grid.maxActiveCourses} onChange={(e) => setGrid({ ...grid, maxActiveCourses: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Courses en même temps" /><span className="muted">courses</span>
            </div>
            <div>
              <div className="grow"><div className="title">Alerte nouvelle commande</div><small className="muted">Durée d’affichage de l’alerte plein écran chez le livreur, avec son</small></div>
              <input type="number" min={10} max={120} step={5} value={grid.orderPopupSec} onChange={(e) => setGrid({ ...grid, orderPopupSec: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Alerte nouvelle commande" /><span className="muted">s</span>
            </div>
          </div>
        </Card>

        <Card title="Simulation" pad>
          <div className="toolbar">
            <label className="field"><span>Distance (km)</span><input type="number" min={0} step={0.5} value={sim.km} onChange={(e) => setSim({ ...sim, km: num(e.target.value) })} style={{ width: 110 }} /></label>
            <label className="field"><span>Arrêts</span><input type="number" min={1} max={10} value={sim.stops} onChange={(e) => setSim({ ...sim, stops: Math.max(1, num(e.target.value)) })} style={{ width: 90 }} /></label>
            <label className="field"><span>Zone</span><select value={sim.abidjan ? 'in' : 'out'} onChange={(e) => setSim({ ...sim, abidjan: e.target.value === 'in' })}><option value="in">Grand Abidjan</option><option value="out">Hors Grand Abidjan</option></select></label>
            <label className="field"><span>Majorations</span><select value={sim.up} onChange={(e) => setSim({ ...sim, up: Number(e.target.value) })}>
              <option value={0}>Aucune</option>
              <option value={grid.surcharges.rushPct}>Heure de pointe (+{grid.surcharges.rushPct} %)</option>
              <option value={grid.surcharges.nightPct}>Nuit (+{grid.surcharges.nightPct} %)</option>
              <option value={grid.surcharges.rainPct}>Pluie (+{grid.surcharges.rainPct} %)</option>
              <option value={grid.surcharges.rainPct + grid.surcharges.floodPct}>Pluie + zone inondable (+{grid.surcharges.rainPct + grid.surcharges.floodPct} %)</option>
            </select></label>
            <label className="field"><span>Dont paiement à la livraison</span><input type="number" min={0} max={sim.stops} value={sim.cod} onChange={(e) => setSim({ ...sim, cod: Math.min(sim.stops, num(e.target.value)) })} style={{ width: 90 }} /></label>
          </div>
          <table className="list">
            <thead><tr><th>Offre</th>{SPEEDS.map((s) => <th key={s} className="num">{grid.speeds[s].label}</th>)}</tr></thead>
            <tbody>
              {VEHICLES.filter((v) => grid.vehicles[v].enabled).map((v) => (
                <tr key={v}>
                  <td>{grid.vehicles[v].label}</td>
                  {SPEEDS.map((s) => {
                    const now = price(grid, sim.km, v, s, sim.stops, sim.cod, sim.abidjan, sim.up);
                    const before = price(saved, sim.km, v, s, sim.stops, sim.cod, sim.abidjan, sim.up);
                    return (
                      <td key={s} className="num">
                        <strong>{formatMoney(now)}</strong>
                        {now !== before && <span className="sub">avant : {formatMoney(before)}</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <MapSettings />

        <BillingSettings />
      </div>

      {confirmReset && (
        <Modal title="Rétablir les valeurs par défaut ?" subtitle="Toutes les modifications de tarifs et de règles seront perdues." onClose={() => setConfirmReset(false)}
          footer={<><button className="btn secondary" onClick={() => setConfirmReset(false)}>Annuler</button><button className="btn danger" onClick={reset}>Rétablir</button></>} />
      )}
    </>
  );
}
