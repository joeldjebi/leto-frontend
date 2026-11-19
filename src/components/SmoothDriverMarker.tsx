import L from 'leaflet';
import { ReactNode, useEffect, useRef } from 'react';
import { Marker, useMap } from 'react-leaflet';

/** Cap (degrés) du point a vers le point b */
function bearing(a: L.LatLng, b: L.LatLng) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

/**
 * Marqueur du livreur en direct, façon suivi pro :
 *  - glisse en continu d'un point GPS au suivant, sur une durée égale à l'intervalle entre deux positions
 *    (pas de saut ni d'arrêt entre deux mises à jour) ;
 *  - une pointe (élément `.trk-heading` de l'icône) tourne vers le sens de marche ;
 *  - `follow` : la carte accompagne le livreur.
 */
export default function SmoothDriverMarker({ lat, lng, heading, icon, follow, children }: {
  lat: number; lng: number; heading?: number | null; icon: L.DivIcon; follow?: boolean; children?: ReactNode;
}) {
  const map = useMap();
  const marker = useRef<L.Marker | null>(null);
  const initial = useRef<[number, number]>([lat, lng]); // position fixe pour React : l'animation déplace le marqueur
  const anim = useRef({ from: L.latLng(lat, lng), to: L.latLng(lat, lng), start: 0, dur: 0, frame: 0, lastFix: 0, turns: 0, hasHeading: false });
  const followRef = useRef(follow);
  followRef.current = follow;

  const applyHeading = () => {
    const el = marker.current?.getElement()?.querySelector<HTMLElement>('.trk-heading');
    if (!el) return;
    el.style.opacity = anim.current.hasHeading ? '1' : '0';
    el.style.transform = `rotate(${anim.current.turns * 360}deg)`;
  };

  useEffect(() => {
    const a = anim.current;
    const m = marker.current;
    const next = L.latLng(lat, lng);
    const now = performance.now();
    const shown = m ? m.getLatLng() : a.to;
    const gap = a.lastFix ? now - a.lastFix : 1000;
    a.lastFix = now;
    const jump = shown.distanceTo(next);
    // Cap : celui du GPS si connu, sinon la direction du déplacement
    const deg = heading ?? (jump > 4 ? bearing(a.to, next) : null);
    if (deg != null) {
      let delta = deg / 360 - (((a.turns % 1) + 1) % 1);
      if (delta > 0.5) delta -= 1;
      if (delta < -0.5) delta += 1;
      a.turns += delta;
      a.hasHeading = true;
      applyHeading();
    }
    cancelAnimationFrame(a.frame);
    a.to = next;
    // Saut irréaliste (reprise après coupure) : placement direct
    if (!m || jump > 400 || jump < 0.5) {
      m?.setLatLng(next);
      if (followRef.current) map.panTo(next, { animate: jump < 400 });
      return;
    }
    a.from = shown;
    a.start = now;
    a.dur = Math.min(4000, Math.max(500, gap * 1.1));
    const step = (t: number) => {
      const k = Math.min(1, (t - a.start) / a.dur);
      const p = L.latLng(a.from.lat + (a.to.lat - a.from.lat) * k, a.from.lng + (a.to.lng - a.from.lng) * k);
      m.setLatLng(p);
      if (followRef.current) map.setView(p, map.getZoom(), { animate: false });
      if (k < 1) a.frame = requestAnimationFrame(step);
    };
    a.frame = requestAnimationFrame(step);
  }, [lat, lng]);

  // Nouvelle icône (engin, état) : remettre la pointe dans le bon sens
  useEffect(() => { applyHeading(); }, [icon]);

  useEffect(() => {
    if (follow && marker.current) map.setView(marker.current.getLatLng(), Math.max(map.getZoom(), 16));
  }, [follow]);

  useEffect(() => () => cancelAnimationFrame(anim.current.frame), []);

  return (
    <Marker ref={marker} position={initial.current} icon={icon} zIndexOffset={1000}
      eventHandlers={{ add: applyHeading }}>
      {children}
    </Marker>
  );
}
