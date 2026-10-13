import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';
const EXPLORER = 'https://sepolia.basescan.org';

const STAGE_ICONS = {
  farm: '🌾',
  warehouse: '📦',
  transport: '🚚',
  restaurant: '🍽️',
  consumer: '🛒',
  sold: '💷',
};

const iconFor = (stage) => STAGE_ICONS[(stage || '').toLowerCase()] || '📍';

/**
 * JourneyTimeline — the on-chain journey of a batch.
 *
 * Props:
 *   batchId        – which batch
 *   refreshKey     – change it to re-load (e.g. after recording a checkpoint)
 *   registeredAt   – optional: batch creation date, shown as the first step
 *   creationTxHash – optional: batch creation transaction, linked on Basescan
 *   farmName       – optional: shown on the first step ("Harvested & registered by …")
 *   farmLocation   – optional: shown on the first step
 */
function JourneyTimeline({
  batchId,
  refreshKey = 0,
  registeredAt = null,
  creationTxHash = null,
  farmName = null,
  farmLocation = null,
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

  const formatDate = (d) =>
    new Date(d).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  // Build the list of steps: batch registration first (if known), then checkpoints
  const steps = [];
  if (registeredAt || creationTxHash) {
    steps.push({
      key: 'registered',
      icon: '🌾',
      title: farmName ? `Harvested & registered by ${farmName}` : 'Harvested & registered on-chain',
      subtitle: farmLocation || null,
      notes: null,
      date: registeredAt,
      txHash: creationTxHash,
    });
  }
  checkpoints.forEach((c) => {
    const isSale = (c.stage || '').toLowerCase() === 'sold';
    steps.push({
      key: `cp-${c.index}`,
      icon: iconFor(c.stage),
      // Sales: the location is the seller, so read "Sold by Earth To Mouth Cafe"
      title: isSale && c.location ? `Sold by ${c.location}` : c.stage,
      subtitle: isSale
        ? null
        : [c.location, c.recorderName && c.recorderName !== c.location ? `by ${c.recorderName}` : null]
            .filter(Boolean).join(' · '),
      notes: c.notes,
      date: c.recordedAt,
      txHash: c.txHash,
    });
  });

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
      ) : steps.length === 0 ? (
        <p className="text-gray-500 text-sm">No journey steps recorded yet.</p>
      ) : (
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
      )}
    </div>
  );
}

export default JourneyTimeline;