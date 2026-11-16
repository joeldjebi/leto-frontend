import { useEffect, useState } from 'react';
import { api, dateTime, fcfa, User } from '../api';
import { Badge, Card, Empty, Field, Icon, Modal, Segmented, Stat, useToast } from '../ui';
import { ProofThumb } from './Billing';

export interface DriverCash {
  driverId: string; earned: number; deliveries: number; cod: number; share: number; sharePercent: number;
  confirmed: number; pending: number; toRemit: number; today: number; week: number; month: number;
}
export interface Remittance {
  id: string; driverId: string; driver?: User; amount: number; method: 'CASH' | 'MOBILE_MONEY';
  reference: string | null; proofUrl: string | null; note: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED'; createdBy: 'DRIVER' | 'COMPANY';
  reviewedBy: string | null; reviewedAt: string | null; reviewNote: string | null; createdAt: string;
}
export interface CompanyCash { balances: DriverCash[]; pending: Remittance[]; sharePercent: number }

const METHOD = { CASH: 'Espèces', MOBILE_MONEY: 'Mobile Money' } as const;
const STATUS = { PENDING: ['À confirmer', 'yellow'], CONFIRMED: ['Confirmé', 'green'], REJECTED: ['Refusé', 'red'] } as const;

/** Soldes de tous les livreurs de l'entreprise (gérant) */
export function useCompanyCash(enabled: boolean) {
  const [data, setData] = useState<CompanyCash | null>(null);
  const reload = () => (enabled ? api<CompanyCash>('/remittances/company').then(setData).catch(() => {}) : Promise.resolve());
  useEffect(() => {
    reload();
    if (!enabled) return;
    const t = window.setInterval(reload, 30_000);
    return () => window.clearInterval(t);
  }, [enabled]);
  return { data, reload };
}

/** Onglet « Gains et versements » de la fiche livreur */
export function EarningsTab({ driver, canManage }: { driver: User; canManage: boolean }) {
  const [data, setData] = useState<{ balance: DriverCash; history: Remittance[] } | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'record' | Remittance | null>(null);
  const reload = () => api<{ balance: DriverCash; history: Remittance[] }>(`/remittances/drivers/${driver.id}`).then(setData).catch((e) => setError((e as Error).message));
  useEffect(() => { reload(); }, [driver.id]);
  if (!data) return error ? <div className="alert error">{error}</div> : <Card><Empty icon="wallet">Chargement…</Empty></Card>;
  const b = data.balance;
  const pending = data.history.filter((r) => r.status === 'PENDING');

  return (
    <div className="stack">
      {canManage && (
        <div className="toolbar">
          <button className="btn" onClick={() => setDialog('record')}><Icon name="plus" size={15} />Enregistrer un versement reçu</button>
          <span className="muted">Part du livreur : {b.sharePercent} % du prix des courses</span>
        </div>
      )}
      <div className="grid grid-stats">
        <Stat icon="wallet" label="Gagné (courses terminées)" value={fcfa(b.earned)} foot={`${b.deliveries} course(s) · aujourd’hui ${fcfa(b.today)} · semaine ${fcfa(b.week)} · mois ${fcfa(b.month)}`} />
        <Stat icon="check" label={`Part du livreur (${b.sharePercent} %)`} value={fcfa(b.share)} foot={b.sharePercent ? 'Gardée par le livreur sur ses encaissements' : 'Le livreur verse la totalité (part à 0 %)'} />
        <Stat icon="receipt" label="Reste à verser" value={fcfa(b.toRemit)}
          foot={`Courses ${fcfa(b.earned)} + paiements à la livraison ${fcfa(b.cod)} − part − déjà versé ${fcfa(b.confirmed)}${b.pending ? ` · ${fcfa(b.pending)} en attente` : ''}`} />
      </div>
      {pending.length > 0 && (
        <Card title={`Versements à confirmer (${pending.length})`}>
          <RemittanceTable rows={pending} onReview={canManage ? setDialog : undefined} />
        </Card>
      )}
      <Card title="Historique des versements">
        {data.history.length === 0 ? <Empty icon="receipt">Aucun versement</Empty> : <RemittanceTable rows={data.history} onReview={canManage ? setDialog : undefined} />}
      </Card>
      {dialog === 'record' && <RecordDialog driver={driver} max={b.toRemit} onClose={() => setDialog(null)} onDone={reload} />}
      {dialog && dialog !== 'record' && <ReviewRemittance r={dialog} onClose={() => setDialog(null)} onDone={reload} />}
    </div>
  );
}

