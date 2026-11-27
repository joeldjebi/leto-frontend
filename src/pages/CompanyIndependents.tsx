import { useCallback, useEffect, useState } from 'react';
import {
  api, CommissionType, CompanyAffiliations, CompanyDossier, date, dateTime, DocsState, EARNING_LABEL, Earnings, errText, EXPIRY_BADGE, ExpiryState,
  MyIndependent, PoolDriver, photoUrl, RENEWABLE_LABEL, RenewableDoc, ruleLabel, WITHDRAWAL_STATUS,
} from '../api';
import { formatMoney, formatPhone } from '../countries';
import { Avatar, Badge, Card, Empty, Field, Icon, Modal, PageHeader, PhoneInput, Search, Segmented, Sheet, Stat, Switch, useToast } from '../ui';
import { EarningsTab } from '../components/Remittances';
import { RatingSummary } from '../components/Ratings';
import { useVehicles } from '../vehicles';

/**
 * Entreprise : livreurs indépendants (LI) validés par VITE à rattacher, LI rattachés,
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
  // Vivier consulté : le bandeau « nouveaux livreurs » disparaît (à l'arrivée et en quittant la page)
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (data) setFresh((f) => (data.pool.some((p) => p.isNew && !f.has(p.id)) ? new Set([...f, ...data.pool.filter((p) => p.isNew).map((p) => p.id)]) : f));
  }, [data]);
  useEffect(() => {
    const seen = () => api('/affiliations/company/pool-seen', { method: 'POST' }).catch(() => {});
    const t = window.setTimeout(seen, 1500);
    return () => { window.clearTimeout(t); seen(); };
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
        subtitle="Livreurs validés par VITE, à rattacher à votre entreprise : vous en êtes responsable et vous prélevez une commission sur leurs courses, sur leur solde VITE."
      />
      <div className="stack">
        {error && <div className="alert error">{error}</div>}
        <div className="grid grid-stats">
          <Stat icon="bike" label="Mes livreurs indépendants" value={data.mine.length} foot={`${data.mine.filter((m) => m.online).length} en ligne · ${data.pool.length} disponibles dans le vivier`} />
          <Stat icon="wallet" label="Gains disponibles" value={formatMoney(earnings.available)} foot={`${formatMoney(earnings.pending)} en attente (${earnings.holdHours} h de délai)`} />
          <Stat icon="tag" label="Commission" value={data.rate ? ruleLabel(data.rate.type, data.rate.value) : '—'} foot={`par course · maximum VITE ${data.caps.maxPct} % ou ${formatMoney(data.caps.maxFixed)}`} />
        </div>
        <div id="li-rate"><RateCard data={data} onSaved={setData} /></div>
        <MineCard data={data} onChanged={load} />
        <PoolCard data={data} fresh={fresh} onChanged={setData} />
        <EarningsCard earnings={earnings} onChanged={setEarnings} />
      </div>
    </>
  );
}

/** Commission de l'entreprise sur les courses de ses LI (sous les plafonds de VITE) */
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
              Prélevée sur le solde du livreur à la fin de chaque course, en plus de celle de VITE · ex. course à {formatMoney(sample)} → {formatMoney(type === 'PERCENT' ? Math.round((sample * (n || 0)) / 100) : n || 0)}.
              Maximum autorisé : {type === 'PERCENT' ? `${data.caps.maxPct} %` : formatMoney(data.caps.maxFixed)}.
            </small>
          </div>
          <Segmented<CommissionType> value={type} onChange={setType} options={[['PERCENT', '%'], ['FIXED', 'F fixe']]} labels={{ PERCENT: 'Pourcentage', FIXED: 'Montant fixe' }} />
          <input type="number" min={0} max={max} step={type === 'PERCENT' ? 0.5 : 50} value={value} onChange={(e) => setValue(e.target.value)} style={{ width: 90, textAlign: 'right' }} aria-label="Valeur de la commission" />
          <button className="btn" disabled={!dirty || !valid} onClick={save}>Enregistrer</button>
        </div>
        <div>
          <small className="muted grow">
            Un changement de taux doit être accepté par chaque livreur rattaché ; d’ici là, l’ancien taux s’applique.
          </small>
        </div>
        <CodRow data={data} onSaved={onSaved} />
      </div>
    </Card>
  );
}

