import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, NotificationSound, SoundEvent, soundSrc, SoundsConfig, uploadSound } from '../api';
import { Badge, Card, Empty, Field, Icon, Modal, PageHeader, useToast } from '../ui';

const EVENTS: SoundEvent[] = ['NEW_ORDER', 'ASSIGNED', 'CANCELLED', 'UPDATED', 'CLIENT_UPDATE'];
const RECIPIENTS: Record<SoundEvent, string> = {
  NEW_ORDER: 'Livreurs en ligne à moins de 10 km',
  ASSIGNED: 'Le livreur affecté (et proposition acceptée)',
  CANCELLED: 'Le livreur (et le client si LETO annule)',
  UPDATED: 'Le livreur',
  CLIENT_UPDATE: 'Le client (livreur trouvé, colis récupérés, livré, nouvelle proposition)',
};

/** Lecture d'un seul son à la fois (aperçu) */
function usePlayer() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const stop = () => { audio.current?.pause(); audio.current = null; setPlaying(null); };
  useEffect(() => stop, []);
  const toggle = (s: NotificationSound | undefined, toast: (m: string) => void) => {
    if (!s) return;
    if (playing === s.id) return stop();
    stop();
    const a = new Audio(soundSrc(s));
    audio.current = a;
    a.onended = () => { if (audio.current === a) { audio.current = null; setPlaying(null); } };
    setPlaying(s.id);
    a.play().catch(() => { if (audio.current === a) stop(); toast('Lecture du son impossible'); });
  };
  return { playing, toggle };
}

function PlayButton({ sound, playing, onClick }: { sound?: NotificationSound; playing: boolean; onClick: () => void }) {
  return (
    <button className="btn secondary" disabled={!sound} onClick={onClick} aria-label={`${playing ? 'Arrêter' : 'Écouter'}${sound ? ` : ${sound.name}` : ''}`}>
      <Icon name={playing ? 'stop' : 'play'} size={14} />{playing ? 'Arrêter' : 'Écouter'}
    </button>
  );
}

