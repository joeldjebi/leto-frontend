import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import { API_URL, time, VEHICLE_LABEL, Vehicle } from '../api';
import MapTiles from '../components/MapTiles';
import { Icon } from '../ui';

interface Track {
  status: 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';
  createdAt: string; acceptedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null; cancelledAt: string | null;
  vehicleType: Vehicle; sender: string | null;
  pickup: { address: string; commune: string; lat: number; lng: number };
  stops: { position: number; recipient: string; address: string; commune: string; lat: number; lng: number; status: string; deliveredAt: string | null }[];
  company: { name: string; phone: string } | null;
  driver: { name: string; phone: string | null; position: { lat: number; lng: number; at: string } | null } | null;
  etaMin: number | null; nextStop: number | null;
}

const TITLE: Record<Track['status'], string> = {
  PENDING: 'Recherche d’un livreur',
  ACCEPTED: 'Le livreur va chercher le colis',
  PICKED_UP: 'Colis en route',
  DELIVERED: 'Livraison terminée',
  CANCELLED: 'Livraison annulée',
};
const STEPS = ['PENDING', 'ACCEPTED', 'PICKED_UP', 'DELIVERED'] as const;

/** Recentre la carte quand les points changent */
function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(',')).join('|');
  useEffect(() => {
    if (points.length) map.fitBounds(points, { padding: [40, 40], maxZoom: 16 });
  }, [key]);
  return null;
}

/** Page publique de suivi (lien partagé au client ou aux destinataires), rafraîchie toutes les 5 s */
export default function PublicTracking({ token }: { token: string }) {
  const [t, setT] = useState<Track | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/track/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message ?? 'Lien de suivi invalide');
        if (!stop) { setT(data); setError(''); }
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { stop = true; window.clearInterval(timer); };
  }, [token]);

  if (!t) {
    return (
      <div className="track-page">
        <div className="track-card"><div className="brand-mini"><span className="app-icon"><Icon name="bike" size={18} /></span><strong>LETO</strong></div>
          <p className="muted">{error || 'Chargement du suivi…'}</p></div>
      </div>
    );
  }

  const step = STEPS.indexOf(t.status as (typeof STEPS)[number]);
  const pos = t.driver?.position;
  const points: [number, number][] = [[t.pickup.lat, t.pickup.lng], ...t.stops.map((s) => [s.lat, s.lng] as [number, number]), ...(pos ? [[pos.lat, pos.lng] as [number, number]] : [])];
  const done = t.stops.filter((s) => s.status === 'DELIVERED').length;

  return (
    <div className="track-page">
      <div className="track-map">
        <MapContainer center={[t.pickup.lat, t.pickup.lng]} zoom={13} style={{ height: '100%' }} zoomControl={false}>
          <MapTiles />
          <Fit points={points} />
          <Polyline positions={[[t.pickup.lat, t.pickup.lng], ...t.stops.map((s) => [s.lat, s.lng] as [number, number])]} pathOptions={{ color: '#6D28D9', weight: 3, opacity: 0.5, dashArray: '6 8' }} />
          <CircleMarker center={[t.pickup.lat, t.pickup.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#121214', fillOpacity: 1 }}>
            <Tooltip>Départ · {t.pickup.address}</Tooltip>
          </CircleMarker>
          {t.stops.map((s) => (
            <CircleMarker key={s.position} center={[s.lat, s.lng]} radius={9}
              pathOptions={{ color: '#fff', weight: 3, fillColor: s.status === 'DELIVERED' ? '#16A34A' : s.status === 'FAILED' ? '#E11D48' : s.status === 'CANCELLED' ? '#8e8e93' : '#6D28D9', fillOpacity: 1 }}>
              <Tooltip>{s.position + 1}. {s.recipient} · {s.address}</Tooltip>
            </CircleMarker>
          ))}
          {pos && (
            <CircleMarker center={[pos.lat, pos.lng]} radius={12} pathOptions={{ color: '#fff', weight: 4, fillColor: '#8B5CF6', fillOpacity: 1 }}>
              <Tooltip permanent direction="top">{t.driver?.name}</Tooltip>
            </CircleMarker>
          )}
        </MapContainer>
      </div>

      <div className="track-card">
        <div className="brand-mini"><span className="app-icon"><Icon name="bike" size={18} /></span><strong>LETO</strong><span className="muted">Suivi de livraison</span></div>
        <h1>{TITLE[t.status]}</h1>
        {t.etaMin != null && <div className="track-eta">Arrivée estimée dans <strong>{t.etaMin} min</strong>{t.status === 'ACCEPTED' ? ' au point de départ' : ''}</div>}
        {t.status !== 'CANCELLED' && (
          <div className="track-steps" aria-label="Étapes">
            {['Commandée', 'Acceptée', 'En route', 'Livrée'].map((label, i) => (
              <div key={label} className={i <= step ? 'on' : ''}><span />{label}</div>
            ))}
          </div>
        )}
        {t.driver && (
          <div className="track-row">
            <span className="avatar">{t.driver.name[0]}</span>
            <div style={{ flex: 1 }}>
              <strong>{t.driver.name}</strong>
              <small className="muted" style={{ display: 'block' }}>{VEHICLE_LABEL[t.vehicleType]}{t.company ? ` · ${t.company.name}` : ''}{pos ? ` · position à ${time(pos.at)}` : ''}</small>
            </div>
            {t.driver.phone && <a className="btn secondary" href={`tel:${t.driver.phone}`}><Icon name="phone" size={15} />{t.driver.phone}</a>}
          </div>
        )}
        <div className="track-list">
          <div className="track-row"><span className="dot" style={{ background: '#121214' }}>A</span><div><strong>Départ</strong><small className="muted" style={{ display: 'block' }}>{t.pickup.address}{t.sender ? ` · ${t.sender}` : ''}</small></div></div>
          {t.stops.map((s) => (
            <div key={s.position} className="track-row">
              <span className="dot" style={{ background: s.status === 'DELIVERED' ? '#16A34A' : s.status === 'FAILED' ? '#E11D48' : s.status === 'CANCELLED' ? '#8e8e93' : '#6D28D9' }}>{s.position + 1}</span>
              <div style={{ flex: 1 }}>
                <strong>{s.recipient}</strong>
                <small className="muted" style={{ display: 'block' }}>{s.address} ({s.commune})</small>
              </div>
              <small className="muted">
                {s.status === 'DELIVERED' ? `Livré ${time(s.deliveredAt)}` : s.status === 'FAILED' ? 'Non livré' : s.status === 'CANCELLED' ? 'Annulé' : t.nextStop === s.position ? 'Prochain arrêt' : 'À livrer'}
              </small>
            </div>
          ))}
        </div>
        {t.stops.length > 1 && <small className="muted">{done}/{t.stops.length} colis livrés</small>}
        <small className="muted">Mis à jour automatiquement toutes les 5 secondes.</small>
      </div>
    </div>
  );
}
