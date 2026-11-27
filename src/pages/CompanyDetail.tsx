import { useMemo, useState } from 'react';
import { go, goTo } from '../App';
import { api, codTotal, Company, dateTime, Delivery, FAILURE_LABEL, isOnline, SPEED_LABEL, Stop, time, User, errText } from '../api';
import { formatMoney, phoneError, formatPhone } from '../countries';
import { AdjustDialog, BillingAlert, BillingStats, CommissionDialog, PaymentsTable, SubscriptionDialog, TransactionsCard, useBilling, TrialDialog } from '../components/Billing';
import DeliverySheet, { FailureProof, ResolveDialog } from '../components/DeliverySheet';
import { useData } from '../data';
import { Avatar, Badge, BarChart, Card, Empty, Field, Icon, Modal, PhoneInput, Search, Segmented, Stat, StatusBadge, Switch, useToast } from '../ui';
import { useVehicles } from '../vehicles';

type Tab = 'deliveries' | 'drivers' | 'billing' | 'collections' | 'disputes';
type Metric = 'created' | 'volume';
type StatusFilter = 'all' | 'active' | 'done' | 'cancelled';
const DAY = 86_400_000;

/** Fiche complète d'une entreprise de livraison (SA) : identité, chiffres, activité, courses, livreurs, encaissements, litiges */
export default function CompanyDetail({ id }: { id: string }) {
  const { companies, users, deliveries, reload } = useData();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('deliveries');
  const [metric, setMetric] = useState<Metric>('created');
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<Delivery | null>(null);
  const [resolve, setResolve] = useState<{ d: Delivery; s: Stop } | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const company = companies.find((c) => c.id === id);
  const managers = users.filter((u) => u.role === 'COMPANY' && u.companyId === id);
  const drivers = users.filter((u) => u.role === 'DRIVER' && u.companyId === id);
  const mine = useMemo(() => deliveries.filter((d) => d.company?.id === id), [deliveries, id]);

  const k = useMemo(() => {
    const delivered = mine.filter((d) => d.status === 'DELIVERED');
    const stops = mine.flatMap((d) => d.stops.map((s) => ({ d, s })));
    const handled = stops.filter((x) => x.s.status !== 'PENDING');
    const failed = stops.filter((x) => x.s.status === 'FAILED');
    const cod = stops.filter((x) => x.s.status === 'DELIVERED' && x.s.codAmount > 0);
    const weekAgo = Date.now() - 7 * DAY;
    return {
      total: mine.length,
      delivered: delivered.length,
      active: mine.filter((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP').length,
      cancelled: mine.filter((d) => d.status === 'CANCELLED').length,
      volume: delivered.reduce((t, d) => t + d.price, 0),
      volumeWeek: delivered.filter((d) => d.deliveredAt && new Date(d.deliveredAt).getTime() > weekAgo).reduce((t, d) => t + d.price, 0),
      stops: stops.length,
      failed,
      failureRate: handled.length ? Math.round((failed.length / handled.length) * 1000) / 10 : 0,
      disputesOpen: failed.filter((x) => x.s.disputedAt && !x.s.disputeResolvedAt).length,
      cod,
      codPending: cod.filter((x) => !x.s.codRemittedAt),
      clients: new Set(mine.map((d) => d.client.id)).size,
      avgPrice: delivered.length ? Math.round(delivered.reduce((t, d) => t + d.price, 0) / delivered.length) : 0,
    };
  }, [mine]);

  // Activité sur 30 jours (une seule série à la fois)
  const series = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days = Array.from({ length: 30 }, (_, i) => new Date(start.getTime() - (29 - i) * DAY));
    return days.map((day) => {
      const key = day.toISOString().slice(0, 10);
      const next = day.getTime() + DAY;
      const inDay = mine.filter((d) => {
        const t = new Date(metric === 'created' ? d.createdAt : d.deliveredAt ?? 0).getTime();
        return t >= day.getTime() && t < next && (metric === 'created' || d.status === 'DELIVERED');
      });
      return {
        key,
        label: day.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        value: metric === 'created' ? inDay.length : inDay.reduce((t, d) => t + d.price, 0),
      };
    });
  }, [mine, metric]);

  if (!company) {
    return (
      <>
        <button className="back-link" onClick={() => go('companies')}><Icon name="chevron" size={15} />Entreprises</button>
        <Card><Empty icon="building">Entreprise introuvable</Empty></Card>
      </>
    );
  }

  const toggle = async (active: boolean) => {
    await api(`/companies/${company.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${company.name} réactivée` : `${company.name} suspendue — ses comptes sont bloqués`);
    reload();
  };

  return (
    <>
      <button className="back-link" onClick={() => go('companies')}><Icon name="chevron" size={15} />Entreprises</button>

      {/* ----- Identité ----- */}
      <header className="page-header">
        <div className="hero">
          <Avatar name={company.name} />
          <div>
            <h1>{company.name} {company.active ? <Badge color="green">Active</Badge> : <Badge color="red">Suspendue</Badge>}</h1>
            <div className="meta-row">
              <span><Icon name="phone" size={14} />{formatPhone(company.phone)}</span>
              <span><Icon name="clock" size={14} />Partenaire depuis le {new Date(company.createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <span><Icon name="people" size={14} />{k.clients} client(s) servi(s)</span>
            </div>
          </div>
        </div>
        <div className="actions">
          <span className="muted">{company.active ? 'Active' : 'Suspendue'}</span>
          <Switch checked={company.active} onChange={toggle} label={company.active ? 'Suspendre' : 'Réactiver'} />
          <button className="btn secondary" onClick={() => setEditing(true)}><Icon name="edit" size={15} />Modifier</button>
        </div>
      </header>

      <CompanyBillingAlert companyId={company.id} onOpen={() => setTab('billing')} />
      <OrderAccessCard company={company} />

      {/* ----- Chiffres clés ----- */}
      <div className="grid grid-stats" style={{ marginBottom: 16 }}>
        <Stat icon="box" label="Courses" value={k.total} foot={`${k.delivered} terminée(s) · ${k.cancelled} annulée(s) · ${k.stops} colis`} />
        <Stat icon="wallet" label="Volume des courses" value={formatMoney(k.volume)} foot={`${formatMoney(k.volumeWeek)} sur 7 jours · panier moyen ${formatMoney(k.avgPrice)}`} />
        <Stat icon="bike" label="Livreurs" value={`${drivers.filter(isOnline).length} / ${drivers.length}`} foot={`en ligne · ${k.active} course(s) en cours`} onClick={() => setTab('drivers')} />
        <Stat icon="alert" label="Taux d’échec" value={`${k.failureRate} %`} foot={`${k.failed.length} échec(s) · ${k.disputesOpen} litige(s) à trancher`} onClick={() => setTab('disputes')} />
        <Stat icon="wallet" label="À reverser aux boutiques" value={formatMoney(k.codPending.reduce((t, x) => t + x.s.codAmount, 0))} foot={`${k.codPending.length} colis encaissé(s) non reversé(s)`} onClick={() => setTab('collections')} />
        <Stat icon="check" label="Déjà reversé" value={formatMoney(k.cod.filter((x) => x.s.codRemittedAt).reduce((t, x) => t + x.s.codAmount, 0))} foot={`${k.cod.length} paiement(s) à la livraison au total`} />
      </div>

      <div className="stack">
        <div className="grid grid-2">
          <Card
            title={metric === 'created' ? 'Courses · 30 jours' : 'Volume terminé · 30 jours'}
            actions={<Segmented<Metric> value={metric} onChange={setMetric} options={[['created', 'Courses'], ['volume', 'Volume']]} />}
          >
            <div style={{ padding: '4px 20px 16px' }}>
              <BarChart data={series} format={(n) => (metric === 'created' ? `${n} course(s)` : formatMoney(n))} label={`Activité de ${company.name} sur 30 jours`} />
            </div>
          </Card>
          <Card title="Gérant(s)">
            {managers.length === 0 ? <Empty icon="people">Aucun gérant</Empty> : (
              <div className="rows">
                {managers.map((u) => (
                  <div key={u.id}>
                    <Avatar name={u.name} />
                    <div className="grow"><div className="title">{u.name}</div><small className="muted">{formatPhone(u.phone)} · depuis le {new Date(u.createdAt).toLocaleDateString('fr-FR')}</small></div>
                    {u.active ? <Badge color="green">Actif</Badge> : <Badge color="red">Bloqué</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* ----- Onglets ----- */}
        <div>
          <Segmented<Tab>
            value={tab}
            onChange={setTab}
            options={[
              ['deliveries', `Courses (${k.total})`],
              ['drivers', `Livreurs (${drivers.length})`],
              ['billing', 'Crédit et abonnement'],
              ['collections', `Encaissements (${k.cod.length})`],
              ['disputes', `Litiges (${k.failed.length})`],
            ]}
          />
        </div>

        {tab === 'deliveries' && (
          <DeliveriesTab deliveries={mine} q={q} setQ={setQ} status={status} setStatus={setStatus} onOpen={setOpen} />
        )}
        {tab === 'drivers' && <DriversTab drivers={drivers} deliveries={mine} />}
        {tab === 'billing' && <BillingTab companyId={company.id} />}
        {tab === 'collections' && <CollectionsTab cod={k.cod} />}
        {tab === 'disputes' && (
          k.failed.length === 0 ? <Card><Empty icon="shield">Aucun échec de livraison</Empty></Card> : (
            <div className="stack">
              {[...k.failed].sort((a, b) => Number(!!b.s.disputedAt && !b.s.disputeResolvedAt) - Number(!!a.s.disputedAt && !a.s.disputeResolvedAt)).map(({ d, s }) => (
                <Card key={s.id}>
                  <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{FAILURE_LABEL[s.failureReason!]} · {s.recipientName}</strong>
                      {s.disputedAt && !s.disputeResolvedAt && <Badge color="red">À trancher</Badge>}
                      <span className="muted" style={{ marginLeft: 'auto' }}>{dateTime(s.failedAt)}</span>
                    </div>
                    <span className="muted">Expéditeur : {d.client.name} · Livreur : {d.driver?.name ?? '—'} · {s.address} ({s.commune})</span>
                    <div style={{ marginLeft: -34 }}><FailureProof stop={s} onResolve={() => setResolve({ d, s })} /></div>
                    <div><button className="btn plain" style={{ paddingLeft: 0 }} onClick={() => setOpen(d)}>Voir la course</button></div>
                  </div>
                </Card>
              ))}
            </div>
          )
        )}
      </div>

      {open && <DeliverySheet delivery={open} onClose={() => setOpen(null)} />}
      {resolve && <ResolveDialog delivery={resolve.d} stop={resolve.s} onClose={() => setResolve(null)} />}
      {editing && <EditCompany company={company} onClose={() => setEditing(false)} />}
    </>
  );
}

export function DeliveriesTab({ deliveries, q, setQ, status, setStatus, onOpen }: {
  deliveries: Delivery[]; q: string; setQ: (v: string) => void; status: StatusFilter; setStatus: (v: StatusFilter) => void; onOpen: (d: Delivery) => void;
}) {
  const veh = useVehicles();
  const needle = q.trim().toLowerCase();
  const rows = deliveries.filter((d) => {
    if (status === 'active' && d.status !== 'ACCEPTED' && d.status !== 'PICKED_UP') return false;
    if (status === 'done' && d.status !== 'DELIVERED') return false;
    if (status === 'cancelled' && d.status !== 'CANCELLED') return false;
    if (!needle) return true;
    return [d.client.name, d.client.phone, d.driver?.name, d.pickupAddress, ...d.stops.flatMap((s) => [s.recipientName, s.address])]
      .join(' ').toLowerCase().includes(needle);
  });
  return (
    <>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Client, livreur, destinataire…" />
        <Segmented<StatusFilter> value={status} onChange={setStatus} options={[['all', 'Toutes'], ['active', 'En cours'], ['done', 'Terminées'], ['cancelled', 'Annulées']]} />
      </div>
      <Card>
        {rows.length === 0 ? <Empty>Aucune course</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Date</th><th>Client</th><th>Trajet</th><th>Livreur</th><th className="num">Prix</th><th className="num">À encaisser</th><th>Statut</th></tr></thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.id} className="clickable" onClick={() => onOpen(d)}>
                    <td style={{ whiteSpace: 'nowrap' }}>{dateTime(d.createdAt)}</td>
                    <td>{d.client.name}<span className="sub">{formatPhone(d.client.phone)}</span></td>
                    <td>{d.pickupCommune} → {d.stops.length > 1 ? `${d.stops.length} arrêts` : d.stops[0]?.commune}<span className="sub">{veh.name(d.vehicleType)} · {SPEED_LABEL[d.speed]}{d.distanceKm != null ? ` · ${d.distanceKm} km` : ''}</span></td>
                    <td>{d.driver?.name ?? <span className="muted">—</span>}</td>
                    <td className="num">{formatMoney(d.price, d.currency)}</td>
                    <td className="num">{codTotal(d) ? formatMoney(codTotal(d), d.currency) : <span className="muted">—</span>}</td>
                    <td><StatusBadge status={d.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function DriversTab({ drivers, deliveries }: { drivers: User[]; deliveries: Delivery[] }) {
  const { reload } = useData();
  const toast = useToast();
  const stats = (u: User) => {
    const own = deliveries.filter((d) => d.driver?.id === u.id);
    const done = own.filter((d) => d.status === 'DELIVERED');
    const stops = own.flatMap((d) => d.stops);
    return {
      delivered: done.length,
      volume: done.reduce((t, d) => t + d.price, 0),
      failed: stops.filter((s) => s.status === 'FAILED').length,
      busy: own.some((d) => d.status === 'ACCEPTED' || d.status === 'PICKED_UP'),
      last: own.reduce<string | null>((m, d) => (!m || d.createdAt > m ? d.createdAt : m), null),
    };
  };
  const toggle = async (u: User, active: boolean) => {
    await api(`/users/${u.id}/active?value=${active}`, { method: 'PATCH' });
    toast(active ? `${u.name} débloqué` : `${u.name} bloqué`);
    reload();
  };
  return (
    <Card>
      {drivers.length === 0 ? <Empty icon="bike">Aucun livreur — le gérant les ajoute depuis son espace</Empty> : (
        <div className="table-scroll">
          <table className="list">
            <thead><tr><th>Livreur</th><th>Statut</th><th className="num">Courses terminées</th><th className="num">Volume</th><th className="num">Échecs</th><th>Dernière course</th><th>Accès</th></tr></thead>
            <tbody>
              {drivers.map((u) => {
                const s = stats(u);
                return (
                  <tr key={u.id} className="clickable" onClick={() => goTo('drivers', u.id)}>
                    <td><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><Avatar name={u.name} /><div>{u.name}<span className="sub">{formatPhone(u.phone)}</span></div></div></td>
                    <td>
                      {!u.active ? <Badge color="red">Bloqué</Badge> : isOnline(u) ? <Badge color={s.busy ? 'purple' : 'green'}>{s.busy ? 'En course' : 'En ligne'}</Badge> : <Badge>Hors ligne</Badge>}
                      {u.lastLocationAt && !isOnline(u) && <span className="sub">vu à {time(u.lastLocationAt)}</span>}
                    </td>
                    <td className="num">{s.delivered}</td>
                    <td className="num">{formatMoney(s.volume)}</td>
                    <td className="num">{s.failed}</td>
                    <td>{s.last ? dateTime(s.last) : <span className="muted">—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()}><Switch checked={u.active} onChange={(v) => toggle(u, v)} label={u.active ? 'Bloquer' : 'Débloquer'} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** Bandeau sur la fiche si l'entreprise ne peut pas travailler */
/** SA : ses livreurs (et ses livreurs indépendants) voient-ils les commandes ouvertes ? */
function OrderAccessCard({ company }: { company: Company }) {
  const toast = useToast();
  const [c, setC] = useState({ openOrders: company.openOrders !== false, liOpenOrders: company.liOpenOrders !== false });
  const save = async (patch: Partial<typeof c>) => {
    try {
      const x = await api<Company>(`/companies/${company.id}/order-access`, { method: 'PUT', body: patch });
      setC({ openOrders: x.openOrders !== false, liOpenOrders: x.liOpenOrders !== false });
      toast('Accès aux commandes enregistré');
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <Card title="Accès aux commandes ouvertes" pad>
      <div className="rows" style={{ margin: '-8px -20px' }}>
        <div>
          <div className="grow"><div className="title">Ses livreurs</div><small className="muted">{c.openOrders ? 'Voient toutes les commandes ouvertes, en plus de celles passées à l’entreprise.' : 'Ne voient que les commandes passées à l’entreprise et ses affectations.'}</small></div>
          <Switch checked={c.openOrders} onChange={(v) => save({ openOrders: v })} label="Commandes ouvertes pour ses livreurs" />
        </div>
        <div>
          <div className="grow"><div className="title">Ses livreurs indépendants</div><small className="muted">{c.liOpenOrders ? 'Voient toutes les commandes ouvertes, en plus de celles passées à l’entreprise.' : 'Ne voient que les commandes passées à l’entreprise et ses affectations.'}</small></div>
          <Switch checked={c.liOpenOrders} onChange={(v) => save({ liOpenOrders: v })} label="Commandes ouvertes pour ses livreurs indépendants" />
        </div>
      </div>
    </Card>
  );
}

function CompanyBillingAlert({ companyId, onOpen }: { companyId: string; onOpen: () => void }) {
  const { data } = useBilling(companyId);
  return data ? <div onClick={onOpen} style={{ cursor: 'pointer' }}><BillingAlert b={data} /></div> : null;
}

/** SA : crédit, abonnement, commission, paiements et journal de l'entreprise */
function BillingTab({ companyId }: { companyId: string }) {
  const { data: b, setData, error } = useBilling(companyId);
  const [dialog, setDialog] = useState<'adjust' | 'subscription' | 'commission' | 'trial' | null>(null);
  if (!b) return error ? <div className="alert error">{error}</div> : <Card><Empty icon="wallet">Chargement…</Empty></Card>;
  return (
    <div className="stack">
      <div className="toolbar">
        <button className="btn secondary" onClick={() => setDialog('adjust')}><Icon name="wallet" size={15} />Ajuster le crédit</button>
        <button className="btn secondary" onClick={() => setDialog('trial')}><Icon name="clock" size={15} />{b.inTrial ? `Essai · ${b.trialDaysLeft} j` : 'Essai gratuit'}</button>
        {b.subscriptionRequired && <button className="btn secondary" onClick={() => setDialog('subscription')}><Icon name="calendar" size={15} />Abonnement</button>}
        <button className="btn secondary" onClick={() => setDialog('commission')}><Icon name="tag" size={15} />Commission</button>
      </div>
      <BillingStats b={b} />
      <Card title="Paiements envoyés"><PaymentsTable payments={b.payments} /></Card>
      <TransactionsCard b={b} />
      {dialog === 'adjust' && <AdjustDialog companyId={companyId} onClose={() => setDialog(null)} onDone={setData} />}
      {dialog === 'subscription' && <SubscriptionDialog companyId={companyId} current={b.subscriptionEndsAt} onClose={() => setDialog(null)} onDone={setData} />}
      {dialog === 'trial' && <TrialDialog companyId={companyId} b={b} onClose={() => setDialog(null)} onDone={setData} />}
      {dialog === 'commission' && <CommissionDialog companyId={companyId} b={b} onClose={() => setDialog(null)} onDone={setData} />}
    </div>
  );
}

export function CollectionsTab({ cod }: { cod: { d: Delivery; s: Stop }[] }) {
  const pending = cod.filter((x) => !x.s.codRemittedAt);
  const byClient = Object.values(
    pending.reduce<Record<string, { name: string; phone: string; total: number; count: number }>>((acc, { d, s }) => {
      const g = (acc[d.client.id] ??= { name: d.client.name, phone: d.client.phone, total: 0, count: 0 });
      g.total += s.codAmount;
      g.count += 1;
      return acc;
    }, {}),
  ).sort((a, b) => b.total - a.total);
  return (
    <div className="stack">
      <Card title="À reverser, par boutique">
        {byClient.length === 0 ? <Empty icon="wallet">Rien à reverser</Empty> : (
          <div className="rows">
            {byClient.map((g) => (
              <div key={g.phone}>
                <div className="grow"><div className="title">{g.name}</div><small className="muted">{formatPhone(g.phone)}</small></div>
                <span className="muted tabular">{g.count} colis</span>
                <strong className="tabular">{formatMoney(g.total)}</strong>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="Détail des encaissements">
        {cod.length === 0 ? <Empty icon="wallet">Aucun paiement à la livraison</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Livré le</th><th>Boutique</th><th>Destinataire</th><th>Livreur</th><th className="num">Montant</th><th>Statut</th></tr></thead>
              <tbody>
                {[...cod].sort((a, b) => (b.s.deliveredAt ?? '').localeCompare(a.s.deliveredAt ?? '')).map(({ d, s }) => (
                  <tr key={s.id}>
                    <td>{dateTime(s.deliveredAt)}</td>
                    <td>{d.client.name}</td>
                    <td>{s.recipientName}<span className="sub">{s.commune}</span></td>
                    <td>{d.driver?.name ?? '—'}</td>
                    <td className="num">{formatMoney(s.codAmount, d.currency)}</td>
                    <td>{s.codRemittedAt ? <Badge color="green">Reversé le {new Date(s.codRemittedAt).toLocaleDateString('fr-FR')}</Badge> : <Badge color="orange">À reverser</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function EditCompany({ company, onClose }: { company: Company; onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [name, setName] = useState(company.name);
  const [phone, setPhone] = useState(company.phone);
  const [error, setError] = useState('');
  const submit = async () => {
    if (phoneError(phone) || !name.trim()) return;
    try {
      await api(`/companies/${company.id}`, { method: 'PATCH', body: { name, phone } });
      toast('Entreprise modifiée');
      await reload();
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title="Modifier l’entreprise" onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" onClick={submit}>Enregistrer</button></>}>
      <label className="field"><span>Nom</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
      <Field label="Téléphone" error={phone ? phoneError(phone) : 'Numéro obligatoire'}><PhoneInput value={phone} onChange={setPhone} /></Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
