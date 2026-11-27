import { useEffect, useState } from 'react';
import { api, BillingConfig, CommissionType, MobileMoneyAccount, errText } from '../api';
import { formatMoney, currencySymbol } from '../countries';
import { Card, Icon, Segmented, Switch, useToast } from '../ui';

/** SA : abonnement annuel, commission par défaut, comptes Mobile Money de VITE */
export default function BillingSettings() {
  const toast = useToast();
  const [saved, setSaved] = useState<BillingConfig | null>(null);
  const [cfg, setCfg] = useState<BillingConfig | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<BillingConfig>('/billing/config').then((c) => { setSaved(c); setCfg(c); }); }, []);
  if (!cfg || !saved) return null;

  const dirty = JSON.stringify(cfg) !== JSON.stringify(saved);
  const setAccount = (i: number, patch: Partial<MobileMoneyAccount>) =>
    setCfg({ ...cfg, accounts: cfg.accounts.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const sample = 3000;
  const example = cfg.commissionType === 'PERCENT' ? Math.round((sample * cfg.commissionValue) / 100) : cfg.commissionValue;

  const save = async () => {
    setError('');
    try {
      const c = await api<BillingConfig>('/billing/config', {
        method: 'PUT',
        body: { subscriptionEnabled: cfg.subscriptionEnabled, trialDays: cfg.trialDays, subscriptionFee: cfg.subscriptionFee, commissionType: cfg.commissionType, commissionValue: cfg.commissionValue, accounts: cfg.accounts },
      });
      setSaved(c);
      setCfg(c);
      toast('Facturation enregistrée');
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <Card
      title="Facturation des entreprises"
      actions={<>
        <button className="btn secondary" disabled={!dirty} onClick={() => setCfg(saved)}>Annuler</button>
        <button className="btn" disabled={!dirty} onClick={save}>Enregistrer</button>
      </>}
      pad
    >
      {error && <div className="alert error" style={{ marginBottom: 12 }}>{error}</div>}
      <div className="grid grid-2">
        <div className="rows" style={{ margin: '0 -20px' }}>
          <div>
            <div className="grow">
              <div className="title">Abonnements</div>
              <small className="muted">{cfg.subscriptionEnabled
                ? 'Les entreprises paient un abonnement annuel pour que leurs livreurs prennent des courses'
                : 'Désactivés : aucune entreprise n’a besoin d’abonnement, seul le crédit compte'}</small>
            </div>
            <Switch checked={cfg.subscriptionEnabled} onChange={(on) => setCfg({ ...cfg, subscriptionEnabled: on })} label={cfg.subscriptionEnabled ? 'Désactiver les abonnements' : 'Activer les abonnements'} />
          </div>
          <div style={{ opacity: cfg.subscriptionEnabled ? 1 : 0.5 }}>
            <div className="grow"><div className="title">Abonnement annuel</div><small className="muted">Payé par chaque entreprise pour accéder à la plateforme</small></div>
            <input type="number" min={0} step={1000} disabled={!cfg.subscriptionEnabled} value={cfg.subscriptionFee} onChange={(e) => setCfg({ ...cfg, subscriptionFee: Number(e.target.value) })} style={{ width: 120, textAlign: 'right' }} /><span className="muted">{currencySymbol()}</span>
          </div>
          <div>
            <div className="grow">
              <div className="title">Essai gratuit</div>
              <small className="muted">{cfg.trialDays > 0
                ? `Chaque nouvelle entreprise utilise VITE ${cfg.trialDays} jour(s) à partir de sa validation, sans recharger son crédit ni payer d’abonnement : aucune commission pendant l’essai. Modifiable par entreprise depuis sa fiche.`
                : 'Aucun essai : les nouvelles entreprises doivent recharger leur crédit (et payer l’abonnement s’il est activé) avant de travailler.'}</small>
            </div>
            <input type="number" min={0} max={365} step={1} value={cfg.trialDays} onChange={(e) => setCfg({ ...cfg, trialDays: Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0))) })} style={{ width: 90, textAlign: 'right' }} aria-label="Durée de l’essai gratuit en jours" /><span className="muted">jours</span>
          </div>
          <div>
            <div className="grow">
              <div className="title">Commission par défaut</div>
              <small className="muted">Sur le prix de la tournée · ex. course à {formatMoney(sample)} → {formatMoney(example)} prélevé(s). Modifiable par entreprise depuis sa fiche.</small>
            </div>
            <Segmented<CommissionType> value={cfg.commissionType} onChange={(t) => setCfg({ ...cfg, commissionType: t })} options={[['PERCENT', '%'], ['FIXED', 'F fixe']]} labels={{ PERCENT: 'Pourcentage', FIXED: 'Montant fixe' }} />
            <input type="number" min={0} step={cfg.commissionType === 'PERCENT' ? 0.5 : 50} value={cfg.commissionValue} onChange={(e) => setCfg({ ...cfg, commissionValue: Number(e.target.value) })} style={{ width: 90, textAlign: 'right' }} aria-label="Valeur de la commission" />
          </div>
        </div>
        <div>
          <div className="title" style={{ fontWeight: 500, marginBottom: 4 }}>Comptes Mobile Money de VITE</div>
          <small className="muted">Affichés aux entreprises quand elles paient.</small>
          <div className="stack" style={{ gap: 8, marginTop: 10 }}>
            {cfg.accounts.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={a.operator} onChange={(e) => setAccount(i, { operator: e.target.value })} aria-label="Opérateur">
                  {cfg.operators.map((o) => <option key={o}>{o}</option>)}
                </select>
                <input inputMode="numeric" maxLength={10} placeholder="0701020304" value={a.number} onChange={(e) => setAccount(i, { number: e.target.value.replace(/\D/g, '') })} style={{ width: 120 }} aria-label="Numéro" />
                <input placeholder="Titulaire du compte" value={a.name} onChange={(e) => setAccount(i, { name: e.target.value })} style={{ flex: 1, minWidth: 140 }} aria-label="Titulaire" />
                <button className="btn secondary icon-btn" onClick={() => setCfg({ ...cfg, accounts: cfg.accounts.filter((_, j) => j !== i) })} aria-label="Retirer"><Icon name="close" size={14} /></button>
              </div>
            ))}
            {cfg.accounts.length < 10 && (
              <button className="btn plain" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}
                onClick={() => setCfg({ ...cfg, accounts: [...cfg.accounts, { operator: cfg.operators[0], number: '', name: '' }] })}>
                <Icon name="plus" size={14} /> Ajouter un compte
              </button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
