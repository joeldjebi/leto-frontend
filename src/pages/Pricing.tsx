import { useEffect, useState } from 'react';
import { api, capFromKm, computePrice, dateTime, PricingGrid, Speed, Vehicle, VehicleConfig, errText } from '../api';
import { formatMoney, currencySymbol } from '../countries';
import BillingSettings from '../components/BillingSettings';
import MapSettings from '../components/MapSettings';
import SurchargeSettings from '../components/SurchargeSettings';
import { Card, Icon, Modal, PageHeader, Switch, useToast } from '../ui';
import { isBuiltinVehicle, loadVehicles, sortVehicleCodes, VEHICLE_ICON_LABEL, VEHICLE_ICONS, VehicleIcon } from '../vehicles';

const SPEEDS: Speed[] = ['EXPRESS', 'STANDARD', 'SCHEDULED'];

const price = (g: PricingGrid, km: number, v: Vehicle, s: Speed, stops: number, cod: number, abidjan: boolean, up = 0) => computePrice(g, km, v, s, stops, cod, abidjan, up);

/** Code d'un nouvel engin depuis son nom : « Vélo » → VELO, « Moto 3 roues » → MOTO_3_ROUE (10 caractères), unique */
export function vehicleCode(name: string, taken: string[]): string {
  let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!/^[A-Z]/.test(base)) base = `V${base}`;
  base = base.slice(0, 10).replace(/_+$/, '');
  if (base.length < 2) base = (base + 'XX').slice(0, 2);
  if (!taken.includes(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const code = `${base.slice(0, 10 - String(i).length)}${i}`;
    if (!taken.includes(code)) return code;
  }
  return base;
}

type VehicleForm = Pick<VehicleConfig, 'name' | 'label' | 'description' | 'icon' | 'base' | 'perKm' | 'min' | 'enabled'>;

