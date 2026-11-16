import { useMemo, useState } from 'react';
import { goTo, useHashParam } from '../App';
import { api, Company, fcfa, isOnline, phoneError } from '../api';
import { useData } from '../data';
import { Avatar, Card, Empty, Field, Icon, Modal, PageHeader, PhoneInput, Search, Switch, useToast } from '../ui';
import CompanyDetail, { EditCompany } from './CompanyDetail';

/** Entreprises de livraison partenaires (SA) */
export default function Companies() {
  const detailId = useHashParam('companies');
  return detailId ? <CompanyDetail id={detailId} /> : <CompanyList />;
}

function CompanyList() {
  const { companies, users, deliveries, reload } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);

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

  const rows = companies.filter((c) => (c.name + c.phone).toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader
        title="Entreprises"
        subtitle={`${companies.length} entreprise(s) de livraison partenaire(s)`}
        actions={<button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={15} />Nouvelle entreprise</button>}
      />
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Nom ou téléphone" /></div>
      <Card>
        {rows.length === 0 ? <Empty icon="building">Aucune entreprise</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Entreprise</th><th className="num">Livreurs</th><th className="num">En course</th><th className="num">Courses terminées</th><th className="num">Volume</th><th>Active</th><th /></tr></thead>
              <tbody>
                {rows.map((c) => {
                  const s = statsOf.get(c.id)!;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => goTo('companies', c.id)}>
                      <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar name={c.name} /><div>{c.name}<span className="sub">{c.phone}</span></div></div></td>
                      <td className="num">{s.drivers}<span className="sub">{s.online} en ligne</span></td>
                      <td className="num">{s.active}</td>
                      <td className="num">{s.delivered}</td>
                      <td className="num">{fcfa(s.volume)}</td>
                      <td onClick={(e) => e.stopPropagation()}><Switch checked={c.active} onChange={(v) => toggle(c, v)} label={c.active ? 'Suspendre' : 'Réactiver'} /></td>
                      <td onClick={(e) => e.stopPropagation()}><button className="btn plain" onClick={() => setEditing(c)}>Modifier</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {creating && <CreateCompany onClose={() => setCreating(false)} />}
      {editing && <EditCompany company={editing} onClose={() => setEditing(null)} />}
    </>
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
      toast(`${form.name} créée — le gérant peut se connecter avec ${form.managerPhone}`);
      await reload();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Modal title="Nouvelle entreprise" subtitle="Le compte du gérant est créé en même temps." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Créer</button></>}>
      <Field label="Nom de l’entreprise" error={errors.name}>
        <input autoComplete="off" placeholder="Ex. : Rapid Express" value={form.name} onChange={(e) => set('name')(e.target.value)} />
      </Field>
      <Field label="Téléphone de l’entreprise" error={errors.phone}>
        <PhoneInput value={form.phone} onChange={set('phone')} placeholder="0711111111" />
      </Field>
      <div className="section-title" style={{ marginTop: 6, marginBottom: 0 }}>Gérant</div>
      <Field label="Nom du gérant" error={errors.managerName}>
        <input autoComplete="off" data-lpignore="true" value={form.managerName} onChange={(e) => set('managerName')(e.target.value)} />
      </Field>
      <Field label="Téléphone du gérant" error={errors.managerPhone} hint="Sert d’identifiant pour se connecter au back-office (10 chiffres)">
        <PhoneInput value={form.managerPhone} onChange={set('managerPhone')} placeholder="0722222222" />
      </Field>
      <Field label="Mot de passe provisoire" error={errors.managerPassword} hint="À transmettre au gérant (6 caractères minimum)">
        <input type="password" autoComplete="new-password" value={form.managerPassword} onChange={(e) => set('managerPassword')(e.target.value)} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
