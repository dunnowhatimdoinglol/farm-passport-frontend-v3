import { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import RestaurantLogin    from './RestaurantLogin';
import RestaurantRegister from './RestaurantRegister';
import { AUTH_EVENT, announceAuth, clearCustomerSession } from '../authSession';
import { shortWhen, receiptLink } from './walletHelpers';
import NfcShare from './NfcShare';
import { PhotoPicker, DeliveryPhotoButton } from './DeliveryPhoto';
import { TermsCheck, Refs, OwedLine } from './FarmerSupply';
import { TxLink, ChainHelp } from './ChainProof';

// Prices are only shown to the farm and the restaurant — never on the customer journey
const gbp = (v) => (v === null || v === undefined || isNaN(Number(v))) ? null : `£${Number(v).toFixed(2)}`;

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';

// Formats a quantity with its unit, e.g. 2000 + "kg" → "2,000 kg"
const formatQty = (amount, unit) =>
  `${Number(amount).toLocaleString('en-GB')} ${unit || ''}`.trim();

function RestaurantPortal({ onBack, startOn = null }) {
  // ── Restaurant auth (self-contained, App.jsx doesn't know about this) ──
  const [restaurantUser,  setRestaurantUser]  = useState(null);
  const [restaurantToken, setRestaurantToken] = useState(null);
  const [authView,        setAuthView]        = useState(startOn === 'register' ? 'register' : 'login');   // 'login' | 'register'

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

  // ── Dishes: menu price + recipe ──
  const [dishes, setDishes] = useState([]);
  const [showDishes, setShowDishes] = useState(false);
  const fetchDishes = async () => {
    try {
      const res = await axios.get(`${API_BASE}/restaurant/dishes`, authHeader);
      setDishes(res.data.dishes || []);
    } catch (err) {
      console.error('RestaurantPortal dishes:', err);
    }
  };
  useEffect(() => { fetchStock(); fetchDishes(); }, []);

  // ── The bill being built ──
  const [counts,    setCounts]    = useState({});    // dishId → servings
  const [extras,    setExtras]    = useState([]);    // [{ key, productName, unit, quantity, name, price }]
  const [extra,     setExtra]     = useState(null);  // the "something else" form being filled in
  const [discType,  setDiscType]  = useState('amount');
  const [discValue, setDiscValue] = useState('');
  const [ownTotal,  setOwnTotal]  = useState(null);  // a total typed by hand (null = worked out)
  const [submitting, setSubmitting] = useState(false);
  const [submitErr,  setSubmitErr]  = useState(null);
  const [createdReceipt, setCreatedReceipt] = useState(null);

  // Stock grouped by product (e.g. all carrots, from any farm / delivery)
  const products = Object.values(stock.reduce((g, s) => {
    if (s.recalled) return g;
    const k = `${(s.productName || '').trim().toLowerCase()}|${s.unit}`;
    const p = g[k] || (g[k] = { key: k, productName: (s.productName || '').trim(), unit: s.unit, available: 0, farms: [] });
    p.available = Math.round((p.available + s.available) * 1000) / 1000;
    if (s.farmName && !p.farms.includes(s.farmName)) p.farms.push(s.farmName);
    return g;
  }, {})).sort((a, b) => a.productName.localeCompare(b.productName));

  const setCount = (id, n) => setCounts({ ...counts, [id]: Math.max(0, n) });
  const dishLines = dishes.filter(d => counts[d.id] > 0);
  const lineTotal = (price, n) => (price === null || price === undefined || price === '' ? null : Math.round(Number(price) * n * 100) / 100);
  const allLines = [
    ...dishLines.map(d => ({ key: `d${d.id}`, name: d.name, servings: counts[d.id], total: lineTotal(d.price, counts[d.id]) })),
    ...extras.map(x => ({ key: x.key, name: x.name || `${x.quantity} ${x.unit} ${x.productName}`, servings: 1, total: lineTotal(x.price, 1) })),
  ];
  const priced = allLines.filter(l => l.total !== null);
  const subtotal = priced.length ? Math.round(priced.reduce((n, l) => n + l.total, 0) * 100) / 100 : null;
  const discount = subtotal === null || discValue === '' ? 0
    : discType === 'percent' ? Math.round(subtotal * Number(discValue)) / 100 : Number(discValue);
  const worked = subtotal === null ? null : Math.max(0, Math.round((subtotal - discount) * 100) / 100);
  const total = ownTotal !== null && ownTotal !== '' ? Number(ownTotal) : worked;

  const addExtra = () => {
    const p = products.find(x => x.key === extra?.product);
    if (!p || !(Number(extra.quantity) > 0)) { setSubmitErr('Choose a product and how much was used'); return; }
    setExtras([...extras, { key: `x${Date.now()}`, productName: p.productName, unit: p.unit, quantity: Number(extra.quantity), name: extra.name?.trim() || '', price: extra.price === '' ? null : extra.price }]);
    setExtra(null); setSubmitErr(null);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!allLines.length) { setSubmitErr('Add at least one dish'); return; }
    setSubmitting(true);
    setSubmitErr(null);
    try {
      const res = await axios.post(`${API_BASE}/restaurant/create-receipt`, {
        lines: [
          ...dishLines.map(d => ({ dishId: d.id, servings: counts[d.id] })),
          ...extras.map(x => ({ productName: x.productName, unit: x.unit, quantity: x.quantity, name: x.name || undefined, price: x.price ?? undefined })),
        ],
        discount: discValue !== '' && Number(discValue) > 0 ? { type: discType, value: Number(discValue) } : undefined,
        total: ownTotal !== null && ownTotal !== '' ? Number(ownTotal) : undefined,
      }, authHeader);   // restaurant name comes from the login on the backend
      setCreatedReceipt(res.data.receipt);
      fetchDishes();
    } catch (err) {
      console.error('RestaurantPortal create receipt:', err);
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') setEmailVerified(false);
      if (err.response?.data?.code === 'NOT_APPROVED') setApprovalStatus('pending');
      setSubmitErr(err.response?.data?.error || 'Failed to create receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateAnother = () => {
    setCreatedReceipt(null);
    setCounts({}); setExtras([]); setExtra(null);
    setDiscValue(''); setOwnTotal(null); setSubmitErr(null);
    fetchStock(); fetchDishes();
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
        <button onClick={handleResend} disabled={verifyBusy}
          className="bg-yellow-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-yellow-700 transition disabled:bg-gray-400">
          Resend email
        </button>
        <button onClick={handleCheckAgain} disabled={verifyBusy}
          className="bg-white text-yellow-800 text-sm font-semibold px-4 py-2 rounded-lg border border-yellow-400 hover:bg-yellow-100 transition disabled:opacity-50">
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
          onClick={() => { setTab(t.key); if (t.key === 'create') { fetchStock(); fetchDishes(); } }}
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
    const r = createdReceipt;
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
            <QRCodeSVG value={receiptLink(r.receiptId)} size={260} includeMargin={true} bgColor="#ffffff" fgColor="#1f2937" />
            <p className="font-mono text-sm text-gray-600 mt-4 break-all">{r.receiptId}</p>
            <NfcShare url={receiptLink(r.receiptId)} />
          </div>
        </div>

        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-3">📋 The bill</h3>
          <div className="divide-y divide-green-100">
            {(r.lines || []).map((l, i) => (
              <div key={i} className="py-1.5 flex justify-between text-sm">
                <span>{l.servings !== 1 ? `${l.servings} × ` : ''}{l.name}</span>
                <span className="font-semibold">{l.lineTotal !== null && l.lineTotal !== undefined ? gbp(l.lineTotal) : ''}</span>
              </div>
            ))}
          </div>
          {r.discount && <p className="text-sm text-gray-600 mt-2 flex justify-between"><span>Discount ({r.discount.type === 'percent' ? `${r.discount.value}%` : gbp(r.discount.value)})</span><span>−{gbp(r.discount.amount)}</span></p>}
          {r.total !== null && r.total !== undefined && <p className="text-lg font-bold text-gray-800 mt-2 flex justify-between"><span>Total</span><span>{gbp(r.total)}</span></p>}
          <div className="mt-4 text-xs text-gray-600">
            <p className="font-semibold text-gray-700 mb-1">Taken off your stock (recorded on the blockchain):</p>
            {(r.used || []).map(u => <p key={u.shipmentId}>{formatQty(u.quantity, u.unit)} {u.productName} — {u.farmName || 'farm'} · delivery #{u.shipmentId}</p>)}
          </div>
          {r.farms?.length > 1 && <p className="text-xs text-green-800 mt-2">🎖️ The customer can collect {r.farms.length} farm badges from this one receipt.</p>}
        </div>

        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 text-center">
          <p className="text-yellow-800 text-sm">
            🖨️ <strong>Tip:</strong> Right-click the QR code → Save image, then print it onto the customer's receipt.
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
    return shell(<><Deliveries authHeader={authHeader} approved={approved} onReceived={fetchStock} /><ChainHelp who="cafe" className="mt-6" /></>);
  }

  // ─── NEW RECEIPT: build the bill ───
  const usable = dishes.filter(d => d.ingredients?.length);
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
            {/* Dishes */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <label className="block text-sm font-semibold text-gray-700">What did they have?</label>
                <button type="button" onClick={() => setShowDishes(true)} className="text-xs text-orange-600 font-semibold hover:underline">+ new dish</button>
              </div>
              {usable.length === 0 ? (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">No dishes yet. Add your dishes (with price and recipe) below, or use "Something else".</p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {usable.map(d => {
                    const n = counts[d.id] || 0;
                    const out = d.canMake !== null && d.canMake !== undefined && n >= d.canMake;
                    return (
                      <div key={d.id} className={`border rounded-lg p-3 flex justify-between items-center gap-2 ${n ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-800 truncate">{d.name}</p>
                          <p className="text-xs text-gray-500">{d.price !== null ? gbp(d.price) : 'no price'} · {d.canMake === 0 ? <span className="text-red-600">out of stock</span> : `${d.canMake} left`}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button type="button" onClick={() => setCount(d.id, n - 1)} disabled={!n}
                            className="w-8 h-8 rounded-lg bg-gray-100 font-bold text-gray-700 hover:bg-gray-200 disabled:opacity-40">−</button>
                          <span className="w-6 text-center font-semibold">{n}</span>
                          <button type="button" onClick={() => setCount(d.id, n + 1)} disabled={out}
                            className="w-8 h-8 rounded-lg bg-orange-600 font-bold text-white hover:bg-orange-700 disabled:bg-gray-300">+</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Something else: an amount of a product, typed in */}
            <div>
              {!extra ? (
                <button type="button" onClick={() => setExtra({ product: '', quantity: '', name: '', price: '' })} className="text-sm text-orange-600 font-semibold hover:underline">
                  ✏️ Something else (type an amount)
                </button>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                  <select value={extra.product} onChange={(e) => setExtra({ ...extra, product: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm">
                    <option value="">— Product from your stock —</option>
                    {products.map(p => <option key={p.key} value={p.key}>{p.productName} — {formatQty(p.available, p.unit)} left · {p.farms.join(', ')}</option>)}
                  </select>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input type="number" step="any" min="0" value={extra.quantity} onChange={(e) => setExtra({ ...extra, quantity: e.target.value })}
                      placeholder="Amount used" className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <span className="text-sm text-gray-500">{products.find(p => p.key === extra.product)?.unit || ''}</span>
                    <input value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value })} maxLength={60}
                      placeholder="Name on the bill (optional)" className="flex-1 min-w-[8rem] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    <input type="number" step="0.01" min="0" value={extra.price} onChange={(e) => setExtra({ ...extra, price: e.target.value })}
                      placeholder="£ price" className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={addExtra} className="text-sm bg-gray-800 text-white px-3 py-1.5 rounded-lg">Add to bill</button>
                    <button type="button" onClick={() => setExtra(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* The bill */}
            {allLines.length > 0 && (
              <div className="border-2 border-orange-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-700 mb-2">🧾 Bill</p>
                {allLines.map(l => (
                  <div key={l.key} className="flex justify-between text-sm py-0.5">
                    <span>
                      {l.servings !== 1 ? `${l.servings} × ` : ''}{l.name}
                      {l.key.startsWith('x') && <button type="button" onClick={() => setExtras(extras.filter(x => x.key !== l.key))} className="text-xs text-red-500 ml-2">✕</button>}
                    </span>
                    <span>{l.total !== null ? gbp(l.total) : '—'}</span>
                  </div>
                ))}
                <div className="flex gap-2 items-center mt-3 text-sm flex-wrap">
                  <span className="text-gray-600">Discount</span>
                  <select value={discType} onChange={(e) => setDiscType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded bg-white">
                    <option value="amount">£</option>
                    <option value="percent">%</option>
                  </select>
                  <input type="number" step="0.01" min="0" value={discValue} onChange={(e) => setDiscValue(e.target.value)} placeholder="0"
                    className="w-20 px-2 py-1 border border-gray-300 rounded" />
                  {discount > 0 && <span className="text-gray-500">−{gbp(discount)}</span>}
                </div>
                <div className="flex justify-between items-center mt-3 border-t pt-2">
                  <span className="font-bold text-gray-800">Total</span>
                  {ownTotal === null ? (
                    <span className="font-bold text-lg">{total !== null ? gbp(total) : <span className="text-sm font-normal text-gray-400">no prices — type one</span>}
                      <button type="button" onClick={() => setOwnTotal(total !== null ? String(total) : '')} className="text-xs text-blue-600 font-normal ml-2 hover:underline">change</button>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">£
                      <input type="number" step="0.01" min="0" value={ownTotal} onChange={(e) => setOwnTotal(e.target.value)} className="w-24 px-2 py-1 border border-gray-300 rounded" />
                      <button type="button" onClick={() => setOwnTotal(null)} className="text-xs text-gray-500 hover:underline">auto</button>
                    </span>
                  )}
                </div>
              </div>
            )}

            {submitErr && (
              <div className="bg-red-50 border border-red-300 rounded-lg p-3">
                <p className="text-red-600 text-sm font-semibold">⚠️ {submitErr}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || emailVerified === false || !approved || !allLines.length}
              className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting               ? '⏳ Creating receipt…'
               : emailVerified === false ? '🔒 Verify your email to create receipts'
               : !approved               ? '🔒 Waiting for approval'
               :                           '🧾 Generate Receipt QR'}
            </button>
            <p className="text-xs text-gray-400 -mt-3">
              Ingredients come off your deliveries, soonest use-by first, in one blockchain transaction — receipts can never add up to more than you received.
            </p>
          </form>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-lg p-6">
        <button type="button" onClick={() => setShowDishes(!showDishes)}
          className="w-full flex justify-between items-center text-left">
          <span className="text-lg font-bold text-gray-800">🍲 Your dishes <span className="text-sm font-normal text-gray-500">({dishes.length})</span></span>
          <span className="text-sm text-orange-600 font-semibold">{showDishes ? 'Hide' : 'Manage'}</span>
        </button>
        {showDishes && <DishManager dishes={dishes} authHeader={authHeader} onChanged={fetchDishes} />}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
        <h3 className="text-sm font-bold text-blue-800 mb-2">💡 How this works</h3>
        <p className="text-blue-700 text-sm">
          Tap the dishes on the customer's bill. The total adds itself up (add a discount, or type a different total if you need to).
          Print the QR code on their receipt — when they scan it, they see where their food came from and collect a badge for each farm.
        </p>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────
// Order Stock — products from farms (the farm sends the soonest use-by first),
// and short-date deals. The farm accepts by dispatching it (recorded on-chain).
// ─────────────────────────────────────────────────────────
function OrderStock({ authHeader, approved }) {
  const [products, setProducts] = useState([]);
  const [deals,    setDeals]    = useState([]);
  const [orders,   setOrders]   = useState([]);
  const [pick,     setPick]     = useState('');       // product key, or "deal:<batchId>"
  const [quantity, setQuantity] = useState('');
  const [until,    setUntil]    = useState('');
  const [note,     setNote]     = useState('');
  const [po,       setPo]       = useState('');       // the café's own PO number (v4.3)
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);
  const [message,  setMessage]  = useState(null);

  const load = async () => {
    try {
      const [c, o] = await Promise.all([
        axios.get(`${API_BASE}/restaurant/catalog`, authHeader),
        axios.get(`${API_BASE}/restaurant/orders`, authHeader),
      ]);
      setProducts(c.data.products || []);
      setDeals(c.data.deals || []);
      setOrders(o.data.orders || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load products');
    }
  };
  useEffect(() => { load(); }, []);

  const deal = pick.startsWith('deal:') ? deals.find(d => `deal:${d.batchId}` === pick) : null;
  const product = !deal ? products.find(p => p.key === pick) : null;
  const max = deal ? deal.remaining : product?.available;
  const unit = deal?.unit || product?.unit || '';
  const price = deal ? deal.dealPrice : product?.pricePerUnit;
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // What can be ordered, and why not more (stock held for other cafés' open orders)
  const heldNote = product?.reserved > 0 ? ` · ${formatQty(product.reserved, unit)} held for other orders` : '';
  const tooMuch = Number(quantity) > 0 && max !== undefined && Number(quantity) > max;

  const submit = async (e) => {
    e.preventDefault();
    if (tooMuch) { setError(`Only ${formatQty(max, unit)} available${heldNote ? ` (${heldNote.slice(3)})` : ''}`); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const body = deal
        ? { dealBatchId: deal.batchId, quantity, note, poNumber: po || undefined }
        : { farmerAddress: product.farmerAddress, productName: product.productName, unit: product.unit, quantity, neededUntil: until || undefined, note, poNumber: po || undefined };
      await axios.post(`${API_BASE}/restaurant/orders`, body, authHeader);
      setMessage(`Order sent to ${(deal || product)?.farmName || 'the farm'}. You'll see it in Deliveries once they dispatch it.`);
      setPick(''); setQuantity(''); setNote(''); setUntil(''); setPo('');
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not place the order');
    } finally {
      setBusy(false);
    }
  };

  const editPo = async (o) => {
    const v = window.prompt(`Your PO number for ${o.orderRef || 'this order'}:`, o.poNumber || '');
    if (v === null) return;
    try { await axios.put(`${API_BASE}/restaurant/orders/${o.id}/ref`, { poNumber: v.trim() }, authHeader); load(); }
    catch (err) { setError(err.response?.data?.error || 'Could not save the PO number'); }
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
    part_sent:  ['Part sent', 'bg-amber-200 text-amber-900'],
    closed_short: ['Part sent · closed', 'bg-gray-200 text-gray-700'],
    dispatched: ['On its way', 'bg-blue-100 text-blue-700'],
    delivered:  ['Delivered', 'bg-green-100 text-green-700'],
    declined:   ['Declined', 'bg-gray-100 text-gray-600'],
    cancelled:  ['Cancelled', 'bg-gray-100 text-gray-600'],
  };

  const [kind, setKind] = useState('produce');     // produce | meat
  useEffect(() => { load(); }, [kind]);
  // Fruit & veg orders on the produce tab, meat orders on the meat tab
  const shown = orders.filter(o => !!o.isMeat === (kind === 'meat'));

  return (
    <div className="space-y-6">
      <div className="flex bg-white rounded-lg shadow p-1 gap-1">
        {[['produce', '🥕 Fruit, veg & more'], ['meat', '🥩 Meat']].map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)}
            className={`flex-1 py-2 rounded-md font-semibold text-sm ${kind === k ? 'bg-orange-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</button>
        ))}
      </div>

      {kind === 'meat' && <MeatOrder authHeader={authHeader} approved={approved} onOrdered={load} />}

      {kind === 'produce' && deals.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-5">
          <h3 className="text-lg font-bold text-amber-900 mb-1">🏷️ Short-date deals</h3>
          <p className="text-xs text-amber-800 mb-3">Reduced by the farm because the use-by is close — great for today's specials.</p>
          <div className="space-y-2">
            {deals.map(d => (
              <button key={d.batchId} type="button" onClick={() => { setPick(`deal:${d.batchId}`); setQuantity(String(d.remaining)); }}
                className={`w-full text-left bg-white border rounded-lg p-3 flex justify-between gap-2 flex-wrap ${pick === `deal:${d.batchId}` ? 'border-amber-500 ring-2 ring-amber-300' : 'border-amber-200'}`}>
                <span><strong>{d.productName}</strong> — {d.farmName} · {formatQty(d.remaining, d.unit)} · use by {d.useBy ? day(d.useBy) : '—'}</span>
                <span>{d.normalPrice !== null && <span className="line-through text-gray-400 mr-1">{gbp(d.normalPrice)}</span>}<strong className="text-amber-800">{gbp(d.dealPrice)}/{d.unit}</strong></span>
              </button>
            ))}
          </div>
        </div>
      )}

      {kind === 'produce' && <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🛒 Order from a farm</h3>
        <p className="text-sm text-gray-500 mb-5">Choose a product — the farm sends the stock with the soonest use-by first. Payment is arranged directly with the farm for now.</p>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Product</label>
            <select value={pick} onChange={(e) => { setPick(e.target.value); setQuantity(''); }} required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent">
              <option value="">— Choose a product —</option>
              {products.map(p => (
                <option key={p.key} value={p.key}>
                  {p.productName} — {p.farmName || 'Farm'} · {formatQty(p.available, p.unit)}
                  {p.priceFrom !== null ? ` · ${p.priceFrom === p.priceTo ? gbp(p.priceFrom) : `${gbp(p.priceFrom)}–${gbp(p.priceTo)}`}/${p.unit}` : ''}
                </option>
              ))}
              {deals.length > 0 && <optgroup label="🏷️ Short-date deals">
                {deals.map(d => <option key={d.batchId} value={`deal:${d.batchId}`}>{d.productName} — {d.farmName} · {formatQty(d.remaining, d.unit)} · {gbp(d.dealPrice)}/{d.unit} (use by {d.useBy ? day(d.useBy) : '—'})</option>)}
              </optgroup>}
            </select>
            {product && (
              <p className="text-xs text-gray-500 mt-1">
                Use-by {product.useByFrom ? `from ${day(product.useByFrom)}` : 'not set'}{product.useByTo && product.useByTo !== product.useByFrom ? ` to ${day(product.useByTo)}` : ''} · {product.batches} batch{product.batches === 1 ? '' : 'es'}
              </p>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
              <div className="relative">
                <input type="number" step="any" min="0.001"
                  value={quantity} onChange={(e) => setQuantity(e.target.value)} required placeholder="e.g. 10"
                  className={`w-full pl-4 pr-16 py-3 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent ${tooMuch ? 'border-red-500' : 'border-gray-300'}`} />
                {unit && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">{unit}</span>}
              </div>
              {max !== undefined && (
                <p className={`text-xs mt-1 ${tooMuch ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                  {tooMuch ? `Only ${formatQty(max, unit)} available` : `${formatQty(max, unit)} available`}{heldNote}
                </p>
              )}
            </div>
            {!deal && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Needs to last until <span className="font-normal text-gray-400">(optional)</span></label>
                <input type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
            )}
          </div>
          {(product || deal) && (
            <p className="text-sm text-gray-600">
              {price !== null && price !== undefined ? (
                <>
                  about {gbp(price)} per {unit}
                  {Number(quantity) > 0 && <> · estimated <strong>{gbp(Number(quantity) * price)}</strong></>}
                  <span className="block text-xs text-gray-400">The farm confirms the final price and any delivery charge when it dispatches.</span>
                </>
              ) : (
                <span className="text-gray-400">No price listed — the farm will confirm the price when it dispatches.</span>
              )}
            </p>
          )}
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Note to the farm <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={280}
                placeholder="e.g. Delivery Tuesday morning please"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Your PO number <span className="font-normal text-gray-400">(optional)</span></label>
              <input type="text" value={po} onChange={(e) => setPo(e.target.value)} maxLength={40} placeholder="e.g. PO-4521"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent" />
            </div>
          </div>
          {error && <p className="text-sm text-red-600 font-semibold">⚠️ {error}</p>}
          {message && <p className="text-sm text-green-700 font-semibold">✅ {message}</p>}
          <button type="submit" disabled={busy || !approved}
            className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-orange-700 transition disabled:bg-gray-400 disabled:cursor-not-allowed">
            {busy ? '⏳ Sending…' : !approved ? '🔒 Waiting for approval' : '🛒 Send order'}
          </button>
        </form>
      </div>}

      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-4">📋 Your {kind === 'meat' ? 'meat' : 'fruit, veg & more'} orders</h3>
        {shown.length === 0 ? (
          <p className="text-sm text-gray-500">No {kind === 'meat' ? 'meat ' : ''}orders yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {shown.map(o => (
              <div key={o.id} className="py-3 flex justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800">{o.isMeat ? '🥩 ' : ''}{formatQty(o.status === 'part_sent' ? o.quantity : (o.quantitySent ?? o.quantity), o.unit)} {o.productName} — {o.farmName}{o.isDeal ? ' 🏷️' : ''}
                    {o.frozen && <span className="ml-1 text-xs font-semibold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">❄️ frozen</span>}</p>
                  <p className="text-xs"><Refs x={o} /> {!['declined', 'cancelled'].includes(o.status) && <button onClick={() => editPo(o)} className="text-blue-600 hover:underline ml-1">{o.poNumber ? 'change PO' : '+ add your PO number'}</button>}</p>
                  {o.isMeat && o.status === 'requested' && <p className="text-xs text-gray-600">{o.preOrder ? '📋 Pre-order: sent once your cuts are ready' : '🔪 Ready: the farm or its abattoir sends it to you'}</p>}
                  {o.isMeat && o.sentByName && o.sentBy !== o.farmerAddress && <p className="text-xs text-gray-600">🔪 Sent by {o.sentByName}</p>}
                  {o.status === 'part_sent' && <p className="text-xs text-amber-800 font-semibold">{formatQty(o.quantitySent, o.unit)} of {formatQty(o.quantity, o.unit)} sent so far · {formatQty(o.outstanding, o.unit)} still to come</p>}
                  {o.status === 'closed_short' && (
                    <div className="mt-1 bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-amber-900">
                      <p>You asked for {formatQty(o.quantity, o.unit)}; {formatQty(o.quantitySent || 0, o.unit)} was sent. The rest isn't coming.</p>
                      {o.farmerNote && <p className="font-semibold">💬 {o.farmerNote === 'The café cancelled the rest of this order' ? 'You cancelled the rest' : `${o.isMeat && o.sentByName ? o.sentByName : o.farmName}: "${o.farmerNote}"`}</p>}
                    </div>
                  )}
                  {o.quantitySent != null && o.quantitySent !== o.quantity && !['part_sent', 'closed_short'].includes(o.status) && <p className="text-xs text-amber-700">You asked for {formatQty(o.quantity, o.unit)} — the farm sent {formatQty(o.quantitySent, o.unit)}</p>}
                  <p className="text-xs text-gray-500">
                    {new Date(o.createdAt).toLocaleDateString('en-GB')}{o.neededUntil ? ` · needs to last until ${day(o.neededUntil)}` : ''}{o.note ? ` · "${o.note}"` : ''}
                  </p>
                  {o.dispatches?.length > 1 && (
                    <p className="text-xs text-gray-600">Coming as {o.dispatches.length} deliveries: {o.dispatches.map(d => `${formatQty(d.quantity, o.unit)} (use by ${d.useBy ? day(d.useBy) : '—'})`).join(' + ')}</p>
                  )}
                  {o.farmerNote && o.status !== 'closed_short' && <p className="text-xs text-gray-600 italic">{o.isMeat && o.sentByName ? o.sentByName : 'Farm'}: "{o.farmerNote}"</p>}
                  {o.total != null && (
                    <p className="text-xs text-gray-700">
                      💷 {o.unitPrice != null && <>{gbp(o.unitPrice)}/{o.unit}</>}
                      {o.deliveryFee ? <> + {gbp(o.deliveryFee)} delivery</> : null}
                      {' '}= <strong>{gbp(o.total)}</strong>{o.totalIsEstimate ? ' (estimate)' : ''}
                    </p>
                  )}
                  <OwedLine o={o} />
                  {(o.dispatches || []).filter(d => d.missing > 0).map(d => (
                    <p key={d.shipmentId} className="text-xs text-amber-800">⚠️ {formatQty(d.missing, o.unit)} didn't arrive (delivery #{d.shipmentId}): {d.missingResolution === 'waived' ? 'not charged' : d.missingResolution === 'charged' ? 'charged, as agreed with the farm' : 'the farm will decide with you whether it’s charged'}</p>
                  ))}
                  <TermsCheck order={o} token={(authHeader?.headers?.Authorization || '').replace('Bearer ', '')} />
                </div>
                <div className="text-right space-y-1 shrink-0">
                  {(() => {
                    const st = o.status === 'dispatched' && o.shipmentStatus === 'delivered' ? 'delivered' : o.status;   // part_sent / closed_short keep their own label
                    return (
                      <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS[st]?.[1] || ''}`}>
                        {o.isMeat && st === 'requested' ? (o.preOrder ? 'Pre-ordered' : 'Being packed') : (STATUS[st]?.[0] || st)}
                      </span>
                    );
                  })()}
                  {['dispatched', 'part_sent', 'closed_short'].includes(o.status) && (
                    <p className="text-xs text-gray-500">{o.paymentStatus === 'paid' ? '💷 Paid' : 'Payment due'}</p>
                  )}
                  {o.status === 'part_sent' && (
                    <button onClick={() => window.confirm(`Cancel the ${formatQty(o.outstanding, o.unit)} still to come? What's already been sent stays.`) && cancelOrder(o)}
                      className="block text-xs text-red-600 hover:underline ml-auto">Cancel the rest</button>
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
// Meat: choose a farm → the animal (Beef, Lamb…) → its cuts. Cuts already made at the abattoir can be
// ordered now; cuts on the farm's list can be pre-ordered from its next animal. The abattoir sends them.
// ─────────────────────────────────────────────────────────
function MeatOrder({ authHeader, approved, onOrdered }) {
  const [farms,   setFarms]   = useState(null);
  const [farmAddr, setFarmAddr] = useState(null);
  const [species, setSpecies] = useState(null);
  const [qty,     setQty]     = useState({});       // `${farm}|${species}|${cut}` → kg typed
  const [frozen,  setFrozen]  = useState({});       // same key → wanted frozen
  const [po,      setPo]      = useState('');       // the café's PO number for this order
  const [until,   setUntil]   = useState('');
  const [note,    setNote]    = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [message, setMessage] = useState(null);
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  const load = async () => {
    try {
      const r = await axios.get(`${API_BASE}/restaurant/meat`, authHeader);
      setFarms(r.data.farms || []);
    } catch (err) { setError(err.response?.data?.error || 'Could not load meat'); setFarms([]); }
  };
  useEffect(() => { load(); }, []);
  if (!farms) return <div className="bg-white rounded-lg shadow-lg p-8 text-gray-500">⏳ Loading meat…</div>;

  const farm = farms.find(f => f.farmerAddress === farmAddr) || null;
  const sp = farm ? (farm.species.find(x => x.species === species) || farm.species[0]) : null;
  const keyOf = (f, s, c) => `${f.farmerAddress}|${s.species}|${c.productName}`;
  // Everything with a quantity, across farms
  const basket = farms.flatMap(f => f.species.flatMap(s => s.cuts.map(c => ({ f, s, c, k: keyOf(f, s, c), q: Number(qty[keyOf(f, s, c)]) }))))
    .filter(x => x.q > 0);
  const status = (c, q) => (q > 0 && q <= c.inStock ? 'ready' : q > 0 && c.preOrder ? 'pre' : q > 0 ? 'short' : null);
  const problems = basket.filter(x => status(x.c, x.q) === 'short');
  const priced = basket.filter(x => x.c.pricePerKg !== null);
  const total = priced.reduce((n, x) => n + x.q * x.c.pricePerKg, 0);

  const place = async () => {
    setBusy(true); setError(null); setMessage(null);
    const ok = [];
    try {
      for (const x of basket) {
        await axios.post(`${API_BASE}/restaurant/orders`, {
          meat: true, farmerAddress: x.f.farmerAddress, species: x.s.species, productName: x.c.productName, quantity: x.q,
          neededUntil: until || undefined, note: note.trim() || undefined, frozen: !!frozen[x.k] || undefined, poNumber: po.trim() || undefined
        }, authHeader);
        ok.push(x);
      }
      setMessage(`${ok.length} order${ok.length === 1 ? '' : 's'} placed. ${ok.some(x => status(x.c, x.q) === 'pre') ? 'Pre-orders are sent once the cuts are ready.' : 'The abattoir will send them.'}`);
      setQty({}); setFrozen({}); setNote(''); setUntil(''); setPo('');
    } catch (err) {
      setError(`${ok.length ? `${ok.length} placed, then ` : ''}${basket[ok.length]?.c.productName}: ${err.response?.data?.error || 'could not order'}`);
      setQty(Object.fromEntries(basket.slice(ok.length).map(x => [x.k, String(x.q)])));
    } finally {
      setBusy(false);
      load(); onOrdered?.();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🥩 Order meat from a farm</h3>
        <p className="text-sm text-gray-500 mb-4">Pick a farm and the animal, then the cuts. Ready cuts are sent by the farm or the abattoir holding them; others can be pre-ordered from the farm's next animal.</p>
        {farms.length === 0 && <p className="text-sm text-gray-500">No farms are selling meat yet.</p>}

        {/* 1. Farm */}
        <div className="grid sm:grid-cols-2 gap-2">
          {farms.map(f => {
            const ready = f.species.reduce((n, s) => n + s.cuts.filter(c => c.inStock > 0).length, 0);
            const inBasket = basket.filter(x => x.f.farmerAddress === f.farmerAddress).length;
            return (
              <button key={f.farmerAddress} onClick={() => { setFarmAddr(f.farmerAddress); setSpecies(f.species[0]?.species); }}
                className={`text-left border-2 rounded-lg p-3 ${farmAddr === f.farmerAddress ? 'border-orange-500 bg-orange-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-bold text-gray-800">{f.farmName || 'Farm'} {inBasket > 0 && <span className="text-xs bg-orange-600 text-white rounded-full px-2 py-0.5 ml-1">{inBasket} in order</span>}</p>
                <p className="text-xs text-gray-600">{f.species.map(s => s.label).join(' · ')}</p>
                <p className="text-xs text-green-700 font-semibold">{ready ? `${ready} cut${ready === 1 ? '' : 's'} ready now` : 'Pre-order only right now'}</p>
              </button>
            );
          })}
        </div>

        {/* 2. Animal, 3. Cuts */}
        {farm && sp && (
          <div className="mt-5">
            <div className="flex gap-1 border-b border-gray-200 mb-3">
              {farm.species.map(s => (
                <button key={s.species} onClick={() => setSpecies(s.species)}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg ${sp.species === s.species ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                  {s.label} <span className="font-normal opacity-75">({s.cuts.length})</span>
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sp.cuts.map(c => {
                const k = keyOf(farm, sp, c);
                const q = Number(qty[k]);
                const st = status(c, q);
                const unavailable = c.inStock <= 0 && !c.preOrder;
                return (
                  <div key={k} className={`border rounded-lg p-3 flex flex-col ${q > 0 ? (st === 'short' ? 'border-red-400 bg-red-50' : 'border-orange-500 bg-orange-50') : 'border-gray-200'} ${unavailable ? 'opacity-50' : ''}`}>
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold text-gray-800">{c.productName}</p>
                      <p className="text-sm font-semibold text-gray-700 shrink-0">{c.pricePerKg !== null ? `${gbp(c.pricePerKg)}/kg` : <span className="text-xs text-gray-400 font-normal">price on request</span>}</p>
                    </div>
                    <p className="text-xs mt-0.5">
                      {c.inStock > 0
                        ? <span className="text-green-700 font-semibold">✅ {formatQty(c.inStock, 'kg')} ready{c.useByFrom ? ` · use by ${day(c.useByFrom)}` : ''}
                            <span className="block font-normal text-gray-500">
                              {[c.atFarm > 0 && `${formatQty(c.atFarm, 'kg')} at the farm`, c.atAbattoir > 0 && `${formatQty(c.atAbattoir, 'kg')} at ${c.abattoirs?.join(', ') || 'the abattoir'}`].filter(Boolean).join(' · ')}
                            </span></span>
                        : c.preOrder ? <span className="text-amber-700 font-semibold">📋 Pre-order from the next {sp.label.toLowerCase()}</span>
                        : <span className="text-gray-500">Not available right now</span>}
                    </p>
                    {c.reserved > 0 && <p className="text-xs text-gray-500">🔒 {formatQty(c.reserved, 'kg')}{c.inStock > 0 ? ' more' : ''} already held for other cafés' orders</p>}
                    {c.avgPieceKg && <p className="text-xs text-gray-600">≈ {Math.round(c.avgPieceKg * 1000)} g per piece</p>}
                    {c.note && <p className="text-xs text-gray-500 italic">{c.note}</p>}
                    {c.allergens?.length > 0 && <p className="text-xs text-amber-800">⚠️ Contains: {c.allergens.join(', ')}</p>}
                    <div className="mt-auto pt-2 flex items-center gap-1">
                      <button type="button" disabled={unavailable || !(q > 0)} onClick={() => setQty({ ...qty, [k]: String(Math.max(0, Math.round(((q || 0) - 1) * 1000) / 1000) || '') })}
                        className="w-8 h-8 rounded border border-gray-300 bg-white disabled:opacity-40" aria-label="Less">−</button>
                      <input type="number" step="any" min="0" value={qty[k] ?? ''} disabled={unavailable} onChange={(e) => setQty({ ...qty, [k]: e.target.value })}
                        placeholder="0" className="w-20 px-2 py-1 border border-gray-300 rounded text-center" aria-label={`${c.productName} kg`} />
                      <button type="button" disabled={unavailable} onClick={() => setQty({ ...qty, [k]: String(Math.round(((q || 0) + 1) * 1000) / 1000) })}
                        className="w-8 h-8 rounded border border-gray-300 bg-white disabled:opacity-40" aria-label="More">+</button>
                      <span className="text-sm text-gray-500">kg</span>
                    </div>
                    {st === 'pre' && c.inStock > 0 && <p className="text-xs text-amber-700 mt-1">Only {formatQty(c.inStock, 'kg')} ready, so this becomes a pre-order.</p>}
                    {st === 'short' && <p className="text-xs text-red-700 mt-1">Only {formatQty(c.inStock, 'kg')} ready, and the farm doesn't take pre-orders for this.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(basket.length > 0 || message || error) && (
        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-orange-500 sticky bottom-2">
          {basket.length > 0 && (
            <>
              <p className="font-bold text-gray-800 mb-2">🧺 Your meat order</p>
              <div className="divide-y divide-gray-100 text-sm mb-3">
                {basket.map(x => (
                  <div key={x.k} className="py-1.5 flex justify-between gap-2">
                    <span>{formatQty(x.q, 'kg')} {x.c.productName} <span className="text-gray-500">· {x.f.farmName}</span>{' '}
                      <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${status(x.c, x.q) === 'ready' ? 'bg-green-100 text-green-800' : status(x.c, x.q) === 'pre' ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>
                        {status(x.c, x.q) === 'ready' ? 'ready' : status(x.c, x.q) === 'pre' ? 'pre-order' : 'not enough'}</span></span>
                    <span className="text-gray-700 shrink-0 flex items-center gap-2">
                      <label className="text-xs text-sky-800 flex items-center gap-1 cursor-pointer" title="Ask for it to be sent frozen">
                        <input type="checkbox" checked={!!frozen[x.k]} onChange={(e) => setFrozen({ ...frozen, [x.k]: e.target.checked })} />❄️ frozen</label>
                      {x.c.pricePerKg !== null ? gbp(x.q * x.c.pricePerKg) : '—'}
                      <button onClick={() => setQty({ ...qty, [x.k]: '' })} className="text-xs text-red-600" aria-label="Remove">✕</button></span>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-2 gap-3 mb-3">
                <label className="text-xs font-semibold text-gray-700">Needed by <span className="font-normal text-gray-400">(optional)</span>
                  <input type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-normal" />
                </label>
                <label className="text-xs font-semibold text-gray-700">Note <span className="font-normal text-gray-400">(optional)</span>
                  <input value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="e.g. steaks cut 2 cm thick" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-normal" />
                </label>
                <label className="text-xs font-semibold text-gray-700">Your PO number <span className="font-normal text-gray-400">(optional)</span>
                  <input value={po} maxLength={40} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO-4521" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-normal" />
                </label>
              </div>
              {basket.some(x => frozen[x.k]) && <p className="text-xs text-sky-800 mb-2">❄️ Frozen items come with the date they were frozen. Keep them at −18°C or colder; once defrosted, use within 24 hours and don't refreeze.</p>}
              <p className="text-sm text-gray-700 mb-2">{priced.length ? <>Estimated <strong>{gbp(total)}</strong>{priced.length < basket.length ? ' + items priced on request' : ''}</> : 'Prices on request'} <span className="text-xs text-gray-400">· final weights and prices are confirmed when it's sent</span></p>
            </>
          )}
          {error && <p className="text-sm text-red-600 font-semibold mb-2">⚠️ {error}</p>}
          {message && <p className="text-sm text-green-700 font-semibold mb-2">✅ {message}</p>}
          {basket.length > 0 && (
            <button onClick={place} disabled={busy || !approved || problems.length > 0}
              className="w-full bg-orange-600 text-white py-3 rounded-lg font-bold hover:bg-orange-700 disabled:bg-gray-400">
              {busy ? '⏳ Ordering…' : !approved ? '🔒 Waiting for approval' : problems.length ? `Fix ${problems.length} item${problems.length === 1 ? '' : 's'} first` : `🛒 Place ${basket.length} order${basket.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Your dishes: menu price + recipe (what goes into one serving).
// Ingredients are matched to your stock by product name, from any farm, soonest use-by first.
// ─────────────────────────────────────────────────────────
function DishManager({ dishes, authHeader, onChanged }) {
  const blank = { id: null, name: '', price: '', ingredients: [{ product: '', portion: '' }] };
  const [form,     setForm]     = useState(null);    // the dish being added / edited
  const [products, setProducts] = useState([]);
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE}/restaurant/products`, authHeader).then(r => setProducts(r.data.products || [])).catch(() => {});
  }, []);
  const keyOf = (p) => `${p.productName.toLowerCase()}|${p.unit}`;

  const edit = (d) => setForm({
    id: d.id, name: d.name, price: d.price ?? '',
    ingredients: d.ingredients?.length ? d.ingredients.map(i => ({ product: keyOf(i), portion: String(i.portion), productName: i.productName, unit: i.unit })) : [{ product: '', portion: '' }]
  });
  const setIng = (i, k, v) => setForm({ ...form, ingredients: form.ingredients.map((x, j) => (j === i ? { ...x, [k]: v } : x)) });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const ingredients = form.ingredients.filter(i => i.product).map(i => {
        const p = products.find(x => keyOf(x) === i.product) || { productName: i.productName, unit: i.unit };
        return { productName: p.productName, unit: p.unit, portion: Number(i.portion) };
      });
      await axios.post(`${API_BASE}/restaurant/dishes`, { id: form.id || undefined, name: form.name, price: form.price === '' ? null : Number(form.price), ingredients }, authHeader);
      setForm(null);
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save the dish');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`Remove "${d.name}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/restaurant/dishes/${d.id}`, authHeader);
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not remove the dish');
    }
  };

  // Products in the recipe list: what you've received, plus anything already in a recipe
  const options = [...products];
  (form?.ingredients || []).forEach(i => { if (i.product && !options.some(p => keyOf(p) === i.product) && i.productName) options.push({ productName: i.productName, unit: i.unit, inStock: 0, farms: [] }); });

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-500 mb-3">
        A dish has a menu price and a recipe — roughly how much of each product goes into one serving. Then a receipt is just "2 × Pheasant pie".
      </p>
      {dishes.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">No dishes saved yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 mb-4">
          {dishes.map(d => (
            <li key={d.id} className="py-2 flex justify-between items-start gap-3">
              <div className="text-sm min-w-0">
                <p className="text-gray-800"><strong>{d.name}</strong>{d.price !== null ? ` — ${gbp(d.price)}` : ''}</p>
                {d.ingredients?.length ? (
                  <p className="text-xs text-gray-500">{d.ingredients.map(i => `${formatQty(i.portion, i.unit)} ${i.productName}`).join(' + ')}{d.canMake !== null ? ` · ${d.canMake} can be made from today's stock` : ''}</p>
                ) : (
                  <p className="text-xs text-amber-700">⚠️ No recipe yet{d.portion ? ` (old dish: ${formatQty(d.portion, d.unit)})` : ''} — edit it to add ingredients</p>
                )}
              </div>
              <div className="flex gap-3 shrink-0">
                <button type="button" onClick={() => edit(d)} className="text-xs text-blue-600 hover:underline">Edit</button>
                <button type="button" onClick={() => remove(d)} className="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!form ? (
        <button type="button" onClick={() => setForm(blank)} className="bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-700">+ Add a dish</button>
      ) : (
        <form onSubmit={save} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <input type="text" required maxLength={60} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Dish name, e.g. Pheasant pie" className="flex-1 min-w-[10rem] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            <div className="flex items-center gap-1 text-sm">£
              <input type="number" step="0.01" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                placeholder="Menu price" className="w-28 px-3 py-2 border border-gray-300 rounded-lg" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-700 mb-1">Recipe — per serving</p>
            {form.ingredients.map((ing, i) => {
              const p = options.find(x => keyOf(x) === ing.product);
              return (
                <div key={i} className="flex gap-2 items-center mb-1 flex-wrap">
                  <select value={ing.product} onChange={(e) => setIng(i, 'product', e.target.value)} className="flex-1 min-w-[10rem] px-2 py-1.5 border border-gray-300 rounded bg-white text-sm">
                    <option value="">— Product —</option>
                    {options.map(x => <option key={keyOf(x)} value={keyOf(x)}>{x.productName} ({x.unit}){x.inStock ? ` · ${formatQty(x.inStock, x.unit)} in stock` : ''}</option>)}
                  </select>
                  <input type="number" step="any" min="0" value={ing.portion} onChange={(e) => setIng(i, 'portion', e.target.value)}
                    placeholder="0.2" className="w-24 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <span className="text-xs text-gray-500 w-10">{p?.unit || ''}</span>
                  {form.ingredients.length > 1 && <button type="button" onClick={() => setForm({ ...form, ingredients: form.ingredients.filter((_, j) => j !== i) })} className="text-xs text-red-600">✕</button>}
                </div>
              );
            })}
            <button type="button" onClick={() => setForm({ ...form, ingredients: [...form.ingredients, { product: '', portion: '' }] })} className="text-xs text-blue-600 hover:underline">+ ingredient</button>
            {products.length === 0 && <p className="text-xs text-gray-400 mt-1">Products appear here once you've received a delivery.</p>}
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-orange-700 disabled:bg-gray-400">
              {busy ? 'Saving…' : 'Save dish'}
            </button>
            <button type="button" onClick={() => setForm(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
          </div>
        </form>
      )}
      {error && <p className="text-sm text-red-600 mt-2">⚠️ {error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Deliveries — shipments sent to this restaurant.
// Confirming what arrived is recorded on-chain as this restaurant.
// ─────────────────────────────────────────────────────────
// "5 of 10 kg ordered · 5 kg still to come", or why the rest isn't coming
function PartOrderLine({ s }) {
  const o = s.order;
  if (!o || !(o.partOrder || o.deliveries > 1 || o.closedNote)) return null;
  return (
    <div className="text-xs mt-0.5 space-y-0.5">
      <p className="text-amber-800 font-semibold">
        Order #{o.id}: {formatQty(o.sentSoFar, s.unit)} of {formatQty(o.ordered, s.unit)} sent so far{o.deliveries > 1 ? ` in ${o.deliveries} deliveries` : ''}
        {o.outstanding > 0 ? ` · ${formatQty(o.outstanding, s.unit)} still to come` : o.status === 'closed_short' ? ' · the rest isn’t coming' : ''}
      </p>
      {o.closedNote && <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">💬 {o.closedNote === 'The café cancelled the rest of this order' ? 'You cancelled the rest' : `"${o.closedNote}"`}</p>}
    </div>
  );
}

function Deliveries({ authHeader, approved, onReceived }) {
  const [shipments, setShipments] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [qty,       setQty]       = useState({});   // shipmentId → quantity received
  const [refused,   setRefused]   = useState({});   // shipmentId → quantity turned away at the door (typed by hand)
  const [goodsIn,   setGoodsIn]   = useState({});   // shipmentId → the café's own goods-in reference (v4.3)
  const [agree,     setAgree]     = useState({});   // shipmentId → agree to the farm's terms (default yes)
  const [notes,     setNotes]     = useState({});
  const [photos,    setPhotos]    = useState({});   // shipmentId → { file, preview } (proof of delivery)
  const [action,    setAction]    = useState(null); // { id, kind: 'return' | 'waste', qty, notes }
  const [busyId,    setBusyId]    = useState(null);
  const [error,     setError]     = useState(null);
  const token = (authHeader?.headers?.Authorization || '').replace('Bearer ', '');

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
    // The depot / courier hasn't logged "Out for delivery" — allowed (the goods are here), but double-check
    if (s.carrierName && !s.carrierSteps?.out &&
        !window.confirm(`${s.carrierName} hasn't marked this as out for delivery yet.\n\nHas it physically arrived with you? Confirm anyway?`)) {
      return;
    }
    // A photo is optional, but encouraged
    const photo = photos[s.shipmentId];
    if (!photo && !window.confirm('No delivery photo added.\n\nA photo helps settle any disagreement about what arrived. Confirm without one?')) {
      return;
    }
    setBusyId(s.shipmentId);
    setError(null);
    try {
      const form = new FormData();
      form.append('quantityReceived', String(acceptedOf(s)));
      form.append('quantityRejected', String(refusedOf(s)));
      if (goodsIn[s.shipmentId]) form.append('receiverRef', goodsIn[s.shipmentId]);
      form.append('acceptTerms', agree[s.shipmentId] === false ? 'false' : 'true');
      form.append('notes', notes[s.shipmentId] || '');
      if (photo) form.append('photo', photo.file, 'delivery.jpg');
      await axios.post(`${API_BASE}/restaurant/shipments/${s.shipmentId}/receive`, form, authHeader);
      const next = { ...photos }; delete next[s.shipmentId]; setPhotos(next);
      await load();
      onReceived?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not confirm the delivery');
    } finally {
      setBusyId(null);
    }
  };

  // v4.3: type what you accept and "Refused" fills in with the rest (you can still change it, e.g. if some went missing).
  // Type the refused amount first instead and "Accepted" fills in.
  const r3 = (n) => Math.round(n * 1000) / 1000;
  const typedRefused = (s) => refused[s.shipmentId] !== undefined && refused[s.shipmentId] !== null;
  const acceptedOf = (s) => qty[s.shipmentId] ?? Math.max(0, r3(s.quantitySent - (Number(refused[s.shipmentId]) || 0)));
  const refusedOf = (s) => (typedRefused(s) ? (Number(refused[s.shipmentId]) || 0)
    : qty[s.shipmentId] !== undefined ? Math.max(0, r3(s.quantitySent - (Number(qty[s.shipmentId]) || 0))) : 0);
  const missingOf = (s) => Math.max(0, r3(s.quantitySent - (Number(acceptedOf(s)) || 0) - refusedOf(s)));
  // What the café will pay: only what it accepts (plus delivery, unless it refuses the lot)
  const payOf = (s) => {
    if (!s.terms || s.terms.unitPrice === null || s.terms.unitPrice === undefined) return null;
    const a = Number(acceptedOf(s)) || 0;
    return Math.round((a * s.terms.unitPrice + (a > 0 ? Number(s.terms.deliveryFee || 0) : 0)) * 100) / 100;
  };

  // Send stock back, or write it off
  const doAction = async () => {
    const { id, kind } = action;
    if (!(Number(action.qty) > 0)) { setError('Enter a quantity'); return; }
    setBusyId(id);
    setError(null);
    try {
      await axios.post(`${API_BASE}/restaurant/shipments/${id}/${kind}`, { quantity: Number(action.qty), notes: action.notes || '' }, authHeader);
      setAction(null);
      await load();
      onReceived?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  const incoming = shipments.filter(s => s.status === 'in_transit' && s.kind !== 'return');
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
                <div className="flex justify-between items-start gap-2">
                  <p className="font-bold text-gray-800">{formatQty(s.quantitySent, s.unit)} {s.productName}
                    {s.order?.partOrder && <span className="font-normal text-gray-600"> of {formatQty(s.order.ordered, s.unit)} ordered</span>}</p>
                  <div className="flex gap-1 shrink-0">
                    {s.frozenOn && <span className="text-xs font-semibold bg-sky-100 text-sky-800 px-2 py-0.5 rounded-full">❄️ Frozen</span>}
                    {s.order?.partOrder && <span className="text-xs font-semibold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">Part order</span>}
                  </div>
                </div>
                <PartOrderLine s={s} />
                <Refs x={s} className="mt-1" />
                <p className="text-sm text-gray-600">from {s.fromName}{s.carrierName ? ` via ${s.carrierName}` : ''} · delivery #{s.shipmentId} <TxLink hash={s.sentTxHash} label="Sent" className="ml-1" /></p>
                {s.dispatchNotes && <p className="text-sm text-gray-600 italic">{s.fromName}: "{s.dispatchNotes}"</p>}
                {s.handlingSteps?.length > 0 && (
                  <div className="mt-2 bg-white border border-teal-200 rounded-lg p-2">
                    <p className="text-xs font-semibold text-teal-800 mb-1">📍 Updates on the way</p>
                    <ul className="space-y-1">
                      {s.handlingSteps.map((st, i) => (
                        <li key={i} className="text-xs text-gray-700">
                          <span className="text-gray-400">{shortWhen(st.recordedAt)}</span>{' '}
                          <strong>{st.recorderName || st.stage}</strong>{st.notes ? `: ${st.notes}` : ` — ${st.stage}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {s.recalled && (
                  <p className="text-xs text-red-700 bg-red-50 border border-red-300 rounded px-2 py-1 mt-2 font-semibold">
                    🚨 The farm has recalled this batch{s.recallReason ? `: ${s.recallReason}` : ''}. Refuse it at the door, or confirm and send it back.
                  </p>
                )}
                {s.carrierName && !s.carrierSteps?.out && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                    ⚠️ {s.carrierName} hasn't marked this as out for delivery yet. You can still confirm it if it has arrived.
                  </p>
                )}
                <div className="flex gap-2 mt-3 flex-wrap items-center">
                  <span className="text-sm text-gray-600 w-20">Accepted:</span>
                  <input type="number" step="any" min="0" max={s.quantitySent}
                    value={acceptedOf(s)}
                    onChange={(e) => setQty({ ...qty, [s.shipmentId]: e.target.value })}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-sm text-gray-500">{s.unit}</span>
                </div>
                <div className="flex gap-2 mt-2 flex-wrap items-center">
                  <span className="text-sm text-gray-600 w-20">Refused:</span>
                  <input type="number" step="any" min="0" max={s.quantitySent} placeholder="0"
                    value={typedRefused(s) ? refused[s.shipmentId] : (refusedOf(s) || '')}
                    onChange={(e) => setRefused({ ...refused, [s.shipmentId]: e.target.value === '' ? null : e.target.value })}
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <span className="text-xs text-gray-500">{s.unit} turned away at the door (goes back with the driver; {s.fromName} checks it in)</span>
                </div>
                {missingOf(s) > 0 && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-2">
                    ⚠️ That leaves <strong>{formatQty(missingOf(s), s.unit)}</strong> not accepted or refused: it'll be recorded as <strong>missing</strong> (didn't arrive). You won't be charged for it unless you agree it with {s.fromName}.
                  </p>
                )}
                {payOf(s) !== null && (
                  <p className="text-sm mt-2 text-gray-800">
                    💷 You'll pay <strong>{gbp(payOf(s))}</strong>
                    <span className="text-gray-500"> for {formatQty(Number(acceptedOf(s)) || 0, s.unit)}{Number(acceptedOf(s)) > 0 && s.terms.deliveryFee ? ` + ${gbp(s.terms.deliveryFee)} delivery` : ''}
                      {refusedOf(s) > 0 ? ` · ${formatQty(refusedOf(s), s.unit)} refused isn't charged` : ''}{Number(acceptedOf(s)) === 0 && s.terms.deliveryFee ? ' · no delivery charge when you refuse it all' : ''}</span>
                  </p>
                )}
                {s.terms && (
                  <label className="flex gap-2 items-start mt-3 bg-white border border-gray-200 rounded-lg p-2 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1"
                      checked={agree[s.shipmentId] !== false}
                      onChange={(e) => setAgree({ ...agree, [s.shipmentId]: e.target.checked })} />
                    <span>
                      I agree the price
                      {s.terms.unitPrice != null ? <> — <strong>{gbp(s.terms.unitPrice)}/{s.unit}</strong>{s.terms.deliveryFee ? <> + {gbp(s.terms.deliveryFee)} delivery</> : null}</>
                        : s.terms.total != null ? <> — {gbp(s.terms.total)}</> : null}
                      <span className="block text-xs text-gray-500">You only pay for what you accept. Your agreement is fingerprinted on the blockchain. Untick if the price isn't what you agreed: the farm will see it wasn't confirmed.</span>
                    </span>
                  </label>
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input type="text" maxLength={200} placeholder="Notes (optional), e.g. 2 crates damaged"
                    value={notes[s.shipmentId] || ''}
                    onChange={(e) => setNotes({ ...notes, [s.shipmentId]: e.target.value })}
                    className="flex-1 min-w-[12rem] px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                  <input type="text" maxLength={40} placeholder="Goods-in ref (optional)"
                    value={goodsIn[s.shipmentId] || ''}
                    onChange={(e) => setGoodsIn({ ...goodsIn, [s.shipmentId]: e.target.value })}
                    className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <PhotoPicker
                  photo={photos[s.shipmentId]}
                  onChange={(p) => setPhotos({ ...photos, [s.shipmentId]: p })}
                  disabled={busyId === s.shipmentId}
                />
                <button onClick={() => receive(s)} disabled={busyId === s.shipmentId || !approved}
                  className="mt-3 bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
                  {busyId === s.shipmentId ? (photos[s.shipmentId] ? '📷 Uploading & recording…' : '⛓️ Recording…') : '✅ Confirm received'}
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
                <div className="min-w-0">
                  <p className="font-semibold text-gray-800">{s.productName} — {s.fromName}{s.kind === 'return' ? ' (returned to you)' : ''}
                    {s.frozenOn && <span className="ml-1 text-xs font-semibold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">❄️ frozen {new Date(s.frozenOn).toLocaleDateString('en-GB')}</span>}
                    {s.order?.partOrder && <span className="ml-1 text-xs font-semibold bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">Part order</span>}</p>
                  <PartOrderLine s={s} />
                  <Refs x={s} />
                  <p className="text-xs text-gray-500">
                    #{s.shipmentId} · received {formatQty(s.quantityReceived, s.unit)} of {formatQty(s.quantitySent, s.unit)} <TxLink hash={s.receivedTxHash} label="Received" className="ml-1" />
                    {s.quantityRejected > 0 && <> · ↩️ {formatQty(s.quantityRejected, s.unit)} refused</>}
                    {s.shortfall > 0 && <span className="text-orange-600 font-semibold"> · ⚠️ {formatQty(s.shortfall, s.unit)} missing</span>}
                    {s.wasted > 0 && <> · 🗑️ {formatQty(s.wasted, s.unit)} written off</>}
                  </p>
                  {s.useBy && (
                    <p className={`text-xs ${new Date(s.useBy) < new Date() ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                      Use by {new Date(s.useBy).toLocaleDateString('en-GB')}{new Date(s.useBy) < new Date() ? ' — passed' : ''}
                    </p>
                  )}
                  {s.recalled && (
                    <p className="text-xs text-red-700 font-semibold">🚨 Recalled{s.recallReason ? `: ${s.recallReason}` : ''} — don't use it. Send it back or write it off.</p>
                  )}
                  {s.deliveryNotes && <p className="text-xs text-gray-600 italic">Your note: "{s.deliveryNotes}"</p>}
                  {s.hasDeliveryPhoto && <DeliveryPhotoButton shipmentId={s.shipmentId} token={token} />}
                  {s.available > 0 && action?.id !== s.shipmentId && approved && (
                    <div className="flex gap-3 mt-1">
                      <button onClick={() => setAction({ id: s.shipmentId, kind: 'return', qty: String(s.available), notes: '' })} className="text-xs text-gray-700 hover:underline">↩️ Send back</button>
                      <button onClick={() => setAction({ id: s.shipmentId, kind: 'waste', qty: '', notes: '' })} className="text-xs text-gray-700 hover:underline">🗑️ Write off</button>
                    </div>
                  )}
                  {action?.id === s.shipmentId && (
                    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2 space-y-2">
                      <p className="text-xs font-semibold text-gray-700">{action.kind === 'return' ? `Send back to ${s.fromName}` : 'Write off (gone off, damaged, binned)'}</p>
                      <div className="flex gap-2 items-center flex-wrap">
                        <input type="number" step="any" min="0" max={s.available} value={action.qty}
                          onChange={(e) => setAction({ ...action, qty: e.target.value })}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm" />
                        <span className="text-xs text-gray-500">{s.unit}</span>
                        <input type="text" maxLength={200} placeholder="Reason (optional)" value={action.notes}
                          onChange={(e) => setAction({ ...action, notes: e.target.value })}
                          className="flex-1 min-w-[8rem] px-2 py-1 border border-gray-300 rounded text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={doAction} disabled={busyId === s.shipmentId}
                          className="text-xs bg-gray-800 text-white px-3 py-1.5 rounded hover:bg-gray-900 disabled:bg-gray-400">
                          {busyId === s.shipmentId ? '⛓️ Recording…' : 'Record on-chain'}
                        </button>
                        <button onClick={() => setAction(null)} className="text-xs text-gray-600 hover:underline">Cancel</button>
                      </div>
                    </div>
                  )}
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
              <p className="font-bold text-gray-800">{r.dishName || r.productName || 'Product'}</p>
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
              <QRCodeSVG value={receiptLink(r.receiptId)} size={200} includeMargin={true} bgColor="#ffffff" fgColor="#1f2937" />
              <p className="text-xs text-gray-400 mt-2">Right-click the QR → Save image to reprint</p>
              <NfcShare url={receiptLink(r.receiptId)} compact />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default RestaurantPortal;