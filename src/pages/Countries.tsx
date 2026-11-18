import { ChangeEvent, useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Country, flagOf, groupDigits, loadCountries, nationalDigits } from '../countries';
import { Badge, Card, Empty, Field, Icon, Modal, PageHeader, Switch, useToast } from '../ui';

type Form = {
  iso: string; name: string; dialCode: string; phoneLength: string; trunkPrefix: string; phoneExample: string;
  currencyCode: string; currencySymbol: string; currencyName: string; currencyDecimals: string; sortOrder: string; active: boolean;
};
const EMPTY: Form = {
  iso: '', name: '', dialCode: '', phoneLength: '', trunkPrefix: '', phoneExample: '',
  currencyCode: '', currencySymbol: '', currencyName: '', currencyDecimals: '0', sortOrder: '50', active: false,
};
const toForm = (c: Country): Form => ({
  iso: c.iso, name: c.name, dialCode: c.dialCode, phoneLength: String(c.phoneLength), trunkPrefix: c.trunkPrefix ?? '',
  phoneExample: c.phoneExample ?? '', currencyCode: c.currencyCode, currencySymbol: c.currencySymbol, currencyName: c.currencyName ?? '',
  currencyDecimals: String(c.currencyDecimals ?? 0), sortOrder: String(c.sortOrder ?? 0), active: c.active,
});

/** Mêmes règles que l'API, avec un message par champ */
function validate(f: Form): Partial<Record<keyof Form, string>> {
  const e: Partial<Record<keyof Form, string>> = {};
  if (!/^[A-Za-z]{2}$/.test(f.iso)) e.iso = 'Code ISO : 2 lettres (ex. CI)';
  if (f.name.trim().length < 2 || f.name.trim().length > 60) e.name = 'Nom : 2 à 60 caractères';
  if (!/^\d{1,4}$/.test(f.dialCode)) e.dialCode = 'Indicatif : 1 à 4 chiffres, sans « + »';
  const len = Number(f.phoneLength);
  if (!/^\d+$/.test(f.phoneLength) || len < 4 || len > 14) e.phoneLength = 'Longueur du numéro : 4 à 14 chiffres';
  if (!/^\d{0,2}$/.test(f.trunkPrefix)) e.trunkPrefix = 'Préfixe national : 0 à 2 chiffres';
  if (!/^[\d ]{0,20}$/.test(f.phoneExample)) e.phoneExample = 'Exemple : chiffres et espaces uniquement';
  else if (f.phoneExample.trim() && !e.phoneLength) {
    const d = f.phoneExample.replace(/\D/g, '');
    const ok = d.length === len || (!!f.trunkPrefix && d.length === len + f.trunkPrefix.length && d.startsWith(f.trunkPrefix));
    if (!ok) e.phoneExample = `L’exemple doit compter ${len} chiffres${f.trunkPrefix ? ` (ou ${f.trunkPrefix} + ${len})` : ''}`;
  }
  if (!/^[A-Za-z]{3}$/.test(f.currencyCode)) e.currencyCode = 'Code devise : 3 lettres (ex. XOF)';
  if (f.currencySymbol.trim().length < 1 || f.currencySymbol.trim().length > 8) e.currencySymbol = 'Symbole : 1 à 8 caractères';
  if (!/^[0-3]$/.test(f.currencyDecimals)) e.currencyDecimals = '0 à 3';
  if (!/^\d{1,4}$/.test(f.sortOrder)) e.sortOrder = '0 à 9999';
  return e;
}

/** Aperçu d'un montant dans la devise saisie */
const sample = (symbol: string, decimals: number) =>
  `${(1500).toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${symbol || '?'}`;

