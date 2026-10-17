import { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import RestaurantLogin    from './RestaurantLogin';
import RestaurantRegister from './RestaurantRegister';
import { AUTH_EVENT, announceAuth, clearCustomerSession } from '../authSession';
import { lastStepText } from './walletHelpers';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';

// Formats a quantity with its unit, e.g. 2000 + "kg" → "2,000 kg"
const formatQty = (amount, unit) =>
  `${Number(amount).toLocaleString('en-GB')} ${unit || ''}`.trim();

function RestaurantPortal({ onBack }) {
  // ── Restaurant auth (self-contained, App.jsx doesn't know about this) ──
  const [restaurantUser,  setRestaurantUser]  = useState(null);
  const [restaurantToken, setRestaurantToken] = useState(null);
  const [authView,        setAuthView]        = useState('login');   // 'login' | 'register'

  // Restore restaurant session on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fp_restaurant_auth');
      if (saved) {
        const { user, token } = JSON.parse(saved);
        if (user && token) {
          setRestaurantUser(user);
          setRestaurantToken(token);
        }
      }
    } catch (_) {}
  }, []);

  // Persist / clear restaurant session
  useEffect(() => {
    if (restaurantUser && restaurantToken) {
      localStorage.setItem('fp_restaurant_auth', JSON.stringify({ user: restaurantUser, token: restaurantToken }));
    } else {
      localStorage.removeItem('fp_restaurant_auth');
    }
  }, [restaurantUser, restaurantToken]);

  // Clears the restaurant session in this component only
  const resetRestaurantSession = () => {
    setRestaurantUser(null);
    setRestaurantToken(null);
    setAuthView('login');
  };

  const handleRestaurantLogin = (userData, token) => {
    // Restaurant signed in → sign the customer out
    clearCustomerSession();
    announceAuth({ role: 'restaurant', action: 'login', name: userData.restaurantName });

    setRestaurantUser(userData);
    setRestaurantToken(token);
  };

  const handleRestaurantLogout = () => {
    resetRestaurantSession();
    announceAuth({ role: 'restaurant', action: 'logout' });
  };

  // A customer logging in (or a logout from the header) signs the restaurant out
  useEffect(() => {
    const onAuthChange = (e) => {
      const { role, action } = e.detail || {};
      if ((role === 'customer' && action === 'login') ||
          (role === 'restaurant' && action === 'logout')) {
        resetRestaurantSession();
      }
    };
    window.addEventListener(AUTH_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_EVENT, onAuthChange);
  }, []);

  // ──────────────────────────────────────────────
  // NOT LOGGED IN → restaurant login / register
  // ──────────────────────────────────────────────
  if (!restaurantUser) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-3">🍽️</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-1">Restaurant Portal</h2>
          <p className="text-gray-600">Sign in to generate receipt QR codes for your customers</p>
        </div>

        {authView === 'login' ? (
          <RestaurantLogin
            onLogin={handleRestaurantLogin}
            onSwitchToRegister={() => setAuthView('register')}
          />
        ) : (
          <RestaurantRegister
            onRegister={handleRestaurantLogin}
            onSwitchToLogin={() => setAuthView('login')}
          />
        )}

        <div className="text-center">
          <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
        </div>
      </div>
    );
  }

  // ──────────────────────────────────────────────
  // LOGGED IN — hand off to the receipt creation form
  // ──────────────────────────────────────────────
  return (
    <RestaurantReceiptForm
      restaurantUser={restaurantUser}
      restaurantToken={restaurantToken}
      onLogout={handleRestaurantLogout}
      onBack={onBack}
    />
  );
}

