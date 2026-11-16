import { FormEvent, useEffect, useState } from 'react';
import { api, Delivery, fcfa, Stop, User } from '../api';
import DeliveriesTable from '../components/DeliveriesTable';
import Disputes from '../components/Disputes';
import LiveMap from '../components/LiveMap';

export default function CompanyDashboard() {
  const [tab, setTab] = useState<'courses' | 'carte' | 'encaissements' | 'litiges' | 'livreurs'>('courses');
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
        <Stat
          label="À reverser aux boutiques"
          value={fcfa(
            deliveries
              .flatMap((d) => d.stops)
              .filter((s) => s.status === 'DELIVERED' && s.codAmount > 0 && !s.codRemittedAt)
              .reduce((sum, s) => sum + s.codAmount, 0),
          )}
        />
      </div>

      <nav className="tabs">
        <button className={tab === 'courses' ? 'active' : ''} onClick={() => setTab('courses')}>Courses</button>
        <button className={tab === 'carte' ? 'active' : ''} onClick={() => setTab('carte')}>Carte en direct</button>
        <button className={tab === 'encaissements' ? 'active' : ''} onClick={() => setTab('encaissements')}>Encaissements</button>
        <button className={tab === 'litiges' ? 'active' : ''} onClick={() => setTab('litiges')}>Litiges</button>
        <button className={tab === 'livreurs' ? 'active' : ''} onClick={() => setTab('livreurs')}>Livreurs</button>
        <button className="link" onClick={load}>↻ Actualiser</button>
      </nav>

      {tab === 'courses' && <DeliveriesTable deliveries={deliveries} />}
      {tab === 'carte' && <LiveMap drivers={drivers} />}
      {tab === 'encaissements' && <Collections deliveries={deliveries} reload={load} />}
      {tab === 'litiges' && <Disputes deliveries={deliveries} />}
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

/**
 * Paiement à la livraison : les livreurs encaissent le prix de la marchandise pour l'entreprise,
 * qui le reverse ensuite à chaque client (boutique).
 */
function Collections({ deliveries, reload }: { deliveries: Delivery[]; reload: () => void }) {
  const [error, setError] = useState('');
  // Arrêts livrés avec paiement à la livraison (encaissés par nos livreurs)
  const cod = deliveries.flatMap((d) =>
    d.stops.filter((s) => s.status === 'DELIVERED' && s.codAmount > 0).map((s) => ({ d, s })),
  );
  const pending = cod.filter((x) => !x.s.codRemittedAt);

  // Montant à reverser par client (boutique)
  const byClient = Object.values(
    pending.reduce<Record<string, { name: string; phone: string; total: number; count: number }>>((acc, { d, s }) => {
      const c = (acc[d.client.id] ??= { name: d.client.name, phone: d.client.phone, total: 0, count: 0 });
      c.total += s.codAmount;
      c.count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);

  const remit = async (d: Delivery, s: Stop) => {
    if (!confirm(`Confirmer le reversement de ${fcfa(s.codAmount)} à ${d.client.name} ?`)) return;
    setError('');
    try {
      await api(`/deliveries/${d.id}/stops/${s.id}/cod-remitted`, { method: 'POST' });
      reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <>
      <h3>À reverser par boutique</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Client</th><th>Téléphone</th><th>Colis</th><th>Total à reverser</th></tr></thead>
          <tbody>
            {byClient.map((c) => (
              <tr key={c.phone}><td>{c.name}</td><td>{c.phone}</td><td>{c.count}</td><td><strong>{fcfa(c.total)}</strong></td></tr>
            ))}
            {byClient.length === 0 && <tr><td colSpan={4} className="muted center">Rien à reverser</td></tr>}
          </tbody>
        </table>
      </div>
      {error && <p className="error">{error}</p>}
      <h3>Détail des encaissements</h3>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Livré le</th><th>Client</th><th>Destinataire</th><th>Livreur</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
          <tbody>
            {cod.map(({ d, s }) => (
              <tr key={s.id}>
                <td>{s.deliveredAt ? new Date(s.deliveredAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                <td>{d.client.name}</td>
                <td>{s.recipientName}</td>
                <td>{d.driver?.name ?? '—'}</td>
                <td>{fcfa(s.codAmount)}</td>
                <td>{s.codRemittedAt ? `Reversé le ${new Date(s.codRemittedAt).toLocaleDateString('fr-FR')}` : 'À reverser'}</td>
                <td>{!s.codRemittedAt && <button className="link" onClick={() => remit(d, s)}>Marquer reversé</button>}</td>
              </tr>
            ))}
            {cod.length === 0 && <tr><td colSpan={7} className="muted center">Aucun paiement à la livraison</td></tr>}
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
