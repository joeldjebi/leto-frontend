import { useEffect, useState } from 'react';
import { api, errText } from '../api';
import { Card, Icon, PageHeader, useToast } from '../ui';

export interface CancelReasonsConfig { client: string[]; driver: string[] }
type Side = keyof CancelReasonsConfig;

const SIDES: { key: Side; title: string; hint: string }[] = [
  { key: 'client', title: 'Côté client', hint: 'Proposés au client quand il annule une commande ou un arrêt. Il peut toujours écrire un autre motif.' },
  { key: 'driver', title: 'Côté livreur et entreprise', hint: 'Proposés au livreur (et à son entreprise) quand il demande l’annulation d’une livraison.' },
];
const MAX = 15;
const LEN = 80;

/** Liste modifiable d'un côté */
function ReasonList({ items, onChange }: { items: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (!v || items.some((x) => x.toLowerCase() === v.toLowerCase())) return setDraft('');
    onChange([...items, v]);
    setDraft('');
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="cr-list">
      {items.map((r, i) => (
        <div className="cr-row" key={i}>
          <span className="cr-num">{i + 1}</span>
          <input value={r} maxLength={LEN} aria-label={`Motif ${i + 1}`} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))} />
          <button className="btn secondary icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter"><Icon name="up" size={14} /></button>
          <button className="btn secondary icon" disabled={i === items.length - 1} onClick={() => move(i, 1)} aria-label="Descendre"><Icon name="down" size={14} /></button>
          <button className="btn secondary icon" disabled={items.length <= 1} onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label={`Supprimer « ${r} »`}><Icon name="trash" size={14} /></button>
        </div>
      ))}
      {items.length < MAX && (
        <form className="cr-row" onSubmit={(e) => { e.preventDefault(); add(); }}>
          <span className="cr-num"><Icon name="plus" size={14} /></span>
          <input value={draft} maxLength={LEN} placeholder="Ajouter un motif" onChange={(e) => setDraft(e.target.value)} />
          <button className="btn secondary" type="submit" disabled={!draft.trim()}>Ajouter</button>
        </form>
      )}
    </div>
  );
}

/** SA : motifs d'annulation proposés dans l'app */
export default function CancelReasons() {
  const toast = useToast();
  const [saved, setSaved] = useState<CancelReasonsConfig | null>(null);
  const [draft, setDraft] = useState<CancelReasonsConfig | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<CancelReasonsConfig>('/cancel-reasons').then((c) => { setSaved(c); setDraft(c); }).catch((e) => setError(errText(e)));
  }, []);

  const dirty = !!saved && !!draft && JSON.stringify(saved) !== JSON.stringify(draft);
  const invalid = !!draft && SIDES.some((s) => draft[s.key].filter((x) => x.trim()).length === 0);

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    setError('');
    try {
      const clean = { client: draft.client.map((x) => x.trim()).filter(Boolean), driver: draft.driver.map((x) => x.trim()).filter(Boolean) };
      const next = await api<CancelReasonsConfig>('/admin/cancel-reasons', { method: 'PUT', body: clean });
      setSaved(next);
      setDraft(next);
      toast('Motifs enregistrés — visibles tout de suite dans l’app');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Motifs d’annulation"
        subtitle="Les choix proposés dans l’app quand une commande est annulée. Le motif choisi apparaît dans la fiche de la course."
        actions={
          <>
            {dirty && <button className="btn secondary" onClick={() => setDraft(saved)} disabled={busy}>Annuler les modifications</button>}
            <button className="btn" onClick={save} disabled={!dirty || invalid || busy}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
          </>
        }
      />
      {error && <div className="alert error">{error}</div>}
      {!draft ? (
        !error && <p className="muted">Chargement…</p>
      ) : (
        <div className="lp-pair">
          {SIDES.map((s) => (
            <Card key={s.key} title={s.title} actions={<span className="muted">{draft[s.key].length} / {MAX}</span>}>
              <div className="card-pad lp-col">
                <p className="muted" style={{ margin: 0 }}>{s.hint}</p>
                <ReasonList items={draft[s.key]} onChange={(v) => setDraft({ ...draft, [s.key]: v })} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
