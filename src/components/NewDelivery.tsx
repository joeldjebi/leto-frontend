import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import { api, Delivery, initial, isOnline, Speed, SPEED_LABEL, User, Vehicle, VEHICLE_LABEL } from '../api';
import { formatMoney, phoneError, formatPhone, currencySymbol } from '../countries';
import { useData } from '../data';
import { Badge, Icon, PhoneInput, useToast } from '../ui';
import MapTiles from './MapTiles';

interface Place { label: string; sublabel?: string; lat: number; lng: number }
interface StopForm { key: number; place: Place | null; name: string; phone: string }
interface Quote { distanceKm: number; durationMin: number; points: [number, number][]; order: number[]; offers: { vehicle: Vehicle; label: string; prices: Record<Speed, number> }[]; surcharges?: { key: string; label: string; pct: number }[]; stopDiscountPct?: number; inAbidjan?: boolean }

export const trackingUrl = (d: Pick<Delivery, 'trackingToken'>) => (d.trackingToken ? `${location.origin}${location.pathname}#/suivi/${d.trackingToken}` : null);

const ABIDJAN: [number, number] = [5.3364, -4.0267];
const VEHICLES: Vehicle[] = ['MOTO', 'CAR', 'CARGO'];
const SPEEDS: Speed[] = ['EXPRESS', 'STANDARD', 'SCHEDULED'];
const VEHICLE_ICON: Record<Vehicle, string> = { MOTO: 'moto', CAR: 'car', CARGO: 'truck' };
const SPEED_HINT: Record<Speed, string> = { EXPRESS: 'Départ immédiat', STANDARD: 'Le plus courant', SCHEDULED: 'Le moins cher' };

