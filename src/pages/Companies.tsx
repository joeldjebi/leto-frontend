import { useMemo, useState } from 'react';
import { api, Company, fcfa, isOnline } from '../api';
import { useData } from '../data';
import { Avatar, Badge, Card, Empty, Icon, Modal, PageHeader, Search, Sheet, Switch, useToast } from '../ui';

/** Entreprises de livraison partenaires (SA) */
export default function Companies() {
  const { companies, users, deliveries, reload } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [open, setOpen] = useState<Company | null>(null);

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
                    <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
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
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)} actions={open.active ? <Badge color="green">Active</Badge> : <Badge color="red">Suspendue</Badge>}>
          <dl className="kv">
            <dt>Téléphone</dt><dd>{open.phone}</dd>
            <dt>Partenaire depuis</dt><dd>{new Date(open.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
            <dt>Courses terminées</dt><dd>{statsOf.get(open.id)?.delivered} · {fcfa(statsOf.get(open.id)?.volume ?? 0)}</dd>
          </dl>
          <div>
            <div className="section-title">Gérant(s)</div>
            <div className="group">
              {users.filter((u) => u.role === 'COMPANY' && u.companyId === open.id).map((u) => (
                <div key={u.id}><Avatar name={u.name} /><div style={{ flex: 1 }}><strong>{u.name}</strong><small className="muted" style={{ display: 'block' }}>{u.phone}</small></div></div>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title">Livreurs</div>
            <div className="group">
              {users.filter((u) => u.role === 'DRIVER' && u.companyId === open.id).map((u) => (
                <div key={u.id}>
                  <Avatar name={u.name} />
                  <div style={{ flex: 1 }}><strong>{u.name}</strong><small className="muted" style={{ display: 'block' }}>{u.phone}</small></div>
                  {!u.active ? <Badge color="red">Bloqué</Badge> : isOnline(u) ? <Badge color="green">En ligne</Badge> : <Badge>Hors ligne</Badge>}
                </div>
              ))}
              {!users.some((u) => u.role === 'DRIVER' && u.companyId === open.id) && <div><span className="muted">Aucun livreur</span></div>}
            </div>
          </div>
        </Sheet>
      )}
    </>
  );
}

const EMPTY = { name: '', phone: '', managerName: '', managerPhone: '', managerPassword: '' };

function CreateCompany({ onClose }: { onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const field = (key: keyof typeof EMPTY, label: string, type = 'text', placeholder = '') => (
    <label className="field"><span>{label}</span><input type={type} placeholder={placeholder} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></label>
  );
  const submit = async () => {
    try {
      await api('/companies', { method: 'POST', body: form });
      toast(`${form.name} créée — le gérant peut se connecter`);
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Nouvelle entreprise" subtitle="Le compte du gérant est créé en même temps." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Créer</button></>}>
      {field('name', 'Nom de l’entreprise', 'text', 'Ex. : Rapid Express')}
      {field('phone', 'Téléphone de l’entreprise', 'tel', '0711111111')}
      <div className="section-title" style={{ marginTop: 6, marginBottom: 0 }}>Gérant</div>
      {field('managerName', 'Nom')}
      {field('managerPhone', 'Téléphone (identifiant)', 'tel', '0722222222')}
      {field('managerPassword', 'Mot de passe provisoire', 'password', '6 caractères minimum')}
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

function EditCompany({ company, onClose }: { company: Company; onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [name, setName] = useState(company.name);
  const [phone, setPhone] = useState(company.phone);
  const [error, setError] = useState('');
  const submit = async () => {
    try {
      await api(`/companies/${company.id}`, { method: 'PATCH', body: { name, phone } });
      toast('Entreprise modifiée');
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal title="Modifier l’entreprise" onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Enregistrer</button></>}>
      <label className="field"><span>Nom</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="field"><span>Téléphone</span><input value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
