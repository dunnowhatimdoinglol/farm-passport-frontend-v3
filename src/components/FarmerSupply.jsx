// Farmer dashboard sections for the supply chain: orders, dispatching, shipments
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER, formatQty, shortWhen } from './walletHelpers';
import { DeliveryPhotoButton } from './DeliveryPhoto';

// Money helpers — prices are only ever shown to the farm and the restaurant
export const gbp = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)))
  ? null : `£${Number(v).toFixed(2)}`;
const toNum = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

const STATUS_BADGE = {
  requested:  'bg-yellow-100 text-yellow-800',
  dispatched: 'bg-green-100 text-green-700',
  declined:   'bg-gray-100 text-gray-600',
  cancelled:  'bg-gray-100 text-gray-600',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered:  'bg-green-100 text-green-700',
};
const STATUS_LABEL = {
  requested: 'New request', dispatched: 'Dispatched', declined: 'Declined', cancelled: 'Cancelled',
  in_transit: 'In transit', delivered: 'Delivered',
};

// The order's terms are fingerprinted on the blockchain at dispatch; the café confirms them on delivery.
// "Verify" re-checks the private copy of the terms against that fingerprint.
export function TermsCheck({ order, token }) {
  const [result, setResult] = useState(null);   // null | 'loading' | { matches } | { error }
  if (!order?.fingerprinted) return null;
  const verify = async () => {
    setResult('loading');
    try {
      const res = await axios.get(`${API_BASE}/orders/${order.id}/verify`, { headers: { Authorization: `Bearer ${token}` } });
      setResult(res.data);
    } catch (err) {
      setResult({ error: err.response?.data?.error || 'Could not check' });
    }
  };
  return (
    <p className="text-xs mt-1 flex flex-wrap gap-x-2 items-center">
      <span className={order.termsAccepted ? 'text-green-700' : 'text-gray-500'}>
        🔏 {order.termsAccepted ? 'Terms confirmed by both sides' : order.shipmentStatus === 'delivered' ? 'Delivered without confirming terms' : 'Terms fingerprinted on-chain'}
      </span>
      {result === null && <button onClick={verify} className="text-blue-600 hover:underline">Verify</button>}
      {result === 'loading' && <span className="text-gray-400">checking…</span>}
      {result?.matches === true && <span className="text-green-700 font-semibold">✅ matches the blockchain</span>}
      {result?.matches === false && <span className="text-red-600 font-semibold">⚠️ does NOT match the blockchain</span>}
      {result?.error && <span className="text-red-600">{result.error}</span>}
    </p>
  );
}

// ─────────────────────────────────────────────
// Food Chain Information: the 3 legal declarations a farm makes when sending animals to slaughter.
// Kept private (only the abattoir and the farm can see it); its fingerprint goes on the blockchain.
// ─────────────────────────────────────────────
const FCI_QUESTIONS = [
  ['noRestrictions', 'My holding is not under movement restrictions for animal disease or public health reasons'],
  ['withdrawalObserved', 'Withdrawal periods for all veterinary medicines given have been observed'],
  ['noDisease', 'The animals have not been exposed to any disease or condition that could affect the safety of the meat'],
];

export function FciFields({ value, onChange, disabled }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
      <p className="text-sm font-semibold text-amber-900">📋 Food Chain Information (required for slaughter)</p>
      {FCI_QUESTIONS.map(([k, label]) => (
        <label key={k} className="flex gap-2 items-start text-sm text-gray-800 cursor-pointer">
          <input type="checkbox" className="mt-1" checked={!!value[k]} disabled={disabled} onChange={(e) => set(k, e.target.checked)} />
          <span>{label}</span>
        </label>
      ))}
      <input type="text" maxLength={500} value={value.notes || ''} disabled={disabled} onChange={(e) => set('notes', e.target.value)}
        placeholder="Medicines given recently, anything the vet should know (optional)"
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      <label className="block text-xs text-gray-600">
        Photo or PDF of your FCI form / LIS-1 / eAML2 (optional)
        <input type="file" accept="image/*,application/pdf" disabled={disabled}
          onChange={(e) => set('file', e.target.files?.[0] || null)} className="block mt-1 text-xs" />
      </label>
      <p className="text-xs text-amber-800">Private: only the abattoir and you can read it. A fingerprint goes on the blockchain to prove it was sent and hasn't been changed.</p>
    </div>
  );
}

