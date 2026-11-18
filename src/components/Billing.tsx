import { useEffect, useRef, useState } from 'react';
import {
  api, BillingConfig, BillingOverview, CommissionType, CREDIT_LABEL, date, dateTime, daysLeft, PAYMENT_KIND_LABEL, PAYMENT_STATUS, Payment, PaymentKind, photoUrl, ruleLabel, upload,
} from '../api';
import { formatMoney, phoneError, formatPhone, currencyLabel } from '../countries';
import { Badge, Card, Empty, Field, Icon, Modal, PhoneInput, Segmented, Stat, useToast } from '../ui';

/** Charge la facturation d'une entreprise (gérant : /billing/me ; SA : /billing/companies/:id) */
export function useBilling(companyId: string | null) {
  const [data, setData] = useState<BillingOverview | null>(null);
  const [error, setError] = useState('');
  const path = companyId ? `/billing/companies/${companyId}` : '/billing/me';
  const reload = () => api<BillingOverview>(path).then(setData).catch((e) => setError((e as Error).message));
  useEffect(() => {
    reload();
    const t = window.setInterval(reload, 30_000);
    return () => window.clearInterval(t);
  }, [path]);
  return { data, setData, error, reload };
}

/** Bandeau d'alerte : abonnement expiré / bientôt expiré, crédit épuisé */
export function BillingAlert({ b, onPay }: { b: BillingOverview; onPay?: (k: PaymentKind) => void }) {
  const left = daysLeft(b.subscriptionEndsAt);
  if (b.inTrial) {
    const soon = b.trialDaysLeft <= 3;
    return (
      <div className={`banner ${soon ? 'warn' : 'info'}`} role="status">
        <Icon name="calendar" size={18} />
        <span className="grow">
          <strong>Essai gratuit : {b.trialDaysLeft} jour{b.trialDaysLeft > 1 ? 's' : ''} restant{b.trialDaysLeft > 1 ? 's' : ''}</strong> (jusqu’au {date(b.trialEndsAt)}).
          {' '}Les livreurs prennent des courses sans crédit{b.subscriptionRequired ? ' ni abonnement' : ''}, aucune commission n’est prélevée.
          {soon && onPay && ` Pensez à ${b.subscriptionRequired && !b.subscriptionEndsAt ? 'payer l’abonnement et ' : ''}recharger le crédit avant la fin.`}
        </span>
        {soon && onPay && <button className="btn secondary" onClick={() => onPay(b.subscriptionRequired && !b.subscriptionEndsAt ? 'SUBSCRIPTION' : 'TOPUP')}>{b.subscriptionRequired && !b.subscriptionEndsAt ? 'Payer l’abonnement' : 'Recharger'}</button>}
      </div>
    );
  }
  if (!b.subscribed) {
    return (
      <div className="banner danger" role="alert">
        <Icon name="alert" size={18} />
        <span className="grow"><strong>Abonnement inactif.</strong> Vos livreurs ne peuvent pas prendre de course tant que l’abonnement annuel n’est pas payé.</span>
        {onPay && <button className="btn" onClick={() => onPay('SUBSCRIPTION')}>Payer l’abonnement</button>}
      </div>
    );
  }
  if (b.available <= 0) {
    return (
      <div className="banner danger" role="alert">
        <Icon name="alert" size={18} />
        <span className="grow"><strong>Crédit épuisé.</strong> Vos livreurs ne peuvent plus accepter de course.</span>
        {onPay && <button className="btn" onClick={() => onPay('TOPUP')}>Recharger</button>}
      </div>
    );
  }
  if (b.subscriptionRequired && left != null && left <= 30) {
    return (
      <div className="banner warn">
        <Icon name="calendar" size={18} />
        <span className="grow">L’abonnement se termine dans {left} jour(s), le {date(b.subscriptionEndsAt)}.</span>
        {onPay && <button className="btn secondary" onClick={() => onPay('SUBSCRIPTION')}>Renouveler</button>}
      </div>
    );
  }
  return null;
}

