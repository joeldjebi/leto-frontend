import { useEffect, useRef, useState } from 'react';
import { api, Delivery, fcfa, isOnline, phoneError, Speed, SPEED_LABEL, Vehicle, VEHICLE_LABEL } from '../api';
import { useData } from '../data';
import { Field, Icon, PhoneInput, Segmented, Sheet, useToast } from '../ui';

interface Place { label: string; sublabel?: string; lat: number; lng: number }
interface StopForm { place: Place | null; name: string; phone: string }
interface Quote { distanceKm: number; durationMin: number; offers: { vehicle: Vehicle; label: string; prices: Record<Speed, number> }[] }

export const trackingUrl = (d: Pick<Delivery, 'trackingToken'>) => (d.trackingToken ? `${location.origin}${location.pathname}#/suivi/${d.trackingToken}` : null);

/** Champ d'adresse avec suggestions (recherche Google / OpenStreetMap via l'API) */
function AddressInput({ value, onChange, placeholder }: { value: Place | null; onChange: (p: Place | null) => void; placeholder: string }) {
  const [q, setQ] = useState(value?.label ?? '');
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<number>();
  const search = (text: string) => {
    setQ(text);
    onChange(null);
    window.clearTimeout(timer.current);
    if (text.trim().length < 2) return setResults([]);
    timer.current = window.setTimeout(async () => {
      try {
        setResults(await api<Place[]>(`/geo/search?q=${encodeURIComponent(text.trim())}&lat=5.3364&lng=-4.0267`));
        setOpen(true);
      } catch { setResults([]); }
    }, 350);
  };
  return (
    <div className="address-input">
      <input value={q} placeholder={placeholder} onChange={(e) => search(e.target.value)} onFocus={() => results.length && setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)} autoComplete="off" />
      {value && <Icon name="check" size={16} className="ok" />}
      {open && results.length > 0 && (
        <div className="suggestions">
          {results.slice(0, 7).map((r, i) => (
            <button key={i} type="button" onMouseDown={() => { onChange(r); setQ(r.label); setOpen(false); }}>
              <strong>{r.label}</strong><small className="muted">{r.sublabel}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Gérant : nouvelle course (commande reçue par téléphone…), affectée ou non à un livreur */
export default function NewDelivery({ onClose }: { onClose: () => void }) {
  const { me, drivers, deliveries, reload } = useData();
  const toast = useToast();
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [pickup, setPickup] = useState<Place | null>(null);
  const [stops, setStops] = useState<StopForm[]>([{ place: null, name: '', phone: '' }]);
  const [vehicle, setVehicle] = useState<Vehicle>('MOTO');
  const [speed, setSpeed] = useState<Speed>('STANDARD');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [manualPrice, setManualPrice] = useState('');
  const [driverId, setDriverId] = useState('');
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [created, setCreated] = useState<Delivery | null>(null);

  const ready = pickup && stops.every((s) => s.place);
  const key = ready ? [pickup, ...stops.map((s) => s.place)].map((p) => `${p!.lat},${p!.lng}`).join('|') : '';
  useEffect(() => {
    setQuote(null);
    if (!ready) return;
    api<Quote>('/pricing/quote', { method: 'POST', body: { companyId: me.companyId, pickupLat: pickup!.lat, pickupLng: pickup!.lng, stops: stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng })) } })
      .then(setQuote).catch((e) => setError((e as Error).message));
  }, [key]);

  const offer = quote?.offers.find((o) => o.vehicle === vehicle);
  const gridPrice = offer?.prices[speed];
  const busy = new Set(deliveries.filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP').map((d) => d.driver?.id));
  const sorted = [...drivers.filter((d) => d.active)].sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)));
  const setStop = (i: number, patch: Partial<StopForm>) => setStops(stops.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const errors = {
    clientName: clientName.trim() ? null : 'Nom obligatoire',
    clientPhone: phoneError(clientPhone),
    pickup: pickup ? null : 'Choisissez l’adresse dans la liste',
  };

  const submit = async () => {
    setTried(true);
    setError('');
    if (errors.clientName || errors.clientPhone || errors.pickup) return;
    const bad = stops.findIndex((s) => !s.place || !s.name.trim() || phoneError(s.phone));
    if (bad >= 0) return setError(`Destinataire ${bad + 1} : adresse (choisie dans la liste), nom et téléphone à 10 chiffres`);
    if (!offer) return setError('Engin indisponible pour cette course');
    const price = manualPrice ? Number(manualPrice) : undefined;
    if (price !== undefined && (!Number.isInteger(price) || price < 0)) return setError('Prix invalide');
    setSending(true);
    try {
      const d = await api<Delivery>('/deliveries/company-order', {
        method: 'POST',
        body: {
          clientName: clientName.trim(), clientPhone, vehicleType: vehicle, speed,
          pickupLat: pickup!.lat, pickupLng: pickup!.lng, pickupAddress: pickup!.label, pickupPhone: clientPhone, pickupContactName: clientName.trim(),
          stops: stops.map((s) => ({ lat: s.place!.lat, lng: s.place!.lng, address: s.place!.label, recipientName: s.name.trim(), recipientPhone: s.phone })),
          driverId: driverId || undefined, price,
        },
      });
      setCreated(d);
      reload();
      toast(driverId ? 'Course créée et envoyée au livreur' : 'Course créée — visible par vos livreurs');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (created) {
    const url = trackingUrl(created);
    const copy = (text: string, label: string) => navigator.clipboard?.writeText(text).then(() => toast(`${label} copié`)).catch(() => {});
    return (
      <Sheet title="Course créée" onClose={onClose}>
        <div className="alert info">Envoyez à chaque destinataire son code de livraison : le livreur le demandera à la remise. Le lien de suivi peut être partagé au client et aux destinataires.</div>
        <div className="group">
          {created.stops.map((s) => (
            <div key={s.id}>
              <span className="stop-num" style={{ background: '#6D28D9' }}>{s.position + 1}</span>
              <div style={{ flex: 1 }}><strong>{s.recipientName}</strong><small className="muted" style={{ display: 'block' }}>{s.recipientPhone} · {s.address}</small></div>
              <strong className="tabular" style={{ letterSpacing: 3 }}>{s.confirmationCode}</strong>
              <button className="btn plain" onClick={() => copy(`Bonjour ${s.recipientName}, votre colis arrive avec LETO. Code de livraison à donner au livreur : ${s.confirmationCode}${url ? `\nSuivi : ${url}` : ''}`, 'Message')}>Copier le message</button>
            </div>
          ))}
        </div>
        {url && (
          <Field label="Lien de suivi (client et destinataires)">
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={url} onFocus={(e) => e.target.select()} />
              <button className="btn" onClick={() => copy(url, 'Lien')}>Copier</button>
            </div>
          </Field>
        )}
        <button className="btn secondary" onClick={onClose}>Terminer</button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Nouvelle course" onClose={onClose}>
      <div className="form">
        <div className="section-title">Client (expéditeur)</div>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Nom" error={tried ? errors.clientName : null}><input value={clientName} onChange={(e) => setClientName(e.target.value)} autoComplete="off" /></Field>
          <Field label="Téléphone" error={tried ? errors.clientPhone : null} hint="Il pourra suivre la course dans l’app avec ce numéro"><PhoneInput value={clientPhone} onChange={setClientPhone} /></Field>
        </div>
        <Field label="Adresse de départ" error={tried ? errors.pickup : null}><AddressInput value={pickup} onChange={setPickup} placeholder="Quartier, rue, commerce…" /></Field>

        <div className="section-title">Destinataires</div>
        {stops.map((s, i) => (
          <div key={i} className="stop-form">
            <div className="stop-form-head"><span className="stop-num" style={{ background: '#6D28D9' }}>{i + 1}</span>
              {stops.length > 1 && <button className="btn plain" onClick={() => setStops(stops.filter((_, j) => j !== i))}>Retirer</button>}</div>
            <AddressInput value={s.place} onChange={(p) => setStop(i, { place: p })} placeholder="Adresse de livraison" />
            <div className="grid grid-2" style={{ gap: 10 }}>
              <input placeholder="Nom du destinataire" value={s.name} onChange={(e) => setStop(i, { name: e.target.value })} autoComplete="off" />
              <PhoneInput value={s.phone} onChange={(v) => setStop(i, { phone: v })} />
            </div>
          </div>
        ))}
        {stops.length < 10 && <button className="btn plain" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setStops([...stops, { place: null, name: '', phone: '' }])}><Icon name="plus" size={14} /> Ajouter un arrêt</button>}

        <div className="section-title">Offre et prix</div>
        <Segmented<Vehicle> value={vehicle} onChange={setVehicle} options={(['MOTO', 'CAR', 'CARGO'] as Vehicle[]).map((v) => [v, VEHICLE_LABEL[v]])} />
        <Segmented<Speed> value={speed} onChange={setSpeed} options={(['EXPRESS', 'STANDARD', 'SCHEDULED'] as Speed[]).map((s) => [s, SPEED_LABEL[s]])} />
        <div className="price-line">
          {quote ? (offer ? <><span>Votre grille : <strong>{fcfa(gridPrice!)}</strong></span><span className="muted">{quote.distanceKm} km · ~{quote.durationMin} min</span></> : <span className="muted">Engin non proposé dans votre grille</span>)
            : <span className="muted">{ready ? 'Calcul du prix…' : 'Renseignez les adresses pour calculer le prix'}</span>}
        </div>
        <Field label="Prix appliqué (facultatif)" hint="Laissez vide pour appliquer votre grille"><input inputMode="numeric" value={manualPrice} onChange={(e) => setManualPrice(e.target.value.replace(/\D/g, ''))} placeholder={gridPrice ? String(gridPrice) : ''} /></Field>

        <div className="section-title">Livreur</div>
        <select value={driverId} onChange={(e) => setDriverId(e.target.value)} aria-label="Livreur">
          <option value="">Tous mes livreurs (le premier qui accepte)</option>
          {sorted.map((d) => <option key={d.id} value={d.id}>{d.name} · {isOnline(d) ? (busy.has(d.id) ? 'en course' : 'en ligne, libre') : 'hors ligne'}</option>)}
        </select>
        <small className="muted">Le livreur reçoit la course et l’accepte, ou la refuse avec un motif : vous pouvez alors la réaffecter.</small>

        {error && <div className="alert error">{error}</div>}
        <button className="btn lg" onClick={submit} disabled={sending}>{sending ? 'Création…' : 'Créer la course'}</button>
      </div>
    </Sheet>
  );
}
