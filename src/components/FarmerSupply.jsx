// Farmer dashboard sections for the supply chain: orders, dispatching, shipments
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER, formatQty, shortWhen, batchLink } from './walletHelpers';
import { printDeliveryNote, printInvoice } from './PrintDocs';
import { DeliveryPhotoButton } from './DeliveryPhoto';
import { TxLink } from './ChainProof';
import { useAsk } from './Ask';

// Money helpers — prices are only ever shown to the farm and the restaurant
export const gbp = (v) => (v === null || v === undefined || v === '' || isNaN(Number(v)))
  ? null : `£${Number(v).toFixed(2)}`;
const toNum = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v))) ? null : Number(v);

// v4.3 — references: the order number (HF-0001), the café's PO, the sender's and receiver's own numbers
export function Refs({ x, className = '' }) {
  const list = [
    x.orderRef && ['Order', x.orderRef], x.poNumber && ['PO', x.poNumber],
    x.senderRef && ['Sender ref', x.senderRef], x.receiverRef && ['Goods-in ref', x.receiverRef],
  ].filter(Boolean);
  if (!list.length) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 align-middle ${className}`}>
      {list.map(([k, v]) => <span key={k} className="text-[11px] font-mono bg-gray-100 text-gray-700 border border-gray-200 rounded px-1.5 py-0.5"><span className="font-sans text-gray-500">{k}</span> {v}</span>)}
    </span>
  );
}
export function RefInput({ value, onChange, placeholder = 'Your ref (optional), e.g. invoice or delivery note no.', disabled, className = '' }) {
  return (
    <input type="text" value={value || ''} maxLength={40} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder}
      className={`px-3 py-2 border border-gray-300 rounded-lg text-sm ${className}`} />
  );
}
// v4.4 — a small ⓘ that explains a word in plain English (tap or hover)
export function Tip({ children, className = '' }) {
  const [open, setOpen] = useState(false);
  return (
    <span className={`relative inline-block align-middle ${className}`}>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }} onBlur={() => setOpen(false)}
        className="w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] font-bold leading-4 text-center hover:bg-gray-300" aria-label="What does this mean?">i</button>
      {open && <span className="absolute z-30 left-1/2 -translate-x-1/2 top-5 w-64 text-xs font-normal normal-case tracking-normal text-left text-gray-800 bg-white border border-gray-200 rounded-lg shadow-lg p-2.5">{children}</span>}
    </span>
  );
}
export const TIPS = {
  fingerprint: 'The agreed price and amounts are turned into a unique code (a “fingerprint”) that goes on the blockchain. The prices themselves stay private, but if anyone changed them later the code wouldn’t match.',
  fci: 'Food Chain Information: the legal declarations you make about the animals’ health and medicines before slaughter. Only you and the abattoir can read it; just its fingerprint goes on the blockchain.',
  batch: 'A batch is one lot of produce or one group of animals, e.g. this week’s carrots. Each has its own QR code and record.',
  blockchain: 'A public record that can’t be changed or deleted. Farm Passport writes each step there for you and pays the fee.',
  held: 'What’s still to send on open orders is kept aside, so no other café can order the same stock. Closing or cancelling the rest frees it.',
};

// "£17.00 owed (2 kg refused, not charged)" — the café only pays for what it accepted
export function OwedLine({ o }) {
  if (o.owed === null || o.owed === undefined || o.total === null || o.total === undefined) return null;
  const changed = Math.round(o.owed * 100) !== Math.round(o.total * 100);
  if (!changed && !o.disputed) return null;
  return (
    <p className="text-xs mt-0.5">
      <span className="font-semibold text-gray-800">💷 Owed {gbp(o.owed)}</span>{o.owedFinal ? '' : ' so far'}
      <span className="text-gray-500"> instead of {gbp(o.total)}{o.refusedTotal > 0 ? ` · ${formatQty(o.refusedTotal, o.unit)} refused, not charged` : ''}
        {o.missingTotal > 0 ? ` · ${formatQty(o.missingTotal, o.unit)} didn't arrive${o.disputed ? ' (to decide)' : ''}` : ''}</span>
    </p>
  );
}

