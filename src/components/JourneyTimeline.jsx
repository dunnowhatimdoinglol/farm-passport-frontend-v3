import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';
const EXPLORER = 'https://sepolia.basescan.org';

const STAGE_ICONS = {
  farm: '🌾', warehouse: '📦', transport: '🚚', dispatched: '🚚', delivered: '✅',
  restaurant: '🍽️', consumer: '🛒', sold: '💷', cancelled: '✖️',
  arrived: '📦', 'out for delivery': '🚚', rejected: '↩️', returned: '↩️', wasted: '🗑️',
  recalled: '🚨', 'recall lifted': '✅', 'cold store': '❄️', 'temperature check': '🌡️',
  produced: '🥩', processed: '🔪',
};
const SPECIES_ICON = { Cattle: '🐄', Sheep: '🐑', Pig: '🐖', Goat: '🐐' };
const fmtDay = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
              s.alert ? 'bg-red-100 border-red-500' : s.warn ? 'bg-orange-100 border-orange-400' : s.pending ? 'bg-gray-100 border-gray-300' : 'bg-green-100 border-green-500'}`}>
              {s.icon}
            </div>
            {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-green-200 my-1" />}
          </div>
          <div className={`min-w-0 ${i < steps.length - 1 ? 'pb-6' : ''}`}>
            <p className="font-bold text-gray-800">{s.title}</p>
            {s.subtitle && <p className={`text-sm ${s.alert ? 'text-red-700 font-semibold' : s.warn ? 'text-orange-600 font-semibold' : 'text-gray-600'}`}>{s.subtitle}</p>}
            {s.notes && <p className="text-sm text-gray-500 italic">"{s.notes}"</p>}
            {s.hasPhoto && <p className="text-xs text-green-700 mt-0.5">📷 Photo on record</p>}
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
  const base = { key: `cp-${c.index}`, icon: iconFor(c.stage), notes: c.notes, date: c.recordedAt, txHash: c.txHash, hasPhoto: !!c.hasPhoto };
  if (stage === 'dispatched') {
    return {
      ...base,
      title: `Sent ${qty(c.quantity, unit)} to ${shipment?.toName || 'the next stop'}`,
      subtitle: `from ${c.recorderName || shipment?.fromName || ''}${shipment?.carrierName ? ` · via ${shipment.carrierName}` : ''}`,
    };
  }
  if (stage === 'delivered') {
    const short = shipment?.shortfall > 0;
    const refused = shipment?.quantityRejected > 0;
    return {
      ...base,
      title: `Arrived at ${c.recorderName || shipment?.toName || ''}`,
      subtitle: [
        `Received ${qty(c.quantity, unit)}`,
        refused ? `${qty(shipment.quantityRejected, unit)} refused` : null,
        short ? `${qty(shipment.shortfall, unit)} missing` : null,
      ].filter(Boolean).join(' · '),
      warn: short,
    };
  }
  if (stage === 'rejected') return { ...base, title: `${qty(c.quantity, unit)} refused on arrival`, subtitle: `sent back by ${c.recorderName || shipment?.toName || ''}`, warn: true };
  if (stage === 'returned') return { ...base, title: `${qty(c.quantity, unit)} sent back to ${shipment?.toName || 'the sender'}`, subtitle: `by ${c.recorderName || shipment?.fromName || ''}` };
  if (stage === 'sold') return { ...base, title: `Sold by ${c.recorderName || c.location || ''}`, subtitle: qty(c.quantity, unit) };
  if (stage === 'wasted') return { ...base, title: `Written off by ${c.recorderName || ''}`, subtitle: qty(c.quantity, unit) };
  if (stage === 'cancelled') return { ...base, title: 'Shipment cancelled', subtitle: `${qty(c.quantity, unit)} returned` };
  if (stage === 'processed') return { ...base, title: `Processed at ${c.recorderName || c.location || 'the processor'}`, subtitle: `${qty(c.quantity, unit)} used` };
  if (stage === 'produced') return { ...base, title: `Made at ${c.recorderName || 'the processor'}`, subtitle: qty(c.quantity, unit) };
  if (stage === 'recalled') return { ...base, title: 'Batch recalled', subtitle: `by ${c.recorderName || 'the farm'}`, alert: true };
  if (stage === 'recall lifted') return { ...base, title: 'Recall lifted', subtitle: 'confirmed safe' };
  // Depot / courier steps (recorded in order on-chain)
  if (stage === 'arrived') {
    return { ...base, title: `Arrived at ${c.recorderName || c.location || 'the depot'}`, subtitle: c.location && c.location !== c.recorderName ? c.location : null };
  }
  if (stage === 'out for delivery') {
    return { ...base, title: `Out for delivery${shipment?.toName ? ` to ${shipment.toName}` : ''}`, subtitle: c.recorderName ? `from ${c.recorderName}` : null };
  }
  return {
    ...base,
    title: c.stage,
    subtitle: [c.location, c.recorderName && c.recorderName !== c.location ? `by ${c.recorderName}` : null].filter(Boolean).join(' · '),
  };
}

// Steps for one shipment (dispatch → handling → delivery), optionally without sales
function shipmentSteps(shipment, checkpoints, unit, { includeSales = false } = {}) {
  const mine = checkpoints.filter(c => c.shipmentId === shipment.shipmentId && (includeSales || (c.stage !== 'Sold' && c.stage !== 'Wasted')));
  const deliveredAt = shipment.deliveredAt ? new Date(shipment.deliveredAt).getTime() : null;
  const carrier = (shipment.carrierAddress || '').toLowerCase();

  // Keep the story in order: depot / courier steps before "Arrived at <cafe>",
  // even if some were logged after the delivery was confirmed (those are labelled)
  const isDelivery = (c) => ['delivered', 'rejected'].includes((c.stage || '').toLowerCase());
  const ordered = [...mine.filter(c => !isDelivery(c)), ...mine.filter(isDelivery)];

  const steps = ordered.map(c => {
    const step = checkpointStep(c, shipment, unit);
    const loggedLate = deliveredAt && !isDelivery(c) && c.stage !== 'Sold' && c.stage !== 'Wasted' && carrier &&
      c.recordedBy === carrier && new Date(c.recordedAt).getTime() > deliveredAt;
    if (loggedLate) {
      step.notes = (step.notes || '').replace(/\s*—?\s*\(logged after delivery\)/, '') || null;
      step.subtitle = [step.subtitle, 'logged after delivery'].filter(Boolean).join(' · ');
    }
    return step;
  });

  // Went via a depot / courier that logged nothing: still show the hand-off so the chain reads complete
  const carrierLogged = carrier && mine.some(c => c.recordedBy === carrier && !isDelivery(c));
  if (shipment.carrierName && !carrierLogged && shipment.status === 'delivered') {
    const at = steps.findIndex(st => st.key && mine.find(c => `cp-${c.index}` === st.key && isDelivery(c)));
    const passStep = { key: `via-${shipment.shipmentId}`, icon: '📦', title: `Passed through ${shipment.carrierName}`, subtitle: 'on the way to ' + shipment.toName };
    if (at >= 0) steps.splice(at, 0, passStep); else steps.push(passStep);
  }

  if (shipment.status === 'in_transit') {
    steps.push({
      key: `wait-${shipment.shipmentId}`, icon: '⏳', pending: true,
      title: `On its way to ${shipment.toName}`,
      subtitle: shipment.carrierName ? `with ${shipment.carrierName}` : null,
    });
  }
  return steps;
}

// How a made batch was made: "Slaughtered at Dorset Abattoir (UK 1234)", "Cut at …"
function processStep(m, item, key) {
  const where = `${m.processorName || 'the processor'}${m.approvalNumber ? ` (${m.approvalNumber})` : ''}`;
  if (m.kind === 'Slaughter') {
    const g = m.grading || {};
    return {
      key, icon: '🔪', title: `Slaughtered at ${where}`,
      subtitle: [m.lotRef && `kill no. ${m.lotRef}`, `${qty(item.quantity, item.unit)} carcass`,
        g.conformation && `grade ${g.conformation}${g.fatClass || ''}`, 'passed inspection'].filter(Boolean).join(' · '),
      date: m.madeOn, txHash: m.txHash,
    };
  }
  const parents = m.parents || [];
  const from = parents.length > 1 ? `from ${parents.length} batches` : parents[0] ? `from ${parents[0].productName}${parents[0].lotRef ? ` ${parents[0].lotRef}` : ''}` : null;
  return {
    key, icon: '🥩', title: `${m.kind === 'Cutting' ? 'Cut' : m.kind} at ${where}`,
    subtitle: [`${qty(item.quantity, item.unit)} of ${item.productName}`, from, m.lotRef && `lot ${m.lotRef}`,
      m.added > 0 && `+ ${qty(m.added, item.unit)} other ingredients`].filter(Boolean).join(' · '),
    date: m.madeOn, txHash: m.txHash,
  };
}

// The chain BEFORE this batch existed: the animal at the farm → abattoir → carcass → …
function lineageSteps(lineage) {
  const steps = [];
  lineage.forEach((l) => {
    if (!l.madeFrom) {
      steps.push({
        key: `lin-${l.batchId}`, icon: SPECIES_ICON[l.species] || '🌾',
        title: l.species ? `Born and reared at ${l.farmName || 'the farm'}` : `${l.productName} from ${l.farmName || 'the farm'}`,
        subtitle: [l.breed, l.species && `${l.species === 'Cattle' ? 'ear tag' : l.species === 'Pig' ? 'herd mark' : 'flock mark'} ${l.animalRef || '—'}`,
          l.bornIn && `born in ${l.bornIn}${l.rearedIn && l.rearedIn !== l.bornIn ? `, reared in ${l.rearedIn}` : ''}`,
          l.quantity > 1 && l.unit === 'head' ? `${l.quantity} head` : null].filter(Boolean).join(' · '),
        date: l.registeredAt, txHash: l.txHash,
      });
    } else {
      steps.push(processStep(l.madeFrom, l, `lin-${l.batchId}`));
    }
    (l.shipments || []).forEach((sh) => {
      (l.checkpoints || []).filter(c => c.shipmentId === sh.shipmentId).forEach((c) => {
        steps.push({ ...checkpointStep(c, sh, l.unit), key: `lin-${l.batchId}-cp-${c.index}` });
        if ((c.stage || '').toLowerCase() === 'dispatched' && (l.fciShipmentIds || []).includes(sh.shipmentId)) {
          steps.push({ key: `fci-${sh.shipmentId}`, icon: '📋', title: 'Food Chain Information provided',
            subtitle: 'health and medicine declarations for the vet (kept private — fingerprint on the blockchain)' });
        }
      });
    });
    if (l.mixedWith > 0) {
      steps.push({ key: `mix-${l.batchId}`, icon: '➕', title: `Combined with ${l.mixedWith} other batch${l.mixedWith === 1 ? '' : 'es'}`, subtitle: 'see "Made from" below' });
    }
  });
  return steps;
}

// Collapsible card for one shipment in the full view
function ShipmentCard({ shipment, checkpoints, unit, depth }) {
  const [open, setOpen] = useState(false);
  const [showSales, setShowSales] = useState(false);
  const sales = checkpoints.filter(c => c.shipmentId === shipment.shipmentId && (c.stage === 'Sold' || c.stage === 'Wasted'));
  const summary = [
    `Sent ${qty(shipment.quantitySent, unit)}`,
    shipment.kind === 'return' ? 'returned' : null,
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
  const madeFrom = data.madeFrom || null;
  const lineage = data.lineage || [];

  // ── Origin: registration (or how it was made) + whole-batch steps (e.g. "Farm", recalls) ──
  const origin = madeFrom ? [{
    ...processStep(madeFrom, batch, 'registered'),
    subtitle: [processStep(madeFrom, batch, 'x').subtitle, batch.useBy ? `use by ${fmtDay(batch.useBy)}` : null].filter(Boolean).join(' · '),
  }] : batch.species ? [{
    // Live animals registered by the farm
    key: 'registered', icon: SPECIES_ICON[batch.species] || '🐄',
    title: `Born and reared at ${batch.farmName || 'the farm'}`,
    subtitle: [
      `${qty(batch.quantity, unit)} · ${batch.productName}`,
      batch.animalRef && `${batch.species === 'Cattle' ? 'ear tag' : batch.species === 'Pig' ? 'herd mark' : 'flock mark'} ${batch.animalRef}`,
      batch.bornIn && `born in ${batch.bornIn}${batch.rearedIn && batch.rearedIn !== batch.bornIn ? `, reared in ${batch.rearedIn}` : ''}`,
      batch.harvestDate ? `born ${fmtDay(batch.harvestDate)}` : null,
    ].filter(Boolean).join(' · '),
    date: batch.registeredAt, txHash: batch.creationTxHash,
  }] : [{
    key: 'registered', icon: '🌾',
    title: batch.farmName ? `Harvested & registered by ${batch.farmName}` : 'Harvested & registered on-chain',
    subtitle: [
      `${qty(batch.quantity, unit)} of ${batch.productName}`,
      batch.harvestDate ? `harvested ${fmtDay(batch.harvestDate)}` : null,
      batch.useBy ? `use by ${fmtDay(batch.useBy)}` : null,
    ].filter(Boolean).join(' · '),
    date: batch.registeredAt, txHash: batch.creationTxHash,
  }];
  checkpoints.filter(c => !c.shipmentId && !['produced', 'processed'].includes((c.stage || '').toLowerCase()))
    .forEach(c => origin.push(checkpointStep(c, null, unit)));

  // Meat label details (beef labelling: born / reared / slaughtered / cut in, with approval numbers)
  const slaughterhouse = madeFrom?.slaughterhouse || null;
  const cutPlant = madeFrom && madeFrom.kind !== 'Slaughter' ? madeFrom.approvalNumber : null;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      {header}
      {batch.recalled && (
        <div className="bg-red-50 border-2 border-red-400 rounded-lg p-4 mb-5">
          <p className="font-bold text-red-800">🚨 This batch has been recalled</p>
          {batch.recallReason && <p className="text-sm text-red-700 mt-1">Reason: {batch.recallReason}</p>}
          <p className="text-sm text-red-700 mt-1">If you still have any of this product, don't eat it — return it to where you bought it.</p>
        </div>
      )}
      <div className="space-y-6">
        {lineage.length > 0 && (
          <section>
            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">{SPECIES_ICON[batch.species] || '🌾'} Where it came from</h4>
            <StepList steps={lineageSteps(lineage)} />
          </section>
        )}
        <section>
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">{madeFrom ? '🥩 Made' : '🌱 Origin'}</h4>
          <StepList steps={origin} />
          {madeFrom?.parents?.length > 1 && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
              <p className="font-semibold text-gray-700 mb-1">Made from</p>
              <ul className="space-y-0.5">
                {madeFrom.parents.map(p => (
                  <li key={p.batchId} className="text-gray-600">{qty(p.quantityUsed, p.unit)} {p.productName}{p.lotRef ? ` (${p.lotRef})` : ''} — {p.farmName || 'farm'}</li>
                ))}
              </ul>
            </div>
          )}
          {batch.species && madeFrom && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-900">
              <p className="font-semibold mb-1">🏷️ Traceability details</p>
              <p>
                {batch.bornIn ? `Born in ${batch.bornIn}` : 'Born in several countries'}
                {batch.rearedIn ? ` · Reared in ${batch.rearedIn}` : ''}
                {slaughterhouse ? ` · Slaughtered in UK (${slaughterhouse})` : ''}
                {cutPlant ? ` · Cut in UK (${cutPlant})` : ''}
                {batch.animalRef ? ` · Ref ${batch.animalRef}` : madeFrom.lotRef ? ` · Ref ${madeFrom.lotRef}` : ''}
              </p>
            </div>
          )}
          {(madeFrom?.ingredients || batch.allergens?.length > 0) && (
            <div className="mt-3 bg-white border border-gray-200 rounded-lg p-3 text-sm text-gray-800">
              {madeFrom?.ingredients && <p><span className="font-semibold">Ingredients:</span> {madeFrom.ingredients}</p>}
              {batch.allergens?.length > 0 && (
                <p className="mt-1 text-amber-900"><span className="font-semibold">⚠️ Allergens:</span> {batch.allergens.map(a => <strong key={a} className="mr-1">{a}</strong>)}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">As recorded by the maker. Always check with the café if you have an allergy.</p>
            </div>
          )}
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