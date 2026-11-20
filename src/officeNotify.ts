import { useSyncExternalStore } from 'react';
import type { Socket } from 'socket.io-client';
import { API_URL } from './api';

/**
 * Notifications locales du back-office (SA et gérants), reçues par le temps réel (`office:notify`) :
 * centre de notifications (cloche), son de l'événement, notification du navigateur quand l'onglet
 * n'est pas affiché. Préférences et historique : propres à ce navigateur (localStorage).
 */

export type OfficeKind =
  | 'NEW_ORDER' | 'ACCEPTED' | 'DECLINED' | 'FINISHED' | 'FAILED' | 'CANCELLED' | 'CANCEL_REQUEST'
  | 'DISPUTE' | 'CREDIT_LOW' | 'PAYMENT' | 'REMITTANCE' | 'COMPANY_APPLY' | 'INDEPENDENT' | 'VIDEO_VISIT';

export interface OfficeNotification {
  id: string;
  kind: OfficeKind;
  title: string;
  body: string;
  link?: string;
  deliveryId?: string;
  sound?: { id: string; url: string | null };
  at: number;
  read?: boolean;
}

/** Catégories proposées selon le rôle (mêmes libellés que l'API) */
export const KIND_LABEL: Record<OfficeKind, string> = {
  NEW_ORDER: 'Nouvelles commandes',
  ACCEPTED: 'Courses acceptées',
  DECLINED: 'Affectations refusées',
  FINISHED: 'Tournées terminées',
  FAILED: 'Livraisons non effectuées',
  CANCELLED: 'Annulations',
  CANCEL_REQUEST: 'Annulations signalées par les livreurs',
  DISPUTE: 'Litiges',
  CREDIT_LOW: 'Crédit insuffisant',
  PAYMENT: 'Paiements',
  REMITTANCE: 'Versements des livreurs',
  COMPANY_APPLY: 'Demandes des entreprises',
  INDEPENDENT: 'Dossiers des livreurs indépendants',
  VIDEO_VISIT: 'Visites de la vidéo de présentation',
};
export const KINDS_FOR = (isSA: boolean): OfficeKind[] =>
  isSA
    ? ['NEW_ORDER', 'DISPUTE', 'PAYMENT', 'COMPANY_APPLY', 'INDEPENDENT', 'VIDEO_VISIT']
    : ['NEW_ORDER', 'ACCEPTED', 'DECLINED', 'CANCEL_REQUEST', 'FAILED', 'FINISHED', 'CANCELLED', 'DISPUTE', 'CREDIT_LOW', 'PAYMENT', 'REMITTANCE'];

export interface OfficePrefs {
  sound: boolean;
  /** Notification du navigateur quand l'onglet n'est pas affiché */
  desktop: boolean;
  muted: OfficeKind[];
  /** Bandeau « activer les notifications » fermé */
  dismissed: boolean;
}

const MAX = 50;
const DEFAULT_PREFS: OfficePrefs = { sound: true, desktop: true, muted: [], dismissed: false };

const read = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* navigation privée : sans mémoire */
  }
};

// ---------- Magasin (historique + préférences), par utilisateur ----------

let owner = 'anon';
let items: OfficeNotification[] = [];
let prefs: OfficePrefs = DEFAULT_PREFS;
let snapshot = { items, prefs, permission: permissionNow() };
const listeners = new Set<() => void>();

function permissionNow(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}
function emit() {
  snapshot = { items, prefs, permission: permissionNow() };
  listeners.forEach((l) => l());
}
function persist() {
  write(`leto_office_items_${owner}`, { list: items });
  write(`leto_office_prefs_${owner}`, prefs);
}

/** À la connexion : historique et préférences de cet utilisateur */
export function initOfficeStore(userId: string) {
  owner = userId;
  try {
    items = JSON.parse(localStorage.getItem(`leto_office_items_${owner}`) ?? '{"list":[]}').list ?? [];
  } catch {
    items = [];
  }
  prefs = read(`leto_office_prefs_${owner}`, DEFAULT_PREFS);
  emit();
}

export function useOffice() {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => snapshot,
  );
}

export function setPrefs(patch: Partial<OfficePrefs>) {
  prefs = { ...prefs, ...patch };
  persist();
  emit();
}
export function toggleKind(kind: OfficeKind) {
  setPrefs({ muted: prefs.muted.includes(kind) ? prefs.muted.filter((k) => k !== kind) : [...prefs.muted, kind] });
}
export function markAllRead() {
  items = items.map((n) => ({ ...n, read: true }));
  persist();
  emit();
}
export function markRead(id: string) {
  items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
  persist();
  emit();
}
export function clearAll() {
  items = [];
  persist();
  emit();
}

/** Demande l'autorisation d'afficher des notifications (doit suivre un clic) */
export async function askPermission() {
  if (typeof Notification === 'undefined') return 'unsupported';
  const p = await Notification.requestPermission();
  if (p === 'granted') setPrefs({ desktop: true, dismissed: true });
  emit();
  return p;
}

// ---------- Son ----------

const audioCache = new Map<string, HTMLAudioElement>();
function play(sound?: { id: string; url: string | null }) {
  if (!prefs.sound || !sound) return;
  const src = sound.url ? API_URL + sound.url : `${import.meta.env.BASE_URL}sounds/${sound.id}.wav`;
  let a = audioCache.get(src);
  if (!a) {
    a = new Audio(src);
    audioCache.set(src, a);
  }
  a.currentTime = 0;
  // Le navigateur peut bloquer le son tant que la page n'a reçu aucun clic : sans conséquence
  a.play().catch(() => undefined);
}

// ---------- Notification du navigateur (service worker si disponible) ----------

let registration: ServiceWorkerRegistration | null = null;
export function registerOfficeWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then((r) => { registration = r; })
    .catch(() => undefined);
  // Clic sur une notification : le service worker demande d'ouvrir la page concernée
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open' && typeof e.data.link === 'string') openLink(e.data.link, e.data.id);
  });
}

export function openLink(link?: string, id?: string) {
  if (id) markRead(id);
  if (link) location.hash = link;
  window.focus();
}

function showDesktop(n: OfficeNotification) {
  if (!prefs.desktop || permissionNow() !== 'granted') return;
  const options: NotificationOptions = {
    body: n.body,
    tag: n.id,
    icon: `${import.meta.env.BASE_URL}icon-192.png`,
    data: { link: n.link ?? '', id: n.id },
  };
  if (registration) {
    registration.showNotification(n.title, options).catch(() => undefined);
    return;
  }
  try {
    const w = new Notification(n.title, options);
    w.onclick = () => { openLink(n.link, n.id); w.close(); };
  } catch {
    /* Android sans service worker : la cloche et le son suffisent */
  }
}

/** Branche les notifications sur la connexion temps réel du back-office */
export function attachOffice(socket: Socket, onToast: (n: OfficeNotification) => void) {
  const handler = (p: Omit<OfficeNotification, 'at'>) => {
    if (!p?.kind || prefs.muted.includes(p.kind)) return;
    const n: OfficeNotification = { ...p, at: Date.now(), read: false };
    items = [n, ...items.filter((x) => x.id !== n.id)].slice(0, MAX);
    persist();
    emit();
    play(n.sound);
    // Onglet affiché : bandeau dans la page ; sinon notification du système
    if (document.visibilityState === 'visible' && document.hasFocus()) onToast(n);
    else showDesktop(n);
  };
  socket.on('office:notify', handler);
  return () => { socket.off('office:notify', handler); };
}

/** « il y a 5 min » */
export function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'à l’instant';
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `il y a ${h} h`;
  return new Date(at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
