import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';
const EXPLORER = 'https://sepolia.basescan.org';

const STAGE_ICONS = {
  farm: '🌾', warehouse: '📦', transport: '🚚', dispatched: '🚚', delivered: '✅',
  restaurant: '🍽️', consumer: '🛒', sold: '💷', cancelled: '✖️',
};
const iconFor = (stage) => STAGE_ICONS[(stage || '').toLowerCase()] || '📍';

const formatDate = (d) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const qty = (n, unit) => `${Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 })} ${unit || ''}`.trim();

// Vertical list of steps
function StepList({ steps }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-lg shrink-0 ${
              s.warn ? 'bg-orange-100 border-orange-400' : s.pending ? 'bg-gray-100 border-gray-300' : 'bg-green-100 border-green-500'}`}>
              {s.icon}
            </div>
            {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-green-200 my-1" />}
          </div>
          <div className={`min-w-0 ${i < steps.length - 1 ? 'pb-6' : ''}`}>
            <p className="font-bold text-gray-800">{s.title}</p>
            {s.subtitle && <p className={`text-sm ${s.warn ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>{s.subtitle}</p>}
            {s.notes && <p className="text-sm text-gray-500 italic">"{s.notes}"</p>}
            <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-1">
              {s.date && <span>{formatDate(s.date)}</span>}
              {s.txHash && (
                <a href={`${EXPLORER}/tx/${s.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                  Verify on Basescan ↗
                </a>
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// One checkpoint → one step, written as what happened
function checkpointStep(c, shipment, unit) {
  const stage = (c.stage || '').toLowerCase();
  const base = { key: `cp-${c.index}`, icon: iconFor(c.stage), notes: c.notes, date: c.recordedAt, txHash: c.txHash };
  if (stage === 'dispatched') {
    return { ...base, title: `Sent ${qty(c.quantity, unit)} to ${shipment?.toName || 'the next stop'}`, subtitle: `from ${c.recorderName || shipment?.fromName || ''}` };
  }
  if (stage === 'delivered') {
    const short = shipment?.shortfall > 0;
    return {
      ...base,
      title: `Arrived at ${c.recorderName || shipment?.toName || ''}`,
      subtitle: short ? `Received ${qty(c.quantity, unit)} — ${qty(shipment.shortfall, unit)} less than sent` : `Received ${qty(c.quantity, unit)}`,
      warn: short,
    };
  }
  if (stage === 'sold') return { ...base, title: `Sold by ${c.recorderName || c.location || ''}`, subtitle: qty(c.quantity, unit) };
  if (stage === 'cancelled') return { ...base, title: 'Shipment cancelled', subtitle: `${qty(c.quantity, unit)} returned` };
  return {
    ...base,
    title: c.stage,
    subtitle: [c.location, c.recorderName && c.recorderName !== c.location ? `by ${c.recorderName}` : null].filter(Boolean).join(' · '),
  };
}

// Steps for one shipment (dispatch → handling → delivery), optionally without sales
function shipmentSteps(shipment, checkpoints, unit, { includeSales = false } = {}) {
  const steps = checkpoints
    .filter(c => c.shipmentId === shipment.shipmentId && (includeSales || c.stage !== 'Sold'))
    .map(c => checkpointStep(c, shipment, unit));
  if (shipment.status === 'in_transit') {
    steps.push({ key: `wait-${shipment.shipmentId}`, icon: '⏳', title: `On its way to ${shipment.toName}`, pending: true });
  }
  return steps;
}

// Collapsible card for one shipment in the full view
function ShipmentCard({ shipment, checkpoints, unit, depth }) {
  const [open, setOpen] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const sales = checkpoints.filter(c => c.shipmentId === shipment.shipmentId && c.stage === 'Sold');
  const summary = [
    `Sent ${qty(shipment.quantitySent, unit)}`,
    shipment.status === 'delivered' ? `received ${qty(shipment.quantityReceived, unit)}` : shipment.status === 'in_transit' ? 'on its way' : 'cancelled',
    sales.length ? `${sales.length} sale${sales.length === 1 ? '' : 's'} · ${qty(shipment.sold, unit)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`rounded-lg border ${shipment.shortfall > 0 ? 'border-orange-300' : 'border-gray-200'} bg-white`} style={{ marginLeft: depth * 16 }}>
      <button onClick={() => setOpen(o => !o)} className="w-full text-left p-3 flex justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-800">{depth > 0 ? '↳ ' : ''}{shipment.toName}</p>
          <p className="text-xs text-gray-500">{summary}{shipment.shortfall > 0 ? ` · ⚠️ ${qty(shipment.shortfall, unit)} short` : ''}</p>
        </div>
        <span className="text-xs text-gray-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <StepList steps={shipmentSteps(shipment, checkpoints, unit)} />
          {sales.length > 0 && (
            <div>
              <button onClick={() => setShowSales(s => !s)} className="text-sm text-blue-600 hover:underline">
                {showSales ? 'Hide sales' : `Show ${sales.length} sale${sales.length === 1 ? '' : 's'}`}
              </button>
              {showSales && <div className="mt-2"><StepList steps={sales.map(c => checkpointStep(c, shipment, unit))} /></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * JourneyTimeline — the on-chain journey of a batch.
 *
 * Props:
 *   batchId     – which batch
 *   shipmentId  – optional: show only the path to this shipment (the customer's own journey),
 *                 with a summary of everything else and a button to see the full journey
 *   refreshKey  – change it to re-load
 */
function JourneyTimeline({ batchId, shipmentId = null, refreshKey = 0 }) {
  const [data,    setData]    = useState(null);
  const [full,    setFull]    = useState(!shipmentId);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => { setFull(!shipmentId); }, [shipmentId]);

  useEffect(() => {
    if (!batchId) return;
    (async () => {
      try {
        setLoading(true);
        const q = !full && shipmentId ? `?shipment=${shipmentId}` : '';
        const res = await axios.get(`${API_BASE}/batch/${encodeURIComponent(batchId)}/journey${q}`);
        setData(res.data);
        setError(null);
      } catch (err) {
        console.error('JourneyTimeline:', err);
        setError('Could not load the journey.');
      } finally {
        setLoading(false);
      }
    })();
  }, [batchId, shipmentId, full, refreshKey]);

  const header = (
    <>
      <h3 className="text-xl font-bold text-gray-800 mb-1">🔗 Journey</h3>
      <p className="text-sm text-gray-500 mb-5">Every step is recorded on the blockchain and can't be changed.</p>
    </>
  );

  if (loading && !data) return <div className="bg-white rounded-lg shadow-lg p-6">{header}<p className="text-gray-500 text-sm">Loading journey…</p></div>;
  if (error) return <div className="bg-white rounded-lg shadow-lg p-6">{header}<p className="text-red-600 text-sm">{error}</p></div>;
  if (!data) return null;

  const { batch, checkpoints, shipments, summary } = data;
  const unit = batch.unit;

  // ── Origin: registration + whole-batch steps (e.g. "Farm") ──
  const origin = [{
    key: 'registered', icon: '🌾',
    title: batch.farmName ? `Harvested & registered by ${batch.farmName}` : 'Harvested & registered on-chain',
    subtitle: `${qty(batch.quantity, unit)} of ${batch.productName}`,
    date: batch.registeredAt, txHash: batch.creationTxHash,
  }];
  checkpoints.filter(c => !c.shipmentId).forEach(c => origin.push(checkpointStep(c, null, unit)));

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {header}
      <div className="space-y-6">
        <section>
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">🌱 Origin</h4>
          <StepList steps={origin} />
        </section>

        {!full ? (
          // ── SHORT: just this customer's path ──
          <>
            {shipments.length > 0 && (
              <section>
                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">🚚 How it reached you</h4>
                <StepList steps={shipments.flatMap(s => shipmentSteps(s, checkpoints, unit))} />
              </section>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600 flex justify-between items-center gap-3 flex-wrap">
              <span>
                {summary.otherDestinations > 0
                  ? `This batch also supplied ${summary.otherDestinations} other business${summary.otherDestinations === 1 ? '' : 'es'}.`
                  : 'Want to see everything that happened to this batch?'}
              </span>
              <button onClick={() => setFull(true)} className="text-blue-600 font-semibold hover:underline">See the full journey →</button>
            </div>
          </>
        ) : (
          // ── FULL: every shipment, collapsed ──
          <>
            <section>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">📍 Where it went</h4>
              <p className="text-sm text-gray-600 mb-3">
                {summary.destinations > 0
                  ? `Sent to ${summary.destinations} place${summary.destinations === 1 ? '' : 's'} · ${qty(batch.remainingAtFarm, unit)} still at the farm`
                  : `Not sent anywhere yet · ${qty(batch.remainingAtFarm, unit)} at the farm`}
              </p>
              <div className="space-y-2">
                {(function tree(parentId, depth) {
                  return shipments
                    .filter(s => (s.parentId || null) === parentId && s.status !== 'cancelled')
                    .flatMap(s => [
                      <ShipmentCard key={s.shipmentId} shipment={s} checkpoints={checkpoints} unit={unit} depth={depth} />,
                      ...tree(s.shipmentId, depth + 1),
                    ]);
                })(null, 0)}
              </div>
            </section>
            {shipmentId && (
              <button onClick={() => setFull(false)} className="text-sm text-blue-600 hover:underline">← Back to your journey</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default JourneyTimeline;