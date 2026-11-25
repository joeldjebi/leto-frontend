import { formatMoney } from './countries';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type Role = 'CLIENT' | 'DRIVER' | 'COMPANY' | 'SUPER_ADMIN';
export type Status = 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';
export type Vehicle = 'MOTO' | 'CAR' | 'CARGO';
export type Speed = 'EXPRESS' | 'STANDARD' | 'SCHEDULED';
export type StopStatus = 'PENDING' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

export interface Company {
  id: string; name: string; phone: string; active: boolean; createdAt: string;
  credit: number; subscriptionEndsAt: string | null;
  /** Fin de l'essai gratuit (sans crédit ni commission) */
  trialEndsAt?: string | null;
  commissionType: CommissionType | null; commissionValue: number | null;
  /** Inscription en ligne : en attente, validée ou refusée par LETO */
  status?: CompanyStatus;
  application?: CompanyApplication | null;
  reviewNote?: string | null; reviewedAt?: string | null;
}
export type CompanyStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface CompanyApplication {
  commune?: string; drivers?: number; vehicles?: Vehicle[]; message?: string;
  managerName?: string; managerPhone?: string; appliedAt?: string;
}
export const COMPANY_STATUS: Record<CompanyStatus, [string, string]> = {
  PENDING: ['En attente', 'orange'], APPROVED: ['Validée', 'green'], REJECTED: ['Refusée', 'red'],
};
export interface User {
  id: string; name: string; phone: string; role: Role; active: boolean;
  companyId: string | null; company?: Company | null; createdAt: string;
  lastLat?: number | null; lastLng?: number | null; lastLocationAt?: string | null;
  accountType?: 'INDIVIDUAL' | 'SHOP' | null;
  avatarUrl?: string | null;
  vehicleType?: Vehicle;
  /** Immatriculation de l'engin (livreurs) */
  plate?: string | null;
  /** Note moyenne donnée par les clients (1 à 5) et nombre d'avis */
  ratingAvg?: number | null;
  ratingCount?: number;
}

/** Compliments et reproches proposés au client quand il note le livreur */
export const RATING_TAG_LABEL: Record<string, string> = {
  FAST: 'Très rapide', POLITE: 'Livreur poli', CAREFUL: 'Colis soigné', COMMUNICATION: 'Bonne communication', ABOVE: 'Au-delà des attentes',
  LATE: 'En retard', RUDE: 'Peu aimable', DAMAGED: 'Colis abîmé', UNREACHABLE: 'Injoignable', ROUTE: 'Mauvais itinéraire',
};
export const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/** Un arrêt d'une course (tournée = plusieurs arrêts) */
export interface Stop {
  id: string; position: number; status: StopStatus;
  address: string; commune: string; details: string | null; lat: number; lng: number;
  recipientName: string; recipientPhone: string; packageDescription: string | null; photoUrl: string | null;
  /** Code de livraison (visible seulement par l'expéditeur et l'entreprise) */
  confirmationCode?: string;
  codAmount: number; codRemittedAt: string | null;
  arrivedAt: string | null; deliveredAt: string | null;
  failedAt: string | null; failureReason: 'ABSENT' | 'REFUSED' | null; failurePhotoUrl: string | null;
  failureNote: string | null; failureLat: number | null; failureLng: number | null;
  disputedAt: string | null; disputeNote: string | null;
  disputeDecision: 'UPHELD' | 'REJECTED' | null; disputeResolutionNote: string | null;
  disputeResolvedBy: string | null; disputeResolvedAt: string | null;
  cancelledAt: string | null; cancelledBy: string | null; cancelReason: string | null;
  cancelRequestedAt: string | null; cancelRequestNote: string | null;
}

