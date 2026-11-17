import 'leaflet/dist/leaflet.css';
import { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Tooltip, useMap } from 'react-leaflet';
import MapTiles from './MapTiles';
import { trackingUrl } from './NewDelivery';
import {
  api, codTotal, dateTime, Delivery, fcfa, FAILURE_LABEL, isOnline, photoUrl, SPEED_LABEL, Stop, time, VEHICLE_LABEL,
} from '../api';
import { useData } from '../data';
import { Avatar, Badge, Field, Icon, Modal, Sheet, StatusBadge, useToast } from '../ui';

const stopColor = (s: Stop) => (s.status === 'DELIVERED' ? '#34c759' : s.status === 'FAILED' ? '#ff3b30' : s.status === 'CANCELLED' ? '#8e8e93' : '#6d28d9');

/** Recadre la carte une fois la fiche ouverte (sa taille n'est connue qu'après l'animation) */
function FitPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    const fit = () => {
      map.invalidateSize();
      if (points.length > 1) map.fitBounds(points, { padding: [36, 36], maxZoom: 15 });
      else map.setView(points[0], 15);
    };
    fit();
    const t = [setTimeout(fit, 250), setTimeout(fit, 600)];
    return () => t.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

/** Fiche détaillée d'une course : carte, chronologie, arrêts, preuves, actions */
export default function DeliverySheet({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { isSA, reload, deliveries } = useData();
  const toast = useToast();
  const d = deliveries.find((x) => x.id === delivery.id) ?? delivery; // toujours la version à jour
  const [cancelOpen, setCancelOpen] = useState(false);
  const [resolveStop, setResolveStop] = useState<Stop | null>(null);

  const points: [number, number][] = [[d.pickupLat, d.pickupLng], ...d.stops.map((s) => [s.lat, s.lng] as [number, number])];
  const canCancel = isSA && d.status !== 'DELIVERED' && d.status !== 'CANCELLED';

  const remit = async (s: Stop) => {
    await api(`/deliveries/${d.id}/stops/${s.id}/cod-remitted`, { method: 'POST' });
    toast(`${fcfa(s.codAmount)} marqué comme reversé`);
    reload();
  };

  const { drivers, me } = useData();
  const targeted = !isSA && d.status === 'PENDING' && d.targetCompanyId === me.companyId;
  const assignedTo = drivers.find((x) => x.id === d.assignedDriverId);
  const assign = async (driverId: string) => {
    await api(`/deliveries/${d.id}/assign`, { method: 'POST', body: { driverId: driverId || null } });
    toast(driverId ? `Course envoyée à ${drivers.find((x) => x.id === driverId)?.name}` : 'Affectation retirée — visible par tous vos livreurs');
    reload();
  };
  // Ordre de passage des arrêts restant à livrer (gérant)
  const pendingStops = d.stops.filter((s) => s.status === 'PENDING');
  const canReorder = !isSA && d.status !== 'DELIVERED' && d.status !== 'CANCELLED' && pendingStops.length > 1;
  const [order, setOrder] = useState<string[] | null>(null);
  const moveStop = (i: number, dir: -1 | 1) => {
    if (!order) return;
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  };
  const saveOrder = async () => {
    if (!order) return;
    try {
      await api(`/deliveries/${d.id}/stops/order`, { method: 'POST', body: { stopIds: order } });
      toast(d.driver ? `Nouvel ordre envoyé à ${d.driver.name}` : 'Ordre de passage enregistré');
      setOrder(null);
      reload();
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const link = trackingUrl(d);
  const copyLink = () => link && navigator.clipboard?.writeText(link).then(() => toast('Lien de suivi copié')).catch(() => {});

  const settleFee = async () => {
    await api(`/deliveries/${d.id}/cancellation-fee/settled`, { method: 'POST' });
    toast(`Frais de déplacement de ${fcfa(d.cancellationFee ?? 0)} marqués réglés`);
    reload();
  };

  const events = [
    { at: d.createdAt, label: `Commandée par ${d.client.name}`, color: '#8e8e93' },
    { at: d.acceptedAt, label: `Acceptée par ${d.driver?.name ?? 'un livreur'}`, color: '#0071e3' },
    { at: d.pickedUpAt, label: d.stops.length > 1 ? 'Colis récupérés' : 'Colis récupéré', color: '#af52de' },
    ...d.stops.filter((s) => s.deliveredAt || s.failedAt).map((s) => ({
      at: s.deliveredAt ?? s.failedAt,
      label: s.deliveredAt ? `Livré à ${s.recipientName}` : `${FAILURE_LABEL[s.failureReason!]} · ${s.recipientName}`,
      color: s.deliveredAt ? '#34c759' : '#ff3b30',
    })),
    ...d.stops.filter((s) => s.cancelledAt).map((s) => ({
      at: s.cancelledAt,
      label: `Arrêt annulé · ${s.recipientName} (${s.cancelledBy ?? 'Client'})${s.cancelReason ? ` · « ${s.cancelReason} »` : ''}`,
      color: '#8e8e93',
    })),
    ...d.stops.filter((s) => s.cancelRequestedAt && s.status === 'PENDING').map((s) => ({
      at: s.cancelRequestedAt,
      label: `Le livreur signale que ${s.recipientName} annule — en attente de l’expéditeur`,
      color: '#ff9f0a',
    })),
    { at: d.returnedAt, label: 'Colis non livrés rendus à l’expéditeur (code de retour)', color: '#34c759' },
    { at: d.cancelledAt, label: `Annulée${d.cancelledBy ? ` par ${d.cancelledBy}` : ''}${d.cancelReason ? ` · « ${d.cancelReason} »` : ''}`, color: '#8e8e93' },
  ].filter((e) => e.at).sort((a, b) => a.at!.localeCompare(b.at!));

  return (
    <Sheet
      title={<>Course · {d.pickupCommune}{d.stops.length > 1 ? ` · ${d.stops.length} arrêts` : ` → ${d.stops[0]?.commune ?? ''}`}</>}
      onClose={onClose}
      actions={<StatusBadge status={d.status} />}
    >
      <div className="map-box">
        <MapContainer bounds={points.length > 1 ? points : undefined} center={points[0]} zoom={13} boundsOptions={{ padding: [30, 30] }} style={{ height: '100%' }} scrollWheelZoom={false}>
          <MapTiles />
          <FitPoints points={points} />
          <Polyline positions={points} pathOptions={{ color: '#0071e3', weight: 3, opacity: 0.6, dashArray: '6 6' }} />
          <CircleMarker center={points[0]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#34c759', fillOpacity: 1 }}>
            <Tooltip direction="top" permanent>A</Tooltip>
          </CircleMarker>
          {d.stops.map((s) => (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: stopColor(s), fillOpacity: 1 }}>
              <Tooltip direction="top" permanent>{s.position + 1}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 28, fontWeight: 700 }} className="tabular">{fcfa(d.price)}</span>
        <span className="muted">Espèces · {VEHICLE_LABEL[d.vehicleType]} · {SPEED_LABEL[d.speed]}{d.distanceKm != null ? ` · ${d.distanceKm} km` : ''}</span>
      </div>
      {d.commissionAmount != null && (
        <div className="muted" style={{ marginTop: -8 }}>
          Commission LETO {d.commissionRule} : {fcfa(d.commissionAmount)}
          {d.commissionChargedAt ? ' · prélevée' : d.status === 'CANCELLED' ? ' · non prélevée (annulée)' : ' · réservée, prélevée à la fin'}
          {d.commissionRefunded > 0 && ` · ${fcfa(d.commissionRefunded)} remboursé(s) (litige)`}
        </div>
      )}
      {(d.source === 'COMPANY' || d.targetCompanyId) && d.status === 'PENDING' && (
        <div className="alert info">
          {d.source === 'COMPANY' ? 'Course créée par l’entreprise.' : `Course adressée à ${isSA ? 'une entreprise précise' : 'votre entreprise'} par le client.`}
          {assignedTo ? ` Affectée à ${assignedTo.name}, en attente de son acceptation.` : ' Visible par tous les livreurs de l’entreprise.'}
          {d.assignmentNote && <> Dernier refus : « {d.assignmentNote} ».</>}
        </div>
      )}
      {targeted && (
        <Field label="Affecter à un livreur">
          <select value={d.assignedDriverId ?? ''} onChange={(e) => assign(e.target.value)}>
            <option value="">Tous mes livreurs (le premier qui accepte)</option>
            {drivers.filter((x) => x.active).map((x) => <option key={x.id} value={x.id}>{x.name}{isOnline(x) ? ' · en ligne' : ' · hors ligne'}</option>)}
          </select>
        </Field>
      )}
      {link && d.status !== 'CANCELLED' && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="muted" style={{ flex: 1 }}>Lien de suivi à partager au client et aux destinataires</span>
          <a className="btn secondary" href={link} target="_blank" rel="noreferrer">Ouvrir</a>
          <button className="btn" onClick={copyLink}>Copier le lien</button>
        </div>
      )}
      {d.cancellationFee != null && d.cancellationFee > 0 && (
        <div className="alert info" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ flex: 1 }}>
            <strong>Frais de déplacement : {fcfa(d.cancellationFee)}</strong> — course annulée alors que le livreur était en route, à récupérer auprès de l’expéditeur.
          </span>
          {d.cancellationFeeSettledAt ? <Badge color="green">Réglés le {new Date(d.cancellationFeeSettledAt).toLocaleDateString('fr-FR')}</Badge>
            : !isSA ? <button className="btn" onClick={settleFee}>Marquer réglés</button> : <Badge color="orange">À récupérer</Badge>}
        </div>
      )}
      {d.returnRequired && (
        <div className={`alert ${d.returnedAt ? 'info' : 'error'}`}>
          {d.returnedAt
            ? <>Colis non livrés rendus à l’expéditeur le {dateTime(d.returnedAt)} (code de retour vérifié).</>
            : <><strong>Retour en cours :</strong> le livreur doit rapporter {d.stops.filter((s) => s.status !== 'DELIVERED').length} colis à l’expéditeur et saisir son code de retour.</>}
        </div>
      )}

      <div>
        <div className="section-title">Intervenants</div>
        <div className="group">
          <div><Avatar name={d.client.name} /><div style={{ flex: 1 }}><strong>{d.client.name}</strong><small className="muted" style={{ display: 'block' }}>Expéditeur · {d.client.phone}</small></div></div>
          {d.driver ? (
            <div><Avatar name={d.driver.name} /><div style={{ flex: 1 }}><strong>{d.driver.name}</strong><small className="muted" style={{ display: 'block' }}>Livreur · {d.driver.phone} · {d.company?.name}</small></div></div>
          ) : (
            <div><span className="muted">Aucun livreur pour le moment</span></div>
          )}
        </div>
      </div>

      <div>
        <div className="section-title">Départ</div>
        <div className="group">
          <div>
            <span className="stop-num" style={{ background: '#34c759' }}>A</span>
            <div style={{ flex: 1 }}>
              <strong>{d.pickupAddress}</strong> <span className="muted">({d.pickupCommune})</span>
              {d.pickupDetails && <small className="muted" style={{ display: 'block' }}>{d.pickupDetails}</small>}
              <small className="muted" style={{ display: 'block' }}>{d.pickupContactName ?? d.client.name} · {d.pickupPhone}</small>
            </div>
          </div>
          {d.courierComment && <div><Icon name="edit" className="muted" /><span>« {d.courierComment} »</span></div>}
        </div>
      </div>

      <div>
        <div className="section-title" style={{ display: 'flex', alignItems: 'center' }}>
          <span style={{ flex: 1 }}>{d.stops.length > 1 ? `Arrêts (${d.stops.length})` : 'Destinataire'}</span>
          {canReorder && !order && <button className="btn plain" onClick={() => setOrder(pendingStops.map((s) => s.id))}>Modifier l’ordre</button>}
        </div>
        {order && (
          <div className="reorder">
            <small className="muted">Ordre de passage des colis restant à livrer{d.driver ? ` — ${d.driver.name} sera prévenu` : ''}. Le prix ne change pas.</small>
            {order.map((id, i) => {
              const s = d.stops.find((x) => x.id === id)!;
              return (
                <div key={id} className="reorder-row">
                  <span className="stop-num" style={{ background: 'var(--accent)' }}>{d.stops.length - pendingStops.length + i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><strong>{s.recipientName}</strong><small className="muted" style={{ display: 'block' }}>{s.address} ({s.commune})</small></div>
                  <div className="nd-order" style={{ marginTop: 0 }}>
                    <button onClick={() => moveStop(i, -1)} disabled={i === 0} aria-label="Livrer plus tôt"><Icon name="chevron" size={13} /></button>
                    <button onClick={() => moveStop(i, 1)} disabled={i === order.length - 1} aria-label="Livrer plus tard"><Icon name="chevron" size={13} /></button>
                  </div>
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn secondary" onClick={() => setOrder(null)}>Annuler</button>
              <button className="btn" onClick={saveOrder} disabled={order.every((x, i) => x === pendingStops[i]?.id)}>Enregistrer l’ordre</button>
            </div>
          </div>
        )}
        <div className="group">
          {d.stops.map((s) => (
            <div key={s.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span className="stop-num" style={{ background: stopColor(s) }}>{s.position + 1}</span>
                <div style={{ flex: 1 }}>
                  <strong>{s.recipientName}</strong> <span className="muted">· {s.recipientPhone}</span>
                  <small className="muted" style={{ display: 'block' }}>{s.address} ({s.commune}){s.details ? ` · ${s.details}` : ''}</small>
                  {s.packageDescription && <small className="muted" style={{ display: 'block' }}>Colis : {s.packageDescription}</small>}
                </div>
                {s.status === 'DELIVERED' && <Badge color="green">Livré {time(s.deliveredAt)}</Badge>}
                {s.status === 'FAILED' && <Badge color="red">{FAILURE_LABEL[s.failureReason!]}</Badge>}
                {s.status === 'CANCELLED' && <Badge>Annulé · {s.cancelledBy ?? 'Client'}</Badge>}
                {s.status === 'PENDING' && s.cancelRequestedAt && <Badge color="yellow">Annulation demandée</Badge>}
                {s.status === 'PENDING' && (d.status === 'CANCELLED' ? <Badge>Annulé</Badge> : <Badge color={s.arrivedAt ? 'blue' : 'gray'}>{s.arrivedAt ? 'Livreur sur place' : 'À livrer'}</Badge>)}
              </div>
              {s.codAmount > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, marginLeft: 34 }}>
                  <Badge color={s.codRemittedAt ? 'green' : 'orange'}>
                    {s.codRemittedAt ? `${fcfa(s.codAmount)} reversé` : s.status === 'DELIVERED' ? `${fcfa(s.codAmount)} encaissé, à reverser` : `À encaisser : ${fcfa(s.codAmount)}`}
                  </Badge>
                  {!isSA && s.status === 'DELIVERED' && !s.codRemittedAt && <button className="btn plain" onClick={() => remit(s)}>Marquer reversé</button>}
                </div>
              )}
              {s.status === 'FAILED' && <FailureProof stop={s} onResolve={() => setResolveStop(s)} />}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="section-title">Chronologie</div>
        <ul className="timeline">
          {events.map((e, i) => (
            <li key={i}>
              <span className="tdot" style={{ background: e.color }} />
              <div><div>{e.label}</div><small className="muted">{dateTime(e.at)}</small></div>
            </li>
          ))}
        </ul>
      </div>

      <small className="muted">Référence : {d.id}</small>
      {canCancel && <button className="btn danger" onClick={() => setCancelOpen(true)}>Annuler la course</button>}

      {cancelOpen && <CancelDialog delivery={d} onClose={() => setCancelOpen(false)} />}
      {resolveStop && <ResolveDialog delivery={d} stop={resolveStop} onClose={() => setResolveStop(null)} />}
    </Sheet>
  );
}

/** Photo de preuve, avec un remplacement propre si elle est introuvable */
function ProofPhoto({ path }: { path: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return <div className="thumb missing">Photo indisponible</div>;
  return (
    <a href={photoUrl(path)} target="_blank" rel="noreferrer">
      <img className="thumb" src={photoUrl(path)} alt="Photo du lieu prise par le livreur" onError={() => setMissing(true)} />
    </a>
  );
}

/** Preuves d'un échec (photo, GPS, attente) + contestation et arbitrage */
export function FailureProof({ stop: s, onResolve }: { stop: Stop; onResolve?: () => void }) {
  const waited = s.arrivedAt && s.failedAt ? Math.round((new Date(s.failedAt).getTime() - new Date(s.arrivedAt).getTime()) / 60000) : null;
  return (
    <div style={{ marginTop: 10, marginLeft: 34, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {s.failurePhotoUrl && <ProofPhoto path={s.failurePhotoUrl} />}
        <dl className="kv" style={{ flex: 1, gridTemplateColumns: '110px 1fr' }}>
          <dt>Arrivée (GPS)</dt><dd>{s.arrivedAt ? time(s.arrivedAt) : 'non détectée'}</dd>
          <dt>Attente</dt><dd>{waited != null ? `${waited} min` : '—'}</dd>
          <dt>Signalement</dt>
          <dd>
            {time(s.failedAt)}
            {s.failureLat != null && <> · <a href={`https://www.openstreetmap.org/?mlat=${s.failureLat}&mlon=${s.failureLng}#map=18/${s.failureLat}/${s.failureLng}`} target="_blank" rel="noreferrer">position</a></>}
          </dd>
          {s.failureNote && <><dt>Livreur</dt><dd>« {s.failureNote} »</dd></>}
        </dl>
      </div>
      {s.disputedAt && (
        <div className="alert info" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <strong>Contesté par l’expéditeur le {dateTime(s.disputedAt)}</strong>
          {s.disputeNote && <span>« {s.disputeNote} »</span>}
          {s.disputeResolvedAt ? (
            <span>
              <Badge color={s.disputeDecision === 'UPHELD' ? 'orange' : 'green'}>
                {s.disputeDecision === 'UPHELD' ? 'Raison donnée au client' : 'Raison donnée au livreur'}
              </Badge>{' '}
              par {s.disputeResolvedBy}, {dateTime(s.disputeResolvedAt)}{s.disputeResolutionNote ? ` · « ${s.disputeResolutionNote} »` : ''}
            </span>
          ) : (
            onResolve && <div><button className="btn" onClick={onResolve}>Trancher le litige</button></div>
          )}
        </div>
      )}
    </div>
  );
}

export function ResolveDialog({ delivery, stop, onClose }: { delivery: Delivery; stop: Stop; onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const decide = async (decision: 'UPHELD' | 'REJECTED') => {
    try {
      await api(`/deliveries/${delivery.id}/stops/${stop.id}/resolve`, { method: 'POST', body: { decision, note: note || undefined } });
      toast('Litige tranché — l’expéditeur est prévenu');
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title="Trancher le litige"
      subtitle={`${stop.recipientName} · ${FAILURE_LABEL[stop.failureReason!]} · contesté par ${delivery.client.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Annuler</button>
          <button className="btn success" onClick={() => decide('REJECTED')}>Raison au livreur</button>
          <button className="btn" onClick={() => decide('UPHELD')}>Raison au client</button>
        </>
      }
    >
      <label className="field">
        <span>Explication (visible par l’expéditeur)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : la position GPS et l’attente confirment le passage du livreur." />
      </label>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}

function CancelDialog({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { reload } = useData();
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const cancel = async () => {
    try {
      await api(`/deliveries/${delivery.id}/admin-cancel`, { method: 'POST', body: { reason } });
      toast('Course annulée — le client et le livreur sont prévenus');
      await reload();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title="Annuler la course ?"
      subtitle={`${delivery.client.name} · ${fcfa(delivery.price)}${codTotal(delivery) ? ` · ${fcfa(codTotal(delivery))} à encaisser` : ''}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn secondary" onClick={onClose}>Retour</button>
          <button className="btn danger" disabled={!reason.trim()} onClick={cancel}>Annuler la course</button>
        </>
      }
    >
      <label className="field">
        <span>Motif (obligatoire)</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex. : commande en double" autoFocus />
      </label>
      {error && <div className="alert error">{error}</div>}
    </Modal>
  );
}
