import { FormEvent, useEffect, useState } from 'react';
import { api, Company, Delivery, fcfa } from '../api';
import DeliveriesTable from '../components/DeliveriesTable';
import { Stat } from './CompanyDashboard';

const EMPTY = { name: '', phone: '', managerName: '', managerPhone: '', managerPassword: '' };

export default function AdminDashboard() {
  const [tab, setTab] = useState<'courses' | 'entreprises'>('courses');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const load = () => {
    api<Delivery[]>('/deliveries').then(setDeliveries);
    api<Company[]>('/companies').then(setCompanies);
  };
  useEffect(load, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/companies', { method: 'POST', body: form });
      setForm(EMPTY);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (c: Company) => {
    await api(`/companies/${c.id}/active?value=${!c.active}`, { method: 'PATCH' });
    load();
  };

  const delivered = deliveries.filter((d) => d.status === 'DELIVERED');
  const field = (key: keyof typeof EMPTY, placeholder: string) => (
    <input placeholder={placeholder} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );

  return (
    <>
      <div className="stats">
        <Stat label="Courses totales" value={deliveries.length} />
        <Stat label="En attente" value={deliveries.filter((d) => d.status === 'PENDING').length} />
        <Stat label="Volume livré" value={fcfa(delivered.reduce((s, d) => s + d.price, 0))} />
        <Stat label="Entreprises" value={companies.length} />
      </div>

      <nav className="tabs">
        <button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}>Courses</button>
        <button className={tab === 'entreprises' ? 'active' : ''} onClick={() => setTab('entreprises')}>Entreprises</button>
        <button className="link" onClick={load}>↻ Actualiser</button>
      </nav>

      {tab === 'courses' && <DeliveriesTable deliveries={deliveries} showCompany />}
      {tab === 'entreprises' && (
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
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