/** SA : sons joués par l'app avec ses notifications */
export default function Sounds() {
  const toast = useToast();
  const [cfg, setCfg] = useState<SoundsConfig | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [remove, setRemove] = useState<NotificationSound | null>(null);
  const { playing, toggle } = usePlayer();
  const play = (s?: NotificationSound) => toggle(s, toast);

  useEffect(() => { api<SoundsConfig>('/notifications/sounds').then(setCfg).catch((e) => setError((e as Error).message)); }, []);

  const byId = (id: string) => cfg?.sounds.find((s) => s.id === id);

  const choose = async (ev: SoundEvent, id: string) => {
    setBusy(ev);
    setError('');
    try {
      const next = await api<SoundsConfig>('/notifications/sounds/events', { method: 'PUT', body: { [ev]: id } });
      setCfg(next);
      toast(`${next.labels[ev]} : « ${next.sounds.find((s) => s.id === id)?.name ?? id} »`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const confirmRemove = async () => {
    if (!remove) return;
    try {
      setCfg(await api<SoundsConfig>(`/notifications/sounds/${encodeURIComponent(remove.id)}`, { method: 'DELETE' }));
      toast(`Son « ${remove.name} » supprimé`);
    } catch (e) {
      setError((e as Error).message);
    }
    setRemove(null);
  };

  const usedBy = (id: string) => (cfg ? EVENTS.filter((e) => cfg.events[e] === id) : []);
  const builtin = cfg?.sounds.filter((s) => s.builtin) ?? [];
  const custom = cfg?.sounds.filter((s) => !s.builtin) ?? [];

  return (
    <>
      <PageHeader
        title="Sons des notifications"
        subtitle="L’app joue ces sons avec ses notifications (nouvelle course, affectation, annulation…). Les 3 sons LETO sont intégrés à l’app et toujours disponibles."
      />
      <div className="stack">
        {error && <div className="alert error">{error}</div>}

        <Card title="Son de chaque événement">
          {!cfg ? <Empty icon="bell">Chargement…</Empty> : (
            <div className="rows">
              {EVENTS.map((ev) => (
                <div key={ev} className="snd-event">
                  <div className="grow">
                    <div className="title">{cfg.labels[ev] ?? ev}</div>
                    <small className="muted">Reçu par : {RECIPIENTS[ev].charAt(0).toLowerCase() + RECIPIENTS[ev].slice(1)}</small>
                  </div>
                  <div className="snd-controls">
                    <select value={cfg.events[ev]} disabled={busy === ev} onChange={(e) => choose(ev, e.target.value)} aria-label={`Son : ${cfg.labels[ev] ?? ev}`}>
                      {!byId(cfg.events[ev]) && <option value={cfg.events[ev]}>{cfg.events[ev]}</option>}
                      <optgroup label="Sons LETO (intégrés)">
                        {builtin.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </optgroup>
                      {custom.length > 0 && (
                        <optgroup label="Sons ajoutés">
                          {custom.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </optgroup>
                      )}
                    </select>
                    <PlayButton sound={byId(cfg.events[ev])} playing={playing === cfg.events[ev]} onClick={() => play(byId(cfg.events[ev]))} />
                  </div>
                </div>
              ))}
              <div>
                <Icon name="check" size={16} className="muted" />
                <small className="muted grow">Chaque choix est enregistré aussitôt. Les téléphones appliquent le nouveau son à la prochaine notification.</small>
              </div>
            </div>
          )}
        </Card>

        <Card title="Bibliothèque de sons" actions={cfg && <small className="muted">{cfg.sounds.length} son(s)</small>}>
          {!cfg ? <Empty icon="bell">Chargement…</Empty> : (
            <div className="rows">
              {[...builtin, ...custom].map((s) => {
                const used = usedBy(s.id);
                return (
                  <div key={s.id} className="snd-item">
                    <span className={`snd-icon${s.builtin ? '' : ' custom'}`}><Icon name="bell" size={16} /></span>
                    <div className="grow">
                      <div className="title snd-name">
                        <span>{s.name}</span>
                        {s.builtin ? <Badge color="accent">Intégré à l’app</Badge> : <Badge color="blue">Ajouté</Badge>}
                      </div>
                      <small className="muted">{used.length ? `Utilisé pour : ${used.map((e) => cfg.labels[e] ?? e).join(', ')}` : 'Non utilisé'}</small>
                    </div>
                    <div className="snd-controls">
                      <PlayButton sound={s} playing={playing === s.id} onClick={() => play(s)} />
                      {s.builtin ? <span className="snd-spacer" aria-hidden="true" /> : (
                        <button className="btn danger icon-btn" onClick={() => setRemove(s)} title="Supprimer" aria-label={`Supprimer : ${s.name}`}>
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              <AddSound onAdded={(next, name) => { setCfg(next); toast(`Son « ${name} » ajouté`); }} />
            </div>
          )}
        </Card>
      </div>

      {remove && (
        <Modal
          title={`Supprimer « ${remove.name} » ?`}
          subtitle={usedBy(remove.id).length
            ? `Il est utilisé pour : ${usedBy(remove.id).map((e) => cfg?.labels[e] ?? e).join(', ')}. Ces événements reprendront leur son LETO par défaut.`
            : 'Le son sera retiré de la bibliothèque et des téléphones.'}
          onClose={() => setRemove(null)}
          footer={<><button className="btn secondary" onClick={() => setRemove(null)}>Annuler</button><button className="btn danger" onClick={confirmRemove}>Supprimer</button></>}
        />
      )}
    </>
  );
}

/** Formulaire d'ajout : nom + fichier WAV */
function AddSound({ onAdded }: { onAdded: (cfg: SoundsConfig, name: string) => void }) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Donnez un nom au son');
    if (!file) return setError('Choisissez un fichier WAV');
    setBusy(true);
    setError('');
    try {
      const next = await uploadSound(name.trim(), file);
      onAdded(next, name.trim());
      setName('');
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="snd-add" onSubmit={submit}>
      <div className="title">Ajouter un son</div>
      <div className="snd-add-fields">
        <Field label="Nom">
          <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Klaxon court" />
        </Field>
        <Field label="Fichier">
          <input ref={input} type="file" accept=".wav,audio/wav" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </Field>
        <button className="btn" type="submit" disabled={busy}><Icon name="upload" size={15} />{busy ? 'Envoi…' : 'Ajouter'}</button>
      </div>
      <small className="muted">WAV uniquement, 10 secondes maximum (accepté par Android et iPhone). Les téléphones le téléchargent automatiquement.</small>
      {error && <div className="alert error">{error}</div>}
    </form>
  );
}
