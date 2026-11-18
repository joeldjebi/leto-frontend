import { useSyncExternalStore } from 'react';
import { api } from './api';

/** Pays géré par le SA (indicatif, format des numéros, devise) */
export interface Country {
  id: string; iso: string; name: string; flag: string;
  dialCode: string; // sans « + », ex. 225
  phoneLength: number; // chiffres après l'indicatif (10 en Côte d'Ivoire)
  trunkPrefix: string; // préfixe national retiré à l'international (« 0 » au Ghana, vide en Côte d'Ivoire)
  phoneExample: string; // format local, les espaces donnent le regroupement à l'affichage
  currencyCode: string; currencySymbol: string; currencyName: string; currencyDecimals: number;
  active: boolean; operating: boolean; sortOrder: number;
}

/** Drapeau emoji à partir du code ISO (CI → 🇨🇮) */
export const flagOf = (iso: string) =>
  /^[A-Za-z]{2}$/.test(iso) ? iso.toUpperCase().replace(/[A-Z]/g, (ch) => String.fromCodePoint(0x1f1e6 + ch.charCodeAt(0) - 65)) : '🏳️';

/** Valeur de secours tant que /countries n'a pas répondu (affichage identique à l'existant) */
const CI: Country = {
  id: 'CI', iso: 'CI', name: 'Côte d’Ivoire', flag: flagOf('CI'), dialCode: '225', phoneLength: 10, trunkPrefix: '',
  phoneExample: '07 01 02 03 04', currencyCode: 'XOF', currencySymbol: 'F', currencyName: 'Franc CFA (BCEAO)', currencyDecimals: 0,
  active: true, operating: true, sortOrder: 1,
};

interface CountriesState { countries: Country[]; operating: Country }
let state: CountriesState = { countries: [CI], operating: CI };
const listeners = new Set<() => void>();

/** Pays actifs (chargés au démarrage, rechargés sur `countries:changed`) */
export function loadCountries() {
  return api<{ operating: string; countries: Country[] }>('/countries')
    .then((r) => {
      const countries = r.countries.length ? r.countries : [CI];
      const operating = countries.find((c) => c.iso === r.operating) ?? countries.find((c) => c.operating) ?? countries[0];
      state = { countries, operating };
      listeners.forEach((l) => l());
    })
    .catch(() => { /* hors ligne : on garde la dernière liste */ });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Liste des pays actifs + pays où LETO livre ; le composant se redessine quand le SA change un pays */
export const useCountries = () => useSyncExternalStore(subscribe, () => state);
export const operatingCountry = () => state.operating;
export const activeCountries = () => state.countries;

// ---------- Montants ----------

/** Devise par code ISO (XOF…), sinon celle du pays où LETO livre */
export const currencyOf = (code?: string | null) => state.countries.find((c) => c.currencyCode === code) ?? state.operating;

/** Montant dans une devise (par défaut celle du pays où LETO livre) : « 1 500 F » */
export function formatMoney(amount: number | null | undefined, currencyCode?: string | null) {
  const c = currencyOf(currencyCode);
  const n = Number(amount ?? 0) || 0;
  const d = c.currencyDecimals ?? 0;
  const txt = d === 0
    ? Math.round(n).toLocaleString('fr-FR')
    : n.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(n) ? 0 : d, maximumFractionDigits: d });
  return `${txt} ${c.currencySymbol}`;
}
/** Symbole seul (à côté des champs de saisie d'un montant) */
export const currencySymbol = (currencyCode?: string | null) => currencyOf(currencyCode).currencySymbol;

// ---------- Téléphones ----------

const digitsOf = (s: string) => s.replace(/\D/g, '');

/** Chiffres nationaux (préfixe national retiré s'il a été saisi) */
export function nationalDigits(country: Country, input: string) {
  let d = digitsOf(input);
  const t = country.trunkPrefix ?? '';
  if (t && d.length === country.phoneLength + t.length && d.startsWith(t)) d = d.slice(t.length);
  return d;
}

/** Numéro au format international (+2250701020304), ou null s'il est invalide pour ce pays */
export function toE164(country: Country, input: string) {
  const d = nationalDigits(country, input);
  return d.length === country.phoneLength ? `+${country.dialCode}${d}` : null;
}

