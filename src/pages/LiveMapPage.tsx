import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Tooltip } from 'react-leaflet';
import MapTiles from '../components/MapTiles';
import { io } from 'socket.io-client';
import { API_URL, getToken, time } from '../api';
import { useData } from '../data';
import { Avatar, Badge, Card, Empty, PageHeader, Search } from '../ui';

interface Pos { lat: number; lng: number; at: string }
const ABIDJAN: [number, number] = [5.3364, -4.0267];
const FRESH_MS = 120_000;

/** Positions des livreurs en temps réel (gérant : les siens, SA : tous) */
export default function LiveMapPage() {
  const { drivers, deliveries } = useData();
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [q, setQ] = useState('');
  const [, tick] = useState(0);

  useEffect(() => {
    const initial: Record<string, Pos> = {};
    for (const d of drivers) if (d.lastLat != null && d.lastLng != null && d.lastLocationAt) initial[d.id] = { lat: d.lastLat, lng: d.lastLng, at: d.lastLocationAt };
    setPositions((p) => ({ ...initial, ...p }));
  }, [drivers]);

  useEffect(() => {
    const socket = io(API_URL, { auth: { token: getToken() }, transports: ['websocket'] });
    socket.on('driver:location', (e: { driverId: string; lat: number; lng: number; at: string }) =>
      setPositions((p) => ({ ...p, [e.driverId]: { lat: e.lat, lng: e.lng, at: e.at } })));
    socket.on('driver:offline', (e: { driverId: string }) =>
      setPositions((p) => (p[e.driverId] ? { ...p, [e.driverId]: { ...p[e.driverId], at: new Date(0).toISOString() } } : p)));
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => { socket.disconnect(); clearInterval(t); };
  }, []);

  const busy = useMemo(() => new Set(deliveries.filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP').map((d) => d.driver?.id)), [deliveries]);
  const live = (id: string) => !!positions[id] && Date.now() - new Date(positions[id].at).getTime() < FRESH_MS;
  const list = drivers
    .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.phone.includes(q))
    .sort((a, b) => Number(live(b.id)) - Number(live(a.id)) || a.name.localeCompare(b.name));
  const onlineCount = drivers.filter((d) => live(d.id)).length;

  return (
    <>
      <PageHeader title="Carte en direct" subtitle={`${onlineCount} livreur(s) en ligne sur ${drivers.length}`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 16 }} className="map-layout">
        <div className="card map-wrap">
          <MapContainer center={ABIDJAN} zoom={12} style={{ height: '100%' }}>
            <MapTiles />
            {drivers.filter((d) => positions[d.id]).map((d) => {
              const p = positions[d.id];
              const on = live(d.id);
              return (
                <CircleMarker key={d.id} center={[p.lat, p.lng]} radius={9}
                  pathOptions={{ color: '#fff', weight: 3, fillColor: on ? (busy.has(d.id) ? '#af52de' : '#34c759') : '#8e8e93', fillOpacity: 1 }}>
                  <Tooltip direction="top" offset={[0, -8]} permanent={on}>
                    {d.name}{!on && ` · vu à ${time(p.at)}`}
                  </Tooltip>
                </CircleMarker>
              );
            })}
          </MapContainer>
        </div>
        <Card>
          <div style={{ padding: '14px 14px 6px' }}><Search value={q} onChange={setQ} placeholder="Livreur" /></div>
          {list.length === 0 ? <Empty icon="bike">Aucun livreur</Empty> : (
            <div className="rows" style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
              {list.map((d) => (
                <div key={d.id}>
                  <Avatar name={d.name} />
                  <div className="grow">
                    <div className="title">{d.name}</div>
                    <small className="muted">{d.company?.name ?? d.phone}</small>
                  </div>
                  {live(d.id) ? <Badge color={busy.has(d.id) ? 'purple' : 'green'}>{busy.has(d.id) ? 'En course' : 'Disponible'}</Badge> : <Badge>Hors ligne</Badge>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>
        <span className="dot" style={{ background: '#34c759' }} /> Disponible · <span className="dot" style={{ background: '#af52de' }} /> En course · <span className="dot" style={{ background: '#8e8e93' }} /> Dernière position connue
      </p>
    </>
  );
}
