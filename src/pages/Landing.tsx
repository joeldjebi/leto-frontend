import { FormEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api, API_URL, dateTime, LANDING_URL, LandingContent, uploadApk } from '../api';
import { Badge, Card, Empty, Field, Icon, Modal, PageHeader, useToast } from '../ui';

type Texts = Omit<LandingContent, 'apk'>;
type Section = keyof Texts;
const MAX_FAQ = 12;
const MAX_APK_MB = 200;

/** Textes seuls (l'APK a son propre envoi) : sert à détecter les modifications non enregistrées */
const textsOf = (c: LandingContent): Texts => {
  const { apk: _apk, ...rest } = c;
  return rest;
};
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Champ texte avec compteur de caractères affiché à l'approche de la limite */
function TextField({ label, value, max, onChange, multiline, placeholder, hint, type = 'text' }: {
  label: string; value: string; max: number; onChange: (v: string) => void;
  multiline?: boolean; placeholder?: string; hint?: string; type?: string;
}) {
  const n = value.length;
  const near = n >= max * 0.8;
  // Zone de texte à la hauteur de son contenu (le texte entier reste visible)
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <label className="field lp-field">
      <span className="lp-label">
        {label}
        {near && <small className={`lp-count${n >= max ? ' full' : ''}`}>{n} / {max}</small>}
      </span>
      {multiline ? (
        <textarea ref={area} value={value} maxLength={max} rows={2} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type={type} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}

/** SA : contenu de la landing page (leto.performx.online) et application Android à télécharger */
export default function Landing() {
  const toast = useToast();
  const [saved, setSaved] = useState<LandingContent | null>(null);
  const [draft, setDraft] = useState<Texts | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const apply = (c: LandingContent) => { setSaved(c); setDraft(textsOf(c)); };
  useEffect(() => {
    api<{ content: LandingContent; defaults: LandingContent }>('/admin/landing')
      .then((r) => apply(r.content))
      .catch((e) => setError((e as Error).message));
  }, []);

  const dirty = !!saved && !!draft && !same(textsOf(saved), draft);
  // Avertissement si l'admin quitte la page avec des modifications non enregistrées
  useEffect(() => {
    if (!dirty) return;
    const on = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', on);
    return () => window.removeEventListener('beforeunload', on);
  }, [dirty]);

  const changed = (k: Section) => !!saved && !!draft && !same(saved[k], draft[k]);
  const set = <K extends Section>(k: K, v: Texts[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const save = async () => {
    if (!draft) return;
    const emptyFaq = draft.faq.filter((f) => !f.q.trim() || !f.a.trim()).length;
    setSaving(true);
    setError('');
    try {
      apply(await api<LandingContent>('/admin/landing', { method: 'PUT', body: draft }));
      toast(emptyFaq ? `Landing page enregistrée — ${emptyFaq} question(s) incomplète(s) retirée(s)` : 'Landing page enregistrée — en ligne immédiatement');
    } catch (e) {
      setError((e as Error).message);
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setError('');
    try {
      apply(await api<LandingContent>('/admin/landing/reset', { method: 'POST' }));
      toast('Textes d’origine rétablis');
    } catch (e) {
      setError((e as Error).message);
    }
    setConfirmReset(false);
  };

  const modified = (k: Section) => (changed(k) ? <Badge color="orange">Modifié</Badge> : undefined);

  return (
    <div className="lp">
      <PageHeader
        title="Landing page"
        subtitle="Textes du site public, coordonnées et application Android proposée au téléchargement."
        actions={<>
          <button className="btn secondary" disabled={!saved} onClick={() => setConfirmReset(true)}><Icon name="refresh" size={15} />Rétablir les textes d’origine</button>
          <a className="btn" href={LANDING_URL} target="_blank" rel="noreferrer"><Icon name="external" size={15} />Voir la landing page</a>
        </>}
      />
      <div className="stack">
        {error && <div className="alert error">{error}</div>}
        {!saved || !draft ? (
          !error && <Card><Empty icon="globe">Chargement…</Empty></Card>
        ) : (
          <>
            <ApkCard apk={saved.apk} onUploaded={(c) => { setSaved((s) => (s ? { ...s, apk: c.apk } : c)); }} />

            <Card title="Accueil" actions={modified('hero')}>
              <div className="card-pad lp-grid">
                <TextField label="Bandeau au-dessus du titre" value={draft.hero.badge} max={60} onChange={(v) => set('hero', { ...draft.hero, badge: v })} />
                <span className="lp-hide-mobile" />
                <TextField label="Titre · ligne 1" value={draft.hero.title1} max={60} onChange={(v) => set('hero', { ...draft.hero, title1: v })} />
                <TextField label="Titre · ligne 2 (en couleur)" value={draft.hero.title2} max={60} onChange={(v) => set('hero', { ...draft.hero, title2: v })} />
                <div className="lp-wide"><TextField label="Sous-titre" multiline value={draft.hero.subtitle} max={300} onChange={(v) => set('hero', { ...draft.hero, subtitle: v })} /></div>
                <TextField label="Bouton principal" value={draft.hero.ctaPrimary} max={40} onChange={(v) => set('hero', { ...draft.hero, ctaPrimary: v })} hint="Télécharge l’APK" />
                <TextField label="Bouton secondaire" value={draft.hero.ctaSecondary} max={40} onChange={(v) => set('hero', { ...draft.hero, ctaSecondary: v })} hint="Mène au formulaire des partenaires" />
              </div>
            </Card>

            <Card title="Comment ça marche (3 étapes)" actions={modified('steps')}>
              <div className="card-pad lp-blocks">
                {draft.steps.map((s, i) => (
                  <div key={i} className="lp-block">
                    <div className="lp-block-head"><span className="lp-num">{String(i + 1).padStart(2, '0')}</span>Étape {i + 1}</div>
                    <TextField label="Titre" value={s.title} max={80} onChange={(v) => set('steps', draft.steps.map((x, j) => (j === i ? { ...x, title: v } : x)))} />
                    <TextField label="Texte" multiline value={s.text} max={400} onChange={(v) => set('steps', draft.steps.map((x, j) => (j === i ? { ...x, text: v } : x)))} />
                  </div>
                ))}
              </div>
            </Card>

            <div className="lp-pair">
              <Card title="Tournées" actions={modified('tour')}>
                <div className="card-pad lp-col">
                  <TextField label="Titre" value={draft.tour.title} max={80} onChange={(v) => set('tour', { ...draft.tour, title: v })} />
                  <TextField label="Texte" multiline value={draft.tour.text} max={400} onChange={(v) => set('tour', { ...draft.tour, text: v })} />
                </div>
              </Card>
              <Card title="Tarifs" actions={modified('price')}>
                <div className="card-pad lp-col">
                  <div className="lp-grid">
                    <TextField label="Titre · grand chiffre" value={draft.price.title1} max={30} onChange={(v) => set('price', { ...draft.price, title1: v })} placeholder="2 200 F" />
                    <TextField label="Titre · suite" value={draft.price.title2} max={30} onChange={(v) => set('price', { ...draft.price, title2: v })} placeholder="maximum." />
                  </div>
                  <TextField label="Texte" multiline value={draft.price.text} max={300} onChange={(v) => set('price', { ...draft.price, text: v })} />
                  <small className="muted">Pensez à garder ce prix cohérent avec Tarifs et règles.</small>
                </div>
              </Card>
            </div>

            <Card title="Confiance (4 points)" actions={modified('trust')}>
              <div className="card-pad lp-col">
                <TextField label="Titre de la section" value={draft.trust.title} max={80} onChange={(v) => set('trust', { ...draft.trust, title: v })} />
                <div className="lp-blocks two">
                  {draft.trust.items.map((t, i) => {
                    const upd = (patch: Partial<typeof t>) => set('trust', { ...draft.trust, items: draft.trust.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
                    return (
                      <div key={i} className="lp-block">
                        <div className="lp-block-head"><span className="lp-num">{i + 1}</span>Point {i + 1}</div>
                        <TextField label="Titre" value={t.title} max={50} onChange={(v) => upd({ title: v })} />
                        <TextField label="Texte" multiline value={t.text} max={200} onChange={(v) => upd({ text: v })} />
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>

            <Card title="Partenaires" actions={modified('pros')}>
              <div className="card-pad lp-blocks two">
                <div className="lp-block">
                  <div className="lp-block-head"><Icon name="building" size={15} />Entreprises de livraison</div>
                  <TextField label="Titre" value={draft.pros.companyTitle} max={80} onChange={(v) => set('pros', { ...draft.pros, companyTitle: v })} />
                  <TextField label="Texte" multiline value={draft.pros.companyText} max={400} onChange={(v) => set('pros', { ...draft.pros, companyText: v })} />
                </div>
                <div className="lp-block">
                  <div className="lp-block-head"><Icon name="bike" size={15} />Livreurs indépendants</div>
                  <TextField label="Titre" value={draft.pros.driverTitle} max={80} onChange={(v) => set('pros', { ...draft.pros, driverTitle: v })} />
                  <TextField label="Texte" multiline value={draft.pros.driverText} max={400} onChange={(v) => set('pros', { ...draft.pros, driverText: v })} />
                </div>
              </div>
            </Card>

            <FaqCard faq={draft.faq} onChange={(v) => set('faq', v)} badge={modified('faq')} />

            <div className="lp-pair">
              <Card title="Appel final" actions={modified('final')}>
                <div className="card-pad lp-col">
                  <TextField label="Titre" value={draft.final.title} max={80} onChange={(v) => set('final', { ...draft.final, title: v })} />
                  <TextField label="Texte" multiline value={draft.final.text} max={200} onChange={(v) => set('final', { ...draft.final, text: v })} />
                </div>
              </Card>
              <Card title="Coordonnées" actions={modified('contact')}>
                <div className="card-pad lp-grid">
                  <TextField label="Téléphone" type="tel" value={draft.contact.phone} max={30} placeholder="07 00 00 00 00" onChange={(v) => set('contact', { ...draft.contact, phone: v })} />
                  <TextField label="WhatsApp" type="tel" value={draft.contact.whatsapp} max={30} placeholder="07 00 00 00 00" onChange={(v) => set('contact', { ...draft.contact, whatsapp: v })} />
                  <TextField label="E-mail" type="email" value={draft.contact.email} max={80} placeholder="contact@exemple.ci" onChange={(v) => set('contact', { ...draft.contact, email: v })} />
                  <TextField label="Adresse" value={draft.contact.address} max={120} onChange={(v) => set('contact', { ...draft.contact, address: v })} />
                  <small className="muted lp-wide">Un champ vide n’est pas affiché sur le site.</small>
                </div>
              </Card>
            </div>
          </>
        )}
      </div>

      {dirty && (
        <div className="cp-savebar" role="region" aria-label="Modifications non enregistrées">
          <span>Modifications non enregistrées</span>
          <button className="btn secondary" disabled={saving} onClick={() => saved && setDraft(textsOf(saved))}>Annuler</button>
          <button className="btn" disabled={saving} onClick={save}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
        </div>
      )}

      {confirmReset && (
        <Modal
          title="Rétablir les textes d’origine ?"
          subtitle="Tous les textes, la foire aux questions et les coordonnées reprennent leur version d’origine, en ligne immédiatement. L’application Android (APK) est conservée."
          onClose={() => setConfirmReset(false)}
          footer={<><button className="btn secondary" onClick={() => setConfirmReset(false)}>Annuler</button><button className="btn danger" onClick={reset}>Rétablir</button></>}
        />
      )}
    </div>
  );
}

/** Questions fréquentes : ajout, suppression, ordre */
function FaqCard({ faq, onChange, badge }: { faq: LandingContent['faq']; onChange: (v: LandingContent['faq']) => void; badge?: ReactNode }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...faq];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <Card title="Questions fréquentes" actions={<>{badge}<small className="muted">{faq.length} / {MAX_FAQ}</small></>}>
      <div className="card-pad lp-col">
        {faq.length === 0 && <Empty icon="book">Aucune question : la section est masquée sur le site.</Empty>}
        {faq.map((f, i) => (
          <div key={i} className="lp-faq">
            <div className="lp-faq-side">
              <span className="lp-num">{i + 1}</span>
              <div className="lp-order">
                <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Monter la question ${i + 1}`} title="Monter"><Icon name="up" size={14} /></button>
                <button type="button" disabled={i === faq.length - 1} onClick={() => move(i, 1)} aria-label={`Descendre la question ${i + 1}`} title="Descendre"><Icon name="down" size={14} /></button>
              </div>
            </div>
            <div className="lp-col grow">
              <TextField label="Question" value={f.q} max={120} onChange={(v) => onChange(faq.map((x, j) => (j === i ? { ...x, q: v } : x)))} />
              <TextField label="Réponse" multiline value={f.a} max={600} onChange={(v) => onChange(faq.map((x, j) => (j === i ? { ...x, a: v } : x)))} />
            </div>
            <button type="button" className="btn danger icon-btn" onClick={() => onChange(faq.filter((_, j) => j !== i))} title="Supprimer" aria-label={`Supprimer la question ${i + 1}`}>
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        <div className="lp-faq-add">
          <button type="button" className="btn secondary" disabled={faq.length >= MAX_FAQ} onClick={() => onChange([...faq, { q: '', a: '' }])}>
            <Icon name="plus" size={15} />Ajouter une question
          </button>
          <small className="muted">{faq.length >= MAX_FAQ ? '12 questions maximum.' : 'Une question sans réponse n’est pas enregistrée.'}</small>
        </div>
      </div>
    </Card>
  );
}

/** Application Android : version en ligne + envoi d'une nouvelle version avec progression */
function ApkCard({ apk, onUploaded }: { apk: LandingContent['apk']; onUploaded: (c: LandingContent) => void }) {
  const toast = useToast();
  const [version, setVersion] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Choisissez le fichier .apk');
    if (!file.name.toLowerCase().endsWith('.apk')) return setError('Fichier APK Android attendu (.apk)');
    if (file.size > MAX_APK_MB * 1024 * 1024) return setError(`Fichier trop lourd (${MAX_APK_MB} Mo maximum)`);
    if (!version.trim()) return setError('Indiquez le numéro de version (ex. : 1.0.3)');
    setError('');
    setProgress(0);
    try {
      const c = await uploadApk(file, version.trim(), setProgress);
      onUploaded(c);
      toast(`Version ${c.apk.version} en ligne — la landing page propose ce fichier`);
      setVersion('');
      setFile(null);
      if (input.current) input.current.value = '';
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <Card title="Application Android (APK)" actions={apk.url ? <Badge color="green">En ligne</Badge> : <Badge color="orange">Aucun fichier</Badge>}>
      <div className="rows">
        <div className="lp-apk">
          <span className="snd-icon"><Icon name="download" size={16} /></span>
          <div className="grow">
            {apk.url ? (
              <>
                <div className="title">LETO {apk.version ? `version ${apk.version}` : ''}</div>
                <small className="muted">
                  {apk.sizeMb == null ? 'Taille inconnue' : apk.sizeMb < 0.1 ? 'Moins de 0,1 Mo' : `${apk.sizeMb.toLocaleString('fr-FR')} Mo`}
                  {apk.updatedAt && ` · mis en ligne le ${dateTime(apk.updatedAt)}`}
                </small>
              </>
            ) : (
              <>
                <div className="title">Aucune application en ligne</div>
                <small className="muted">Le bouton « Télécharger l’app » de la landing page reste inactif tant qu’aucun APK n’est envoyé.</small>
              </>
            )}
          </div>
          {apk.url && <a className="btn secondary" href={API_URL + apk.url} download="LETO.apk"><Icon name="download" size={15} />Télécharger pour tester</a>}
        </div>
        <form className="snd-add" onSubmit={submit}>
          <div className="title">{apk.url ? 'Mettre en ligne une nouvelle version' : 'Mettre en ligne l’application'}</div>
          <div className="snd-add-fields lp-apk-fields">
            <Field label="Version">
              <input value={version} maxLength={20} disabled={busy} onChange={(e) => setVersion(e.target.value)} placeholder="Ex. : 1.0.3" />
            </Field>
            <Field label="Fichier .apk">
              <input ref={input} type="file" accept=".apk,application/vnd.android.package-archive" disabled={busy} onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(''); }} />
            </Field>
            <button className="btn" type="submit" disabled={busy}><Icon name="upload" size={15} />{busy ? `Envoi… ${progress} %` : 'Envoyer'}</button>
          </div>
          {busy && (
            <div className="lp-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ?? 0} aria-label="Envoi de l’APK">
              <span style={{ width: `${progress}%` }} />
            </div>
          )}
          <small className="muted">
            {file ? `${file.name} · ${(file.size / 1024 / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo · ` : ''}
            {MAX_APK_MB} Mo maximum. Le fichier remplace l’ancienne version et se télécharge sous le nom LETO.apk.
          </small>
          {error && <div className="alert error">{error}</div>}
        </form>
      </div>
    </Card>
  );
}
