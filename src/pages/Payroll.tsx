import { useCallback, useEffect, useState } from 'react';
import {
  ADVANCE_STATUS, api, dateTime, downloadCsv, errText, PAY_PERIOD_LABEL, PayAdvance, PayLine, PayPeriod, PayrollOverview, PayrollSettings, PayRule,
  Payslip, PAYSLIP_STATUS, photoUrl, upload,
} from '../api';
import { formatMoney } from '../countries';
import { Badge, Card, Empty, Field, Icon, Modal, PageHeader, Segmented, Sheet, Stat, Switch, useToast } from '../ui';

const METHOD = { CASH: 'Espèces', MOBILE_MONEY: 'Mobile Money' } as const;
type Method = keyof typeof METHOD;

/**
 * Entreprise : paye interne de ses livreurs. Règle de rémunération, fiches par période,
 * primes / retenues, avances, compensation automatique des espèces encaissées non versées.
 */
export default function Payroll() {
  const [settings, setSettings] = useState<PayrollSettings | null>(null);
  const [data, setData] = useState<PayrollOverview | null>(null);
  const [start, setStart] = useState<string | undefined>();
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const [s, o] = await Promise.all([api<PayrollSettings>('/payroll/settings'), api<PayrollOverview>(`/payroll/period${start ? `?start=${start}` : ''}`)]);
      setSettings(s);
      setData(o);
    } catch (e) {
      setError(errText(e));
    }
  }, [start]);
  useEffect(() => {
    load();
    window.addEventListener('payroll:changed', load);
    return () => window.removeEventListener('payroll:changed', load);
  }, [load]);

  if (!settings || !data) return <><PageHeader title="Paye des livreurs" />{error && <div className="alert error">{error}</div>}</>;
  const rows = data.rows;
  const totalNet = rows.reduce((t, r) => t + (r.payslip && r.payslip.status !== 'DRAFT' ? r.payslip.net : r.estimate?.net ?? 0), 0);
  const paid = rows.filter((r) => r.payslip && r.payslip.status !== 'DRAFT').length;
  const pendingAdv = data.advances.filter((a) => a.status === 'PENDING');
  return (
    <>
      <PageHeader title="Paye des livreurs" subtitle="LETO calcule la paie de vos livreurs à partir de leurs courses ; vous les payez vous-même (espèces ou Mobile Money) et le livreur confirme la réception dans l’app." />
      <div className="stack">
        {error && <div className="alert error">{error}</div>}
        <SettingsCard settings={settings} onSaved={(s) => { setSettings(s); load(); }} />
        {settings.enabled && (
          <>
            <div className="grid grid-stats">
              <Stat icon="wallet" label={data.label} value={formatMoney(totalNet)} foot={`net à payer · ${paid}/${rows.length} fiche(s) payée(s)`} />
              <Stat icon="receipt" label="Espèces déduites" value={formatMoney(rows.reduce((t, r) => t + (r.payslip && r.payslip.status !== 'DRAFT' ? r.payslip.cashCompensated : r.estimate?.cashCompensated ?? 0), 0))} foot="encaissées par les livreurs et pas encore versées" />
              <Stat icon="clock" label="Avances" value={pendingAdv.length ? `${pendingAdv.length} à décider` : formatMoney(data.advances.filter((a) => a.status === 'GIVEN').reduce((t, a) => t + a.amount, 0))} foot={pendingAdv.length ? 'demandes des livreurs' : 'versées, retenues sur la prochaine paie'} />
            </div>
            <PeriodCard data={data} onStart={setStart} onChanged={setData} onOpen={setOpen} />
            <AdvancesCard data={data} drivers={settings.drivers.filter((d) => d.active)} onChanged={setData} />
          </>
        )}
      </div>
      {open && <PayslipSheet id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

// ---------- Réglages ----------

function RuleFields({ rule, onChange }: { rule: PayRule; onChange: (r: PayRule) => void }) {
  const n = (v: string) => (v === '' ? 0 : Number(v));
  const input = (value: number, set: (v: number) => void, label: string, step = 50) => (
    <input type="number" min={0} step={step} value={value} onChange={(e) => set(n(e.target.value))} style={{ width: 110, textAlign: 'right' }} aria-label={label} />
  );
  return (
    <>
      <div>
        <div className="grow"><div className="title">Fixe par période</div><small className="muted">Salaire fixe versé à chaque période, même sans course</small></div>
        {input(rule.fixed, (v) => onChange({ ...rule, fixed: v }), 'Fixe par période', 1000)}<span className="muted">F</span>
      </div>
      <div>
        <div className="grow"><div className="title">Par colis livré</div><small className="muted">Montant pour chaque arrêt livré pendant la période</small></div>
        {input(rule.perStop, (v) => onChange({ ...rule, perStop: v }), 'Montant par colis livré')}<span className="muted">F</span>
      </div>
      <div>
        <div className="grow"><div className="title">Pourcentage du prix des courses</div><small className="muted">Part du prix des courses terminées pendant la période</small></div>
        {input(rule.percent, (v) => onChange({ ...rule, percent: v }), 'Pourcentage du prix des courses', 1)}<span className="muted">%</span>
      </div>
      <div style={{ flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 220 }}><div className="title">Prime volume</div><small className="muted">À partir d’un nombre de colis livrés dans la période</small></div>
        <Switch checked={!!rule.volumeBonus} onChange={(v) => onChange({ ...rule, volumeBonus: v ? { stops: 100, amount: 5000 } : null })} label="Prime volume" />
        {rule.volumeBonus && <>{input(rule.volumeBonus.stops, (v) => onChange({ ...rule, volumeBonus: { ...rule.volumeBonus!, stops: v } }), 'Colis pour la prime', 10)}<span className="muted">colis →</span>
          {input(rule.volumeBonus.amount, (v) => onChange({ ...rule, volumeBonus: { ...rule.volumeBonus!, amount: v } }), 'Montant de la prime volume', 500)}<span className="muted">F</span></>}
      </div>
      <div style={{ flexWrap: 'wrap' }}>
        <div className="grow" style={{ minWidth: 220 }}><div className="title">Prime bonne note</div><small className="muted">Si la note moyenne de la période atteint le seuil (5 avis minimum)</small></div>
        <Switch checked={!!rule.ratingBonus} onChange={(v) => onChange({ ...rule, ratingBonus: v ? { min: 4.5, amount: 3000 } : null })} label="Prime bonne note" />
        {rule.ratingBonus && <>{input(rule.ratingBonus.min, (v) => onChange({ ...rule, ratingBonus: { ...rule.ratingBonus!, min: v } }), 'Note minimum', 0.1)}<span className="muted">★ →</span>
          {input(rule.ratingBonus.amount, (v) => onChange({ ...rule, ratingBonus: { ...rule.ratingBonus!, amount: v } }), 'Montant de la prime note', 500)}<span className="muted">F</span></>}
      </div>
    </>
  );
}

const ruleText = (r: PayRule) =>
  [r.fixed && `${formatMoney(r.fixed)} fixe`, r.perStop && `${formatMoney(r.perStop)} / colis`, r.percent && `${r.percent} % des courses`].filter(Boolean).join(' + ') || 'Aucune rémunération définie';

function SettingsCard({ settings, onSaved }: { settings: PayrollSettings; onSaved: (s: PayrollSettings) => void }) {
  const toast = useToast();
  const [period, setPeriod] = useState<PayPeriod>(settings.period);
  const [rule, setRule] = useState<PayRule>(settings.rule);
  const [expanded, setExpanded] = useState(!settings.enabled);
  const [driverRule, setDriverRule] = useState<PayrollSettings['drivers'][number] | null>(null);
  const [error, setError] = useState('');
  const dirty = period !== settings.period || JSON.stringify(rule) !== JSON.stringify(settings.rule);
  const save = async (extra: { enabled?: boolean } = {}) => {
    setError('');
    try {
      onSaved(await api<PayrollSettings>('/payroll/settings', { method: 'PUT', body: { period, rule, ...extra } }));
      toast(extra.enabled === true ? 'Paye des livreurs activée' : extra.enabled === false ? 'Paye des livreurs désactivée' : 'Règles de paye enregistrées');
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Card title="Règles de rémunération" actions={settings.enabled && <button className="btn plain" onClick={() => setExpanded(!expanded)}>{expanded ? 'Masquer' : 'Modifier'}</button>}>
      {error && <div className="alert error" style={{ margin: '0 20px 8px' }}>{error}</div>}
      <div className="rows">
        <div>
          <div className="grow">
            <div className="title">Paye des livreurs</div>
            <small className="muted">
              {settings.enabled
                ? `${PAY_PERIOD_LABEL[settings.period]} · ${ruleText(settings.rule)}. Les espèces encaissées et pas encore versées sont déduites automatiquement de la paie.`
                : `Activez pour calculer la paie de vos livreurs.${settings.sharePercent ? ` La part gardée par le livreur sur ses encaissements (${settings.sharePercent} %) passera à 0 % : la paie la remplace.` : ''}`}
            </small>
          </div>
          <Switch checked={settings.enabled} onChange={(v) => save({ enabled: v })} label={settings.enabled ? 'Désactiver la paye' : 'Activer la paye'} />
        </div>
        {expanded && (
          <>
            <div>
              <div className="grow"><div className="title">Période de paie</div><small className="muted">Semaine (lundi-dimanche), quinzaine (1-15, 16-fin du mois) ou mois</small></div>
              <Segmented<PayPeriod> value={period} onChange={setPeriod} options={[['WEEK', 'Semaine'], ['FORTNIGHT', 'Quinzaine'], ['MONTH', 'Mois']]} />
            </div>
            <RuleFields rule={rule} onChange={setRule} />
            <div><span className="grow" /><button className="btn" disabled={!dirty} onClick={() => save()}>Enregistrer</button></div>
          </>
        )}
        {settings.enabled && expanded && settings.drivers.length > 0 && (
          <div style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div className="title">Règle propre à un livreur</div>
            <small className="muted">Par défaut, tous vos livreurs suivent la règle ci-dessus.</small>
            <div className="chip-list" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {settings.drivers.filter((d) => d.active).map((d) => (
                <button key={d.id} type="button" className={`btn ${d.rule ? '' : 'secondary'}`} onClick={() => setDriverRule(d)} title={d.rule ? ruleText(d.rule) : 'Règle de l’entreprise'}>
                  {d.name}{d.rule && ' · règle propre'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {driverRule && <DriverRuleDialog driver={driverRule} base={settings.rule} onClose={() => setDriverRule(null)} onSaved={onSaved} />}
    </Card>
  );
}

function DriverRuleDialog({ driver, base, onClose, onSaved }: { driver: PayrollSettings['drivers'][number]; base: PayRule; onClose: () => void; onSaved: (s: PayrollSettings) => void }) {
  const toast = useToast();
  const [rule, setRule] = useState<PayRule>(driver.rule ?? base);
  const [error, setError] = useState('');
  const save = async (r: PayRule | null) => {
    try {
      onSaved(await api<PayrollSettings>(`/payroll/drivers/${driver.id}/rule`, { method: 'PUT', body: { rule: r } }));
      toast(r ? `Règle propre enregistrée pour ${driver.name}` : `${driver.name} suit la règle de l’entreprise`);
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title={`Rémunération de ${driver.name}`} subtitle="S’applique aux prochaines fiches de paie (et aux brouillons recalculés)." onClose={onClose}
      footer={<>{driver.rule && <button className="btn plain" onClick={() => save(null)}>Règle de l’entreprise</button>}<button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={() => save(rule)}>Enregistrer</button></>}>
      <div className="group rows"><RuleFields rule={rule} onChange={setRule} /></div>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

// ---------- Période ----------

function PeriodCard({ data, onStart, onChanged, onOpen }: { data: PayrollOverview; onStart: (s: string) => void; onChanged: (o: PayrollOverview) => void; onOpen: (id: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const drafts = data.rows.filter((r) => !r.payslip || r.payslip.status === 'DRAFT').length;
  const prepare = async () => {
    setBusy(true);
    try {
      onChanged(await api<PayrollOverview>(`/payroll/period/prepare?start=${data.start}`, { method: 'POST' }));
      toast('Fiches de paie préparées : vérifiez-les, ajoutez primes ou retenues, puis payez');
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    downloadCsv(`paye-${data.start}.csv`, [
      ['Livreur', 'Période', 'Statut', 'Courses', 'Colis', 'Prix des courses', 'Brut', 'Espèces déduites', 'Net', 'Payé le', 'Mode', 'Référence'],
      ...data.rows.map((r) => {
        const s = r.payslip;
        const done = s && s.status !== 'DRAFT';
        return [r.name, data.label, s ? PAYSLIP_STATUS[s.status][0] : 'Estimation', s?.deliveries ?? r.estimate?.deliveries ?? 0, s?.stops ?? r.estimate?.stops ?? 0, s?.revenue ?? r.estimate?.revenue ?? 0,
          s?.gross ?? r.estimate?.gross ?? 0, done ? s!.cashCompensated : r.estimate?.cashCompensated ?? 0, done ? s!.net : r.estimate?.net ?? 0,
          s?.paidAt ? new Date(s.paidAt).toLocaleDateString('fr-FR') : '', s?.method ? METHOD[s.method] : '', s?.reference ?? ''];
      }),
    ]);
  };
  return (
    <Card
      title="Fiches de paie"
      actions={<>
        <select value={data.start} onChange={(e) => onStart(e.target.value)} aria-label="Période">
          {data.periods.map((p, i) => <option key={p.start} value={p.start}>{p.label}{i === 0 ? ' (en cours)' : ''}</option>)}
        </select>
        <button className="btn secondary" onClick={exportCsv}><Icon name="download" size={15} />CSV</button>
        <button className="btn" disabled={busy || !drafts} onClick={prepare}>{data.rows.some((r) => r.payslip) ? 'Mettre à jour les brouillons' : 'Préparer la paye'}</button>
      </>}
    >
      {data.current && <small className="muted" style={{ display: 'block', margin: '0 20px 8px' }}>Période en cours : les montants évoluent avec les courses jusqu’au {new Date(`${data.end}T12:00:00Z`).toLocaleDateString('fr-FR')}.</small>}
      {data.rows.length === 0 ? <Empty icon="bike">Aucun livreur actif.</Empty> : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th className="num">Colis</th><th className="num">Prix des courses</th><th className="num">Brut</th><th className="num">Espèces déduites</th><th className="num">Net à payer</th><th>Fiche</th></tr></thead>
            <tbody>
              {data.rows.map((r) => {
                const s = r.payslip;
                const done = s && s.status !== 'DRAFT';
                const cash = done ? s!.cashCompensated : r.estimate?.cashCompensated ?? 0;
                return (
                  <tr key={r.driverId} className={s ? 'clickable' : undefined} onClick={() => s && onOpen(s.id)}>
                    <td>{r.name}{!r.active && <span className="sub">Désactivé</span>}</td>
                    <td className="num">{s?.stops ?? r.estimate?.stops ?? 0}</td>
                    <td className="num">{formatMoney(s?.revenue ?? r.estimate?.revenue ?? 0)}</td>
                    <td className="num">{formatMoney(s?.gross ?? r.estimate?.gross ?? 0)}</td>
                    <td className="num">{cash ? `− ${formatMoney(cash)}` : formatMoney(0)}{!done && (r.estimate?.cashOwed ?? 0) > cash && <span className="sub">{formatMoney((r.estimate?.cashOwed ?? 0) - cash)} resteront dus</span>}</td>
                    <td className="num"><strong>{formatMoney(done ? s!.net : r.estimate?.net ?? 0)}</strong></td>
                    <td>{s ? <Badge color={PAYSLIP_STATUS[s.status][1]}>{PAYSLIP_STATUS[s.status][0]}</Badge> : <span className="muted">Estimation</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------- Fiche de paie ----------

const LINE_COLOR = (l: PayLine) => (l.amount < 0 ? 'var(--orange)' : undefined);

function PayslipSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<Payslip | null>(null);
  const [line, setLine] = useState<{ kind: 'BONUS' | 'DEDUCTION'; label: string; amount: string } | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api<Payslip>(`/payroll/payslips/${id}`).then(setS).catch((e) => setError(errText(e))); }, [id]);
  const act = async (path: string, body?: unknown, msg?: string) => {
    setError('');
    try {
      setS(await api<Payslip>(`/payroll/payslips/${id}/${path}`, { method: 'POST', body }));
      if (msg) toast(msg);
      onChanged();
      return true;
    } catch (e) {
      setError(errText(e));
      return false;
    }
  };
  const draft = s?.status === 'DRAFT';
  const net = s ? (draft ? s.estimate?.net ?? s.gross : s.net) : 0;
  const cash = s ? (draft ? s.estimate?.cashCompensated ?? 0 : s.cashCompensated) : 0;
  return (
    <Sheet title={s ? `Paie · ${s.driverName ?? ''}` : 'Fiche de paie'} onClose={onClose} actions={s && <Badge color={PAYSLIP_STATUS[s.status][1]}>{PAYSLIP_STATUS[s.status][0]}</Badge>}>
      {error && <div className="alert error">{error}</div>}
      {!s ? <Empty icon="wallet">Chargement…</Empty> : (
        <>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{s.label}</div>
            <div className="muted">{s.deliveries} course(s) · {s.stops} colis livré(s) · {formatMoney(s.revenue)} de courses</div>
          </div>
          {s.status === 'DISPUTED' && <div className="alert error"><strong>Contestée par le livreur :</strong> « {s.disputeNote} »</div>}
          <div className="group">
            <table className="list" style={{ width: '100%' }}>
              <tbody>
                {s.lines.filter((l) => draft || l.kind !== 'CASH').map((l) => (
                  <tr key={l.id}>
                    <td>{l.label}{l.manual && <span className="sub">Ajoutée à la main</span>}</td>
                    <td className="num" style={{ color: LINE_COLOR(l), whiteSpace: 'nowrap' }}>{l.amount > 0 ? '+' : ''}{formatMoney(l.amount)}</td>
                    <td style={{ width: 30 }}>{draft && l.manual && <button className="btn plain" aria-label="Retirer" onClick={() => act(`lines/${l.id}/remove`)}><Icon name="close" size={14} /></button>}</td>
                  </tr>
                ))}
                <tr><td><strong>Brut</strong><span className="sub">Gains, primes, retenues et avances</span></td><td className="num"><strong>{formatMoney(s.gross)}</strong></td><td /></tr>
                <tr><td>Espèces encaissées non versées{draft && <span className="sub">Estimation : recalculée au paiement</span>}</td><td className="num" style={{ color: cash ? 'var(--orange)' : undefined }}>{cash ? `− ${formatMoney(cash)}` : formatMoney(0)}</td><td /></tr>
                <tr><td><strong>Net {draft ? 'à payer' : 'payé'}</strong></td><td className="num" style={{ fontSize: 18 }}><strong>{formatMoney(net)}</strong></td><td /></tr>
              </tbody>
            </table>
          </div>
          {draft && s.estimate && s.estimate.cashOwed > cash && (
            <small className="muted">Le livreur doit {formatMoney(s.estimate.cashOwed)} d’espèces : {formatMoney(s.estimate.cashOwed - cash)} resteront à verser après cette paie.</small>
          )}
          {!draft && (
            <dl className="kv">
              <dt>Payée le</dt><dd>{s.paidAt ? dateTime(s.paidAt) : '—'}{s.paidBy && ` · ${s.paidBy}`}</dd>
              <dt>Mode</dt><dd>{s.method ? METHOD[s.method] : '—'}{s.reference && ` · réf. ${s.reference}`}</dd>
              {s.proofUrl && <><dt>Preuve</dt><dd><a href={photoUrl(s.proofUrl)} target="_blank" rel="noreferrer">Voir la capture</a></dd></>}
              <dt>Livreur</dt><dd>{s.status === 'CONFIRMED' ? `Réception confirmée le ${dateTime(s.confirmedAt!)}` : s.status === 'DISPUTED' ? 'Contestée' : 'En attente de sa confirmation'}</dd>
            </dl>
          )}
          <div className="li-actions">
            {draft && <>
              <button className="btn secondary" onClick={() => setLine({ kind: 'BONUS', label: '', amount: '' })}><Icon name="plus" size={15} />Prime</button>
              <button className="btn secondary" onClick={() => setLine({ kind: 'DEDUCTION', label: '', amount: '' })}>Retenue</button>
              <button className="btn plain" onClick={() => act('refresh', undefined, 'Fiche recalculée')}><Icon name="refresh" size={15} />Recalculer</button>
              <span className="grow" />
              <button className="btn" onClick={() => setPaying(true)}>Payer {formatMoney(net)}</button>
            </>}
            {!draft && <button className="btn secondary" onClick={() => printPayslip(s)}><Icon name="receipt" size={15} />Imprimer / PDF</button>}
          </div>
        </>
      )}
      {line && (
        <Modal title={line.kind === 'BONUS' ? 'Ajouter une prime' : 'Ajouter une retenue'} subtitle="Visible par le livreur sur sa fiche de paie." onClose={() => setLine(null)}
          footer={<><button className="btn secondary" onClick={() => setLine(null)}>Annuler</button>
            <button className="btn" disabled={!line.label.trim() || !Number(line.amount)} onClick={async () => { if (await act('lines', { kind: line.kind, label: line.label, amount: Number(line.amount) })) setLine(null); }}>Ajouter</button></>}>
          <Field label="Libellé"><input autoFocus value={line.label} maxLength={120} placeholder={line.kind === 'BONUS' ? 'Ex. : ponctualité, fête de fin d’année' : 'Ex. : casque perdu, amende'} onChange={(e) => setLine({ ...line, label: e.target.value })} /></Field>
          <Field label="Montant"><input inputMode="numeric" value={line.amount} onChange={(e) => setLine({ ...line, amount: e.target.value.replace(/\D/g, '') })} /></Field>
        </Modal>
      )}
      {paying && s && <PayDialog s={s} net={net} onClose={() => setPaying(false)} onPay={async (body) => { if (await act('pay', body, 'Paie enregistrée · le livreur est prévenu')) setPaying(false); }} />}
    </Sheet>
  );
}

function PayDialog({ s, net, onClose, onPay }: { s: Payslip; net: number; onClose: () => void; onPay: (b: { method: Method; reference?: string; proofUrl?: string }) => void }) {
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [error, setError] = useState('');
  return (
    <Modal title={`Payer ${s.driverName ?? 'le livreur'}`} subtitle={`${formatMoney(net)} pour ${s.label}. Les espèces non versées sont recalculées et déduites au moment du paiement.`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={() => onPay({ method, reference: reference.trim() || undefined, proofUrl: proof ?? undefined })}>Confirmer le paiement</button></>}>
      <Segmented<Method> value={method} onChange={setMethod} options={[['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile Money']]} />
      {method === 'MOBILE_MONEY' && <Field label="Référence de la transaction (facultatif)"><input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} /></Field>}
      <Field label="Capture ou reçu (facultatif)" hint={proof ? 'Capture ajoutée' : 'Visible par le livreur'}>
        <input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { setProof(await upload(f)); } catch (err) { setError(errText(err)); } }} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

/** Fiche de paie imprimable (le navigateur propose « Enregistrer en PDF ») */
function printPayslip(s: Payslip) {
  const w = window.open('', '_blank');
  if (!w) return;
  const row = (l: string, a: number, bold = false) => `<tr${bold ? ' class="b"' : ''}><td>${l}</td><td class="n">${a > 0 && !bold ? '+' : ''}${formatMoney(a)}</td></tr>`;
  const esc = (t: string) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Fiche de paie · ${esc(s.driverName ?? '')} · ${esc(s.label)}</title>
<style>body{font-family:-apple-system,Segoe UI,Inter,sans-serif;color:#1A1A1A;max-width:640px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0}
.m{color:#666;margin:4px 0 20px}table{width:100%;border-collapse:collapse}td{padding:8px 0;border-bottom:1px solid #eee}.n{text-align:right;white-space:nowrap}
.b td{font-weight:700;border-top:2px solid #1A1A1A}.f{margin-top:24px;color:#666;font-size:12px}.bar{height:6px;background:#FBC02D;margin-bottom:20px}</style></head><body>
<div class="bar"></div><h1>Fiche de paie · ${esc(s.driverName ?? '')}</h1><div class="m">${esc(s.label)} · ${s.deliveries} course(s), ${s.stops} colis livré(s)</div>
<table>${s.lines.map((l) => row(esc(l.label), l.amount)).join('')}${row('Net payé', s.net, true)}</table>
<div class="f">Payée le ${s.paidAt ? new Date(s.paidAt).toLocaleDateString('fr-FR') : '—'}${s.method ? ` · ${METHOD[s.method]}` : ''}${s.reference ? ` · réf. ${esc(s.reference)}` : ''}${s.confirmedAt ? ` · réception confirmée par le livreur le ${new Date(s.confirmedAt).toLocaleDateString('fr-FR')}` : ''}. Calculée avec LETO.</div>
<script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

// ---------- Avances ----------

function AdvancesCard({ data, drivers, onChanged }: { data: PayrollOverview; drivers: PayrollSettings['drivers']; onChanged: (o: PayrollOverview) => void }) {
  const toast = useToast();
  const [decide, setDecide] = useState<{ a: PayAdvance; mode: 'approve' | 'reject' } | null>(null);
  const [record, setRecord] = useState(false);
  return (
    <Card title="Avances sur salaire" actions={<button className="btn secondary" disabled={!drivers.length} onClick={() => setRecord(true)}><Icon name="plus" size={15} />Enregistrer une avance</button>}>
      <small className="muted" style={{ display: 'block', margin: '0 20px 8px' }}>Les livreurs demandent une avance dans l’app. Une fois versée, elle est retenue automatiquement sur leur prochaine fiche de paie.</small>
      {data.advances.length === 0 ? <Empty icon="wallet">Aucune avance.</Empty> : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th>Demande</th><th className="num">Montant</th><th>Statut</th><th /></tr></thead>
            <tbody>
              {data.advances.map((a) => (
                <tr key={a.id}>
                  <td>{a.driverName}</td>
                  <td>{dateTime(a.createdAt)}<span className="sub">{a.createdBy === 'DRIVER' ? 'Demandée par le livreur' : 'Enregistrée par l’entreprise'}{a.reason ? ` · « ${a.reason} »` : ''}</span></td>
                  <td className="num">{formatMoney(a.amount)}</td>
                  <td><Badge color={ADVANCE_STATUS[a.status][1]}>{ADVANCE_STATUS[a.status][0]}</Badge>{a.note && <span className="sub">{a.note}</span>}{a.method && <span className="sub">{METHOD[a.method]}</span>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{a.status === 'PENDING' && <>
                    <button className="btn" onClick={() => setDecide({ a, mode: 'approve' })}>Verser</button>
                    <button className="btn plain" onClick={() => setDecide({ a, mode: 'reject' })}>Refuser</button>
                  </>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {decide && <AdvanceDecision {...decide} onClose={() => setDecide(null)} onDone={(o, msg) => { onChanged(o); toast(msg); setDecide(null); }} />}
      {record && <RecordAdvance drivers={drivers} onClose={() => setRecord(false)} onDone={(o) => { onChanged(o); toast('Avance enregistrée · retenue sur la prochaine paie'); setRecord(false); }} />}
    </Card>
  );
}

function AdvanceDecision({ a, mode, onClose, onDone }: { a: PayAdvance; mode: 'approve' | 'reject'; onClose: () => void; onDone: (o: PayrollOverview, msg: string) => void }) {
  const [method, setMethod] = useState<Method>('CASH');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      if (mode === 'approve') onDone(await api<PayrollOverview>(`/payroll/advances/${a.id}/approve`, { method: 'POST', body: { method } }), `Avance de ${formatMoney(a.amount)} versée à ${a.driverName}`);
      else onDone(await api<PayrollOverview>(`/payroll/advances/${a.id}/reject`, { method: 'POST', body: { note } }), 'Avance refusée · le livreur est prévenu');
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title={mode === 'approve' ? `Verser ${formatMoney(a.amount)} à ${a.driverName}` : 'Refuser l’avance'} subtitle={mode === 'approve' ? 'Confirmez une fois l’argent remis : il sera retenu sur sa prochaine paie.' : 'Le motif est envoyé au livreur.'} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className={`btn${mode === 'reject' ? ' danger' : ''}`} disabled={mode === 'reject' && !note.trim()} onClick={submit}>{mode === 'approve' ? 'Confirmer le versement' : 'Refuser'}</button></>}>
      {mode === 'approve' ? <Segmented<Method> value={method} onChange={setMethod} options={[['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile Money']]} />
        : <Field label="Motif"><input autoFocus value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></Field>}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

function RecordAdvance({ drivers, onClose, onDone }: { drivers: PayrollSettings['drivers']; onClose: () => void; onDone: (o: PayrollOverview) => void }) {
  const [driverId, setDriverId] = useState(drivers[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      onDone(await api<PayrollOverview>('/payroll/advances', { method: 'POST', body: { driverId, amount: Number(amount), method, reason: reason.trim() || undefined } }));
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title="Enregistrer une avance" subtitle="Avance déjà remise au livreur : elle sera retenue sur sa prochaine fiche de paie." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" disabled={!driverId || !Number(amount)} onClick={submit}>Enregistrer</button></>}>
      <Field label="Livreur"><select value={driverId} onChange={(e) => setDriverId(e.target.value)}>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <Field label="Montant"><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
      <Segmented<Method> value={method} onChange={setMethod} options={[['CASH', 'Espèces'], ['MOBILE_MONEY', 'Mobile Money']]} />
      <Field label="Motif (facultatif)"><input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