export interface Delivery {
  id: string; status: Status; price: number;
  /** Devise de la course (code ISO, ex. XOF) */
  currency?: string;
  pricingDetails?: { inAbidjan: boolean; surchargePct: number; surcharges: { key: string; label: string; pct: number }[]; stopDiscountPct: number } | null;
  vehicleType: Vehicle; speed: Speed;
  distanceKm: number | null; durationMin: number | null;
  pickupCommune: string; pickupAddress: string; pickupDetails: string | null; pickupPhone: string;
  pickupContactName: string | null; pickupLat: number; pickupLng: number; courierComment: string | null;
  stops: Stop[];
  client: User; driver: User | null; company: Company | null;
  createdAt: string; acceptedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null;
  cancelledAt: string | null; cancelReason: string | null; cancelledBy: string | null;
  commissionAmount: number | null; commissionRule: string | null; commissionChargedAt: string | null; commissionRefunded: number;
  cancellationFee: number | null; cancellationFeeSettledAt: string | null;
  returnRequired: boolean; returnedAt: string | null;
  targetCompanyId: string | null; source: 'CLIENT' | 'COMPANY'; assignedDriverId: string | null;
  assignmentNote: string | null; trackingToken: string | null;
  /** Avis du client après la livraison */
  rating?: number | null; ratingTags?: string[] | null; ratingComment?: string | null; ratedAt?: string | null;
}

// ---------- Facturation ----------
export type CommissionType = 'PERCENT' | 'FIXED';
export type PaymentKind = 'SUBSCRIPTION' | 'TOPUP';
export type PaymentStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type CreditType = 'TOPUP' | 'COMMISSION' | 'REFUND' | 'ADJUSTMENT';
export interface MobileMoneyAccount { operator: string; number: string; name: string }
export interface BillingConfig {
  subscriptionFee: number; commissionType: CommissionType; commissionValue: number;
  accounts: MobileMoneyAccount[]; operators: string[];
  /** Abonnement annuel exigé des entreprises */
  subscriptionEnabled: boolean;
  /** Essai gratuit des nouvelles entreprises, en jours (0 = aucun) */
  trialDays: number;
}
export interface Payment {
  id: string; companyId: string; company?: Company; kind: PaymentKind; amount: number;
  operator: string; senderPhone: string; reference: string | null; proofUrl: string;
  status: PaymentStatus; submittedBy: string | null; reviewNote: string | null;
  reviewedBy: string | null; reviewedAt: string | null; createdAt: string;
}
export interface CreditTransaction {
  id: string; type: CreditType; amount: number; balanceAfter: number;
  deliveryId: string | null; paymentId: string | null; note: string | null; createdBy: string | null; createdAt: string;
}
export interface BillingOverview {
  credit: number; reserved: number; available: number;
  subscriptionEndsAt: string | null; subscribed: boolean;
  subscriptionRequired: boolean; trialEndsAt: string | null; inTrial: boolean; trialDaysLeft: number;
  rule: { type: CommissionType; value: number; custom: boolean; label: string };
  month: { commissions: number; topups: number };
  config: BillingConfig; transactions: CreditTransaction[]; payments: Payment[];
}
export const PAYMENT_KIND_LABEL: Record<PaymentKind, string> = { SUBSCRIPTION: 'Abonnement annuel', TOPUP: 'Recharge de crédit' };
export const PAYMENT_STATUS: Record<PaymentStatus, [string, string]> = {
  PENDING: ['À vérifier', 'yellow'], APPROVED: ['Validé', 'green'], REJECTED: ['Refusé', 'red'],
};
export const CREDIT_LABEL: Record<CreditType, string> = {
  TOPUP: 'Recharge', COMMISSION: 'Commission', REFUND: 'Remboursement', ADJUSTMENT: 'Ajustement LETO',
};
export const ruleLabel = (type: CommissionType, value: number) => (type === 'PERCENT' ? `${value} %` : formatMoney(value));
export const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—');
/** Jours restants avant la fin de l'abonnement (négatif = expiré) */
export const daysLeft = (iso: string | null) => (iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000) : null);

