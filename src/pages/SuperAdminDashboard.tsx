import { FormEvent, useEffect, useState } from 'react';
import { api, Company, Delivery, fcfa, Role, ROLE_LABEL, User } from '../api';
import DeliveriesTable from '../components/DeliveriesTable';
import LiveMap from '../components/LiveMap';
import { Stat } from './CompanyDashboard';

type Tab = 'courses' | 'carte' | 'entreprises' | 'utilisateurs';
const EMPTY = { name: '', phone: '', managerName: '', managerPhone: '', managerPassword: '' };

/** Tableau de bord du Super Admin (SA) : vue sur toute la plateforme */
export default function SuperAdminDashboard() {
  const [tab, setTab] = useState<Tab>('courses');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const load = () => {
    api<Delivery[]>('/deliveries').then(setDeliveries);
    api<Company[]>('/companies').then(setCompanies);
    api<User[]>('/users').then(setUsers);
  };
  useEffect(load, []);

  const delivered = deliveries.filter((d) => d.status === 'DELIVERED');
  const drivers = users.filter((u) => u.role === 'DRIVER');
  const tabs: [Tab, string][] = [
    ['courses', 'Courses'],
    ['carte', 'Carte en direct'],
    ['entreprises', 'Entreprises'],
    ['utilisateurs', 'Utilisateurs'],
  ];

  return (
    <>
      <div className="stats">
        <Stat label="Courses totales" value={deliveries.length} />
        <Stat label="En attente" value={deliveries.filter((d) => d.status === 'PENDING').length} />
        <Stat label="Volume livré" value={fcfa(delivered.reduce((s, d) => s + d.price, 0))} />
        <Stat label="Entreprises" value={companies.length} />
        <Stat label="Livreurs" value={drivers.length} />
        <Stat label="Clients" value={users.filter((u) => u.role === 'CLIENT').length} />
      </div>

      <nav className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
        <button className="link" onClick={load}>↻ Actualiser</button>
      </nav>

      {tab === 'courses' && <DeliveriesTable deliveries={deliveries} showCompany />}
      {tab === 'carte' && <LiveMap drivers={drivers} />}
      {tab === 'entreprises' && <Companies companies={companies} reload={load} />}
      {tab === 'utilisateurs' && <Users users={users} reload={load} />}
    </>
  );
}

function Companies({ companies, reload }: { companies: Company[]; reload: () => void }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/companies', { method: 'POST', body: form });
      setForm(EMPTY);
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (c: Company) => {
    await api(`/companies/${c.id}/active?value=${!c.active}`, { method: 'PATCH' });
    reload();
  };

  const field = (key: keyof typeof EMPTY, placeholder: string) => (
    <input placeholder={placeholder} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );

  return (
    <>
      <form className="card inline" onSubmit={create}>
        {field('name', "Nom de l'entreprise")}
        {field('phone', 'Téléphone entreprise')}
        {field('managerName', 'Nom du gérant')}
        {field('managerPhone', 'Téléphone du gérant')}
        {field('managerPassword', 'Mot de passe du gérant')}
        <button type="submit">Créer</button>
        {error && <p className="error">{error}</p>}
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Entreprise</th><th>Téléphone</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.active ? 'Active' : 'Suspendue'}</td>
                <td><button className="link" onClick={() => toggle(c)}>{c.active ? 'Suspendre' : 'Réactiver'}</button></td>
              </tr>
            ))}
            {companies.length === 0 && <tr><td colSpan={4} className="muted center">Aucune entreprise</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Users({ users, reload }: { users: User[]; reload: () => void }) {
  const [role, setRole] = useState<Role | ''>('');
  const rows = role ? users.filter((u) => u.role === role) : users;

  const toggle = async (u: User) => {
    await api(`/users/${u.id}/active?value=${!u.active}`, { method: 'PATCH' });
    reload();
  };

  return (
    <>
      <select value={role} onChange={(e) => setRole(e.target.value as Role | '')}>
        <option value="">Tous les rôles</option>
        <option value="CLIENT">Clients</option>
        <option value="DRIVER">Livreurs</option>
        <option value="COMPANY">Gérants</option>
      </select>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Rôle</th><th>Entreprise</th><th>Inscrit le</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.phone}</td>
                <td><span className="role">{ROLE_LABEL[u.role]}</span></td>
                <td>{u.company?.name ?? '—'}</td>
                <td>{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                <td>{u.active ? 'Actif' : 'Bloqué'}</td>
                <td><button className="link" onClick={() => toggle(u)}>{u.active ? 'Bloquer' : 'Débloquer'}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted center">Aucun utilisateur</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
