import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';
const EXPLORER = 'https://sepolia.basescan.org';

const STAGE_ICONS = {
  farm: '🌾',
  warehouse: '📦',
  transport: '🚚',
  delivered: '✅',
  restaurant: '🍽️',
  consumer: '🛒',
  sold: '💷',
};

const iconFor = (stage) => STAGE_ICONS[(stage || '').toLowerCase()] || '📍';
const isStage = (c, name) => (c.stage || '').toLowerCase() === name;

const formatDate = (d) =>
  new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

const formatNum = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, ''));

// Turn one checkpoint into a display step
const toStep = (c) => {
  const isSale = isStage(c, 'sold');
  const isDelivery = isStage(c, 'delivered');
  return {
    key: `cp-${c.index}`,
    icon: iconFor(c.stage),
    // Sales: the location is the seller, so read "Sold by Earth To Mouth Cafe"
    title: isSale && c.location ? `Sold by ${c.location}`
         : isDelivery && c.location ? `Delivered to ${c.location}`
         : c.stage,
    subtitle: isSale || isDelivery
      ? null
      : [c.location, c.recorderName && c.recorderName !== c.location ? `by ${c.recorderName}` : null]
          .filter(Boolean).join(' · '),
    notes: c.notes,
    date: c.recordedAt,
    txHash: c.txHash,
  };
};

