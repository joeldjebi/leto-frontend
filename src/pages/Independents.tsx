import { useCallback, useEffect, useState } from 'react';
import {
  api, BillingOverview, CommissionType, CREDIT_LABEL, date, dateTime, IndependentCounts, IndependentDoc, IndependentDossier, IndependentRow, IndependentsConfig, IndependentStatus, INDEPENDENT_STATUS, photoUrl, ruleLabel, VEHICLE_LABEL,errText } from '../api';
import { formatMoney, formatPhone, currencySymbol } from '../countries';
import { Avatar, Badge, Card, Empty, Field, Icon, Modal, PageHeader, Search, Segmented, Sheet, Switch, useToast } from '../ui';

type Filter = IndependentStatus | 'ALL';
interface ListResponse { items: IndependentRow[]; counts: IndependentCounts; config: IndependentsConfig }

const ID_LABEL = { CNI: 'CNI', PASSPORT: 'Passeport', CONSULAR: 'Carte consulaire', RESIDENCE: 'Carte de séjour' } as const;
const DOCS: [IndependentDoc, string][] = [
  ['selfieUrl', 'Selfie'], ['docsSelfieUrl', 'Avec ses documents en main'], ['idFrontUrl', 'Pièce (recto)'], ['idBackUrl', 'Pièce (verso)'],
  ['licenseUrl', 'Permis'], ['registrationUrl', 'Carte grise'], ['insuranceUrl', 'Assurance'],
];
const HISTORY: Record<IndependentDossier['history'][number]['action'], [string, string]> = {
  CREATED: ['Compte créé dans l’app', '#8e8e93'],
  SUBMITTED: ['Dossier envoyé pour vérification', '#c2410c'],
  APPROVED: ['Dossier validé', '#34c759'],
  REJECTED: ['Dossier refusé', '#ff3b30'],
  SUSPENDED: ['Livreur suspendu', '#ff3b30'],
  REACTIVATED: ['Livreur réactivé', '#34c759'],
};
const vehicleIcon = (v: string | null) => (v === 'CAR' ? 'car' : v === 'CARGO' ? 'truck' : 'moto');
const age = (iso: string) => {
  const b = new Date(iso);
  const n = new Date();
  return n.getFullYear() - b.getFullYear() - (n.getMonth() < b.getMonth() || (n.getMonth() === b.getMonth() && n.getDate() < b.getDate()) ? 1 : 0);
};

const StatusBadgeLI = ({ status }: { status: IndependentStatus }) => <Badge color={INDEPENDENT_STATUS[status][1]}>{INDEPENDENT_STATUS[status][0]}</Badge>;

