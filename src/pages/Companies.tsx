import { useEffect, useMemo, useState } from 'react';
import { goTo, useHashParam } from '../App';
import { api, Company, COMPANY_STATUS, CompanyStatus, dateTime, isOnline, errText } from '../api';
import { formatMoney, phoneError, formatPhone, telHref } from '../countries';
import { useData } from '../data';
import { Avatar, Badge, Card, Empty, Field, Icon, Modal, PageHeader, PhoneInput, Search, Segmented, Switch, useToast } from '../ui';
import CompanyDetail, { EditCompany } from './CompanyDetail';
import { useVehicles } from '../vehicles';

/** Entreprises de livraison partenaires (SA) */
export default function Companies() {
  const detailId = useHashParam('companies');
  return detailId ? <CompanyDetail id={detailId} /> : <CompanyList />;
}

type Tab = 'ALL' | 'PENDING' | 'REJECTED';
const statusOf = (c: Company): CompanyStatus => c.status ?? 'APPROVED';

export const CompanyStatusBadge = ({ c }: { c: Company }) => {
  if (statusOf(c) !== 'APPROVED') return <Badge color={COMPANY_STATUS[statusOf(c)][1]}>{COMPANY_STATUS[statusOf(c)][0]}</Badge>;
  // Essai gratuit en cours
  const left = c.trialEndsAt ? Math.ceil((new Date(c.trialEndsAt).getTime() - Date.now()) / 86_400_000) : 0;
  return left > 0 ? <Badge color="blue">Essai · {left} j</Badge> : null;
};

