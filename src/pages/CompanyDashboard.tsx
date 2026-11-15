import { FormEvent, useEffect, useState } from 'react';
import { api, Delivery, fcfa, User } from '../api';
import DeliveriesTable from '../components/DeliveriesTable';
import LiveMap from '../components/LiveMap';

export default function CompanyDashboard() {
  const [tab, setTab] = useState<'courses' | 'carte' | 'livreurs'>('courses');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);

  const load = () => {
    api<Delivery[]>('/deliveries/company').then(setDeliveries);
    api<User[]>('/companies/me/drivers').then(setDrivers);
  };
  useEffect(load, []);

  const delivered = deliveries.filter((d) => d.status === 'DELIVERED');
  const inProgress = deliveries.filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP');

  return (
    <>
      <div className="stats">
        <Stat label="Courses livrées" value={delivered.length} />
        <Stat label="En cours" value={inProgress.length} />
        <Stat label="Chiffre d'affaires" value={fcfa(delivered.reduce((s, d) => s + d.price, 0))} />
        <Stat label="Livreurs actifs" value={drivers.filter((d) => d.active).length} />
      </div>

      <nav className="tabs">
        <button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}>Courses</button>
        <button className={tab === 'carte' ? 'active' : ''} onClick={() => setTab('carte')}>Carte en direct</button>
        <button className={tab === 'livreurs' ? 'active' : ''} onClick={() => setTab('livreurs')}>Livreurs</button>
        <button className="link" onClick={load}>↻ Actualiser</button>
      </nav>

      {tab === 'courses' && <DeliveriesTable deliveries={deliveries} />}
      {tab === 'carte' && <LiveMap drivers={drivers} />}
      {tab === 'livreurs' && <Drivers drivers={drivers} reload={load} />}
    </>
  );
}

function Drivers({ drivers, reload }: { drivers: User[]; reload: () => void }) {
  const [form, setForm] = useState({ name: '', phone: '', password: '' });
  const [error, setError] = useState('');

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api('/companies/me/drivers', { method: 'POST', body: form });
      setForm({ name: '', phone: '', password: '' });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (d: User) => {
    await api(`/companies/me/drivers/${d.id}/active?value=${!d.active}`, { method: 'PATCH' });
    reload();
  };

  return (
    <>
      <form className="card inline" onSubmit={add}>
        <input placeholder="Nom du livreur" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="Mot de passe" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <button type="submit">Ajouter</button>
        {error && <p className="error">{error}</p>}
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nom</th><th>Téléphone</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>{d.phone}</td>
                <td>{d.active ? 'Actif' : 'Désactivé'}</td>
                <td><button className="link" onClick={() => toggle(d)}>{d.active ? 'Désactiver' : 'Réactiver'}</button></td>
              </tr>
            ))}
            {drivers.length === 0 && <tr><td colSpan={4} className="muted center">Aucun livreur</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card stat">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
