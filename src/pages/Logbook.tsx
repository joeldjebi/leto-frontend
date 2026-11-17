import { useEffect, useMemo, useState } from 'react';
import { api, dateTime, fcfa, photoUrl, User } from '../api';
import { useData } from '../data';
import { Avatar, Badge, Card, Empty, Modal, PageHeader, Search, Segmented, Stat } from '../ui';

export type LogbookStatus = 'TODO' | 'DELIVERED' | 'FAILED' | 'CANCELLED';
export interface LogbookEvent { at: string; action: 'CREATED' | 'UPDATED' | 'STATUS'; status?: LogbookStatus; changes?: Record<string, { from: unknown; to: unknown }>; note?: string }
export interface LogbookEntry {
  id: string; driverId: string; driver?: Pick<User, 'id' | 'name' | 'phone'>; companyId: string | null;
  address: string; lat: number | null; lng: number | null; recipientName: string | null; recipientPhone: string;
  price: number; photoUrl: string; note: string | null; status: LogbookStatus; doneAt: string | null;
  history: LogbookEvent[]; createdAt: string; updatedAt: string;
}

export const LOGBOOK_STATUS: Record<LogbookStatus, [string, string]> = {
  TODO: ['À livrer', 'blue'],
  DELIVERED: ['Livrée', 'green'],
  FAILED: ['Non livrée', 'red'],
  CANCELLED: ['Annulée', 'gray'],
};
const FIELD_LABEL: Record<string, string> = { address: 'Adresse', recipientName: 'Nom', recipientPhone: 'Téléphone', price: 'Prix', note: 'Note' };
const show = (k: string, v: unknown) => (v == null || v === '' ? '—' : k === 'price' ? fcfa(Number(v)) : String(v));

type Period = 'today' | '7d' | '30d' | '90d';
const since = (p: Period) => {
  const d = new Date();
  if (p === 'today') d.setHours(0, 0, 0, 0);
  else d.setDate(d.getDate() - (p === '7d' ? 7 : p === '30d' ? 30 : 90));
  return d.toISOString();
};

/** Carnet des livreurs : livraisons qu'ils saisissent eux-mêmes dans l'app (adresse, numéro, prix, photo du colis) */
export default function Logbook() {
  const { drivers, isSA } = useData();
  const [driverId, setDriverId] = useState('');
  return (
    <>
      <PageHeader
        title="Carnet des livreurs"
        subtitle="Livraisons enregistrées par les livreurs eux-mêmes dans l’app : adresse, numéro du destinataire, prix et photo du colis"
        actions={!isSA && (
          <select value={driverId} onChange={(e) => setDriverId(e.target.value)} style={{ width: 220 }} aria-label="Livreur">
            <option value="">Tous les livreurs</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        )}
      />
      <LogbookView driverId={driverId || undefined} showDriver={!driverId} />
    </>
  );
}

