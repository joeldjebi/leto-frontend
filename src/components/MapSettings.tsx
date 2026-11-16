import { useEffect, useState } from 'react';
import { api, dateTime } from '../api';
import { Badge, Card, Field, Icon, useToast } from '../ui';
import { MapStyle, refreshMapStyle } from './MapTiles';

type Provider = MapStyle['provider'];
interface MapAdmin {
  provider: Provider; cartoKey: string; maptilerKey: string; mapboxToken: string; googleKey: string;
  env: { cartoKey: boolean; maptilerKey: boolean; mapboxToken: boolean; googleKey: boolean };
  providers: { id: Provider; label: string }[];
  style?: MapStyle; updatedAt?: string;
}

/** Deux tuiles du Plateau (Abidjan) pour l'aperçu de chaque fond de carte */
const TILES = [[16018, 15898], [16019, 15898]] as const;
const preview = (p: Provider, f: MapAdmin): string | null => {
  const t = (tpl: string) => TILES.map(([x, y]) => tpl.replace('{s}', 'a').replace('{z}', '15').replace('{x}', String(x)).replace('{y}', String(y)));
  switch (p) {
    case 'osm': return t('https://tile.openstreetmap.org/{z}/{x}/{y}.png').join('|');
    case 'carto': return f.cartoKey ? t(`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?key=${f.cartoKey}`).join('|') : null;
    case 'maptiler': return f.maptilerKey ? t(`https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}@2x.png?key=${f.maptilerKey}`).join('|') : null;
    case 'mapbox': return f.mapboxToken ? t(`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token=${f.mapboxToken}`).join('|') : null;
    default: return null; // Google : jeton de session créé par le serveur, aperçu après enregistrement
  }
};

const INFO: Record<Provider, { note: string; key?: 'cartoKey' | 'maptilerKey' | 'mapboxToken' | 'googleKey'; keyLabel?: string; help?: string }> = {
  osm: { note: 'Gratuit, sans clé. Données communautaires.' },
  carto: { note: 'Rendu épuré, proche de Google. Clé gratuite (1 million de tuiles par mois en usage commercial).', key: 'cartoKey', keyLabel: 'Clé Carto Basemaps', help: 'carto.com/basemaps/apikey (gratuit, sans compte)' },
  maptiler: { note: 'Moderne et net. Offre gratuite, puis payant.', key: 'maptilerKey', keyLabel: 'Clé MapTiler', help: 'cloud.maptiler.com → API keys' },
  mapbox: { note: 'Très soigné. Gratuit jusqu’à un certain volume.', key: 'mapboxToken', keyLabel: 'Jeton public Mapbox (pk.…)', help: 'account.mapbox.com → Access tokens' },
  google: { note: 'Les données les plus complètes à Abidjan. Payant au-delà du quota gratuit de l’API Map Tiles.', key: 'googleKey', keyLabel: 'Clé Google (API « Map Tiles » activée)', help: 'console.cloud.google.com → API Map Tiles' },
};

/** SA : choix du fond de carte de l'app et du back-office */
export default function MapSettings() {
  const toast = useToast();
  const [saved, setSaved] = useState<MapAdmin | null>(null);
  const [form, setForm] = useState<MapAdmin | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<MapAdmin>('/admin/map').then((m) => { setSaved(m); setForm(m); }); }, []);
  if (!form || !saved) return null;

  const dirty = (['provider', 'cartoKey', 'maptilerKey', 'mapboxToken', 'googleKey'] as const).some((k) => form[k] !== saved[k]);
  const info = INFO[form.provider];
  const hasKey = (k?: keyof MapAdmin['env']) => !k || !!form[k] || form.env[k];

  const save = async () => {
    setError('');
    setBusy(true);
    try {
      const m = await api<MapAdmin>('/admin/map', {
        method: 'PUT',
        body: { provider: form.provider, cartoKey: form.cartoKey, maptilerKey: form.maptilerKey, mapboxToken: form.mapboxToken, googleKey: form.googleKey },
      });
      setSaved(m);
      setForm(m);
      if (m.style) refreshMapStyle(m.style);
      toast(`Carte : ${m.style?.label ?? form.provider} — appliquée à l’app et au back-office`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Fond de carte"
      actions={<>
        <button className="btn secondary" disabled={!dirty} onClick={() => setForm(saved)}>Annuler</button>
        <button className="btn" disabled={!dirty || busy} onClick={save}>{busy ? 'Vérification…' : 'Appliquer'}</button>
      </>}
      pad
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Utilisé par l’app (clients et livreurs) et par ce back-office. Le changement s’applique à l’ouverture suivante de l’app.
      </p>
      <div className="map-choices">
        {form.providers.map((p) => {
          const src = preview(p.id, form);
          const on = form.provider === p.id;
          const k = INFO[p.id].key;
          return (
            <button key={p.id} className={`map-choice${on ? ' on' : ''}`} onClick={() => setForm({ ...form, provider: p.id })} aria-pressed={on}>
              <div className="map-thumb">
                {src ? src.split('|').map((u) => <img key={u} src={u} alt="" loading="lazy" />) : <span className="muted">{p.id === 'google' ? 'Aperçu après activation' : 'Clé requise'}</span>}
              </div>
              <div className="map-choice-label">
                <strong>{p.label}</strong>
                {saved.provider === p.id ? <Badge color="green">Actuelle</Badge> : k && !hasKey(k) ? <Badge>Clé requise</Badge> : null}
              </div>
            </button>
          );
        })}
      </div>
      <div className="stack" style={{ gap: 12, marginTop: 16 }}>
        <div className="muted">{info.note}</div>
        {info.key && (
          <Field
            label={info.keyLabel!}
            hint={form.env[info.key] && !form[info.key] ? 'Une clé est déjà définie dans le fichier .env du serveur (laisser vide pour l’utiliser)' : `À créer sur ${info.help}`}
          >
            <input value={form[info.key]} onChange={(e) => setForm({ ...form, [info.key!]: e.target.value.trim() })} autoComplete="off" spellCheck={false} placeholder="Coller la clé ici" />
          </Field>
        )}
        {error && <div className="alert error"><Icon name="alert" size={14} /> {error}</div>}
        {saved.updatedAt && <small className="muted">Modifié le {dateTime(saved.updatedAt)}</small>}
      </div>
    </Card>
  );
}