export interface Stats {
  days: number;
  series: { day: string; created: number; delivered: number; volume: number }[];
  totals: {
    pending: number; inProgress: number; createdToday: number; deliveredToday: number;
    volumeToday: number; volumeWeek: number; volumeMonth: number; cancelledWeek: number;
    stopsDelivered: number; stopsFailed: number; disputesOpen: number; codToRemit: number;
    driversOnline: number; drivers: number; clients: number; companies: number; failureRateWeek: number;
  };
  topCompanies: { id: string; name: string; delivered: number; volume: number }[];
  topClients: { id: string; name: string; deliveries: number; volume: number }[];
}

export interface VehicleConfig { label: string; description: string; base: number; perKm: number; min: number; enabled: boolean; maxAbidjan: Record<Speed, number> }
export interface SpeedConfig { label: string; description: string; factor: number }
export interface PricingGrid {
  vehicles: Record<Vehicle, VehicleConfig>;
  speeds: Record<Speed, SpeedConfig>;
  codEnabled: boolean; codFee: number; extraStopFee: number;
  cancelFeeEnabled: boolean; cancelFeeType: 'PERCENT' | 'FIXED'; cancelFeeValue: number; cancelFreeMinutes: number;
  returnCodeEnabled: boolean; deliveryCodeEnabled: boolean; cancelRequestAutoMin: number; orderExpiryMin: number; dispatchRadiusKm: number; busyRadiusKm: number; routeCorridorM: number; maxActiveCourses: number; standardMaxActiveCourses: number; standardMaxDetourMin: number; orderPopupSec: number; dispatchWaveSize: number; dispatchWaveSec: number; maxStops: number; absenceWaitMin: number;
  multiStopDiscountPct: number; multiStopDiscountMaxPct: number; surcharges: SurchargeRules;
  updatedAt?: string | null; updatedBy?: string | null;
}

export interface SurchargeRules {
  rushEnabled: boolean; rushPct: number; rushRanges: string[];
  nightEnabled: boolean; nightPct: number; nightRange: string;
  rainMode: 'AUTO' | 'ON' | 'OFF'; rainPct: number; rainThresholdMm: number;
  floodPct: number; floodCommunes: string[]; aboveCap: boolean;
}
export const COMMUNES = ['Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville', 'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët', 'Songon', 'Treichville', 'Yopougon'];
export const stopDiscount = (g: PricingGrid, stops: number) => Math.min(g.multiStopDiscountMaxPct ?? 0, (g.multiStopDiscountPct ?? 0) * Math.max(0, stops - 1));

/**
 * Même formule que le serveur (pricing.ts) : course = max(minimum, base + prix/km × distance) × coefficient du délai,
 * plafonnée dans le Grand Abidjan ; + arrêts supplémentaires (× coefficient) + frais d'encaissement, arrondi aux 50 F.
 */
export function computePrice(g: PricingGrid, km: number, v: Vehicle, s: Speed, stops = 1, cod = 0, inAbidjan = true, surchargePct = 0) {
  const c = g.vehicles[v];
  const factor = g.speeds[s].factor;
  const up = 1 + surchargePct / 100;
  let course = Math.ceil((Math.max(c.min, c.base + c.perKm * km) * factor * up) / 50) * 50;
  const cap = c.maxAbidjan?.[s] ?? 0;
  if (inAbidjan && cap > 0) course = Math.min(course, g.surcharges?.aboveCap ? Math.ceil((cap * up) / 50) * 50 : cap);
  const discounted = (course + g.extraStopFee * Math.max(0, stops - 1) * factor * up) * (1 - stopDiscount(g, stops) / 100);
  return Math.ceil((discounted + g.codFee * cod) / 50) * 50;
}
/** Distance à partir de laquelle le plafond s'applique (km), ou null */
export function capFromKm(g: PricingGrid, v: Vehicle, s: Speed) {
  const c = g.vehicles[v];
  const cap = c.maxAbidjan?.[s] ?? 0;
  if (!cap || !c.perKm) return null;
  const km = (cap / g.speeds[s].factor - c.base) / c.perKm;
  return km > 0 ? Math.round(km * 10) / 10 : 0;
}