function CompanyList() {
  const { companies, users, deliveries, reload } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('ALL');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

  // Demandes d'inscription : rechargées à chaque action, toutes les 30 s (DataProvider) et dès qu'une demande arrive (socket)
  useEffect(() => {
    const on = () => { reload().catch(() => {}); };
    window.addEventListener('companies:changed', on);
    return () => window.removeEventListener('companies:changed', on);
  }, [reload]);

  const statsOf = useMemo(() => {
    const m = new Map<string, { drivers: number; online: number; delivered: number; volume: number; active: number }>();
    for (const c of companies) m.set(c.id, { drivers: 0, online: 0, delivered: 0, volume: 0, active: 0 });
    for (const u of users) if (u.role === 'DRIVER' && u.companyId && m.has(u.companyId)) {
      const s = m.get(u.companyId)!;
      s.drivers++;
      if (isOnline(u)) s.online++;
    }
    for (const d of deliveries) if (d.company && m.has(d.company.id)) {
      const s = m.get(d.company.id)!;
      if (d.status === 'DELIVERED') { s.delivered++; s.volume += d.price; }
      if (d.status === 'ACCEPTED' || d.status === 'PICKED_UP') s.active++;
    }
    return m;
  }, [companies, users, deliveries]);

  const toggle = async (c: Company, active: boolean) => {
    await api(`/companies/${c.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${c.name} réactivée` : `${c.name} suspendue — ses comptes sont bloqués`);
    reload();
  };

  const match = (c: Company) =>
    [c.name, c.phone, c.application?.commune, c.application?.managerName, c.application?.managerPhone].join(' ').toLowerCase().includes(q.toLowerCase());
  const byDate = (a: Company, b: Company) => (b.application?.appliedAt ?? b.createdAt).localeCompare(a.application?.appliedAt ?? a.createdAt);
  const pending = companies.filter((c) => statusOf(c) === 'PENDING').sort(byDate);
  const rejected = companies.filter((c) => statusOf(c) === 'REJECTED').sort(byDate);
  const approved = companies.filter((c) => statusOf(c) === 'APPROVED');
  const rows = companies.filter(match);

  return (
    <>
      <PageHeader
        title="Entreprises"
        subtitle={`${approved.length} entreprise(s) partenaire(s)${pending.length ? ` · ${pending.length} demande(s) d’inscription à traiter` : ''}`}
        actions={<button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={15} />Nouvelle entreprise</button>}
      />
      <div className="toolbar">
        <div className="li-tabs"><Segmented<Tab>
          value={tab}
          onChange={setTab}
          options={[
            ['ALL', `Toutes (${companies.length})`],
            ['PENDING', `Demandes en attente (${pending.length})`],
            ['REJECTED', `Refusées (${rejected.length})`],
          ]}
        /></div>
        <span className="spacer" />
        <Search value={q} onChange={setQ} placeholder="Nom, téléphone, commune" />
      </div>

      <div className="stack">
        {(tab === 'ALL' ? pending.length > 0 : true) && tab !== 'REJECTED' && (
          <Card
            title="Demandes d’inscription"
            actions={<small className="muted">Envoyées depuis la landing page · {pending.length} en attente</small>}
          >
            {pending.filter(match).length === 0 ? <Empty icon="building">Aucune demande en attente</Empty> : (
              <div className="rows">
                {pending.filter(match).map((c) => <RequestRow key={c.id} c={c} onDone={reload} />)}
              </div>
            )}
          </Card>
        )}

        {tab === 'REJECTED' && (
          <Card title="Demandes refusées" actions={<small className="muted">Une demande refusée peut encore être acceptée</small>}>
            {rejected.filter(match).length === 0 ? <Empty icon="building">Aucune demande refusée</Empty> : (
              <div className="rows">
                {rejected.filter(match).map((c) => <RequestRow key={c.id} c={c} onDone={reload} />)}
              </div>
            )}
          </Card>
        )}

        {tab === 'ALL' && (
          <Card>
            {rows.length === 0 ? <Empty icon="building">Aucune entreprise</Empty> : (
              <div className="table-scroll">
                <table className="list">
                  <thead><tr><th>Entreprise</th><th className="num">Livreurs</th><th className="num">En course</th><th className="num">Courses terminées</th><th className="num">Volume</th><th>Active</th><th /></tr></thead>
                  <tbody>
                    {rows.map((c) => {
                      const s = statsOf.get(c.id)!;
                      const approvedC = statusOf(c) === 'APPROVED';
                      return (
                        <tr key={c.id} className="clickable" onClick={() => (approvedC ? goTo('companies', c.id) : setTab(statusOf(c) === 'PENDING' ? 'PENDING' : 'REJECTED'))}>
                          <td>
                            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                              <Avatar name={c.name} />
                              <div><span className="co-name">{c.name}<CompanyStatusBadge c={c} /></span><span className="sub">{formatPhone(c.phone)}</span></div>
                            </div>
                          </td>
                          <td className="num">{s.drivers}<span className="sub">{s.online} en ligne</span></td>
                          <td className="num">{s.active}</td>
                          <td className="num">{s.delivered}</td>
                          <td className="num">{formatMoney(s.volume)}</td>
                          <td onClick={(e) => approvedC && e.stopPropagation()}>
                            {approvedC ? <Switch checked={c.active} onChange={(v) => toggle(c, v)} label={c.active ? 'Suspendre' : 'Réactiver'} />
                              : <small className="muted">{statusOf(c) === 'PENDING' ? 'À valider' : '—'}</small>}
                          </td>
                          <td onClick={(e) => e.stopPropagation()}><button className="btn plain" onClick={() => setEditing(c)}>Modifier</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
      {creating && <CreateCompany onClose={() => setCreating(false)} />}
      {editing && <EditCompany company={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Une demande d'inscription : informations envoyées + Accepter / Refuser */
function RequestRow({ c, onDone }: { c: Company; onDone: () => void }) {
  const veh = useVehicles();
  const toast = useToast();
  const [confirm, setConfirm] = useState<'approve' | 'reject' | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const a = c.application ?? {};
  const st = statusOf(c);

  const act = async (kind: 'approve' | 'reject') => {
    if (kind === 'reject' && !note.trim()) return setError('Motif obligatoire');
    setBusy(true);
    setError('');
    try {
      await api(`/companies/${c.id}/${kind}`, { method: 'POST', body: kind === 'reject' ? { note: note.trim() } : undefined });
      toast(kind === 'approve' ? `${c.name} acceptée — le gérant peut se connecter` : `Demande de ${c.name} refusée`);
      setConfirm(null);
      setNote('');
      window.dispatchEvent(new Event('companies:changed'));
      onDone();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="co-request">
      <Avatar name={c.name} />
      <div className="grow">
        <div className="co-request-head">
          <span className="title">{c.name}</span>
          <CompanyStatusBadge c={c} />
          <small className="muted">{a.appliedAt ? `Envoyée le ${dateTime(a.appliedAt)}` : `Créée le ${dateTime(c.createdAt)}`}</small>
        </div>
        <div className="meta-row">
          <span><Icon name="phone" size={14} />{formatPhone(c.phone)}</span>
          {a.commune && <span><Icon name="pin" size={14} />{a.commune}</span>}
          {a.drivers != null && <span><Icon name="people" size={14} />{a.drivers} livreur{a.drivers > 1 ? 's' : ''}</span>}
          {a.vehicles && a.vehicles.length > 0 && (
            <span>{a.vehicles.map((v) => <span key={v} className="co-vehicle"><Icon name={veh.icon(v)} size={14} />{veh.name(v)}</span>)}</span>
          )}
        </div>
        {(a.managerName || a.managerPhone) && (
          <div className="meta-row"><span><Icon name="shield" size={14} />Gérant : {a.managerName ?? '—'}{a.managerPhone && <> · <a href={telHref(a.managerPhone)}>{formatPhone(a.managerPhone)}</a></>}</span></div>
        )}
        {a.message && <p className="co-message">« {a.message} »</p>}
        {st === 'REJECTED' && c.reviewNote && (
          <div className="alert error co-motif"><strong>Motif du refus :</strong> « {c.reviewNote} »{c.reviewedAt && <> · {dateTime(c.reviewedAt)}</>}</div>
        )}
      </div>
      <div className="co-request-actions">
        <button className="btn" disabled={busy} onClick={() => { setError(''); setConfirm('approve'); }}><Icon name="check" size={15} />{st === 'REJECTED' ? 'Accepter quand même' : 'Accepter'}</button>
        {st === 'PENDING' && <button className="btn danger" disabled={busy} onClick={() => { setError(''); setConfirm('reject'); }}>Refuser</button>}
      </div>

      {confirm === 'approve' && (
        <Modal
          title={`Accepter ${c.name} ?`}
          subtitle="L’entreprise pourra se connecter au back-office. L’essai gratuit éventuel démarre dès sa création (Tarifs et règles › Facturation)."
          onClose={() => setConfirm(null)}
          footer={<><button className="btn secondary" onClick={() => setConfirm(null)}>Annuler</button><button className="btn" disabled={busy} onClick={() => act('approve')}>Accepter</button></>}
        >
          {(a.managerName || a.managerPhone) && (
            <div className="alert info">Identifiant du gérant : <strong>{a.managerPhone ? formatPhone(a.managerPhone) : '—'}</strong>{a.managerName && <> ({a.managerName})</>}, avec le mot de passe choisi lors de la demande.</div>
          )}
          {error && <div className="alert error">{error}</div>}
        </Modal>
      )}
      {confirm === 'reject' && (
        <Modal
          title={`Refuser la demande de ${c.name}`}
          subtitle="Le motif est conservé avec la demande. Vous pourrez encore l’accepter plus tard."
          onClose={() => setConfirm(null)}
          footer={<><button className="btn secondary" onClick={() => setConfirm(null)}>Annuler</button><button className="btn danger" disabled={busy} onClick={() => act('reject')}>Refuser</button></>}
        >
          <Field label="Motif du refus" error={error}>
            <textarea autoFocus maxLength={500} value={note} onChange={(e) => { setNote(e.target.value); if (error) setError(''); }}
              placeholder="Ex. : informations incomplètes, entreprise injoignable…" />
          </Field>
        </Modal>
      )}
    </div>
  );
}

const EMPTY = { name: '', phone: '', managerName: '', managerPhone: '', managerPassword: '' };
type Form = typeof EMPTY;

/** Vérification avant envoi, avec un message par champ */
function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!f.name.trim()) e.name = 'Nom obligatoire';
  const p1 = phoneError(f.phone);
  if (p1) e.phone = p1;
  if (!f.managerName.trim()) e.managerName = 'Nom du gérant obligatoire';
  const p2 = phoneError(f.managerPhone);
  if (p2) e.managerPhone = p2;
  if (f.managerPassword.length < 6) e.managerPassword = '6 caractères minimum';
  return e;
}

function CreateCompany({ onClose }: { onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [error, setError] = useState('');
  const set = (key: keyof Form) => (v: string) => {
    setForm({ ...form, [key]: v });
    if (errors[key]) setErrors({ ...errors, [key]: undefined });
  };
  const submit = async () => {
    const e = validate(form);
    setErrors(e);
    if (Object.keys(e).length) return;
    setError('');
    try {
      await api('/companies', { method: 'POST', body: form });
      toast(`${form.name} créée — le gérant peut se connecter avec ${formatPhone(form.managerPhone)}`);
      await reload();
      onClose();
    } catch (err) {
      setError(errText(err));
    }
  };
  return (
    <Modal title="Nouvelle entreprise" subtitle="Le compte du gérant est créé en même temps." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Créer</button></>}>
      <Field label="Nom de l’entreprise" error={errors.name}>
        <input autoComplete="off" placeholder="Ex. : Rapid Express" value={form.name} onChange={(e) => set('name')(e.target.value)} />
      </Field>
      <Field label="Téléphone de l’entreprise" error={errors.phone}>
        <PhoneInput value={form.phone} onChange={set('phone')} />
      </Field>
      <div className="section-title" style={{ marginTop: 6, marginBottom: 0 }}>Gérant</div>
      <Field label="Nom du gérant" error={errors.managerName}>
        <input autoComplete="off" data-lpignore="true" value={form.managerName} onChange={(e) => set('managerName')(e.target.value)} />
      </Field>
      <Field label="Téléphone du gérant" error={errors.managerPhone} hint="Sert d’identifiant pour se connecter au back-office">
        <PhoneInput value={form.managerPhone} onChange={set('managerPhone')} />
      </Field>
      <Field label="Mot de passe provisoire" error={errors.managerPassword} hint="À transmettre au gérant (6 caractères minimum)">
        <input type="password" autoComplete="new-password" value={form.managerPassword} onChange={(e) => set('managerPassword')(e.target.value)} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
