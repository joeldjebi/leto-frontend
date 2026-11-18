import { useMemo, useState } from 'react';
import { goTo, useHashParam } from '../App';
import { api, dateTime, User } from '../api';
import { formatMoney, formatPhone } from '../countries';
import { useData } from '../data';
import { Avatar, Badge, Card, Empty, PageHeader, Search, Segmented, Switch, useToast } from '../ui';
import ClientDetail from './ClientDetail';

type Sort = 'volume' | 'recent' | 'name';

/** Clients : liste, ou fiche détaillée (#/clients/<id>) */
export default function Clients() {
  const detailId = useHashParam('clients');
  return detailId ? <ClientDetail id={detailId} /> : <ClientList />;
}

/** Clients et boutiques (SA) : activité, encaissements, blocage */
function ClientList() {
  const { users, deliveries, reload } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('volume');

  const clients = users.filter((u) => u.role === 'CLIENT');
  const activity = useMemo(() => {
    const m = new Map<string, { count: number; volume: number; cod: number; last: string | null; stops: number }>();
    for (const d of deliveries) {
      const a = m.get(d.client.id) ?? { count: 0, volume: 0, cod: 0, last: null, stops: 0 };
      if (d.status !== 'CANCELLED') { a.count++; a.stops += d.stops.length; }
      if (d.status === 'DELIVERED') a.volume += d.price;
      a.cod += d.stops.filter((s) => s.status === 'DELIVERED').reduce((t, s) => t + s.codAmount, 0);
      if (!a.last || d.createdAt > a.last) a.last = d.createdAt;
      m.set(d.client.id, a);
    }
    return m;
  }, [deliveries]);

  const toggle = async (u: User, active: boolean) => {
    await api(`/users/${u.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${u.name} débloqué` : `${u.name} bloqué`);
    reload();
  };

  const rows = clients
    .filter((u) => (u.name + u.phone).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => {
      const A = activity.get(a.id), B = activity.get(b.id);
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'recent') return (B?.last ?? '').localeCompare(A?.last ?? '');
      return (B?.volume ?? 0) - (A?.volume ?? 0);
    });

  return (
    <>
      <PageHeader title="Clients" subtitle={`${clients.length} particulier(s) et boutique(s)`} />
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Nom ou téléphone" />
        <span className="spacer" />
        <Segmented<Sort> value={sort} onChange={setSort} options={[['volume', 'Par volume'], ['recent', 'Plus récents'], ['name', 'Par nom']]} />
      </div>
      <Card>
        {rows.length === 0 ? <Empty icon="people">Aucun client</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Client</th><th className="num">Courses</th><th className="num">Colis</th><th className="num">Dépensé</th><th className="num">Encaissé pour lui</th><th>Dernière commande</th><th>Inscrit le</th><th>Accès</th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const a = activity.get(u.id);
                  return (
                    <tr key={u.id} className="clickable" onClick={() => goTo('clients', u.id)}>
                      <td>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <Avatar name={u.name} />
                          <div>{u.name} {u.accountType && <Badge color={u.accountType === 'SHOP' ? 'purple' : 'gray'}>{u.accountType === 'SHOP' ? 'Boutique' : 'Particulier'}</Badge>} {(a?.stops ?? 0) > (a?.count ?? 0) && <Badge color="blue">Tournées</Badge>}<span className="sub">{formatPhone(u.phone)}</span></div>
                        </div>
                      </td>
                      <td className="num">{a?.count ?? 0}</td>
                      <td className="num">{a?.stops ?? 0}</td>
                      <td className="num">{formatMoney(a?.volume ?? 0)}</td>
                      <td className="num">{a?.cod ? formatMoney(a.cod) : <span className="muted">—</span>}</td>
                      <td>{a?.last ? dateTime(a.last) : <span className="muted">—</span>}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString('fr-FR')}</td>
                      <td onClick={(e) => e.stopPropagation()}><Switch checked={u.active} onChange={(v) => toggle(u, v)} label={u.active ? 'Bloquer' : 'Débloquer'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
