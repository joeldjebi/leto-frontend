import { useCallback, useEffect, useState } from 'react';
import {
  api, CommissionType, CompanyAffiliations, date, dateTime, EARNING_LABEL, Earnings, errText, MyIndependent, PoolDriver, photoUrl, ruleLabel,
  VEHICLE_LABEL, WITHDRAWAL_STATUS,
} from '../api';
import { formatMoney, formatPhone } from '../countries';
import { Avatar, Badge, Card, Empty, Field, Modal, PageHeader, PhoneInput, Search, Segmented, Stat, useToast } from '../ui';

/**
 * Entreprise : livreurs indépendants (LI) validés par LETO à rattacher, LI rattachés,
 * commission prélevée sur leurs courses et gains (retrait ou transfert vers le crédit).
 */
export default function CompanyIndependents() {
  const [data, setData] = useState<CompanyAffiliations | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [a, e] = await Promise.all([api<CompanyAffiliations>('/affiliations/company'), api<Earnings>('/affiliations/earnings')]);
      setData(a);
      setEarnings(e);
    } catch (e) {
      setError(errText(e));
    }
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    window.addEventListener('affiliations:changed', load);
    return () => { window.clearInterval(t); window.removeEventListener('affiliations:changed', load); };
  }, [load]);

  if (!data || !earnings) return <><PageHeader title="Livreurs indépendants" />{error && <div className="alert error">{error}</div>}</>;
  return (
    <>
      <PageHeader
        title="Livreurs indépendants"
        subtitle="Livreurs validés par LETO, à rattacher à votre entreprise : vous en êtes responsable et vous prélevez une commission sur leurs courses, sur leur solde LETO."
      />
      <div className="stack">
        {error && <div className="alert error">{error}</div>}
        <div className="grid grid-stats">
          <Stat icon="bike" label="Mes livreurs indépendants" value={data.mine.length} foot={`${data.mine.filter((m) => m.online).length} en ligne · ${data.pool.length} disponibles dans le vivier`} />
          <Stat icon="wallet" label="Gains disponibles" value={formatMoney(earnings.available)} foot={`${formatMoney(earnings.pending)} en attente (${earnings.holdHours} h de délai)`} />
          <Stat icon="tag" label="Commission" value={data.rate ? ruleLabel(data.rate.type, data.rate.value) : '—'} foot={`par course · maximum LETO ${data.caps.maxPct} % ou ${formatMoney(data.caps.maxFixed)}`} />
        </div>
        <RateCard data={data} onSaved={setData} />
        <MineCard data={data} onChanged={load} />
        <PoolCard data={data} onChanged={setData} />
        <EarningsCard earnings={earnings} onChanged={setEarnings} />
      </div>
    </>
  );
}

