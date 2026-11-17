import { useMemo, useState } from 'react';
import { goTo, useHashParam } from '../App';
import { api, fcfa, isOnline, phoneError, time, User, Vehicle } from '../api';
import { useData } from '../data';
import { Avatar, Badge, Card, Empty, Field, Icon, Modal, PageHeader, PhoneInput, Search, Segmented, Switch, useToast } from '../ui';
import DriverDetail from './DriverDetail';
import { RemittanceTable, Remittance, ReviewRemittance, ShareDialog, useCompanyCash } from '../components/Remittances';

type Filter = 'all' | 'online' | 'blocked';

/** Livreurs : liste, ou fiche détaillée (#/livreurs/<id>) */
export default function Drivers() {
  const detailId = useHashParam('drivers');
  return detailId ? <DriverDetail id={detailId} /> : <DriverList />;
}

/** Livreurs : tous (SA) ou ceux de l'entreprise (gérant, qui peut en ajouter) */
function DriverList() {
  const { drivers, deliveries, companies, isSA, reload } = useData();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [company, setCompany] = useState('');
  const [adding, setAdding] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [review, setReview] = useState<Remittance | null>(null);
  const { data: cash, reload: reloadCash } = useCompanyCash(!isSA);
  const cashOf = (id: string) => cash?.balances.find((b) => b.driverId === id);

  const activity = useMemo(() => {
    const m = new Map<string, { delivered: number; volume: number; failed: number; busy: boolean }>();
    for (const d of deliveries) {
      if (!d.driver) continue;
      const a = m.get(d.driver.id) ?? { delivered: 0, volume: 0, failed: 0, busy: false };
      if (d.status === 'DELIVERED') { a.delivered++; a.volume += d.price; }
      if (d.status === 'ACCEPTED' || d.status === 'PICKED_UP') a.busy = true;
      a.failed += d.stops.filter((s) => s.status === 'FAILED').length;
      m.set(d.driver.id, a);
    }
    return m;
  }, [deliveries]);

  const toggle = async (u: User, active: boolean) => {
    await api(isSA ? `/users/${u.id}/active?value=${active}` : `/companies/me/drivers/${u.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${u.name} débloqué` : `${u.name} bloqué — accès coupé immédiatement`);
    reload();
  };

  const rows = drivers.filter((u) =>
    (u.name + u.phone).toLowerCase().includes(q.toLowerCase()) &&
    (!company || u.companyId === company) &&
    (filter === 'all' || (filter === 'online' ? isOnline(u) : !u.active)));

  return (
    <>
      <PageHeader
        title="Livreurs"
        subtitle={`${drivers.length} livreur(s) · ${drivers.filter(isOnline).length} en ligne`}
        actions={!isSA && <>
          <button className="btn secondary" onClick={() => setShareOpen(true)}><Icon name="wallet" size={15} />Part des livreurs · {cash?.sharePercent ?? 0} %</button>
          <button className="btn" onClick={() => setAdding(true)}><Icon name="plus" size={15} />Ajouter un livreur</button>
        </>}
      />
      {!isSA && cash && cash.pending.length > 0 && (
        <Card title={`Versements à confirmer (${cash.pending.length})`}>
          <RemittanceTable rows={cash.pending} showDriver onReview={setReview} />
        </Card>
      )}
      {!isSA && cash && <div style={{ height: 16 }} />}
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Nom ou téléphone" />
        <Segmented<Filter> value={filter} onChange={setFilter} options={[['all', 'Tous'], ['online', 'En ligne'], ['blocked', 'Bloqués']]} />
        <span className="spacer" />
        {isSA && (
          <select value={company} onChange={(e) => setCompany(e.target.value)} aria-label="Entreprise">
            <option value="">Toutes les entreprises</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>
      <Card>
        {rows.length === 0 ? <Empty icon="bike">Aucun livreur</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Livreur</th>{isSA && <th>Entreprise</th>}<th>Statut</th><th className="num">Courses terminées</th><th className="num">Volume</th><th className="num">Échecs</th>{!isSA && <th className="num">À verser</th>}<th>Accès</th></tr></thead>
              <tbody>
                {rows.map((u) => {
                  const a = activity.get(u.id);
                  return (
                    <tr key={u.id} className="clickable" onClick={() => goTo('drivers', u.id)}>
                      <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar name={u.name} /><div>{u.name}<span className="sub">{u.phone}</span></div></div></td>
                      {isSA && <td>{u.company?.name ?? '—'}</td>}
                      <td>
                        {!u.active ? <Badge color="red">Bloqué</Badge> : isOnline(u) ? <Badge color={a?.busy ? 'purple' : 'green'}>{a?.busy ? 'En course' : 'En ligne'}</Badge> : <Badge>Hors ligne</Badge>}
                        {u.lastLocationAt && !isOnline(u) && <span className="sub">vu à {time(u.lastLocationAt)}</span>}
                      </td>
                      <td className="num">{a?.delivered ?? 0}</td>
                      <td className="num">{fcfa(a?.volume ?? 0)}</td>
                      <td className="num">{a?.failed ?? 0}</td>
                      {!isSA && <td className="num">{cashOf(u.id)?.toRemit ? <strong>{fcfa(cashOf(u.id)!.toRemit)}</strong> : <span className="muted">—</span>}{cashOf(u.id)?.pending ? <span className="sub">{fcfa(cashOf(u.id)!.pending)} en attente</span> : null}</td>}
                      <td onClick={(e) => e.stopPropagation()}><Switch checked={u.active} onChange={(v) => toggle(u, v)} label={u.active ? 'Bloquer' : 'Débloquer'} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {adding && <AddDriver onClose={() => setAdding(false)} />}
      {shareOpen && <ShareDialog current={cash?.sharePercent ?? 0} onClose={() => setShareOpen(false)} onDone={reloadCash} />}
      {review && <ReviewRemittance r={review} onClose={() => setReview(null)} onDone={reloadCash} />}
    </>
  );
}

function AddDriver({ onClose }: { onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [form, setForm] = useState<{ name: string; phone: string; password: string; vehicleType: Vehicle }>({ name: '', phone: '', password: '', vehicleType: 'MOTO' });
  const [errors, setErrors] = useState<{ name?: string; phone?: string | null; password?: string }>({});
  const [error, setError] = useState('');
  const submit = async () => {
    const e = {
      name: form.name.trim() ? undefined : 'Nom obligatoire',
      phone: phoneError(form.phone),
      password: form.password.length >= 6 ? undefined : '6 caractères minimum',
    };
    setErrors(e);
    if (e.name || e.phone || e.password) return;
    setError('');
    try {
      await api('/companies/me/drivers', { method: 'POST', body: form });
      toast(`${form.name} ajouté — il se connecte à l’app LETO avec ${form.phone}`);
      await reload();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Modal title="Ajouter un livreur" subtitle="Il se connectera à l’application mobile avec ce téléphone." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Ajouter</button></>}>
      <Field label="Nom du livreur" error={errors.name}>
        <input autoComplete="off" data-lpignore="true" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </Field>
      <Field label="Téléphone du livreur" error={errors.phone} hint="Sert d’identifiant dans l’app (10 chiffres)">
        <PhoneInput value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      </Field>
      <Field label="Engin" hint="Affiché sur la carte des clients">
        <div className="vehicle-pick">
          {(['MOTO', 'CAR', 'CARGO'] as Vehicle[]).map((v) => (
            <button key={v} type="button" className={form.vehicleType === v ? 'on' : ''} onClick={() => setForm({ ...form, vehicleType: v })}>
              <Icon name={v === 'MOTO' ? 'moto' : v === 'CAR' ? 'car' : 'truck'} size={22} />{v === 'MOTO' ? 'Moto' : v === 'CAR' ? 'Voiture' : 'Cargo'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Mot de passe provisoire" error={errors.password} hint="À transmettre au livreur (6 caractères minimum)">
        <input type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      </Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
