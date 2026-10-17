import { useState, useEffect } from 'react';
import axios from 'axios';
import {
  API_BASE, hasWallet, shortAddr, connectMetaMask, metaMaskSign, walletSignIn,
  supplyChainWithSigner, sendAndConfirm, walletError, syncTransaction,
} from './walletHelpers';

/**
 * AdminPage — /admin
 * Sign in with the OWNER wallet (MetaMask). Approve restaurants and farms,
 * add depots/drivers (handlers), and use the pause switch.
 * Approvals go through the backend; handler/pause changes are signed by your wallet.
 */
function AdminPage({ onBack }) {
  const [account, setAccount] = useState(null);
  const [token,   setToken]   = useState(null);
  const [data,    setData]    = useState(null);
  const [config,  setConfig]  = useState(null);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(null);    // id of the row being worked on
  const [message, setMessage] = useState(null);

  // Handler form
  const [hAddress, setHAddress] = useState('');
  const [hName,    setHName]    = useState('');
  const [hStages,  setHStages]  = useState('Warehouse');
  const [syncHash, setSyncHash] = useState('');

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  const load = async () => {
    try {
      const [o, c] = await Promise.all([
        axios.get(`${API_BASE}/admin/overview`, auth),
        axios.get(`${API_BASE}/chain/config`),
      ]);
      setData(o.data);
      setConfig(c.data);
    } catch (err) {
      setError(walletError(err));
    }
  };
  useEffect(() => { if (token) load(); }, [token]);

  const signIn = async () => {
    setError(null);
    try {
      const address = await connectMetaMask();
      setAccount(address);
      const res = await walletSignIn(address, (m) => metaMaskSign(address, m), '/admin/auth');
      setToken(res.token);
    } catch (err) {
      setError(walletError(err));
    }
  };

  // Backend call (approve / reject)
  const post = async (id, path) => {
    setBusy(id); setError(null); setMessage(null);
    try {
      await axios.post(`${API_BASE}${path}`, {}, auth);
      await load();
    } catch (err) {
      setError(walletError(err));
    } finally {
      setBusy(null);
    }
  };

  // Owner wallet call (MetaMask)
  const ownerTx = async (id, method, args, okMessage) => {
    setBusy(id); setError(null); setMessage(null);
    try {
      const contract = await supplyChainWithSigner(config.contractAddress);
      const result = await sendAndConfirm(contract, method, args);
      setMessage(result.synced ? okMessage : `${okMessage} (on-chain; the app copy will catch up — use Re-sync below if not)`);
      await load();
      return true;
    } catch (err) {
      setError(walletError(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const addHandler = (e) => {
    e.preventDefault();
    const stages = hStages.split(',').map(s => s.trim()).filter(Boolean);
    ownerTx('handler', 'authorizeHandler', [hAddress.trim(), hName.trim(), stages], `${hName} can now record: ${stages.join(', ') || 'receive & forward only'}`)
      .then((ok) => { if (ok) { setHAddress(''); setHName(''); } });
  };

  const Btn = ({ onClick, children, kind = 'green', id }) => (
    <button onClick={onClick} disabled={busy !== null}
      className={`text-xs font-semibold px-3 py-1.5 rounded-lg disabled:bg-gray-300 ${
        kind === 'green' ? 'bg-green-600 text-white hover:bg-green-700' : 'border border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
      {busy === id ? '…' : children}
    </button>
  );

  const StatusPill = ({ status }) => (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
      status === 'approved' ? 'bg-green-100 text-green-700' : status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-800'}`}>
      {status}
    </span>
  );

  if (!token) {
    return (
      <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8 text-center space-y-4">
        <div className="text-5xl">🛡️</div>
        <h2 className="text-2xl font-bold text-gray-800">Admin</h2>
        <p className="text-gray-600 text-sm">Sign in with the owner wallet. Signing is free and doesn't send a transaction.</p>
        {hasWallet() ? (
          <button onClick={signIn} className="w-full bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600">🦊 Sign in with MetaMask</button>
        ) : (
          <p className="text-sm text-red-600">MetaMask is needed for the admin page.</p>
        )}
        {error && <p className="text-sm text-red-600">⚠️ {error}</p>}
        <button onClick={onBack} className="text-gray-600 hover:underline text-sm">← Back</button>
      </div>
    );
  }

  if (!data) return <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8 text-center">⏳ Loading…{error && <p className="text-red-600 mt-2">⚠️ {error}</p>}</div>;

  const pendingRestaurants = data.restaurants.filter(r => r.status !== 'approved' && r.status !== 'rejected');
  const pendingFarmers = data.farmers.filter(f => f.status === 'pending');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-6 flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🛡️ Admin</h2>
          <p className="text-sm text-gray-500">Signed in as {shortAddr(account)}</p>
        </div>
        {config && (
          config.paused ? (
            <Btn id="pause" onClick={() => ownerTx('pause', 'unpause', [], 'Recording resumed')}>▶️ Resume recording</Btn>
          ) : (
            <Btn id="pause" kind="grey" onClick={() => window.confirm('Pause ALL supply-chain recording?') && ownerTx('pause', 'pause', [], 'Recording paused')}>⏸️ Emergency pause</Btn>
          )
        )}
      </div>

      {error && <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-red-700 text-sm font-semibold">⚠️ {error}</div>}
      {message && <div className="bg-green-50 border border-green-300 rounded-lg p-3 text-green-700 text-sm font-semibold">✅ {message}</div>}

      {/* Registrar setup */}
      {!data.backendIsRegistrar && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-5">
          <p className="font-bold text-yellow-800">One-time setup: let the backend register approved restaurants</p>
          <p className="text-sm text-yellow-700 mt-1">This gives the backend wallet ({shortAddr(data.backendWallet)}) the registrar role. It can only create restaurant identities.</p>
          <div className="mt-3">
            <Btn id="registrar" onClick={() => ownerTx('registrar', 'setRegistrar', [data.backendWallet, true], 'Backend is now a registrar')}>Make backend a registrar</Btn>
          </div>
        </div>
      )}

      {/* Restaurants */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🍽️ Restaurants {pendingRestaurants.length > 0 && <span className="text-sm text-yellow-700">({pendingRestaurants.length} waiting)</span>}</h3>
        <p className="text-xs text-gray-500 mb-4">Check the business reference (council food registration / Companies House) before approving.</p>
        <div className="divide-y divide-gray-100">
          {data.restaurants.map(r => (
            <div key={r.id} className="py-3 flex justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{r.name} <StatusPill status={r.status} /></p>
                <p className="text-xs text-gray-500">{r.email} · {r.postcode || 'no postcode'} · {r.emailVerified ? 'email verified' : '⚠️ email not verified'}</p>
                <p className="text-xs text-gray-500">Reference: {r.businessReference || '—'}</p>
                {r.walletAddress && <p className="font-mono text-xs text-gray-400">{r.walletAddress}</p>}
              </div>
              <div className="flex gap-2 items-start">
                {r.status !== 'approved' && <Btn id={`r${r.id}`} onClick={() => post(`r${r.id}`, `/admin/restaurants/${r.id}/approve`)}>Approve</Btn>}
                {r.status !== 'rejected' && <Btn id={`rx${r.id}`} kind="grey" onClick={() => window.confirm(`Reject ${r.name}?`) && post(`rx${r.id}`, `/admin/restaurants/${r.id}/reject`)}>{r.status === 'approved' ? 'Revoke' : 'Reject'}</Btn>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Farms */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">👨‍🌾 Farms {pendingFarmers.length > 0 && <span className="text-sm text-yellow-700">({pendingFarmers.length} waiting)</span>}</h3>
        <p className="text-xs text-gray-500 mb-4">Approving registers the farm on the blockchain (the backend pays the gas). Check the CPH number first.</p>
        <div className="divide-y divide-gray-100">
          {data.farmers.map(f => (
            <div key={f.address} className="py-3 flex justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{f.farmName || '(registered before approvals)'} <StatusPill status={f.status} /></p>
                <p className="text-xs text-gray-500">{f.farmerName || ''} {f.location ? `· ${f.location}` : ''} · {f.email} · {f.emailVerified ? 'email verified' : '⚠️ email not verified'}</p>
                <p className="text-xs text-gray-500">CPH: {f.cphNumber || '—'}</p>
                <p className="font-mono text-xs text-gray-400">{f.address}</p>
              </div>
              {f.status === 'pending' && (
                <div className="flex gap-2 items-start">
                  <Btn id={`f${f.address}`} onClick={() => post(`f${f.address}`, `/admin/farmers/${f.address}/approve`)}>Approve</Btn>
                  <Btn id={`fx${f.address}`} kind="grey" onClick={() => window.confirm('Reject this farm?') && post(`fx${f.address}`, `/admin/farmers/${f.address}/reject`)}>Reject</Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Handlers */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📦 Depots, drivers & other handlers</h3>
        <div className="divide-y divide-gray-100 mb-5">
          {data.participants.filter(p => p.role === 'handler').map(p => (
            <div key={p.address} className="py-3 flex justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800">{p.name} {!p.active && <span className="text-xs text-red-600">(revoked)</span>}</p>
                <p className="text-xs text-gray-500">Steps: {(p.stages || []).join(', ') || 'receive & forward only'}</p>
                <p className="font-mono text-xs text-gray-400">{p.address}</p>
              </div>
              {p.active && (
                <Btn id={`h${p.address}`} kind="grey" onClick={() => window.confirm(`Revoke ${p.name}?`) && ownerTx(`h${p.address}`, 'revokeParticipant', [p.address], `${p.name} revoked`)}>Revoke</Btn>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={addHandler} className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
          <p className="text-sm font-semibold text-gray-700">Add or update a handler (signed by your wallet)</p>
          <input value={hAddress} onChange={(e) => setHAddress(e.target.value)} required placeholder="Wallet address 0x…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          <input value={hName} onChange={(e) => setHName(e.target.value)} required maxLength={100} placeholder="Name, e.g. Bristol Depot"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <input value={hStages} onChange={(e) => setHStages(e.target.value)} placeholder="Steps, comma-separated, e.g. Warehouse, Transport"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          <p className="text-xs text-gray-500">Updating an existing handler replaces its name and steps. "Dispatched", "Delivered", "Sold" and "Cancelled" are reserved.</p>
          <button type="submit" disabled={busy !== null}
            className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
            {busy === 'handler' ? '⛓️ Recording…' : 'Save handler'}
          </button>
        </form>
      </div>

      {/* Re-sync: copy a transaction's results from the chain into the app (if a page didn't update) */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🔄 Re-sync a transaction</h3>
        <p className="text-xs text-gray-500 mb-3">
          If something was recorded on-chain but a page didn't update, paste its transaction hash (from MetaMask → Activity → View on block explorer).
        </p>
        <div className="flex gap-2 flex-wrap">
          <input value={syncHash} onChange={(e) => setSyncHash(e.target.value.trim())} placeholder="0x…"
            className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono" />
          <button
            disabled={busy !== null || !/^0x[0-9a-fA-F]{64}$/.test(syncHash)}
            onClick={async () => {
              setBusy('sync'); setError(null); setMessage(null);
              const ok = await syncTransaction(syncHash);
              if (ok) { setMessage('Transaction re-synced'); setSyncHash(''); await load(); }
              else setError('Could not re-sync that transaction — check the hash is a supply-chain transaction.');
              setBusy(null);
            }}
            className="bg-gray-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-800 disabled:bg-gray-300">
            {busy === 'sync' ? 'Syncing…' : 'Re-sync'}
          </button>
        </div>
      </div>

      <div className="text-center">
        <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
      </div>
    </div>
  );
}

export default AdminPage;