export const fciComplete = (v) => FCI_QUESTIONS.every(([k]) => v[k]);

export async function sendFci(shipmentId, value, token) {
  const form = new FormData();
  FCI_QUESTIONS.forEach(([k]) => form.append(k, value[k] ? 'true' : 'false'));
  if (value.notes) form.append('notes', value.notes);
  if (value.file) form.append('file', value.file);
  return axios.post(`${API_BASE}/farmer/shipments/${shipmentId}/fci`, form, { headers: { Authorization: `Bearer ${token}` } });
}

function Badge({ status }) {
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_BADGE[status] || 'bg-gray-100 text-gray-600'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

// ─────────────────────────────────────────────
// Orders from restaurants
// ─────────────────────────────────────────────
export function FarmerOrders({ farmerToken, approved, onChanged, refreshKey = 0 }) {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState(null);
  const [error,   setError]   = useState(null);
  const [alloc,   setAlloc]   = useState({});     // orderId → [{ batchId, quantity, unitPrice }] being sent
  const [via,     setVia]     = useState({});     // orderId → depot / courier address ('' = direct)
  const [fee,     setFee]     = useState({});     // orderId → delivery charge (£)
  const [carriers, setCarriers] = useState([]);   // registered depots / couriers
  const auth = { headers: { Authorization: `Bearer ${farmerToken}` } };

  useEffect(() => {
    axios.get(`${API_BASE}/participants`)
      .then(res => setCarriers((res.data.participants || []).filter(p => p.role === 'handler')))
      .catch(() => {});
  }, []);

  const load = async () => {
    try {
      const res = await axios.get(`${API_BASE}/farmer/orders`, auth);
      setOrders(res.data.orders || []);
      setAlloc({});
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load orders');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [refreshKey]);

  const act = async (order, action, body = {}) => {
    setBusyId(order.id);
    setError(null);
    try {
      await axios.post(`${API_BASE}/farmer/orders/${order.id}/${action}`, body, auth);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const open = orders.filter(o => o.status === 'requested');
  const done = orders.filter(o => o.status !== 'requested').slice(0, 20);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-1">🧾 Orders {open.length > 0 && <span className="text-sm bg-yellow-400 text-yellow-900 rounded-full px-2 py-0.5 ml-1">{open.length} new</span>}</h3>
      <p className="text-sm text-gray-500 mb-4">Restaurants ask for part of a batch. Dispatching records the shipment on the blockchain.</p>

      {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {open.map(o => {
            // Which batches to send: the app suggests soonest use-by first; the farm can change amounts and prices
            const plan = alloc[o.id] || (o.suggestion?.allocations || []).map(a => ({ ...a, unitPrice: a.pricePerUnit ?? '' }));
            const setPlan = (next) => setAlloc({ ...alloc, [o.id]: next });
            const sendQty = plan.reduce((n, a) => n + (toNum(a.quantity) || 0), 0);
            const df = toNum(fee[o.id]) || 0;
            const priced = plan.every(a => toNum(a.unitPrice) !== null);
            const total = priced ? Math.round((plan.reduce((n, a) => n + (toNum(a.quantity) || 0) * toNum(a.unitPrice), 0) + df) * 100) / 100 : null;
            const day = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'no use-by');
            return (
            <div key={o.id} className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-4">
              <div className="flex justify-between items-start gap-3 flex-wrap">
                <div>
                  <p className="font-bold text-gray-800">{o.restaurantName}</p>
                  <p className="text-sm text-gray-700">
                    wants <strong>{formatQty(o.quantity, o.unit)}</strong> of {o.productName}{o.isDeal ? ' 🏷️ (your short-date deal)' : ''}
                  </p>
                  {o.neededUntil && <p className="text-xs text-gray-600">Needs to last until {day(o.neededUntil)}</p>}
                  {o.note && <p className="text-sm text-gray-600 italic mt-1">"{o.note}"</p>}
                </div>
                <Badge status={o.status} />
              </div>

              <div className="mt-3 bg-white border border-yellow-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Send from (soonest use-by first):</p>
                {plan.length === 0 && <p className="text-sm text-red-600">Nothing left that matches this order.</p>}
                {plan.map((a, i) => (
                  <div key={a.batchId} className="flex gap-2 items-center flex-wrap text-sm mb-1">
                    <span className="font-mono text-xs text-gray-600 w-40 truncate" title={a.batchId}>{a.batchId}</span>
                    <span className="text-xs text-gray-500 w-24">use by {day(a.useBy)}</span>
                    <input type="number" step="any" min="0" max={a.remaining} value={a.quantity}
                      onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                      className="w-20 px-2 py-1 border border-gray-300 rounded" disabled={busyId === o.id} />
                    <span className="text-gray-500">{o.unit}</span>
                    <span className="text-gray-500 ml-1">£</span>
                    <input type="number" step="0.01" min="0" value={a.unitPrice}
                      onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))}
                      placeholder="price" className="w-20 px-2 py-1 border border-gray-300 rounded" disabled={busyId === o.id} />
                    <span className="text-xs text-gray-500">/{o.unit}</span>
                    {plan.length > 1 && <button type="button" onClick={() => setPlan(plan.filter((_, j) => j !== i))} className="text-xs text-red-600">✕</button>}
                  </div>
                ))}
                {o.suggestion?.shortBy > 0 && <p className="text-xs text-amber-700 mt-1">⚠️ {formatQty(o.suggestion.shortBy, o.unit)} short — you can send part of the order.</p>}
                {plan.length > 1 && <p className="text-xs text-gray-500 mt-1">Goes as {plan.length} deliveries, one per batch, each recorded on-chain.</p>}
              </div>

              <div className="flex gap-2 mt-2 flex-wrap items-center text-sm">
                <select value={via[o.id] || ''} onChange={(e) => setVia({ ...via, [o.id]: e.target.value })} disabled={busyId === o.id}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">Direct (own delivery)</option>
                  {carriers.map(c => <option key={c.address} value={c.address}>via {c.name}</option>)}
                </select>
                <label className="text-gray-600 ml-2">🚚 Delivery £</label>
                <input type="number" step="0.01" min="0" value={fee[o.id] ?? ''} onChange={(e) => setFee({ ...fee, [o.id]: e.target.value })}
                  placeholder="0.00" className="w-24 px-3 py-2 border border-gray-300 rounded-lg" disabled={busyId === o.id} />
                <span className="ml-2 font-semibold text-gray-800">
                  {formatQty(Math.round(sendQty * 1000) / 1000, o.unit)} · {total != null ? <>Total {gbp(total)}</> : <span className="text-gray-400 font-normal">set prices to see the total</span>}
                </span>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap items-center">
                <button
                  onClick={() => act(o, 'dispatch', {
                    allocations: plan.map(a => ({ batchId: a.batchId, quantity: toNum(a.quantity), unitPrice: toNum(a.unitPrice) ?? undefined })),
                    via: via[o.id] || undefined,
                    deliveryFee: toNum(fee[o.id]) ?? undefined,
                  })}
                  disabled={busyId === o.id || !approved || !plan.length || !(sendQty > 0)}
                  className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {busyId === o.id ? '⛓️ Recording…' : '🚚 Dispatch'}
                </button>
                <button
                  onClick={() => {
                    const note = window.prompt('Reason for declining (optional):') ?? null;
                    if (note !== null) act(o, 'decline', { note });
                  }}
                  disabled={busyId === o.id}
                  className="text-sm text-gray-600 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  Decline
                </button>
              </div>
            </div>
            );
          })}

          {done.map(o => (
            <div key={o.id} className="border border-gray-200 rounded-lg p-4 flex justify-between items-start gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-gray-800">{o.restaurantName} · {formatQty(o.quantitySent ?? o.quantity, o.unit)} {o.productName}</p>
                <p className="font-mono text-xs text-gray-500">
                  {o.dispatches?.length ? o.dispatches.map(d => `${d.batchId} (#${d.shipmentId})`).join(' + ') : `${o.batchId || ''}${o.shipmentId ? ` · shipment #${o.shipmentId}` : ''}`}
                </p>
                {o.total != null && (
                  <p className="text-xs text-gray-700 mt-1">
                    💷 {o.unitPrice != null && <>{gbp(o.unitPrice)}/{o.unit}</>}
                    {o.deliveryFee ? <> + {gbp(o.deliveryFee)} delivery</> : null}
                    {' '}= <strong>{gbp(o.total)}</strong>{o.totalIsEstimate ? ' (estimate)' : ''}
                  </p>
                )}
                <TermsCheck order={o} token={farmerToken} />
              </div>
              <div className="text-right space-y-1">
                {/* Once the restaurant confirms, show "Delivered" instead of "Dispatched" */}
                <Badge status={o.status === 'dispatched' && o.shipmentStatus === 'delivered' ? 'delivered' : o.status} />
                {o.status === 'dispatched' && (
                  <label className="flex items-center gap-1 text-xs text-gray-600 justify-end cursor-pointer">
                    <input
                      type="checkbox"
                      checked={o.paymentStatus === 'paid'}
                      onChange={(e) => act(o, 'payment', { paid: e.target.checked })}
                      disabled={busyId === o.id}
                    />
                    Paid
                  </label>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Send part of a batch to a depot / business (no order needed)
// ─────────────────────────────────────────────
export function DispatchForm({ farmerToken, batch, onDone, onCancel }) {
  const [participants, setParticipants] = useState([]);
  const [to,       setTo]       = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes,    setNotes]    = useState('');
  const [via,      setVia]      = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/participants`)
      .then(res => setParticipants(res.data.participants || []))
      .catch(() => setError('Could not load the list of businesses'));
  }, []);

  const remaining = Number(batch.quantityRemaining ?? batch.quantity);
  // Live animals only go to approved abattoirs, with Food Chain Information
  const isLivestock = batch.productType === 'Livestock';
  const [fci, setFci] = useState({});
  const [sentId, setSentId] = useState(null);       // dispatched, but the FCI still needs sending (retry)
  const choices = isLivestock ? participants.filter(p => p.processorApproval) : participants;

  const submit = async (e) => {
    e.preventDefault();
    if (isLivestock && !fciComplete(fci)) {
      setError('Tick all three Food Chain Information declarations. If you can’t, speak to the abattoir before sending.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let shipmentId = sentId;
      if (!shipmentId) {
        const res = await axios.post(`${API_BASE}/farmer/dispatch`,
          { batchId: batch.batchId, to, quantity, notes, via: via || undefined },
          { headers: { Authorization: `Bearer ${farmerToken}` } });
        shipmentId = res.data.shipmentId;
      }
      if (isLivestock) {
        setSentId(shipmentId);
        await sendFci(shipmentId, fci, farmerToken);
      }
      onDone?.();
    } catch (err) {
      setError((sentId || isLivestock ? 'The animals are on their way, but the Food Chain Information didn’t send: ' : '')
        + (err.response?.data?.error || 'Could not dispatch'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-700">
        {isLivestock ? '🐄 Send to an abattoir' : '🚚 Send part of this batch'} · {formatQty(remaining, batch.unit)} still at the farm
      </p>
      <select value={to} onChange={(e) => setTo(e.target.value)} required disabled={!!sentId}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
        <option value="">{isLivestock ? '— Choose the abattoir —' : '— Send to —'}</option>
        {choices.map(p => (
          <option key={p.address} value={p.address}>
            {p.name} ({p.processorApproval ? `abattoir / processor · ${p.processorApproval}` : p.role === 'restaurant' ? 'restaurant' : 'depot / handler'})
          </option>
        ))}
      </select>
      {isLivestock && choices.length === 0 && (
        <p className="text-xs text-red-600">No abattoirs are approved on Farm Passport yet — ask the admin to add yours.</p>
      )}
      <select value={via} onChange={(e) => setVia(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
        <option value="">Direct (own delivery)</option>
        {participants.filter(p => p.role === 'handler' && p.address !== to).map(p => (
          <option key={p.address} value={p.address}>via {p.name}</option>
        ))}
      </select>
      <div className="flex gap-2 items-center">
        <input type="number" step="any" min="0.001" max={remaining} value={quantity}
          onChange={(e) => setQuantity(e.target.value)} required placeholder="Quantity"
          className="w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
        <span className="text-sm text-gray-500">{batch.unit}</span>
      </div>
      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280}
        placeholder={isLivestock ? 'Notes (optional), e.g. haulier, trailer reg' : 'Notes (optional), e.g. 20 crates, chilled'}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      {isLivestock && <FciFields value={fci} onChange={setFci} disabled={busy} />}
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
          {busy ? '⛓️ Recording…' : sentId ? 'Send the FCI again' : isLivestock ? 'Send to abattoir' : 'Dispatch'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:underline">Cancel</button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────
// Shipments sent from this farm
// ─────────────────────────────────────────────
export function FarmerShipments({ farmerToken, refreshKey = 0, onChanged }) {
  const [shipments, setShipments] = useState([]);
  const [busyId,    setBusyId]    = useState(null);
  const [error,     setError]     = useState(null);
  const [fciFor,    setFciFor]    = useState(null);   // shipment whose FCI form is open
  const [fci,       setFci]       = useState({});

  const submitFci = async (s) => {
    if (!fciComplete(fci)) { setError('Tick all three declarations'); return; }
    setBusyId(s.shipmentId); setError(null);
    try {
      await sendFci(s.shipmentId, fci, farmerToken);
      setFciFor(null); setFci({});
      await load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the Food Chain Information');
    } finally {
      setBusyId(null);
    }
  };
  const auth = { headers: { Authorization: `Bearer ${farmerToken}` } };

  const load = () => axios.get(`${API_BASE}/farmer/shipments`, auth)
    .then(res => setShipments(res.data.shipments || []))
    .catch(() => setError('Could not load shipments'));
  useEffect(() => { load(); }, [refreshKey]);

  const cancel = async (s) => {
    if (!window.confirm(`Cancel shipment #${s.shipmentId}? The ${formatQty(s.quantitySent, s.unit)} goes back to your farm stock.`)) return;
    setBusyId(s.shipmentId);
    setError(null);
    try {
      await axios.post(`${API_BASE}/farmer/shipments/${s.shipmentId}/cancel`, {}, auth);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel');
    } finally {
      setBusyId(null);
    }
  };

  if (shipments.length === 0) return null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">🚚 Shipments sent</h3>
      {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}
      <div className="divide-y divide-gray-100">
        {shipments.map(s => (
          <div key={s.shipmentId} className="py-3 flex justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-gray-800">
                #{s.shipmentId} · {formatQty(s.quantitySent, s.unit)} {s.productName} → {s.toName}
              </p>
              {s.carrierName && <p className="text-xs text-gray-500">via {s.carrierName}</p>}
              {s.handlingSteps?.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {s.handlingSteps.map((st, i) => (
                    <li key={i} className="text-xs text-teal-700">
                      📍 {shortWhen(st.recordedAt)} · {st.recorderName || st.stage}{st.notes ? `: ${st.notes}` : ` — ${st.stage}`}
                    </li>
                  ))}
                </ul>
              )}
              <p className="font-mono text-xs text-gray-500">{s.batchId}</p>
              {s.status === 'delivered' && (
                <p className={`text-xs mt-1 ${s.shortfall > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}`}>
                  Received {formatQty(s.quantityReceived, s.unit)}{s.quantityRejected > 0 ? ` · ↩️ ${formatQty(s.quantityRejected, s.unit)} refused (back in your stock)` : ''}{s.shortfall > 0 ? ` · ⚠️ ${formatQty(s.shortfall, s.unit)} missing` : ''}
                </p>
              )}
              {s.status === 'delivered' && s.carrierName && !s.carrierSteps?.out && (
                <p className="text-xs text-amber-700 mt-1">⚠️ {s.carrierName} didn't log "Out for delivery"</p>
              )}
              {s.deliveryNotes && (
                <p className="text-xs text-gray-600 italic mt-1">{s.toName}: "{s.deliveryNotes}"</p>
              )}
              {s.hasDeliveryPhoto && <DeliveryPhotoButton shipmentId={s.shipmentId} token={farmerToken} />}
              {s.productType === 'Livestock' && (s.fciProvided
                ? <p className="text-xs text-green-700 mt-1">📋 Food Chain Information sent</p>
                : fciFor === s.shipmentId ? (
                  <div className="mt-2 space-y-2">
                    <FciFields value={fci} onChange={setFci} disabled={busyId === s.shipmentId} />
                    <button onClick={() => submitFci(s)} disabled={busyId === s.shipmentId}
                      className="text-xs bg-amber-600 text-white px-3 py-1.5 rounded hover:bg-amber-700 disabled:bg-gray-400">
                      {busyId === s.shipmentId ? 'Sending…' : 'Send Food Chain Information'}
                    </button>
                  </div>
                ) : (
                  <button onClick={() => { setFciFor(s.shipmentId); setFci({}); }} className="text-xs text-amber-700 font-semibold hover:underline mt-1">
                    ⚠️ Food Chain Information not sent — send it now
                  </button>
                ))}
            </div>
            <div className="text-right space-y-1">
              <Badge status={s.status} />
              {s.status === 'in_transit' && (
                <button onClick={() => cancel(s)} disabled={busyId === s.shipmentId}
                  className="block text-xs text-red-600 hover:underline ml-auto">
                  {busyId === s.shipmentId ? 'Cancelling…' : 'Cancel'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        Every dispatch, delivery and sale is recorded on <a href={EXPLORER} target="_blank" rel="noopener noreferrer" className="underline">Base Sepolia</a>.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────
// Coming in to the farm: returns, and boxed meat back from the abattoir (private kill).
// Stock received can be sent on to cafés / depots.
// ─────────────────────────────────────────────
export function FarmerReturns({ farmerToken, refreshKey = 0, onChanged }) {
  const [shipments, setShipments] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [qty,    setQty]    = useState({});
  const [send,   setSend]   = useState(null);   // { id, to, quantity, via, notes } — the "send on" form
  const [busyId, setBusyId] = useState(null);
  const [error,  setError]  = useState(null);
  const auth = { headers: { Authorization: `Bearer ${farmerToken}` } };

  const load = () => axios.get(`${API_BASE}/farmer/inbound`, auth)
    .then(res => setShipments(res.data.shipments || []))
    .catch(() => {});
  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => {
    axios.get(`${API_BASE}/participants`).then(r => setParticipants(r.data.participants || [])).catch(() => {});
  }, []);

  const receive = async (s) => {
    setBusyId(s.shipmentId);
    setError(null);
    try {
      const form = new FormData();
      form.append('quantityReceived', String(qty[s.shipmentId] ?? s.quantitySent));
      await axios.post(`${API_BASE}/farmer/shipments/${s.shipmentId}/receive`, form, auth);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm');
    } finally {
      setBusyId(null);
    }
  };

  const sendOn = async () => {
    if (!send.to || !(Number(send.quantity) > 0)) { setError('Choose who to send it to and how much'); return; }
    setBusyId(send.id);
    setError(null);
    try {
      await axios.post(`${API_BASE}/farmer/shipments/${send.id}/forward`,
        { to: send.to, quantity: Number(send.quantity), via: send.via || undefined, notes: send.notes || '' }, auth);
      setSend(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send it on');
    } finally {
      setBusyId(null);
    }
  };

  const incoming = shipments.filter(s => s.status === 'in_transit');
  const inStock = shipments.filter(s => s.status === 'delivered' && s.available > 0);
  const done = shipments.filter(s => s.status === 'delivered' && !(s.available > 0)).slice(0, 10);
  if (shipments.length === 0) return null;
  const fromLabel = (s) => (s.kind === 'return' ? 'back from' : 'from');

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-1">📥 Coming in {incoming.length > 0 && <span className="text-sm bg-yellow-400 text-yellow-900 rounded-full px-2 py-0.5 ml-1">{incoming.length} on the way</span>}</h3>
      <p className="text-sm text-gray-500 mb-4">Returns, and boxed meat back from the abattoir. Confirm how much arrived, then send it on to cafés.</p>
      {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}
      <div className="space-y-3">
        {incoming.map(s => (
          <div key={s.shipmentId} className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-4">
            <p className="font-bold text-gray-800">{formatQty(s.quantitySent, s.unit)} {s.productName} {fromLabel(s)} {s.fromName}</p>
            {s.dispatchNotes && <p className="text-sm text-gray-600 italic">"{s.dispatchNotes}"</p>}
            {s.recalled && <p className="text-xs text-red-700 font-semibold">🚨 Recalled batch</p>}
            <div className="flex gap-2 mt-3 flex-wrap items-center">
              <span className="text-sm text-gray-600">Arrived:</span>
              <input type="number" step="any" min="0" max={s.quantitySent}
                value={qty[s.shipmentId] ?? s.quantitySent}
                onChange={(e) => setQty({ ...qty, [s.shipmentId]: e.target.value })}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" disabled={busyId === s.shipmentId} />
              <span className="text-sm text-gray-500">{s.unit}</span>
              <button onClick={() => receive(s)} disabled={busyId === s.shipmentId}
                className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                {busyId === s.shipmentId ? '⛓️ Recording…' : '✅ Confirm arrived'}
              </button>
            </div>
          </div>
        ))}

        {inStock.map(s => (
          <div key={s.shipmentId} className="border border-green-200 bg-green-50 rounded-lg p-4">
            <div className="flex justify-between gap-2 flex-wrap">
              <p className="font-semibold text-gray-800">{s.productName} {fromLabel(s)} {s.fromName}</p>
              <p className="font-bold text-sm text-gray-800">{formatQty(s.available, s.unit)} in stock</p>
            </div>
            {s.useBy && <p className="text-xs text-gray-500">Use by {new Date(s.useBy).toLocaleDateString('en-GB')}</p>}
            {s.recalled && <p className="text-xs text-red-700 font-semibold">🚨 Recalled — don't send it on</p>}
            {send?.id === s.shipmentId ? (
              <div className="mt-2 space-y-2">
                <select value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                  <option value="">— Send to —</option>
                  {participants.filter(p => p.role !== 'farm').map(p => (
                    <option key={p.address} value={p.address}>{p.name} ({p.role === 'restaurant' ? 'restaurant' : 'depot / handler'})</option>
                  ))}
                </select>
                <select value={send.via} onChange={(e) => setSend({ ...send, via: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                  <option value="">Direct (own delivery)</option>
                  {participants.filter(p => p.role === 'handler' && p.address !== send.to).map(p => <option key={p.address} value={p.address}>via {p.name}</option>)}
                </select>
                <div className="flex gap-2 items-center flex-wrap">
                  <input type="number" step="any" min="0.001" max={s.available} value={send.quantity}
                    onChange={(e) => setSend({ ...send, quantity: e.target.value })}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-sm text-gray-500">{s.unit}</span>
                  <input type="text" maxLength={280} placeholder="Notes (optional)" value={send.notes}
                    onChange={(e) => setSend({ ...send, notes: e.target.value })}
                    className="flex-1 min-w-[8rem] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div className="flex gap-2">
                  <button onClick={sendOn} disabled={busyId === s.shipmentId}
                    className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                    {busyId === s.shipmentId ? '⛓️ Recording…' : '🚚 Send'}
                  </button>
                  <button onClick={() => setSend(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
                </div>
              </div>
            ) : !s.recalled && (
              <button onClick={() => setSend({ id: s.shipmentId, to: '', quantity: String(s.available), via: '', notes: '' })}
                className="mt-2 text-sm text-green-700 font-semibold hover:underline">🚚 Send some on</button>
            )}
          </div>
        ))}

        {done.map(s => (
          <div key={s.shipmentId} className="text-sm text-gray-600 border-b border-gray-100 pb-2">
            #{s.shipmentId} · {formatQty(s.quantityReceived, s.unit)} {s.productName} {fromLabel(s)} {s.fromName}
            <span className="text-gray-400"> · {s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString('en-GB') : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}