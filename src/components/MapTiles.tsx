import { useEffect, useState } from 'react';
import { TileLayer } from 'react-leaflet';
import { api } from '../api';

/** Fond de carte choisi par le SA (OpenStreetMap, Carto, MapTiler, Mapbox ou Google) */
export interface MapStyle {
  provider: 'osm' | 'carto' | 'maptiler' | 'mapbox' | 'google';
  label: string;
  light: string;
  dark: string | null;
  subdomains: string[];
  maxZoom: number;
  attribution: string;
  fallback?: string;
}

const OSM: MapStyle = {
  provider: 'osm', label: 'OpenStreetMap', light: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  dark: null, subdomains: [], maxZoom: 19, attribution: '© OpenStreetMap',
};

let cached: MapStyle | null = null;
let pending: Promise<MapStyle> | null = null;
const listeners = new Set<(s: MapStyle) => void>();

/** Recharge le fond de carte (après un changement par le SA) */
export function refreshMapStyle(next?: MapStyle) {
  pending = next ? Promise.resolve(next) : api<MapStyle>('/geo/map-style').catch(() => OSM);
  pending.then((s) => {
    cached = s;
    listeners.forEach((l) => l(s));
  });
  return pending;
}

export function useMapStyle() {
  const [style, setStyle] = useState<MapStyle>(cached ?? OSM);
  useEffect(() => {
    listeners.add(setStyle);
    if (!cached && !pending) refreshMapStyle();
    else if (cached) setStyle(cached);
    return () => { listeners.delete(setStyle); };
  }, []);
  return style;
}

/** Thème actuel du back-office (suit le sélecteur Clair / Sombre) */
function useDark() {
  const read = () => document.documentElement.dataset.theme === 'dark';
  const [dark, setDark] = useState(read);
  useEffect(() => {
    const o = new MutationObserver(() => setDark(read()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => o.disconnect();
  }, []);
  return dark;
}

/** Couche de tuiles à placer dans un <MapContainer> */
export default function MapTiles() {
  const style = useMapStyle();
  const dark = useDark();
  const url = dark && style.dark ? style.dark : style.light;
  return (
    <TileLayer
      key={url}
      url={url}
      subdomains={style.subdomains.length ? style.subdomains : 'abc'}
      maxZoom={style.maxZoom}
      attribution={style.attribution}
      // Pas de variante sombre chez ce fournisseur : on assombrit les tuiles claires
      className={dark && !style.dark ? 'tiles-invert' : undefined}
    />
  );
}