/** SA : livreurs indépendants — règles, dossiers d'inscription, validation, solde */
export default function Independents() {
  const [filter, setFilter] = useState<Filter>('PENDING');
  const [data, setData] = useState<ListResponse | null>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<IndependentRow | null>(null);

  const load = useCallback(
    () => api<ListResponse>(`/independents${filter === 'ALL' ? '' : `?status=${filter}`}`).then(setData).catch(() => {}),
    [filter],
  );
  useEffect(() => {
    load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [load]);

  const c = data?.counts;
  const total = c ? c.pending + c.approved + c.rejected + c.suspended + c.draft : 0;
  const rows = (data?.items ?? []).filter((r) => (r.name + r.phone + (r.vehiclePlate ?? '') + (r.commune ?? '')).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Livreurs indépendants"
        subtitle={c ? `${c.approved} validé(s) · ${c.pending} dossier(s) à vérifier` : 'Chargement…'}
      />
      <div className="stack">
        <RulesCard />
        <AffiliationRulesCard />
        <div>
          <div className="toolbar">
            <div className="li-tabs"><Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                ['PENDING', `En attente${c ? ` (${c.pending})` : ''}`],
                ['APPROVED', `Validés${c ? ` (${c.approved})` : ''}`],
                ['REJECTED', `Refusés${c ? ` (${c.rejected})` : ''}`],
                ['SUSPENDED', `Suspendus${c ? ` (${c.suspended})` : ''}`],
                ['DRAFT', `Brouillons${c ? ` (${c.draft})` : ''}`],
                ['ALL', `Tous${c ? ` (${total})` : ''}`],
              ]}
            /></div>
            <span className="spacer" />
            <Search value={q} onChange={setQ} placeholder="Nom, téléphone, plaque" />
          </div>
          <Card>
            {!data ? <Empty icon="bike">Chargement…</Empty> : rows.length === 0 ? (
              <Empty icon="bike">{filter === 'PENDING' ? 'Aucun dossier à vérifier' : 'Aucun livreur indépendant'}</Empty>
            ) : (
              <div className="table-scroll">
                <table className="list">
                  <thead><tr><th>Livreur</th><th>Engin</th><th>Commune</th><th>Envoyé le</th><th>Entreprise</th><th className="num">Solde</th><th className="num">Courses</th><th>Statut</th></tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="clickable" onClick={() => setOpen(r)}>
                        <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar name={r.name} /><div>{r.name}<span className="sub">{formatPhone(r.phone)}</span></div></div></td>
                        <td>
                          {r.vehicleType ? <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Icon name={vehicleIcon(r.vehicleType)} size={15} />{VEHICLE_LABEL[r.vehicleType]}</span> : <span className="muted">—</span>}
                          {r.vehiclePlate && <span className="sub">{r.vehiclePlate}</span>}
                        </td>
                        <td>{r.commune ?? <span className="muted">—</span>}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.submittedAt ? dateTime(r.submittedAt) : <span className="muted">Pas encore envoyé</span>}<span className="sub">inscrit le {date(r.createdAt)}</span></td>
                        <td>
                          {r.affiliatedCompanyName ?? (r.status === 'APPROVED'
                            ? (r.legacyUntil && new Date(r.legacyUntil) > new Date() ? <span className="muted">Seul jusqu’au {date(r.legacyUntil)}</span> : <Badge color="yellow">Sans entreprise</Badge>)
                            : <span className="muted">—</span>)}
                        </td>
                        <td className="num">{formatMoney(Number(r.credit) || 0)}</td>
                        <td className="num">{r.completed}</td>
                        <td><StatusBadgeLI status={r.status} />{r.reviewNote && (r.status === 'REJECTED' || r.status === 'SUSPENDED') && <span className="sub">{r.reviewNote}</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
      {open && <DossierSheet row={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

/** Règles : inscriptions, interrupteur général, commission */
function RulesCard() {
  const toast = useToast();
  const [cfg, setCfg] = useState<IndependentsConfig | null>(null);
  const [type, setType] = useState<CommissionType>('PERCENT');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const apply = (c: IndependentsConfig) => { setCfg(c); setType(c.commissionType); setValue(String(c.commissionValue)); };
  useEffect(() => { api<IndependentsConfig>('/independents/config').then(apply).catch(() => {}); }, []);
  if (!cfg) return null;

  const put = async (body: Partial<IndependentsConfig>, msg: string) => {
    setError('');
    try {
      apply(await api<IndependentsConfig>('/independents/config', { method: 'PUT', body }));
      toast(msg);
    } catch (e) {
      setError(errText(e));
    }
  };
  const n = Number(value);
  const dirty = type !== cfg.commissionType || n !== cfg.commissionValue;
  const valid = value !== '' && Number.isFinite(n) && n >= 0 && (type === 'FIXED' || n <= 100);
  const sample = 3000;

  return (
    <Card title="Règles des livreurs indépendants">
      {error && <div className="alert error" style={{ margin: '0 20px 8px' }}>{error}</div>}
      <div className="rows">
        <div>
          <div className="grow">
            <div className="title">Inscriptions ouvertes dans l’app</div>
            <small className="muted">Fermées : le bouton « Devenir livreur indépendant » est masqué dans l’app. Les dossiers déjà créés restent consultables.</small>
          </div>
          <Switch checked={cfg.registrationOpen} label="Inscriptions ouvertes"
            onChange={(v) => put({ registrationOpen: v }, v ? 'Inscriptions ouvertes dans l’app' : 'Inscriptions fermées')} />
        </div>
        <div>
          <div className="grow">
            <div className="title">Livreurs indépendants actifs</div>
            <small className="muted">Désactivé : aucun livreur indépendant ne reçoit de course ; ceux qui sont en course la terminent normalement.</small>
          </div>
          {!cfg.enabled && <Badge color="red">Désactivés</Badge>}
          <Switch checked={cfg.enabled} label="Livreurs indépendants actifs"
            onChange={(v) => put({ enabled: v }, v ? 'Livreurs indépendants réactivés' : 'Livreurs indépendants désactivés — plus aucune nouvelle course')} />
        </div>
        <div style={{ flexWrap: 'wrap' }}>
          <div className="grow" style={{ minWidth: 220 }}>
            <div className="title">Commission LETO par course</div>
            <small className="muted">
              Prélevée sur le solde du livreur · ex. course à {formatMoney(sample)} → {formatMoney(type === 'PERCENT' ? Math.round((sample * (n || 0)) / 100) : n || 0)}.
              Actuellement : {ruleLabel(cfg.commissionType, cfg.commissionValue)}.
            </small>
          </div>
          <Segmented<CommissionType> value={type} onChange={setType} options={[['PERCENT', '%'], ['FIXED', 'F fixe']]} labels={{ PERCENT: 'Pourcentage', FIXED: 'Montant fixe' }} />
          <input type="number" min={0} max={type === 'PERCENT' ? 100 : undefined} step={type === 'PERCENT' ? 0.5 : 50} value={value}
            onChange={(e) => setValue(e.target.value)} style={{ width: 90, textAlign: 'right' }} aria-label="Valeur de la commission" />
          <button className="btn" disabled={!dirty || !valid} onClick={() => put({ commissionType: type, commissionValue: n }, 'Commission des indépendants enregistrée')}>Enregistrer</button>
        </div>
        <div>
          <Icon name="tag" size={16} className="muted" />
          <small className="muted grow">
            Les livreurs indépendants appliquent les tarifs LETO par défaut (Tarifs et règles) et ne peuvent pas prendre de course avec paiement à la livraison.
          </small>
        </div>
      </div>
    </Card>
  );
}

/** Fiche d'un dossier : photos, identité, engin, historique, solde, actions */
function DossierSheet({ row, onClose, onChanged }: { row: IndependentRow; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<IndependentDossier | null>(null);
  const [error, setError] = useState('');
  const [motif, setMotif] = useState<'reject' | 'suspend' | null>(null);
  const [zoom, setZoom] = useState<[string, string] | null>(null);
  const [busy, setBusy] = useState(false);
  const [broken, setBroken] = useState<Partial<Record<IndependentDoc | 'avatar', boolean>>>({});

  // Les liens des pièces d'identité expirent (15 min) : on recharge le dossier à chaque ouverture
  useEffect(() => {
    setD(null);
    setBroken({});
    api<IndependentDossier>(`/independents/${row.id}`).then(setD).catch((e) => setError(errText(e)));
  }, [row.id]);

  const act = async (path: string, msg: string, body?: unknown) => {
    setBusy(true);
    try {
      setD(await api<IndependentDossier>(`/independents/${row.id}/${path}`, { method: 'POST', body }));
      toast(msg);
      onChanged();
      window.dispatchEvent(new Event('independents:changed'));
      return true;
    } catch (e) {
      toast(errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const name = d?.user?.name ?? row.name;
  const avatar = d?.user?.avatarUrl ?? d?.links.selfieUrl;
  const missing = d?.required.filter((x) => !x.ok) ?? [];

  return (
    <Sheet title="Dossier livreur indépendant" onClose={onClose} actions={<StatusBadgeLI status={d?.status ?? row.status} />}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {avatar && !broken.avatar ? (
          <img src={photoUrl(avatar)} onError={() => setBroken((b) => ({ ...b, avatar: true }))} alt={`Selfie de ${name}`} className="li-avatar" onClick={() => setZoom([avatar, 'Selfie'])} />
        ) : <span className="avatar li-avatar">{name.trim()[0]?.toUpperCase()}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{name}</div>
          <div className="meta-row" style={{ marginTop: 2 }}>
            <span><Icon name="phone" size={14} />{formatPhone(d?.user?.phone ?? row.phone)}</span>
            <span><Icon name="clock" size={14} />{row.submittedAt ? `Envoyé le ${dateTime(row.submittedAt)}` : `Inscrit le ${date(row.createdAt)}`}</span>
          </div>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {!d && !error && <Empty icon="bike">Chargement du dossier…</Empty>}

      {d && (
        <>
          {(d.status === 'PENDING' || d.status === 'REJECTED' || d.status === 'APPROVED' || d.status === 'SUSPENDED') && (
            <div className="li-actions">
              {(d.status === 'PENDING' || d.status === 'REJECTED') && (
                <button className="btn" disabled={busy} onClick={() => act('approve', `${name} validé — il peut prendre des courses dès que son solde le permet`)}>
                  <Icon name="check" size={15} />Valider le dossier
                </button>
              )}
              {d.status === 'PENDING' && <button className="btn danger" disabled={busy} onClick={() => setMotif('reject')}>Refuser</button>}
              {d.status === 'APPROVED' && <button className="btn danger" disabled={busy} onClick={() => setMotif('suspend')}>Suspendre</button>}
              {d.status === 'SUSPENDED' && (
                <button className="btn" disabled={busy} onClick={() => act('reactivate', `${name} réactivé`)}>Réactiver</button>
              )}
              <small className="muted grow">
                {d.status === 'PENDING' && 'Vérifiez les photos et les informations avant de valider.'}
                {d.status === 'REJECTED' && 'Le livreur peut corriger son dossier et le renvoyer.'}
                {d.status === 'APPROVED' && 'Suspendu, il ne reçoit plus de courses.'}
                {d.status === 'SUSPENDED' && 'Réactivé, il reçoit de nouveau des courses.'}
              </small>
            </div>
          )}
          {d.status === 'DRAFT' && <div className="alert info">Dossier en cours de remplissage dans l’app : il n’a pas encore été envoyé.</div>}

          {d.reviewNote && (
            <div className={`alert ${d.status === 'REJECTED' || d.status === 'SUSPENDED' ? 'error' : 'info'}`}>
              <strong>{d.status === 'SUSPENDED' ? 'Motif de la suspension' : d.status === 'REJECTED' ? 'Motif du refus' : 'Dernière note'} :</strong> « {d.reviewNote} »
              {d.reviewedBy && <> · {d.reviewedBy}, {dateTime(d.reviewedAt)}</>}
            </div>
          )}

          {missing.length > 0 && (
            <div>
              <div className="section-title">Dossier incomplet · {missing.length} élément(s) manquant(s)</div>
              <div className="group li-checklist">
                {d.required.map((x) => (
                  <div key={x.key}>
                    <span className={`li-check${x.ok ? ' ok' : ''}`}><Icon name={x.ok ? 'check' : 'close'} size={12} /></span>
                    <span className={x.ok ? 'muted' : ''}>{x.label.charAt(0).toUpperCase() + x.label.slice(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="section-title">Photos</div>
            <div className="li-photos">
              {DOCS.map(([k, label]) => {
                const url = d.links[k];
                return (
                  <figure key={k}>
                    {url && !broken[k] ? (
                      <button type="button" onClick={() => setZoom([url, label])} aria-label={`Agrandir : ${label}`}>
                        <img src={photoUrl(url)} alt={label} loading="lazy" onError={() => setBroken((b) => ({ ...b, [k]: true }))} />
                      </button>
                    ) : <div className="li-missing"><Icon name="camera" size={18} />{url ? 'Illisible' : 'Manquante'}</div>}
                    <figcaption>{label}</figcaption>
                  </figure>
                );
              })}
            </div>
            <small className="muted">Pièces d’identité privées : liens valables 15 minutes, rouvrez la fiche si une photo ne s’affiche plus.</small>
          </div>

          <div>
            <div className="section-title">Identité</div>
            <div className="group">
              <dl className="kv">
                <dt>Naissance</dt><dd>{d.birthDate ? `${date(d.birthDate)} · ${age(d.birthDate)} ans` : '—'}</dd>
                <dt>Commune</dt><dd>{d.commune ?? '—'}</dd>
                <dt>Quartier, adresse</dt><dd>{d.address ?? '—'}</dd>
                <dt>Pièce d’identité</dt><dd>{d.idType ? ID_LABEL[d.idType] : '—'}{d.idNumber ? ` · n° ${d.idNumber}` : ''}</dd>
                <dt>Contact d’urgence</dt><dd>{d.emergencyName || d.emergencyPhone ? `${d.emergencyName ?? ''}${d.emergencyPhone ? ` · ${formatPhone(d.emergencyPhone)}` : ''}` : '—'}</dd>
                <dt>Accord données</dt><dd>{d.consentAt ? `Donné le ${dateTime(d.consentAt)}` : <span className="muted">Pas encore donné</span>}</dd>
              </dl>
            </div>
          </div>

          <div>
            <div className="section-title">Engin</div>
            <div className="group">
              <dl className="kv">
                <dt>Type</dt><dd style={{ display: 'flex', gap: 6, alignItems: 'center' }}>{d.vehicleType ? <><Icon name={vehicleIcon(d.vehicleType)} size={15} />{VEHICLE_LABEL[d.vehicleType]}</> : '—'}</dd>
                <dt>Marque, modèle</dt><dd>{d.vehicleBrand ?? '—'}</dd>
                <dt>Immatriculation</dt><dd>{d.vehiclePlate ?? '—'}</dd>
                <dt>N° de permis</dt><dd>{d.licenseNumber ?? '—'}</dd>
              </dl>
            </div>
          </div>

          <BalanceSection companyId={d.companyId} onChanged={onChanged} />

          <div>
            <div className="section-title">Historique</div>
            <ul className="timeline">
              {[...d.history].reverse().map((h, i) => (
                <li key={i}>
                  <span className="tdot" style={{ background: HISTORY[h.action]?.[1] ?? '#8e8e93' }} />
                  <div style={{ flex: 1 }}>
                    <div>{HISTORY[h.action]?.[0] ?? h.action}{h.by && <span className="muted"> · {h.by}</span>}</div>
                    {h.note && <small className="muted" style={{ display: 'block' }}>« {h.note} »</small>}
                    <small className="muted">{dateTime(h.at)}</small>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {motif && (
        <MotifDialog
          kind={motif}
          name={name}
          onClose={() => setMotif(null)}
          onSubmit={async (note) => {
            const ok = await act(motif, motif === 'reject' ? 'Dossier refusé — le livreur est prévenu dans l’app' : `${name} suspendu — il ne reçoit plus de courses`, { note });
            if (ok) setMotif(null);
          }}
        />
      )}
      {zoom && (
        <Modal title={zoom[1]} subtitle={name} onClose={() => setZoom(null)} footer={<>
          <a className="btn secondary" href={photoUrl(zoom[0])} target="_blank" rel="noreferrer">Ouvrir en grand</a>
          <button className="btn" onClick={() => setZoom(null)}>Fermer</button>
        </>}>
          <img className="proof-full" src={photoUrl(zoom[0])} alt={zoom[1]} />
        </Modal>
      )}
    </Sheet>
  );
}

/** Motif obligatoire (refus, suspension) — visible par le livreur */
function MotifDialog({ kind, name, onClose, onSubmit }: { kind: 'reject' | 'suspend'; name: string; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = () => (note.trim() ? onSubmit(note.trim()) : setError('Motif obligatoire'));
  return (
    <Modal
      title={kind === 'reject' ? 'Refuser le dossier' : `Suspendre ${name}`}
      subtitle={kind === 'reject' ? 'Le livreur verra ce motif dans l’app et pourra corriger son dossier.' : 'Il ne recevra plus de courses (celle en cours peut être terminée). Le motif lui est affiché.'}
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn danger" onClick={submit}>{kind === 'reject' ? 'Refuser' : 'Suspendre'}</button></>}
    >
      <Field label={kind === 'reject' ? 'Motif du refus' : 'Motif de la suspension'} error={error}>
        <textarea autoFocus maxLength={300} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'reject' ? 'Ex. : photo de la pièce floue, permis expiré…' : 'Ex. : plaintes répétées de clients…'} />
      </Field>
    </Modal>
  );
}

/** Solde du livreur (son entreprise individuelle) : crédit, règle, mouvements, ajustement */
function BalanceSection({ companyId, onChanged }: { companyId: string; onChanged: () => void }) {
  const toast = useToast();
  const [b, setB] = useState<BillingOverview | null>(null);
  const [sign, setSign] = useState<'+' | '-'>('+');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api<BillingOverview>(`/billing/companies/${companyId}`).then(setB).catch(() => {}); }, [companyId]);

  const adjust = async () => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 1) return setError('Montant invalide');
    if (!note.trim()) return setError('Motif obligatoire (il apparaît dans le journal)');
    setError('');
    try {
      setB(await api<BillingOverview>(`/billing/companies/${companyId}/adjust`, { method: 'POST', body: { amount: sign === '+' ? n : -n, note: note.trim() } }));
      setAmount('');
      setNote('');
      toast('Solde ajusté');
      onChanged();
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <div>
      <div className="section-title">Solde</div>
      {!b ? <div className="group"><div className="muted">Chargement…</div></div> : (
        <div className="group">
          <div style={{ alignItems: 'center' }}>
            <div className="balance" style={{ flex: 1 }}>
              <span className="big" style={{ fontSize: 28 }}>{formatMoney(b.credit)}</span>
              <small className="muted">
                {formatMoney(Math.max(0, b.available))} disponible(s){b.reserved ? ` · ${formatMoney(b.reserved)} réservé(s) par la course en cours` : ''}
              </small>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Badge color="accent">Commission {b.rule.label}</Badge>
              <small className="muted" style={{ display: 'block', marginTop: 4 }}>{formatMoney(b.month.commissions)} prélevé(s) ce mois</small>
            </div>
          </div>
          {b.available <= 0 && <div><Icon name="alert" size={16} className="muted" /><small className="muted">Solde insuffisant : il ne peut pas accepter de course tant qu’il n’a pas rechargé (Mobile Money, validé dans Paiements).</small></div>}
          {b.transactions.slice(0, 5).map((t) => (
            <div key={t.id} style={{ alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div>{CREDIT_LABEL[t.type]}{t.note && <span className="muted"> · {t.note}</span>}</div>
                <small className="muted">{dateTime(t.createdAt)}{t.createdBy ? ` · ${t.createdBy}` : ''}</small>
              </div>
              <span className={t.amount > 0 ? 'amount-pos' : 'amount-neg'}>{t.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(t.amount))}</span>
            </div>
          ))}
          {b.transactions.length === 0 && <div><small className="muted">Aucun mouvement pour l’instant</small></div>}
          <div style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <strong style={{ fontSize: 13 }}>Ajuster le solde</strong>
            <div className="li-adjust">
              <Segmented value={sign} onChange={setSign} options={[['+', 'Ajouter'], ['-', 'Retirer']]} />
              <input inputMode="numeric" placeholder={`Montant (${currencySymbol()})`} value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} aria-label="Montant" style={{ width: 120 }} />
              <input placeholder="Motif (journal)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} aria-label="Motif" style={{ flex: 1, minWidth: 140 }} />
              <button className="btn secondary" onClick={adjust} disabled={!amount}>Enregistrer</button>
            </div>
            {error && <small className="error">{error}</small>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Rattachement aux entreprises : plafonds de leur commission, transition, gains (modifiables par le SA) */
function AffiliationRulesCard() {
  const toast = useToast();
  const [cfg, setCfg] = useState<IndependentsConfig | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const KEYS = ['companyMaxPct', 'companyMaxFixed', 'transitionDays', 'earningsHoldHours', 'minWithdrawal'] as const;
  const apply = (c: IndependentsConfig) => { setCfg(c); setForm(Object.fromEntries(KEYS.map((k) => [k, String(c[k] ?? '')]))); };
  useEffect(() => { api<IndependentsConfig>('/independents/config').then(apply).catch(() => {}); }, []);
  if (!cfg) return null;
  const dirty = KEYS.some((k) => form[k] !== String(cfg[k] ?? ''));
  const valid = KEYS.every((k) => form[k] !== '' && Number.isFinite(Number(form[k])) && Number(form[k]) >= 0);
  const save = async () => {
    setError('');
    try {
      apply(await api<IndependentsConfig>('/independents/config', { method: 'PUT', body: Object.fromEntries(KEYS.map((k) => [k, Number(form[k])])) }));
      toast('Règles du rattachement enregistrées');
    } catch (e) {
      setError(errText(e));
    }
  };
  const end = cfg.transitionStartedAt ? new Date(new Date(cfg.transitionStartedAt).getTime() + Number(form.transitionDays || 0) * 86_400_000) : null;
  const row = (k: (typeof KEYS)[number], title: string, hint: string, unit: string, max?: number) => (
    <div key={k}>
      <div className="grow"><div className="title">{title}</div><small className="muted">{hint}</small></div>
      <input type="number" min={0} max={max} value={form[k] ?? ''} onChange={(e) => setForm({ ...form, [k]: e.target.value })} style={{ width: 96, textAlign: 'right' }} aria-label={title} />
      <span className="muted">{unit}</span>
    </div>
  );
  return (
    <Card title="Rattachement aux entreprises" actions={<button className="btn" disabled={!dirty || !valid} onClick={save}>Enregistrer</button>}>
      {error && <div className="alert error" style={{ margin: '0 20px 8px' }}>{error}</div>}
      <div className="rows">
        {row('companyMaxPct', 'Commission maximum d’une entreprise (%)', 'Une entreprise ne peut pas prendre plus sur les courses de ses livreurs indépendants', '%', 100)}
        {row('companyMaxFixed', 'Commission fixe maximum d’une entreprise', 'Si l’entreprise choisit un montant fixe par course', 'F')}
        {row('transitionDays', 'Période de transition', `Les livreurs validés avant le rattachement obligatoire travaillent seuls jusqu’au ${end ? date(end.toISOString()) : '—'}`, 'jours', 365)}
        {row('earningsHoldHours', 'Délai avant retrait des gains', 'Les commissions des entreprises deviennent retirables après ce délai (temps de traiter les litiges)', 'h', 720)}
        {row('minWithdrawal', 'Retrait minimum', 'Montant minimum d’une demande de retrait', 'F')}
      </div>
    </Card>
  );
}
