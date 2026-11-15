const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export type Role = 'CLIENT' | 'DRIVER' | 'COMPANY' | 'ADMIN';
export type Status = 'PENDING' | 'ACCEPTED' | 'PICKED_UP' | 'DELIVERED' | 'CANCELLED';

export interface Company { id: string; name: string; phone: string; active: boolean; createdAt: string }
export interface User {
  id: string; name: string; phone: string; role: Role; active: boolean;
  companyId: string | null; company?: Company | null; createdAt: string;
}
export interface Delivery {
  id: string; status: Status; price: number;
  pickupCommune: string; pickupAddress: string; pickupPhone: string;
  dropoffCommune: string; dropoffAddress: string; recipientName: string; recipientPhone: string;
  packageDescription: string | null;
  client: User; driver: User | null; company: Company | null; createdAt: string;
}

export const STATUS_LABEL: Record<Status, string> = {
  PENDING: 'En attente',
  ACCEPTED: 'Acceptée',
  PICKED_UP: 'En cours',
  DELIVERED: 'Livrée',
  CANCELLED: 'Annulée',
};

export const fcfa = (n: number) => `${n.toLocaleString('fr-FR')} FCFA`;

let token = localStorage.getItem('leta_token');

export function setToken(t: string | null) {
  token = t;
  if (t) localStorage.setItem('leta_token', t);
  else localStorage.removeItem('leta_token');
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(API_URL + path, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (res.status === 401 && token) {
    setToken(null);
    location.reload();
  }
  if (!res.ok) {
    const msg = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
    throw new Error(msg ?? 'Erreur réseau');
  }
  return data as T;
}
