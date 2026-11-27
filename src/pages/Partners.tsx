import { useCallback, useEffect, useState } from 'react';
import { api, dateTime, errText } from '../api';
import { formatMoney, formatPhone } from '../countries';
import { Badge, Card, Empty, Field, Icon, Modal, PageHeader, PhoneInput, Sheet, Stat, Switch, useToast } from '../ui';

interface PartnerRow {
  id: string; name: string; active: boolean; webhookUrl: string | null; note: string | null; createdAt: string; phone: string;
  keys: number; deliveries: number; deliveriesWeek: number; failedHooks: number; lastUsedAt: string | null;
}
interface PartnerKey { id: string; label: string; prefix: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string }
interface Webhook { id: string; event: string; status: 'PENDING' | 'SENT' | 'FAILED'; attempts: number; responseCode: number | null; lastError: string | null; createdAt: string; sentAt: string | null; deliveryId: string | null }
interface PartnerDetail {
  id: string; name: string; active: boolean; webhookUrl: string | null; webhookSecret: string; note: string | null; phone: string | null; createdAt: string;
  keys: PartnerKey[]; webhooks: Webhook[];
  deliveries: { id: string; reference: string | null; status: string; price: number; createdAt: string; stops: number }[];
  statement: { deliveries: number; codCollected: number; codRemitted: number; codPending: number; stopsDelivered: number; stopsFailed: number };
}
const HOOK: Record<Webhook['status'], [string, string]> = { SENT: ['Envoyé', 'green'], PENDING: ['À relancer', 'yellow'], FAILED: ['Échec', 'red'] };
const STATUS: Record<string, string> = { PENDING: 'En attente', ACCEPTED: 'Acceptée', PICKED_UP: 'En cours', DELIVERED: 'Terminée', CANCELLED: 'Annulée' };

