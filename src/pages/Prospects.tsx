import { useEffect, useMemo, useState } from 'react';
import { api, dateTime } from '../api';
import { useData } from '../data';
import { Badge, Card, Empty, Field, Icon, PageHeader, Search, Sheet, useToast } from '../ui';

type Status = 'TODO' | 'CONTACTED' | 'FOLLOW_UP' | 'MEETING' | 'DEMO' | 'WON' | 'LOST';
interface Event { at: string; kind: 'NOTE' | 'CONTACT' | 'STATUS'; text: string; by: string }
export interface Prospect {
  id: string; name: string; country: string; city: string | null; priority: number; description: string | null;
  website: string | null; phone: string | null; whatsapp: string | null; email: string | null;
  facebook: string | null; instagram: string | null; linkedin: string | null; contactName: string | null;
  status: Status; lastContactAt: string | null; nextActionAt: string | null; nextAction: string | null;
  notes: string | null; waMessage: string | null; emailSubject: string | null; emailBody: string | null; history: Event[]; createdAt: string; updatedAt: string;
}

const STATUSES: [Status, string, string][] = [
  ['TODO', 'À contacter', 'gray'],
  ['CONTACTED', 'Contacté', 'blue'],
  ['FOLLOW_UP', 'À relancer', 'orange'],
  ['MEETING', 'Rendez-vous', 'purple'],
  ['DEMO', 'Démo faite', 'purple'],
  ['WON', 'Client', 'green'],
  ['LOST', 'Pas intéressé', 'red'],
];
const LABEL = Object.fromEntries(STATUSES.map(([k, l]) => [k, l])) as Record<Status, string>;
const COLOR = Object.fromEntries(STATUSES.map(([k, , c]) => [k, c])) as Record<Status, string>;
const PRIORITY: Record<number, [string, string]> = { 1: ['Prioritaire', 'green'], 2: ['À tenter', 'orange'], 3: ['A déjà son outil', 'gray'] };
const COUNTRY: Record<string, string> = { CI: '🇨🇮 Côte d’Ivoire', SN: '🇸🇳 Sénégal', BJ: '🇧🇯 Bénin', ML: '🇲🇱 Mali', BF: '🇧🇫 Burkina Faso', TG: '🇹🇬 Togo', CM: '🇨🇲 Cameroun', GN: '🇬🇳 Guinée', MULTI: '🌍 Plusieurs pays' };

const VIDEO = 'leto.performx.online/video';
/** Message de premier contact (WhatsApp, e-mail), au nom de l'entreprise */
const firstMessage = (company: string, sender: string) =>
  `Bonjour ${company} 👋\nJe suis ${sender}, fondateur de LETO, une plateforme de livraison conçue à Abidjan :\n• une app pour vos boutiques, qui commandent une livraison en quelques secondes ;\n• une app pour vos livreurs, qui acceptent la course directement et l’exécutent ;\n• le suivi en temps réel, pour vous comme pour vos clients ;\n• un tableau de bord où vous voyez vos livreurs bouger sur la carte pendant leurs livraisons.\nAuriez-vous 15 minutes pour une présentation ?\nVidéo : ${VIDEO}`;

/** Messages de la fiche (personnalisés) ou message standard, signés au nom de l'expéditeur */
const sign = (t: string, sender: string) => t.replace(/\{prenom\}/g, sender);
const waText = (p: Partial<Prospect>, sender: string) => sign(p.waMessage?.trim() || firstMessage(p.name || 'votre entreprise', sender), sender);
const mailSubject = (p: Partial<Prospect>) => p.emailSubject?.trim() || `LETO · présentation de 15 minutes pour ${p.name || 'votre entreprise'}`;
const mailBody = (p: Partial<Prospect>, sender: string) => sign(p.emailBody?.trim() || firstMessage(p.name || 'votre entreprise', sender), sender);

const digits = (p: string) => p.replace(/[^\d]/g, '');
const url = (u: string) => (/^https?:\/\//.test(u) ? u : `https://${u}`);
const dayStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const isOverdue = (p: Prospect) => !!p.nextActionAt && new Date(p.nextActionAt) < new Date() && !['WON', 'LOST'].includes(p.status);
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '');