/** Commission de l'entreprise sur les courses de ses LI (sous les plafonds de LETO) */
function RateCard({ data, onSaved }: { data: CompanyAffiliations; onSaved: (d: CompanyAffiliations) => void }) {
  const toast = useToast();
  const [type, setType] = useState<CommissionType>(data.rate?.type ?? 'PERCENT');
  const [value, setValue] = useState(data.rate ? String(data.rate.value) : '');
  const [error, setError] = useState('');
  const n = Number(value);
  const max = type === 'PERCENT' ? data.caps.maxPct : data.caps.maxFixed;
  const valid = value !== '' && Number.isFinite(n) && n >= 0 && n <= max;
  const dirty = !data.rate || type !== data.rate.type || n !== data.rate.value;
  const sample = 1000;
  const save = async () => {
    setError('');
    try {
      onSaved(await api<CompanyAffiliations>('/affiliations/company/rate', { method: 'PUT', body: { type, value: n } }));
      toast(data.mine.length ? 'Commission enregistrée · vos livreurs rattachés doivent accepter le nouveau taux' : 'Commission enregistrée');
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title="Votre commission sur leurs courses">
      {error && <div className="alert error" style={{ margin: '0 20px 8px' }}>{error}</div>}
      <div className="rows">
        <div style={{ flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <div className="title">Commission par course</div>
            <small className="muted">
              Prélevée sur le solde du livreur à la fin de chaque course, en plus de celle de LETO · ex. course à {formatMoney(sample)} → {formatMoney(type === 'PERCENT' ? Math.round((sample * (n || 0)) / 100) : n || 0)}.
              Maximum autorisé : {type === 'PERCENT' ? `${data.caps.maxPct} %` : formatMoney(data.caps.maxFixed)}.
            </small>
          </div>
          <Segmented<CommissionType> value={type} onChange={setType} options={[['PERCENT', '%'], ['FIXED', 'F fixe']]} labels={{ PERCENT: 'Pourcentage', FIXED: 'Montant fixe' }} />
          <input type="number" min={0} max={max} step={type === 'PERCENT' ? 0.5 : 50} value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 90, textAlign: 'right' }} aria-label="Valeur de la commission" />
          <button className="btn" disabled={!dirty || !valid} onClick={save}>Enregistrer</button>
        </div>
        <div>
          <small className="muted grow">
            Un changement de taux doit être accepté par chaque livreur rattaché ; d’ici là, l’ancien taux s’applique. Les livreurs indépendants ne prennent pas de course avec paiement à la livraison.
          </small>
        </div>
      </div>
    </Card>
  );
}

function MineCard({ data, onChanged }: { data: CompanyAffiliations; onChanged: () => void }) {
  const [ending, setEnding] = useState<MyIndependent | null>(null);
  return (
    <Card title={`Mes livreurs indépendants (${data.mine.length})`}>
      {data.mine.length === 0 ? (
        <Empty icon="bike">Aucun livreur rattaché pour le moment. Invitez-en depuis le vivier ci-dessous.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th>Engin</th><th>Commission</th><th className="num">Solde LETO</th><th className="num">Courses</th><th className="num">Gains générés</th><th /></tr></thead>
            <tbody>
              {data.mine.map((m) => {
                const pending = m.pendingRate?.split(':');
                return (
                  <tr key={m.id}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Face name={m.name} url={m.selfieUrl} />
                        <div>{m.name} {m.online && <Badge color="green">En ligne</Badge>}<span className="sub">{formatPhone(m.phone)} · depuis le {date(m.affiliatedAt)}</span></div>
                      </div>
                    </td>
                    <td>{m.vehicleType ? VEHICLE_LABEL[m.vehicleType] : '—'}{m.vehiclePlate && <span className="sub">{m.vehiclePlate}</span>}</td>
                    <td>
                      {m.affCommissionType && m.appliedRate != null ? ruleLabel(m.affCommissionType, m.appliedRate) : '—'}
                      {pending && <span className="sub">Nouveau taux en attente : {ruleLabel(pending[0] as CommissionType, Number(pending[1]))}</span>}
                    </td>
                    <td className="num">{Number(m.credit) < 1000 ? <Badge color="yellow">{formatMoney(Number(m.credit))}</Badge> : formatMoney(Number(m.credit))}</td>
                    <td className="num">{m.completed}{m.active > 0 && <span className="sub">{m.active} en cours</span>}</td>
                    <td className="num">{formatMoney(m.earned)}</td>
                    <td><button className="btn plain" disabled={m.active > 0} title={m.active > 0 ? 'Course en cours' : undefined} onClick={() => setEnding(m)}>Mettre fin</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {ending && <EndDialog driver={ending} onClose={() => setEnding(null)} onDone={onChanged} />}
    </Card>
  );
}

function EndDialog({ driver, onClose, onDone }: { driver: MyIndependent; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      await api(`/affiliations/drivers/${driver.id}/end`, { method: 'POST', body: { reason: reason.trim() || undefined } });
      toast(`${driver.name} n’est plus rattaché à votre entreprise`);
      onDone();
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title={`Mettre fin au rattachement de ${driver.name} ?`} subtitle="Il retourne dans le vivier et ne recevra plus de courses tant qu’une autre entreprise ne l’aura pas rattaché." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn danger" onClick={submit}>Mettre fin</button></>}>
      <Field label="Motif (facultatif)" hint="Visible par le livreur">
        <input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

function PoolCard({ data, onChanged }: { data: CompanyAffiliations; onChanged: (d: CompanyAffiliations) => void }) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const list = data.pool.filter((p) => `${p.name} ${p.commune ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const invite = async (p: PoolDriver) => {
    setError('');
    try {
      onChanged(await api<CompanyAffiliations>('/affiliations/invites', { method: 'POST', body: { profileId: p.id } }));
      toast(`Invitation envoyée à ${p.name}`);
    } catch (e) {
      setError(errText(e));
    }
  };
  const cancel = async (p: PoolDriver) => {
    try {
      onChanged(await api<CompanyAffiliations>(`/affiliations/invites/${p.inviteId}/cancel`, { method: 'POST' }));
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title={`Vivier · livreurs validés par LETO (${data.pool.length})`} actions={<Search value={q} onChange={setQ} placeholder="Nom, commune" />}>
      {error && <div className="alert error" style={{ margin: '0 20px 8px' }}>{error}</div>}
      {!data.rate && <div className="alert" style={{ margin: '0 20px 8px' }}>Fixez d’abord votre commission ci-dessus pour pouvoir inviter des livreurs.</div>}
      {list.length === 0 ? (
        <Empty icon="people">Aucun livreur indépendant disponible pour le moment.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th>Engin</th><th>Commune</th><th className="num">Courses</th><th>Note</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Face name={p.name} url={p.selfieUrl} /><div>{p.name} {p.online && <Badge color="green">En ligne</Badge>}{p.legacyUntil && <span className="sub">Travaille seul jusqu’au {date(p.legacyUntil)}</span>}</div></div></td>
                  <td>{p.vehicleType ? VEHICLE_LABEL[p.vehicleType] : '—'}</td>
                  <td>{p.commune ?? '—'}</td>
                  <td className="num">{p.completed}</td>
                  <td>{p.ratingAvg != null ? `${Number(p.ratingAvg).toFixed(1)} ★ (${p.ratingCount})` : <span className="muted">—</span>}</td>
                  <td>
                    {p.inviteId ? (
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Badge color="yellow">Invitation envoyée</Badge><button className="btn plain" onClick={() => cancel(p)}>Annuler</button></span>
                    ) : (
                      <button className="btn secondary" disabled={!data.rate} onClick={() => invite(p)}>Inviter</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function EarningsCard({ earnings, onChanged }: { earnings: Earnings; onChanged: (e: Earnings) => void }) {
  const [dialog, setDialog] = useState<'withdraw' | 'transfer' | null>(null);
  return (
    <Card
      title="Gains sur les courses de vos livreurs indépendants"
      actions={<>
        <button className="btn secondary" disabled={earnings.available <= 0} onClick={() => setDialog('transfer')}>Transférer vers mon crédit</button>
        <button className="btn" disabled={earnings.available < earnings.minWithdrawal || earnings.available <= 0} onClick={() => setDialog('withdraw')}>Demander un retrait</button>
      </>}
    >
      <div className="rows">
        <div>
          <small className="muted grow">
            Disponible : <strong>{formatMoney(earnings.available)}</strong> · en attente : {formatMoney(earnings.pending)} (disponible {earnings.holdHours} h après la course, le temps de traiter un éventuel litige).
            Retrait minimum {formatMoney(earnings.minWithdrawal)}, payé par LETO par Mobile Money. Le transfert vers le crédit est immédiat.
          </small>
        </div>
      </div>
      {earnings.withdrawals.length > 0 && (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Retrait</th><th>Vers</th><th className="num">Montant</th><th>Statut</th></tr></thead>
            <tbody>
              {earnings.withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{dateTime(w.createdAt)}<span className="sub">{w.requestedBy}</span></td>
                  <td>{w.operator}<span className="sub">{formatPhone(w.phone)}</span></td>
                  <td className="num">{formatMoney(w.amount)}</td>
                  <td>
                    <Badge color={WITHDRAWAL_STATUS[w.status][1]}>{WITHDRAWAL_STATUS[w.status][0]}</Badge>
                    {w.reference && <span className="sub">Réf. {w.reference}</span>}
                    {w.note && <span className="sub">{w.note}</span>}
                    {w.proofUrl && <a className="sub" href={photoUrl(w.proofUrl)} target="_blank" rel="noreferrer">Preuve de paiement</a>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {earnings.ledger.length === 0 ? (
        <Empty icon="wallet">Aucun gain pour le moment : ils apparaissent quand vos livreurs indépendants terminent des courses.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Date</th><th>Mouvement</th><th className="num">Montant</th></tr></thead>
            <tbody>
              {earnings.ledger.map((x) => (
                <tr key={x.id}>
                  <td>{dateTime(x.createdAt)}</td>
                  <td>
                    {EARNING_LABEL[x.type]}{x.driverName && ` · ${x.driverName}`}
                    {x.type === 'COMMISSION' && new Date(x.availableAt) > new Date() && <span className="sub">Disponible le {dateTime(x.availableAt)}</span>}
                  </td>
                  <td className="num" style={{ color: x.amount > 0 ? 'var(--green)' : undefined }}>{x.amount > 0 ? '+' : ''}{formatMoney(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog && <MoneyDialog mode={dialog} earnings={earnings} onClose={() => setDialog(null)} onDone={onChanged} />}
    </Card>
  );
}

function MoneyDialog({ mode, earnings, onClose, onDone }: { mode: 'withdraw' | 'transfer'; earnings: Earnings; onClose: () => void; onDone: (e: Earnings) => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(earnings.available));
  const [operator, setOperator] = useState('Orange Money');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const n = Number(amount);
  const submit = async () => {
    setError('');
    if (!Number.isInteger(n) || n <= 0 || n > earnings.available) return setError(`Montant entre 1 et ${formatMoney(earnings.available)}`);
    try {
      if (mode === 'withdraw') {
        if (!phone) return setError('Numéro Mobile Money obligatoire');
        onDone(await api<Earnings>('/affiliations/withdrawals', { method: 'POST', body: { amount: n, operator, phone } }));
        toast('Demande de retrait envoyée à LETO');
      } else {
        onDone(await api<Earnings>('/affiliations/earnings/transfer', { method: 'POST', body: { amount: n } }));
        toast(`${formatMoney(n)} ajouté(s) à votre crédit`);
      }
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal
      title={mode === 'withdraw' ? 'Demander un retrait' : 'Transférer vers mon crédit'}
      subtitle={mode === 'withdraw' ? `LETO vous envoie le montant par Mobile Money. Minimum ${formatMoney(earnings.minWithdrawal)}.` : 'Le montant est ajouté tout de suite au crédit qui paie vos commissions LETO.'}
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>{mode === 'withdraw' ? 'Envoyer la demande' : 'Transférer'}</button></>}
    >
      <Field label="Montant" hint={`Disponible : ${formatMoney(earnings.available)}`}>
        <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} />
      </Field>
      {mode === 'withdraw' && (
        <>
          <Field label="Opérateur">
            <select value={operator} onChange={(e) => setOperator(e.target.value)}>
              {['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <PhoneInput label="Numéro Mobile Money" value={phone} onChange={setPhone} />
        </>
      )}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** Selfie du dossier (photo de profil), sinon l'initiale */
function Face({ name, url }: { name: string; url: string | null }) {
  const [broken, setBroken] = useState(false);
  return url && !broken
    ? <img src={photoUrl(url)} alt="" onError={() => setBroken(true)} style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    : <Avatar name={name} />;
}