// Vertical list of steps (same look as before)
function StepList({ steps }) {
  return (
    <ol className="relative">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-4">
          {/* Icon + connecting line */}
          <div className="flex flex-col items-center">
            <div className="w-10 h-10 rounded-full bg-green-100 border-2 border-green-500 flex items-center justify-center text-lg shrink-0">
              {s.icon}
            </div>
            {i < steps.length - 1 && <div className="w-0.5 flex-1 bg-green-200 my-1" />}
          </div>

          {/* Details */}
          <div className={`min-w-0 ${i < steps.length - 1 ? 'pb-6' : ''}`}>
            <p className="font-bold text-gray-800">{s.title}</p>
            {s.subtitle && <p className="text-sm text-gray-600">{s.subtitle}</p>}
            {s.notes && <p className="text-sm text-gray-500 italic">"{s.notes}"</p>}
            <div className="flex flex-wrap gap-x-3 text-xs text-gray-400 mt-1">
              {s.date && <span>{formatDate(s.date)}</span>}
              {s.txHash && (
                <a
                  href={`${EXPLORER}/tx/${s.txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
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

// One "Where it went" card per destination (restaurant)
function DestinationCard({ name, checkpoints, highlighted }) {
  const [open, setOpen] = useState(highlighted);
  const [showSales, setShowSales] = useState(false);

  useEffect(() => { if (highlighted) setOpen(true); }, [highlighted]);

  const sales = checkpoints.filter(c => isStage(c, 'sold'));
  const others = checkpoints.filter(c => !isStage(c, 'sold'));

  // Summaries parsed from the notes the backend writes ("Received 50 kg", "Sold 2 kg")
  let received = 0, receivedUnit = '';
  checkpoints.filter(c => isStage(c, 'delivered')).forEach(c => {
    const m = /Received ([\d.]+)\s*([^\s—-]*)/i.exec(c.notes || '');
    if (m) { received += parseFloat(m[1]); receivedUnit = receivedUnit || m[2]; }
  });
  let sold = 0, soldUnit = '';
  sales.forEach(c => {
    const m = /Sold ([\d.]+)\s*(\S*)/i.exec(c.notes || '');
    if (m) { sold += parseFloat(m[1]); soldUnit = soldUnit || m[2]; }
  });

  const summary = [
    received > 0 ? `Received ${formatNum(received)} ${receivedUnit}`.trim() : null,
    sales.length > 0
      ? `${sales.length} sale${sales.length === 1 ? '' : 's'}${sold > 0 ? ` · ${formatNum(sold)} ${soldUnit}`.trimEnd() : ''}`
      : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className={`rounded-lg border-2 ${highlighted ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left p-4 flex items-center justify-between gap-3"
      >
        <div className="min-w-0">
          {highlighted && (
            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">Your purchase came via</p>
          )}
          <p className="font-bold text-gray-800">🍽️ {name}</p>
          {summary && <p className="text-sm text-gray-600">{summary}</p>}
        </div>
        <span className="text-gray-400 text-sm shrink-0">{open ? '▲ Hide' : '▼ Details'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4">
          {others.length > 0 && <StepList steps={others.map(toStep)} />}

          {sales.length > 0 && (
            <div>
              <button
                onClick={() => setShowSales(s => !s)}
                className="text-sm text-blue-600 hover:underline"
              >
                {showSales ? 'Hide individual sales' : `Show all ${sales.length} sale${sales.length === 1 ? '' : 's'}`}
              </button>
              {showSales && <div className="mt-3"><StepList steps={sales.map(toStep)} /></div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * JourneyTimeline — the on-chain journey of a batch, in three sections:
 *   🌱 Origin           – registration + farm steps
 *   📦 Shared handling  – steps for the whole batch (no destination)
 *   📍 Where it went    – one card per restaurant (deliveries + sales)
 *
 * Props:
 *   batchId            – which batch
 *   refreshKey         – change it to re-load (e.g. after recording a checkpoint)
 *   registeredAt       – optional: batch creation date, shown as the first step
 *   creationTxHash     – optional: batch creation transaction, linked on Basescan
 *   farmName           – optional: shown on the first step ("Harvested & registered by …")
 *   farmLocation       – optional: shown on the first step
 *   highlightDestination – optional: restaurant name to highlight & open (e.g. from a receipt)
 */
function JourneyTimeline({
  batchId,
  refreshKey = 0,
  registeredAt = null,
  creationTxHash = null,
  farmName = null,
  farmLocation = null,
  highlightDestination = null,
}) {
  const [checkpoints, setCheckpoints] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  useEffect(() => {
    if (!batchId) return;
    (async () => {
      try {
        setLoading(true);
        const res = await axios.get(`${API_BASE}/batch/${encodeURIComponent(batchId)}/checkpoints`);
        setCheckpoints(res.data.checkpoints || []);
        setError(null);
      } catch (err) {
        console.error('JourneyTimeline:', err);
        setError('Could not load the journey.');
      } finally {
        setLoading(false);
      }
    })();
  }, [batchId, refreshKey]);

  // ── Origin: registration + farm steps for the whole batch ──
  const originSteps = [];
  if (registeredAt || creationTxHash) {
    originSteps.push({
      key: 'registered',
      icon: '🌾',
      title: farmName ? `Harvested & registered by ${farmName}` : 'Harvested & registered on-chain',
      subtitle: farmLocation || null,
      notes: null,
      date: registeredAt,
      txHash: creationTxHash,
    });
  }
  const shared = checkpoints.filter(c => !(c.destination || '').trim());
  shared.filter(c => isStage(c, 'farm')).forEach(c => originSteps.push(toStep(c)));

  // ── Shared handling: everything else with no destination ──
  const sharedSteps = shared.filter(c => !isStage(c, 'farm')).map(toStep);

  // ── Where it went: group by destination ──
  const groups = new Map();
  checkpoints.filter(c => (c.destination || '').trim()).forEach(c => {
    const name = c.destination.trim();
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name, checkpoints: [] });
    groups.get(key).checkpoints.push(c);
  });
  const highlightKey = (highlightDestination || '').trim().toLowerCase();
  const destinations = [...groups.entries()]
    .sort(([a], [b]) => (a === highlightKey ? -1 : b === highlightKey ? 1 : 0))
    .map(([key, g]) => ({ ...g, key, highlighted: !!highlightKey && key === highlightKey }));

  const nothing = originSteps.length === 0 && sharedSteps.length === 0 && destinations.length === 0;

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-1">🔗 Journey</h3>
      <p className="text-sm text-gray-500 mb-5">
        Every step is recorded on the blockchain and can't be changed.
      </p>

      {loading ? (
        <p className="text-gray-500 text-sm">Loading journey…</p>
      ) : error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : nothing ? (
        <p className="text-gray-500 text-sm">No journey steps recorded yet.</p>
      ) : (
        <div className="space-y-6">
          {originSteps.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">🌱 Origin</h4>
              <StepList steps={originSteps} />
            </section>
          )}

          {sharedSteps.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">📦 Shared handling</h4>
              <StepList steps={sharedSteps} />
            </section>
          )}

          {destinations.length > 0 && (
            <section>
              <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">📍 Where it went</h4>
              <div className="space-y-3">
                {destinations.map(d => (
                  <DestinationCard
                    key={d.key}
                    name={d.name}
                    checkpoints={d.checkpoints}
                    highlighted={d.highlighted}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

export default JourneyTimeline;