/** Résumé des documents d'un LI rattaché : le plus urgent d'abord */
function DocsSummary({ m }: { m: MyIndependent }) {
  const worst = (['EXPIRED', 'SOON', 'UNKNOWN'] as ExpiryState[]).find((s) => m.docs.license.state === s || m.docs.insurance.state === s);
  const which = (s: ExpiryState) => [m.docs.license.state === s && 'permis', m.docs.insurance.state === s && 'assurance'].filter(Boolean).join(' et ');
  return (
    <>
      {worst ? <Badge color={EXPIRY_BADGE[worst][1]}>{worst === 'UNKNOWN' ? 'Dates à renseigner' : EXPIRY_BADGE[worst][0]}</Badge> : <Badge color="green">À jour</Badge>}
      {worst && worst !== 'UNKNOWN' && <span className="sub">{which(worst).charAt(0).toUpperCase() + which(worst).slice(1)}</span>}
      {m.renewals > 0 && <span className="sub">Renouvellement en vérification chez VITE</span>}
      {m.updateRequests > 0 && <span className="sub">Mise à jour demandée</span>}
    </>
  );
}

/** Paiement à la livraison : décision de l'entreprise pour ses LI (encaissements versés à l'entreprise) */
function CodRow({ data, onSaved }: { data: CompanyAffiliations; onSaved: (d: CompanyAffiliations) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const owed = data.mine.reduce((a, m) => a + m.codToRemit, 0);
  const toggle = async (allowed: boolean) => {
    setBusy(true);
    try {
      onSaved(await api<CompanyAffiliations>('/affiliations/company/cod', { method: 'PUT', body: { allowed } }));
      toast(allowed ? 'Vos livreurs indépendants peuvent prendre les courses avec paiement à la livraison' : 'Paiement à la livraison retiré pour vos livreurs indépendants');
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <div className="grow">
        <div className="title">Paiement à la livraison</div>
        <small className="muted">
          {data.codAllowed
            ? 'Vos livreurs indépendants prennent aussi les courses avec paiement à la livraison. Ils vous versent les montants encaissés, et vous les reversez aux clients comme pour vos livreurs.'
            : 'Autorisez-le pour que vos livreurs indépendants prennent aussi ces courses : ils encaissent auprès des destinataires et vous versent les montants, vous les reversez aux clients.'}
          {owed > 0 && <> Reste à vous verser : <strong>{formatMoney(owed)}</strong>.</>}
        </small>
      </div>
      <Switch checked={data.codAllowed} label="Paiement à la livraison pour mes livreurs indépendants" onChange={(v) => !busy && toggle(v)} />
    </div>
  );
}

function MineCard({ data, onChanged }: { data: CompanyAffiliations; onChanged: () => void }) {
  const veh = useVehicles();
  const [ending, setEnding] = useState<MyIndependent | null>(null);
  const [open, setOpen] = useState<MyIndependent | null>(null);
  return (
    <Card title={`Mes livreurs indépendants (${data.mine.length})`}>
      {data.mine.length === 0 ? (
        <Empty icon="bike">Aucun livreur rattaché pour le moment. Invitez-en depuis le vivier ci-dessous.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th>Engin</th><th>Documents</th><th>Commission</th>{(data.codAllowed || data.mine.some((m) => m.cod > 0)) && <th className="num">Encaissements à verser</th>}<th className="num">Solde VITE</th><th className="num">Courses</th><th className="num">Gains générés</th><th /></tr></thead>
            <tbody>
              {data.mine.map((m) => {
                const pending = m.pendingRate?.split(':');
                return (
                  <tr key={m.id} className="clickable" onClick={() => setOpen(m)}>
                    <td>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                        <Face name={m.name} url={m.selfieUrl} />
                        <div>{m.name} {m.online && <Badge color="green">En ligne</Badge>}<span className="sub">{formatPhone(m.phone)} · depuis le {date(m.affiliatedAt)}</span></div>
                      </div>
                    </td>
                    <td>{m.vehicleType ? veh.name(m.vehicleType) : '—'}{m.vehiclePlate && <span className="sub">{m.vehiclePlate}</span>}</td>
                    <td><DocsSummary m={m} /></td>
                    <td>
                      {m.affCommissionType && m.appliedRate != null ? ruleLabel(m.affCommissionType, m.appliedRate) : '—'}
                      {pending && <span className="sub">Nouveau taux en attente : {ruleLabel(pending[0] as CommissionType, Number(pending[1]))}</span>}
                    </td>
                    {(data.codAllowed || data.mine.some((x) => x.cod > 0)) && (
                      <td className="num">{m.codToRemit > 0 ? <Badge color="orange">{formatMoney(m.codToRemit)}</Badge> : formatMoney(0)}{m.codPending > 0 && <span className="sub">{formatMoney(m.codPending)} à confirmer</span>}</td>
                    )}
                    <td className="num">{Number(m.credit) < 1000 ? <Badge color="yellow">{formatMoney(Number(m.credit))}</Badge> : formatMoney(Number(m.credit))}</td>
                    <td className="num">{m.completed}{m.active > 0 && <span className="sub">{m.active} en cours</span>}</td>
                    <td className="num">{formatMoney(m.earned)}</td>
                    <td style={{ whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                      <button className="btn secondary" onClick={() => setOpen(m)}>Dossier</button>
                      <button className="btn plain" disabled={m.active > 0} title={m.active > 0 ? 'Course en cours' : undefined} onClick={() => setEnding(m)}>Mettre fin</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {ending && <EndDialog driver={ending} onClose={() => setEnding(null)} onDone={onChanged} />}
      {open && <DossierSheet driver={open} cod={data.codAllowed || open.cod > 0} onClose={() => setOpen(null)} onChanged={onChanged} />}
    </Card>
  );
}

const ID_LABEL = { CNI: 'CNI', PASSPORT: 'Passeport', CONSULAR: 'Carte consulaire', RESIDENCE: 'Carte de séjour' } as const;
const PHOTOS: [RenewableDoc, string][] = [
  ['idFrontUrl', 'Pièce (recto)'], ['idBackUrl', 'Pièce (verso)'], ['licenseUrl', 'Permis'], ['registrationUrl', 'Carte grise'],
  ['insuranceUrl', 'Assurance'], ['docsSelfieUrl', 'Avec ses documents en main'],
];
const VIEW_LABEL: Partial<Record<string, string>> = {
  AFFILIATED: 'Dossier partagé avec votre entreprise', VIEWED: 'Dossier consulté', UPDATE_REQUESTED: 'Mise à jour demandée',
  RENEWAL_SENT: 'Document renouvelé, envoyé à VITE', RENEWAL_APPROVED: 'Document renouvelé validé par VITE', RENEWAL_REJECTED: 'Document renouvelé refusé par VITE',
  EXPIRED: 'Document expiré',
};

/** Validité du permis ou de l'assurance */
function Validity({ label, v }: { label: string; v: DocsState['license'] }) {
  return (
    <div>
      <div className="grow">
        <div className="title">{label}</div>
        <small className="muted">{v.expiresOn ? `Valable jusqu’au ${date(v.expiresOn)}` : 'Date de fin de validité pas encore renseignée par VITE'}</small>
      </div>
      <Badge color={EXPIRY_BADGE[v.state][1]}>{EXPIRY_BADGE[v.state][0]}</Badge>
    </div>
  );
}

/** Dossier complet d'un LI rattaché : partagé quand il a accepté l'invitation, chaque ouverture est notée */
function DossierSheet({ driver, cod, onClose, onChanged }: { driver: MyIndependent; cod: boolean; onClose: () => void; onChanged: () => void }) {
  const veh = useVehicles();
  const [d, setD] = useState<CompanyDossier | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState<[string, string] | null>(null);
  const [ask, setAsk] = useState<RenewableDoc | null>(null);
  const [broken, setBroken] = useState<Partial<Record<string, boolean>>>({});
  // Liens des pièces valables 15 minutes : rechargés à chaque ouverture
  useEffect(() => {
    api<CompanyDossier>(`/affiliations/drivers/${driver.id}/dossier`).then(setD).catch((e) => setError(errText(e)));
  }, [driver.id]);
  const pendingOf = (f: RenewableDoc) => d?.renewals.find((r) => r.field === f);
  const askedOf = (f: RenewableDoc) => d?.updateRequests.find((r) => r.field === f);
  return (
    <Sheet title="Dossier du livreur" onClose={onClose}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {d?.avatarUrl && !broken.avatar
          ? <img src={photoUrl(d.avatarUrl)} alt={`Photo de ${driver.name}`} className="li-avatar" onError={() => setBroken((b) => ({ ...b, avatar: true }))} />
          : <span className="avatar li-avatar">{driver.name.trim()[0]?.toUpperCase()}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{driver.name}</div>
          <div className="meta-row" style={{ marginTop: 2 }}>
            <span><Icon name="phone" size={14} />{formatPhone(driver.phone)}</span>
            {d?.affiliatedAt && <span><Icon name="clock" size={14} />Rattaché le {date(d.affiliatedAt)}</span>}
          </div>
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!d && !error && <Empty icon="bike">Chargement du dossier…</Empty>}
      {d && (
        <>
          <div>
            <div className="section-title">Validité des documents</div>
            <div className="group rows">
              <Validity label="Permis de conduire" v={d.docs.license} />
              <Validity label="Assurance" v={d.docs.insurance} />
            </div>
            <small className="muted">Le livreur et vous êtes prévenus 30 jours avant la fin de validité. Expiré, il ne reçoit plus de courses jusqu’à ce que VITE valide le nouveau document.</small>
          </div>

          <div>
            <div className="section-title">Documents vérifiés par VITE</div>
            <div className="li-photos">
              {PHOTOS.map(([k, label]) => {
                const url = d.links[k];
                const pending = pendingOf(k);
                const asked = askedOf(k);
                return (
                  <figure key={k}>
                    {url && !broken[k] ? (
                      <button type="button" onClick={() => setZoom([url, label])} aria-label={`Agrandir : ${label}`}>
                        <img src={photoUrl(url)} alt={label} loading="lazy" onError={() => setBroken((b) => ({ ...b, [k]: true }))} />
                      </button>
                    ) : <div className="li-missing"><Icon name="camera" size={18} />{url ? 'Rouvrez la fiche' : 'Manquante'}</div>}
                    <figcaption>
                      {label}
                      {pending ? <><br />Nouveau document en vérification</> : asked ? <><br />Mise à jour demandée le {date(asked.at)}</> : (
                        <><br /><button type="button" className="link-btn" onClick={() => setAsk(k)}>Demander une mise à jour</button></>
                      )}
                    </figcaption>
                  </figure>
                );
              })}
            </div>
            <small className="muted">Documents privés : liens valables 15 minutes. Chaque consultation du dossier est notée et visible par VITE.</small>
          </div>

          <div>
            <div className="section-title">Identité</div>
            <div className="group">
              <dl className="kv">
                <dt>Naissance</dt><dd>{d.birthDate ? date(d.birthDate) : '—'}</dd>
                <dt>Commune</dt><dd>{d.commune ?? '—'}</dd>
                <dt>Quartier, adresse</dt><dd>{d.address ?? '—'}</dd>
                <dt>Pièce d’identité</dt><dd>{d.idType ? ID_LABEL[d.idType] : '—'}{d.idNumber ? ` · n° ${d.idNumber}` : ''}</dd>
                <dt>Contact d’urgence</dt><dd>{d.emergencyName || d.emergencyPhone ? `${d.emergencyName ?? ''}${d.emergencyPhone ? ` · ${formatPhone(d.emergencyPhone)}` : ''}` : '—'}</dd>
                <dt>Validé par VITE</dt><dd>{d.approvedAt ? date(d.approvedAt) : '—'}</dd>
              </dl>
            </div>
          </div>

          <div>
            <div className="section-title">Engin</div>
            <div className="group">
              <dl className="kv">
                <dt>Type</dt><dd>{d.vehicleType ? veh.name(d.vehicleType) : '—'}</dd>
                <dt>Marque, modèle</dt><dd>{d.vehicleBrand ?? '—'}</dd>
                <dt>Immatriculation</dt><dd>{d.vehiclePlate ?? '—'}</dd>
                <dt>N° de permis</dt><dd>{d.licenseNumber ?? '—'}</dd>
              </dl>
            </div>
          </div>

          <div>
            <div className="section-title">Avis des clients</div>
            <div className="group" style={{ padding: 14 }}><RatingSummary driverId={driver.userId} withList /></div>
          </div>

          {cod && (
            <div>
              <div className="section-title">Encaissements à la livraison</div>
              <EarningsTab driver={{ id: driver.userId, name: driver.name, phone: driver.phone } as never} canManage />
            </div>
          )}

          {d.views.length > 0 && (
            <div>
              <div className="section-title">Suivi du dossier</div>
              <ul className="timeline">
                {d.views.map((h, i) => (
                  <li key={i}>
                    <span className="tdot" style={{ background: h.action === 'EXPIRED' || h.action === 'RENEWAL_REJECTED' ? 'var(--red)' : h.action === 'RENEWAL_APPROVED' ? 'var(--green)' : 'var(--tertiary)' }} />
                    <div style={{ flex: 1 }}>
                      <div>{VIEW_LABEL[h.action] ?? h.action}{h.by && <span className="muted"> · {h.by}</span>}</div>
                      {h.note && <small className="muted" style={{ display: 'block' }}>{h.note}</small>}
                      <small className="muted">{dateTime(h.at)}</small>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {ask && d && <AskUpdateDialog driver={driver} field={ask} onClose={() => setAsk(null)} onDone={(x) => { setD(x); onChanged(); }} />}
      {zoom && (
        <Modal title={zoom[1]} subtitle={driver.name} onClose={() => setZoom(null)} footer={<>
          <a className="btn secondary" href={photoUrl(zoom[0])} target="_blank" rel="noreferrer">Ouvrir en grand</a>
          <button className="btn" onClick={() => setZoom(null)}>Fermer</button>
        </>}>
          <img className="proof-full" src={photoUrl(zoom[0])} alt={zoom[1]} />
        </Modal>
      )}
    </Sheet>
  );
}

function AskUpdateDialog({ driver, field, onClose, onDone }: { driver: MyIndependent; field: RenewableDoc; onClose: () => void; onDone: (d: CompanyDossier) => void }) {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      onDone(await api<CompanyDossier>(`/affiliations/drivers/${driver.id}/request-update`, { method: 'POST', body: { field, note: note.trim() || undefined } }));
      toast(`Demande envoyée à ${driver.name}`);
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title={`Demander une mise à jour · ${RENEWABLE_LABEL[field]}`} subtitle={`${driver.name} est prévenu dans l’app. VITE vérifie le nouveau document avant qu’il remplace l’ancien.`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Envoyer la demande</button></>}>
      <Field label="Précision (facultatif)" hint="Visible par le livreur">
        <input value={note} maxLength={300} placeholder="Ex. : photo floue, document bientôt expiré…" onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
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

function PoolCard({ data, fresh, onChanged }: { data: CompanyAffiliations; fresh: Set<string>; onChanged: (d: CompanyAffiliations) => void }) {
  const veh = useVehicles();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  // Nouveaux en tête
  const list = data.pool
    .filter((p) => `${p.name} ${p.commune ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(fresh.has(b.id)) - Number(fresh.has(a.id)));
  const invite = async (p: PoolDriver) => {
    setError('');
    // Pas encore de commission : on mène l'entreprise au réglage au lieu d'un bouton grisé
    if (!data.rate) {
      toast('Fixez d’abord votre commission sur leurs courses (en haut de la page), puis invitez ce livreur');
      document.getElementById('li-rate')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelector<HTMLInputElement>('#li-rate input[type="number"]')?.focus();
      return;
    }
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
    <Card title={`Vivier · livreurs validés par VITE (${data.pool.length})`} actions={<Search value={q} onChange={setQ} placeholder="Nom, commune" />}>
      <small className="muted" style={{ display: 'block', margin: '0 20px 8px' }}>Le dossier complet (téléphone, pièce d’identité, permis, carte grise, assurance, photos) vous est partagé quand le livreur accepte votre invitation.</small>
      {error && <div className="alert error" style={{ margin: '0 20px 8px' }}>{error}</div>}
      {!data.rate && (
        <div className="banner warn" style={{ margin: '0 20px 8px' }}>
          <span className="grow">Avant d’inviter un livreur, fixez la commission que vous prélèverez sur ses courses : elle figure dans l’invitation qu’il accepte.</span>
          <button className="btn" onClick={() => { document.getElementById('li-rate')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); document.querySelector<HTMLInputElement>('#li-rate input[type="number"]')?.focus(); }}>Fixer ma commission</button>
        </div>
      )}
      {list.length === 0 ? (
        <Empty icon="people">Aucun livreur indépendant disponible pour le moment.</Empty>
      ) : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th>Engin</th><th>Documents vérifiés</th><th>Commune</th><th className="num">Courses</th><th>Note</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Face name={p.name} url={p.selfieUrl} /><div>{p.name} {fresh.has(p.id) && <Badge color="orange">Nouveau</Badge>} {p.online && <Badge color="green">En ligne</Badge>}{p.legacyUntil && <span className="sub">Travaille seul jusqu’au {date(p.legacyUntil)}</span>}</div></div></td>
                  <td>{p.vehicleType ? veh.name(p.vehicleType) : '—'}{(p.vehicleBrand || p.plate) && <span className="sub">{[p.vehicleBrand, p.plate].filter(Boolean).join(' · ')}</span>}</td>
                  <td><VerifiedPills v={p.verified} /></td>
                  <td>{p.commune ?? '—'}</td>
                  <td className="num">{p.completed}</td>
                  <td>{p.ratingAvg != null ? `${Number(p.ratingAvg).toFixed(1)} ★ (${p.ratingCount})` : <span className="muted">—</span>}</td>
                  <td>
                    {p.inviteId ? (
                      <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}><Badge color="yellow">Invitation envoyée</Badge><button className="btn plain" onClick={() => cancel(p)}>Annuler</button></span>
                    ) : (
                      <button className="btn secondary" onClick={() => invite(p)}>Inviter</button>
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

/** Pastilles du vivier : documents contrôlés par VITE (sans les montrer avant le rattachement) */
function VerifiedPills({ v }: { v: PoolDriver['verified'] }) {
  const pill = (label: string, ok: boolean | ExpiryState | null) => {
    const state = typeof ok === 'string' ? ok : ok ? 'OK' : null;
    const tone = state === 'EXPIRED' || state === null ? 'off' : state === 'SOON' ? 'warn' : 'ok';
    const title = state === null ? 'Manquant' : state === 'OK' ? 'Vérifié par VITE' : EXPIRY_BADGE[state][0];
    return <span key={label} className={`doc-pill ${tone}`} title={title}><Icon name={tone === 'ok' ? 'check' : tone === 'warn' ? 'clock' : 'close'} size={11} />{label}</span>;
  };
  return <div className="doc-pills">{[pill('Identité', v.identity), pill('Permis', v.license), pill('Carte grise', v.registration), pill('Assurance', v.insurance)]}</div>;
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
            Retrait minimum {formatMoney(earnings.minWithdrawal)}, payé par VITE par Mobile Money. Le transfert vers le crédit est immédiat.
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
        toast('Demande de retrait envoyée à VITE');
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
      subtitle={mode === 'withdraw' ? `VITE vous envoie le montant par Mobile Money. Minimum ${formatMoney(earnings.minWithdrawal)}.` : 'Le montant est ajouté tout de suite au crédit qui paie vos commissions VITE.'}
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