/** Boutons de contact : WhatsApp (message prêt), appel, e-mail, site, réseaux */
function Contacts({ p, sender, onContact }: { p: Prospect; sender: string; onContact: (how: string) => void }) {
  const links: { key: string; icon: string; label: string; href: string; how?: string }[] = [
    ...(p.whatsapp ? [{ key: 'wa', icon: 'whatsapp', label: `WhatsApp ${p.whatsapp}`, href: `https://wa.me/${digits(p.whatsapp)}?text=${encodeURIComponent(waText(p, sender))}`, how: 'Message WhatsApp envoyé' }] : []),
    ...(p.phone ? [{ key: 'tel', icon: 'phone', label: `Appeler ${p.phone}`, href: `tel:${p.phone.replace(/\s/g, '')}`, how: 'Appel' }] : []),
    ...(p.email ? [{ key: 'mail', icon: 'mail', label: `E-mail ${p.email}`, href: `mailto:${p.email}?subject=${encodeURIComponent(mailSubject(p))}&body=${encodeURIComponent(mailBody(p, sender))}`, how: 'E-mail envoyé' }] : []),
    ...(p.website ? [{ key: 'web', icon: 'globe', label: 'Site web', href: url(p.website) }] : []),
    ...(p.facebook ? [{ key: 'fb', icon: 'facebook', label: 'Page Facebook', href: url(p.facebook), how: 'Message Facebook envoyé' }] : []),
    ...(p.instagram ? [{ key: 'ig', icon: 'instagram', label: 'Instagram', href: url(p.instagram), how: 'Message Instagram envoyé' }] : []),
    ...(p.linkedin ? [{ key: 'in', icon: 'linkedin', label: 'LinkedIn', href: url(p.linkedin), how: 'Message LinkedIn envoyé' }] : []),
  ];
  if (!links.length) return <span className="muted">Aucun contact</span>;
  return (
    <div className="pr-contacts" onClick={(e) => e.stopPropagation()}>
      {links.map((l) => (
        <a key={l.key} className={`pr-contact ${l.key}`} href={l.href} target="_blank" rel="noreferrer" title={l.label} aria-label={l.label}
          onClick={() => l.how && window.setTimeout(() => onContact(l.how!), 300)}>
          <Icon name={l.icon} size={16} />
        </a>
      ))}
    </div>
  );
}