/** Tarifs et règles de la plateforme (SA) */
export default function Pricing() {
  const toast = useToast();
  const [saved, setSaved] = useState<PricingGrid | null>(null);
  const [grid, setGrid] = useState<PricingGrid | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [sim, setSim] = useState({ km: 6, stops: 1, cod: 0, abidjan: true, up: 0 });
  /** Fenêtre d'ajout (code null) ou de modification d'un engin */
  const [editing, setEditing] = useState<{ code: Vehicle | null } | null>(null);
  const [removing, setRemoving] = useState<Vehicle | null>(null);

  useEffect(() => {
    api<PricingGrid>('/admin/settings').then((g) => { setSaved(g); setGrid(g); });
  }, []);
  if (!grid || !saved) return <PageHeader title="Tarifs et règles" subtitle="Chargement…" />;

  const VEHICLES = sortVehicleCodes(Object.keys(grid.vehicles));
  const vname = (v: Vehicle) => grid.vehicles[v]?.name || grid.vehicles[v]?.label || v;
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
      void loadVehicles(true);
      toast('Tarifs enregistrés — appliqués aux nouvelles commandes');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  /** Ajout immédiat d'un engin (les autres modifications en cours sont conservées) */
  const addVehicle = async (f: VehicleForm) => {
    const code = vehicleCode(f.name, Object.keys(grid.vehicles));
    const g = await api<PricingGrid>('/admin/settings', {
      method: 'PUT',
      body: { vehicles: { [code]: { ...f, maxAbidjan: { EXPRESS: 0, STANDARD: 0, SCHEDULED: 0 } } } },
    });
    setSaved(g);
    setGrid((cur) => (cur && g.vehicles[code] ? { ...cur, vehicles: { ...cur.vehicles, [code]: g.vehicles[code] } } : g));
    void loadVehicles(true);
    setEditing(null);
    toast(`${f.name} ajouté aux offres`);
  };

  /** Retrait immédiat d'un engin ajouté (jamais MOTO, CAR, CARGO) */
  const removeVehicle = async (code: Vehicle) => {
    if (isBuiltinVehicle(code)) return;
    const name = vname(code);
    try {
      const g = await api<PricingGrid>('/admin/settings', { method: 'PUT', body: { vehicles: { [code]: null } } });
      setSaved(g);
      setGrid((cur) => {
        if (!cur) return g;
        const { [code]: _gone, ...rest } = cur.vehicles;
        return { ...cur, vehicles: rest };
      });
      void loadVehicles(true);
      toast(`${name} retiré des offres`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setRemoving(null);
    }
  };

  const reset = async () => {
    const g = await api<PricingGrid>('/admin/settings/reset', { method: 'POST' });
    setSaved(g);
    setGrid(g);
    setConfirmReset(false);
    void loadVehicles(true);
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
        <Card title="Offres" pad actions={<button className="btn secondary" onClick={() => setEditing({ code: null })}><Icon name="plus" size={15} />Ajouter un engin</button>}>
          <p className="muted" style={{ marginTop: 0 }}>Prix = max(minimum, base + prix par km × distance) × coefficient du délai, arrondi aux 50 {currencySymbol()} supérieurs, sans dépasser le prix maximum dans le Grand Abidjan. Un engin désactivé n’est proposé par aucune entreprise ; chaque entreprise indique aussi les engins dont elle dispose.</p>
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Engin</th><th>Libellé</th><th>Description</th><th className="num">Base ({currencySymbol()})</th><th className="num">Par km ({currencySymbol()})</th><th className="num">Minimum ({currencySymbol()})</th><th>Active</th></tr></thead>
              <tbody>
                {VEHICLES.map((v) => {
                  const c = grid.vehicles[v];
                  return (
                    <tr key={v} style={{ opacity: c.enabled ? 1 : 0.55 }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span className="cp-vehicle-icon" style={{ width: 40, height: 34, borderRadius: 10 }}><Icon name={c.icon || 'moto'} size={20} /></span>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ whiteSpace: 'nowrap' }}>{vname(v)}</strong>
                            <span className="sub">{v}{c.custom || !isBuiltinVehicle(v) ? ' · ajouté' : ''}</span>
                          </div>
                          <button className="btn plain icon-btn" title="Modifier" aria-label={`Modifier ${vname(v)}`} onClick={() => setEditing({ code: v })}><Icon name="edit" size={16} /></button>
                          {!isBuiltinVehicle(v) && (
                            <button className="btn plain icon-btn" style={{ color: 'var(--red)' }} title="Retirer" aria-label={`Retirer ${vname(v)}`} onClick={() => setRemoving(v)}><Icon name="trash" size={16} /></button>
                          )}
                        </div>
                      </td>
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
                    <td><strong>{vname(v)}</strong></td>
                    {SPEEDS.map((s) => {
                      const cap = grid.vehicles[v].maxAbidjan?.[s] ?? 0;
                      const from = capFromKm(grid, v, s);
                      return (
                        <td key={s} className="num">
                          <input type="number" min={0} step={50} value={cap} onChange={(e) => setVehicle(v, { maxAbidjan: { ...grid.vehicles[v].maxAbidjan, [s]: num(e.target.value) } })} style={{ width: 100, textAlign: 'right' }} aria-label={`Prix maximum ${vname(v)} ${grid.speeds[s].label}`} />
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

        <Card title="Annulations, échecs et retours" pad>
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
              <div className="grow"><div className="title">Appel avant de prendre la route</div><small className="muted">Le livreur doit appeler chaque destinataire (depuis l’app) avant de partir avec les colis, pour confirmer qu’il est disponible</small></div>
              <Switch checked={grid.preCallRequired !== false} onChange={(on) => setGrid({ ...grid, preCallRequired: on })} label={grid.preCallRequired !== false ? 'Désactiver' : 'Activer'} />
            </div>
            <div>
              <div className="grow"><div className="title">Choix après un échec</div><small className="muted">L’expéditeur choisit une nouvelle tentative ou le retour du colis ; sans réponse, le colis lui est rapporté après ce délai</small></div>
              <input type="number" min={1} max={120} value={grid.followUpAutoMin ?? 10} onChange={(e) => setGrid({ ...grid, followUpAutoMin: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Délai de choix après un échec" /><span className="muted">min</span>
            </div>
            <div>
              <div className="grow"><div className="title">Nouvelle tentative</div><small className="muted">Prix du 2e passage, en % du prix de l’arrêt (70 % = 30 % de réduction). Une seule nouvelle tentative par colis</small></div>
              <input type="number" min={0} max={100} step={5} value={grid.retryFeePct ?? 70} onChange={(e) => setGrid({ ...grid, retryFeePct: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Prix de la nouvelle tentative en %" /><span className="muted">%</span>
            </div>
            <div>
              <div className="grow"><div className="title">Retour à l’expéditeur</div><small className="muted">Colis non livré ou annulé après la récupération : retour facturé en % du prix de l’arrêt. Annulé si un litige est donné à l’expéditeur</small></div>
              <input type="number" min={0} max={100} step={5} value={grid.returnFeePct ?? 50} onChange={(e) => setGrid({ ...grid, returnFeePct: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Frais de retour en %" /><span className="muted">%</span>
            </div>
            <div>
              <div className="grow"><div className="title">Alerte taux d’échec d’un livreur</div><small className="muted">Alerte au back-office quand un livreur dépasse ce taux d’échec sur 7 jours (5 livraisons et 3 échecs minimum) · 0 = jamais</small></div>
              <input type="number" min={0} max={100} value={grid.failAlertPct ?? 15} onChange={(e) => setGrid({ ...grid, failAlertPct: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Seuil d’alerte du taux d’échec" /><span className="muted">%</span>
            </div>
            <div>
              <div className="grow"><div className="title">Priorité aux livreurs bien notés</div><small className="muted">À distance proche, la course est proposée d’abord aux mieux notés (5★ ≈ 10 % plus près, 3★ ≈ 30 % plus loin). Les livreurs de moins de 5 notes ne sont pas pénalisés</small></div>
              <Switch checked={grid.ratingPriority !== false} onChange={(on) => setGrid({ ...grid, ratingPriority: on })} label={grid.ratingPriority !== false ? 'Désactiver' : 'Activer'} />
            </div>
            <div>
              <div className="grow"><div className="title">Notes prises en compte</div><small className="muted">Moyenne récente calculée sur les dernières courses notées d’un livreur (alertes, suspension automatique)</small></div>
              <input type="number" min={5} max={200} value={grid.ratingWindow ?? 20} onChange={(e) => setGrid({ ...grid, ratingWindow: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Nombre de notes prises en compte" /><span className="muted">notes</span>
            </div>
            <div>
              <div className="grow"><div className="title">Alerte note basse</div><small className="muted">L’entreprise (et VITE pour un indépendant) est prévenue sous cette moyenne récente, ou après 3 notes à 1-2★ sur 10 · une alerte par semaine au plus · 0 = jamais</small></div>
              <input type="number" min={0} max={5} step={0.1} value={grid.ratingAlertBelow ?? 3.5} onChange={(e) => setGrid({ ...grid, ratingAlertBelow: Number(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Seuil d’alerte de note" /><span className="muted">★</span>
            </div>
            <div>
              <div className="grow"><div className="title">Code de retour</div><small className="muted">Les colis non livrés sont toujours rapportés à l’expéditeur. Activé : il confirme avec son code. Désactivé : le livreur confirme au point de départ (position GPS vérifiée)</small></div>
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
              <div className="grow"><div className="title">Livreur en course : autour de lui</div><small className="muted">Livraisons « Dans 2 heures » seulement : il reçoit aussi les commandes dont le départ est à moins de cette distance de lui</small></div>
              <input type="number" min={0} max={20} step={0.5} value={grid.busyRadiusKm} onChange={(e) => setGrid({ ...grid, busyRadiusKm: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Livreur en course : autour de lui" /><span className="muted">km</span>
            </div>
            <div>
              <div className="grow"><div className="title">Livreur en course : sur son trajet</div><small className="muted">… ou dont le départ est à moins de cette distance de son trajet restant</small></div>
              <input type="number" min={0} max={5000} step={100} value={grid.routeCorridorM} onChange={(e) => setGrid({ ...grid, routeCorridorM: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Livreur en course : sur son trajet" /><span className="muted">m</span>
            </div>
            <div>
              <div className="grow"><div className="title">Courses en même temps · Dans 2 heures</div><small className="muted">Maximum par livreur quand toutes ses courses sont « Dans 2 heures » (les courses affectées par son entreprise passent toujours)</small></div>
              <input type="number" min={1} max={10} step={1} value={grid.maxActiveCourses} onChange={(e) => setGrid({ ...grid, maxActiveCourses: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Courses en même temps, Dans 2 heures" /><span className="muted">courses</span>
            </div>
            <div>
              <div className="grow"><div className="title">Courses en même temps · Standard</div><small className="muted">Maximum quand le livreur a une livraison Standard ; seulement les commandes sur son trajet</small></div>
              <input type="number" min={1} max={10} step={1} value={grid.standardMaxActiveCourses} onChange={(e) => setGrid({ ...grid, standardMaxActiveCourses: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Courses en même temps, Standard" /><span className="muted">courses</span>
            </div>
            <div>
              <div className="grow"><div className="title">Standard : retard maximum</div><small className="muted">Une course ajoutée ne doit pas retarder la livraison Standard en cours de plus de ce temps</small></div>
              <input type="number" min={0} max={60} step={1} value={grid.standardMaxDetourMin} onChange={(e) => setGrid({ ...grid, standardMaxDetourMin: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Standard : retard maximum" /><span className="muted">min</span>
            </div>
            <div>
              <div className="grow"><div className="title">Express : course exclusive</div><small className="muted">Le livreur ne fait que cette course : il ne reçoit aucune autre commande pendant une livraison Express, et une Express n’est proposée qu’aux livreurs libres</small></div>
              <span className="badge">Toujours</span>
            </div>
            <div>
              <div className="grow"><div className="title">Alerte nouvelle commande</div><small className="muted">Durée d’affichage de l’alerte plein écran chez le livreur, avec son</small></div>
              <input type="number" min={10} max={120} step={5} value={grid.orderPopupSec} onChange={(e) => setGrid({ ...grid, orderPopupSec: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Alerte nouvelle commande" /><span className="muted">s</span>
            </div>
            <div>
              <div className="grow"><div className="title">Livreurs prévenus par vague</div><small className="muted">Les plus proches d’abord ; les suivants sont prévenus si personne n’accepte</small></div>
              <input type="number" min={1} max={50} step={1} value={grid.dispatchWaveSize} onChange={(e) => setGrid({ ...grid, dispatchWaveSize: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Livreurs prévenus par vague" /><span className="muted">livreurs</span>
            </div>
            <div>
              <div className="grow"><div className="title">Délai entre deux vagues</div><small className="muted">Avant de prévenir les livreurs suivants</small></div>
              <input type="number" min={5} max={120} step={5} value={grid.dispatchWaveSec} onChange={(e) => setGrid({ ...grid, dispatchWaveSec: num(e.target.value) })} style={{ width: 96, textAlign: 'right' }} aria-label="Délai entre deux vagues" /><span className="muted">s</span>
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

      {editing && (
        <VehicleModal
          code={editing.code}
          initial={editing.code ? grid.vehicles[editing.code] : undefined}
          taken={Object.keys(grid.vehicles)}
          onClose={() => setEditing(null)}
          onSubmit={async (f) => {
            if (!editing.code) return addVehicle(f);
            const { base: _b, perKm: _p, min: _m, enabled: _e, ...identity } = f;
            setVehicle(editing.code, identity);
            setEditing(null);
          }}
        />
      )}

      {removing && (
        <Modal title={`Retirer « ${vname(removing)} » ?`} subtitle="Cet engin ne sera plus proposé aux clients ni aux entreprises. Les livraisons passées gardent leur historique. Pour le suspendre seulement, désactivez-le."
          onClose={() => setRemoving(null)}
          footer={<><button className="btn secondary" onClick={() => setRemoving(null)}>Annuler</button><button className="btn danger" onClick={() => removeVehicle(removing)}>Retirer</button></>} />
      )}

      {confirmReset && (
        <Modal title="Rétablir les valeurs par défaut ?" subtitle="Toutes les modifications de tarifs et de règles seront perdues." onClose={() => setConfirmReset(false)}
          footer={<><button className="btn secondary" onClick={() => setConfirmReset(false)}>Annuler</button><button className="btn danger" onClick={reset}>Rétablir</button></>} />
      )}
    </>
  );
}

/** Ajout (code null) ou modification du nom, du libellé, de la description et du pictogramme d'un engin */
function VehicleModal({ code, initial, taken, onClose, onSubmit }: {
  code: Vehicle | null; initial?: VehicleConfig; taken: string[];
  onClose: () => void; onSubmit: (f: VehicleForm) => Promise<void>;
}) {
  const [f, setF] = useState<VehicleForm>({
    name: initial?.name ?? initial?.label ?? '', label: initial?.label ?? '', description: initial?.description ?? '',
    icon: initial?.icon ?? 'moto', base: initial?.base ?? 500, perKm: initial?.perKm ?? 100, min: initial?.min ?? 1000, enabled: initial?.enabled ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const adding = !code;
  const name = f.name.trim();
  const newCode = adding && name ? vehicleCode(name, taken) : code;
  const num = (v: string) => (v === '' ? 0 : Number(v));
  const valid = name.length > 0 && name.length <= 20 && f.label.trim().length > 0;

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ ...f, name, label: f.label.trim(), description: f.description.trim() });
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={adding ? 'Ajouter un engin' : `Modifier « ${initial?.name || code} »`}
      subtitle={adding ? 'Le nouvel engin est proposé aux entreprises qui en disposent, avec ses propres tarifs.' : 'Les modifications seront appliquées en cliquant sur Enregistrer.'}
      onClose={onClose}
      footer={<>
        <button className="btn secondary" onClick={onClose}>Annuler</button>
        <button className="btn" disabled={!valid || busy} onClick={submit}>{adding ? (busy ? 'Ajout…' : 'Ajouter') : 'Valider'}</button>
      </>}
    >
      {error && <div className="alert error">{error}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, background: 'var(--fill)' }}>
        <span className="cp-vehicle-icon"><Icon name={f.icon} size={28} /></span>
        <div style={{ minWidth: 0 }}>
          <strong>{name || 'Nom de l’engin'}</strong>
          <small className="muted" style={{ display: 'block' }}>{f.label.trim() || 'Libellé'}{newCode ? ` · code ${newCode}` : ''}</small>
        </div>
      </div>
      <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label className="field"><span>Nom court</span>
          <input value={f.name} maxLength={20} placeholder="Ex. Vélo" autoFocus onChange={(e) => setF({ ...f, name: e.target.value, label: !f.label || f.label === f.name ? e.target.value : f.label })} />
        </label>
        <label className="field"><span>Libellé</span>
          <input value={f.label} maxLength={80} placeholder="Ex. Vélo cargo" onChange={(e) => setF({ ...f, label: e.target.value })} />
        </label>
      </div>
      <label className="field"><span>Description</span>
        <input value={f.description} maxLength={120} placeholder="Ex. Petits colis, centre-ville" onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="field">
        <span>Pictogramme</span>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
          {VEHICLE_ICONS.map((ic: VehicleIcon) => (
            <button key={ic} type="button" className={`nd-choice compact${f.icon === ic ? ' on' : ''}`} onClick={() => setF({ ...f, icon: ic })} aria-pressed={f.icon === ic}>
              <span className="nd-choice-icon"><Icon name={ic} size={24} /></span>
              <small>{VEHICLE_ICON_LABEL[ic]}</small>
            </button>
          ))}
        </div>
      </div>
      {adding && (
        <>
          <div className="grid" style={{ gap: 12, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <label className="field"><span>Prix de base ({currencySymbol()})</span><input type="number" min={0} step={50} value={f.base} onChange={(e) => setF({ ...f, base: num(e.target.value) })} /></label>
            <label className="field"><span>Prix par km ({currencySymbol()})</span><input type="number" min={0} step={10} value={f.perKm} onChange={(e) => setF({ ...f, perKm: num(e.target.value) })} /></label>
            <label className="field"><span>Minimum ({currencySymbol()})</span><input type="number" min={0} step={50} value={f.min} onChange={(e) => setF({ ...f, min: num(e.target.value) })} /></label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 500 }}>Proposer tout de suite</div><small className="muted">Sinon, l’engin est créé désactivé</small></div>
            <Switch checked={f.enabled} onChange={(on) => setF({ ...f, enabled: on })} label={f.enabled ? 'Désactiver' : 'Activer'} />
          </div>
        </>
      )}
    </Modal>
  );
}
