import sunSvg from './assets/sun-dark.svg?raw';
import { createContext, ReactNode, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { initial, Status, STATUS_COLOR, STATUS_LABEL } from './api';
import { parsePhone, toE164, useCountries } from './countries';

// ============================================================================
// Icônes (trait fin, façon SF Symbols)
// ============================================================================

export const ICON_PATHS: Record<string, string> = {
  overview: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  box: 'M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z M9 4v14 M15 6v14',
  alert: 'M12 3.5l9.5 16.5h-19L12 3.5z M12 10v4.5 M12 17.4v.1',
  wallet: 'M3 6.5h18v11H3z M12 15a3 3 0 100-6 3 3 0 000 6z M6 9.5v.01 M18 14.5v.01',
  building: 'M4 21V5.5L12 3v18 M12 9h8v12 M3 21h18 M7.5 8v.01 M7.5 12v.01 M7.5 16v.01 M16 13v.01 M16 17v.01',
  bike: 'M5.5 18.5a3 3 0 100-6 3 3 0 000 6z M18.5 18.5a3 3 0 100-6 3 3 0 000 6z M5.5 15.5l3.5-6h5l4.5 6 M9 9.5L7.5 6.5H5 M14 9.5l1.5-4H19',
  people: 'M16 20v-1a4 4 0 00-4-4H6a4 4 0 00-4 4v1 M9 11a4 4 0 100-8 4 4 0 000 8z M22 20v-1a4 4 0 00-3-3.9 M16 3.1a4 4 0 010 7.8',
  tag: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z M7.5 7.5v.01',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14z M20 20l-4-4',
  refresh: 'M20 11a8 8 0 10-2.3 5.7 M20 4v5h-5',
  logout: 'M9 20H5a1 1 0 01-1-1V5a1 1 0 011-1h4 M16 16l4-4-4-4 M20 12H9',
  close: 'M17 7L7 17 M7 7l10 10',
  plus: 'M12 5v14 M5 12h14',
  download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M5 20h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  phone: 'M5 4h3.5l1.5 4.5-2 1.5a12 12 0 006 6l1.5-2 4.5 1.5V19a1.5 1.5 0 01-1.5 1.5A16 16 0 013.5 5.5 1.5 1.5 0 015 4z',
  pin: 'M12 21s7-6.2 7-11.5a7 7 0 10-14 0C5 14.8 12 21 12 21z M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 7v5l3 2',
  edit: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 13.5l1.6 1.2-1.8 3.1-1.9-.7a7.6 7.6 0 01-1.7 1l-.3 2h-3.6l-.3-2a7.6 7.6 0 01-1.7-1l-1.9.7-1.8-3.1 1.6-1.2a7.4 7.4 0 010-3l-1.6-1.2 1.8-3.1 1.9.7a7.6 7.6 0 011.7-1l.3-2h3.6l.3 2a7.6 7.6 0 011.7 1l1.9-.7 1.8 3.1-1.6 1.2a7.4 7.4 0 010 3z',
  route: 'M6 19a2 2 0 100-4 2 2 0 000 4z M18 9a2 2 0 100-4 2 2 0 000 4z M8 17h7.5a3.5 3.5 0 000-7h-7a3.5 3.5 0 010-7H16',
  book: 'M5 4.5A1.5 1.5 0 016.5 3H19v15H6.5A1.5 1.5 0 005 19.5v-15z M5 19.5A1.5 1.5 0 006.5 21H19v-3 M9 7h6 M9 10.5h6',
  camera: 'M4 8h3l2-2.5h6L17 8h3v11H4z M12 16.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  sun: 'M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9z M12 2.5v2 M12 19.5v2 M4.6 4.6L6 6 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4L6 18 M18 6l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z',
  auto: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 3v18 M12 7.5h4 M12 12h5 M12 16.5h4',
  shield: 'M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z M8.5 12l2.5 2.5 4.5-5',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6 M9 16h3',
  upload: 'M12 16V5 M7.5 9.5L12 5l4.5 4.5 M5 19h14',
  card: 'M3 6h18v12H3z M3 10h18 M7 15h3',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  moto: 'M5.5 18a3 3 0 100-6 3 3 0 000 6z M18.5 18a3 3 0 100-6 3 3 0 000 6z M5.5 15h5l3.5-6h3.5l1.5 6 M14 9l-1.5-3H9.5 M10.5 12H7',
  car: 'M4 16.5h16v-4.2l-2.2-5.3H6.2L4 12.3v4.2z M5.5 16.5V19 M18.5 16.5V19 M4 12.3h16 M7.5 14.4v.01 M16.5 14.4v.01',
  bell: 'M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15l1.5-2z M10 21h4',
  play: 'M8 5.5v13l10.5-6.5L8 5.5z',
  mail: 'M4 6h16v12H4z M4 7l8 6 8-6',
  whatsapp: 'M20 11.5a8.5 8.5 0 01-12.6 7.4L3 20l1.2-4.2A8.5 8.5 0 1120 11.5z M9 9.5c0 2.5 2.5 5 5 5l1-1.3-1.6-.8-.7.7a3.6 3.6 0 01-2.1-2.1l.7-.7-.8-1.6z',
  facebook: 'M15 3h-2.5A3.5 3.5 0 009 6.5V9H7v3h2v9h3v-9h2.5l.5-3h-3V7a1 1 0 011-1h2z',
  instagram: 'M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4z M12 16a4 4 0 100-8 4 4 0 000 8z M17.5 6.5v.01',
  linkedin: 'M4 9h3v11H4z M5.5 4.5v.01 M10 9h3v1.6a3.5 3.5 0 016 2.4V20h-3v-6a1.5 1.5 0 00-3 0v6h-3z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18z M12 16a4 4 0 100-8 4 4 0 000 8z M12 12v.01',
  stop: 'M7 7h10v10H7z',
  trash: 'M4.5 7h15 M9.5 7V4.5h5V7 M6.5 7l1 13h9l1-13 M10 11v5.5 M14 11v5.5',
  flag: 'M5 21V4 M5 4.5c2.5-1.5 5-1.5 7 0s4.5 1.5 7 0v9c-2.5 1.5-5 1.5-7 0s-4.5-1.5-7 0',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18z M3 12h18 M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5',
  up: 'M6 15l6-6 6 6',
  down: 'M6 9l6 6 6-6',
  truck: 'M2.5 6h11.5v10H2.5z M14 9.5h4l3.5 3.5v3H14z M6.5 18.5a2 2 0 100-4 2 2 0 000 4z M17.5 18.5a2 2 0 100-4 2 2 0 000 4z',
};

/** Symbole LETO : le soleil (rayons fins blancs), sur la tuile noire. Source : brand/sun-dark.svg */
export function LetoMark({ size = 20 }: { size?: number }) {
  return <span aria-hidden="true" style={{ width: size, height: size, display: 'block' }} dangerouslySetInnerHTML={{ __html: sunSvg }} />;
}

export function Icon({ name, size = 18, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

// ============================================================================
// Éléments
// ============================================================================

export const Badge = ({ color = 'gray', children }: { color?: string; children: ReactNode }) => (
  <span className={`badge ${color}`}>{children}</span>
);

export const StatusBadge = ({ status }: { status: Status }) => <Badge color={STATUS_COLOR[status]}>{STATUS_LABEL[status]}</Badge>;

export const Avatar = ({ name }: { name?: string | null }) => <span className="avatar">{initial(name)}</span>;

export function Stat({ label, value, foot, icon, onClick }: { label: string; value: ReactNode; foot?: ReactNode; icon?: string; onClick?: () => void }) {
  return (
    <div className={`card stat${onClick ? ' clickable' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="label">{icon && <Icon name={icon} size={15} />}{label}</span>
      <span className="value">{value}</span>
      {foot && <span className="foot">{foot}</span>}
    </div>
  );
}

export function Card({ title, actions, children, pad = false }: { title?: string; actions?: ReactNode; children: ReactNode; pad?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-header">
          {title && <h2>{title}</h2>}
          {actions && <div className="actions">{actions}</div>}
        </div>
      )}
      <div className={pad ? 'card-pad' : ''} style={!pad && title ? { paddingTop: 8 } : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </header>
  );
}

export function Segmented<T extends string>({ value, options, onChange, labels }: {
  value: T;
  options: [T, ReactNode][];
  onChange: (v: T) => void;
  /** Nom accessible / infobulle (utile quand l'option est une icône) */
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'on' : ''} onClick={() => onChange(k)}
          title={labels?.[k]} aria-label={labels?.[k]}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Search({ value, onChange, placeholder = 'Rechercher' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="search">
      <Icon name="search" size={15} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </label>
  );
}

/** Champ de formulaire avec libellé et message d'erreur propre au champ */
export function Field({ label, error, hint, children }: { label: string; error?: string | null; hint?: string; children: ReactNode }) {
  return (
    <label className={`field${error ? ' invalid' : ''}`}>
      <span>{label}</span>
      {children}
      {error ? <small className="error">{error}</small> : hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}

/**
 * Téléphone : indicatif du pays (pays actifs uniquement) + numéro local.
 * Émet le format international (+2250701020304) dès que le numéro est complet ; en cours de saisie,
 * « +indicatif » suivi des chiffres tapés (phoneError() indique ce qui manque). Un seul pays actif : indicatif fixe.
 * `plain` : sans cadre (lignes de formulaire façon iOS de la nouvelle course).
 */
export function PhoneInput({ value, onChange, placeholder, label, plain = false, autoFocus, autoComplete }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label?: string; plain?: boolean; autoFocus?: boolean;
  /** Ex. « username » sur la page de connexion (sinon le navigateur ne propose rien) */
  autoComplete?: string;
}) {
  const { countries, operating } = useCountries();
  // Pays et texte saisi, déduits de la valeur reçue (sauf si elle vient de ce champ)
  const derive = (v: string) => {
    const p = parsePhone(v);
    if (p) return { iso: p.country.iso, text: p.national };
    return { iso: operating.iso, text: v };
  };
  const [st, setSt] = useState(() => derive(value));
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) { emitted.current = value; setSt(derive(value)); }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const country = countries.find((c) => c.iso === st.iso) ?? operating;

  const emit = (iso: string, text: string) => {
    const c = countries.find((x) => x.iso === iso) ?? operating;
    const digits = text.replace(/\D/g, '');
    const out = !digits ? '' : toE164(c, digits) ?? `+${c.dialCode}${digits}`;
    setSt({ iso: c.iso, text: digits });
    emitted.current = out;
    onChange(out);
  };
  const onText = (raw: string) => {
    // Numéro international collé (+225…, 00225…) : le pays suit l'indicatif
    const intl = raw.trim().replace(/^00/, '+');
    if (intl.startsWith('+')) {
      const p = parsePhone(intl.replace(/[^\d+]/g, ''));
      if (p) return emit(p.country.iso, p.national);
    }
    let digits = raw.replace(/\D/g, '');
    // Indicatif tapé sans « + » (2250701020304)
    if (digits.length === country.dialCode.length + country.phoneLength && digits.startsWith(country.dialCode)) digits = digits.slice(country.dialCode.length);
    emit(country.iso, digits.slice(0, country.phoneLength + (country.trunkPrefix?.length ?? 0)));
  };

  const multi = countries.length > 1;
  return (
    <div className={`ph${plain ? ' ph-plain' : ''}`}>
      <span className={`ph-cc${multi ? ' ph-cc-pick' : ''}`}>
        <span className="ph-flag" aria-hidden="true">{country.flag}</span>
        <span>+{country.dialCode}</span>
        {multi && <Icon name="down" size={12} className="ph-caret" />}
        {multi && (
          <select value={country.iso} onChange={(e) => emit(e.target.value, st.text)} aria-label="Indicatif du pays">
            {countries.map((c) => <option key={c.iso} value={c.iso}>{c.flag} {c.name} (+{c.dialCode})</option>)}
          </select>
        )}
      </span>
      <input
        type="tel" inputMode="numeric" autoComplete={autoComplete ?? 'off'} data-lpignore={autoComplete ? undefined : 'true'} data-1p-ignore={autoComplete ? undefined : true} autoFocus={autoFocus}
        aria-label={label ?? placeholder ?? 'Téléphone'}
        placeholder={placeholder ?? (country.phoneExample || '0'.repeat(country.phoneLength))}
        value={st.text} onChange={(e) => onText(e.target.value)}
      />
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch" title={label}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

export function Empty({ icon = 'box', children }: { icon?: string; children: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <div>{children}</div>
    </div>
  );
}

/** Panneau latéral (fiche détaillée) */
export function Sheet({ title, onClose, children, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <aside className="sheet" role="dialog" aria-modal="true">
        <div className="sheet-header">
          <h2>{title}</h2>
          {actions}
          <button className="btn secondary icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" size={16} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </aside>
    </>
  );
}

/** Fenêtre de saisie / confirmation */
export function Modal({ title, subtitle, onClose, children, footer }: { title: string; subtitle?: ReactNode; onClose: () => void; children?: ReactNode; footer: ReactNode }) {
  return (
    <>
      <div className="backdrop" style={{ zIndex: 52 }} onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" style={{ zIndex: 53 }}>
        <h2>{title}</h2>
        {subtitle && <p className="muted" style={{ margin: 0 }}>{subtitle}</p>}
        {children && <div className="form">{children}</div>}
        <div className="buttons">{footer}</div>
      </div>
    </>
  );
}

// ============================================================================
// Notifications (toast)
// ============================================================================

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>();
  const show = (m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2600);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  );
}

// ============================================================================
// Graphique en barres (une seule série)
// ============================================================================

function niceMax(v: number) {
  if (v <= 0) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)} k` : n.toLocaleString('fr-FR'));

/**
 * Colonnes ≤ 24 px, extrémité arrondie 4 px, base carrée ; quadrillage fin ;
 * infobulle au survol (zone de survol = toute la colonne) ; tableau équivalent pour les lecteurs d'écran.
 */
export function BarChart({ data, format, label }: { data: { key: string; label: string; value: number }[]; format: (n: number) => string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const height = 220;
  const pad = { top: 12, right: 8, bottom: 26, left: 44 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value), 0));
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(24, Math.max(4, band - 6));
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;
  const every = Math.ceil(data.length / Math.max(1, Math.floor(innerW / 56)));

  const bar = (x: number, top: number, w: number, base: number) => {
    const h = base - top;
    if (h <= 0) return '';
    const r = Math.min(4, h, w / 2);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  };

  return (
    <div className="chart" ref={ref}>
      <svg height={height} role="img" aria-label={label}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--tertiary)">{compact(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.left + i * band + (band - barW) / 2;
          return (
            <g key={d.key}>
              <path d={bar(x, y(d.value), barW, y(0))} fill="var(--chart)" opacity={hover === null || hover === i ? 1 : 0.45} />
              {i % every === 0 && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--tertiary)">{d.label}</text>
              )}
              <rect x={pad.left + i * band} y={pad.top} width={band} height={innerH} fill="transparent"
                onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="tooltip" style={{ left: pad.left + hover * band + band / 2, top: y(data[hover].value) }}>
          <span className="muted">{data[hover].label}</span>
          <strong>{format(data[hover].value)}</strong>
        </div>
      )}
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>{data.map((d) => <tr key={d.key}><th>{d.label}</th><td>{format(d.value)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