// ─────────────────────────────────────────────────────────
// Logged-in restaurant: receipts, ordering stock, deliveries, history.
// ─────────────────────────────────────────────────────────
function RestaurantReceiptForm({ restaurantUser, restaurantToken, onLogout, onBack }) {
  // ── Which tab is showing ──
  const [tab, setTab] = useState('create');   // 'create' | 'order' | 'deliveries' | 'history'

  // ── Email verification + approval (checked live from the backend) ──
  const [emailVerified,  setEmailVerified]  = useState(restaurantUser.emailVerified ?? null);
  const [approvalStatus, setApprovalStatus] = useState(restaurantUser.approvalStatus ?? null);
  const [verifyMsg,     setVerifyMsg]     = useState(null);
  const [verifyBusy,    setVerifyBusy]    = useState(false);
  const authHeader = { headers: { Authorization: `Bearer ${restaurantToken}` } };

  const checkVerification = async () => {
    try {
      const res = await axios.get(`${API_BASE}/restaurant/account`, authHeader);
      setEmailVerified(!!res.data.emailVerified);
      setApprovalStatus(res.data.approvalStatus);
      return !!res.data.emailVerified;
    } catch (err) {
      console.error('Restaurant account status:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setVerifyMsg('Your session has expired. Please log out and log in again.');
      }
      return false;
    }
  };

  useEffect(() => {
    checkVerification();
  }, [restaurantToken]);

  const handleResend = async () => {
    setVerifyBusy(true);
    setVerifyMsg(null);
    try {
      const res = await axios.post(`${API_BASE}/restaurant/auth/resend-verification`, {}, authHeader);
      if (res.data.alreadyVerified) setEmailVerified(true);
      setVerifyMsg(res.data.message || 'Verification email sent!');
    } catch (err) {
      setVerifyMsg(err.response?.data?.error || 'Could not resend the email. Please try again.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleCheckAgain = async () => {
    setVerifyBusy(true);
    setVerifyMsg(null);
    const verified = await checkVerification();
    if (!verified) setVerifyMsg("Still not verified — click the link in your email, then try again.");
    setVerifyBusy(false);
  };

  const approved = approvalStatus === 'approved';

  // ── Stock = deliveries received with something left ──
  const [stock,    setStock]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  const fetchStock = async () => {
    try {
      const res = await axios.get(`${API_BASE}/restaurant/my-stock`, authHeader);
      setStock(res.data.stock || []);
      setFetchErr(null);
    } catch (err) {
      console.error('RestaurantPortal stock:', err);
      setFetchErr(err.response?.data?.error || 'Could not load your stock.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStock();
  }, []);

  // ── Form ──
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [amountPaid,      setAmountPaid]      = useState('');
  const [quantitySold,    setQuantitySold]    = useState('');   // optional — wholesale stock tracking
  const [submitting,      setSubmitting]      = useState(false);
  const [submitErr,       setSubmitErr]       = useState(null);

  // ── Success ──
  const [createdReceipt, setCreatedReceipt] = useState(null);

  const selected = stock.find(s => String(s.shipmentId) === String(selectedShipmentId)) || null;

  // ── Submit ──
  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitErr(null);

    try {
      const res = await axios.post(`${API_BASE}/restaurant/create-receipt`, {
        shipmentId:     Number(selectedShipmentId),
        amountPaid:     parseFloat(amountPaid),
        // Only sent when filled in — leaving it empty skips stock tracking
        quantitySold:   quantitySold === '' ? undefined : parseFloat(quantitySold),
      }, authHeader);   // restaurant name comes from the login on the backend

      setCreatedReceipt(res.data.receipt || res.data.data || res.data);
    } catch (err) {
      console.error('RestaurantPortal create receipt:', err);
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') setEmailVerified(false);
      if (err.response?.data?.code === 'NOT_APPROVED') setApprovalStatus('pending');
      setSubmitErr(err.response?.data?.error || 'Failed to create receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset ──
  const handleCreateAnother = () => {
    setCreatedReceipt(null);
    setSelectedShipmentId('');
    setAmountPaid('');
    setQuantitySold('');
    setSubmitErr(null);
    fetchStock();
  };

  // ── Logged-in header (shared by all states below) ──
  const Header = () => (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">🍽️ {restaurantUser.restaurantName}</h2>
          <p className="text-sm text-gray-500">{restaurantUser.email}</p>
        </div>
        <button
          onClick={onLogout}
          className="text-sm text-gray-500 hover:text-gray-700 font-semibold border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition"
        >
          Logout
        </button>
      </div>
    </div>
  );

  // ── Banners: email not verified / waiting for approval ──
  const VerifyBanner = () => (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-5">
      <p className="font-bold text-yellow-800">⚠️ Please verify your email</p>
      <p className="text-sm text-yellow-700 mt-1">
        Check your inbox at <strong>{restaurantUser.email}</strong> for the verification link.
      </p>
      <div className="flex gap-2 mt-3 flex-wrap">
        <button
          onClick={handleResend}
          disabled={verifyBusy}
          className="bg-yellow-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-yellow-700 transition disabled:bg-gray-400"
        >
          Resend email
        </button>
        <button
          onClick={handleCheckAgain}
          disabled={verifyBusy}
          className="bg-white text-yellow-800 text-sm font-semibold px-4 py-2 rounded-lg border border-yellow-400 hover:bg-yellow-100 transition disabled:opacity-50"
        >
          I've verified
        </button>
      </div>
      {verifyMsg && <p className="text-sm text-yellow-800 mt-2">{verifyMsg}</p>}
    </div>
  );

  const ApprovalBanner = () => (
    <div className={`border rounded-lg p-5 ${approvalStatus === 'rejected' ? 'bg-red-50 border-red-300' : 'bg-blue-50 border-blue-300'}`}>
      {approvalStatus === 'rejected' ? (
        <p className="font-bold text-red-800">⛔ Your account was not approved. Please contact us if you think this is a mistake.</p>
      ) : (
        <>
          <p className="font-bold text-blue-800">⏳ Your account is waiting for approval</p>
          <p className="text-sm text-blue-700 mt-1">
            We check every new business before it can order stock or create receipts. You can browse what's available in the meantime.
          </p>
        </>
      )}
    </div>
  );

  const Banners = () => (
    <>
      {emailVerified === false && <VerifyBanner />}
      {approvalStatus && !approved && <ApprovalBanner />}
    </>
  );

  // ── Tabs ──
  const Tabs = () => (
    <div className="bg-white rounded-lg shadow-lg p-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {[
        { key: 'create',     label: '🧾 New Receipt' },
        { key: 'order',      label: '🛒 Order Stock' },
        { key: 'deliveries', label: '🚚 Deliveries' },
        { key: 'history',    label: '📚 Past Receipts' },
      ].map(t => (
        <button
          key={t.key}
          onClick={() => { setTab(t.key); if (t.key === 'create') fetchStock(); }}
          className={`py-2.5 rounded-lg font-semibold transition text-sm ${
            tab === t.key ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // Page frame. A plain function (not a component) so the forms inside don't lose focus while typing.
  const shell = (children) => (
    <div className="max-w-4xl mx-auto space-y-6">
      <Header />
      <Banners />
      <Tabs />
      {children}
      <div className="text-center">
        <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
      </div>
    </div>
  );

  // ─── SUCCESS — QR code ───
  if (createdReceipt) {
    const receiptId = createdReceipt.receiptId || createdReceipt.receipt_id;
    const batchId   = createdReceipt.batchId   || createdReceipt.batch_id;
    const amount    = createdReceipt.amountPaid || createdReceipt.amount_paid || amountPaid;
    const sold      = createdReceipt.quantitySold ?? createdReceipt.quantity_sold ?? null;
    const unit      = createdReceipt.batch?.unit || selected?.unit || '';
    const leftAfter = createdReceipt.myStockRemaining;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Header />

        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-3">✅</div>
          <h2 className="text-3xl font-bold text-green-700 mb-1">Receipt Created!</h2>
          <p className="text-gray-600">Print this QR code on the customer's bill</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex flex-col items-center">
            <QRCodeSVG value={receiptId} size={260} includeMargin={true} bgColor="#ffffff" fgColor="#1f2937" />
            <p className="font-mono text-sm text-gray-600 mt-4 break-all">{receiptId}</p>
          </div>
        </div>

        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-3">📋 Receipt Summary</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Receipt ID</p>
              <p className="font-mono text-sm font-semibold text-gray-800">{receiptId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Restaurant</p>
              <p className="font-semibold text-gray-800">{restaurantUser.restaurantName}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Batch</p>
              <p className="font-mono text-sm font-semibold text-gray-800">{batchId}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Amount</p>
              <p className="font-semibold text-gray-800">£{Number(amount).toFixed(2)}</p>
            </div>
            {sold !== null && (
              <>
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide">Quantity Sold</p>
                  <p className="font-semibold text-gray-800">{formatQty(sold, unit)}</p>
                </div>
                {leftAfter !== undefined && leftAfter !== null && (
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Left From This Delivery</p>
                    <p className="font-semibold text-gray-800">{formatQty(leftAfter, unit)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-center">
          <p className="text-yellow-800 text-sm">
            🖨️ <strong>Tip:</strong> Right-click the QR code → Save image, then print it onto the customer's receipt. The code expires in 7 days.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={handleCreateAnother} className="bg-green-600 text-white px-6 py-3 rounded-lg font-bold hover:bg-green-700 transition">
            + Create Another Receipt
          </button>
          <button onClick={onBack} className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-bold hover:bg-gray-200 transition">
            ← Back
          </button>
        </div>
      </div>
    );
  }

  if (tab === 'history') {
    return shell(<ReceiptHistory restaurantToken={restaurantToken} onLogout={onLogout} />);
  }
  if (tab === 'order') {
    return shell(<OrderStock authHeader={authHeader} approved={approved} />);
  }
  if (tab === 'deliveries') {
    return shell(<Deliveries authHeader={authHeader} approved={approved} onReceived={fetchStock} />);
  }

  // ─── NEW RECEIPT ───
  return shell(
    <>
      <div className="bg-white rounded-lg shadow-lg p-8">
        {loading ? (
          <p className="text-gray-600 text-center">⏳ Loading your stock…</p>
        ) : fetchErr ? (
          <p className="text-red-600 text-center">⚠️ {fetchErr}</p>
        ) : stock.length === 0 ? (
          <div className="text-center">
            <div className="text-5xl mb-3">📦</div>
            <p className="text-gray-700 font-semibold">No stock yet</p>
            <p className="text-gray-500 text-sm mt-1">
              Order from a farm in <strong>🛒 Order Stock</strong>, then confirm it arrived in <strong>🚚 Deliveries</strong>.
              Receipts are created from stock you've received.
            </p>
          </div>
        ) : (
          <form onSubmit={handleCreate} className="space-y-6">

            {/* Which delivery the dish / sale came from */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Product (from your stock)</label>
              <select
                value={selectedShipmentId}
                onChange={(e) => setSelectedShipmentId(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
                required
              >
                <option value="">— Choose a product —</option>
                {stock.map((s) => (
                  <option key={s.shipmentId} value={s.shipmentId}>
                    {s.productName || 'Product'} — {s.farmName || 'Farm'} · {formatQty(s.available, s.unit)} left
                  </option>
                ))}
              </select>

              {selected && (
                <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4 grid grid-cols-2 gap-2 text-sm">
                  <div><span className="text-gray-500">Product:</span> <span className="font-semibold text-gray-800">{selected.productName}</span></div>
                  <div><span className="text-gray-500">Farm:</span> <span className="font-semibold text-gray-800">{selected.farmName || 'Unknown'}</span></div>
                  <div><span className="text-gray-500">Batch:</span> <span className="font-mono font-semibold text-gray-800">{selected.batchId}</span></div>
                  <div><span className="text-gray-500">Delivery:</span> <span className="font-semibold text-gray-800">#{selected.shipmentId}</span></div>
                  <div><span className="text-gray-500">Received:</span> <span className="font-semibold text-gray-800">{formatQty(selected.quantityReceived, selected.unit)}</span></div>
                  <div><span className="text-gray-500">Left:</span> <span className="font-semibold text-gray-800">{formatQty(selected.available, selected.unit)}</span></div>
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Paid (£)</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">£</span>
                <input
                  type="number" step="0.01" min="0.01"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  placeholder="12.50"
                  className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  required
                />
              </div>
            </div>

            {/* Quantity sold — OPTIONAL, for wholesale */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Quantity Sold <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <div className="relative">
                <input
                  type="number" step="any" min="0"
                  max={selected ? selected.available : undefined}
                  value={quantitySold}
                  onChange={(e) => setQuantitySold(e.target.value)}
                  placeholder="e.g. 2"
                  className="w-full pl-4 pr-16 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                {selected?.unit && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">{selected.unit}</span>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                For wholesale sales — recorded on the blockchain and taken off this delivery's stock. Leave empty for meals.
              </p>
            </div>

            {submitErr && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                <p className="text-red-600 text-sm font-semibold">⚠️ {submitErr}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || emailVerified === false || !approved}
              className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting               ? '⏳ Creating receipt…'
               : emailVerified === false ? '🔒 Verify your email to create receipts'
               : !approved               ? '🔒 Waiting for approval'
               :                           '🧾 Generate Receipt QR'}
            </button>
          </form>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-blue-800 mb-2">💡 How this works</h3>
        <p className="text-blue-700 text-sm">
          Pick the product the customer had and enter what they paid. Print the QR code on their receipt — when they scan it,
          they see the journey their food took to your door and can claim a Farm Badge.
        </p>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Order Stock — browse batches from farms and send an order.
// The farm accepts by dispatching it (recorded on-chain).
// ─────────────────────────────────────────────────────────
function OrderStock({ authHeader, approved }) {
  const [catalog,  setCatalog]  = useState([]);
  const [orders,   setOrders]   = useState([]);
  const [batchId,  setBatchId]  = useState('');
  const [quantity, setQuantity] = useState('');
  const [note,     setNote]     = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);
  const [message,  setMessage]  = useState(null);

  const load = async () => {
    try {
      const [c, o] = await Promise.all([
        axios.get(`${API_BASE}/restaurant/catalog`, authHeader),
        axios.get(`${API_BASE}/restaurant/orders`, authHeader),
      ]);
      setCatalog(c.data.batches || []);
      setOrders(o.data.orders || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load products');
    }
  };
  useEffect(() => { load(); }, []);

  const batch = catalog.find(b => b.batchId === batchId) || null;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await axios.post(`${API_BASE}/restaurant/orders`, { batchId, quantity, note }, authHeader);
      setMessage(`Order sent to ${batch?.farmName || 'the farm'}. You'll see it in Deliveries once they dispatch it.`);
      setBatchId(''); setQuantity(''); setNote('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not place the order');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async (o) => {
    try {
      await axios.post(`${API_BASE}/restaurant/orders/${o.id}/cancel`, {}, authHeader);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not cancel');
    }
  };

  const STATUS = {
    requested:  ['Waiting for the farm', 'bg-yellow-100 text-yellow-800'],
    dispatched: ['Dispatched', 'bg-green-100 text-green-700'],
    declined:   ['Declined', 'bg-gray-100 text-gray-600'],
    cancelled:  ['Cancelled', 'bg-gray-100 text-gray-600'],
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🛒 Order from a farm</h3>
        <p className="text-sm text-gray-500 mb-5">Payment is arranged directly with the farm for now (invoice or bank transfer).</p>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Product</label>
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent">
              <option value="">— Choose a product —</option>
              {catalog.map(b => (
                <option key={b.batchId} value={b.batchId}>
                  {b.productName} — {b.farmName || 'Farm'} · {formatQty(b.remaining, b.unit)} available
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
            <div className="relative">
              <input type="number" step="any" min="0.001" max={batch ? batch.remaining : undefined}
                value={quantity} onChange={(e) => setQuantity(e.target.value)} required placeholder="e.g. 50"
                className="w-full pl-4 pr-16 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
              {batch?.unit && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">{batch.unit}</span>}
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Note to the farm <span className="font-normal text-gray-400">(optional)</span></label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280}
              placeholder="e.g. Delivery Tuesday morning please"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
          </div>
          {error && <p className="text-sm text-red-600 font-semibold">⚠️ {error}</p>}
          {message && <p className="text-sm text-green-700 font-semibold">✅ {message}</p>}
          <button type="submit" disabled={busy || !approved}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed">
            {busy ? '⏳ Sending…' : !approved ? '🔒 Waiting for approval' : '🛒 Send order'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📋 Your orders</h3>
        {orders.length === 0 ? (
          <p className="text-sm text-gray-500">No orders yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {orders.map(o => (
              <div key={o.id} className="py-3 flex justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-800">{formatQty(o.quantity, o.unit)} {o.productName} — {o.farmName}</p>
                  <p className="text-xs text-gray-500">{new Date(o.createdAt).toLocaleDateString('en-GB')}{o.note ? ` · "${o.note}"` : ''}</p>
                  {o.farmerNote && <p className="text-xs text-gray-600 italic">Farm: "{o.farmerNote}"</p>}
                </div>
                <div className="text-right space-y-1">
                  <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[o.status]?.[1] || ''}`}>
                    {STATUS[o.status]?.[0] || o.status}
                  </span>
                  {o.status === 'dispatched' && (
                    <p className="text-xs text-gray-500">{o.paymentStatus === 'paid' ? '💷 Paid' : 'Payment due'}</p>
                  )}
                  {o.status === 'requested' && (
                    <button onClick={() => cancelOrder(o)} className="block text-xs text-red-600 hover:underline ml-auto">Cancel</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Deliveries — shipments sent to this restaurant.
// Confirming what arrived is recorded on-chain as this restaurant.
// ─────────────────────────────────────────────────────────
function Deliveries({ authHeader, approved, onReceived }) {
  const [shipments, setShipments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [qty,       setQty]       = useState({});   // shipmentId → quantity received
  const [notes,     setNotes]     = useState({});
  const [busyId,    setBusyId]    = useState(null);
  const [error,     setError]     = useState(null);

  const load = async () => {
    try {
      const res = await axios.get(`${API_BASE}/restaurant/inbound`, authHeader);
      setShipments(res.data.shipments || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load deliveries');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const receive = async (s) => {
    setBusyId(s.shipmentId);
    setError(null);
    try {
      await axios.post(`${API_BASE}/restaurant/shipments/${s.shipmentId}/receive`, {
        quantityReceived: qty[s.shipmentId] ?? s.quantitySent,
        notes: notes[s.shipmentId] || '',
      }, authHeader);
      await load();
      onReceived?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm the delivery');
    } finally {
      setBusyId(null);
    }
  };

  const incoming = shipments.filter(s => s.status === 'in_transit');
  const received = shipments.filter(s => s.status === 'delivered');

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🚚 On its way to you</h3>
        <p className="text-sm text-gray-500 mb-4">When it arrives, weigh/count it and confirm how much you actually received.</p>
        {error && <p className="text-sm text-red-600 font-semibold mb-3">⚠️ {error}</p>}
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : incoming.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing on its way right now.</p>
        ) : (
          <div className="space-y-4">
            {incoming.map(s => (
              <div key={s.shipmentId} className="border-2 border-blue-200 bg-blue-50 rounded-lg p-4">
                <p className="font-bold text-gray-800">{formatQty(s.quantitySent, s.unit)} {s.productName}</p>
                <p className="text-sm text-gray-600">from {s.fromName}{s.carrierName ? ` via ${s.carrierName}` : ''} · delivery #{s.shipmentId}</p>
                {s.dispatchNotes && <p className="text-sm text-gray-600 italic">{s.fromName}: "{s.dispatchNotes}"</p>}
                {s.lastStep && s.lastStep.stage !== 'Dispatched' && (
                  <p className="text-xs text-teal-700 mt-1">📍 Latest: {lastStepText(s.lastStep)}</p>
                )}
                <div className="flex gap-2 mt-3 flex-wrap items-center">
                  <span className="text-sm text-gray-600">Received:</span>
                  <input type="number" step="any" min="0" max={s.quantitySent}
                    value={qty[s.shipmentId] ?? s.quantitySent}
                    onChange={(e) => setQty({ ...qty, [s.shipmentId]: e.target.value })}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-sm text-gray-500">{s.unit}</span>
                </div>
                <input type="text" maxLength={200} placeholder="Notes (optional), e.g. 2 crates damaged"
                  value={notes[s.shipmentId] || ''}
                  onChange={(e) => setNotes({ ...notes, [s.shipmentId]: e.target.value })}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                <button onClick={() => receive(s)} disabled={busyId === s.shipmentId || !approved}
                  className="mt-3 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                  {busyId === s.shipmentId ? '⛓️ Recording…' : '✅ Confirm received'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📦 Received</h3>
        {received.length === 0 ? (
          <p className="text-sm text-gray-500">No deliveries received yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {received.map(s => (
              <div key={s.shipmentId} className="py-3 flex justify-between gap-3 flex-wrap">
                <div>
                  <p className="font-semibold text-gray-800">{s.productName} — {s.fromName}</p>
                  <p className="text-xs text-gray-500">
                    #{s.shipmentId} · received {formatQty(s.quantityReceived, s.unit)} of {formatQty(s.quantitySent, s.unit)}
                    {s.shortfall > 0 && <span className="text-orange-600 font-semibold"> · ⚠️ {formatQty(s.shortfall, s.unit)} short</span>}
                  </p>
                  {s.deliveryNotes && <p className="text-xs text-gray-600 italic">Your note: "{s.deliveryNotes}"</p>}
                </div>
                <p className={`font-bold text-sm ${s.available > 0 ? 'text-gray-800' : 'text-red-600'}`}>{formatQty(s.available, s.unit)} left</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Past receipts for the logged-in restaurant, with the
// option to show each receipt's QR code again (e.g. reprint).
// ─────────────────────────────────────────────────────────
function ReceiptHistory({ restaurantToken, onLogout }) {
  const [receipts, setReceipts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [openQR,   setOpenQR]   = useState(null);   // receiptId whose QR is showing

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await axios.get(`${API_BASE}/restaurant/my-receipts`, {
          headers: { Authorization: `Bearer ${restaurantToken}` }
        });
        setReceipts(res.data.receipts || []);
      } catch (err) {
        console.error('RestaurantPortal receipt history:', err);
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError('Your session has expired. Please log out and log in again.');
        } else {
          setError(err.response?.data?.error || 'Could not load your receipts.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [restaurantToken]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">⏳</div>
        <p className="text-gray-600">Loading your receipts…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">❌</div>
        <p className="text-red-600 mb-4">{error}</p>
        <button onClick={onLogout} className="text-sm text-gray-600 border border-gray-300 px-4 py-2 rounded-lg hover:bg-gray-50">
          Log out
        </button>
      </div>
    );
  }

  if (receipts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-8 text-center">
        <div className="text-6xl mb-4">🧾</div>
        <p className="text-gray-600">No receipts yet. Create one from the New Receipt tab.</p>
      </div>
    );
  }

  const claimedCount = receipts.filter(r => r.claimed).length;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-white rounded-lg shadow-lg p-5 flex justify-around text-center">
        <div>
          <p className="text-2xl font-bold text-gray-800">{receipts.length}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Receipts</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-green-700">{claimedCount}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Badges Claimed</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-gray-500">{receipts.length - claimedCount}</p>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Unclaimed</p>
        </div>
      </div>

      {/* List */}
      {receipts.map((r) => (
        <div key={r.receiptId} className="bg-white rounded-lg shadow-lg p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="font-bold text-gray-800">{r.productName || 'Product'}</p>
              <p className="font-mono text-xs text-gray-500 break-all">{r.receiptId}</p>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(r.createdAt).toLocaleString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
            <div className="text-right">
              {r.amountPaid !== null && r.amountPaid !== undefined && (
                <p className="font-bold text-gray-800">£{Number(r.amountPaid).toFixed(2)}</p>
              )}
              {r.quantitySold !== null && r.quantitySold !== undefined && (
                <p className="text-sm text-gray-600">{formatQty(r.quantitySold, r.unit)}</p>
              )}
              <span className={`inline-block mt-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                r.claimed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
              }`}>
                {r.claimed ? '✅ Badge claimed' : 'Not yet claimed'}
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
            <p className="font-mono text-xs text-gray-400 break-all">Batch: {r.batchId}</p>
            <button
              onClick={() => setOpenQR(openQR === r.receiptId ? null : r.receiptId)}
              className="text-sm font-semibold text-orange-600 hover:text-orange-700"
            >
              {openQR === r.receiptId ? 'Hide QR' : 'Show QR'}
            </button>
          </div>

          {openQR === r.receiptId && (
            <div className="mt-4 flex flex-col items-center border-t border-gray-100 pt-4">
              <QRCodeSVG value={r.receiptId} size={200} includeMargin={true} bgColor="#ffffff" fgColor="#1f2937" />
              <p className="text-xs text-gray-400 mt-2">Right-click the QR → Save image to reprint</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default RestaurantPortal;