// ---------- Libellés ----------
export const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'En attente', ACCEPTED: 'Acceptée', PICKED_UP: 'En cours', DELIVERED: 'Terminée', CANCELLED: 'Annulée',
};
export const STATUS_COLOR: Record<Status, string> = {
  PENDING: 'yellow', ACCEPTED: 'blue', PICKED_UP: 'purple', DELIVERED: 'green', CANCELLED: 'gray',
};
export const VEHICLE_LABEL: Record<Vehicle, string> = { MOTO: 'Moto', CAR: 'Voiture', CARGO: 'Cargo' };
export const SPEED_LABEL: Record<Speed, string> = { EXPRESS: 'Express', STANDARD: 'Standard', SCHEDULED: 'Dans 2 h' };
export const FAILURE_LABEL = { ABSENT: 'Destinataire absent', REFUSED: 'Colis refusé' } as const;
export const ROLE_LABEL: Record<Role, string> = { CLIENT: 'Client', DRIVER: 'Livreur', COMPANY: 'Gérant', SUPER_ADMIN: 'Super Admin' };

// ---------- Formatage ----------
export const codTotal = (d: Delivery) => d.stops.reduce((s, x) => s + x.codAmount, 0);
export const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '—');
export const isOnline = (u: User) => !!u.lastLocationAt && Date.now() - new Date(u.lastLocationAt).getTime() < 120_000;
export const photoUrl = (path: string) => API_URL + path;
export const initial = (name?: string | null) => (name?.trim()?.[0] ?? '?').toUpperCase();

// ---------- Session ----------
let token = localStorage.getItem('leto_token');
export const getToken = () => token;
export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('leto_token', t);
  else localStorage.removeItem('leto_token');
}

/** Erreur prévue pour l'utilisateur (message clair en français) */
export class UserError extends Error {}
export const GENERIC_ERROR = 'Une erreur est survenue. Réessayez dans un instant.';
const OFFLINE_ERROR = 'Impossible de joindre le serveur. Vérifiez votre connexion.';

/** Texte à afficher pour une erreur : jamais de message technique (« Failed to fetch », exceptions JavaScript…) */
export function errText(e: unknown): string {
  return e instanceof UserError && e.message ? e.message : GENERIC_ERROR;
}

/** Message renvoyé par l'API ; erreur interne ou réponse illisible → message générique */
function apiMessage(status: number, data: { message?: unknown } | null, fallback: string) {
  if (status >= 500) return GENERIC_ERROR;
  const m = data?.message;
  const text = Array.isArray(m) ? m.join(', ') : typeof m === 'string' ? m : '';
  return text.trim() || fallback;
}

