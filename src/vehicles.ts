import { useMemo, useSyncExternalStore } from 'react';
import { api, Vehicle } from './api';

/** Pictogrammes disponibles pour un engin (mêmes valeurs que le serveur) */
export const VEHICLE_ICONS = ['moto', 'bike', 'tricycle', 'car', 'van', 'truck'] as const;
export type VehicleIcon = (typeof VEHICLE_ICONS)[number];
export const VEHICLE_ICON_LABEL: Record<VehicleIcon, string> = {
  moto: 'Moto', bike: 'Vélo', tricycle: 'Tricycle', car: 'Voiture', van: 'Camionnette', truck: 'Camion',
};
/** Engins d'origine : désactivables, jamais supprimables */
export const BUILTIN_VEHICLES: Vehicle[] = ['MOTO', 'CAR', 'CARGO'];
export const isBuiltinVehicle = (code: string) => BUILTIN_VEHICLES.includes(code);

/** Catalogue public des engins (GET /pricing/vehicles) */
export interface VehicleInfo { code: Vehicle; name: string; label: string; icon: VehicleIcon; description: string; enabled: boolean }

/** Repli tant que le catalogue n'est pas chargé (ou si le serveur est injoignable) */
const FALLBACK: VehicleInfo[] = [
  { code: 'MOTO', name: 'Moto', label: 'Moto', icon: 'moto', description: '', enabled: true },
  { code: 'CAR', name: 'Voiture', label: 'Voiture', icon: 'car', description: '', enabled: true },
  { code: 'CARGO', name: 'Cargo', label: 'Cargo', icon: 'truck', description: '', enabled: true },
];

/** Engins d'origine d'abord (MOTO, CAR, CARGO), puis les engins ajoutés dans l'ordre de la grille */
export function sortVehicleCodes(codes: string[]): string[] {
  const builtin = BUILTIN_VEHICLES.filter((c) => codes.includes(c));
  return [...builtin, ...codes.filter((c) => !BUILTIN_VEHICLES.includes(c))];
}

let catalog: VehicleInfo[] = FALLBACK;
let pending: Promise<void> | null = null;
let loaded = false;
const listeners = new Set<() => void>();

/** (Re)charge le catalogue ; `force` après un ajout ou une suppression d'engin */
export function loadVehicles(force = false): Promise<void> {
  if (pending && !force) return pending;
  if (loaded && !force) return Promise.resolve();
  pending = api<VehicleInfo[]>('/pricing/vehicles')
    .then((list) => {
      if (Array.isArray(list) && list.length) {
        const byCode = new Map(list.map((v) => [v.code, v]));
        catalog = sortVehicleCodes(list.map((v) => v.code)).map((c) => byCode.get(c)!);
        loaded = true;
        listeners.forEach((l) => l());
      }
    })
    .catch(() => { /* garde le repli */ })
    .finally(() => { pending = null; });
  return pending;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  void loadVehicles();
  return () => { listeners.delete(l); };
};
const snapshot = () => catalog;

export interface Vehicles {
  /** Tous les engins (activés ou non), engins d'origine d'abord */
  list: VehicleInfo[];
  /** Engins activés par VITE */
  enabled: VehicleInfo[];
  get: (code: string | null | undefined) => VehicleInfo | undefined;
  /** Nom court (Moto, Vélo…), ou le code si inconnu */
  name: (code: string | null | undefined) => string;
  /** Nom du pictogramme pour <Icon>, moto si inconnu */
  icon: (code: string | null | undefined) => VehicleIcon;
}

function helpers(list: VehicleInfo[]): Vehicles {
  const get = (code: string | null | undefined) => (code ? list.find((v) => v.code === code) : undefined);
  return {
    list,
    enabled: list.filter((v) => v.enabled),
    get,
    name: (code) => get(code)?.name || get(code)?.label || code || '—',
    icon: (code) => get(code)?.icon ?? 'moto',
  };
}

/** Catalogue partagé des engins (mis en cache, chargé une fois) */
export function useVehicles(): Vehicles {
  const list = useSyncExternalStore(subscribe, snapshot);
  return useMemo(() => helpers(list), [list]);
}
