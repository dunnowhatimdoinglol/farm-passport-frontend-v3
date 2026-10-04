import { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import RestaurantLogin    from './RestaurantLogin';
import RestaurantRegister from './RestaurantRegister';

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

  const handleRestaurantLogin = (userData, token) => {
    setRestaurantUser(userData);
    setRestaurantToken(token);
  };

  const handleRestaurantLogout = () => {
    setRestaurantUser(null);
    setRestaurantToken(null);
    setAuthView('login');
  };

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
// Inner component — the receipt creation form + QR display.
// Separated so the batch fetch only fires once the user is
// actually logged in.
// ─────────────────────────────────────────────────────────
function RestaurantReceiptForm({ restaurantUser, restaurantToken, onLogout, onBack }) {
  // ── Which tab is showing: new receipt form or past receipts ──
  const [tab, setTab] = useState('create');   // 'create' | 'history'

  // ── Email verification (checked live from the backend) ──
  const [emailVerified, setEmailVerified] = useState(restaurantUser.emailVerified ?? null);
  const [verifyMsg,     setVerifyMsg]     = useState(null);
  const [verifyBusy,    setVerifyBusy]    = useState(false);
  const authHeader = { headers: { Authorization: `Bearer ${restaurantToken}` } };

  const checkVerification = async () => {
    try {
      const res = await axios.get(`${API_BASE}/restaurant/auth/status`, authHeader);
      setEmailVerified(!!res.data.emailVerified);
      return !!res.data.emailVerified;
    } catch (err) {
      console.error('Restaurant verification status:', err);
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

  // ── Batch list ──
  const [batches,  setBatches]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  // ── Form ──
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [amountPaid,      setAmountPaid]      = useState('');
  const [quantitySold,    setQuantitySold]    = useState('');   // optional — wholesale stock tracking
  const [submitting,      setSubmitting]      = useState(false);
  const [submitErr,       setSubmitErr]       = useState(null);

  // ── Success ──
  const [createdReceipt, setCreatedReceipt] = useState(null);

  // ── Fetch batches (also re-run after each receipt so stock levels stay current) ──
  const fetchBatches = async () => {
    try {
      const res = await axios.get(`${API_BASE}/restaurant/batches`);
      const raw = res.data.batches || res.data.data || res.data;
      setBatches(Array.isArray(raw) ? raw : []);
    } catch (err) {
      console.error('RestaurantPortal fetch batches:', err);
      setFetchErr('Could not load available batches. Is the backend running on port 3002?');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const selectedBatch = batches.find(b => b.batchId === selectedBatchId) || null;

  // Farm name comes from the backend as farmName (older shape: farmer.name)
  const getFarmName = (b) => b?.farmName || b?.farmer?.name || null;

  // Stock left in a batch (falls back to the original quantity)
  const getRemaining = (b) =>
    b?.quantityRemaining !== undefined && b?.quantityRemaining !== null
      ? Number(b.quantityRemaining)
      : Number(b?.quantity);

  // ── Submit ──
  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitErr(null);

    try {
      const res = await axios.post(`${API_BASE}/restaurant/create-receipt`, {
        batchId:        selectedBatchId,
        amountPaid:     parseFloat(amountPaid),
        // Only sent when filled in — leaving it empty skips stock tracking
        quantitySold:   quantitySold === '' ? undefined : parseFloat(quantitySold),
      }, authHeader);   // restaurant name now comes from the login on the backend

      const receipt = res.data.receipt || res.data.data || res.data;
      setCreatedReceipt(receipt);

      // Update this batch's remaining stock straight away from the response
      const newRemaining = receipt.batch?.quantityRemaining;
      if (newRemaining !== undefined && newRemaining !== null) {
        setBatches(prev => prev.map(b =>
          b.batchId === selectedBatchId ? { ...b, quantityRemaining: newRemaining } : b
        ));
      }
    } catch (err) {
      console.error('RestaurantPortal create receipt:', err);
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') setEmailVerified(false);
      setSubmitErr(err.response?.data?.error || 'Failed to create receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset ──
  const handleCreateAnother = () => {
    setCreatedReceipt(null);
    setSelectedBatchId('');
    setAmountPaid('');
    setQuantitySold('');
    setSubmitErr(null);
    fetchBatches();   // pick up any stock changes (including from other restaurants)
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

  // ─── LOADING ───
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Header />
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">⏳</div>
          <p className="text-gray-600">Loading available batches…</p>
        </div>
      </div>
    );
  }

  // ─── FETCH ERROR ───
  if (fetchErr) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Header />
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-4">❌</div>
          <p className="text-red-600 mb-4">{fetchErr}</p>
          <button onClick={onBack} className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-semibold">← Back</button>
        </div>
      </div>
    );
  }

  // ─── SUCCESS — QR code ───
  if (createdReceipt) {
    const receiptId = createdReceipt.receiptId || createdReceipt.receipt_id;
    const batchId   = createdReceipt.batchId   || createdReceipt.batch_id   || selectedBatchId;
    const amount    = createdReceipt.amountPaid || createdReceipt.amount_paid || amountPaid;
    const sold      = createdReceipt.quantitySold ?? createdReceipt.quantity_sold ?? null;
    const unit      = createdReceipt.batch?.unit || selectedBatch?.unit || '';
    const leftAfter = createdReceipt.batch?.quantityRemaining;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Header />

        {/* Celebration */}
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="text-6xl mb-3">✅</div>
          <h2 className="text-3xl font-bold text-green-700 mb-1">Receipt Created!</h2>
          <p className="text-gray-600">Print this QR code on the customer's bill</p>
        </div>

        {/* QR */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex flex-col items-center">
            <QRCodeSVG
              value={receiptId}
              size={260}
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#1f2937"
            />
            <p className="font-mono text-sm text-gray-600 mt-4 break-all">{receiptId}</p>
          </div>
        </div>

        {/* Summary */}
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
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Left in Batch</p>
                    <p className="font-semibold text-gray-800">{formatQty(leftAfter, unit)}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Print tip */}
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

  // ── Tabs: New Receipt / Past Receipts ──
  const Tabs = () => (
    <div className="bg-white rounded-lg shadow-lg p-2 flex gap-2">
      {[
        { key: 'create',  label: '🧾 New Receipt' },
        { key: 'history', label: '📚 Past Receipts' },
      ].map(t => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`flex-1 py-2.5 rounded-lg font-semibold transition ${
            tab === t.key
              ? 'bg-orange-600 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );

  // ─── PAST RECEIPTS ───
  if (tab === 'history') {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Header />
        <Tabs />
        <ReceiptHistory restaurantToken={restaurantToken} onLogout={onLogout} />
        <div className="text-center">
          <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
        </div>
      </div>
    );
  }

  // ── Banner shown until the restaurant has verified its email ──
  const VerifyBanner = () => (
    <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-5">
      <p className="font-bold text-yellow-800">⚠️ Please verify your email</p>
      <p className="text-sm text-yellow-700 mt-1">
        Check your inbox at <strong>{restaurantUser.email}</strong> for the verification link.
        You can create receipts once your email is verified.
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

  // ─── FORM ───
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Header />
      {emailVerified === false && <VerifyBanner />}
      <Tabs />

      {/* Form card */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <form onSubmit={handleCreate} className="space-y-6">

          {/* Batch selector */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Select Product Batch</label>
            <select
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent bg-white"
              required
            >
              <option value="">— Choose a batch —</option>
              {batches.map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  {b.productName || b.cropType || 'Product'} — {b.batchId}
                  {getFarmName(b) ? ` (${getFarmName(b)})` : ''}
                </option>
              ))}
            </select>

            {/* Inline batch info */}
            {selectedBatch && (
              <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Product:</span>{' '}
                    <span className="font-semibold text-gray-800">{selectedBatch.productName || selectedBatch.cropType}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Farm:</span>{' '}
                    <span className="font-semibold text-gray-800">{getFarmName(selectedBatch) || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Batch:</span>{' '}
                    <span className="font-mono font-semibold text-gray-800">{selectedBatch.batchId}</span>
                  </div>
                  {selectedBatch.quantity && (
                    <div>
                      <span className="text-gray-500">Quantity:</span>{' '}
                      <span className="font-semibold text-gray-800">
                        {formatQty(selectedBatch.quantity, selectedBatch.unit)}
                      </span>
                    </div>
                  )}
                  {selectedBatch.quantity && (
                    <div>
                      <span className="text-gray-500">Remaining:</span>{' '}
                      <span className={`font-semibold ${getRemaining(selectedBatch) <= 0 ? 'text-red-600' : 'text-gray-800'}`}>
                        {formatQty(getRemaining(selectedBatch), selectedBatch.unit)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Restaurant name — read-only, from account */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Restaurant Name</label>
            <input
              type="text"
              value={restaurantUser.restaurantName}
              disabled
              className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 cursor-not-allowed"
            />
            <p className="text-xs text-gray-400 mt-1">Set when you created your account</p>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Paid (£)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">£</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amountPaid}
                onChange={(e) => setAmountPaid(e.target.value)}
                placeholder="12.50"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Quantity sold — OPTIONAL, for wholesale stock tracking */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Quantity Sold <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                max={selectedBatch ? getRemaining(selectedBatch) : undefined}
                value={quantitySold}
                onChange={(e) => setQuantitySold(e.target.value)}
                placeholder="e.g. 250"
                className="w-full pl-4 pr-16 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
              {selectedBatch?.unit && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">
                  {selectedBatch.unit}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              For wholesale sales — deducted from the batch's remaining stock. Leave empty for meals.
            </p>
          </div>

          {/* Submit error */}
          {submitErr && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3">
              <p className="text-red-600 text-sm font-semibold">⚠️ {submitErr}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting || emailVerified === false}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {submitting               ? '⏳ Creating receipt…'
             : emailVerified === false ? '🔒 Verify your email to create receipts'
             :                           '🧾 Generate Receipt QR'}
          </button>
        </form>
      </div>

      {/* How it works */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-blue-800 mb-2">💡 How this works</h3>
        <p className="text-blue-700 text-sm">
          Select the batch the customer ordered and enter what they paid. A QR code will be generated — print it on their receipt. When they scan it at home they can claim a Farm Badge.
        </p>
      </div>

      <div className="text-center">
        <button onClick={onBack} className="text-gray-600 hover:underline">← Back</button>
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