/** Chiffres clés : crédit, disponible, abonnement, commission */
export function BillingStats({ b, onTopup }: { b: BillingOverview; onTopup?: () => void }) {
  const left = daysLeft(b.subscriptionEndsAt);
  return (
    <div className="grid grid-stats grid-4">
      <Stat icon="wallet" label="Crédit" value={formatMoney(b.credit)}
        foot={b.reserved ? `${formatMoney(b.reserved)} réservé(s) par les courses en cours` : 'Aucune course en cours'} onClick={onTopup} />
      <Stat icon="check" label="Disponible pour de nouvelles courses" value={formatMoney(Math.max(0, b.available))}
        foot={`${formatMoney(b.month.topups)} rechargé(s) ce mois-ci`} />
      {b.inTrial ? (
        <Stat icon="calendar" label="Essai gratuit" value={<Badge color="blue">{b.trialDaysLeft} j restant{b.trialDaysLeft > 1 ? 's' : ''}</Badge>}
          foot={`Jusqu’au ${date(b.trialEndsAt)} · sans crédit ni commission`} />
      ) : !b.subscriptionRequired ? (
        <Stat icon="calendar" label="Abonnement annuel" value={<Badge>Non demandé</Badge>} foot="LETO ne demande pas d’abonnement pour le moment" />
      ) : (
        <Stat icon="calendar" label="Abonnement annuel" value={b.subscribed ? <Badge color="green">Actif</Badge> : <Badge color="red">Inactif</Badge>}
          foot={b.subscriptionEndsAt ? `${b.subscribed ? 'Jusqu’au' : 'Expiré le'} ${date(b.subscriptionEndsAt)}${b.subscribed && left != null ? ` · ${left} j` : ''}` : `${formatMoney(b.config.subscriptionFee)} par an`} />
      )}
      <Stat icon="tag" label="Commission par course" value={b.rule.label}
        foot={b.inTrial ? 'Offerte pendant l’essai gratuit' : `${b.rule.custom ? 'Tarif propre à l’entreprise' : 'Tarif standard'} · ${formatMoney(b.month.commissions)} prélevé(s) ce mois`} />
    </div>
  );
}