/** Marqueur rond numéroté (départ « A » noir, arrêts colorés) */
const pin = (label: string, dark: boolean) =>
  L.divIcon({ className: '', html: `<div class="map-pin${dark ? ' dark' : ''}">${label}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });

function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 15);
    else if (points.length > 1) map.fitBounds(points, { padding: [60, 60], maxZoom: 16 });
  }, [key]);
  return null;
}

function MapClick({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

/** Champ d'adresse avec suggestions (Google / OpenStreetMap via l'API) */
function AddressInput({ value, onChange, placeholder, onMap, picking }: {
  value: Place | null; onChange: (p: Place | null) => void; placeholder: string; onMap: () => void; picking: boolean;
}) {
  const [q, setQ] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  useEffect(() => { setQ(value?.label ?? ''); }, [value?.lat, value?.lng, value?.label]);
  const search = (text: string) => {
    setQ(text);
    if (value) onChange(null);
    window.clearTimeout(timer.current);
    if (text.trim().length < 2) return setResults([]);
    timer.current = window.setTimeout(async () => {
      try {
        setResults(await api<Place[]>(`/geo/search?q=${encodeURIComponent(text.trim())}&lat=${ABIDJAN[0]}&lng=${ABIDJAN[1]}`));
        setOpen(true);
      } catch { setResults([]); }
    }, 300);
  };
  return (
    <div className="address-input">
      <input value={q} placeholder={placeholder} onChange={(e) => search(e.target.value)} onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)} autoComplete="off" />
      <button type="button" className={`map-pick${picking ? ' on' : ''}`} onClick={onMap} title="Choisir sur la carte" aria-label="Choisir sur la carte"><Icon name="pin" size={16} /></button>
      {open && results.length > 0 && (
        <div className="suggestions">
          {results.slice(0, 7).map((r, i) => (
            <button key={i} type="button" onMouseDown={() => { onChange(r); setOpen(false); }}>
              <Icon name="pin" size={15} className="muted" />
              <span><strong>{r.label}</strong><small className="muted">{r.sublabel}</small></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gérant : nouvelle course, présentée comme dans l'app (trajet sur la carte, offres, délai, livreur) */
export default function NewDelivery({ onClose, onOpen }: { onClose: () => void; onOpen?: (d: Delivery) => void }) {
  const { me, drivers, deliveries, reload } = useData();
  const toast = useToast();
  const [pickup, setPickup] = useState<Place | null>(null);
  const [stops, setStops] = useState<StopForm[]>([{ key: 1, place: null, name: '', phone: '' }]);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [vehicle, setVehicle] = useState<Vehicle>('MOTO');
  const [speed, setSpeed] = useState<Speed>('STANDARD');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const [driverId, setDriverId] = useState('');
  const [picking, setPicking] = useState<number | null>(null); // -1 = départ, sinon clé de l'arrêt
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<Delivery | null>(null);
  const [optimizing, setOptimizing] = useState(false);

  const placed = stops.filter((s) => s.place);
  const ready = !!pickup && placed.length === stops.length;
  const key = ready ? [pickup, ...stops.map((s) => s.place)].map((p) => `${p!.lat},${p!.lng}`).join('|') : '';
  useEffect(() => {
    setQuote(null);
    if (!ready) return;
    setQuoting(true);
    api<Quote>('/pricing/quote', { method: 'POST', body: { companyId: me.companyId, pickupLat: pickup!.lat, pickupLng: pickup!.lng, stops: stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng })), keepOrder: true } })
      .then((q) => { setQuote(q); setError(''); if (!q.offers.some((o) => o.vehicle === vehicle) && q.offers[0]) setVehicle(q.offers[0].vehicle); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setQuoting(false));
  }, [key]);

  const offer = quote?.offers.find((o) => o.vehicle === vehicle);
  const gridPrice = offer?.prices[speed];
  const total = manual !== null && manual !== '' ? Number(manual) : gridPrice;
  const busy = useMemo(() => new Set(deliveries.filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP').map((d) => d.driver?.id)), [deliveries]);
  const distanceTo = (u: User) => (pickup && u.lastLat != null && u.lastLng != null ? L.latLng(u.lastLat, u.lastLng).distanceTo([pickup.lat, pickup.lng]) / 1000 : null);
  const team = [...drivers.filter((d) => d.active)].sort((a, b) => {
    const s = (u: User) => (isOnline(u) ? (busy.has(u.id) ? 1 : 0) : 2);
    return s(a) - s(b) || (distanceTo(a) ?? 99) - (distanceTo(b) ?? 99);
  });

  /** Ordre de passage : choisi par le gérant (flèches), ou calculé à la demande */
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const next = [...stops];
    [next[i], next[j]] = [next[j], next[i]];
    setStops(next);
  };
  const optimize = async () => {
    if (!ready) return;
    setOptimizing(true);
    try {
      const q = await api<Quote>('/pricing/quote', { method: 'POST', body: { companyId: me.companyId, pickupLat: pickup!.lat, pickupLng: pickup!.lng, stops: stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng })) } });
      const same = q.order.every((x, i) => x === i);
      setStops(q.order.map((i) => stops[i]));
      toast(same ? 'Votre ordre est déjà le plus court' : `Ordre optimisé · ≈ ${q.durationMin} min · ${q.distanceKm} km`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setOptimizing(false);
    }
  };

  const setStop = (k: number, patch: Partial<StopForm>) => setStops(stops.map((s) => (s.key === k ? { ...s, ...patch } : s)));
  const pickOnMap = async (lat: number, lng: number) => {
    if (picking === null) return;
    const target = picking;
    setPicking(null);
    let label = 'Point sur la carte', sublabel = '';
    try { const r = await api<{ label: string; sublabel: string }>(`/geo/reverse?lat=${lat}&lng=${lng}`); label = r.label; sublabel = r.sublabel; } catch { /* point sans nom */ }
    const place = { label, sublabel, lat, lng };
    if (target === -1) setPickup(place); else setStop(target, { place });
  };

  const errors = {
    pickup: pickup ? null : 'Choisissez l’adresse dans la liste ou sur la carte',
    clientName: clientName.trim() ? null : 'Nom obligatoire',
    clientPhone: phoneError(clientPhone),
  };

  const submit = async () => {
    setTried(true);
    setError('');
    if (errors.pickup || errors.clientName || errors.clientPhone) return setError('Complétez le départ et le client');
    const bad = stops.findIndex((s) => !s.place || !s.name.trim() || phoneError(s.phone));
    if (bad >= 0) {
      const s = stops[bad];
      return setError(`Destinataire ${bad + 1} : ${!s.place ? 'choisissez l’adresse' : !s.name.trim() ? 'nom obligatoire' : `téléphone — ${phoneError(s.phone)}`}`);
    }
    if (!offer) return setError('Cet engin n’est pas proposé dans votre grille');
    if (total === undefined || !Number.isInteger(total) || total < 0) return setError('Prix invalide');
    setSending(true);
    try {
      const d = await api<Delivery>('/deliveries/company-order', {
        method: 'POST',
        body: {
          clientName: clientName.trim(), clientPhone, vehicleType: vehicle, speed,
          pickupLat: pickup!.lat, pickupLng: pickup!.lng, pickupAddress: pickup!.label, pickupPhone: clientPhone, pickupContactName: clientName.trim(),
          stops: stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng, address: s.place!.label, recipientName: s.name.trim(), recipientPhone: s.phone })),
          driverId: driverId || undefined,
          keepOrder: true,
          price: manual !== null && manual !== '' ? total : undefined,
        },
      });
      setCreated(d);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  // ----- Course créée : codes et lien de suivi -----
  if (created) {
    const url = trackingUrl(created);
    const copy = (text: string, label: string) => navigator.clipboard?.writeText(text).then(() => toast(`${label} copié`)).catch(() => {});
    const driver = drivers.find((x) => x.id === created.assignedDriverId);
    return (
      <div className="nd-done">
        <div className="nd-done-card">
          <div className="nd-check"><Icon name="check" size={30} /></div>
          <h1>Course créée</h1>
          <p className="muted">{driver ? `Envoyée à ${driver.name}, qui doit l’accepter.` : 'Visible par tous vos livreurs : le premier qui accepte la prend.'} {formatMoney(created.price, created.currency)} · {created.distanceKm} km</p>
          <div className="nd-section-title">Codes de livraison à envoyer aux destinataires</div>
          <div className="nd-codes">
            {created.stops.map((s) => (
              <div key={s.id} className="nd-code">
                <span className="nd-num">{s.position + 1}</span>
                <div className="grow"><strong>{s.recipientName}</strong><small className="muted">{formatPhone(s.recipientPhone)} · {s.address}</small></div>
                <span className="nd-code-value">{s.confirmationCode}</span>
                <button className="btn secondary" onClick={() => copy(`Bonjour ${s.recipientName}, votre colis arrive avec LETO.\nCode de livraison à donner au livreur : ${s.confirmationCode}${url ? `\nSuivre la livraison : ${url}` : ''}`, 'Message')}>Copier le message</button>
              </div>
            ))}
          </div>
          {url && (
            <>
              <div className="nd-section-title">Lien de suivi en direct (client et destinataires)</div>
              <div className="nd-link"><input readOnly value={url} onFocus={(e) => e.target.select()} /><button className="btn" onClick={() => copy(url, 'Lien')}>Copier</button></div>
            </>
          )}
          <div className="nd-done-actions">
            {onOpen && <button className="btn secondary" onClick={() => onOpen(created)}>Voir la course</button>}
            <button className="btn secondary" onClick={() => { setCreated(null); setPickup(null); setStops([{ key: Date.now(), place: null, name: '', phone: '' }]); setClientName(''); setClientPhone(''); setManual(null); setDriverId(''); setTried(false); }}>Nouvelle course</button>
            <button className="btn" onClick={onClose}>Terminer</button>
          </div>
        </div>
      </div>
    );
  }

  const mapPoints: [number, number][] = [...(pickup ? [[pickup.lat, pickup.lng] as [number, number]] : []), ...placed.map((s) => [s.place!.lat, s.place!.lng] as [number, number])];

  return (
    <div className="nd">
      <div className="nd-panel">
        <button className="back-link" onClick={onClose}><Icon name="chevron" size={15} />Courses</button>
        <h1 className="nd-title">Nouvelle course</h1>

        {/* ----- Trajet ----- */}
        <section className="nd-card">
          <div className="nd-route">
            <div className="nd-route-row">
              <span className="nd-dot dark">A</span>
              <div className="grow">
                <label className="nd-caption">Prise en charge</label>
                <AddressInput value={pickup} onChange={setPickup} placeholder="Adresse de départ" onMap={() => setPicking(picking === -1 ? null : -1)} picking={picking === -1} />
                {tried && errors.pickup && <small className="error">{errors.pickup}</small>}
              </div>
            </div>
            {stops.map((s, i) => (
              <div key={s.key} className="nd-route-row">
                <span className="nd-dot">{i + 1}</span>
                <div className="grow">
                  <label className="nd-caption">{stops.length > 1 ? `Livraison ${i + 1}` : 'Livraison'}</label>
                  <AddressInput value={s.place} onChange={(p) => setStop(s.key, { place: p })} placeholder="Adresse de livraison" onMap={() => setPicking(picking === s.key ? null : s.key)} picking={picking === s.key} />
                </div>
                {stops.length > 1 && (
                  <div className="nd-order">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Livrer plus tôt" title="Livrer plus tôt"><Icon name="chevron" size={13} /></button>
                    <button onClick={() => move(i, 1)} disabled={i === stops.length - 1} aria-label="Livrer plus tard" title="Livrer plus tard"><Icon name="chevron" size={13} /></button>
                  </div>
                )}
                {stops.length > 1 && <button className="nd-remove" onClick={() => setStops(stops.filter((x) => x.key !== s.key))} aria-label="Retirer l’arrêt"><Icon name="close" size={14} /></button>}
              </div>
            ))}
          </div>
          <div className="nd-route-foot">
            <span className="muted">{quote ? `≈ ${quote.durationMin} min · ${quote.distanceKm} km${stops.length > 1 ? ' · livrées dans cet ordre' : ''}` : quoting ? 'Calcul de l’itinéraire…' : 'Saisissez une adresse ou choisissez-la sur la carte'}</span>
            <div>
            {stops.length > 1 && ready && <button className="nd-pill" onClick={optimize} disabled={optimizing} title="Calculer l’ordre le plus court"><Icon name="route" size={14} />{optimizing ? 'Calcul…' : 'Optimiser'}</button>}
            {stops.length < 10 && <button className="nd-pill" onClick={() => setStops([...stops, { key: Date.now(), place: null, name: '', phone: '' }])}><Icon name="plus" size={14} />Arrêt</button>}
            </div>
          </div>
        </section>

        {/* ----- Engin ----- */}
        <div className="nd-section-title">Engin</div>
        <div className="nd-choices">
          {VEHICLES.map((v) => {
            const o = quote?.offers.find((x) => x.vehicle === v);
            const off = !!quote && !o;
            return (
              <button key={v} className={`nd-choice${vehicle === v ? ' on' : ''}`} disabled={off} onClick={() => setVehicle(v)}>
                <span className="nd-choice-icon"><Icon name={VEHICLE_ICON[v]} size={26} /></span>
                <strong>{VEHICLE_LABEL[v]}</strong>
                <small>{off ? 'Non proposé' : o ? formatMoney(o.prices[speed]) : '—'}</small>
              </button>
            );
          })}
        </div>

        {/* ----- Délai ----- */}
        <div className="nd-section-title">Délai</div>
        <div className="nd-choices">
          {SPEEDS.map((s) => (
            <button key={s} className={`nd-choice compact${speed === s ? ' on' : ''}`} onClick={() => setSpeed(s)}>
              <strong>{SPEED_LABEL[s]}</strong>
              <span className="nd-price">{offer ? formatMoney(offer.prices[s]) : '—'}</span>
              <small>{SPEED_HINT[s]}</small>
            </button>
          ))}
        </div>

        {/* ----- Client ----- */}
        <div className="nd-section-title">Client (expéditeur)</div>
        <section className="nd-card nd-fields">
          <div className="nd-field-row">
            <Icon name="people" size={18} className="muted" />
            <input placeholder="Nom du client ou de la boutique" value={clientName} onChange={(e) => setClientName(e.target.value)} autoComplete="off" />
          </div>
          <div className="nd-field-row">
            <PhoneInput plain value={clientPhone} onChange={setClientPhone} label="Téléphone du client (appelé par le livreur)" />
          </div>
          {tried && (errors.clientName || errors.clientPhone) && <small className="error" style={{ padding: '0 14px 10px' }}>{errors.clientName ?? errors.clientPhone}</small>}
        </section>

        {/* ----- Destinataires ----- */}
        <div className="nd-section-title">{stops.length > 1 ? 'Destinataires' : 'Destinataire'}</div>
        {stops.map((s, i) => (
          <section key={s.key} className="nd-card nd-fields">
            <div className="nd-field-head"><span className="nd-dot small">{i + 1}</span><span className="muted ellipsis">{s.place?.label ?? 'Adresse à choisir'}</span></div>
            <div className="nd-field-row">
              <Icon name="people" size={18} className="muted" />
              <input placeholder="Nom du destinataire" value={s.name} onChange={(e) => setStop(s.key, { name: e.target.value })} autoComplete="off" />
            </div>
            <div className="nd-field-row">
              <PhoneInput plain value={s.phone} onChange={(v) => setStop(s.key, { phone: v })} label={`Téléphone du destinataire ${i + 1}`} />
            </div>
          </section>
        ))}

        {/* ----- Livreur ----- */}
        <div className="nd-section-title">Livreur</div>
        <section className="nd-card nd-drivers">
          <button className={`nd-driver${driverId === '' ? ' on' : ''}`} onClick={() => setDriverId('')}>
            <span className="nd-avatar all"><Icon name="bike" size={18} /></span>
            <span className="grow"><strong>Tous mes livreurs</strong><small className="muted">Le premier qui accepte prend la course</small></span>
            {driverId === '' && <Icon name="check" size={18} className="accent" />}
          </button>
          {team.map((u) => {
            const km = distanceTo(u);
            const state = !isOnline(u) ? ['Hors ligne', 'gray'] : busy.has(u.id) ? ['En course', 'purple'] : ['Libre', 'green'];
            return (
              <button key={u.id} className={`nd-driver${driverId === u.id ? ' on' : ''}`} onClick={() => setDriverId(u.id)}>
                <span className="nd-avatar">{initial(u.name)}</span>
                <span className="grow"><strong>{u.name}</strong><small className="muted">{formatPhone(u.phone)}{km != null && isOnline(u) ? ` · à ${km.toFixed(1)} km du départ` : ''}</small></span>
                <Badge color={state[1]}>{state[0]}</Badge>
                {driverId === u.id && <Icon name="check" size={18} className="accent" />}
              </button>
            );
          })}
        </section>
        <small className="muted" style={{ display: 'block', marginTop: 8 }}>Le livreur reçoit la course dans l’app et l’accepte, ou la refuse avec un motif : vous pourrez alors la réaffecter.</small>

        {/* ----- Total ----- */}
        <div className="nd-footer">
          <div className="nd-total">
            <small className="muted">Total · espèces{quote?.surcharges?.map((x) => ` · ${x.label} +${x.pct} %`).join('')}{quote?.stopDiscountPct ? ` · tournée −${quote.stopDiscountPct} %` : ''}</small>
            {manual !== null ? (
              <div className="nd-manual"><input inputMode="numeric" autoFocus value={manual} onChange={(e) => setManual(e.target.value.replace(/\D/g, ''))} placeholder={gridPrice ? String(gridPrice) : 'Prix'} /><span>{currencySymbol()}</span></div>
            ) : (
              <strong>{total !== undefined ? formatMoney(total) : quoting ? '…' : '—'}</strong>
            )}
            <button className="btn plain" onClick={() => setManual(manual === null ? '' : null)}>{manual === null ? 'Modifier le prix' : `Revenir à la grille${gridPrice ? ` (${formatMoney(gridPrice)})` : ''}`}</button>
          </div>
          <button className="btn lg nd-submit" onClick={submit} disabled={sending}>{sending ? 'Création…' : driverId ? 'Créer et envoyer au livreur' : 'Créer la course'}</button>
        </div>
        {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      {/* ----- Carte ----- */}
      <div className={`nd-map${picking !== null ? ' picking' : ''}`}>
        <MapContainer center={ABIDJAN} zoom={12} style={{ height: '100%' }}>
          <MapTiles />
          <FitBounds points={mapPoints} />
          <MapClick onPick={pickOnMap} />
          {quote && <Polyline positions={quote.points} pathOptions={{ color: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6d28d9', weight: 5, opacity: 0.85 }} />}
          {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pin('A', true)} />}
          {stops.map((s, i) => s.place && <Marker key={s.key} position={[s.place.lat, s.place.lng]} icon={pin(String(i + 1), false)} />)}
        </MapContainer>
        {picking !== null && (
          <div className="nd-map-hint"><Icon name="pin" size={16} />Cliquez sur la carte pour placer {picking === -1 ? 'le départ' : 'l’adresse de livraison'}<button className="btn plain" onClick={() => setPicking(null)}>Annuler</button></div>
        )}
      </div>
    </div>
  );
}
