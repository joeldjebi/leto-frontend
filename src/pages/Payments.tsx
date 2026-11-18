import { useEffect, useState } from 'react';
import { api, Payment, PaymentStatus } from '../api';
import { formatMoney } from '../countries';
import { PaymentsTable, ReviewDialog } from '../components/Billing';
import { Card, PageHeader, Segmented, Stat } from '../ui';

interface Summary { commissionsMonth: number; commissionsTotal: number; topupsMonth: number; subscriptionsYear: number; pending: number }

/** SA : preuves de paiement des entreprises à vérifier, revenus LETO */
export default function Payments() {
  const [status, setStatus] = useState<PaymentStatus | 'ALL'>('PENDING');
  const [list, setList] = useState<Payment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [review, setReview] = useState<Payment | null>(null);
  const reload = async () => {
    const [l, s] = await Promise.all([
      api<Payment[]>(status === 'ALL' ? '/billing/payments' : `/billing/payments?status=${status}`),
      api<Summary>('/billing/summary'),
    ]);
    setList(l);
    setSummary(s);
  };
  useEffect(() => {
    reload();
    const t = window.setInterval(reload, 30_000);
    return () => window.clearInterval(t);
  }, [status]);

  return (
    <>
      <PageHeader title="Paiements" subtitle="Abonnements et recharges envoyés par les entreprises : vérifiez la réception sur le compte LETO, puis validez." />
      <div className="stack">
        {summary && (
          <div className="grid grid-stats">
            <Stat icon="receipt" label="À vérifier" value={summary.pending} foot="preuve(s) de paiement en attente" onClick={() => setStatus('PENDING')} />
            <Stat icon="tag" label="Commissions ce mois" value={formatMoney(summary.commissionsMonth)} foot={`${formatMoney(summary.commissionsTotal)} depuis le début`} />
            <Stat icon="calendar" label="Abonnements cette année" value={formatMoney(summary.subscriptionsYear)} foot={`${formatMoney(summary.topupsMonth)} de recharges ce mois`} />
          </div>
        )}
        <div className="toolbar">
          <Segmented<PaymentStatus | 'ALL'> value={status} onChange={setStatus}
            options={[['PENDING', `À vérifier${summary?.pending ? ` (${summary.pending})` : ''}`], ['APPROVED', 'Validés'], ['REJECTED', 'Refusés'], ['ALL', 'Tous']]} />
        </div>
        <Card><PaymentsTable payments={list} showCompany onReview={setReview} /></Card>
      </div>
      {review && <ReviewDialog payment={review} onClose={() => setReview(null)} onDone={reload} />}
    </>
  );
}