export function RemittanceTable({ rows, onReview, showDriver }: { rows: Remittance[]; onReview?: (r: Remittance) => void; showDriver?: boolean }) {
  return (
    <div className="table-scroll">
      <table className="list">
        <thead><tr><th>Date</th>{showDriver && <th>Livreur</th>}<th>Mode</th><th>Preuve</th><th className="num">Montant</th><th>Statut</th>{onReview && <th />}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const [label, color] = STATUS[r.status];
            return (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(r.createdAt)}<span className="sub">{r.createdBy === 'DRIVER' ? 'Déclaré par le livreur' : `Enregistré par ${r.reviewedBy ?? 'l’entreprise'}`}</span></td>
                {showDriver && <td>{r.driver?.name ?? '—'}<span className="sub">{r.driver?.phone}</span></td>}
                <td>{METHOD[r.method]}{(r.reference || r.note) && <span className="sub">{[r.reference && `réf. ${r.reference}`, r.note].filter(Boolean).join(' · ')}</span>}</td>
                <td>{r.proofUrl ? <ProofThumb url={r.proofUrl} /> : <span className="muted">—</span>}</td>
                <td className="num">{fcfa(r.amount)}</td>
                <td><Badge color={color}>{label}</Badge>{r.reviewNote && <span className="sub">{r.reviewNote}</span>}{r.status !== 'PENDING' && r.createdBy === 'DRIVER' && r.reviewedBy && <span className="sub">{r.reviewedBy} · {dateTime(r.reviewedAt)}</span>}</td>
                {onReview && <td>{r.status === 'PENDING' && <button className="btn" onClick={() => onReview(r)}>Vérifier</button>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Confirmer (montant reçu modifiable) ou refuser un versement déclaré par un livreur */
export function ReviewRemittance({ r, onClose, onDone }: { r: Remittance; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'confirm' | 'reject'>('confirm');
  const [amount, setAmount] = useState(String(r.amount));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      if (mode === 'confirm') {
        const n = Number(amount);
        if (!Number.isInteger(n) || n < 1) return setError('Montant reçu invalide');
        await api(`/remittances/${r.id}/confirm`, { method: 'POST', body: { amount: n } });
        toast(`Versement de ${fcfa(n)} confirmé`);
      } else {
        if (!note.trim()) return setError('Indiquez le motif');
        await api(`/remittances/${r.id}/reject`, { method: 'POST', body: { note: note.trim() } });
        toast('Versement refusé — le livreur voit le motif');
      }
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title={`Versement de ${r.driver?.name ?? 'livreur'}`}
      subtitle={`${fcfa(r.amount)} · ${METHOD[r.method]}${r.reference ? ` · réf. ${r.reference}` : ''} — vérifiez la réception avant de confirmer.`}
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className={`btn${mode === 'reject' ? ' danger' : ''}`} onClick={submit}>{mode === 'confirm' ? 'Confirmer la réception' : 'Refuser'}</button></>}>
      {r.proofUrl && <ProofThumb url={r.proofUrl} />}
      {r.note && <div className="muted">« {r.note} »</div>}
      <Segmented value={mode} onChange={setMode} options={[['confirm', 'Confirmer'], ['reject', 'Refuser']]} />
      {mode === 'confirm'
        ? <Field label="Montant réellement reçu (FCFA)"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
        : <Field label="Motif du refus" hint="Visible par le livreur"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex. montant non reçu" /></Field>}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** L'entreprise enregistre un versement remis directement (confirmé d'office) */
function RecordDialog({ driver, max, onClose, onDone }: { driver: User; max: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(max > 0 ? String(max) : '');
  const [method, setMethod] = useState<'CASH' | 'MOBILE_MONEY'>('CASH');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 100) return setError('Montant entier, 100 F minimum');
    try {
      await api(`/remittances/drivers/${driver.id}`, { method: 'POST', body: { amount: n, method, reference: reference.trim() || undefined, note: note.trim() || undefined } });
      toast(`Versement de ${fcfa(n)} enregistré pour ${driver.name}`);
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title={`Versement reçu de ${driver.name}`} subtitle={`Reste à verser : ${fcfa(max)}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Enregistrer</button></>}>
      <Segmented value={method} onChange={setMethod} options={[['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile Money']]} />
      <Field label="Montant reçu (FCFA)"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
      {method === 'MOBILE_MONEY' && <Field label="Référence (facultatif)"><input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} /></Field>}
      <Field label="Note (facultatif)"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex. remis au bureau" /></Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** Part du prix des courses gardée par les livreurs (réglage de l'entreprise) */
export function ShareDialog({ current, onClose, onDone }: { current: number; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState('');
  const submit = async () => {
    const n = Number(value.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100) return setError('Pourcentage entre 0 et 100');
    try {
      await api('/remittances/company/share', { method: 'PUT', body: { percent: n } });
      toast(`Part des livreurs : ${n} %`);
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Part des livreurs" subtitle="Pourcentage du prix de chaque course terminée que le livreur garde sur ses encaissements. 0 % : il verse tout (livreur salarié)." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Enregistrer</button></>}>
      <Field label="Part du livreur (%)" hint="Appliquée à toutes les courses terminées, y compris les précédentes">
        <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
