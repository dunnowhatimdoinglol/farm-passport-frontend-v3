import { useState, useEffect } from 'react';
import axios from 'axios';
import CreateBatchForm from './CreateBatchForm';
import { QRCodeSVG } from 'qrcode.react';
import { FarmerOrders, DispatchForm, FarmerShipments, FarmerComingIn, FarmerHeldStock, WriteOffLog, FarmerMeatList } from './FarmerSupply';
import { formatQty, batchLink, API_BASE } from './walletHelpers';
import NfcShare from './NfcShare';
import { ChainHelp } from './ChainProof';

// farmerToken = sign-in token from FarmerPortal (the private key is never sent to the server)
function FarmerDashboard({ farmerToken, farmerAddress, season, setSeason, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [farmerData, setFarmerData] = useState(null);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dispatchBatchId, setDispatchBatchId] = useState(null);   // which batch's "Send" form is open
  const [pickedAnimals, setPickedAnimals] = useState({});          // livestock batches ticked to go to an abattoir together
  const [sendMany, setSendMany] = useState(false);
  const [priceEdit, setPriceEdit] = useState({});   // batchId → price being typed (only while editing)
  const [priceSaving, setPriceSaving] = useState(null);
  const [priceError, setPriceError] = useState({});
  const authHeader = { headers: { Authorization: `Bearer ${farmerToken}` } };

  // Bio editing state
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState('');

  // Email verification resend state
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [resendError, setResendError] = useState('');

  // Which batch is being recalled (hooks must all sit up here, before any early "return")
  const [recallBusy, setRecallBusy] = useState(null);

  // v4.2 — one section at a time: a "Today" to-do page, then tabs. The open tab is remembered for this browser tab.
  const [tab, setTabState] = useState(() => {
    try { const t = sessionStorage.getItem('fp_farm_tab') || 'today'; return t === 'batches' ? 'stock' : t; } catch { return 'today'; }
  });
  // Stock tab filter (v4.3): all · produce · animals · boxed meat
  const [stockFilter, setStockFilter] = useState('all');
  const setTab = (t, filter) => {
    if (filter) setStockFilter(filter);
    setTabState(t);
    try { sessionStorage.setItem('fp_farm_tab', t); } catch { /* private window */ }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  // What needs doing: orders, deliveries sent, deliveries coming in (for "Today" and the tab counts)
  const [todo, setTodo] = useState(null);
  const fetchTodo = async () => {
    const get = (path) => axios.get(`${API_BASE}${path}`, authHeader).then(r => r.data).catch(() => ({}));
    const [o, s, i] = await Promise.all([get('/farmer/orders'), get('/farmer/shipments'), get('/farmer/inbound')]);
    setTodo({ orders: o.orders || [], shipments: s.shipments || [], inbound: i.shipments || [] });
  };

  useEffect(() => {
    fetchDashboardData();
  }, [refreshTrigger]);
  useEffect(() => { fetchTodo(); }, [refreshTrigger, tab]);

  const fetchDashboardData = async () => {
    try {
      if (!farmerData) setLoading(true);     // only the first load shows the full-page spinner
      setError(null);

      const response = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/dashboard', {}, authHeader);

      setFarmerData(response.data);

      // Fetch farmer profile (bio) if we have the address
      if (response.data.farmer?.address) {
        try {
          const profileRes = await axios.get(
            `https://farm-passport-backend-v3.onrender.com/api/farmer/profile/${response.data.farmer.address}`
          );
          setBioText(profileRes.data.profile?.bio || '');
        } catch (err) {
          console.log('No profile yet:', err.message);
          setBioText('');
        }
      }
    } catch (err) {
      console.error('Dashboard error:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCreated = () => {
    setShowCreateBatch(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSaveBio = async () => {
    if (!farmerData?.farmer?.address) return;

    try {
      setBioSaving(true);
      setBioError('');

      await axios.put(
        `https://farm-passport-backend-v3.onrender.com/api/farmer/profile/${farmerData.farmer.address}`,
        { bio: bioText.trim() },
        authHeader
      );

      setEditingBio(false);
    } catch (err) {
      console.error('Error saving bio:', err);
      setBioError(err.response?.data?.error || 'Failed to save bio');
    } finally {
      setBioSaving(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setResendingEmail(true);
      setResendError('');
      setResendSuccess('');

      const res = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/resend-verification', {
        farmerAddress
      });

      setResendSuccess(res.data.message);
      console.log('✅ Verification email resent');

    } catch (err) {
      console.error('Error resending verification:', err);
      setResendError(err.response?.data?.error || 'Failed to resend email');
    } finally {
      setResendingEmail(false);
    }
  };

  const downloadQRCode = (batchId, productName) => {
    const svg = document.getElementById(`qr-download-${batchId}`);
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 512;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const link = document.createElement('a');
      link.download = `${batchId}-${productName.replace(/\s+/g, '-')}-QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading && !farmerData) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">👨‍🌾</div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-100 border border-red-400 rounded-lg p-6">
          <h3 className="font-bold text-red-700 mb-2">Error Loading Dashboard</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onLogout}
            className="text-blue-600 hover:underline"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!farmerData || !farmerData.farmer) {
    return null;
  }

  const { farmer, batches } = farmerData;
  const approved = farmer.approvalStatus === 'approved';
  const refreshAll = () => setRefreshTrigger(prev => prev + 1);
  // Stock tab filter: produce = everything that isn't livestock; animals = livestock
  const shownBatches = batches.filter(b => stockFilter === 'all'
    || (stockFilter === 'animals' ? b.productType === 'Livestock' : stockFilter === 'produce' ? b.productType !== 'Livestock' : false));

  // Recall a batch (food safety): no more dispatches or sales; cafés holding it are warned
  const recallBatch = async (batchId, productName) => {
    const reason = window.prompt(
      `Recall ${productName} (${batchId})?\n\nThis is recorded on the blockchain. It stops any more dispatches and sales from this batch, ` +
      `and every café holding it is warned.\n\nReason (shown to cafés and customers):`
    );
    if (reason === null) return;
    if (!reason.trim()) { window.alert('Please give a reason for the recall.'); return; }
    setRecallBusy(batchId);
    try {
      const res = await axios.post(
        `https://farm-passport-backend-v3.onrender.com/api/farmer/batches/${encodeURIComponent(batchId)}/recall`,
        { reason: reason.trim() },
        { headers: { Authorization: `Bearer ${farmerToken}` } }
      );
      const holders = res.data.holders || [];
      const also = res.data.alsoRecalled ? `\n\n${res.data.alsoRecalled} batch${res.data.alsoRecalled === 1 ? '' : 'es'} made from it (carcasses, cuts…) were recalled too.` : '';
      window.alert((holders.length
        ? `Recalled. These businesses are holding stock from this batch and have been warned in the app:\n\n• ${holders.join('\n• ')}\n\nPlease contact them directly too.`
        : 'Recalled. Nobody is holding stock from this batch right now.') + also);
      refreshAll();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Could not recall the batch');
    } finally {
      setRecallBusy(null);
    }
  };

  // Short-date deal: a reduced price cafés see in "Short-date deals" (null = end the deal)
  const setDeal = async (batch) => {
    let price = null;
    if (batch.dealPrice === null || batch.dealPrice === undefined) {
      const normal = batch.pricePerUnit;
      const suggested = normal != null ? (Math.round(normal * 0.7 * 100) / 100).toFixed(2) : '';
      const raw = window.prompt(
        `Reduced price per ${batch.unit} for ${batch.productName}${normal != null ? ` (normally £${Number(normal).toFixed(2)})` : ''}?\n\nCafés will see it under "Short-date deals".`, suggested);
      if (raw === null || raw.trim() === '') return;
      price = Number(raw);
      if (isNaN(price) || price < 0) { window.alert('Enter a price of 0 or more'); return; }
    } else if (!window.confirm(`End the deal on ${batch.productName}? It goes back to the normal price.`)) return;
    try {
      await axios.put(`https://farm-passport-backend-v3.onrender.com/api/farmer/batches/${encodeURIComponent(batch.batchId)}/deal`,
        { dealPrice: price }, { headers: { Authorization: `Bearer ${farmerToken}` } });
      refreshAll();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Could not save the deal');
    }
  };

  // Save (or clear) the default price per unit for a batch — only the farm & restaurants see it
  const saveBatchPrice = async (batchId) => {
    const raw = priceEdit[batchId];
    const value = raw === '' || raw === undefined ? null : Number(raw);
    if (value !== null && (isNaN(value) || value < 0)) {
      setPriceError({ ...priceError, [batchId]: 'Enter a price of 0 or more' });
      return;
    }
    setPriceSaving(batchId);
    setPriceError({ ...priceError, [batchId]: null });
    try {
      await axios.put(
        `https://farm-passport-backend-v3.onrender.com/api/farmer/batches/${encodeURIComponent(batchId)}/price`,
        { pricePerUnit: value },
        { headers: { Authorization: `Bearer ${farmerToken}` } }
      );
      const next = { ...priceEdit }; delete next[batchId]; setPriceEdit(next);
      refreshAll();
    } catch (err) {
      setPriceError({ ...priceError, [batchId]: err.response?.data?.error || 'Could not save price' });
    } finally {
      setPriceSaving(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      
      {/* Email Verification Warning */}
      {!farmer.emailVerified && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-bold text-yellow-800 mb-2">
                Email Verification Required
              </h3>
              <p className="text-sm text-yellow-700 mb-3">
                Please verify your email to create batches. Check your inbox for the verification link.
              </p>
              
              {resendSuccess && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-3 py-2 rounded mb-3 text-sm">
                  ✅ {resendSuccess}
                </div>
              )}
              
              {resendError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm">
                  ❌ {resendError}
                </div>
              )}
              
              <button
                onClick={handleResendVerification}
                disabled={resendingEmail}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition font-semibold disabled:bg-gray-400 text-sm"
              >
                {resendingEmail ? 'Sending...' : '📧 Resend Verification Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting for approval */}
      {!approved && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-blue-800 mb-1">⏳ Your farm is waiting for approval</h3>
          <p className="text-sm text-blue-700">
            We check every new farm before it goes on the blockchain. Once approved you'll be able to create batches
            and accept orders. {!farmer.emailVerified && 'Please verify your email in the meantime.'}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Farmer Dashboard</h1>
          <p className="text-gray-600">Welcome back, {farmer.farmName}!</p>
        </div>
        <button
          onClick={onLogout}
          className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition"
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <DashboardTabs tab={tab} setTab={setTab} approved={approved} counts={tabCounts(todo)} />

      {(tab === 'today' || (tab === 'meat' && !approved)) && (
        <TodayPanel todo={todo} batches={batches} approved={approved} farmName={farmer.farmName} go={setTab}
          onCreate={() => { setTab('stock', 'all'); setShowCreateBatch(true); }} />
      )}

      {tab === 'farm' && (<>
      {/* Farm Overview Card */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">🏡</span>
              <div>
                <h2 className="text-2xl font-bold">{farmer.farmName}</h2>
                <p className="text-green-100">📍 {farmer.location}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-green-500">
          <p className="text-xs text-green-100 mb-1">Wallet Address:</p>
          <p className="font-mono text-sm break-all">{farmer.address}</p>
        </div>
      </div>

      {/* Farm Bio Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">📝 Farm Bio</h3>
          {!editingBio && (
            <button
              onClick={() => setEditingBio(true)}
              className="text-blue-600 hover:underline text-sm font-semibold"
            >
              ✏️ Edit
            </button>
          )}
        </div>

        {editingBio ? (
          <div>
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              placeholder="Tell customers about your farm, your animals, and your farming practices..."
              rows="6"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
              maxLength="500"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{bioText.length}/500 characters</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingBio(false);
                    setBioError('');
                    // Reset to original
                    fetchDashboardData();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                  disabled={bioSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBio}
                  disabled={bioSaving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400"
                >
                  {bioSaving ? 'Saving...' : 'Save Bio'}
                </button>
              </div>
            </div>
            {bioError && (
              <p className="text-red-600 text-sm mt-2">⚠️ {bioError}</p>
            )}
          </div>
        ) : (
          <div>
            {bioText ? (
              <p className="text-gray-700 whitespace-pre-wrap">{bioText}</p>
            ) : (
              <p className="text-gray-400 italic">
                No bio yet. Click "Edit" to tell customers about your farm!
              </p>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            💡 This bio will appear on the farm story page when customers scan your product QR codes.
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">📦</div>
            <div>
              <p className="text-gray-500 text-sm">Total Batches</p>
              <p className="text-3xl font-bold text-gray-800">{batches.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎖️</div>
            <div>
              <p className="text-gray-500 text-sm">Badges Unlocked</p>
              <p className="text-3xl font-bold text-gray-800">
                {batches.reduce((sum, batch) => sum + (batch.unlocks || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* How to check records on the blockchain */}
      <ChainHelp who="farm" className="mb-6" />
      </>)}

      {/* Orders from restaurants */}
      {tab === 'orders' && <FarmerOrders farmerToken={farmerToken} approved={approved} refreshKey={refreshTrigger} onChanged={refreshAll} />}

      {/* Meat prices (what cafés can order) + cutting list (what they've pre-ordered) */}
      {tab === 'meat' && approved && <FarmerMeatList farmerToken={farmerToken} refreshKey={refreshTrigger} />}

      {tab === 'deliveries' && (<>
        {/* Coming in to the farm: boxed meat from the abattoir, returns, refused goods coming back — confirm, then they leave the list */}
        <FarmerComingIn farmerToken={farmerToken} refreshKey={refreshTrigger} onChanged={refreshAll} />
        {/* Shipments sent */}
        <FarmerShipments farmerToken={farmerToken} refreshKey={refreshTrigger} onChanged={refreshAll} />
        {todo && !todo.shipments.length && (
          <div className="bg-white rounded-lg shadow-lg p-6 text-sm text-gray-500">Nothing sent yet. Send a batch from the <button onClick={() => setTab('stock')} className="text-green-700 font-semibold hover:underline">Stock</button> tab, or dispatch an order.</div>
        )}
      </>)}

      {tab === 'stock' && (() => {
        // v4.3: one Stock tab with filters — your batches (produce, animals) and boxed meat / returns held from deliveries
        const held = (todo?.inbound || []).filter(x => x.status === 'delivered' && x.available > 0);
        const counts = {
          all: batches.length + held.length,
          produce: batches.filter(b => b.productType !== 'Livestock').length + held.filter(x => x.productType !== 'Meat').length,
          animals: batches.filter(b => b.productType === 'Livestock').length,
          meat: held.filter(x => x.productType === 'Meat').length,
        };
        return (
          <div className="flex gap-2 mb-4 flex-wrap">
            {[['all', 'All'], ['produce', '🥕 Produce'], ['animals', '🐄 Animals'], ['meat', '🥩 Boxed meat']].map(([k, label]) => (
              <button key={k} onClick={() => setStockFilter(k)}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${stockFilter === k ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                {label} <span className={stockFilter === k ? 'text-gray-300' : 'text-gray-400'}>{counts[k]}</span>
              </button>
            ))}
          </div>
        );
      })()}

      {tab === 'stock' && stockFilter === 'meat' && (<>
        <FarmerHeldStock farmerToken={farmerToken} refreshKey={refreshTrigger} onChanged={refreshAll} filter="meat" />
        {!(todo?.inbound || []).some(x => x.status === 'delivered' && x.available > 0 && x.productType === 'Meat') && (
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6 text-sm text-gray-500">
            No boxed meat at the farm. When the abattoir sends cuts back to you (private kill), confirm them under <button onClick={() => setTab('deliveries')} className="text-green-700 font-semibold hover:underline">Deliveries → Coming in</button> and they'll show here.
          </div>
        )}
        <WriteOffLog farmerToken={farmerToken} refreshKey={refreshTrigger} />
      </>)}

      {tab === 'stock' && stockFilter !== 'meat' && (<>
      {/* Create Batch Button / Form */}
      {!showCreateBatch ? (
        <button
          onClick={() => setShowCreateBatch(true)}
          disabled={!approved}
          className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition mb-6 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {approved ? '➕ Create New Batch' : '🔒 Create batches once approved'}
        </button>
      ) : (
        <div className="mb-6">
          <CreateBatchForm
            farmerToken={farmerToken}
            season={season}
            setSeason={setSeason}
            onSuccess={handleBatchCreated}
            onCancel={() => setShowCreateBatch(false)}
            onSendToAbattoir={(ids) => { setPickedAnimals(Object.fromEntries(ids.map(id => [id, true]))); setSendMany(true); setDispatchBatchId(null); }}
          />
        </div>
      )}

      {/* Batches List */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          {stockFilter === 'animals' ? 'Your animals' : stockFilter === 'produce' ? 'Your produce' : 'Your batches'} ({shownBatches.length})
        </h3>

        {/* Send several animals to an abattoir in one load */}
        {(() => {
          const sendable = batches.filter(b => b.productType === 'Livestock' && !b.recalled && Number(b.quantityRemaining ?? b.quantity) > 0);
          if (!approved || sendable.length < 2 || stockFilter === 'produce') return null;
          const picked = sendable.filter(b => pickedAnimals[b.batchId]);
          return (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              {!sendMany ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm text-amber-900 flex-1 min-w-[12rem]">
                    🐄 {picked.length ? <><strong>{picked.length}</strong> animal batch{picked.length === 1 ? '' : 'es'} ticked</> : 'Tick animals below to send several to an abattoir in one load'}
                  </p>
                  <button onClick={() => setPickedAnimals(picked.length === sendable.length ? {} : Object.fromEntries(sendable.map(b => [b.batchId, true])))}
                    className="text-xs text-amber-900 underline">{picked.length === sendable.length ? 'Untick all' : `Tick all ${sendable.length}`}</button>
                  <button disabled={!picked.length} onClick={() => { setSendMany(true); setDispatchBatchId(null); }}
                    className="bg-red-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-red-800 disabled:bg-gray-400">
                    Send {picked.length || ''} to an abattoir
                  </button>
                </div>
              ) : picked.length > 0 ? (
                <DispatchForm
                  farmerToken={farmerToken}
                  batch={picked[0]}
                  batches={batches}
                  preselected={picked.map(b => b.batchId)}
                  onCancel={() => setSendMany(false)}
                  onDone={() => { setSendMany(false); setPickedAnimals({}); refreshAll(); }}
                />
              ) : <p className="text-sm text-amber-900">⏳ Loading the new animals…</p>}
            </div>
          );
        })()}

        {shownBatches.length === 0 && batches.length > 0 ? (
          <p className="text-sm text-gray-500">{stockFilter === 'animals' ? 'No animals registered. Create a batch → Livestock to add some.' : 'No produce batches yet.'}</p>
        ) : batches.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📦</div>
            <h4 className="text-xl font-semibold text-gray-700 mb-2">
              No Batches Yet
            </h4>
            <p className="text-gray-600 mb-6">
              Create your first batch to start tracking your products!
            </p>
            <button
              onClick={() => setShowCreateBatch(true)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Create First Batch
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {shownBatches.map((batch, index) => {
              const batchId = String(batch.batchId || 'Unknown');
              const productType = String(batch.productType || 'Unknown');
              const productName = String(batch.productName || 'Unknown');
              const quantity = String(batch.quantity || '0');
              const unit = String(batch.unit || '');
              const timestamp = batch.timestamp || new Date().toISOString();
              const txHash = String(batch.transactionHash || '');
              
              const getEmoji = (type) => {
                const typeStr = String(type).toLowerCase();
                if (typeStr.includes('vegetable')) return '🥬';
                if (typeStr.includes('fruit')) return '🍎';
                if (typeStr.includes('meat')) return '🥩';
                if (typeStr.includes('dairy')) return '🥛';
                if (typeStr.includes('grain')) return '🌾';
                if (typeStr.includes('livestock')) return batch.species === 'Sheep' ? '🐑' : batch.species === 'Pig' ? '🐖' : batch.species === 'Goat' ? '🐐' : '🐄';
                return '📦';
              };
              
              return (
                <div
                  key={index}
                  className={`border rounded-lg p-4 hover:shadow-md transition ${pickedAnimals[batchId] ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {approved && productType === 'Livestock' && !batch.recalled && Number(batch.quantityRemaining ?? batch.quantity) > 0 && (
                          <input type="checkbox" checked={!!pickedAnimals[batchId]} onChange={(e) => setPickedAnimals({ ...pickedAnimals, [batchId]: e.target.checked })}
                            className="h-5 w-5 accent-red-700" aria-label={`Tick ${batch.animalRef || batchId} to send to an abattoir`} />
                        )}
                        <span className="text-2xl">{getEmoji(productType)}</span>
                        <div>
                          <h4 className="font-bold text-gray-800 text-lg">
                            {productName}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {productType} • {quantity} {unit}
                          </p>
                          {batch.animalRef && (
                            <p className="text-xs text-amber-800">
                              {batch.species} · {batch.species === 'Cattle' ? 'ear tag' : 'mark'} <span className="font-mono">{batch.animalRef}</span>
                              {batch.breed ? ` · ${batch.breed}` : ''} · born in {batch.bornIn}{batch.rearedIn && batch.rearedIn !== batch.bornIn ? `, reared in ${batch.rearedIn}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500 mb-1 font-mono">
                        ID: {batchId}
                      </p>
                      
                      {(batch.harvestDate || batch.useBy) && (
                        <p className="text-sm text-gray-600">
                          {batch.harvestDate && <>{productType === 'Livestock' ? 'Born' : batch.processKind || batch.madeBy ? 'Made' : 'Harvested'} {new Date(batch.harvestDate).toLocaleDateString('en-GB')}</>}
                          {batch.useBy && (
                            <span className={new Date(batch.useBy) < new Date() ? 'text-red-600 font-semibold' : ''}>
                              {batch.harvestDate ? ' · ' : ''}Use by {new Date(batch.useBy).toLocaleDateString('en-GB')}
                              {new Date(batch.useBy) < new Date() ? ' (passed)' : ''}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mb-2">
                        Created: {new Date(timestamp).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      
                      {txHash && (
                        <a
                          href={`https://sepolia.basescan.org/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs font-mono"
                        >
                          View on Basescan ↗
                        </a>
                      )}
                    </div>

                    {/* QR Code */}
                    <div className="ml-4">
                      <div className="bg-white p-2 border-2 border-gray-300 rounded-lg">
                        <QRCodeSVG
                          value={batchLink(batchId)}
                          size={100}
                          level="H"
                          includeMargin={true}
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      </div>
                      <p className="text-xs text-center text-gray-500 mt-1">
                        Customer Scan
                      </p>
                    </div>
                  </div>

                  {batch.recalled && (
                    <div className="mt-3 bg-red-50 border border-red-300 rounded-lg p-3">
                      <p className="text-sm font-bold text-red-800">🚨 Recalled{batch.recallReason ? `: ${batch.recallReason}` : ''}</p>
                      <p className="text-xs text-red-700 mt-1">No more dispatches or sales from this batch. If it was a mistake, ask the Farm Passport admin to lift the recall.</p>
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="mt-3 pt-3 border-t flex gap-4 text-sm flex-wrap items-center">
                    <div>
                      <span className="text-gray-500">Badges:</span>
                      <span className="font-semibold text-gray-800 ml-1">
                        {batch.unlocks || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Still at farm:</span>
                      <span className="font-semibold text-gray-800 ml-1">
                        {formatQty(batch.quantityRemaining ?? batch.quantity, unit)}
                      </span>
                    </div>
                    {productType !== 'Livestock' && (<>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Price:</span>
                      {priceEdit[batchId] === undefined ? (
                        <>
                          <span className="font-semibold text-gray-800 ml-1">
                            {batch.pricePerUnit != null ? `£${Number(batch.pricePerUnit).toFixed(2)} per ${unit}` : 'not set'}
                          </span>
                          <button
                            onClick={() => setPriceEdit({ ...priceEdit, [batchId]: batch.pricePerUnit ?? '' })}
                            className="text-green-700 text-xs font-semibold hover:underline ml-1"
                          >
                            ✏️ {batch.pricePerUnit != null ? 'Change' : 'Set price'}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="ml-1">£</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={priceEdit[batchId]}
                            onChange={(e) => setPriceEdit({ ...priceEdit, [batchId]: e.target.value })}
                            placeholder="0.00"
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                            disabled={priceSaving === batchId}
                          />
                          <span className="text-gray-500 text-xs">per {unit}</span>
                          <button
                            onClick={() => saveBatchPrice(batchId)}
                            disabled={priceSaving === batchId}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:bg-gray-400"
                          >
                            {priceSaving === batchId ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { const n = { ...priceEdit }; delete n[batchId]; setPriceEdit(n); }}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {priceError[batchId] && <span className="text-xs text-red-600 ml-1">{priceError[batchId]}</span>}
                    </div>
                    {batch.dealPrice != null ? (
                      <button onClick={() => setDeal(batch)} className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full hover:bg-amber-200">
                        🏷️ Deal £{Number(batch.dealPrice).toFixed(2)} — end
                      </button>
                    ) : batch.useSoon ? (
                      <button onClick={() => setDeal(batch)} className="text-xs font-semibold bg-amber-500 text-white px-2 py-0.5 rounded-full hover:bg-amber-600">
                        ⏰ Use-by soon — make it a deal?
                      </button>
                    ) : Number(batch.quantityRemaining ?? batch.quantity) > 0 && !batch.recalled && (
                      <button onClick={() => setDeal(batch)} className="text-xs text-amber-700 hover:underline">🏷️ deal</button>
                    )}
                    </>)}
                    {approved && !batch.recalled && Number(batch.quantityRemaining ?? batch.quantity) > 0 && dispatchBatchId !== batchId && (
                      <button
                        onClick={() => setDispatchBatchId(batchId)}
                        className="ml-auto text-green-700 font-semibold hover:underline"
                      >
                        {productType === 'Livestock' ? '🐄 Send to an abattoir' : '🚚 Send to a depot / business'}
                      </button>
                    )}
                  </div>

                  {dispatchBatchId === batchId && (
                    <DispatchForm
                      farmerToken={farmerToken}
                      batch={batch}
                      batches={batches}
                      onCancel={() => setDispatchBatchId(null)}
                      onDone={() => { setDispatchBatchId(null); refreshAll(); }}
                    />
                  )}

                  {/* Download QR Button */}
                  <button
                    onClick={() => downloadQRCode(batchId, productName)}
                    className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                  >
                    📥 Download QR Code for Printing
                  </button>
                  <NfcShare url={batchLink(batchId)} compact />
                  {approved && !batch.recalled && (
                    <button
                      onClick={() => recallBatch(batchId, productName)}
                      disabled={recallBusy === batchId}
                      className="mt-3 w-full text-sm font-semibold text-red-700 border border-red-300 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {recallBusy === batchId ? '⛓️ Recording recall…' : '🚨 Recall this batch'}
                    </button>
                  )}
                  
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Print this QR code and attach to product packaging
                  </p>

                  {/* Hidden high-res QR for download */}
                  <div className="hidden">
                    <QRCodeSVG
                      id={`qr-download-${batchId}`}
                      value={batchLink(batchId)}
                      size={512}
                      level="H"
                      includeMargin={true}
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {/* Returned produce held from deliveries (boxed meat too, under "All") */}
      <FarmerHeldStock farmerToken={farmerToken} refreshKey={refreshTrigger} onChanged={refreshAll} filter={stockFilter === 'produce' ? 'produce' : stockFilter === 'animals' ? 'none' : 'all'} />
      <WriteOffLog farmerToken={farmerToken} refreshKey={refreshTrigger} />
      </>)}
    </div>
  );
}

// ─────────────────────────────────────────────
// v4.2 — tabs and the "Today" page
// ─────────────────────────────────────────────

const TABS = [
  ['today', '🏠', 'Today'], ['stock', '📦', 'Stock'], ['orders', '🧾', 'Orders'],
  ['deliveries', '🚚', 'Deliveries'], ['meat', '🏷️', 'Meat prices'], ['farm', '🏡', 'Farm profile'],
];

/** Things waiting for the farm, worked out from its orders and deliveries */
function needs(todo) {
  if (!todo) return null;
  const open = todo.orders.filter(o => o.open ?? ['requested', 'part_sent'].includes(o.status));
  const toSend = open.filter(o => !o.isMeat || o.readyAtFarm > 0);
  return {
    newOrders: toSend.filter(o => o.status === 'requested'),
    partSent: toSend.filter(o => o.status === 'part_sent'),
    meatElsewhere: open.filter(o => o.isMeat && !(o.readyAtFarm > 0)),
    unpaid: todo.orders.filter(o => ['dispatched', 'closed_short'].includes(o.status) && o.shipmentStatus === 'delivered' && o.paymentStatus !== 'paid'),
    comingBack: todo.shipments.filter(s => s.awaitingReturn > 0),
    noFci: todo.shipments.filter(s => s.productType === 'Livestock' && s.fciProvided === false && s.status !== 'cancelled' && !(s.status === 'delivered' && s.quantityReceived === 0)),
    onTheWay: todo.shipments.filter(s => s.status === 'in_transit'),
    comingIn: todo.inbound.filter(s => s.status === 'in_transit'),
  };
}

function tabCounts(todo) {
  const n = needs(todo);
  if (!n) return {};
  return {
    orders: n.newOrders.length + n.partSent.length,
    deliveries: n.comingBack.length + n.noFci.length + n.comingIn.length,
  };
}

function DashboardTabs({ tab, setTab, approved, counts }) {
  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 mb-4 bg-gray-50/95 backdrop-blur">
      <div className="flex gap-1 overflow-x-auto bg-white rounded-lg shadow p-1" role="tablist">
        {TABS.filter(([k]) => k !== 'meat' || approved).map(([k, icon, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`shrink-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-md text-sm font-semibold whitespace-nowrap transition ${tab === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            <span>{icon}</span><span>{label}</span>
            {counts[k] > 0 && (
              <span className={`text-xs rounded-full px-1.5 min-w-[1.25rem] text-center ${tab === k ? 'bg-white text-green-700' : 'bg-amber-400 text-amber-950'}`}>{counts[k]}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function TodayPanel({ todo, batches, approved, farmName, go, onCreate }) {
  const n = needs(todo);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const live = (b) => !b.recalled && Number(b.quantityRemaining ?? b.quantity) > 0;
  const nearUseBy = batches.filter(b => live(b) && b.useSoon && b.dealPrice == null);
  const animals = batches.filter(b => live(b) && b.productType === 'Livestock');
  const plural = (k, one, many) => (k === 1 ? one : many);
  const qtyList = (list) => list.slice(0, 3).map(o => `${formatQty(o.outstanding ?? o.quantity, o.unit)} ${o.productName} for ${o.restaurantName}`).join(' · ') + (list.length > 3 ? ` · +${list.length - 3} more` : '');

  // Most urgent first: things that hold up a café, an abattoir or your stock
  const items = !n ? [] : [
    n.comingBack.length && { tone: 'urgent', icon: '↩️', tab: 'deliveries', action: 'Check them in',
      title: `${n.comingBack.length} refused ${plural(n.comingBack.length, 'delivery is', 'deliveries are')} coming back`,
      sub: `${n.comingBack.map(s => `${formatQty(s.awaitingReturn, s.unit)} ${s.productName} from ${s.toName}`).join(' · ')}. Put it back in stock or write it off.` },
    n.noFci.length && { tone: 'urgent', icon: '📋', tab: 'deliveries', action: 'Send the FCI',
      title: `Food Chain Information missing for ${n.noFci.length} animal ${plural(n.noFci.length, 'delivery', 'deliveries')}`,
      sub: 'The abattoir needs it before slaughter.' },
    n.newOrders.length && { tone: 'todo', icon: '🧾', tab: 'orders', action: 'Send orders',
      title: `${n.newOrders.length} new ${plural(n.newOrders.length, 'order', 'orders')} to send`, sub: qtyList(n.newOrders) },
    n.partSent.length && { tone: 'todo', icon: '🟡', tab: 'orders', action: 'See orders',
      title: `${n.partSent.length} part-sent ${plural(n.partSent.length, 'order has', 'orders have')} more to send`,
      sub: `${qtyList(n.partSent)}. Send the rest, or close it with a message.` },
    n.comingIn.length && { tone: 'todo', icon: '📥', tab: 'deliveries', action: 'Confirm',
      title: `${n.comingIn.length} ${plural(n.comingIn.length, 'delivery', 'deliveries')} coming in to you`,
      sub: n.comingIn.map(s => `${formatQty(s.quantitySent, s.unit)} ${s.productName} from ${s.fromName}`).join(' · ') },
    nearUseBy.length && { tone: 'todo', icon: '⏰', tab: 'stock', action: 'See stock',
      title: `${nearUseBy.length} ${plural(nearUseBy.length, 'batch is', 'batches are')} close to the use-by date`,
      sub: `${nearUseBy.slice(0, 3).map(b => b.productName).join(', ')}. Make it a deal so cafés snap it up?` },
    n.unpaid.length && { tone: 'info', icon: '💷', tab: 'orders', action: 'See orders',
      title: `${n.unpaid.length} delivered ${plural(n.unpaid.length, 'order isn’t', 'orders aren’t')} marked paid yet`,
      sub: 'Tick "Paid" on the order once the café has paid.' },
    n.meatElsewhere.length && { tone: 'info', icon: '🔪', tab: 'orders', action: 'See orders',
      title: `${n.meatElsewhere.length} meat ${plural(n.meatElsewhere.length, 'order is', 'orders are')} with the abattoir or on your cutting list`,
      sub: 'Nothing for you to do unless you have the cuts at the farm.' },
    n.onTheWay.length && { tone: 'info', icon: '🚚', tab: 'deliveries', action: 'See deliveries',
      title: `${n.onTheWay.length} of your ${plural(n.onTheWay.length, 'delivery is', 'deliveries are')} on the way`, sub: 'Waiting for them to confirm what arrived.' },
  ].filter(Boolean);
  const todoCount = items.filter(i => i.tone !== 'info').length;
  const TONE = {
    urgent: 'border-orange-300 bg-orange-50', todo: 'border-amber-200 bg-amber-50', info: 'border-gray-200 bg-white',
  };
  const BTN = {
    urgent: 'bg-orange-600 hover:bg-orange-700 text-white', todo: 'bg-green-600 hover:bg-green-700 text-white', info: 'border border-gray-300 text-gray-700 hover:bg-gray-50',
  };

  return (
    <div className="space-y-4 mb-6">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800">{hello}, {farmName}</h2>
        <p className="text-gray-600 mt-0.5">
          {!n ? 'Checking what needs doing…' : todoCount ? `${todoCount} ${plural(todoCount, 'thing needs', 'things need')} doing.` : '✅ You’re all caught up. Nothing needs doing right now.'}
        </p>
        <div className="flex gap-2 mt-4 flex-wrap">
          <button onClick={onCreate} disabled={!approved}
            className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">➕ New batch</button>
          {animals.length > 0 && approved && (
            <button onClick={() => go('stock', 'animals')} className="bg-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-red-800">
              🐄 Send animals to an abattoir</button>
          )}
          <button onClick={() => go('orders')} className="border border-gray-300 text-gray-700 text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50">🧾 All orders</button>
        </div>
      </div>

      {!n ? (
        <div className="bg-white rounded-lg shadow p-6 text-sm text-gray-500 animate-pulse">Loading your to-do list…</div>
      ) : items.length > 0 && (
        <div className="space-y-2">
          {items.map((i, k) => (
            <div key={k} className={`border-2 rounded-lg p-4 flex gap-3 items-start ${TONE[i.tone]}`}>
              <span className="text-2xl leading-none">{i.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800">{i.title}</p>
                {i.sub && <p className="text-sm text-gray-600 mt-0.5 break-words">{i.sub}</p>}
                {/* On a phone the button sits under the text */}
                <button onClick={() => go(i.tab)} className={`sm:hidden mt-2 text-sm font-semibold px-3 py-1.5 rounded-lg ${BTN[i.tone]}`}>{i.action} →</button>
              </div>
              <button onClick={() => go(i.tab)} className={`hidden sm:block shrink-0 text-sm font-semibold px-3 py-1.5 rounded-lg ${BTN[i.tone]}`}>{i.action} →</button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          ['📦', 'Batches with stock', batches.filter(live).length, 'stock'],
          ['🐄', 'Animals on the farm', animals.reduce((x, b) => x + Number(b.quantityRemaining ?? b.quantity), 0), 'stock', 'animals'],
          ['🧾', 'Open orders', n ? n.newOrders.length + n.partSent.length + n.meatElsewhere.length : '…', 'orders'],
          ['🎖️', 'Badges unlocked', batches.reduce((x, b) => x + (b.unlocks || 0), 0), 'farm'],
        ].map(([icon, label, value, t, f]) => (
          <button key={label} onClick={() => go(t, f)} className="bg-white rounded-lg shadow p-4 text-left hover:shadow-md transition">
            <p className="text-xs text-gray-500">{icon} {label}</p>
            <p className="text-2xl font-bold text-gray-800">{value}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export default FarmerDashboard;