/** SA : API partenaire (Adjamé-Smart, boutiques en ligne) — interrupteur général, partenaires, clés, webhooks */
export default function Partners() {
  const toast = useToast();
  const [data, setData] = useState<{ config: { enabled: boolean }; partners: PartnerRow[] } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const load = useCallback(() => api<{ config: { enabled: boolean }; partners: PartnerRow[] }>('/partners').then(setData).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <PageHeader title="Partenaires API" subtitle="Chargement…" />;
  const toggleAll = async (enabled: boolean) => {
    try {
      setData(await api('/partners/config', { method: 'PUT', body: { enabled } }));
      toast(enabled ? 'API partenaire activée' : 'API partenaire désactivée : tous les partenaires sont bloqués');
    } catch (e) {
      toast(errText(e));
    }
  };
  const toggleOne = async (p: PartnerRow, active: boolean) => {
    try {
      await api(`/partners/${p.id}`, { method: 'PATCH', body: { active } });
      toast(active ? `${p.name} réactivé` : `${p.name} désactivé : ses appels sont refusés`);
      load();
    } catch (e) {
      toast(errText(e));
    }
  };
  return (
    <>
      <PageHeader title="Partenaires API" subtitle="Applications qui commandent des livraisons VITE automatiquement (Adjamé-Smart, boutiques en ligne) : clés d’API, webhooks, encaissements." />
      <div className="stack">
        <Card>
          <div className="rows">
            <div>
              <div className="grow">
                <div className="title">API partenaire</div>
                <small className="muted">{data.config.enabled ? 'Activée : les partenaires actifs peuvent créer et suivre des courses.' : 'Désactivée : tous les appels des partenaires sont refusés, quel que soit leur réglage.'}</small>
              </div>
              <Switch checked={data.config.enabled} onChange={toggleAll} label={data.config.enabled ? 'Désactiver l’API partenaire' : 'Activer l’API partenaire'} />
            </div>
          </div>
        </Card>
        <Card title={`Partenaires (${data.partners.length})`} actions={<button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={15} />Nouveau partenaire</button>}>
          {data.partners.length === 0 ? <Empty icon="globe">Aucun partenaire. Créez-en un pour lui donner une clé d’API.</Empty> : (
            <div className="table-scroll">
              <table className="list">
                <thead><tr><th>Partenaire</th><th className="num">Courses</th><th>Clés</th><th>Webhooks</th><th>Dernier appel</th><th>Actif</th></tr></thead>
                <tbody>
                  {data.partners.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => setOpen(p.id)}>
                      <td>{p.name}<span className="sub">{formatPhone(p.phone)}</span></td>
                      <td className="num">{p.deliveries}<span className="sub">{p.deliveriesWeek} sur 7 jours</span></td>
                      <td>{p.keys ? `${p.keys} active(s)` : <span className="muted">Aucune</span>}</td>
                      <td>{p.webhookUrl ? (p.failedHooks ? <Badge color="red">{p.failedHooks} échec(s)</Badge> : <Badge color="green">Configuré</Badge>) : <span className="muted">Non configuré</span>}</td>
                      <td>{p.lastUsedAt ? dateTime(p.lastUsedAt) : <span className="muted">Jamais</span>}</td>
                      <td onClick={(e) => e.stopPropagation()}><Switch checked={p.active} onChange={(v) => toggleOne(p, v)} label={p.active ? `Désactiver ${p.name}` : `Activer ${p.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {creating && <CreateDialog onClose={() => setCreating(false)} onDone={(id) => { setCreating(false); load(); setOpen(id); }} />}
      {open && <PartnerSheet id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState('');
  const submit = async () => {
    setError('');
    try {
      const p = await api<PartnerDetail>('/partners', { method: 'POST', body: { name: name.trim(), phone, webhookUrl: webhookUrl.trim() || undefined } });
      onDone(p.id);
    } catch (e) {
      setError(errText(e));
    }
  };
  return (
    <Modal title="Nouveau partenaire" subtitle="Ses courses sont passées au nom de son compte client VITE (créé avec ce numéro s’il n’existe pas)." onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Annuler</button><button className="btn" disabled={!name.trim() || !phone} onClick={submit}>Créer</button></>}>
      <Field label="Nom"><input autoFocus value={name} maxLength={100} placeholder="Ex. : Adjamé-Smart" onChange={(e) => setName(e.target.value)} /></Field>
      <PhoneInput label="Téléphone du compte client" value={phone} onChange={setPhone} />
      <Field label="Adresse des webhooks (facultatif)" hint="VITE y envoie chaque changement de statut des courses"><input value={webhookUrl} placeholder="https://api.adjame-smart.ci/webhooks/leto" onChange={(e) => setWebhookUrl(e.target.value)} /></Field>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

function PartnerSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const [d, setD] = useState<PartnerDetail | null>(null);
  const [shown, setShown] = useState<{ title: string; value: string; hint: string } | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => api<PartnerDetail>(`/partners/${id}`).then((x) => { setD(x); setUrl(x.webhookUrl ?? ''); }).catch((e) => setError(errText(e))), [id]);
  useEffect(() => { load(); }, [load]);
  const run = async <T,>(f: () => Promise<T>, msg?: string) => {
    setError('');
    try {
      const r = await f();
      if (msg) toast(msg);
      onChanged();
      return r;
    } catch (e) {
      setError(errText(e));
      return null;
    }
  };
  if (!d) return <Sheet title="Partenaire" onClose={onClose}>{error ? <div className="alert error">{error}</div> : <Empty icon="globe">Chargement…</Empty>}</Sheet>;
  const s = d.statement;
  return (
    <Sheet title={d.name} onClose={onClose} actions={<Badge color={d.active ? 'green' : 'gray'}>{d.active ? 'Actif' : 'Désactivé'}</Badge>}>
      {error && <div className="alert error">{error}</div>}
      <div className="grid grid-stats">
        <Stat icon="box" label="Courses" value={s.deliveries} foot={`${s.stopsDelivered} colis livré(s) · ${s.stopsFailed} échec(s)`} />
        <Stat icon="wallet" label="Encaissé à la livraison" value={formatMoney(s.codCollected)} foot={`${formatMoney(s.codRemitted)} reversé · ${formatMoney(s.codPending)} à reverser`} />
      </div>

      <div>
        <div className="section-title">Clés d’API</div>
        <div className="group rows">
          {d.keys.length === 0 && <div><small className="muted grow">Aucune clé : le partenaire ne peut pas encore appeler l’API.</small></div>}
          {d.keys.map((k) => (
            <div key={k.id}>
              <div className="grow">
                <div className="title">{k.label} <code>{k.prefix}…</code></div>
                <small className="muted">Créée le {dateTime(k.createdAt)} · {k.revokedAt ? `révoquée le ${dateTime(k.revokedAt)}` : k.lastUsedAt ? `dernier appel ${dateTime(k.lastUsedAt)}` : 'jamais utilisée'}</small>
              </div>
              {k.revokedAt ? <Badge color="gray">Révoquée</Badge> : <button className="btn plain" onClick={() => run(async () => { setD(await api(`/partners/${id}/keys/${k.id}/revoke`, { method: 'POST' })); }, 'Clé révoquée : ses appels sont refusés')}>Révoquer</button>}
            </div>
          ))}
          <div><span className="grow" /><button className="btn secondary" onClick={() => run(async () => {
            const r = await api<{ key: string }>(`/partners/${id}/keys`, { method: 'POST', body: { label: `Clé du ${new Date().toLocaleDateString('fr-FR')}` } });
            setShown({ title: 'Nouvelle clé d’API', value: r.key, hint: 'Copiez-la maintenant et transmettez-la au partenaire de façon sûre : elle ne sera plus jamais affichée.' });
            load();
          })}><Icon name="plus" size={15} />Nouvelle clé</button></div>
        </div>
      </div>

      <div>
        <div className="section-title">Webhooks</div>
        <div className="group rows">
          <div style={{ flexWrap: 'wrap' }}>
            <Field label="Adresse (https)"><input value={url} placeholder="https://…" onChange={(e) => setUrl(e.target.value)} style={{ minWidth: 320 }} /></Field>
            <button className="btn secondary" disabled={url === (d.webhookUrl ?? '')} onClick={() => run(async () => { setD(await api(`/partners/${id}`, { method: 'PATCH', body: { webhookUrl: url.trim() || null } })); }, 'Adresse des webhooks enregistrée')}>Enregistrer</button>
          </div>
          <div>
            <div className="grow"><div className="title">Secret de signature <code>{d.webhookSecret}</code></div><small className="muted">En-tête X-Leto-Signature : t=horodatage, v1=HMAC SHA-256 de « horodatage.corps »</small></div>
            <button className="btn plain" onClick={() => run(async () => {
              const r = await api<{ webhookSecret: string }>(`/partners/${id}/secret`, { method: 'POST' });
              setShown({ title: 'Nouveau secret de signature', value: r.webhookSecret, hint: 'Transmettez-le au partenaire : l’ancien ne signe plus les envois.' });
              load();
            })}>Nouveau secret</button>
            <button className="btn secondary" disabled={!d.webhookUrl} onClick={() => run(async () => {
              const r = await api<{ ok: boolean; code?: number; error?: string }>(`/partners/${id}/test`, { method: 'POST' });
              toast(r.ok ? `Test reçu par le partenaire (réponse ${r.code})` : `Test non reçu : ${r.error ?? r.code}`);
              load();
            })}>Envoyer un test</button>
          </div>
        </div>
        {d.webhooks.length > 0 && (
          <div className="table-scroll" style={{ marginTop: 8 }}>
            <table className="list">
              <thead><tr><th>Événement</th><th>Créé</th><th>Statut</th><th /></tr></thead>
              <tbody>
                {d.webhooks.slice(0, 20).map((w) => (
                  <tr key={w.id}>
                    <td><code>{w.event}</code></td>
                    <td>{dateTime(w.createdAt)}</td>
                    <td><Badge color={HOOK[w.status][1]}>{HOOK[w.status][0]}</Badge>{(w.lastError || w.responseCode) && <span className="sub">{w.attempts} essai(s){w.responseCode ? ` · réponse ${w.responseCode}` : ''}{w.lastError ? ` · ${w.lastError}` : ''}</span>}</td>
                    <td>{w.status !== 'SENT' && w.event !== 'ping' && <button className="btn plain" onClick={() => run(async () => { setD(await api(`/partners/${id}/webhooks/${w.id}/retry`, { method: 'POST' })); }, 'Envoi relancé')}>Relancer</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div>
        <div className="section-title">Dernières courses</div>
        {d.deliveries.length === 0 ? <Empty icon="box">Aucune course pour l’instant.</Empty> : (
          <div className="table-scroll">
            <table className="list">
              <thead><tr><th>Référence</th><th>Créée</th><th className="num">Colis</th><th className="num">Prix</th><th>Statut</th></tr></thead>
              <tbody>
                {d.deliveries.map((x) => (
                  <tr key={x.id}><td>{x.reference ?? <span className="muted">—</span>}</td><td>{dateTime(x.createdAt)}</td><td className="num">{x.stops}</td><td className="num">{formatMoney(x.price)}</td><td>{STATUS[x.status] ?? x.status}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <small className="muted">Compte client VITE : {d.phone ? formatPhone(d.phone) : '—'} · documentation : docs/partner-api.md (dépôt leto-backend).</small>

      {shown && (
        <Modal title={shown.title} subtitle={shown.hint} onClose={() => setShown(null)}
          footer={<><button className="btn secondary" onClick={() => { navigator.clipboard?.writeText(shown.value).then(() => toast('Copié')).catch(() => {}); }}>Copier</button><button className="btn" onClick={() => setShown(null)}>J’ai copié</button></>}>
          <code style={{ display: 'block', wordBreak: 'break-all', padding: 12, background: 'var(--fill)', borderRadius: 8 }}>{shown.value}</code>
        </Modal>
      )}
    </Sheet>
  );
}
