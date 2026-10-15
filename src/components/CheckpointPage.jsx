import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import JourneyTimeline from './JourneyTimeline';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';

// Base Sepolia network details (used to switch MetaMask to the right network)
const BASE_SEPOLIA = {
  chainId: '0x14a34',                     // 84532
  chainName: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: ['https://sepolia.basescan.org'],
};

// Only the one function this page needs from the checkpoint contract
const CHECKPOINT_ABI = [
  'function addCheckpoint(string _batchId, string _stage, string _location, string _destination, string _notes)',
];

/**
 * CheckpointPage — opened from an NFC sticker, e.g.
 *   /checkpoint?batch=KG-RED-03102026-001&stage=Warehouse&location=Bristol%20Depot
 *   (optional &destination=Earth%20To%20Mouth%20Cafe for a step that belongs to one cafe's share)
 * The connected wallet signs addCheckpoint itself (it pays its own gas).
 */
function CheckpointPage({ onBack }) {
  const params = new URLSearchParams(window.location.search);
  const batchId = params.get('batch') || '';

  // ── Form ──
  const [stage,    setStage]    = useState(params.get('stage') || 'Warehouse');
  const [location, setLocation] = useState(params.get('location') || '');
  const [destination, setDestination] = useState(params.get('destination') || '');
  const [notes,    setNotes]    = useState('');

  // ── Data ──
  const [batch,      setBatch]      = useState(null);
  const [config,     setConfig]     = useState(null);
  const [loadError,  setLoadError]  = useState(null);

  // ── Wallet ──
  const [account,    setAccount]    = useState(null);
  const [handler,    setHandler]    = useState(null);   // { authorized, role, name, stages }
  const [walletErr,  setWalletErr]  = useState(null);

  // ── Recording ──
  const [status,     setStatus]     = useState('idle'); // idle | signing | mining | saving | done
  const [txHash,     setTxHash]     = useState(null);
  const [recordErr,  setRecordErr]  = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);      // re-loads the timeline after recording

  const hasWallet = typeof window !== 'undefined' && !!window.ethereum;

  // ── Load batch + contract config ──
  useEffect(() => {
    if (!batchId) {
      setLoadError('No batch in this link. Check the NFC sticker was programmed correctly.');
      return;
    }
    (async () => {
      try {
        const [batchRes, configRes] = await Promise.all([
          axios.get(`${API_BASE}/batch/${encodeURIComponent(batchId)}`),
          axios.get(`${API_BASE}/checkpoint/config`),
        ]);
        setBatch(batchRes.data.data);
        setConfig(configRes.data);
      } catch (err) {
        console.error('CheckpointPage load:', err);
        setLoadError(err.response?.data?.error || 'Could not load this batch.');
      }
    })();
  }, [batchId]);

  // ── Look up whether a wallet may record checkpoints ──
  const checkHandler = useCallback(async (address) => {
    setHandler(null);
    if (!address) return;
    try {
      const res = await axios.get(`${API_BASE}/checkpoint/handler/${address}`);
      setHandler(res.data);
      // Default the location to the handler's name if the sticker didn't set one
      if (res.data.name && !params.get('location')) setLocation(res.data.name);
      // Lock the stage to what this wallet is allowed to record (set on the contract)
      const allowed = res.data.stages || [];
      if (allowed.length > 0) {
        setStage(current => (allowed.includes(current) ? current : allowed[0]));
      }
    } catch (err) {
      console.error('Handler check:', err);
    }
  }, []);

  // ── Make sure MetaMask is on Base Sepolia ──
  const ensureBaseSepolia = async () => {
    const current = await window.ethereum.request({ method: 'eth_chainId' });
    if (current?.toLowerCase() === BASE_SEPOLIA.chainId) return;
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_SEPOLIA.chainId }],
      });
    } catch (err) {
      if (err.code === 4902) {
        // Network not added to MetaMask yet
        await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [BASE_SEPOLIA] });
      } else {
        throw err;
      }
    }
  };

  // ── Connect wallet ──
  const connectWallet = async () => {
    setWalletErr(null);
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      await ensureBaseSepolia();
      setAccount(accounts[0]);
      checkHandler(accounts[0]);
    } catch (err) {
      console.error('Connect wallet:', err);
      setWalletErr(err.code === 4001 ? 'Connection cancelled in MetaMask.' : (err.message || 'Could not connect wallet.'));
    }
  };

  // ── Follow account switches in MetaMask (handy for the desk test) ──
  useEffect(() => {
    if (!hasWallet) return;
    const onAccounts = (accounts) => {
      const next = accounts[0] || null;
      setAccount(next);
      setStatus('idle');
      setTxHash(null);
      setRecordErr(null);
      checkHandler(next);
    };
    window.ethereum.on?.('accountsChanged', onAccounts);
    return () => window.ethereum.removeListener?.('accountsChanged', onAccounts);
  }, [hasWallet, checkHandler]);

  // ── Record checkpoint ──
  const recordCheckpoint = async () => {
    setRecordErr(null);
    setTxHash(null);

    if (!stage.trim()) {
      setRecordErr('Please choose a stage.');
      return;
    }

    try {
      await ensureBaseSepolia();
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const contract = new ethers.Contract(config.contractAddress, CHECKPOINT_ABI, signer);

      // Catch accidental double taps: same wallet + same stage within 10 minutes
      try {
        const existing = await axios.get(`${API_BASE}/batch/${encodeURIComponent(batchId)}/checkpoints`);
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const recentDuplicate = (existing.data.checkpoints || []).some(c =>
          c.recordedBy?.toLowerCase() === account?.toLowerCase() &&
          (c.stage || '').toLowerCase() === stage.trim().toLowerCase() &&
          new Date(c.recordedAt).getTime() > tenMinutesAgo
        );
        if (recentDuplicate && !window.confirm(
          `This wallet already recorded a "${stage.trim()}" checkpoint for this batch in the last 10 minutes.\n\nRecord another one anyway?`
        )) {
          return;
        }
      } catch (_) {
        // If the check fails, carry on — the contract still protects the data
      }

      // Dry run first, so contract errors show clearly instead of as a failed transaction
      await contract.addCheckpoint.staticCall(batchId, stage.trim(), location.trim(), destination.trim(), notes.trim());

      setStatus('signing');
      const tx = await contract.addCheckpoint(batchId, stage.trim(), location.trim(), destination.trim(), notes.trim());
      setTxHash(tx.hash);

      setStatus('mining');
      await tx.wait();

      // Ask the backend to read it from the chain and save a copy
      setStatus('saving');
      try {
        await axios.post(`${API_BASE}/batch/${encodeURIComponent(batchId)}/checkpoints/confirm`, { txHash: tx.hash });
      } catch (err) {
        // It's on-chain either way — the database copy can be retried
        console.error('Confirm checkpoint:', err);
      }

      setStatus('done');
      setNotes('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Record checkpoint:', err);
      setStatus('idle');
      const reason = err.reason || err.shortMessage || err.info?.error?.message || err.message || '';
      if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
        setRecordErr('Transaction cancelled in MetaMask.');
      } else if (/insufficient funds/i.test(reason)) {
        setRecordErr('This wallet needs a little Base Sepolia ETH to pay for gas.');
      } else {
        setRecordErr(reason || 'Could not record the checkpoint.');
      }
    }
  };

  // Link that opens this page inside the MetaMask mobile app (for programming NFC stickers)
  const pageUrl = window.location.href;
  const metamaskLink = `https://metamask.app.link/dapp/${pageUrl.replace(/^https?:\/\//, '')}`;

  const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
  const busy = ['signing', 'mining', 'saving'].includes(status);
  const allowedStages = handler?.stages || [];

  // ─── Load error ───
  if (loadError) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">❌</div>
        <p className="text-red-600 mb-4">{loadError}</p>
        <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
      </div>
    );
  }

  // ─── Loading ───
  if (!batch || !config) {
    return (
      <div className="max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">⏳</div>
        <p className="text-gray-600">Loading batch…</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Batch header */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <p className="text-xs text-gray-500 uppercase tracking-wide">Record a checkpoint for</p>
        <h2 className="text-2xl font-bold text-gray-800">{batch.productName || batch.cropType}</h2>
        <p className="text-gray-600">from <strong>{batch.farmer?.name}</strong></p>
        <p className="font-mono text-xs text-gray-400 mt-1 break-all">{batchId}</p>
      </div>

      {/* Emergency pause (set by the contract owner) */}
      {config.paused && (
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
          <p className="text-yellow-800 font-semibold">⏸️ Checkpoint recording is paused right now. Please try again later.</p>
        </div>
      )}

      {/* Wallet */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-3">1. Connect wallet</h3>

        {!hasWallet ? (
          <div className="space-y-3">
            <p className="text-gray-600 text-sm">
              No wallet found in this browser. On a phone, open this page in the MetaMask app:
            </p>
            <a
              href={metamaskLink}
              className="block text-center bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 transition"
            >
              🦊 Open in MetaMask
            </a>
          </div>
        ) : !account ? (
          <button
            onClick={connectWallet}
            className="w-full bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 transition"
          >
            🦊 Connect MetaMask
          </button>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Connected: <span className="font-mono">{shortAddr(account)}</span>
            </p>
            {handler === null ? (
              <p className="text-sm text-gray-500">Checking permissions…</p>
            ) : handler.authorized ? (
              <p className="text-sm text-green-700 font-semibold">
                ✅ Authorised as {handler.name || (handler.role === 'farmer' ? 'farmer' : 'handler')}
              </p>
            ) : (
              <p className="text-sm text-red-600 font-semibold">
                ⛔ This wallet isn't authorised to record checkpoints. Switch to a stage wallet in MetaMask.
              </p>
            )}
          </div>
        )}

        {walletErr && <p className="text-sm text-red-600 mt-2">⚠️ {walletErr}</p>}
      </div>

      {/* Checkpoint form */}
      <div className="bg-white rounded-lg shadow-lg p-6 space-y-4">
        <h3 className="text-lg font-bold text-gray-800">2. Checkpoint details</h3>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Stage</label>
          {allowedStages.length > 1 ? (
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              disabled={busy}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white"
            >
              {allowedStages.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <p className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-800 font-semibold">
              {allowedStages[0] || stage || '—'}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">Set by this wallet's permissions on the contract.</p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Bristol Depot"
            maxLength={100}
            disabled={busy}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Destination <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Earth To Mouth Cafe"
            maxLength={100}
            disabled={busy}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />
          <p className="text-xs text-gray-400 mt-1">
            Which restaurant's share is this step for? Leave blank if it's for the whole batch.
          </p>
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Notes <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Received chilled, 350 kg"
            rows={2}
            maxLength={280}
            disabled={busy}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg"
          />
        </div>

        {recordErr && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-3">
            <p className="text-red-600 text-sm font-semibold">⚠️ {recordErr}</p>
          </div>
        )}

        {status === 'done' && txHash && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-3">
            <p className="text-green-700 font-semibold">✅ Checkpoint recorded on-chain!</p>
            <a
              href={`${config.explorer}/tx/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline"
            >
              View on Basescan ↗
            </a>
          </div>
        )}

        <button
          onClick={recordCheckpoint}
          disabled={!account || !handler?.authorized || busy || config.paused}
          className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-green-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {status === 'signing' ? '🦊 Confirm in MetaMask…'
           : status === 'mining' ? '⛓️ Recording on-chain…'
           : status === 'saving' ? '💾 Saving…'
           : '📍 Record checkpoint'}
        </button>
      </div>

      {/* Journey so far */}
      <JourneyTimeline
        batchId={batchId}
        refreshKey={refreshKey}
        registeredAt={batch.harvestDate}
        creationTxHash={batch.creationTxHash}
        farmName={batch.farmer?.name}
        farmLocation={batch.farmer?.location}
      />

      {/* Sticker links (for programming NFC tags) — only shown to authorised wallets */}
      {handler?.authorized && (
      <details className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm">
        <summary className="font-semibold text-gray-700 cursor-pointer">🏷️ NFC sticker links for this page</summary>
        <p className="text-gray-500 mt-2">Write one of these to the sticker with an NFC app (e.g. NFC Tools):</p>
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

export default CheckpointPage;