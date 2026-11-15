import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet';
import { io } from 'socket.io-client';
import { API_URL, getToken, User } from '../api';

interface Position { lat: number; lng: number; at: string }

const ABIDJAN: [number, number] = [5.3364, -4.0267];
const FRESH_MS = 2 * 60 * 1000; // position "en direct" si reçue il y a moins de 2 min

/**
 * Carte en direct des livreurs (gérant : ses livreurs, SA : tous).
 * Positions initiales = dernière position connue, puis mises à jour via Socket.IO.
 */
export default function LiveMap({ drivers }: { drivers: User[] }) {
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [, tick] = useState(0);

  // Dernières positions connues
  useEffect(() => {
    const initial: Record<string, Position> = {};
    for (const d of drivers) {
      if (d.lastLat != null && d.lastLng != null && d.lastLocationAt) {
        initial[d.id] = { lat: d.lastLat, lng: d.lastLng, at: d.lastLocationAt };
      }
    }
    setPositions((p) => ({ ...initial, ...p }));
  }, [drivers]);

  // Flux temps réel
  useEffect(() => {
    const socket = io(API_URL, { auth: { token: getToken() }, transports: ['websocket'] });
    socket.on('driver:location', (e: { driverId: string; lat: number; lng: number; at: string }) => {
      setPositions((p) => ({ ...p, [e.driverId]: { lat: e.lat, lng: e.lng, at: e.at } }));
    });
    const timer = setInterval(() => tick((n) => n + 1), 15000); // rafraîchit l'état "en direct"
    return () => {
      socket.disconnect();
      clearInterval(timer);
    };
  }, []);

  const byId = Object.fromEntries(drivers.map((d) => [d.id, d]));
  const entries = Object.entries(positions).filter(([id]) => byId[id]);
  const live = entries.filter(([, p]) => Date.now() - new Date(p.at).getTime() < FRESH_MS);

  return (
    <div>
      <p className="muted">
        {live.length} livreur(s) en direct · {entries.length - live.length} hors ligne (dernière position connue)
      </p>
      <div className="map-wrap">
        <MapContainer center={ABIDJAN} zoom={12} style={{ height: '100%' }}>
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {entries.map(([id, p]) => {
            const isLive = Date.now() - new Date(p.at).getTime() < FRESH_MS;
            const d = byId[id];
            return (
              <CircleMarker
                key={id}
                center={[p.lat, p.lng]}
                radius={9}
                pathOptions={{ color: '#fff', weight: 3, fillColor: isLive ? '#009e60' : '#9ca3af', fillOpacity: 1 }}
              >
                <Tooltip direction="top" offset={[0, -8]} permanent={isLive}>
                  {d.name}
                  {d.company && byId[id].role === 'DRIVER' ? ` · ${d.company.name}` : ''}
                  {!isLive && ` · vu ${new Date(p.at).toLocaleTimeString('fr-FR', { timeStyle: 'short' })}`}
                </Tooltip>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
