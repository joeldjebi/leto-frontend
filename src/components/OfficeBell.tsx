import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ago, askPermission, clearAll, KIND_LABEL, KINDS_FOR, markAllRead, OfficeNotification, openLink, setPrefs, toggleKind, useOffice,
} from '../officeNotify';
import { Icon, Switch } from '../ui';

const KIND_ICON: Record<string, string> = {
  NEW_ORDER: 'box', ACCEPTED: 'check', DECLINED: 'alert', FINISHED: 'check', FAILED: 'alert', CANCELLED: 'close',
  CANCEL_REQUEST: 'alert', DISPUTE: 'alert', CREDIT_LOW: 'wallet', PAYMENT: 'receipt', REMITTANCE: 'wallet',
  COMPANY_APPLY: 'building', INDEPENDENT: 'shield',
};
const KIND_TONE: Record<string, string> = {
  DECLINED: 'warn', FAILED: 'warn', CANCEL_REQUEST: 'warn', CANCELLED: 'danger', DISPUTE: 'danger', CREDIT_LOW: 'danger',
};

/** Cloche du menu : historique, réglages (son, navigateur, catégories) */
export function OfficeBell({ isSA }: { isSA: boolean }) {
  const { items, prefs, permission } = useOffice();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'list' | 'settings'>('list');
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const unread = items.filter((n) => !n.read).length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const go = (n: OfficeNotification) => { openLink(n.link, n.id); setOpen(false); };

  return (
    <div className="ob" ref={ref}>
      <button className="btn secondary icon-btn ob-trigger" onClick={() => { setOpen(!open); setTab('list'); }}
        aria-label={`Notifications${unread ? ` (${unread} non lue${unread > 1 ? 's' : ''})` : ''}`} aria-expanded={open} title="Notifications">
        <Icon name="bell" size={16} />
        {unread > 0 && <span className="ob-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && createPortal(
        <div className="ob-panel" role="dialog" aria-label="Notifications" ref={panelRef}>
          <div className="ob-head">
            <strong>{tab === 'list' ? 'Notifications' : 'Réglages des notifications'}</strong>
            <div className="ob-actions">
              {tab === 'list' && unread > 0 && <button className="btn plain" onClick={markAllRead}>Tout marquer lu</button>}
              <button className="btn secondary icon-btn" onClick={() => setTab(tab === 'list' ? 'settings' : 'list')} aria-label={tab === 'list' ? 'Réglages' : 'Retour à la liste'} title={tab === 'list' ? 'Réglages' : 'Retour'}>
                <Icon name={tab === 'list' ? 'gear' : 'back'} size={15} />
              </button>
            </div>
          </div>
          {tab === 'list' ? (
            <div className="ob-list">
              {permission === 'default' && (
                <button className="ob-enable" onClick={() => askPermission()}>
                  <Icon name="bell" size={15} />Recevoir les notifications même quand l’onglet est en arrière-plan
                </button>
              )}
              {items.length === 0 ? (
                <div className="ob-empty"><Icon name="bell" size={22} /><span>Aucune notification pour le moment</span></div>
              ) : items.map((n) => (
                <button key={n.id} className={`ob-item${n.read ? '' : ' unread'}`} onClick={() => go(n)}>
                  <span className={`ob-ic ${KIND_TONE[n.kind] ?? ''}`}><Icon name={KIND_ICON[n.kind] ?? 'bell'} size={15} /></span>
                  <span className="ob-txt">
                    <strong>{n.title}</strong>
                    <span>{n.body}</span>
                    <small>{ago(n.at)}</small>
                  </span>
                </button>
              ))}
              {items.length > 0 && <button className="btn plain ob-clear" onClick={clearAll}>Effacer l’historique</button>}
            </div>
          ) : (
            <div className="ob-settings">
              <div className="ob-row">
                <span className="grow"><b>Son</b><small>Le son LETO de chaque événement</small></span>
                <Switch checked={prefs.sound} onChange={(on) => setPrefs({ sound: on })} label={prefs.sound ? 'Couper le son' : 'Activer le son'} />
              </div>
              <div className="ob-row">
                <span className="grow">
                  <b>Notifications du navigateur</b>
                  <small>{permission === 'unsupported' ? 'Non prises en charge par ce navigateur'
                    : permission === 'denied' ? 'Bloquées : autorisez-les dans les réglages du site (cadenas de la barre d’adresse)'
                    : 'Quand l’onglet LETO n’est pas affiché (il doit rester ouvert)'}</small>
                </span>
                {permission === 'default'
                  ? <button className="btn" onClick={() => askPermission()}>Autoriser</button>
                  : <Switch checked={prefs.desktop && permission === 'granted'} onChange={(on) => setPrefs({ desktop: on })} label="Notifications du navigateur" />}
              </div>
              <div className="ob-sub">Recevoir</div>
              {KINDS_FOR(isSA).map((k) => (
                <label key={k} className="ob-check">
                  <input type="checkbox" checked={!prefs.muted.includes(k)} onChange={() => toggleKind(k)} />
                  {KIND_LABEL[k]}
                </label>
              ))}
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Bandeau d'une notification reçue pendant qu'on regarde la page (cliquable) */
export function OfficeToast({ n, onClose }: { n: OfficeNotification | null; onClose: () => void }) {
  useEffect(() => {
    if (!n) return;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [n]);
  if (!n) return null;
  return (
    <div className="ob-toast" role="status">
      <button className="ob-toast-body" onClick={() => { openLink(n.link, n.id); onClose(); }}>
        <span className={`ob-ic ${KIND_TONE[n.kind] ?? ''}`}><Icon name={KIND_ICON[n.kind] ?? 'bell'} size={15} /></span>
        <span className="ob-txt"><strong>{n.title}</strong><span>{n.body}</span></span>
      </button>
      <button className="btn plain icon-btn" onClick={onClose} aria-label="Fermer"><Icon name="close" size={14} /></button>
    </div>
  );
}

/** Invitation (une fois) à autoriser les notifications du navigateur */
export function OfficeInvite() {
  const { prefs, permission } = useOffice();
  if (permission !== 'default' || prefs.dismissed) return null;
  return (
    <div className="banner info ob-invite">
      <Icon name="bell" size={18} />
      <span className="grow"><strong>Ne manquez aucune commande.</strong> Autorisez les notifications : LETO vous prévient avec un son, même quand l’onglet est en arrière-plan.</span>
      <button className="btn" onClick={() => askPermission()}>Autoriser</button>
      <button className="btn plain" onClick={() => setPrefs({ dismissed: true })}>Plus tard</button>
    </div>
  );
}
