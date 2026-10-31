import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import JourneyTimeline from './JourneyTimeline';
import {
  API_BASE, EXPLORER, hasWallet, shortAddr, toScaled, formatQty, lastStepText, shortWhen,
  connectMetaMask, supplyChainWithSigner, sendAndConfirm, walletError,
} from './walletHelpers';

/**
 * SupplyChainPage — for depots, drivers and farms using a wallet (MetaMask).
 *   /supply                         → connect wallet, see work for this wallet
 *   /supply?shipment=12             → opened from an NFC sticker on a crate: record a step on shipment 12
 *   /supply?batch=KG-RED-...        → farm: record a "Farm" step on this batch
 * (Old /checkpoint?batch=... sticker links open this page too.)
 * Restaurants don't need this page — they confirm deliveries in the Restaurant portal.
 */
function SupplyChainPage({ onBack }) {
  const params = new URLSearchParams(window.location.search);
  const urlShipment = params.get('shipment');
  const urlBatch = params.get('batch');

  const [config,  setConfig]  = useState(null);
  const [account, setAccount] = useState(null);
  const [who,     setWho]     = useState(null);     // participant info for the wallet
  const [walletErr, setWalletErr] = useState(null);
  const [inbound, setInbound] = useState([]);
  const [carrying, setCarrying] = useState([]);   // shipments this depot/courier is handling for others
  const [outbound, setOutbound] = useState([]);   // shipments this wallet sent on
  const [farmBatches, setFarmBatches] = useState([]);
  const [focusShipment, setFocusShipment] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Contract details + sticker shipment ──
  useEffect(() => {
    axios.get(`${API_BASE}/chain/config`).then(r => setConfig(r.data)).catch(() => setConfig({ error: true }));
    axios.get(`${API_BASE}/participants`).then(r => setParticipants(r.data.participants || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!urlShipment) return;
    axios.get(`${API_BASE}/shipment/${urlShipment}`)
      .then(r => setFocusShipment(r.data.shipment))
      .catch(() => setFocusShipment({ error: 'Shipment not found — check the sticker link.' }));
  }, [urlShipment, refreshKey]);

  // ── Who is this wallet, and what's waiting for it? ──
  const loadWallet = useCallback(async (address) => {
    setWho(null);
    setInbound([]);
    setCarrying([]);
    setOutbound([]);
    setFarmBatches([]);
    if (!address) return;
    try {
      const [p, inb, fb, car, out] = await Promise.all([
        axios.get(`${API_BASE}/participant/${address}`),
        axios.get(`${API_BASE}/supply/inbound/${address}`),
        axios.get(`${API_BASE}/supply/batches/${address}`),
        axios.get(`${API_BASE}/supply/carrying/${address}`),
        axios.get(`${API_BASE}/supply/outbound/${address}`),
      ]);
      setWho(p.data);
      setInbound(inb.data.shipments || []);
      setCarrying(car.data.shipments || []);
      setOutbound(out.data.shipments || []);
      setFarmBatches(fb.data.batches || []);
    } catch (err) {
      setWho({ authorized: false, error: walletError(err) });
    }
  }, []);

  useEffect(() => { if (account) loadWallet(account); }, [account, refreshKey, loadWallet]);

  const connect = async () => {
    setWalletErr(null);
    try {
      setAccount(await connectMetaMask());
    } catch (err) {
      setWalletErr(walletError(err));
    }
  };

  // Follow account switches in MetaMask (handy for the desk test)
  useEffect(() => {
    if (!hasWallet()) return;
    const onAccounts = (accounts) => setAccount(accounts[0] || null);
    window.ethereum.on?.('accountsChanged', onAccounts);
    return () => window.ethereum.removeListener?.('accountsChanged', onAccounts);
  }, []);

  const refresh = () => setRefreshKey(k => k + 1);
  const pageUrl = window.location.href;
  const metamaskLink = `https://metamask.app.link/dapp/${pageUrl.replace(/^https?:\/\//, '')}`;
  const canAct = !!who?.authorized && !config?.paused;
  const incoming = inbound.filter(s => s.status === 'in_transit');
  const holding = inbound.filter(s => s.status === 'delivered' && s.available > 0);
  const handlingStages = (who?.stages || []);

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800">🚚 Supply Chain</h2>
        <p className="text-gray-600 text-sm mt-1">
          For depots, drivers and farms with a wallet. Restaurants: use the 🍽️ Restaurant portal instead.
        </p>
      </div>

      {config?.paused && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <p className="text-yellow-800 font-semibold">⏸️ Recording is paused right now. Please try again later.</p>
        </div>
      )}

      {/* Wallet */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-3">1. Connect wallet</h3>
        {!hasWallet() ? (
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">No wallet found in this browser. On a phone, open this page in the MetaMask app:</p>
            <a href={metamaskLink} className="block text-center bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 transition">🦊 Open in MetaMask</a>
          </div>
        ) : !account ? (
          <button onClick={connect} className="w-full bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 transition">🦊 Connect MetaMask</button>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-gray-600">Connected: <span className="font-mono">{shortAddr(account)}</span></p>
            {who === null ? (
              <p className="text-sm text-gray-500">Checking permissions…</p>
            ) : who.error ? (
              <p className="text-sm text-red-600">⚠️ {who.error} <button onClick={refresh} className="text-blue-600 hover:underline ml-1">Try again</button></p>
            ) : who.authorized ? (
              <p className="text-sm text-green-700 font-semibold">
                ✅ {who.name} · {who.role === 'farmer' ? 'farm' : who.role === 'restaurant' ? 'restaurant' : `handler (${handlingStages.join(', ') || 'receive & forward'})`}
              </p>
            ) : (
              <p className="text-sm text-red-600 font-semibold">⛔ This wallet isn't registered on the supply chain. Switch wallet in MetaMask.</p>
            )}
          </div>
        )}
        {walletErr && <p className="text-sm text-red-600 mt-2">⚠️ {walletErr}</p>}
      </div>

      {/* Opened from a sticker: one shipment */}
      {urlShipment && focusShipment && (
        focusShipment.error ? (
          <div className="bg-white rounded-lg shadow-lg p-6"><p className="text-red-600">⚠️ {focusShipment.error}</p></div>
        ) : (
          <ShipmentPanel
            title="📦 This shipment"
            shipment={focusShipment}
            account={account}
            who={who}
            canAct={canAct}
            config={config}
            participants={participants}
            onDone={refresh}
          />
        )
      )}

      {/* Work for this wallet: arriving → in stock → carrying for others → history */}
      {account && who?.authorized && who.role !== 'farmer' && (() => {
        // Delivered before the depot logged its steps → stays here so they can be caught up
        const needsCatchUp = (s) => s.status === 'delivered' && (!s.carrierSteps?.arrived || !s.carrierSteps?.out);
        const carryingNow = carrying.filter(s => s.status === 'in_transit' || needsCatchUp(s));
        const history = [
          ...outbound.map(s => ({ ...s, kind: 'sent' })),
          ...carrying.filter(s => s.status !== 'in_transit' && !needsCatchUp(s)).map(s => ({ ...s, kind: 'carried' })),
        ].sort((a, b) => b.shipmentId - a.shipmentId);
        const section = ({ n, title, hint, items, empty }) => (   // plain function so open forms aren't reset
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-1">{n}. {title} ({items.length})</h3>
            {hint && <p className="text-sm text-gray-500 mb-3">{hint}</p>}
            {items.length === 0 ? <p className="text-sm text-gray-500">{empty}</p> : (
              <div className="space-y-3">
                {items.map(s => (
                  <ShipmentPanel key={s.shipmentId} shipment={s} account={account} who={who} canAct={canAct}
                    config={config} participants={participants} onDone={refresh} compact />
                ))}
              </div>
            )}
          </div>
        );
        return (
          <>
            {section({ n: 2, title: "Arriving", items: incoming, hint: "Stock sent to you. Confirm how much arrived when it gets here.", empty: "Nothing on its way to you." })}
            {section({ n: 3, title: "In stock", items: holding, hint: "Stock you've received. Send some on to a business when it leaves.", empty: "Nothing in stock." })}
            {who.role === 'handler' && (
              section({ n: 4, title: "Carrying for others", items: carryingNow, hint: "Shipments going to someone else via you. Record each step as you collect, store and hand them over — the receiver confirms delivery. If something was delivered before you logged it, catch up the missed steps here.", empty: "Nothing to carry right now." })
            )}
            <details className="bg-white rounded-lg shadow-lg p-6">
              <summary className="text-lg font-bold text-gray-800 cursor-pointer">
                {who.role === 'handler' ? 5 : 4}. History ({history.length})
              </summary>
              <p className="text-sm text-gray-500 mt-1 mb-3">What you've sent on and what you've carried, with how it ended up.</p>
              {history.length === 0 ? <p className="text-sm text-gray-500">Nothing yet.</p> : (
                <div className="divide-y divide-gray-100">
                  {history.map(s => (
                    <div key={`${s.kind}-${s.shipmentId}`} className="py-3 flex justify-between gap-3 flex-wrap">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800">
                          #{s.shipmentId} · {formatQty(s.quantitySent, s.unit)} {s.productName} → {s.toName}
                        </p>
                        <p className="text-xs text-gray-500">
                          {s.kind === 'sent' ? 'Sent by you' : `Carried for ${s.fromName}`} · {new Date(s.createdAt).toLocaleDateString('en-GB')}
                        </p>
                        {s.status === 'delivered' && (
                          <p className={`text-xs ${s.shortfall > 0 ? 'text-orange-600 font-semibold' : 'text-gray-500'}`}>
                            Received {formatQty(s.quantityReceived, s.unit)}{s.quantityRejected > 0 ? ` · ${formatQty(s.quantityRejected, s.unit)} refused` : ''}{s.shortfall > 0 ? ` · ⚠️ ${formatQty(s.shortfall, s.unit)} missing` : ''}
                            {s.deliveryNotes ? ` · "${s.deliveryNotes}"` : ''}
                          </p>
                        )}
                        {s.kind === 'carried' && s.status === 'delivered' && !s.carrierSteps?.out && (
                          <p className="text-xs text-amber-700">⚠️ Delivered before you logged "Out for delivery"</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full h-fit ${
                        s.status === 'delivered' ? 'bg-green-100 text-green-700' : s.status === 'in_transit' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                        {s.status === 'delivered' ? 'Delivered' : s.status === 'in_transit' ? 'On its way' : 'Cancelled'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </details>
          </>
        );
      })()}

      {/* Farms: record a "Farm" step on their own batches */}
      {account && who?.role === 'farmer' && (
        <FarmSteps batches={farmBatches} preselect={urlBatch} canAct={canAct} config={config} onDone={refresh} />
      )}

      {/* Journey of the shipment's batch */}
      {focusShipment && !focusShipment.error && (
        <JourneyTimeline batchId={focusShipment.batchId} refreshKey={refreshKey} />
      )}

      {/* Sticker link for this page */}
      {who?.authorized && (urlShipment || urlBatch) && (
        <details className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
          <summary className="font-semibold text-gray-700 cursor-pointer">🏷️ NFC sticker links for this page</summary>
          <p className="mt-2 text-gray-700 font-semibold">Opens in the MetaMask app (recommended for phones):</p>
          <p className="font-mono text-xs break-all bg-white border rounded p-2">{metamaskLink}</p>
          <p className="mt-2 text-gray-700 font-semibold">Opens in the normal browser:</p>
          <p className="font-mono text-xs break-all bg-white border rounded p-2">{pageUrl}</p>
        </details>
      )}

      <div className="text-center">
        <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// One shipment: receive it, send part of it on, or record a handling step
// ─────────────────────────────────────────────
function ShipmentPanel({ title, shipment: s, account, who, canAct, config, participants, onDone, compact }) {
  const [mode,   setMode]   = useState(null);     // 'receive' | 'forward' | 'return' | 'step'
  const [qty,    setQty]    = useState('');
  const [refused, setRefused] = useState('');     // receive: refused at the door (goes back to the sender)
  const [to,     setTo]     = useState('');
  const [stage,  setStage]  = useState('');
  const [where,  setWhere]  = useState('');
  const [notes,  setNotes]  = useState('');
  const [status, setStatus] = useState('idle');
  const [txHash, setTxHash] = useState(null);
  const [error,  setError]  = useState(null);
  const [unsynced, setUnsynced] = useState(false);
  const [preset, setPreset] = useState(null);     // 'arrived' | 'out' quick steps for carried shipments
  const [showAll, setShowAll] = useState(false);  // show every update, not just the latest

  const mine = account && s.toAddress === account.toLowerCase();
  const carried = account && s.carrierAddress === account.toLowerCase();
  const stages = who?.stages || [];
  const busy = ['signing', 'mining', 'saving'].includes(status);

  // The two steps a depot / courier records on a shipment it's carrying — in order, once each (enforced on-chain)
  const PRESETS = {
    arrived: `Arrived at ${who?.name || 'depot'}`,
    out:     `Out for delivery to ${s.toName}`,
  };
  // Where a carried shipment has got to: steps go in order, once each —
  // Arrived with us → Out for delivery → (receiver confirms)
  const progress = s.carrierSteps || { arrived: false, out: false };
  const carriedStatus = progress.out ? '🚚 Out for delivery'
    : progress.arrived ? `📦 At ${who?.name || 'depot'}` : null;
  const nextQuick = !progress.arrived ? 'arrived' : !progress.out ? 'out' : null;
  // Delivered before this depot / courier logged its steps — they can still be added, marked as late
  const late = carried && s.status === 'delivered' && !!nextQuick;

  const open = (m, presetKey = null) => {
    setMode(m); setError(null); setTxHash(null); setStatus('idle'); setNotes(''); setRefused('');
    setPreset(presetKey);
    setQty(m === 'receive' ? String(s.quantitySent) : '');
    setStage(presetKey === 'out' && stages.includes('Transport') ? 'Transport' : (stages[0] || ''));
    setWhere(who?.name || '');
  };

  const run = async () => {
    setError(null);
    try {
      const contract = await supplyChainWithSigner(config.contractAddress);
      let result;
      const Z = ethers.ZeroAddress, ZH = ethers.ZeroHash;
      if (mode === 'receive') {
        result = await sendAndConfirm(contract, 'confirmReceipt',
          [Z, s.shipmentId, toScaled(qty), toScaled(refused || 0), ZH, ZH, notes.trim()], setStatus);
      } else if (mode === 'forward') {
        result = await sendAndConfirm(contract, 'forward', [Z, s.shipmentId, to, toScaled(qty), Z, ZH, notes.trim()], setStatus);
      } else if (mode === 'return') {
        result = await sendAndConfirm(contract, 'returnGoods', [Z, s.shipmentId, toScaled(qty), Z, notes.trim()], setStatus);
      } else if (preset === 'arrived') {
        result = await sendAndConfirm(contract, 'carrierArrived', [Z, s.shipmentId, where.trim(), notes.trim(), ZH], setStatus);
      } else if (preset === 'out') {
        result = await sendAndConfirm(contract, 'carrierOutForDelivery', [Z, s.shipmentId, notes.trim(), ZH], setStatus);
      } else {
        // Catch accidental double taps: same wallet + stage on this shipment in the last 10 minutes
        try {
          const j = await axios.get(`${API_BASE}/batch/${encodeURIComponent(s.batchId)}/journey`);
          const recent = (j.data.checkpoints || []).some(c =>
            c.shipmentId === s.shipmentId && c.stage === stage && c.recordedBy === account.toLowerCase() &&
            Date.now() - new Date(c.recordedAt).getTime() < 10 * 60 * 1000);
          if (recent && !window.confirm(`You already recorded "${stage}" on this shipment in the last 10 minutes. Record another?`)) return;
        } catch (_) {}
        result = await sendAndConfirm(contract, 'addCheckpoint', [Z, s.batchId, s.shipmentId, stage, where.trim(), notes.trim().slice(0, 280), ZH], setStatus);
      }
      setTxHash(result.hash);
      setUnsynced(!result.synced);
      onDone?.();
    } catch (err) {
      console.error('Supply chain action:', err);
      setStatus('idle');
      setError(walletError(err));
    }
  };

  const STATUS_TEXT = { in_transit: 'On its way', delivered: 'Delivered', cancelled: 'Cancelled' };

  return (
    <div className={compact ? 'border border-gray-200 rounded-lg p-4' : 'bg-white rounded-lg shadow-lg p-6'}>
      {title && <h3 className="text-lg font-bold text-gray-800 mb-2">{title}</h3>}
      <div className="flex justify-between gap-2 flex-wrap">
        <p className="font-bold text-gray-800">#{s.shipmentId} · {formatQty(s.quantitySent, s.unit)} {s.productName}</p>
        {s.status === 'in_transit' && carriedStatus && (
          <span className="text-xs font-semibold bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full h-fit">{carriedStatus}</span>
        )}
      </div>
      <p className="text-sm text-gray-600">{s.fromName} → {s.toName}{s.carrierName ? ` (via ${s.carrierName})` : ''} · {STATUS_TEXT[s.status] || s.status}</p>
      {s.status === 'delivered' && (
        <p className="text-sm text-gray-600">
          Received {formatQty(s.quantityReceived, s.unit)}{s.quantityRejected > 0 ? ` · ${formatQty(s.quantityRejected, s.unit)} refused` : ''}{s.shortfall > 0 ? ` (⚠️ ${formatQty(s.shortfall, s.unit)} missing)` : ''} · {formatQty(s.available, s.unit)} left
        </p>
      )}
      <p className="font-mono text-xs text-gray-400">{s.batchId}</p>
      {s.recalled && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 mt-1 font-semibold">
          🚨 Recalled by the farm{s.recallReason ? `: ${s.recallReason}` : ''}. Don't send it on — return it or write it off.
        </p>
      )}
      {s.dispatchNotes && (
        <p className="text-xs text-gray-600 italic mt-1">{s.fromName}: "{s.dispatchNotes}"</p>
      )}
      {s.handlingSteps?.length > 0 ? (
        <div className="text-xs text-teal-700 bg-teal-50 rounded px-2 py-1 mt-2">
          {showAll ? (
            <ul className="space-y-0.5">
              {s.handlingSteps.map((st, i) => (
                <li key={i}>
                  📍 <span className="text-gray-500">{shortWhen(st.recordedAt)}</span> · {st.recorderName || st.stage}
                  {st.notes ? `: ${st.notes}` : ` — ${st.stage}`}
                </li>
              ))}
            </ul>
          ) : (
            <p>📍 Latest: {lastStepText(s.handlingSteps[s.handlingSteps.length - 1])}</p>
          )}
          {s.handlingSteps.length > 1 && (
            <button onClick={() => setShowAll(v => !v)} className="text-blue-600 hover:underline mt-1">
              {showAll ? 'Show latest only' : `Show all ${s.handlingSteps.length} updates`}
            </button>
          )}
        </div>
      ) : s.lastStep && (
        <p className="text-xs text-teal-700 bg-teal-50 rounded px-2 py-1 mt-2">📍 Latest: {lastStepText(s.lastStep)}</p>
      )}

      {canAct && !busy && status !== 'done' && (
        <div className="flex gap-2 mt-3 flex-wrap">
          {mine && s.status === 'in_transit' && who.role !== 'farmer' && (
            <button onClick={() => open('receive')} className="bg-green-600 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-green-700">✅ Confirm received</button>
          )}
          {mine && s.status === 'delivered' && s.available > 0 && !s.recalled && (
            <button onClick={() => open('forward')} className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-blue-700">🚚 Send some on</button>
          )}
          {mine && s.status === 'delivered' && s.available > 0 && (
            <button onClick={() => open('return')} className="bg-white border border-gray-300 text-gray-700 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-50">↩️ Send back to {s.fromName}</button>
          )}
          {carried && s.status === 'in_transit' && nextQuick === 'arrived' && (
            <button onClick={() => open('step', 'arrived')} className="bg-teal-600 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-teal-700">📦 Arrived with us</button>
          )}
          {carried && s.status === 'in_transit' && nextQuick === 'out' && (
            <button onClick={() => open('step', 'out')} className="bg-blue-600 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-blue-700">🚚 Out for delivery</button>
          )}
          {late && (
            <>
              <p className="w-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                ⚠️ {s.toName} confirmed delivery before you logged these steps. Add them now so the journey is complete — they'll show as logged after delivery.
              </p>
              <button onClick={() => open('step', nextQuick)} className="bg-amber-600 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-amber-700">
                {nextQuick === 'arrived' ? '📦 Log missed: Arrived with us' : '🚚 Log missed: Out for delivery'}
              </button>
            </>
          )}
          {carried && s.status === 'in_transit' && !nextQuick && (
            <p className="text-sm text-gray-600 self-center">⏳ Waiting for {s.toName} to confirm delivery</p>
          )}
          {stages.length > 0 && s.status !== 'cancelled' && (
            <button onClick={() => open('step')} className="bg-gray-700 text-white text-sm font-semibold px-3 py-2 rounded-lg hover:bg-gray-800">📍 {carried ? 'Other step' : 'Record a step'}</button>
          )}
        </div>
      )}

      {mode && status !== 'done' && (
        <div className="mt-3 bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
          {(mode === 'receive' || mode === 'forward' || mode === 'return') && (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-600 w-24">{mode === 'receive' ? 'Received:' : mode === 'return' ? 'Send back:' : 'Quantity:'}</span>
              <input type="number" step="any" min="0" max={mode === 'receive' ? s.quantitySent : s.available}
                value={qty} onChange={(e) => setQty(e.target.value)} disabled={busy}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="text-sm text-gray-500">{s.unit}</span>
            </div>
          )}
          {mode === 'receive' && (
            <div className="flex gap-2 items-center">
              <span className="text-sm text-gray-600 w-24">Refused:</span>
              <input type="number" step="any" min="0" max={s.quantitySent} placeholder="0"
                value={refused} onChange={(e) => setRefused(e.target.value)} disabled={busy}
                className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              <span className="text-xs text-gray-500">{s.unit} turned away at the door — goes back to {s.fromName}</span>
            </div>
          )}
          {mode === 'forward' && (
            <select value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
              <option value="">— Send to —</option>
              {participants.filter(p => p.address !== account.toLowerCase()).map(p => (
                <option key={p.address} value={p.address}>{p.name}</option>
              ))}
            </select>
          )}
          {mode === 'step' && preset && (
            <p className="text-sm font-semibold text-gray-800">{PRESETS[preset]}</p>
          )}
          {mode === 'step' && preset === 'arrived' && (
            <input type="text" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={100} disabled={busy}
              placeholder="Location, e.g. Bristol Depot" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          )}
          {mode === 'step' && !preset && (
            <>
              {stages.length > 1 ? (
                <select value={stage} onChange={(e) => setStage(e.target.value)} disabled={busy}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                  {stages.map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              ) : (
                <p className="text-sm font-semibold text-gray-700">Step: {stage}</p>
              )}
              <input type="text" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={100} disabled={busy}
                placeholder="Location, e.g. Bristol Depot" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </>
          )}
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} disabled={busy}
            placeholder={preset ? 'Extra note (optional), e.g. van reg, ETA 10am' : 'Notes (optional)'} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          {error && <p className="text-sm text-red-600 font-semibold">⚠️ {error}</p>}
          <div className="flex gap-2">
            <button onClick={run} disabled={busy || (mode === 'forward' && (!to || !qty)) || (mode === 'return' && !qty) || (mode === 'receive' && qty === '')}
              className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
              {status === 'signing' ? '🦊 Confirm in MetaMask…' : status === 'mining' ? '⛓️ Recording…' : status === 'saving' ? '💾 Saving…' : 'Record on-chain'}
            </button>
            {!busy && <button onClick={() => setMode(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>}
          </div>
        </div>
      )}

      {status === 'done' && txHash && (
        <div className="mt-3 bg-green-50 border border-green-300 rounded-lg p-3">
          <p className="text-green-700 font-semibold">✅ Recorded on-chain!</p>
          {preset === 'out' && <p className="text-xs text-gray-600 mt-1">{s.toName} confirms how much arrived — then this moves to your History.</p>}
          {unsynced && (
            <p className="text-xs text-orange-700 mt-1">
              The app hasn't caught up yet, so this list may look out of date. Refresh in a minute, or re-sync this transaction on the Admin page.
            </p>
          )}
          <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">View on Basescan ↗</a>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Farms: record a "Farm" step on one of their own batches (e.g. "Washed and graded")
// ─────────────────────────────────────────────
function FarmSteps({ batches, preselect, canAct, config, onDone }) {
  const [batchId, setBatchId] = useState(preselect || '');
  const [where,   setWhere]   = useState('');
  const [notes,   setNotes]   = useState('');
  const [status,  setStatus]  = useState('idle');
  const [txHash,  setTxHash]  = useState(null);
  const [error,   setError]   = useState(null);
  const busy = ['signing', 'mining', 'saving'].includes(status);

  const run = async () => {
    setError(null);
    try {
      const contract = await supplyChainWithSigner(config.contractAddress);
      const result = await sendAndConfirm(contract, 'addCheckpoint', [ethers.ZeroAddress, batchId, 0, 'Farm', where.trim(), notes.trim(), ethers.ZeroHash], setStatus);
      setTxHash(result.hash);
      setNotes('');
      onDone?.();
    } catch (err) {
      setStatus('idle');
      setError(walletError(err));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 space-y-3">
      <h3 className="text-lg font-bold text-gray-800">🌾 Record a farm step</h3>
      <p className="text-sm text-gray-500">To send produce to a restaurant or depot, use 🚚 in your Farmer Portal.</p>
      <select value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={busy}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
        <option value="">— Choose a batch —</option>
        {batches.map(b => <option key={b.batchId} value={b.batchId}>{b.productName} — {b.batchId}</option>)}
      </select>
      <input type="text" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={100} disabled={busy}
        placeholder="Where, e.g. Packing shed" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={280} disabled={busy}
        placeholder="What happened, e.g. Washed and graded" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
      {error && <p className="text-sm text-red-600 font-semibold">⚠️ {error}</p>}
      {status === 'done' && txHash && (
        <p className="text-sm text-green-700 font-semibold">✅ Recorded! <a href={`${EXPLORER}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View on Basescan ↗</a></p>
      )}
      <button onClick={run} disabled={!canAct || !batchId || busy}
        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400">
        {status === 'signing' ? '🦊 Confirm in MetaMask…' : status === 'mining' ? '⛓️ Recording…' : status === 'saving' ? '💾 Saving…' : '📍 Record farm step'}
      </button>
    </div>
  );
}

export default SupplyChainPage;