/** Message d'erreur (en français) ou null si le numéro est valide pour ce pays */
export function validatePhone(country: Country, input: string, required = true): string | null {
  const raw = digitsOf(input);
  if (!raw) return required ? 'Numéro obligatoire' : null;
  if (toE164(country, input)) return null;
  const t = country.trunkPrefix;
  const n = nationalDigits(country, input).length;
  return `${n} chiffre(s) sur ${country.phoneLength}${t ? ` (sans le ${t} initial)` : ''} — format attendu : ${country.phoneExample || '0'.repeat(country.phoneLength)}`;
}

/** Pays d'un numéro international (indicatif le plus long d'abord), avec ses chiffres nationaux */
export function parsePhone(value: string | null | undefined): { country: Country; national: string } | null {
  const s = (value ?? '').trim();
  if (!s.startsWith('+')) return null;
  const rest = digitsOf(s);
  const c = [...state.countries].sort((a, b) => b.dialCode.length - a.dialCode.length).find((x) => rest.startsWith(x.dialCode));
  return c ? { country: c, national: rest.slice(c.dialCode.length) } : null;
}

/**
 * Erreur d'une valeur émise par <PhoneInput> (international, ou ancien format local accepté par l'API).
 * `required` = false : champ facultatif.
 */
export function phoneError(value: string | null | undefined, required = true): string | null {
  const v = (value ?? '').trim();
  if (!v) return required ? 'Numéro obligatoire' : null;
  const p = parsePhone(v);
  if (p) return validatePhone(p.country, p.national, required);
  if (v.startsWith('+')) return 'Indicatif non pris en charge';
  return validatePhone(state.operating, v, required);
}

/** Groupes de chiffres d'après l'exemple (« 07 01 02 03 04 » → 2-2-2-2-2), sinon par paires */
export function groupDigits(country: Country, national: string) {
  const ex = (country.phoneExample ?? '').trim();
  const t = country.trunkPrefix ?? '';
  let groups = ex ? ex.split(/\s+/).map((g) => g.length) : [];
  // L'exemple peut contenir le préfixe national : il est retiré du premier groupe
  if (t && groups.reduce((a, b) => a + b, 0) === national.length + t.length && ex.startsWith(t)) {
    groups[0] -= t.length;
    if (groups[0] <= 0) groups = groups.slice(1);
  }
  if (groups.reduce((a, b) => a + b, 0) !== national.length) groups = [];
  if (!groups.length) return national.replace(/(\d{2})(?=\d)/g, '$1 ');
  const out: string[] = [];
  let i = 0;
  for (const g of groups) { out.push(national.slice(i, i + g)); i += g; }
  return out.join(' ');
}

/** « 🇨🇮 +225 07 01 02 03 04 » ; valeur inconnue ou ancien format : affichée telle quelle */
export function formatPhone(value: string | null | undefined, withFlag = true) {
  const v = (value ?? '').trim();
  if (!v) return '';
  const p = parsePhone(v);
  if (!p || p.national.length !== p.country.phoneLength) return v;
  return `${withFlag ? `${p.country.flag} ` : ''}+${p.country.dialCode} ${groupDigits(p.country, p.national)}`;
}

/** Lien d'appel (format international si possible) */
export const telHref = (value: string | null | undefined) => `tel:${(value ?? '').replace(/[^\d+]/g, '')}`;
/** Lien WhatsApp : wa.me/<chiffres sans +> */
export function waHref(value: string | null | undefined) {
  const v = (value ?? '').trim();
  const p = parsePhone(v);
  const digits = p ? `${p.country.dialCode}${p.national}` : (() => {
    const e = toE164(state.operating, v);
    return e ? e.slice(1) : digitsOf(v);
  })();
  return `https://wa.me/${digits}`;
}

/** Libellé de devise pour les champs de saisie : « FCFA » pour les francs CFA (affichage historique), sinon le symbole */
export const currencyLabel = (currencyCode?: string | null) => {
  const c = currencyOf(currencyCode);
  return c.currencyCode === 'XOF' || c.currencyCode === 'XAF' ? 'FCFA' : c.currencySymbol;
};