/** Journal des mouvements de crédit */
export function TransactionsCard({ b }: { b: BillingOverview }) {
  return (
    <Card title="Mouvements du crédit">
      {b.transactions.length === 0 ? <Empty icon="receipt">Aucun mouvement</Empty> : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Date</th><th>Opération</th><th>Détail</th><th className="num">Montant</th><th className="num">Solde</th></tr></thead>
            <tbody>
              {b.transactions.map((t) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{dateTime(t.createdAt)}</td>
                  <td>{CREDIT_LABEL[t.type]}</td>
                  <td>{t.note ?? '—'}{t.deliveryId && <span className="sub">Course {t.deliveryId.slice(0, 8)}</span>}{t.createdBy && <span className="sub">par {t.createdBy}</span>}</td>
                  <td className={`num ${t.amount > 0 ? 'amount-pos' : 'amount-neg'}`}>{t.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(t.amount))}</td>
                  <td className="num">{formatMoney(t.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Miniature cliquable d'une preuve de paiement */
export function ProofThumb({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img className="proof-thumb" src={photoUrl(url)} alt="Preuve de paiement" onClick={(e) => { e.stopPropagation(); setOpen(true); }} />
      {open && (
        <Modal title="Preuve de paiement" onClose={() => setOpen(false)} footer={<>
          <a className="btn secondary" href={photoUrl(url)} target="_blank" rel="noreferrer">Ouvrir en grand</a>
          <button className="btn" onClick={() => setOpen(false)}>Fermer</button>
        </>}>
          <img className="proof-full" src={photoUrl(url)} alt="Preuve de paiement" />
        </Modal>
      )}
    </>
  );
}

/** Liste des paiements déclarés (preuves) */
export function PaymentsTable({ payments, showCompany, onReview }: { payments: Payment[]; showCompany?: boolean; onReview?: (p: Payment) => void }) {
  if (payments.length === 0) return <Empty icon="receipt">Aucun paiement</Empty>;
  return (
    <div className="table-scroll">
      <table className="list">
        <thead><tr><th>Envoyé le</th>{showCompany && <th>Entreprise</th>}<th>Objet</th><th>Paiement</th><th>Preuve</th><th className="num">Montant</th><th>Statut</th>{onReview && <th />}</tr></thead>
        <tbody>
          {payments.map((p) => {
            const [label, color] = PAYMENT_STATUS[p.status];
            return (
              <tr key={p.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{dateTime(p.createdAt)}{p.submittedBy && <span className="sub">par {p.submittedBy}</span>}</td>
                {showCompany && <td>{p.company?.name ?? '—'}</td>}
                <td>{PAYMENT_KIND_LABEL[p.kind]}</td>
                <td>{p.operator}<span className="sub">{formatPhone(p.senderPhone)}{p.reference ? ` · réf. ${p.reference}` : ''}</span></td>
                <td><ProofThumb url={p.proofUrl} /></td>
                <td className="num">{formatMoney(p.amount)}</td>
                <td>
                  <Badge color={color}>{label}</Badge>
                  {p.reviewNote && <span className="sub">{p.reviewNote}</span>}
                  {p.reviewedBy && <span className="sub">{p.reviewedBy} · {dateTime(p.reviewedAt)}</span>}
                </td>
                {onReview && <td>{p.status === 'PENDING' && <button className="btn" onClick={() => onReview(p)}>Vérifier</button>}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Comptes Mobile Money de LETO où l'entreprise doit payer */
export function AccountsList({ config }: { config: BillingConfig }) {
  const toast = useToast();
  if (config.accounts.length === 0) return <div className="alert info">Les numéros de paiement LETO ne sont pas encore renseignés : contactez LETO.</div>;
  return (
    <div className="accounts">
      {config.accounts.map((a) => (
        <div className="account" key={a.operator + a.number}>
          <Icon name="card" size={18} />
          <div style={{ flex: 1 }}><div><strong>{a.number}</strong> · {a.operator}</div><small className="muted">{a.name}</small></div>
          <button className="btn plain" onClick={() => { navigator.clipboard?.writeText(a.number); toast('Numéro copié'); }}>Copier</button>
        </div>
      ))}
    </div>
  );
}

/** Gérant : déclarer un paiement Mobile Money avec sa preuve (capture d'écran) */
export function PayDialog({ kind: initial, config, onClose, onDone }: { kind: PaymentKind; config: BillingConfig; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [kind, setKind] = useState<PaymentKind>(initial);
  const [amount, setAmount] = useState(initial === 'SUBSCRIPTION' ? String(config.subscriptionFee) : '');
  const [operator, setOperator] = useState(config.accounts[0]?.operator ?? config.operators[0]);
  const [senderPhone, setSenderPhone] = useState('');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const n = Number(amount);
  const errors = {
    amount: !Number.isInteger(n) || n < 500 ? `Montant entier, ${formatMoney(500)} minimum`
      : kind === 'SUBSCRIPTION' && n < config.subscriptionFee ? `L’abonnement annuel est de ${formatMoney(config.subscriptionFee)}` : null,
    phone: phoneError(senderPhone),
    proof: proof ? null : 'Ajoutez la capture du paiement',
  };

  const pick = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      setProof(await upload(file));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    setTried(true);
    if (errors.amount || errors.phone || errors.proof) return;
    setSending(true);
    try {
      await api('/billing/me/payments', { method: 'POST', body: { kind, amount: n, operator, senderPhone, reference: reference.trim() || undefined, proofUrl: proof } });
      toast('Preuve envoyée — LETO la vérifie et vous serez crédité dès validation');
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      title={kind === 'SUBSCRIPTION' ? 'Payer l’abonnement annuel' : 'Recharger le crédit'}
      subtitle="1. Envoyez le montant sur un des numéros LETO ci-dessous. 2. Joignez la capture du paiement : LETO valide sous peu."
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit} disabled={sending || uploading}>{sending ? 'Envoi…' : 'Envoyer la preuve'}</button></>}
    >
      <Segmented<PaymentKind> value={kind} onChange={(k) => { setKind(k); if (k === 'SUBSCRIPTION') setAmount(String(config.subscriptionFee)); }}
        options={config.subscriptionEnabled ? [['TOPUP', 'Recharge de crédit'], ['SUBSCRIPTION', `Abonnement · ${formatMoney(config.subscriptionFee)}/an`]] : [['TOPUP', 'Recharge de crédit']]} />
      <AccountsList config={config} />
      <Field label={`Montant envoyé (${currencyLabel()})`} error={tried ? errors.amount : null}>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} placeholder="Ex. 50000" />
      </Field>
      <div className="grid grid-2" style={{ gap: 12 }}>
        <Field label="Opérateur">
          <select value={operator} onChange={(e) => setOperator(e.target.value)}>
            {config.operators.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Numéro qui a payé" error={tried ? errors.phone : null}>
          <PhoneInput value={senderPhone} onChange={setSenderPhone} />
        </Field>
      </div>
      <Field label="Référence de la transaction (facultatif)">
        <input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} placeholder="Ex. MP240612.1234.A12345" />
      </Field>
      <Field label="Capture du paiement" error={tried ? errors.proof : null}>
        <div className="dropzone" role="button" tabIndex={0} onClick={() => input.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files[0]); }}>
          {uploading ? 'Envoi de l’image…' : proof ? <img src={photoUrl(proof)} alt="Preuve" /> : <><Icon name="upload" size={20} />Glissez la capture ici ou cliquez pour la choisir</>}
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** SA : vérifier une preuve et valider (montant reçu modifiable) ou refuser (motif) */
export function ReviewDialog({ payment: p, onClose, onDone }: { payment: Payment; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [mode, setMode] = useState<'approve' | 'reject'>('approve');
  const [amount, setAmount] = useState(String(p.amount));
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      if (mode === 'approve') {
        const n = Number(amount);
        if (!Number.isInteger(n) || n < 1) return setError('Montant reçu invalide');
        await api(`/billing/payments/${p.id}/approve`, { method: 'POST', body: { amount: n } });
        toast(p.kind === 'TOPUP' ? `${formatMoney(n)} crédité(s) à ${p.company?.name}` : `Abonnement de ${p.company?.name} prolongé d’un an`);
      } else {
        if (!note.trim()) return setError('Indiquez le motif du refus');
        await api(`/billing/payments/${p.id}/reject`, { method: 'POST', body: { note: note.trim() } });
        toast('Paiement refusé — l’entreprise voit le motif');
      }
      onDone();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={`${PAYMENT_KIND_LABEL[p.kind]} · ${p.company?.name ?? ''}`}
      subtitle={`${formatMoney(p.amount)} déclaré(s) via ${p.operator} depuis le ${formatPhone(p.senderPhone)}${p.reference ? ` · réf. ${p.reference}` : ''} — vérifiez la réception sur le compte LETO avant de valider.`}
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button>
        <button className={`btn${mode === 'reject' ? ' danger' : ''}`} onClick={submit}>{mode === 'approve' ? 'Valider le paiement' : 'Refuser'}</button></>}
    >
      <img className="proof-full" src={photoUrl(p.proofUrl)} alt="Preuve de paiement" />
      <Segmented value={mode} onChange={setMode} options={[['approve', 'Valider'], ['reject', 'Refuser']]} />
      {mode === 'approve' ? (
        <Field label={`Montant réellement reçu (${currencyLabel()})`} hint={p.kind === 'TOPUP' ? 'Ce montant sera ajouté au crédit' : 'L’abonnement sera prolongé d’un an'}>
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
        </Field>
      ) : (
        <Field label="Motif du refus" hint="Visible par l’entreprise">
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Ex. paiement non reçu, capture illisible…" />
        </Field>
      )}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** SA : actions sur la facturation d'une entreprise */
export function AdjustDialog({ companyId, onClose, onDone }: { companyId: string; onClose: () => void; onDone: (b: BillingOverview) => void }) {
  const toast = useToast();
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) return setError('Montant invalide');
    if (!note.trim()) return setError('Motif obligatoire (il apparaît dans le journal)');
    try {
      onDone(await api<BillingOverview>(`/billing/companies/${companyId}/adjust`, { method: 'POST', body: { amount: sign === '+' ? n : -n, note: note.trim() } }));
      toast('Crédit ajusté');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Ajuster le crédit" subtitle="Geste commercial, correction d’erreur… Chaque ajustement est inscrit au journal." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Enregistrer</button></>}>
      <Segmented value={sign} onChange={setSign} options={[['+', 'Ajouter'], ['-', 'Retirer']]} />
      <Field label={`Montant (${currencyLabel()})`}><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
      <Field label="Motif"><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

export function SubscriptionDialog({ companyId, current, onClose, onDone }: { companyId: string; current: string | null; onClose: () => void; onDone: (b: BillingOverview) => void }) {
  const toast = useToast();
  const [value, setValue] = useState(current ? current.slice(0, 10) : '');
  const [error, setError] = useState('');
  const save = async (endsAt: string | null) => {
    try {
      onDone(await api<BillingOverview>(`/billing/companies/${companyId}/subscription`, { method: 'PUT', body: { endsAt } }));
      toast(endsAt ? `Abonnement actif jusqu’au ${date(endsAt)}` : 'Abonnement désactivé');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const inOneYear = () => { const d = new Date(); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };
  return (
    <Modal title="Date de fin d’abonnement" subtitle="Normalement prolongé automatiquement à la validation d’un paiement. À modifier à la main seulement en cas d’exception." onClose={onClose}
      footer={<>
        {current && <button className="btn danger" onClick={() => save(null)}>Désactiver</button>}
        <button className="btn secondary" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={() => (value ? save(new Date(`${value}T23:59:59`).toISOString()) : setError('Choisissez une date'))}>Enregistrer</button>
      </>}>
      <Field label="Actif jusqu’au"><input type="date" value={value} onChange={(e) => setValue(e.target.value)} /></Field>
      <button className="btn plain" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setValue(inOneYear())}>Dans un an</button>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** SA : essai gratuit d'une entreprise (sans crédit ni abonnement, aucune commission) */
export function TrialDialog({ companyId, b, onClose, onDone }: { companyId: string; b: BillingOverview; onClose: () => void; onDone: (b: BillingOverview) => void }) {
  const toast = useToast();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [value, setValue] = useState(b.inTrial && b.trialEndsAt ? b.trialEndsAt.slice(0, 10) : '');
  const [error, setError] = useState('');
  const save = async (endsAt: string | null) => {
    try {
      const next = await api<BillingOverview>(`/billing/companies/${companyId}/trial`, { method: 'PUT', body: { endsAt } });
      onDone(next);
      toast(endsAt && next.inTrial ? `Essai gratuit jusqu’au ${date(endsAt)}` : 'Essai gratuit arrêté');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // Les raccourcis partent de la fin d'essai en cours (prolongation), sinon d'aujourd'hui
  const from = () => (b.inTrial && b.trialEndsAt ? new Date(b.trialEndsAt) : new Date());
  const plus = (days: number) => { const d = from(); d.setDate(d.getDate() + days); setValue(iso(d)); };
  return (
    <Modal
      title="Essai gratuit"
      subtitle="Pendant l’essai, les livreurs de l’entreprise prennent des courses sans crédit ni abonnement, et aucune commission n’est prélevée."
      onClose={onClose}
      footer={<>
        {b.inTrial && <button className="btn danger" onClick={() => save(new Date().toISOString())}>Arrêter l’essai</button>}
        <button className="btn secondary" onClick={onClose}>Annuler</button>
        <button className="btn" onClick={() => {
          if (!value) return setError('Choisissez une date');
          if (value <= iso(new Date())) return setError('Choisissez une date à venir');
          save(new Date(`${value}T23:59:59`).toISOString());
        }}>{b.inTrial ? 'Enregistrer' : 'Démarrer l’essai'}</button>
      </>}
    >
      <p className="muted" style={{ margin: 0 }}>
        {b.inTrial ? `En cours : ${b.trialDaysLeft} jour(s) restant(s), jusqu’au ${date(b.trialEndsAt)}.` : b.trialEndsAt ? `Essai terminé le ${date(b.trialEndsAt)}.` : 'Cette entreprise n’a pas encore eu d’essai.'}
      </p>
      <Field label="Essai jusqu’au"><input type="date" min={iso(new Date(Date.now() + 86_400_000))} value={value} onChange={(e) => setValue(e.target.value)} /></Field>
      <div className="chips">
        {[7, 14, 30].map((n) => <button key={n} type="button" className="chip" onClick={() => plus(n)}>{b.inTrial ? `+ ${n} jours` : `${n} jours`}</button>)}
      </div>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

export function CommissionDialog({ companyId, b, onClose, onDone }: { companyId: string; b: BillingOverview; onClose: () => void; onDone: (b: BillingOverview) => void }) {
  const toast = useToast();
  const [custom, setCustom] = useState<'default' | 'custom'>(b.rule.custom ? 'custom' : 'default');
  const [type, setType] = useState<CommissionType>(b.rule.type);
  const [value, setValue] = useState(String(b.rule.value));
  const [error, setError] = useState('');
  const save = async () => {
    const n = Number(value.replace(',', '.'));
    if (custom === 'custom' && (!Number.isFinite(n) || n < 0 || (type === 'PERCENT' && n > 100))) return setError(type === 'PERCENT' ? 'Pourcentage entre 0 et 100' : 'Montant invalide');
    try {
      const body = custom === 'custom' ? { type, value: type === 'FIXED' ? Math.round(n) : n } : { type: null, value: null };
      onDone(await api<BillingOverview>(`/billing/companies/${companyId}/commission`, { method: 'PUT', body }));
      toast('Commission enregistrée — appliquée aux prochaines courses');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Commission de l’entreprise" subtitle="Prélevée sur le crédit à la fin de chaque tournée. Les courses déjà acceptées gardent leur commission." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={save}>Enregistrer</button></>}>
      <Segmented value={custom} onChange={setCustom} options={[['default', `Tarif standard (${ruleLabel(b.config.commissionType, b.config.commissionValue)})`], ['custom', 'Tarif propre']]} />
      {custom === 'custom' && (
        <>
          <Segmented<CommissionType> value={type} onChange={setType} options={[['PERCENT', 'Pourcentage'], ['FIXED', 'Montant fixe']]} />
          <Field label={type === 'PERCENT' ? 'Pourcentage du prix de la tournée' : `Montant par tournée (${currencyLabel()})`}>
            <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
        </>
      )}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