/** Carnet (page ou onglet de la fiche livreur) */
export function LogbookView({ driverId, showDriver = true }: { driverId?: string; showDriver?: boolean }) {
  const { isSA } = useData();
  const [period, setPeriod] = useState<Period>('7d');
  const [status, setStatus] = useState<LogbookStatus | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [entries, setEntries] = useState<LogbookEntry[] | null>(null);
  const [open, setOpen] = useState<LogbookEntry | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      const params = new URLSearchParams({ from: since(period) });
      if (driverId) params.set('driverId', driverId);
      api<LogbookEntry[]>(`/logbook${isSA ? '' : '/company'}?${params}`).then((l) => alive && setEntries(l)).catch(() => alive && setEntries([]));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [period, driverId, isSA]);

  const list = entries ?? [];
  const k = useMemo(() => {
    const delivered = list.filter((e) => e.status === 'DELIVERED');
    return {
      total: list.length,
      delivered: delivered.length,
      todo: list.filter((e) => e.status === 'TODO').length,
      failed: list.filter((e) => e.status === 'FAILED').length,
      amount: delivered.reduce((s, e) => s + e.price, 0),
    };
  }, [list]);
  const needle = q.trim().toLowerCase();
  const rows = list.filter((e) => (status === 'ALL' || e.status === status)
    && (!needle || [e.address, e.recipientName, e.recipientPhone, e.driver?.name, e.note].some((x) => x?.toLowerCase().includes(needle))));

  return (
    <div className="stack">
      <div className="grid grid-stats">
        <Stat icon="book" label="Livraisons saisies" value={k.total} foot={`${k.todo} à livrer · ${k.failed} non livrée(s)`} />
        <Stat icon="check" label="Livrées" value={k.delivered} foot={k.total ? `${Math.round((k.delivered / k.total) * 100)} % des saisies` : '—'} />
        <Stat icon="wallet" label="Montant des livraisons" value={fcfa(k.amount)} foot="livraisons effectuées" />
      </div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Adresse, destinataire, téléphone…" />
        <Segmented<LogbookStatus | 'ALL'> value={status} onChange={setStatus} options={[['ALL', 'Toutes'], ['TODO', 'À livrer'], ['DELIVERED', 'Livrées'], ['FAILED', 'Non livrées'], ['CANCELLED', 'Annulées']]} />
        <span className="spacer" />
        <Segmented<Period> value={period} onChange={setPeriod} options={[['today', 'Aujourd’hui'], ['7d', '7 j'], ['30d', '30 j'], ['90d', '90 j']]} />
      </div>
      <Card>
        {entries === null ? <Empty icon="book">Chargement…</Empty> : rows.length === 0 ? (
          <Empty icon="book">Aucune livraison saisie sur cette période. Les livreurs les enregistrent depuis l’onglet « Carnet » de l’app.</Empty>
        ) : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Photo</th><th>Date</th>{showDriver && <th>Livreur</th>}<th>Adresse</th><th>Destinataire</th><th className="num">Prix</th><th>Statut</th></tr></thead>
              <tbody>
                {rows.map((e) => {
                  const [label, color] = LOGBOOK_STATUS[e.status];
                  const edits = e.history.filter((h) => h.action === 'UPDATED').length;
                  return (
                    <tr key={e.id} className="clickable" onClick={() => setOpen(e)}>
                      <td><img className="lb-thumb" src={photoUrl(e.photoUrl)} alt="Colis" loading="lazy" /></td>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateTime(e.createdAt)}{edits > 0 && <span className="sub">modifiée {edits} fois</span>}</td>
                      {showDriver && <td>{e.driver?.name ?? '—'}</td>}
                      <td>{e.address}{e.note && <span className="sub">{e.note}</span>}</td>
                      <td>{e.recipientName ?? <span className="muted">Sans nom</span>}<span className="sub">{e.recipientPhone}</span></td>
                      <td className="num"><strong>{fcfa(e.price)}</strong></td>
                      <td><Badge color={color}>{label}</Badge>{e.doneAt && <span className="sub">{dateTime(e.doneAt)}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {open && <EntryDialog e={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function EntryDialog({ e, onClose }: { e: LogbookEntry; onClose: () => void }) {
  const [label, color] = LOGBOOK_STATUS[e.status];
  return (
    <Modal
      title={e.address}
      subtitle={<>Saisie le {dateTime(e.createdAt)}{e.driver ? ` par ${e.driver.name}` : ''}</>}
      onClose={onClose}
      footer={<>
        <a className="btn secondary" href={photoUrl(e.photoUrl)} target="_blank" rel="noreferrer">Photo en grand</a>
        <button className="btn" onClick={onClose}>Fermer</button>
      </>}
    >
      <div className="lb-dialog">
        <img className="lb-photo" src={photoUrl(e.photoUrl)} alt="Photo du colis" />
        <div className="lb-facts">
          <div><small className="muted">Statut</small><Badge color={color}>{label}</Badge></div>
          <div><small className="muted">Prix</small><strong>{fcfa(e.price)}</strong></div>
          <div><small className="muted">Destinataire</small><span>{e.recipientName ?? 'Sans nom'} · <a href={`tel:${e.recipientPhone}`}>{e.recipientPhone}</a></span></div>
          {e.driver && <div><small className="muted">Livreur</small><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Avatar name={e.driver.name} />{e.driver.name}</span></div>}
          {e.lat != null && e.lng != null && <div><small className="muted">Position à la saisie</small><a href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer">Voir sur la carte</a></div>}
          {e.note && <div><small className="muted">Note</small><span>{e.note}</span></div>}
        </div>
      </div>
      <div className="section-title" style={{ marginTop: 16 }}>Historique</div>
      <ul className="timeline">
        {[...e.history].reverse().map((h, i) => (
          <li key={i}>
            <span className="tdot" style={{ background: h.action === 'CREATED' ? 'var(--accent)' : h.action === 'UPDATED' ? 'var(--secondary)' : h.status === 'DELIVERED' ? 'var(--green)' : h.status === 'FAILED' ? 'var(--red)' : 'var(--tertiary)' }} />
            <div>
              <div>
                {h.action === 'CREATED' ? 'Livraison enregistrée' : h.action === 'STATUS' ? `Statut : ${LOGBOOK_STATUS[h.status!][0]}` : 'Modifiée'}
                {h.note && <span className="muted"> · « {h.note} »</span>}
              </div>
              {h.changes && Object.entries(h.changes).map(([k, c]) => (
                <small key={k} style={{ display: 'block' }}>{FIELD_LABEL[k] ?? k} : <s className="muted">{show(k, c.from)}</s> → <strong>{show(k, c.to)}</strong></small>
              ))}
              <small className="muted">{dateTime(h.at)}</small>
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