/** SA : pays (indicatifs, format des numéros, devises) et pays où LETO livre */
export default function Countries() {
  const toast = useToast();
  const [list, setList] = useState<Country[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Country | 'new' | null>(null);
  const [remove, setRemove] = useState<Country | null>(null);
  const [operate, setOperate] = useState<Country | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api<{ countries: Country[] }>('/admin/countries').then((r) => setList(r.countries)).catch((e) => setError((e as Error).message)), []);
  useEffect(() => {
    load();
    window.addEventListener('countries:changed', load);
    return () => window.removeEventListener('countries:changed', load);
  }, [load]);
  const refresh = () => Promise.all([load(), loadCountries()]);

  const patch = async (c: Country, body: Partial<Country>, done: string) => {
    setError('');
    try {
      await api(`/admin/countries/${c.id}`, { method: 'PATCH', body });
      toast(done);
    } catch (e) {
      setError((e as Error).message);
    }
    await refresh();
  };

  const operating = list?.find((c) => c.operating);
  const activeCount = list?.filter((c) => c.active).length ?? 0;

  return (
    <>
      <PageHeader
        title="Pays"
        subtitle="Indicatifs téléphoniques, format des numéros et devises."
        actions={<button className="btn" onClick={() => setEditing('new')}><Icon name="plus" size={15} />Ajouter un pays</button>}
      />
      {error && <div className="alert error" style={{ marginBottom: 14 }}>{error}</div>}
      {operating && (
        <div className="cty-summary">
          <span className="cty-flag big" aria-hidden="true">{operating.flag}</span>
          <div className="grow">
            <strong>LETO livre en {operating.name}</strong>
            <small className="muted">Prix, commissions et montants en {operating.currencyName || operating.currencyCode} ({operating.currencyCode} · {operating.currencySymbol})</small>
          </div>
          <small className="muted cty-hint"><Icon name="phone" size={13} />Seuls les pays actifs ({activeCount}) apparaissent dans les sélecteurs de téléphone.</small>
        </div>
      )}
      <Card>
        {!list ? <p className="muted card-pad" style={{ margin: 0 }}>Chargement…</p> : list.length === 0 ? <Empty icon="flag">Aucun pays</Empty> : (
          <div className="table-scroll">
            <table className="list cty-table">
              <thead><tr><th>Pays</th><th>Indicatif</th><th>Format du numéro</th><th>Devise</th><th>Actif</th><th>Livraison</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id} className={c.active ? '' : 'cty-off'}>
                    <td className="cty-country">
                      <span className="cty-flag" aria-hidden="true">{c.flag}</span>
                      <div><strong>{c.name}</strong><span className="sub">{c.iso}</span></div>
                    </td>
                    <td className="cty-dial" data-label="Indicatif"><span className="tabular">+{c.dialCode}</span></td>
                    <td className="cty-format" data-label="Numéro">
                      {c.phoneLength} chiffres{c.trunkPrefix ? ` (+ ${c.trunkPrefix} national)` : ''}
                      {c.phoneExample && <span className="sub tabular">+{c.dialCode} {groupDigits(c, nationalDigits(c, c.phoneExample))}</span>}
                    </td>
                    <td className="cty-currency" data-label="Devise">
                      {c.currencyCode} · {c.currencySymbol}
                      <span className="sub">{c.currencyDecimals} décimale(s){c.currencyName ? ` · ${c.currencyName}` : ''}</span>
                    </td>
                    <td className="cty-active" data-label="Actif">
                      <Switch checked={c.active} label={c.active ? `Désactiver ${c.name}` : `Activer ${c.name}`}
                        onChange={(v) => patch(c, { active: v }, v ? `${c.name} activé — proposé dans les sélecteurs de téléphone` : `${c.name} désactivé`)} />
                    </td>
                    <td className="cty-operating" data-label="Livraison">
                      {c.operating
                        ? <Badge color="accent"><Icon name="check" size={12} />Pays où LETO livre</Badge>
                        : <button className="btn plain" onClick={() => setOperate(c)}>Livrer ici</button>}
                    </td>
                    <td className="cty-actions">
                      <button className="btn secondary icon-btn" onClick={() => setEditing(c)} title="Modifier" aria-label={`Modifier ${c.name}`}><Icon name="edit" size={15} /></button>
                      <button className="btn danger icon-btn" onClick={() => setRemove(c)} disabled={c.operating} title={c.operating ? 'Le pays où LETO livre ne peut pas être supprimé' : 'Supprimer'} aria-label={`Supprimer ${c.name}`}><Icon name="trash" size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <CountryForm country={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, isNew) => { setEditing(null); toast(isNew ? `${name} ajouté` : `${name} enregistré`); refresh(); }} />
      )}

      {operate && (
        <Modal
          title={`LETO livre en ${operate.name} ?`}
          subtitle={<>
            Les prix, commissions, abonnements et montants du back-office et des apps passeront en <strong>{operate.currencyName || operate.currencyCode}</strong> ({sample(operate.currencySymbol, operate.currencyDecimals)}).
            {' '}Les numéros saisis sans indicatif seront lus comme des numéros de ce pays. Les courses déjà créées gardent leur devise.
            {!operate.active && ' Le pays sera aussi activé.'}
          </>}
          onClose={() => setOperate(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setOperate(null)} disabled={busy}>Annuler</button>
            <button className="btn" disabled={busy} onClick={async () => {
              setBusy(true);
              await patch(operate, operate.active ? { operating: true } : { operating: true, active: true }, `LETO livre désormais en ${operate.name}`);
              setBusy(false);
              setOperate(null);
            }}>Confirmer</button>
          </>}
        />
      )}

      {remove && (
        <Modal
          title={`Supprimer ${remove.name} ?`}
          subtitle="Impossible si des comptes ou des courses utilisent déjà ses numéros : désactivez-le plutôt."
          onClose={() => setRemove(null)}
          footer={<>
            <button className="btn secondary" onClick={() => setRemove(null)} disabled={busy}>Annuler</button>
            <button className="btn danger" disabled={busy} onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await api(`/admin/countries/${remove.id}`, { method: 'DELETE' });
                toast(`${remove.name} supprimé`);
              } catch (e) {
                setError((e as Error).message);
              }
              setBusy(false);
              setRemove(null);
              refresh();
            }}>Supprimer</button>
          </>}
        />
      )}
    </>
  );
}

