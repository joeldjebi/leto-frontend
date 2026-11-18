import { useState } from 'react';
import { PaymentKind } from '../api';
import { AccountsList, BillingAlert, BillingStats, PayDialog, PaymentsTable, TransactionsCard, useBilling } from '../components/Billing';
import { Card, Empty, Icon, PageHeader } from '../ui';
import { formatMoney } from '../countries';

/** Gérant : abonnement annuel, crédit, recharges (preuve Mobile Money) et journal */
export default function Billing() {
  const { data: b, error, reload } = useBilling(null);
  const [pay, setPay] = useState<PaymentKind | null>(null);
  if (!b) return <><PageHeader title="Crédit et abonnement" />{error ? <div className="alert error">{error}</div> : <Card><Empty icon="wallet">Chargement…</Empty></Card>}</>;
  const pending = b.payments.filter((p) => p.status === 'PENDING');
  return (
    <>
      <PageHeader
        title={b.subscriptionRequired ? 'Crédit et abonnement' : 'Crédit'}
        subtitle={b.inTrial
          ? `Essai gratuit jusqu’au ${new Date(b.trialEndsAt!).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} : aucune commission. Ensuite : ${b.rule.label} du prix de chaque tournée, prélevée sur votre crédit.`
          : `Commission LETO : ${b.rule.label} du prix de chaque tournée, prélevée sur votre crédit à la fin de la tournée.`}
        actions={<>
          {b.subscriptionRequired && <button className="btn secondary" onClick={() => setPay('SUBSCRIPTION')}><Icon name="calendar" size={15} />{b.subscriptionEndsAt && b.subscribed ? 'Renouveler l’abonnement' : 'Payer l’abonnement'}</button>}
          <button className="btn" onClick={() => setPay('TOPUP')}><Icon name="plus" size={15} />Recharger</button>
        </>}
      />
      <BillingAlert b={b} onPay={setPay} />
      {pending.length > 0 && (
        <div className="banner warn"><Icon name="clock" size={18} /><span className="grow">{pending.length} paiement(s) en cours de vérification par LETO.</span></div>
      )}
      <div className="stack">
        <BillingStats b={b} onTopup={() => setPay('TOPUP')} />
        <div className="grid grid-2">
          <Card title="Comment recharger ?" pad>
            <div className="stack" style={{ gap: 12 }}>
              <span className="muted">Envoyez le montant par Mobile Money sur un de ces numéros, puis cliquez sur « Recharger » et joignez la capture du paiement.</span>
              <AccountsList config={b.config} />
            </div>
          </Card>
          <Card title="Bon à savoir" pad>
            <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              {b.inTrial && <li>Pendant l’essai gratuit, vos livreurs travaillent sans crédit et aucune commission n’est prélevée.</li>}
              {b.subscriptionRequired && <li>Abonnement annuel : {formatMoney(b.config.subscriptionFee)}, sans lui vos livreurs ne peuvent pas travailler.</li>}
              <li>À l’acceptation d’une course, la commission est réservée sur votre crédit.</li>
              <li>Si le crédit disponible ne suffit pas, le livreur ne peut pas accepter.</li>
              <li>La commission est prélevée à la fin de la tournée, même si un destinataire était absent.</li>
              <li>Un litige donné au client vous rembourse la part de commission de cet arrêt.</li>
            </ul>
          </Card>
        </div>
        <Card title="Mes paiements"><PaymentsTable payments={b.payments} /></Card>
        <TransactionsCard b={b} />
      </div>
      {pay && <PayDialog kind={pay} config={b.config} onClose={() => setPay(null)} onDone={reload} />}
    </>
  );
}