/** Fiche d'un prospect : coordonnées, étape, prochaine action, notes, historique */
function ProspectSheet({ p, onClose, onSaved, onDeleted, sender }: { p: Prospect | null; onClose: () => void; onSaved: (p: Prospect) => void; onDeleted: (id: string) => void; sender: string }) {
  const toast = useToast();
  const isNew = !p;
  const [f, setF] = useState<Partial<Prospect>>(p ?? { name: '', country: 'CI', priority: 1, status: 'TODO' });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Prospect) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    if (!f.name?.trim()) return toast('Indiquez le nom de l’entreprise');
    setBusy(true);
    try {
      const body = {
        name: f.name, country: f.country, city: f.city ?? null, priority: Number(f.priority ?? 2), description: f.description ?? null,
        website: f.website ?? null, phone: f.phone ?? null, whatsapp: f.whatsapp ?? null, email: f.email ?? null,
        facebook: f.facebook ?? null, instagram: f.instagram ?? null, linkedin: f.linkedin ?? null, contactName: f.contactName ?? null,
        status: f.status, nextAction: f.nextAction ?? null, notes: f.notes ?? null,
        waMessage: f.waMessage ?? null, emailSubject: f.emailSubject ?? null, emailBody: f.emailBody ?? null,
        nextActionAt: f.nextActionAt ? new Date(f.nextActionAt).toISOString() : null,
      };
      const saved = await api<Prospect>(isNew ? '/admin/prospects' : `/admin/prospects/${p!.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      toast(isNew ? `${saved.name} ajouté à la prospection` : 'Fiche enregistrée');
      onSaved(saved);
      if (isNew) onClose();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addLog = async (kind: 'NOTE' | 'CONTACT', text: string) => {
    if (!p || !text.trim()) return;
    try {
      const saved = await api<Prospect>(`/admin/prospects/${p.id}/log`, { method: 'POST', body: { kind, text } });
      onSaved(saved);
      setF((x) => ({ ...x, status: saved.status, lastContactAt: saved.lastContactAt }));
      setNote('');
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const remove = async () => {
    if (!p) return;
    try {
      await api(`/admin/prospects/${p.id}`, { method: 'DELETE' });
      toast(`${p.name} retiré de la prospection`);
      onDeleted(p.id);
      onClose();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(what);
    } catch {
      toast('Copie impossible dans ce navigateur');
    }
  };

  const dateValue = f.nextActionAt ? new Date(f.nextActionAt).toISOString().slice(0, 10) : '';
  return (
    <Sheet title={isNew ? 'Nouveau prospect' : f.name} onClose={onClose}>
      {!isNew && p && (
        <div className="pr-sheet-contacts">
          <Contacts p={{ ...p, ...f } as Prospect} sender={sender} onContact={(how) => addLog('CONTACT', how)} />
          <button className="btn secondary" onClick={() => copy(waText(f, sender), 'Message copié : collez-le sur WhatsApp, Facebook ou LinkedIn')}>Copier le message</button>
        </div>
      )}

      <div className="pr-grid">
        <Field label="Entreprise"><input value={f.name ?? ''} onChange={set('name')} maxLength={120} /></Field>
        <Field label="Étape">
          <select value={f.status} onChange={set('status')}>{STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Pays">
          <select value={f.country} onChange={set('country')}>{Object.entries(COUNTRY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Ville"><input value={f.city ?? ''} onChange={set('city')} maxLength={120} /></Field>
        <Field label="Priorité">
          <select value={f.priority} onChange={set('priority')}>{[1, 2, 3].map((n) => <option key={n} value={n}>{PRIORITY[n][0]}</option>)}</select>
        </Field>
        <Field label="Personne à contacter"><input value={f.contactName ?? ''} onChange={set('contactName')} placeholder="Nom, rôle" maxLength={160} /></Field>
      </div>
      <Field label="Activité"><input value={f.description ?? ''} onChange={set('description')} maxLength={300} /></Field>

      <div className="pr-grid">
        <Field label="WhatsApp"><input value={f.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="+225…" maxLength={30} /></Field>
        <Field label="Téléphone"><input value={f.phone ?? ''} onChange={set('phone')} placeholder="+225…" maxLength={30} /></Field>
        <Field label="E-mail"><input type="email" value={f.email ?? ''} onChange={set('email')} maxLength={160} /></Field>
        <Field label="Site web"><input value={f.website ?? ''} onChange={set('website')} maxLength={300} /></Field>
        <Field label="Facebook"><input value={f.facebook ?? ''} onChange={set('facebook')} placeholder="https://facebook.com/…" maxLength={300} /></Field>
        <Field label="Instagram"><input value={f.instagram ?? ''} onChange={set('instagram')} maxLength={300} /></Field>
        <Field label="LinkedIn"><input value={f.linkedin ?? ''} onChange={set('linkedin')} maxLength={300} /></Field>
      </div>

      <div className="pr-grid">
        <Field label="Prochaine action le">
          <input type="date" value={dateValue} onChange={(e) => setF((x) => ({ ...x, nextActionAt: e.target.value ? new Date(`${e.target.value}T09:00`).toISOString() : null }))} />
        </Field>
        <Field label="Prochaine action"><input value={f.nextAction ?? ''} onChange={set('nextAction')} placeholder="Relancer sur WhatsApp, démo à leurs bureaux…" maxLength={200} /></Field>
      </div>
      <Card title="Messages de premier contact">
        <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>« {'{prenom}'} » est remplacé par votre nom à l’envoi. Laissez vide pour le message standard.</p>
          <Field label="WhatsApp, Facebook, LinkedIn">
            <textarea rows={7} value={f.waMessage ?? ''} onChange={set('waMessage')} placeholder={firstMessage(f.name || 'votre entreprise', '{prenom}')} maxLength={3000} />
          </Field>
          <div><button className="btn secondary" onClick={() => copy(waText(f, sender), 'Message WhatsApp copié')}>Copier le message WhatsApp</button></div>
          <Field label="Objet de l’e-mail"><input value={f.emailSubject ?? ''} onChange={set('emailSubject')} placeholder={mailSubject(f)} maxLength={200} /></Field>
          <Field label="E-mail">
            <textarea rows={12} value={f.emailBody ?? ''} onChange={set('emailBody')} maxLength={5000} />
          </Field>
          <div><button className="btn secondary" onClick={() => copy(`${mailSubject(f)}\n\n${mailBody(f, sender)}`, 'E-mail copié (objet + message)')}>Copier l’e-mail</button></div>
        </div>
      </Card>
      <Field label="Notes"><textarea rows={4} value={f.notes ?? ''} onChange={set('notes')} maxLength={5000} /></Field>

      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={save} disabled={busy}>{isNew ? 'Ajouter' : 'Enregistrer'}</button>
        {!isNew && <button className="btn secondary danger" onClick={remove}>Retirer</button>}
      </div>

      {!isNew && p && (
        <Card title="Historique">
          <div style={{ padding: '4px 16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="pr-note">
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ajouter une note (réponse reçue, rendez-vous…)" maxLength={1000}
                onKeyDown={(e) => { if (e.key === 'Enter') addLog('NOTE', note); }} />
              <button className="btn secondary" onClick={() => addLog('NOTE', note)} disabled={!note.trim()}>Noter</button>
            </div>
            <ul className="timeline">
              {[...p.history].reverse().map((e, i) => (
                <li key={i}>
                  <span className="dot" style={{ background: e.kind === 'CONTACT' ? 'var(--green)' : e.kind === 'STATUS' ? 'var(--accent)' : 'var(--tertiary)' }} />
                  <div><strong>{e.text}</strong><span className="sub">{dateTime(e.at)} · {e.by}</span></div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
    </Sheet>
  );
}

/** Admin : suivi de la prospection des entreprises de livraison (Abidjan et sous-région) */
export default function Prospects() {
  const { me } = useData();
  const toast = useToast();
  const sender = me.name && !/super\s*admin/i.test(me.name) ? me.name : '[Prénom]';
  const [list, setList] = useState<Prospect[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | 'ALL' | 'OVERDUE'>('ALL');
  const [country, setCountry] = useState('ALL');
  const [open, setOpen] = useState<Prospect | 'new' | null>(null);

  const load = () => api<Prospect[]>('/admin/prospects').then(setList).catch((e) => toast((e as Error).message));
  useEffect(() => { load(); }, []);

  const upsert = (p: Prospect) => {
    setList((l) => (l ? (l.some((x) => x.id === p.id) ? l.map((x) => (x.id === p.id ? p : x)) : [...l, p]) : [p]));
    setOpen((o) => (o && o !== 'new' && o.id === p.id ? p : o));
  };

  const seed = async () => {
    try {
      const r = await api<{ added: number }>('/admin/prospects/seed', { method: 'POST' });
      toast(r.added ? `${r.added} entreprises importées` : 'La liste de départ est déjà importée');
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const setStep = async (p: Prospect, s: Status) => {
    try {
      upsert(await api<Prospect>(`/admin/prospects/${p.id}`, { method: 'PATCH', body: { status: s } }));
    } catch (e) {
      toast((e as Error).message);
    }
  };

  const logContact = async (p: Prospect, how: string) => {
    try {
      upsert(await api<Prospect>(`/admin/prospects/${p.id}/log`, { method: 'POST', body: { kind: 'CONTACT', text: how } }));
    } catch {
      /* le lien s'est ouvert ; l'historique peut être complété à la main */
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: list?.length ?? 0, OVERDUE: 0 };
    for (const p of list ?? []) { c[p.status] = (c[p.status] ?? 0) + 1; if (isOverdue(p)) c.OVERDUE++; }
    return c;
  }, [list]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (list ?? [])
      .filter((p) => (status === 'ALL' ? true : status === 'OVERDUE' ? isOverdue(p) : p.status === status))
      .filter((p) => country === 'ALL' || p.country === country)
      .filter((p) => !s || [p.name, p.city, p.description, p.notes, p.contactName].some((x) => x?.toLowerCase().includes(s)))
      .sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || a.priority - b.priority || Number(b.country === 'CI') - Number(a.country === 'CI') || a.name.localeCompare(b.name));
  }, [list, q, status, country]);

  const countries = useMemo(() => [...new Set((list ?? []).map((p) => p.country))], [list]);
  const today = dayStart();

  return (
    <>
      <PageHeader
        title="Prospection"
        subtitle="Entreprises de livraison à démarcher : contacts, étape, relances et historique."
        actions={<button className="btn" onClick={() => setOpen('new')}><Icon name="plus" size={16} />Ajouter</button>}
      />

      <div className="chips" style={{ marginBottom: 12 }} role="group" aria-label="Filtrer par étape">
        <button className={`chip${status === 'ALL' ? ' on' : ''}`} onClick={() => setStatus('ALL')}>Toutes ({counts.ALL})</button>
        {counts.OVERDUE > 0 && <button className={`chip${status === 'OVERDUE' ? ' on' : ''}`} onClick={() => setStatus('OVERDUE')}>⏰ Relances en retard ({counts.OVERDUE})</button>}
        {STATUSES.map(([k, l]) => (
          <button key={k} className={`chip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l} ({counts[k] ?? 0})</button>
        ))}
      </div>

      <Card
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="inline-select" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Pays">
              <option value="ALL">Tous les pays</option>
              {countries.map((c) => <option key={c} value={c}>{COUNTRY[c] ?? c}</option>)}
            </select>
            <Search value={q} onChange={setQ} placeholder="Rechercher une entreprise" />
          </div>
        }
      >
        {!list ? <Empty icon="target">Chargement…</Empty> : list.length === 0 ? (
          <Empty icon="target">
            Aucune entreprise pour l’instant.
            <div style={{ marginTop: 12 }}><button className="btn" onClick={seed}>Importer la liste de départ (Abidjan et sous-région)</button></div>
          </Empty>
        ) : rows.length === 0 ? <Empty icon="search">Aucune entreprise ne correspond</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Entreprise</th><th>Contacts</th><th>Étape</th><th>Prochaine action</th><th>Dernier contact</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const late = isOverdue(p);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => setOpen(p)}>
                      <td>
                        <strong>{p.name}</strong> <Badge color={PRIORITY[p.priority]?.[1]}>{PRIORITY[p.priority]?.[0]}</Badge>
                        <span className="sub">{(COUNTRY[p.country] ?? p.country)}{p.city ? ` · ${p.city}` : ''}</span>
                      </td>
                      <td><Contacts p={p} sender={sender} onContact={(how) => logContact(p, how)} /></td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select className={`inline-select pr-step ${COLOR[p.status]}`} value={p.status} onChange={(e) => setStep(p, e.target.value as Status)} aria-label={`Étape de ${p.name}`}>
                          {STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      </td>
                      <td>
                        {p.nextActionAt ? (
                          <span style={late ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                            {late ? '⏰ ' : ''}{new Date(p.nextActionAt) < today ? 'En retard · ' : ''}{day(p.nextActionAt)}
                          </span>
                        ) : <span className="muted">—</span>}
                        {p.nextAction && <span className="sub">{p.nextAction}</span>}
                      </td>
                      <td>{p.lastContactAt ? day(p.lastContactAt) : <span className="muted">Jamais</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
        Le bouton WhatsApp ouvre la conversation avec le message de présentation déjà écrit. Chaque prise de contact s’ajoute à l’historique.
        Pensez à vérifier un numéro avant le premier message : les contacts importés viennent des sites et annuaires publics.
      </p>

      {open && (
        <ProspectSheet
          key={open === 'new' ? 'new' : open.id}
          p={open === 'new' ? null : open}
          sender={sender}
          onClose={() => setOpen(null)}
          onSaved={upsert}
          onDeleted={(id) => setList((l) => l?.filter((x) => x.id !== id) ?? null)}
        />
      )}
    </>
  );
}
