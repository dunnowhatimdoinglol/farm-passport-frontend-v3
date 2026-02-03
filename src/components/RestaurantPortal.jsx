import { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import RestaurantLogin    from './RestaurantLogin';
import RestaurantRegister from './RestaurantRegister';

const API_BASE = 'http://localhost:3002/api';

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
function RestaurantReceiptForm({ restaurantUser, onLogout, onBack }) {
  // ── Batch list ──
  const [batches,  setBatches]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [fetchErr, setFetchErr] = useState(null);

  // ── Form ──
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [amountPaid,      setAmountPaid]      = useState('');
  const [submitting,      setSubmitting]      = useState(false);
  const [submitErr,       setSubmitErr]       = useState(null);

  // ── Success ──
  const [createdReceipt, setCreatedReceipt] = useState(null);

  // ── Fetch batches ──
  useEffect(() => {
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
    fetchBatches();
  }, []);

  const selectedBatch = batches.find(b => b.batchId === selectedBatchId) || null;

  // ── Submit ──
  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitErr(null);

    try {
      const res = await axios.post(`${API_BASE}/restaurant/create-receipt`, {
        batchId:        selectedBatchId,
        restaurantName: restaurantUser.restaurantName,   // from account — not user-editable
        amountPaid:     parseFloat(amountPaid),
      });

      const receipt = res.data.receipt || res.data.data || res.data;
      setCreatedReceipt(receipt);
    } catch (err) {
      console.error('RestaurantPortal create receipt:', err);
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
    setSubmitErr(null);
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

  // ─── FORM ───
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Header />

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
                  {b.farmer?.name ? ` (${b.farmer.name})` : ''}
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
                    <span className="font-semibold text-gray-800">{selectedBatch.farmer?.name || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Batch:</span>{' '}
                    <span className="font-mono font-semibold text-gray-800">{selectedBatch.batchId}</span>
                  </div>
                  {selectedBatch.quantity && (
                    <div>
                      <span className="text-gray-500">Quantity:</span>{' '}
                      <span className="font-semibold text-gray-800">{selectedBatch.quantity}</span>
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

          {/* Submit error */}
          {submitErr && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3">
              <p className="text-red-600 text-sm font-semibold">⚠️ {submitErr}</p>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {submitting ? '⏳ Creating receipt…' : '🧾 Generate Receipt QR'}
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

export default RestaurantPortal;