import { useEffect, useState } from 'react';
import { api, dateTime, errText, upload, Withdrawal, WITHDRAWAL_STATUS, WithdrawalStatus } from '../api';
import { formatMoney, formatPhone } from '../countries';
import { Badge, Card, Empty, Field, Modal, PageHeader, Segmented, useToast } from '../ui';

/** SA : demandes de retrait des gains des entreprises (commissions sur leurs livreurs indépendants) */
export default function Withdrawals() {
  const [status, setStatus] = useState<WithdrawalStatus | 'ALL'>('PENDING');
  const [list, setList] = useState<Withdrawal[]>([]);
  const [open, setOpen] = useState<Withdrawal | null>(null);
  const reload = async () => setList(await api<Withdrawal[]>(status === 'ALL' ? '/affiliations/withdrawals' : `/affiliations/withdrawals?status=${status}`));
  useEffect(() => {
    reload().catch(() => {});
    const t = window.setInterval(() => reload().catch(() => {}), 30_000);
    window.addEventListener('withdrawals:changed', reload);
    return () => { window.clearInterval(t); window.removeEventListener('withdrawals:changed', reload); };
  }, [status]);
  return (
    <>
      <PageHeader title="Retraits" subtitle="Gains des entreprises sur les courses de leurs livreurs indépendants : envoyez le montant par Mobile Money, puis confirmez le paiement." />
      <div className="stack">
        <div className="toolbar">
          <Segmented<WithdrawalStatus | 'ALL'> value={status} onChange={setStatus} options={[['PENDING', 'À payer'], ['PAID', 'Payés'], ['REJECTED', 'Refusés'], ['ALL', 'Tous']]} />
        </div>
        <Card>
          {list.length === 0 ? (
            <Empty icon="wallet">Aucune demande de retrait.</Empty>
          ) : (
            <div className="table-scroll">
              <table className="list">
                <thead><tr><th>Entreprise</th><th>Demande</th><th>Vers</th><th className="num">Montant</th><th>Statut</th></tr></thead>
                <tbody>
                  {list.map((w) => (
                    <tr key={w.id} className={w.status === 'PENDING' ? 'clickable' : undefined} onClick={() => w.status === 'PENDING' && setOpen(w)}>
                      <td>{w.companyName}<span className="sub">{w.companyPhone ? formatPhone(w.companyPhone) : ''}</span></td>
                      <td>{dateTime(w.createdAt)}<span className="sub">{w.requestedBy}</span></td>
                      <td>{w.operator}<span className="sub">{formatPhone(w.phone)}</span></td>
                      <td className="num">{formatMoney(w.amount)}</td>
                      <td>
                        <Badge color={WITHDRAWAL_STATUS[w.status][1]}>{WITHDRAWAL_STATUS[w.status][0]}</Badge>
                        {w.processedAt && <span className="sub">{dateTime(w.processedAt)} · {w.processedBy}</span>}
                        {w.reference && <span className="sub">Réf. {w.reference}</span>}
                        {w.note && <span className="sub">{w.note}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {open && <ProcessDialog w={open} onClose={() => setOpen(null)} onDone={setList} />}
    </>
  );
}

function ProcessDialog({ w, onClose, onDone }: { w: Withdrawal; onClose: () => void; onDone: (l: Withdrawal[]) => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'pay' | 'reject'>('pay');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      if (mode === 'pay') {
        onDone(await api<Withdrawal[]>(`/affiliations/withdrawals/${w.id}/pay`, { method: 'POST', body: { reference: reference.trim() || undefined, proofUrl: proof ?? undefined } }));
        toast(`Retrait de ${formatMoney(w.amount)} confirmé`);
      } else {
        if (!note.trim()) return setError('Indiquez le motif du refus');
        onDone(await api<Withdrawal[]>(`/affiliations/withdrawals/${w.id}/reject`, { method: 'POST', body: { note: note.trim() } }));
        toast('Retrait refusé · le montant est rendu à l’entreprise');
      }
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal
      title={`Retrait · ${w.companyName ?? ''}`}
      subtitle={`${formatMoney(w.amount)} à envoyer sur ${w.operator} au ${formatPhone(w.phone)}.`}
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className={`btn${mode === 'reject' ? ' danger' : ''}`} onClick={submit}>{mode === 'pay' ? 'Confirmer le paiement' : 'Refuser'}</button></>}
    >
      <Segmented value={mode} onChange={setMode} options={[['pay', 'Payé'], ['reject', 'Refuser']]} />
      {mode === 'pay' ? (
        <>
          <Field label="Référence de la transaction (facultatif)">
            <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
          </Field>
          <Field label="Capture du paiement (facultatif)" hint={proof ? 'Capture ajoutée' : 'Visible par l’entreprise'}>
            <input type="file" accept="image/*" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try { setProof(await upload(f)); } catch (err) { setError(errText(err)); }
            }} />
          </Field>
        </>
      ) : (
        <Field label="Motif du refus" hint="Visible par l’entreprise ; le montant lui est rendu">
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