/** Ajout / modification d'un pays */
function CountryForm({ country, onClose, onSaved }: { country: Country | null; onClose: () => void; onSaved: (name: string, isNew: boolean) => void }) {
  const [f, setF] = useState<Form>(country ? toForm(country) : EMPTY);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const errors = validate(f);
  const err = (k: keyof Form) => (tried || f[k] !== EMPTY[k] ? errors[k] : undefined);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF({ ...f, [k]: v });
  const digitsOnly = (k: keyof Form, max: number) => (e: ChangeEvent<HTMLInputElement>) => set(k, e.target.value.replace(/\D/g, '').slice(0, max) as never);

  const submit = async () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setError('');
    const body = {
      iso: f.iso.toUpperCase(), name: f.name.trim(), dialCode: f.dialCode, phoneLength: Number(f.phoneLength),
      trunkPrefix: f.trunkPrefix, phoneExample: f.phoneExample.trim().replace(/\s+/g, ' '),
      currencyCode: f.currencyCode.toUpperCase(), currencySymbol: f.currencySymbol.trim(), currencyName: f.currencyName.trim(),
      currencyDecimals: Number(f.currencyDecimals), sortOrder: Number(f.sortOrder),
      ...(country ? {} : { active: f.active }),
    };
    try {
      if (country) await api(`/admin/countries/${country.id}`, { method: 'PATCH', body });
      else await api('/admin/countries', { method: 'POST', body });
      onSaved(body.name, !country);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const len = Number(f.phoneLength) || 0;
  return (
    <Modal
      title={country ? `Modifier ${country.name}` : 'Ajouter un pays'}
      subtitle={country ? 'L’indicatif et la longueur ne peuvent plus changer une fois que des comptes utilisent ces numéros.' : 'Le pays est créé inactif sauf si vous l’activez : il n’apparaîtra dans les sélecteurs qu’une fois actif.'}
      onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose} disabled={busy}>Annuler</button><button className="btn" onClick={submit} disabled={busy}>{busy ? 'Enregistrement…' : country ? 'Enregistrer' : 'Ajouter'}</button></>}
    >
      <div className="cty-form">
        <div className="cty-form-head">
          <span className="cty-flag big" aria-hidden="true">{/^[A-Za-z]{2}$/.test(f.iso) ? flagOf(f.iso) : <Icon name="flag" size={22} />}</span>
          <div className="cty-grid cty-grid-head">
            <Field label="Code ISO" error={err('iso')}>
              <input value={f.iso} maxLength={2} placeholder="SN" autoComplete="off" style={{ textTransform: 'uppercase' }} onChange={(e) => set('iso', e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())} />
            </Field>
            <Field label="Nom" error={err('name')}>
              <input value={f.name} maxLength={60} placeholder="Sénégal" autoComplete="off" onChange={(e) => set('name', e.target.value)} />
            </Field>
          </div>
        </div>

        <div className="section-title cty-section">Téléphone</div>
        <div className="cty-grid">
          <Field label="Indicatif" error={err('dialCode')}>
            <div className="cty-prefixed"><span>+</span><input inputMode="numeric" value={f.dialCode} placeholder="221" onChange={digitsOnly('dialCode', 4)} /></div>
          </Field>
          <Field label="Chiffres après l’indicatif" error={err('phoneLength')}>
            <input inputMode="numeric" value={f.phoneLength} placeholder="9" onChange={digitsOnly('phoneLength', 2)} />
          </Field>
          <Field label="Préfixe national" error={err('trunkPrefix')} hint="Ex. 0 au Ghana ; vide en Côte d’Ivoire">
            <input inputMode="numeric" value={f.trunkPrefix} placeholder="Aucun" onChange={digitsOnly('trunkPrefix', 2)} />
          </Field>
          <Field label="Exemple (format local)" error={err('phoneExample')} hint={len ? `${len} chiffres, les espaces donnent le regroupement` : 'Les espaces donnent le regroupement'}>
            <input inputMode="numeric" value={f.phoneExample} placeholder="77 123 45 67" onChange={(e) => set('phoneExample', e.target.value.replace(/[^\d ]/g, '').slice(0, 20))} />
          </Field>
        </div>

        <div className="section-title cty-section">Devise</div>
        <div className="cty-grid">
          <Field label="Code" error={err('currencyCode')}>
            <input value={f.currencyCode} maxLength={3} placeholder="XOF" autoComplete="off" onChange={(e) => set('currencyCode', e.target.value.replace(/[^A-Za-z]/g, '').toUpperCase())} />
          </Field>
          <Field label="Symbole" error={err('currencySymbol')}>
            <input value={f.currencySymbol} maxLength={8} placeholder="F" autoComplete="off" onChange={(e) => set('currencySymbol', e.target.value)} />
          </Field>
          <Field label="Nom de la devise">
            <input value={f.currencyName} maxLength={40} placeholder="Franc CFA (BCEAO)" autoComplete="off" onChange={(e) => set('currencyName', e.target.value)} />
          </Field>
          <Field label="Décimales" error={err('currencyDecimals')} hint={!errors.currencyDecimals && !errors.currencySymbol ? `Aperçu : ${sample(f.currencySymbol.trim(), Number(f.currencyDecimals))}` : undefined}>
            <select value={f.currencyDecimals} onChange={(e) => set('currencyDecimals', e.target.value)}>
              {['0', '1', '2', '3'].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>

        <div className="cty-grid">
          <Field label="Ordre d’affichage" error={err('sortOrder')} hint="Plus petit = plus haut dans les listes">
            <input inputMode="numeric" value={f.sortOrder} onChange={digitsOnly('sortOrder', 4)} />
          </Field>
          {!country && (
            <div className="cty-switch">
              <Switch checked={f.active} onChange={(v) => set('active', v)} label="Actif" />
              <span>Actif dès la création<small className="muted">Proposé dans les sélecteurs de téléphone</small></span>
            </div>
          )}
        </div>
        {error && <div className="alert error">{error}</div>}
      </div>
    </Modal>
  );
}