/** fetch sans message technique en cas de coupure réseau */
async function send(input: string, init: RequestInit) {
  try {
    return await fetch(input, init);
  } catch {
    throw new UserError(OFFLINE_ERROR);
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await send(API_URL + path, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    setToken(null);
    location.reload();
  }
  if (!res.ok) throw new UserError(apiMessage(res.status, data, GENERIC_ERROR));
  return data as T;
}

/** Envoi d'une image (preuve de paiement…) : renvoie son chemin /uploads/… */
export async function upload(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const res = await send(API_URL + '/uploads', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.url) throw new UserError(apiMessage(res.status, data, 'Envoi de l’image impossible. Réessayez.'));
  return data.url as string;
}

/** Export CSV (séparateur « ; » pour Excel en français) */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Livreurs indépendants (LI) ----------
export type IndependentStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export interface IndependentsConfig { registrationOpen: boolean; enabled: boolean; commissionType: CommissionType; commissionValue: number }
export interface IndependentCounts { pending: number; approved: number; rejected: number; suspended: number; draft: number }
export interface IndependentRow {
  id: string; status: IndependentStatus; vehicleType: Vehicle | null; vehiclePlate: string | null; commune: string | null;
  submittedAt: string | null; reviewedAt: string | null; reviewNote: string | null; createdAt: string;
  userId: string; name: string; phone: string; active: boolean; lastLocationAt: string | null;
  companyId: string; credit: number | string; completed: number;
}
export type IndependentDoc = 'selfieUrl' | 'docsSelfieUrl' | 'idFrontUrl' | 'idBackUrl' | 'licenseUrl' | 'registrationUrl' | 'insuranceUrl';
export interface IndependentDossier {
  id: string; status: IndependentStatus; companyId: string;
  birthDate: string | null; commune: string | null; address: string | null;
  idType: 'CNI' | 'PASSPORT' | 'CONSULAR' | 'RESIDENCE' | null; idNumber: string | null;
  emergencyName: string | null; emergencyPhone: string | null;
  vehicleType: Vehicle | null; vehicleBrand: string | null; vehiclePlate: string | null; licenseNumber: string | null;
  consentAt: string | null; submittedAt: string | null; reviewedAt: string | null; reviewedBy: string | null; reviewNote: string | null;
  createdAt: string;
  history: { at: string; action: 'CREATED' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | 'REACTIVATED'; by?: string; note?: string }[];
  user: User;
  links: Partial<Record<IndependentDoc, string | null>>;
  required: { key: string; label: string; ok: boolean }[];
}
export const INDEPENDENT_STATUS: Record<IndependentStatus, [string, string]> = {
  PENDING: ['À vérifier', 'orange'], APPROVED: ['Validé', 'green'], REJECTED: ['Refusé', 'red'],
  SUSPENDED: ['Suspendu', 'gray'], DRAFT: ['Brouillon', 'gray'],
};

// ---------- Sons des notifications (SA) ----------
export type SoundEvent = 'NEW_ORDER' | 'ASSIGNED' | 'CANCELLED' | 'UPDATED' | 'CLIENT_UPDATE';
export interface NotificationSound { id: string; name: string; url: string | null; builtin: boolean }
export interface SoundsConfig { sounds: NotificationSound[]; events: Record<SoundEvent, string>; labels: Record<SoundEvent, string> }
/** Lien d'écoute : sons intégrés copiés dans le back-office, sons ajoutés servis par l'API */
export const soundSrc = (s: NotificationSound) => (s.url ? API_URL + s.url : `${import.meta.env.BASE_URL}sounds/${s.id}.wav`);

/** Ajout d'un son (WAV) : envoi multipart avec le nom */
export async function uploadSound(name: string, file: File): Promise<SoundsConfig> {
  const body = new FormData();
  body.append('name', name);
  body.append('file', file);
  const res = await send(API_URL + '/notifications/sounds', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new UserError(apiMessage(res.status, data, 'Envoi du son impossible. Réessayez.'));
  return data as SoundsConfig;
}

// ---------- Landing page (SA) ----------
export interface LandingText { title: string; text: string }
export interface LandingContent {
  hero: { badge: string; title1: string; title2: string; subtitle: string; ctaPrimary: string; ctaSecondary: string };
  steps: LandingText[];
  tour: LandingText;
  price: { title1: string; title2: string; text: string };
  trust: { title: string; items: LandingText[] };
  pros: { companyTitle: string; companyText: string; driverTitle: string; driverText: string };
  faq: { q: string; a: string }[];
  final: LandingText;
  contact: { phone: string; email: string; whatsapp: string; address: string };
  apk: { url: string | null; version: string; sizeMb: number | null; updatedAt: string | null };
}
export const LANDING_URL = 'https://leto.performx.online';

/** Nouvelle version de l'APK : XMLHttpRequest pour suivre la progression de l'envoi */
export function uploadApk(file: File, version: string, onProgress: (pct: number) => void): Promise<LandingContent> {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    body.append('version', version);
    body.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_URL + '/admin/landing/apk');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      let data: { message?: string | string[] } | null = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* réponse vide */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data as unknown as LandingContent);
      if (xhr.status === 413) return reject(new UserError('Fichier trop lourd (200 Mo maximum)'));
      reject(new UserError(apiMessage(xhr.status, data, 'Envoi de l’APK impossible. Réessayez.')));
    };
    xhr.onerror = () => reject(new UserError('Envoi interrompu : vérifiez la connexion'));
    xhr.send(body);
  });
}