const STATUS_BADGE = {
  requested:  'bg-yellow-100 text-yellow-800',
  part_sent:  'bg-amber-200 text-amber-900',
  closed_short: 'bg-gray-200 text-gray-700',
  dispatched: 'bg-green-100 text-green-700',
  declined:   'bg-gray-100 text-gray-600',
  cancelled:  'bg-gray-100 text-gray-600',
  in_transit: 'bg-blue-100 text-blue-700',
  delivered:  'bg-green-100 text-green-700',
};
const STATUS_LABEL = {
  requested: 'New order', part_sent: 'Part sent', closed_short: 'Part sent · rest closed', dispatched: 'Sent', declined: 'Declined', cancelled: 'Cancelled',
  in_transit: 'On its way', delivered: 'Delivered',
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
        🔏 {order.termsAccepted ? 'Price agreed by both sides' : order.shipmentStatus === 'delivered' ? 'Delivered, price not confirmed by the café' : 'Price recorded, waiting for the café to confirm'}
      </span>
      <Tip>{TIPS.fingerprint}</Tip>
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
      <p className="text-sm font-semibold text-amber-900">📋 Food Chain Information <span className="text-red-600">*</span> <span className="font-normal text-amber-800">(required for slaughter)</span> <Tip>{TIPS.fci}</Tip></p>
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

// "4 kg sent so far · 6 kg still to send" (only once something has been sent)
export function SentSoFar({ o }) {
  if (!(o.quantitySent > 0)) return null;
  return (
    <p className="text-xs text-amber-900 font-semibold mt-0.5">
      ✅ {formatQty(o.quantitySent, o.unit)} sent so far ({o.dispatches?.length || 1} deliver{(o.dispatches?.length || 1) === 1 ? 'y' : 'ies'}) · {formatQty(o.outstanding, o.unit)} still to send
    </p>
  );
}

// Sending less than what's left: keep the rest open (back-order) or close it with a message to the café
export function RestChoice({ left, sending, unit, value, onChange }) {
  const rest = Math.round((left - sending) * 1000) / 1000;
  if (!(sending > 0) || rest <= 0) return null;
  const v = value || { close: false, note: '' };
  return (
    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-sm space-y-1">
      <p className="font-semibold text-amber-900">That leaves {formatQty(rest, unit)}. What happens to it?</p>
      <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={!v.close} onChange={() => onChange({ ...v, close: false })} />
        <span><strong>Keep it open</strong> (back-order): send it when you have it. The café sees it's still to come.</span></label>
      <label className="flex items-start gap-2"><input type="radio" className="mt-1" checked={v.close} onChange={() => onChange({ ...v, close: true })} />
        <span><strong>Close the rest</strong>: tell the café it isn't coming.</span></label>
      {v.close && (
        <input value={v.note} maxLength={200} onChange={(e) => onChange({ ...v, note: e.target.value })} placeholder="Message to the café, e.g. Sorry, out of stock until next week"
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
      )}
    </div>
  );
}
// v4.4b — the extras when sending an order, always on show so nothing's missed in a rush
function SendExtras({ o, disabled, carriers, fee, setFee, myRef, setMyRef, via, setVia, note, setNote }) {
  return (
    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">🚚 Delivery charge</span>
        <span className="flex items-center gap-1"><span className="text-gray-500">£</span>
          <input type="number" step="0.01" min="0" value={fee ?? ''} onChange={(e) => setFee(e.target.value)} disabled={disabled}
            placeholder="0.00 (none)" className="w-full px-3 py-2 border border-gray-300 rounded-lg" /></span>
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">🏷️ Your ref <span className="font-normal text-gray-400">(e.g. invoice no.)</span></span>
        <RefInput value={myRef} onChange={setMyRef} disabled={disabled} placeholder="Optional" className="w-full" />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold text-gray-600 mb-1">How it gets there</span>
        <select value={via || ''} onChange={(e) => setVia(e.target.value)} disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
          <option value="">Direct (own delivery)</option>
          {carriers.map(c => <option key={c.address} value={c.address}>via {c.name}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-3">
        <span className="block text-xs font-semibold text-gray-600 mb-1">💬 Note to {o.restaurantName} <span className="font-normal text-gray-400">(optional, only they see it)</span></span>
        <input type="text" maxLength={500} value={note || ''} onChange={(e) => setNote(e.target.value)} disabled={disabled}
          placeholder="e.g. Picked this morning · 2 crates, please return the empty ones" className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
      </label>
    </div>
  );
}

// How each delivery of an order went: what the café accepted and refused, its note and delivery photo
export function DeliveryResults({ o, token, onResolve, busy }) {
  const ds = (o.dispatches || []).filter(d => d.status && d.status !== 'cancelled');
  if (!ds.length) return null;
  return (
    <div className="mt-2 space-y-1">
      {ds.map(d => (
        <div key={d.shipmentId} className="text-xs bg-white/70 border border-gray-200 rounded px-2 py-1.5 space-y-0.5">
          <p className="text-gray-700">
            <span className="font-mono text-gray-500">#{d.shipmentId}</span> · {formatQty(d.quantity, o.unit)}{d.frozenOn ? ' · ❄️ frozen' : ''}{d.fromName && o.isMeat ? ` · from ${d.fromName}` : ''} ·{' '}
            {d.status === 'delivered'
              ? <>✅ <strong>{o.restaurantName}</strong> received {formatQty(d.received ?? d.quantity, o.unit)}
                  {d.refused > 0 && <span className="text-orange-700 font-semibold"> · ↩️ {formatQty(d.refused, o.unit)} refused
                    {d.awaitingReturn > 0 ? ' (coming back: check it in under Deliveries → Coming in)'
                      : d.returnChecked ? ` (${[d.returnChecked.backInStock > 0 && `${formatQty(d.returnChecked.backInStock, o.unit)} back in stock`, d.returnChecked.writtenOff > 0 && `${formatQty(d.returnChecked.writtenOff, o.unit)} written off`].filter(Boolean).join(', ')})` : ''}</span>}
                </>
              : '🚚 on its way'}
            {' '}<TxLink hash={d.sentTxHash} label="Sent" className="ml-1" />{d.status === 'delivered' && <TxLink hash={d.receivedTxHash} label="Received" className="ml-2" />}
          </p>
          <Refs x={{ senderRef: d.senderRef, receiverRef: d.receiverRef }} />
          {d.senderNote && <p className="text-gray-700">📝 Your note: "{d.senderNote}"</p>}
          {d.deliveryNotes && <p className="italic text-gray-700">💬 {o.restaurantName}: "{d.deliveryNotes}"</p>}
          {d.hasDeliveryPhoto && <DeliveryPhotoButton shipmentId={d.shipmentId} token={token} />}
          {d.missing > 0 && (
            <div className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              ⚠️ <strong>{formatQty(d.missing, o.unit)}</strong> didn't arrive (not accepted or refused).{' '}
              {d.missingResolution === 'waived' ? 'Not charged.' : d.missingResolution === 'charged' ? 'Charged (agreed with the café).' : 'Talk to the café, then decide:'}
              {onResolve && (
                <span className="inline-flex gap-2 ml-1">
                  {d.missingResolution !== 'waived' && <button disabled={busy} onClick={() => onResolve(d, 'waived')} className="underline font-semibold">Don't charge</button>}
                  {d.missingResolution !== 'charged' && <button disabled={busy} onClick={() => onResolve(d, 'charged')} className="underline font-semibold">Charge it</button>}
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// v4.4 — email alert settings (farm, café, abattoir): instant alerts and the morning "Today" email
const ALERT_LABELS = {
  farm: {
    new_order: ['New orders', 'A café orders from you'],
    closed: ['Cancelled orders', 'A café cancels an order, or the rest of one'],
    refused: ['Refused goods', 'A café turns some of a delivery away, so it’s coming back'],
    coming_in: ['Coming in to you', 'Boxed meat from the abattoir, or goods sent back to you'],
  },
  cafe: {
    sent: ['Order on its way', 'A farm sends your order, with the order no., your PO, their ref and note'],
    closed: ['Order declined or closed', 'A farm can’t send an order, or the rest of one'],
  },
  abattoir: {
    coming_in: ['Animals on the way', 'A farm sends animals to you'],
    new_order: ['Café orders to send', 'A café orders meat you’re holding'],
    refused: ['Refused cuts', 'A café turns some away, so it’s coming back'],
  },
};
export function AlertSettings({ token, className = '' }) {
  const [p, setP] = useState(null);
  const [saved, setSaved] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  useEffect(() => { axios.get(`${API_BASE}/alerts/prefs`, auth).then(r => setP(r.data)).catch(() => setP({ error: true })); }, [token]);
  const save = async (next) => {
    const before = p;
    const merged = { ...p, ...next, types: { ...(p.types || {}), ...(next.types || {}) } };
    setP(merged); setSaved(false);
    try { await axios.put(`${API_BASE}/alerts/prefs`, { instant: merged.instant, daily: merged.daily, types: merged.types }, auth); setSaved(true); }
    catch (_) { setP(before); }
  };
  if (!p || p.error) return null;
  const labels = ALERT_LABELS[p.role] || {};
  const kinds = (p.available || []).filter(k => labels[k]);
  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
      <h3 className="text-lg font-bold text-gray-800">🔔 Email alerts</h3>
      {p.email ? <p className="text-sm text-gray-500 mb-3">Sent to <strong>{p.email}</strong></p>
        : <p className="text-sm text-amber-800 mb-3">No email on file yet. Ask Farm Passport to add one so you get alerts.</p>}
      <label className="flex items-start gap-3 py-2 cursor-pointer">
        <input type="checkbox" className="mt-1 w-4 h-4" checked={p.instant} onChange={(e) => save({ instant: e.target.checked })} />
        <span><span className="font-semibold text-gray-800">As things happen</span><span className="block text-sm text-gray-500">{kinds.length ? 'Choose which ones:' : 'New orders, deliveries on their way, refused goods.'}</span></span>
      </label>
      {kinds.length > 0 && (
        <div className={`ml-7 mb-1 border-l-2 border-gray-100 pl-3 ${p.instant ? '' : 'opacity-50'}`}>
          {kinds.map(k => (
            <label key={k} className="flex items-start gap-3 py-1.5 cursor-pointer">
              <input type="checkbox" className="mt-1 w-4 h-4" disabled={!p.instant} checked={p.types?.[k] !== false}
                onChange={(e) => save({ types: { [k]: e.target.checked } })} />
              <span><span className="text-sm font-semibold text-gray-800">{labels[k][0]}</span><span className="block text-xs text-gray-500">{labels[k][1]}</span></span>
            </label>
          ))}
        </div>
      )}
      <label className="flex items-start gap-3 py-2 cursor-pointer">
        <input type="checkbox" className="mt-1 w-4 h-4" checked={p.daily} onChange={(e) => save({ daily: e.target.checked })} />
        <span><span className="font-semibold text-gray-800">Morning summary</span><span className="block text-sm text-gray-500">One email first thing with what needs doing today. Only sent when there's something to do.</span></span>
      </label>
      <p className="text-xs text-gray-400 mt-1">Account emails, like being approved, always come through.</p>
      {saved && <p className="text-xs text-green-700">✓ Saved</p>}
    </div>
  );
}

// v4.4 — a getting-started checklist. Hides itself when everything's done (or when dismissed on this device).
export function Checklist({ title = 'Getting started', steps, storageKey }) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(storageKey) === '1'; } catch { return false; } });
  const done = steps.filter(x => x.done).length;
  if (hidden || done === steps.length) return null;
  const next = steps.find(x => !x.done);
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-green-200">
      <div className="flex justify-between items-start gap-3">
        <div>
          <h3 className="text-lg font-bold text-gray-800">🚀 {title}</h3>
          <p className="text-sm text-gray-500">{done} of {steps.length} done</p>
        </div>
        <button onClick={() => { setHidden(true); try { localStorage.setItem(storageKey, '1'); } catch { /* fine */ } }} className="text-xs text-gray-400 hover:text-gray-600">Hide</button>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full my-3 overflow-hidden"><div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="space-y-2">
        {steps.map((x, i) => (
          <li key={i} className={`flex gap-3 items-start ${x.done ? 'text-gray-400' : 'text-gray-800'}`}>
            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${x.done ? 'bg-green-100 text-green-700' : x === next ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{x.done ? '✓' : i + 1}</span>
            <span className="flex-1">
              <span className={x.done ? 'line-through' : 'font-semibold'}>{x.label}</span>
              {!x.done && x.hint && <span className="block text-sm text-gray-500">{x.hint}</span>}
              {!x.done && x === next && x.action && <button onClick={x.action.onClick} className="mt-1 text-sm font-semibold text-green-700 hover:underline">{x.action.label} →</button>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// v4.4 — print the paperwork for an order: a delivery note for the driver, and an invoice for what's owed
export function PrintButtons({ o, className = '' }) {
  const [blocked, setBlocked] = useState(false);
  const ds = (o.dispatches || []).filter(d => d.status && d.status !== 'cancelled');
  if (!ds.length) return null;
  const order = { orderRef: o.orderRef, poNumber: o.poNumber, productName: o.productName, unit: o.unit, quantity: o.quantity, owed: o.owed, total: o.total, paymentStatus: o.paymentStatus };
  const go = (ok) => setBlocked(ok === false);
  return (
    <span className={`inline-flex gap-3 items-center text-xs ${className}`}>
      <button type="button" onClick={() => go(printDeliveryNote({ from: o.sentByName || o.farmName, to: o.restaurantName, order, deliveries: ds, journeyUrl: batchLink(ds[0].batchId) }))}
        className="text-gray-700 hover:underline">🖨️ Delivery note</button>
      {(o.total != null || o.owed != null) && (
        <button type="button" onClick={() => go(printInvoice({ seller: o.farmName, buyer: o.restaurantName, order, deliveries: ds }))} className="text-gray-700 hover:underline">🧾 Invoice</button>
      )}
      {blocked && <span className="text-red-600">Allow pop-ups for this site to print</span>}
    </span>
  );
}

// v4.4 — money at a glance: owed to the farm (sent, not marked paid), by café, and what's been paid this month
export function MoneyPanel({ orders }) {
  const sent = orders.filter(o => ['dispatched', 'part_sent', 'closed_short'].includes(o.status));
  const amount = (o) => Number(o.owed ?? o.total ?? 0);
  const unpaid = sent.filter(o => o.paymentStatus !== 'paid' && amount(o) > 0);
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const paidMonth = sent.filter(o => o.paymentStatus === 'paid' && new Date(o.updatedAt || o.createdAt) >= since);
  const byCafe = Object.values(unpaid.reduce((m, o) => {
    const c = m[o.restaurantName] || (m[o.restaurantName] = { name: o.restaurantName, owed: 0, n: 0, oldest: o.createdAt });
    c.owed = Math.round((c.owed + amount(o)) * 100) / 100; c.n++; if (new Date(o.createdAt) < new Date(c.oldest)) c.oldest = o.createdAt;
    return m;
  }, {})).sort((a, b) => b.owed - a.owed);
  const total = Math.round(unpaid.reduce((n, o) => n + amount(o), 0) * 100) / 100;
  const paid = Math.round(paidMonth.reduce((n, o) => n + amount(o), 0) * 100) / 100;
  if (!sent.length) return null;
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-3">💷 Money</h3>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3"><p className="text-xs text-amber-900">Owed to you</p><p className="text-2xl font-bold text-gray-900">{gbp(total) || '£0.00'}</p><p className="text-xs text-gray-600">{unpaid.length} order{unpaid.length === 1 ? '' : 's'} not marked paid</p></div>
        <div className="bg-green-50 border border-green-200 rounded-lg p-3"><p className="text-xs text-green-900">Paid this month</p><p className="text-2xl font-bold text-gray-900">{gbp(paid) || '£0.00'}</p><p className="text-xs text-gray-600">{paidMonth.length} order{paidMonth.length === 1 ? '' : 's'}</p></div>
      </div>
      {byCafe.length > 0 && (
        <div className="divide-y divide-gray-100 text-sm">
          {byCafe.map(c => (
            <div key={c.name} className="py-1.5 flex justify-between gap-3">
              <span>{c.name} <span className="text-gray-500">· {c.n} order{c.n === 1 ? '' : 's'} · oldest {new Date(c.oldest).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span></span>
              <span className="font-semibold">{gbp(c.owed)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-500 mt-2">Cafés pay you directly for now. Tick <strong>Paid</strong> on an order when the money arrives. Amounts only count what each café accepted.</p>
    </div>
  );
}

// Goods refused at the door come back to whoever sent them. Nothing goes back into stock until they're checked:
// some (or all) back in stock, the rest written off with a reason. Both are recorded on the blockchain.
export function ReturnCheck({ s, token, base = 'farmer', onDone }) {
  const [back,  setBack]  = useState(String(s.awaitingReturn));
  const [notes, setNotes] = useState('');
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState(null);
  const b = toNum(back);
  const off = b === null ? null : Math.round((s.awaitingReturn - b) * 1000) / 1000;
  const bad = b === null || b < 0 || off < 0;
  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await axios.post(`${API_BASE}/${base}/shipments/${s.shipmentId}/confirm-return`, { backInStock: b, notes }, { headers: { Authorization: `Bearer ${token}` } });
      onDone?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not record it');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-2 border-orange-300 bg-orange-50 rounded-lg p-3 text-sm space-y-2">
      <p className="text-gray-800">
        ↩️ <strong>{s.toName}</strong> refused <strong>{formatQty(s.awaitingReturn, s.unit)}</strong> of {s.productName} (delivery #{s.shipmentId}
        {s.deliveredAt ? `, ${new Date(s.deliveredAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}).
        {s.deliveryNotes && <span className="italic text-gray-600"> "{s.deliveryNotes}"</span>}
      </p>
      <p className="text-xs text-gray-600">When it's back with you, check it. Until then it isn't in your stock, so it can't be ordered or sent again.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-gray-700">Back in stock</label>
        <input type="number" step="any" min="0" max={s.awaitingReturn} value={back} onChange={(e) => setBack(e.target.value)} disabled={busy}
          className={`w-24 px-2 py-1 border rounded ${bad ? 'border-red-500' : 'border-gray-300'}`} />
        <span className="text-gray-500">{s.unit}</span>
        {off > 0 && <span className="text-orange-800 font-semibold">· write off {formatQty(off, s.unit)}</span>}
        <button type="button" onClick={() => setBack('0')} className="text-xs text-gray-600 hover:underline" disabled={busy}>Write it all off</button>
      </div>
      {off > 0 && (
        <input value={notes} maxLength={280} onChange={(e) => setNotes(e.target.value)} disabled={busy}
          placeholder="Why is it written off? e.g. damaged in transit, out of temperature *"
          className="w-full px-2 py-1.5 border border-gray-300 rounded" />
      )}
      {error && <p className="text-xs text-red-600">⚠️ {error}</p>}
      <button onClick={submit} disabled={busy || bad || (off > 0 && !notes.trim())}
        className="bg-orange-600 text-white text-sm font-semibold px-4 py-1.5 rounded-lg hover:bg-orange-700 disabled:bg-gray-400">
        {busy ? '⛓️ Recording…' : off > 0 ? (b > 0 ? `✔ ${formatQty(b, s.unit)} back in stock, write off ${formatQty(off, s.unit)}` : `✔ Write off ${formatQty(off, s.unit)}`) : `✔ All ${formatQty(b, s.unit)} back in stock`}
      </button>
    </div>
  );
}

// "Send frozen": the date it was frozen goes on the delivery record and the agreed terms
export function FrozenChoice({ value, onChange, wanted, disabled }) {
  const v = value || { on: !!wanted, date: new Date().toISOString().slice(0, 10) };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5 cursor-pointer">
        <input type="checkbox" checked={v.on} disabled={disabled} onChange={(e) => onChange({ ...v, on: e.target.checked })} />
        <span>❄️ Send frozen</span>
      </label>
      {v.on && <>
        <span className="text-gray-500">frozen on</span>
        <input type="date" value={v.date} max={new Date().toISOString().slice(0, 10)} disabled={disabled} onChange={(e) => onChange({ ...v, date: e.target.value })}
          className="px-2 py-1 border border-gray-300 rounded" />
      </>}
      {wanted && !v.on && <span className="text-xs text-amber-700">The café asked for it frozen</span>}
    </div>
  );
}
export const frozenBody = (v, wanted) => {
  const x = v || { on: !!wanted, date: new Date().toISOString().slice(0, 10) };
  return x.on ? { frozen: true, frozenOn: x.date } : {};
};

export function FarmerOrders({ farmerToken, approved, onChanged, refreshKey = 0 }) {
  const [orders,  setOrders]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState(null);
  const [error,   setError]   = useState(null);
  const [alloc,   setAlloc]   = useState({});     // orderId → [{ batchId, quantity, unitPrice }] being sent
  const [via,     setVia]     = useState({});     // orderId → depot / courier address ('' = direct)
  const [fee,     setFee]     = useState({});     // orderId → delivery charge (£)
  const [rest,    setRest]    = useState({});     // orderId → { close, note } when sending only part
  const [frz,     setFrz]     = useState({});     // orderId → { on, date } — meat sent frozen
  const [myRef,   setMyRef]   = useState({});     // orderId → the farm's own reference (invoice / delivery note no.)
  const [sendNote, setSendNote] = useState({});   // orderId → a note to the café with this delivery (private) — v4.4b
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
      setAlloc({}); setSendNote({});
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

  const open = orders.filter(o => o.open ?? o.status === 'requested');
  const done = orders.filter(o => !(o.open ?? o.status === 'requested')).slice(0, 20);
  // Decline a new order, or close what's left of a part-sent one
  const [ask, askNode] = useAsk();
  const closeOrDecline = async (o) => {
    const part = o.status === 'part_sent';
    const note = await ask(part
      ? { title: `Close the remaining ${formatQty(o.outstanding, o.unit)}?`, text: `${o.restaurantName} will see your message. What's already been sent stays.`, input: { placeholder: 'Message to the café, e.g. sorry, out of stock until next week' }, confirmLabel: 'Close the rest', danger: true }
      : { title: `Decline ${o.restaurantName}'s order?`, text: `${formatQty(o.quantity, o.unit)} ${o.productName}. They'll get an email.`, input: { placeholder: 'Reason (optional), e.g. none left this week' }, confirmLabel: 'Decline order', danger: true });
    if (note !== null) act(o, 'decline', { note });
  };
  const resolve = (o) => (d, resolution) => act(o, 'missing', { shipmentId: d.shipmentId, resolution });
  const restBody = (o, sendQty) => (sendQty < o.outstanding && rest[o.id]?.close ? { closeRest: true, shortNote: rest[o.id].note || undefined } : {});

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      {askNode}
      <h3 className="text-xl font-bold text-gray-800 mb-1">🧾 Orders {open.length > 0 && <span className="text-sm bg-yellow-400 text-yellow-900 rounded-full px-2 py-0.5 ml-1">{open.length} new</span>}</h3>
      <p className="text-sm text-gray-500 mb-4">Cafés order from you here. Sending an order records it on the blockchain <Tip>{TIPS.blockchain}</Tip>. Meat orders are sent by whoever holds the cuts (you or the abattoir).
        Stock still to send on open orders is <strong>held</strong> for them <Tip>{TIPS.held}</Tip>.</p>

      {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500">No orders yet.</p>
      ) : (
        <div className="space-y-3">
          {open.filter(o => o.isMeat).map(o => {
            const ready = o.readyAtAbattoir || 0;
            const atFarm = o.readyAtFarm || 0;
            const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            // Boxed cuts back at the farm: the farm sends from those deliveries itself
            const plan = alloc[o.id] || (o.suggestion?.allocations || []).map(a => ({ ...a, unitPrice: a.pricePerUnit ?? '' }));
            const setPlan = (next) => setAlloc({ ...alloc, [o.id]: next });
            const sendQty = Math.round(plan.reduce((n, a) => n + (toNum(a.quantity) || 0), 0) * 1000) / 1000;
            const df = toNum(fee[o.id]) || 0;
            const priced = plan.every(a => toNum(a.unitPrice) !== null);
            const total = priced ? Math.round((plan.reduce((n, a) => n + (toNum(a.quantity) || 0) * toNum(a.unitPrice), 0) + df) * 100) / 100 : null;
            return (
              <div key={o.id} className="border-2 border-rose-200 bg-rose-50 rounded-lg p-4">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div>
                    <p className="font-bold text-gray-800">{o.restaurantName} <Refs x={o} className="ml-1" /></p>
                    <p className="text-sm text-gray-700">wants <strong>{formatQty(o.quantity, o.unit)}</strong> of {o.productName} {o.preOrder && <span className="text-xs font-semibold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">pre-order</span>}
                      {o.frozen && <span className="ml-1 text-xs font-semibold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">❄️ frozen please</span>}</p>
                    <SentSoFar o={o} />
                    <DeliveryResults o={o} token={farmerToken} onResolve={resolve(o)} busy={busyId === o.id} />
                    <PrintButtons o={o} className="mt-1" />
                    {o.neededUntil && <p className="text-xs text-gray-600">Needed by {day(o.neededUntil)}</p>}
                    {o.note && <p className="text-sm text-gray-600 italic mt-1">"{o.note}"</p>}
                    {o.unitPrice != null && <p className="text-xs text-gray-700 mt-1">💷 {gbp(o.unitPrice)}/{o.unit} from your meat prices ≈ {gbp(o.unitPrice * o.quantity)}</p>}
                  </div>
                  <Badge status={o.status} />
                </div>
                {atFarm > 0 && (
                  <div className="mt-3 bg-white border border-rose-200 rounded-lg p-3">
                    <p className="text-sm font-semibold text-gray-800 mb-1">📦 You have {formatQty(atFarm, o.unit)} here (boxed cuts back from the abattoir). Send it yourself:</p>
                    {plan.map((a, i) => (
                      <div key={a.shipmentId} className="flex gap-2 items-center flex-wrap text-sm mb-1">
                        <span className="text-xs text-gray-600 w-44">delivery #{a.shipmentId}{a.lotRef ? ` · lot ${a.lotRef}` : ''}</span>
                        <span className="text-xs text-gray-500 w-24">use by {a.useBy ? day(a.useBy) : '—'}</span>
                        <input type="number" step="any" min="0" max={a.remaining} value={a.quantity}
                          onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))}
                          className="w-20 px-2 py-1 border border-gray-300 rounded" disabled={busyId === o.id} />
                        <span className="text-gray-500">{o.unit}</span>
                        <span className="text-gray-500 ml-1">£</span>
                        <input type="number" step="0.01" min="0" value={a.unitPrice}
                          onChange={(e) => setPlan(plan.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))}
                          placeholder="price" className="w-20 px-2 py-1 border border-gray-300 rounded" disabled={busyId === o.id} />
                        <span className="text-xs text-gray-500">/{o.unit}</span>
                      </div>
                    ))}
                    <RestChoice left={o.outstanding} sending={sendQty} unit={o.unit} value={rest[o.id]} onChange={(v) => setRest({ ...rest, [o.id]: v })} />
                    <div className="mt-2"><FrozenChoice value={frz[o.id]} wanted={o.frozen} disabled={busyId === o.id} onChange={(v) => setFrz({ ...frz, [o.id]: v })} /></div>
                    <SendExtras o={o} disabled={busyId === o.id} carriers={carriers}
                      fee={fee[o.id]} setFee={(v) => setFee({ ...fee, [o.id]: v })}
                      myRef={myRef[o.id]} setMyRef={(v) => setMyRef({ ...myRef, [o.id]: v })}
                      via={via[o.id]} setVia={(v) => setVia({ ...via, [o.id]: v })}
                      note={sendNote[o.id]} setNote={(v) => setSendNote({ ...sendNote, [o.id]: v })} />
                    <p className="mt-2 text-sm font-semibold text-gray-800">
                      {formatQty(sendQty, o.unit)} · {total != null ? <>Total {gbp(total)}</> : <span className="text-gray-400 font-normal">set prices to see the total</span>}
                    </p>
                    <button
                      onClick={() => act(o, 'dispatch', {
                        allocations: plan.map(a => ({ shipmentId: a.shipmentId, quantity: toNum(a.quantity), unitPrice: toNum(a.unitPrice) ?? undefined })),
                        via: via[o.id] || undefined, deliveryFee: toNum(fee[o.id]) ?? undefined, ...restBody(o, sendQty), ...frozenBody(frz[o.id], o.frozen),
                        senderRef: myRef[o.id] || undefined, cafeNote: (sendNote[o.id] || '').trim() || undefined,
                      })}
                      disabled={busyId === o.id || !approved || !plan.length || !(sendQty > 0)}
                      className="mt-2 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                      {busyId === o.id ? '⛓️ Recording… (about 5 sec)' : `🚚 Send ${formatQty(sendQty, o.unit)} to ${o.restaurantName}`}
                    </button>
                  </div>
                )}
                <p className="text-sm mt-2 text-gray-800">
                  {atFarm >= o.outstanding ? null
                    : ready >= o.outstanding
                    ? <>🔪 Ready at <strong>{(o.abattoirNames || []).join(', ') || 'the abattoir'}</strong>. They'll send it to the café{atFarm > 0 ? ', unless you send yours first' : ''}.</>
                    : ready > 0
                      ? <>🔪 {formatQty(ready, o.unit)} ready at {(o.abattoirNames || []).join(', ')}{atFarm > 0 ? `, ${formatQty(atFarm, o.unit)} here` : ''}; the rest still needs cutting.</>
                      : atFarm > 0 ? <>📋 The rest is on your cutting list for the abattoir.</>
                      : <>📋 On your cutting list: the abattoir will see it when it cuts your next {o.species === 'Sheep' ? 'lambs' : o.species === 'Pig' ? 'pigs' : 'animal'}.</>}
                </p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => closeOrDecline(o)}
                    disabled={busyId === o.id} className="text-sm text-gray-600 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50 bg-white">
                    {o.status === 'part_sent' ? `Close the rest (${formatQty(o.outstanding, o.unit)})` : 'Decline'}</button>
                </div>
              </div>
            );
          })}

          {open.filter(o => !o.isMeat).map(o => {
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
                  <p className="font-bold text-gray-800">{o.restaurantName} <Refs x={o} className="ml-1" /></p>
                  <p className="text-sm text-gray-700">
                    wants <strong>{formatQty(o.quantity, o.unit)}</strong> of {o.productName}{o.isDeal ? ' 🏷️ (your short-date deal)' : ''}
                  </p>
                  <SentSoFar o={o} />
                  <DeliveryResults o={o} token={farmerToken} onResolve={resolve(o)} busy={busyId === o.id} />
                    <PrintButtons o={o} className="mt-1" />
                  {o.neededUntil && <p className="text-xs text-gray-600">Needs to last until {day(o.neededUntil)}</p>}
                  {o.note && <p className="text-sm text-gray-600 italic mt-1">"{o.note}"</p>}
                </div>
                <Badge status={o.status} />
              </div>

              {/* v4.4b: everything on show — batches and prices, then delivery charge, your ref, courier and a note to the café */}
              <div className="mt-3 bg-white border border-yellow-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-700 mb-2">Send from (soonest use-by first):</p>
                {plan.length === 0 && <p className="text-sm text-red-600">Nothing left that matches this order.</p>}
                {plan.map((a, i) => (
                  <div key={a.batchId} className="flex gap-2 items-center flex-wrap text-sm mb-1">
                    <span className="font-mono text-xs text-gray-600 w-40 truncate" title={a.batchId}>{a.batchId}</span>
                    <span className="text-xs text-gray-500 w-24">{a.useBy ? `use by ${day(a.useBy)}` : 'no use-by'}</span>
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
                {o.suggestion?.shortBy > 0 && <p className="text-xs text-amber-700 mt-1">⚠️ You're {formatQty(o.suggestion.shortBy, o.unit)} short. Send what you have now, then keep the rest open or close it.</p>}
                {plan.length > 1 && <p className="text-xs text-gray-500 mt-1">Goes as {plan.length} deliveries, one per batch, each recorded on-chain.</p>}
                <SendExtras o={o} disabled={busyId === o.id} carriers={carriers}
                  fee={fee[o.id]} setFee={(v) => setFee({ ...fee, [o.id]: v })}
                  myRef={myRef[o.id]} setMyRef={(v) => setMyRef({ ...myRef, [o.id]: v })}
                  via={via[o.id]} setVia={(v) => setVia({ ...via, [o.id]: v })}
                  note={sendNote[o.id]} setNote={(v) => setSendNote({ ...sendNote, [o.id]: v })} />
                <p className="mt-2 text-sm font-semibold text-gray-800">
                  {formatQty(Math.round(sendQty * 1000) / 1000, o.unit)} · {total != null ? <>Total {gbp(total)}{df > 0 ? <span className="font-normal text-gray-500"> (incl. {gbp(df)} delivery)</span> : null}</> : <span className="text-gray-400 font-normal">set prices to see the total</span>}
                </p>
              </div>
              <RestChoice left={o.outstanding ?? o.quantity} sending={Math.round(sendQty * 1000) / 1000} unit={o.unit} value={rest[o.id]} onChange={(v) => setRest({ ...rest, [o.id]: v })} />
              <div className="flex gap-2 mt-3 flex-wrap items-center">
                <button
                  onClick={() => act(o, 'dispatch', {
                    allocations: plan.map(a => ({ batchId: a.batchId, quantity: toNum(a.quantity), unitPrice: toNum(a.unitPrice) ?? undefined })),
                    via: via[o.id] || undefined,
                    deliveryFee: toNum(fee[o.id]) ?? undefined,
                    ...restBody(o, Math.round(sendQty * 1000) / 1000),
                    senderRef: myRef[o.id] || undefined,
                    cafeNote: (sendNote[o.id] || '').trim() || undefined,
                  })}
                  disabled={busyId === o.id || !approved || !plan.length || !(sendQty > 0)}
                  className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {busyId === o.id ? '⛓️ Recording… (about 5 sec)' : sendQty > 0 && sendQty < (o.outstanding ?? o.quantity) ? `🚚 Send ${formatQty(Math.round(sendQty * 1000) / 1000, o.unit)} now` : `🚚 Send ${formatQty(Math.round(sendQty * 1000) / 1000, o.unit)} to ${o.restaurantName}`}
                </button>
                <button
                  onClick={() => closeOrDecline(o)}
                  disabled={busyId === o.id}
                  className="text-sm text-gray-600 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50"
                >
                  {o.status === 'part_sent' ? `Close the rest (${formatQty(o.outstanding, o.unit)})` : 'Decline'}
                </button>
              </div>
            </div>
            );
          })}

          {done.map(o => (
            <div key={o.id} className="border border-gray-200 rounded-lg p-4 flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{o.restaurantName} · {formatQty(o.quantitySent ?? o.quantity, o.unit)} {o.productName} <Refs x={o} className="ml-1" /></p>
                {o.status === 'closed_short' && (
                  <p className="text-xs text-gray-700">Ordered {formatQty(o.quantity, o.unit)}, sent {formatQty(o.quantitySent || 0, o.unit)}. Rest closed{o.farmerNote ? `: "${o.farmerNote}"` : ''}</p>
                )}
                {o.isMeat && o.sentByName && <p className="text-xs text-gray-600">🔪 Sent by {o.sentByName}</p>}
                {o.note && <p className="text-xs text-gray-500 italic">Order note: "{o.note}"</p>}
                <p className="font-mono text-xs text-gray-400">
                  {o.dispatches?.length ? o.dispatches.map(d => d.batchId).join(' + ') : `${o.batchId || ''}${o.shipmentId ? ` · shipment #${o.shipmentId}` : ''}`}
                </p>
                <DeliveryResults o={o} token={farmerToken} onResolve={resolve(o)} busy={busyId === o.id} />
                <PrintButtons o={o} className="mt-1" />
                {o.total != null && (
                  <p className="text-xs text-gray-700 mt-1">
                    💷 {o.unitPrice != null && <>{gbp(o.unitPrice)}/{o.unit}</>}
                    {o.deliveryFee ? <> + {gbp(o.deliveryFee)} delivery</> : null}
                    {' '}= <strong>{gbp(o.total)}</strong>{o.totalIsEstimate ? ' (estimate)' : ''}
                  </p>
                )}
                <OwedLine o={o} />
                <TermsCheck order={o} token={farmerToken} />
              </div>
              <div className="text-right space-y-1 shrink-0">
                {/* Once the restaurant confirms, show "Delivered" instead of "Dispatched" */}
                <Badge status={o.status === 'dispatched' && o.shipmentStatus === 'delivered' ? 'delivered' : o.status} />
                {(o.status === 'dispatched' || o.status === 'closed_short') && (
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
export function DispatchForm({ farmerToken, batch, batches = [], preselected = [], onDone, onCancel }) {
  const [participants, setParticipants] = useState([]);
  const [to,       setTo]       = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes,    setNotes]    = useState('');
  const [myRef,    setMyRef]    = useState('');     // the farm's own reference (v4.3)
  const [via,      setVia]      = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);
  const [progress, setProgress] = useState(null);
  const [preOrders, setPreOrders] = useState([]);     // café pre-orders waiting for this species (the cutting list)
  const auth = { headers: { Authorization: `Bearer ${farmerToken}` } };

  const remaining = Number(batch.quantityRemaining ?? batch.quantity);
  // Live animals only go to approved abattoirs, with Food Chain Information
  const isLivestock = batch.productType === 'Livestock';
  const [fci, setFci] = useState({});
  const [sent, setSent] = useState({});             // batchId → shipmentId already dispatched (so a retry only re-sends the FCI)
  const choices = isLivestock ? participants.filter(p => p.processorApproval) : participants;
  const left = (b) => Number(b.quantityRemaining ?? b.quantity);

  // Livestock: every animal / group that could go in this load, one row each (its own head count and live weight)
  const candidates = isLivestock
    ? [batch, ...batches.filter(b => b.batchId !== batch.batchId && b.productType === 'Livestock' && !b.recalled && left(b) > 0)]
    : [];
  const [load, setLoad] = useState(() => Object.fromEntries([batch.batchId, ...preselected].map(id => [id, { on: true }])));
  const rowOf = (b) => load[b.batchId] || {};
  const setRow = (b, k, v) => setLoad({ ...load, [b.batchId]: { ...rowOf(b), [k]: v } });
  const headOf = (b) => (b.species === 'Cattle' ? 1 : Number(rowOf(b).head ?? left(b)));
  const inLoad = candidates.filter(b => rowOf(b).on);
  const [showAll, setShowAll] = useState(false);
  const listed = showAll ? candidates : candidates.filter(b => rowOf(b).on || b.species === batch.species).slice(0, Math.max(8, inLoad.length));

  useEffect(() => {
    axios.get(`${API_BASE}/participants`)
      .then(res => setParticipants(res.data.participants || []))
      .catch(() => setError('Could not load the list of businesses'));
    if (isLivestock) {
      axios.get(`${API_BASE}/farmer/orders`, auth)
        .then(res => setPreOrders((res.data.orders || []).filter(o => o.isMeat && o.open
          && (o.readyAtAbattoir || 0) + (o.readyAtFarm || 0) < o.outstanding)))
        .catch(() => {});
    }
  }, []);

  const qty = Number(quantity);
  const badHead = inLoad.find(b => !(Number.isInteger(headOf(b)) && headOf(b) >= 1 && headOf(b) <= left(b)));
  const missing = [
    !to && (isLivestock ? 'the abattoir' : 'who it goes to'),
    isLivestock ? (!inLoad.length && 'at least one animal') : !(qty > 0) && 'how much',
    !isLivestock && qty > remaining && `no more than ${formatQty(remaining, batch.unit)}`,
    badHead && `a head count for ${badHead.animalRef || badHead.batchId} (1–${left(badHead)})`,
    isLivestock && !fciComplete(fci) && 'the three FCI declarations',
  ].filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    if (missing.length) { setError(`Still needed: ${missing.join(', ')}`); return; }
    setBusy(true);
    setError(null);
    const loads = isLivestock
      ? inLoad.map(b => {
          const lw = Number(rowOf(b).weight) > 0 ? `Approx. live weight ${Number(rowOf(b).weight)} kg${b.species === 'Cattle' ? '' : ' each'}` : '';
          return { b, q: headOf(b), notes: [lw, notes.trim()].filter(Boolean).join(' · ').slice(0, 280) };
        })
      : [{ b: batch, q: qty, notes: notes.trim() }];
    const done = { ...sent };
    try {
      for (const [i, l] of loads.entries()) {
        if (loads.length > 1) setProgress(`Sending ${i + 1} of ${loads.length}…`);
        if (done[l.b.batchId] === 'done') continue;
        let shipmentId = done[l.b.batchId];
        if (!shipmentId) {
          const res = await axios.post(`${API_BASE}/farmer/dispatch`,
            { batchId: l.b.batchId, to, quantity: l.q, notes: l.notes, via: via || undefined, senderRef: myRef || undefined }, auth);
          shipmentId = res.data.shipmentId;
          done[l.b.batchId] = shipmentId;
          setSent({ ...done });
        }
        if (isLivestock) await sendFci(shipmentId, fci, farmerToken);
        done[l.b.batchId] = 'done';
        setSent({ ...done });
      }
      onDone?.();
    } catch (err) {
      const why = err.response?.data?.error || 'Could not dispatch';
      const n = Object.values(done).filter(v => v === 'done').length;
      setError(`${n ? `${n} sent. ` : ''}${Object.values(done).some(v => v && v !== 'done') ? 'An animal is on its way but its Food Chain Information didn’t send — press the button again to resend it. ' : ''}${why}`);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const Req = () => <span className="text-red-600 font-bold">*</span>;
  const pending = Object.values(sent).some(v => v && v !== 'done');
  return (
    <form onSubmit={submit} className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-semibold text-gray-700">
        {isLivestock ? '🐄 Send to an abattoir' : `🚚 Send part of this batch · ${formatQty(remaining, batch.unit)} still at the farm`}
      </p>
      <label className="block text-xs font-semibold text-gray-700">{isLivestock ? 'Abattoir' : 'Send to'} <Req />
        <select value={to} onChange={(e) => setTo(e.target.value)} disabled={Object.keys(sent).length > 0}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-normal">
          <option value="">Choose…</option>
          {choices.map(p => (
            <option key={p.address} value={p.address}>
              {p.name} ({p.processorApproval ? `abattoir / processor · ${p.processorApproval}` : p.role === 'restaurant' ? 'restaurant' : 'depot / handler'})
            </option>
          ))}
        </select>
      </label>
      {isLivestock && choices.length === 0 && (
        <p className="text-xs text-red-600">No abattoirs are approved on Farm Passport yet — ask the admin to add yours.</p>
      )}
      <label className="block text-xs font-semibold text-gray-700">Haulage
        <select value={via} onChange={(e) => setVia(e.target.value)}
          className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-normal">
          <option value="">Own transport</option>
          {participants.filter(p => p.role === 'handler' && p.address !== to).map(p => (
            <option key={p.address} value={p.address}>via {p.name}</option>
          ))}
        </select>
      </label>

      {isLivestock ? (
        <div className="bg-white border border-gray-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-gray-700">Animals in this load <Req /> <span className="font-normal text-gray-500">— tick each one going; live weight is optional</span></p>
          <div className="mt-2 space-y-1.5">
            {listed.map(b => {
              const r = rowOf(b);
              const cattle = b.species === 'Cattle';
              return (
                <div key={b.batchId} className={`flex items-center gap-2 flex-wrap text-sm rounded px-1.5 py-1 ${r.on ? 'bg-green-50' : ''}`}>
                  <input type="checkbox" checked={!!r.on} disabled={!!sent[b.batchId]} onChange={(e) => setRow(b, 'on', e.target.checked)} className="accent-green-600" aria-label={`Send ${b.animalRef || b.batchId}`} />
                  <span className="flex-1 min-w-[10rem]">
                    <span className="font-mono text-xs">{b.animalRef || b.batchId}</span>{' '}
                    <span className="text-xs text-gray-500">{b.species}{b.breed ? ` · ${b.breed}` : ''}{b.harvestDate ? ` · born ${new Date(b.harvestDate).toLocaleDateString('en-GB')}` : ''}</span>
                    {sent[b.batchId] === 'done' && <span className="text-xs text-green-700 font-semibold"> ✓ sent</span>}
                  </span>
                  {r.on && (
                    <>
                      {cattle ? <span className="text-xs text-gray-500 w-20">1 head</span> : (
                        <span className="flex items-center gap-1 w-20">
                          <input type="number" min="1" step="1" max={left(b)} value={r.head ?? left(b)} onChange={(e) => setRow(b, 'head', e.target.value)}
                            className="w-12 px-1 py-0.5 border border-gray-300 rounded text-xs" aria-label="Head" />
                          <span className="text-xs text-gray-500">/{left(b)}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <input type="number" min="0" step="any" value={r.weight || ''} onChange={(e) => setRow(b, 'weight', e.target.value)} placeholder={cattle ? '550' : '40'}
                          className="w-16 px-1 py-0.5 border border-gray-300 rounded text-xs" aria-label="Approx. live weight" />
                        <span className="text-xs text-gray-500">kg{cattle ? '' : ' each'}</span>
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {listed.length < candidates.length && (
            <button type="button" onClick={() => setShowAll(true)} className="text-xs text-blue-600 hover:underline mt-1">Show all {candidates.length} animals</button>
          )}
          <p className="text-xs text-gray-500 mt-2">
            {inLoad.length} batch{inLoad.length === 1 ? '' : 'es'} · {inLoad.reduce((n, b) => n + (headOf(b) || 0), 0)} head. Each becomes its own delivery, with the same FCI.
            You're paid on the <strong>cold carcass weight</strong> from the abattoir's kill sheet; live weight is just for their information.
          </p>
        </div>
      ) : (
        <label className="block text-xs font-semibold text-gray-700">How much <Req />
          <span className="flex items-center gap-1 mt-1 font-normal">
            <input type="number" step="any" min="0.001" max={remaining} value={quantity}
              onChange={(e) => setQuantity(e.target.value)} placeholder="Quantity"
              className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <span className="text-sm text-gray-500">{batch.unit}</span>
          </span>
        </label>
      )}

      {preOrders.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
          <p className="font-semibold">📋 Cutting list: cafés have pre-ordered</p>
          <p>{Object.values(preOrders.reduce((g, o) => {
            const r = g[o.productName.toLowerCase()] = g[o.productName.toLowerCase()] || { name: o.productName, qty: 0, who: new Set() };
            r.qty += o.outstanding - (o.readyAtAbattoir || 0) - (o.readyAtFarm || 0); r.who.add(o.restaurantName);
            return g;
          }, {})).map(r => `${r.name} ${formatQty(Math.round(r.qty * 1000) / 1000, 'kg')} (${[...r.who].join(', ')})`).join(' · ')}</p>
          <p className="mt-1">The abattoir sees these in its panel when it cuts your animals.</p>
        </div>
      )}

      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={200}
        placeholder={isLivestock ? 'Notes (optional), e.g. haulier, trailer reg' : 'Notes (optional), e.g. 20 crates, chilled'}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      <RefInput value={myRef} onChange={setMyRef} disabled={busy} placeholder={isLivestock ? 'Your ref (optional), e.g. movement or load no.' : undefined} className="w-full" />
      {isLivestock && <FciFields value={fci} onChange={setFci} disabled={busy} />}
      {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
      {!error && missing.length > 0 && <p className="text-xs text-gray-500">Still needed: {missing.join(', ')}</p>}
      <div className="flex gap-2 items-center">
        <button type="submit" disabled={busy || missing.length > 0}
          className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
          {busy ? (progress || '⛓️ Recording…') : pending ? 'Try again'
            : isLivestock ? `Send ${inLoad.length > 1 ? `${inLoad.length} batches` : ''} to abattoir`.replace('  ', ' ') : 'Dispatch'}
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:underline">Cancel</button>
        <span className="text-xs text-gray-400 ml-auto"><Req /> required</span>
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

  const [ask, askNode] = useAsk();
  const cancel = async (s) => {
    if (!(await ask({ title: `Cancel delivery #${s.shipmentId}?`, text: `The ${formatQty(s.quantitySent, s.unit)} ${s.productName} goes back into your stock.`, confirmLabel: 'Cancel delivery', cancelLabel: 'Keep it', danger: true }))) return;
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
  const comingBack = shipments.filter(s => s.awaitingReturn > 0);   // checked in under "Coming in" (v4.3)

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      {askNode}
      <h3 className="text-xl font-bold text-gray-800 mb-4">🚚 Shipments sent</h3>
      {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}
      {comingBack.length > 0 && (
        <p className="mb-3 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
          ↩️ {comingBack.length} refused {comingBack.length === 1 ? 'delivery is' : 'deliveries are'} coming back: check {comingBack.length === 1 ? 'it' : 'them'} in under <strong>📥 Coming in</strong> above.
        </p>
      )}
      <div className="divide-y divide-gray-100">
        {shipments.map(s => (
          <div key={s.shipmentId} className="py-3 flex justify-between gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-gray-800">
                #{s.shipmentId} · {formatQty(s.quantitySent, s.unit)} {s.productName} → {s.toName}
              </p>
              <Refs x={s} />
              <p className="flex gap-3"><TxLink hash={s.sentTxHash} label="Sent" />{s.status === 'delivered' && <TxLink hash={s.receivedTxHash} label="Received" />}</p>
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
                  Received {formatQty(s.quantityReceived, s.unit)}{s.quantityRejected > 0 ? ` · ↩️ ${formatQty(s.quantityRejected, s.unit)} refused ${
                    s.awaitingReturn > 0 ? '(coming back: check it in under Coming in)'
                    : s.returnChecked ? `(checked: ${[s.returnChecked.backInStock > 0 && `${formatQty(s.returnChecked.backInStock, s.unit)} back in stock`, s.returnChecked.writtenOff > 0 && `${formatQty(s.returnChecked.writtenOff, s.unit)} written off`].filter(Boolean).join(', ')})`
                    : '(back in your stock)'}` : ''}{s.shortfall > 0 ? ` · ⚠️ ${formatQty(s.shortfall, s.unit)} missing` : ''}
                </p>
              )}
              {s.status === 'delivered' && s.carrierName && !s.carrierSteps?.out && (
                <p className="text-xs text-amber-700 mt-1">⚠️ {s.carrierName} didn't log "Out for delivery"</p>
              )}
              {s.frozenOn && <p className="text-xs text-sky-700">❄️ Sent frozen (frozen on {new Date(s.frozenOn).toLocaleDateString('en-GB')})</p>}
              {s.returnChecked?.notes && <p className="text-xs text-gray-600">Return note: "{s.returnChecked.notes}" <TxLink hash={s.returnChecked.txHash} label="Checked" className="ml-1" /></p>}
              {s.deliveryNotes && (
                <p className="text-xs text-gray-600 italic mt-1">💬 {s.toName}: "{s.deliveryNotes}"</p>
              )}
              {s.hasDeliveryPhoto && <DeliveryPhotoButton shipmentId={s.shipmentId} token={farmerToken} />}
              {s.productType === 'Livestock' && !(s.status === 'delivered' && s.quantityReceived === 0) && s.status !== 'cancelled' && (s.fciProvided
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
// v4.3 — "Coming in" is only for things arriving at the farm: boxed meat from the abattoir, café returns, and refused goods
// coming back. Once confirmed they leave the list; what's kept shows under Stock (FarmerHeldStock).
export function FarmerComingIn(props) { return <FarmerReturns {...props} mode="coming" />; }
// Stock the farm holds from deliveries it received (boxed meat back from the abattoir, returns): send it on from here.
//   filter: 'all' | 'meat' (boxed meat) | 'produce' (returned produce)
export function FarmerHeldStock(props) { return <FarmerReturns {...props} mode="stock" />; }

export function FarmerReturns({ farmerToken, refreshKey = 0, onChanged, mode = 'coming', filter = 'all' }) {
  const [shipments, setShipments] = useState([]);
  const [sentOut,   setSentOut]   = useState([]);   // what the farm sent (for refused goods coming back)
  const [participants, setParticipants] = useState([]);
  const [qty,    setQty]    = useState({});
  const [send,   setSend]   = useState(null);   // { id, to, quantity, via, notes, senderRef } — the "send on" form
  const [busyId, setBusyId] = useState(null);
  const [error,  setError]  = useState(null);
  const [loaded, setLoaded] = useState(false);
  const auth = { headers: { Authorization: `Bearer ${farmerToken}` } };

  const load = async () => {
    const [i, o] = await Promise.all([
      axios.get(`${API_BASE}/farmer/inbound`, auth).then(r => r.data.shipments || []).catch(() => []),
      mode === 'coming' ? axios.get(`${API_BASE}/farmer/shipments`, auth).then(r => r.data.shipments || []).catch(() => []) : Promise.resolve([]),
    ]);
    setShipments(i); setSentOut(o); setLoaded(true);
  };
  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => {
    if (mode === 'stock') axios.get(`${API_BASE}/participants`).then(r => setParticipants(r.data.participants || [])).catch(() => {});
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
        { to: send.to, quantity: Number(send.quantity), via: send.via || undefined, notes: send.notes || '', senderRef: send.senderRef || undefined }, auth);
      setSend(null);
      await load();
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send it on');
    } finally {
      setBusyId(null);
    }
  };

  const fromLabel = (s) => (s.kind === 'return' ? 'back from' : 'from');
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // ── Coming in ──
  if (mode === 'coming') {
    const incoming = shipments.filter(s => s.status === 'in_transit');
    const comingBack = sentOut.filter(s => s.awaitingReturn > 0);
    const recent = shipments.filter(s => s.status === 'delivered').slice(0, 5);
    const waiting = incoming.length + comingBack.length;
    return (
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-1">📥 Coming in {waiting > 0 && <span className="text-sm bg-yellow-400 text-yellow-900 rounded-full px-2 py-0.5 ml-1">{waiting} to confirm</span>}</h3>
        <p className="text-sm text-gray-500 mb-4">Everything arriving at the farm: boxed meat from the abattoir, returns, and goods a café refused. Confirm each one when it's here. What you keep moves to <strong>📦 Stock</strong>.</p>
        {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}
        {loaded && waiting === 0 && <p className="text-sm text-gray-500 mb-3">✅ Nothing on its way to you right now.</p>}
        <div className="space-y-3">
          {comingBack.map(s => <ReturnCheck key={`r${s.shipmentId}`} s={s} token={farmerToken} onDone={() => { load(); onChanged?.(); }} />)}
          {incoming.map(s => (
            <div key={s.shipmentId} className="border-2 border-yellow-300 bg-yellow-50 rounded-lg p-4">
              <p className="font-bold text-gray-800">{formatQty(s.quantitySent, s.unit)} {s.productName} {fromLabel(s)} {s.fromName} <Refs x={s} className="ml-1" /></p>
              <p className="text-xs text-gray-500">delivery #{s.shipmentId}{s.useBy ? ` · use by ${day(s.useBy)}` : ''}{s.frozenOn ? ' · ❄️ frozen' : ''} <TxLink hash={s.sentTxHash} label="Sent" className="ml-1" /></p>
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
        </div>
        {recent.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Recently arrived</p>
            {recent.map(s => (
              <div key={s.shipmentId} className="text-sm text-gray-600 border-b border-gray-100 py-1.5">
                #{s.shipmentId} · {formatQty(s.quantityReceived, s.unit)} {s.productName} {fromLabel(s)} {s.fromName}
                <span className="text-gray-400"> · {s.deliveredAt ? day(s.deliveredAt) : ''}</span>
                <TxLink hash={s.receivedTxHash} label="Received" className="ml-2" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Stock held from deliveries (boxed meat, returns) ──
  const inStock = shipments.filter(s => s.status === 'delivered' && s.available > 0)
    .filter(s => filter === 'all' || (filter === 'meat' ? s.productType === 'Meat' : filter === 'produce' ? s.productType !== 'Meat' && s.productType !== 'Livestock' : false));
  if (!inStock.length) return null;
  const meatOnly = inStock.every(s => s.productType === 'Meat');
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <h3 className="text-xl font-bold text-gray-800 mb-1">{meatOnly ? '🥩 Boxed meat' : '📦 Stock from deliveries'} <span className="text-sm font-normal text-gray-500">({inStock.length})</span></h3>
      <p className="text-sm text-gray-500 mb-4">{meatOnly ? 'Cuts back from the abattoir (private kill).' : 'Boxed meat back from the abattoir, and goods returned to you.'} Cafés can order it from your meat prices; send it from Orders, or send some on from here.</p>
      {error && <p className="text-sm text-red-600 mb-3">⚠️ {error}</p>}
      <div className="grid sm:grid-cols-2 gap-3">
        {inStock.map(s => (
          <div key={s.shipmentId} className={`border rounded-lg p-4 ${s.recalled ? 'border-red-300 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            <div className="flex justify-between gap-2">
              <p className="font-semibold text-gray-800">{s.productName}</p>
              <p className="font-bold text-sm text-gray-800 shrink-0">{formatQty(s.available, s.unit)}</p>
            </div>
            <p className="text-xs text-gray-600">{fromLabel(s)} {s.fromName}{s.animalRef ? ` · ${s.animalRef}` : ''}</p>
            <p className="text-xs text-gray-500">
              {s.useBy ? `Use by ${new Date(s.useBy).toLocaleDateString('en-GB')}` : 'No use-by'}{s.frozenOn ? ` · ❄️ frozen ${new Date(s.frozenOn).toLocaleDateString('en-GB')}` : ''} · arrived {s.deliveredAt ? day(s.deliveredAt) : '—'}
            </p>
            {s.allergens?.length > 0 && <p className="text-xs text-amber-800">⚠️ Contains: {s.allergens.join(', ')}</p>}
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
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-sm text-gray-500">{s.unit}</span>
                  <input type="text" maxLength={280} placeholder="Notes (optional)" value={send.notes}
                    onChange={(e) => setSend({ ...send, notes: e.target.value })}
                    className="flex-1 min-w-[8rem] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <RefInput value={send.senderRef} onChange={(v) => setSend({ ...send, senderRef: v })} className="w-full" />
                <div className="flex gap-2">
                  <button onClick={sendOn} disabled={busyId === s.shipmentId}
                    className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                    {busyId === s.shipmentId ? '⛓️ Recording…' : '🚚 Send'}
                  </button>
                  <button onClick={() => setSend(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
                </div>
              </div>
            ) : !s.recalled && (
              <button onClick={() => setSend({ id: s.shipmentId, to: '', quantity: String(s.available), via: '', notes: '', senderRef: '' })}
                className="mt-2 text-sm text-green-700 font-semibold hover:underline">🚚 Send some on</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// v4.3 — a simple log of the farm's written-off stock (refused goods it wrote off, animals condemned at the abattoir)
export function WriteOffLog({ farmerToken, refreshKey = 0 }) {
  const [rows, setRows] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    axios.get(`${API_BASE}/farmer/write-offs`, { headers: { Authorization: `Bearer ${farmerToken}` } })
      .then(r => setRows(r.data.writeOffs || [])).catch(() => setRows([]));
  }, [refreshKey]);
  if (!rows) return null;
  const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0);
  const month = rows.filter(r => new Date(r.at) >= since);
  const byUnit = (list) => Object.entries(list.reduce((m, r) => ({ ...m, [r.unit]: Math.round(((m[r.unit] || 0) + r.quantity) * 1000) / 1000 }), {}))
    .map(([u, q]) => formatQty(q, u)).join(' + ');
  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center text-left">
        <span>
          <span className="text-xl font-bold text-gray-800">🗑️ Written off</span>
          <span className="block text-sm text-gray-500">{rows.length ? `This month: ${month.length ? byUnit(month) : 'nothing'} · ${rows.length} in total` : 'Nothing written off yet.'}</span>
        </span>
        {rows.length > 0 && <span className="text-sm text-gray-600 shrink-0">{open ? 'Hide ▴' : 'Show ▾'}</span>}
      </button>
      {open && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-200">
              <th className="py-1.5 pr-3 font-semibold">Date</th><th className="py-1.5 pr-3 font-semibold">What</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Amount</th><th className="py-1.5 pr-3 font-semibold">Why</th><th className="py-1.5 font-semibold"></th>
            </tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-gray-100 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap text-gray-600">{new Date(r.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td className="py-1.5 pr-3">
                    <span className="text-gray-800">{r.productName}</span>{r.animalRef && <span className="text-gray-500"> · {r.animalRef}</span>}
                    <span className="block text-xs text-gray-500">{r.where} · delivery #{r.shipmentId}</span>
                  </td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap font-semibold text-gray-800">{formatQty(r.quantity, r.unit)}</td>
                  <td className="py-1.5 pr-3 text-gray-700">{r.reason || <span className="text-gray-400">—</span>}</td>
                  <td className="py-1.5"><TxLink hash={r.txHash} label="Record" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Meat list: the cuts this farm can supply (per animal) and its price per kg.
// Cafés order from it: from stock already cut at the abattoir, or as a pre-order from the next kill.
// The cutting list adds up what cafés have pre-ordered, so the farm can tell the abattoir how to cut.
// ─────────────────────────────────────────────
const MEAT_TABS = [['Cattle', 'Beef'], ['Sheep', 'Lamb'], ['Pig', 'Pork'], ['Goat', 'Goat']];
const COMMON_CUTS = {
  Cattle: ['Sirloin steak', 'Ribeye steak', 'Fillet steak', 'Rump steak', 'Topside', 'Silverside', 'Brisket', 'Chuck / braising', 'Diced beef', 'Beef mince', 'Short ribs', 'Beef burgers'],
  Sheep: ['Leg of lamb', 'Lamb shoulder', 'Lamb chops', 'Rack of lamb', 'Lamb shanks', 'Diced lamb', 'Lamb mince'],
  Pig: ['Pork loin', 'Pork chops', 'Pork belly', 'Pork shoulder', 'Gammon', 'Pork mince', 'Sausages', 'Bacon'],
  Goat: ['Goat leg', 'Goat shoulder', 'Diced goat', 'Goat mince'],
};

export function FarmerMeatList({ farmerToken, refreshKey = 0 }) {
  const [cuts, setCuts] = useState(null);           // [{ species, cutName, pricePerKg, preOrder, note }]
  const [saved, setSaved] = useState('');           // JSON of the last saved list (to spot unsaved changes)
  const [orders, setOrders] = useState([]);
  const [tab, setTab] = useState('Cattle');
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const auth = { headers: { Authorization: `Bearer ${farmerToken}` } };

  const load = async () => {
    try {
      const [l, o] = await Promise.all([axios.get(`${API_BASE}/farmer/meat-list`, auth), axios.get(`${API_BASE}/farmer/orders`, auth)]);
      const list = (l.data.cuts || []).map(c => ({ ...c, pricePerKg: c.pricePerKg ?? '' }));
      setCuts(list); setSaved(JSON.stringify(list));
      setOrders((o.data.orders || []).filter(x => x.isMeat && x.open));
      if (list.length && !list.some(c => c.species === 'Cattle')) setTab(list[0].species);
    } catch (err) { setError(err.response?.data?.error || 'Could not load your meat prices'); }
  };
  useEffect(() => { load(); }, [refreshKey]);
  if (!cuts) return null;

  const mine = cuts.filter(c => c.species === tab);
  const set = (c, k, v) => setCuts(cuts.map(x => (x === c ? { ...x, [k]: v } : x)));
  const add = (name = '') => setCuts([...cuts, { species: tab, cutName: name, pricePerKg: '', preOrder: true, note: '' }]);
  const dirty = JSON.stringify(cuts) !== saved;
  const dup = mine.find((c, i) => c.cutName.trim() && mine.findIndex(x => x.cutName.trim().toLowerCase() === c.cutName.trim().toLowerCase()) !== i);
  const toCut = orders.filter(o => (o.readyAtAbattoir || 0) + (o.readyAtFarm || 0) < o.outstanding);

  const save = async () => {
    setBusy(true); setError(null); setMsg(null);
    try {
      const r = await axios.put(`${API_BASE}/farmer/meat-list`, { cuts: cuts.filter(c => c.cutName.trim()).map(c => ({ ...c, pricePerKg: c.pricePerKg === '' ? null : Number(c.pricePerKg) })) }, auth);
      const list = r.data.cuts.map(c => ({ ...c, pricePerKg: c.pricePerKg ?? '' }));
      setCuts(list); setSaved(JSON.stringify(list)); setMsg('Meat prices saved. Cafés can order from them now.');
    } catch (err) { setError(err.response?.data?.error || 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center text-left">
        <span className="text-xl font-bold text-gray-800">🏷️ Meat prices & cutting list</span>
        <span className="text-sm text-gray-500">
          {[cuts.length ? `${cuts.length} cut${cuts.length === 1 ? '' : 's'} listed` : 'no cuts listed yet', toCut.length && `📋 ${toCut.length} pre-order${toCut.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')} {open ? '▴' : '▾'}
        </span>
      </button>
      {open && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-gray-500">The cuts you can supply and your price per kg. Cafés order from this list: from stock already cut at the abattoir, or as a <strong>pre-order</strong> from your next animal.</p>

          {toCut.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-semibold text-amber-900 mb-1">📋 Cutting list: what cafés are waiting for</p>
              {MEAT_TABS.filter(([sp]) => toCut.some(o => (o.species || 'Cattle') === sp)).map(([sp, label]) => {
                const rows = {};
                toCut.filter(o => (o.species || 'Cattle') === sp).forEach(o => {
                  const k = o.productName.toLowerCase();
                  const r = rows[k] = rows[k] || { name: o.productName, qty: 0, who: [] };
                  r.qty += o.outstanding - (o.readyAtAbattoir || 0) - (o.readyAtFarm || 0);
                  r.who.push(o.restaurantName);
                });
                return (
                  <p key={sp} className="text-sm text-amber-900"><strong>{label}:</strong> {Object.values(rows).map(r => `${r.name} ${formatQty(Math.round(r.qty * 1000) / 1000, 'kg')} (${[...new Set(r.who)].join(', ')})`).join(' · ')}</p>
                );
              })}
              <p className="text-xs text-amber-800 mt-1">The abattoir sees these when it cuts your animals, and sends the cuts straight to each café.</p>
            </div>
          )}

          <div className="flex gap-1 border-b border-gray-200">
            {MEAT_TABS.map(([sp, label]) => {
              const n = cuts.filter(c => c.species === sp).length;
              return (
                <button key={sp} onClick={() => setTab(sp)}
                  className={`px-3 py-1.5 text-sm rounded-t-lg ${tab === sp ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {label}{n ? ` (${n})` : ''}
                </button>
              );
            })}
          </div>

          {mine.length > 0 && (
            <div>
              <div className="hidden sm:flex gap-2 text-xs font-semibold text-gray-600 mb-1">
                <span className="flex-1">Cut <span className="text-red-600">*</span></span><span className="w-28">£ per kg</span><span className="w-24">Pre-orders</span><span className="flex-1">Note for cafés</span><span className="w-4" />
              </div>
              {mine.map((c, i) => (
                <div key={i} className="flex gap-2 items-center mb-2 flex-wrap text-sm">
                  <input value={c.cutName} onChange={(e) => set(c, 'cutName', e.target.value)} maxLength={100} placeholder="e.g. Sirloin steak"
                    className={`flex-1 min-w-[9rem] px-2 py-1 border rounded ${dup === c ? 'border-red-500' : 'border-gray-300'}`} />
                  <span className="w-28 flex items-center gap-1">£<input type="number" step="0.01" min="0" value={c.pricePerKg} onChange={(e) => set(c, 'pricePerKg', e.target.value)}
                    placeholder="0.00" className="w-20 px-2 py-1 border border-gray-300 rounded" /></span>
                  <label className="w-24 text-xs flex items-center gap-1"><input type="checkbox" checked={c.preOrder} onChange={(e) => set(c, 'preOrder', e.target.checked)} className="accent-green-600" /> allowed</label>
                  <input value={c.note || ''} onChange={(e) => set(c, 'note', e.target.value)} maxLength={140} placeholder="e.g. dry-aged 21 days"
                    className="flex-1 min-w-[9rem] px-2 py-1 border border-gray-300 rounded" />
                  <button onClick={() => setCuts(cuts.filter(x => x !== c))} className="w-4 text-xs text-red-600" aria-label="Remove cut">✕</button>
                </div>
              ))}
              {dup && <p className="text-xs text-red-600">{dup.cutName} is on the list twice.</p>}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 items-center">
            <button onClick={() => add()} className="text-xs text-blue-600 hover:underline mr-1">+ Add a cut</button>
            {COMMON_CUTS[tab].filter(n => !mine.some(c => c.cutName.trim().toLowerCase() === n.toLowerCase())).map(n => (
              <button key={n} onClick={() => add(n)} className="text-xs border border-gray-300 rounded-full px-2 py-0.5 hover:bg-gray-50">+ {n}</button>
            ))}
          </div>
          <p className="text-xs text-gray-500">Use the same names the abattoir uses for the cuts, so orders match the stock. Untick "pre-orders" for cuts you only sell once they're cut (e.g. mince).</p>
          {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
          {msg && !dirty && <p className="text-sm text-green-700">✅ {msg}</p>}
          <div className="flex gap-2 items-center">
            <button onClick={save} disabled={busy || !dirty || !!dup}
              className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
              {busy ? 'Saving…' : dirty ? 'Save meat prices' : 'Saved'}
            </button>
            {dirty && <button onClick={() => setCuts(JSON.parse(saved))} className="text-sm text-gray-600 hover:underline">Undo changes</button>}
          </div>
        </div>
      )}
    </div>
  );
}