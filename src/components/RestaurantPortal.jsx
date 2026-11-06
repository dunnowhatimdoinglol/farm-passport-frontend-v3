import { useState, useEffect } from 'react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import RestaurantLogin    from './RestaurantLogin';
import RestaurantRegister from './RestaurantRegister';
import { AUTH_EVENT, announceAuth, clearCustomerSession } from '../authSession';
import { shortWhen, receiptLink } from './walletHelpers';
import NfcShare from './NfcShare';
import { PhotoPicker, DeliveryPhotoButton } from './DeliveryPhoto';
import { TermsCheck, Refs, OwedLine, AlertSettings, Checklist } from './FarmerSupply';
import { printQrSlip } from './PrintDocs';
import { TxLink, ChainHelp } from './ChainProof';
import DashShell, { FP, PageTitle, StatTile, Panel, UseByBar, greeting, todayLabel } from './DashShell';
import Maru from './Maru';

// Prices are only shown to the farm and the restaurant — never on the customer journey
const gbp = (v) => (v === null || v === undefined || isNaN(Number(v))) ? null : `£${Number(v).toFixed(2)}`;

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';

// Formats a quantity with its unit, e.g. 2000 + "kg" → "2,000 kg"
const formatQty = (amount, unit) =>
  `${Number(amount).toLocaleString('en-GB')} ${unit || ''}`.trim();

// v4.5: the café pages (an email link can open one of these)
const CAFE_PAGES = ['today', 'create', 'order', 'deliveries', 'history', 'dishes', 'money', 'alerts'];

function RestaurantPortal({ onBack, onHome, topNav = null, startOn = null }) {
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
    // v4.5: signed out → the normal page frame (top bar), with a welcoming header
    return (
      <div className={topNav ? 'fp-app min-h-screen bg-gray-50 px-3 sm:px-4 pt-3 pb-24' : ''}>
      {topNav}
      <div className="fp-page max-w-4xl mx-auto space-y-6">
        <div className="relative overflow-hidden bg-white rounded-3xl border border-black/5 p-8 text-center">
          <div className="fp-glow" aria-hidden="true" />
          <div className="relative">
            <div className="text-5xl mb-3">🍽️</div>
            <h2 className="fp-gradient text-3xl sm:text-4xl font-extrabold tracking-tight mb-1">Café & restaurant</h2>
            <p className="text-gray-600">Order from local farms, confirm deliveries, and print a QR code on every bill.</p>
          </div>
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
      onHome={onHome || onBack}
    />
  );
}

// ─────────────────────────────────────────────────────────
// Logged-in restaurant: receipts, ordering stock, deliveries, history.
// ─────────────────────────────────────────────────────────
function RestaurantReceiptForm({ restaurantUser, restaurantToken, onLogout, onBack, onHome }) {
  // ── Which tab is showing ──
  // v4.4b: an alert email can ask for a tab (/cafe?go=deliveries) — used once, then forgotten
  const [tab, setTab] = useState(() => {
    try {
      const t = sessionStorage.getItem('fp_cafe_tab');
      sessionStorage.removeItem('fp_cafe_tab');
      return CAFE_PAGES.includes(t) ? t : 'today';
    } catch { return 'today'; }
  });   // v4.5: 'today' | 'create' | 'order' | 'deliveries' | 'history' | 'dishes' | 'money' | 'alerts'
  const [showAlerts, setShowAlerts] = useState(false);   // v4.4: email alert settings

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
  const [billName,  setBillName]  = useState('');    // v4.4b: table number, name or group (optional, kept private)
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
        billName: billName.trim() || undefined,
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
    setDiscValue(''); setOwnTotal(null); setSubmitErr(null); setBillName('');
    fetchStock(); fetchDishes();
  };

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

  // ── v4.5: the page frame — sidebar on a computer, bottom bar on a phone ──
  const [arriving, setArriving] = useState(0);
  const countArriving = () => axios.get(`${API_BASE}/restaurant/inbound`, authHeader)
    .then(r => setArriving((r.data.shipments || []).filter(x => x.status === 'in_transit').length)).catch(() => {});
  useEffect(() => { countArriving(); }, [tab]);
  const go = (t) => { setTab(t); if (t === 'create') { fetchStock(); fetchDishes(); } window.scrollTo({ top: 0 }); };
  const nav = [
    { key: 'today',      icon: '☀️', label: 'Today' },
    { key: 'create',     icon: '🧾', label: 'New bill' },
    { key: 'order',      icon: '🛒', label: 'Order stock' },
    { key: 'deliveries', icon: '🚚', label: 'Deliveries', badge: arriving || null },
    { key: 'history',    icon: '📚', label: 'Receipts' },
    { key: 'dishes',     icon: '🍲', label: 'Dishes' },
    { key: 'money',      icon: '💷', label: 'Money' },
  ];
  const shell = (children, activeTab = tab) => (
    <DashShell
      who={{ name: restaurantUser.restaurantName, sub: approved ? 'Café · approved' : approvalStatus === 'rejected' ? 'Café · not approved' : 'Café · waiting for approval', status: approved ? 'ok' : approvalStatus === 'rejected' ? 'stop' : 'wait' }}
      nav={nav} phone={['today', 'order', 'create', 'deliveries']} active={activeTab} onNav={(k) => { if (createdReceipt) handleCreateAnother(); go(k); }}
      extras={[{ key: 'alerts', icon: '🔔', label: 'Email alerts', active: tab === 'alerts', onClick: () => go('alerts') }]}
      onHome={onHome} onLogout={onLogout}
      tips={[
        'Tap a dish tile once for each serving, then print the bill. Diners scan it to meet the farm.',
        'If everything in a delivery is there, one tap on “All arrived” does it.',
        'Order from several products at once: put amounts on each, then place them together.',
        'Set “needs to last until” when ordering, and only stock that lasts that long is offered.',
        'Your dishes’ recipes take the right amounts off your stock on every bill.',
      ]}>
      <div className="fp-page space-y-6">
        <Banners />
        {children}
      </div>
    </DashShell>
  );

  // ─── SUCCESS — QR code ───
  if (createdReceipt) {
    const r = createdReceipt;
    return shell(
      <>
        <PageTitle kicker={r.billName ? `🪑 ${r.billName}` : 'New bill'} title="Bill ready ✅"
          actions={[
            <button key="a" onClick={handleCreateAnother} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 shadow-md">+ New bill</button>,
          ]} />
        <div className="grid lg:grid-cols-5 gap-5 items-start">
          <Panel className="lg:col-span-3 text-center">
            <p className="text-gray-600 mb-4">Print this QR code on the customer's bill, or let them scan the screen.</p>
            <div className="inline-block bg-white rounded-3xl border border-black/5 p-3 shadow-sm">
              <QRCodeSVG value={receiptLink(r.receiptId)} size={240} includeMargin={true} bgColor="#ffffff" fgColor="#13261A" />
            </div>
            <p className="font-mono text-xs text-gray-500 mt-3 break-all">{r.receiptId}</p>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              <button onClick={() => printQrSlip({ title: `${restaurantUser.restaurantName}${r.billName ? ` · ${r.billName}` : ''}`, subtitle: 'Scan to see where your meal came from and collect a farm badge', url: receiptLink(r.receiptId) })}
                className="bg-gray-800 text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-gray-900">🖨️ Print the QR slip</button>
            </div>
            <NfcShare url={receiptLink(r.receiptId)} />
          </Panel>
          <Panel className="lg:col-span-2" title={<>🧾 The bill{r.billName ? <span className="font-semibold text-gray-500"> · {r.billName}</span> : null}</>}>
            <div className="divide-y divide-black/5">
              {(r.lines || []).map((l, i) => (
                <div key={i} className="py-2 flex justify-between text-sm">
                  <span>{l.servings !== 1 ? `${l.servings} × ` : ''}{l.name}</span>
                  <span className="font-semibold">{l.lineTotal !== null && l.lineTotal !== undefined ? gbp(l.lineTotal) : ''}</span>
                </div>
              ))}
            </div>
            {r.discount && <p className="text-sm text-gray-600 mt-2 flex justify-between"><span>Discount ({r.discount.type === 'percent' ? `${r.discount.value}%` : gbp(r.discount.value)})</span><span>−{gbp(r.discount.amount)}</span></p>}
            {r.total !== null && r.total !== undefined && <p className="mt-3 flex justify-between items-end"><span className="font-semibold text-gray-600">Total</span><span className="text-3xl font-extrabold">{gbp(r.total)}</span></p>}
            {r.farms?.length > 0 && (
              <div className="rounded-2xl p-3 mt-4 text-xs text-green-800 flex gap-2" style={{ background: FP.mint }}>🌱
                <span>{r.farms.length > 1 ? `${r.farms.length} farms on this bill. The customer can collect ${r.farms.length} badges.` : 'The customer can collect a farm badge from this bill.'}</span></div>
            )}
            <div className="mt-4 text-xs text-gray-600">
              <p className="font-semibold text-gray-700 mb-1">Taken off your stock (recorded on the blockchain):</p>
              {(r.used || []).map(u => <p key={u.shipmentId}>{formatQty(u.quantity, u.unit)} {u.productName} — {u.farmName || 'farm'} · delivery #{u.shipmentId}</p>)}
            </div>
          </Panel>
        </div>
      </>, 'create'
    );
  }

  if (tab === 'today') {
    return shell(
      <>
        <CafeChecklist authHeader={authHeader} emailVerified={emailVerified} approved={approved} restaurantUser={restaurantUser} go={go} />
        <CafeToday authHeader={authHeader} approved={approved} restaurantUser={restaurantUser} go={go} onReceived={() => { fetchStock(); countArriving(); }} />
      </>
    );
  }
  if (tab === 'history') {
    return shell(<><PageTitle kicker="Every bill you've printed" title="Receipts" /><ReceiptHistory restaurantToken={restaurantToken} onLogout={onLogout} /></>);
  }
  if (tab === 'order') {
    return shell(<><PageTitle kicker="Straight from local farms" title="Order stock" /><OrderStock authHeader={authHeader} approved={approved} /></>);
  }
  if (tab === 'deliveries') {
    return shell(<><PageTitle kicker="Confirm what arrived" title="Deliveries" /><Deliveries authHeader={authHeader} approved={approved} onReceived={() => { fetchStock(); countArriving(); }} /><ChainHelp who="cafe" className="mt-6" /></>);
  }
  if (tab === 'dishes') {
    return shell(
      <>
        <PageTitle kicker="Menu price + what goes into one serving" title="Your dishes" actions={[<button key="b" onClick={() => go('create')} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-black/10 hover:bg-gray-100">🧾 New bill</button>]} />
        <Panel><DishManager dishes={dishes} authHeader={authHeader} onChanged={fetchDishes} /></Panel>
      </>
    );
  }
  if (tab === 'money') {
    return shell(<><PageTitle kicker="Paying the farms you buy from" title="Money" /><CafeMoney authHeader={authHeader} /></>);
  }
  if (tab === 'alerts') {
    return shell(
      <>
        <PageTitle kicker={restaurantUser.email} title="Email alerts" />
        <AlertSettings token={restaurantToken} />
        <ChainHelp who="cafe" />
      </>
    );
  }

  // ─── NEW BILL ───
  const usable = dishes.filter(d => d.ingredients?.length);
  const billPanel = (
    <Panel className="xl:sticky xl:top-6">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-lg font-bold">🧾 Bill</h2>
        <input value={billName} maxLength={40} onChange={(e) => setBillName(e.target.value)}
          placeholder="🪑 Table or name" aria-label="Name on the bill (optional)"
          className="w-40 px-3 py-1.5 border border-gray-200 rounded-xl text-sm text-right" />
      </div>
      {allLines.length === 0 ? (
        <p className="text-sm text-gray-500 py-6 text-center">Tap the dishes they had.</p>
      ) : allLines.map(l => (
        <div key={l.key} className="flex justify-between gap-2 py-2 border-b border-black/5 text-sm">
          <span>
            {l.servings !== 1 ? `${l.servings} × ` : ''}{l.name}
            {l.key.startsWith('x') && <button type="button" onClick={() => setExtras(extras.filter(x => x.key !== l.key))} className="text-xs text-red-500 ml-2" aria-label="Remove">✕</button>}
          </span>
          <span className="font-semibold">{l.total !== null ? gbp(l.total) : '—'}</span>
        </div>
      ))}
      {allLines.length > 0 && (
        <>
          <div className="flex gap-2 items-center py-2 text-sm flex-wrap">
            <span className="text-gray-600 flex-1">Discount</span>
            <select value={discType} onChange={(e) => setDiscType(e.target.value)} className="px-2 py-1 border border-gray-200 rounded-lg bg-white">
              <option value="amount">£</option>
              <option value="percent">%</option>
            </select>
            <input type="number" step="0.01" min="0" value={discValue} onChange={(e) => setDiscValue(e.target.value)} placeholder="0"
              className="w-20 px-2 py-1 border border-gray-200 rounded-lg" />
            {discount > 0 && <span className="text-gray-500 w-full text-right">−{gbp(discount)}</span>}
          </div>
          <div className="flex justify-between items-end mt-2 mb-1">
            <span className="font-semibold text-gray-600">Total</span>
            {ownTotal === null ? (
              <span className="text-right"><span className="text-3xl font-extrabold">{total !== null ? gbp(total) : <span className="text-sm font-normal text-gray-400">no prices — type one</span>}</span>
                <button type="button" onClick={() => setOwnTotal(total !== null ? String(total) : '')} className="block text-xs text-blue-600 font-normal ml-auto hover:underline">change</button>
              </span>
            ) : (
              <span className="flex items-center gap-1">£
                <input type="number" step="0.01" min="0" value={ownTotal} onChange={(e) => setOwnTotal(e.target.value)} className="w-24 px-2 py-1 border border-gray-200 rounded-lg" />
                <button type="button" onClick={() => setOwnTotal(null)} className="text-xs text-gray-500 hover:underline">auto</button>
              </span>
            )}
          </div>
        </>
      )}
      {submitErr && <p className="text-red-600 text-sm font-semibold bg-red-50 border border-red-200 rounded-xl p-3 mt-3">⚠️ {submitErr}</p>}
      <button type="submit" form="fp-bill"
        disabled={submitting || emailVerified === false || !approved || !allLines.length}
        className="w-full mt-4 bg-green-600 text-white py-3.5 rounded-2xl font-bold text-base hover:bg-green-700 shadow-md disabled:bg-gray-300 disabled:shadow-none disabled:cursor-not-allowed">
        {submitting               ? '⏳ Creating receipt…'
         : emailVerified === false ? '🔒 Verify your email to create receipts'
         : !approved               ? '🔒 Waiting for approval'
         :                           `🧾 Print bill with QR${total !== null && allLines.length ? ` · ${gbp(total)}` : ''}`}
      </button>
      <p className="text-[11px] text-gray-400 mt-2">Ingredients come off your deliveries, soonest use-by first, in one blockchain transaction. Receipts can never add up to more than you received.</p>
    </Panel>
  );
  return shell(
    <>
      <PageTitle kicker={todayLabel()} title="New bill"
        actions={[<button key="d" onClick={() => go('dishes')} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-black/10 hover:bg-gray-100">🍲 Your dishes ({dishes.length})</button>]} />
      {loading ? (
        <Panel><p className="text-gray-600 text-center">⏳ Loading your stock…</p></Panel>
      ) : fetchErr ? (
        <Panel><p className="text-red-600 text-center">⚠️ {fetchErr}</p></Panel>
      ) : stock.length === 0 ? (
        <Panel>
          <div className="text-center py-4">
            <div className="flex justify-center mb-2"><Maru mode="sit" size={90} say="Bills come from stock you've received!" /></div>
            <p className="text-gray-800 font-bold text-lg">No stock yet</p>
            <p className="text-gray-500 text-sm mt-1 max-w-md mx-auto">Order from a farm in <strong>🛒 Order stock</strong>, then confirm it arrived in <strong>🚚 Deliveries</strong>. Bills are made from stock you've received.</p>
            <button onClick={() => go('order')} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700">🛒 Order stock</button>
          </div>
        </Panel>
      ) : (
        <form id="fp-bill" onSubmit={handleCreate} className="grid xl:grid-cols-3 gap-5 items-start">
          <div className="xl:col-span-2 space-y-4">
            {usable.length === 0 ? (
              <Panel>
                <p className="text-sm text-gray-600">No dishes yet. Save your dishes (menu price and recipe) so one tap adds them, or use “Something else” below.</p>
                <button type="button" onClick={() => go('dishes')} className="mt-3 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700">+ Add a dish</button>
              </Panel>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {usable.map(d => {
                  const n = counts[d.id] || 0;
                  const out = d.canMake !== null && d.canMake !== undefined && n >= d.canMake;
                  const none = d.canMake === 0;
                  return (
                    <div key={d.id} className={`relative rounded-3xl border p-4 transition ${n ? 'border-green-600 bg-green-50 shadow-sm' : 'border-black/5 bg-white'} ${none ? 'opacity-50' : ''}`}>
                      <button type="button" onClick={() => !out && setCount(d.id, n + 1)} disabled={out}
                        className="w-full text-left disabled:cursor-not-allowed" aria-label={`Add ${d.name}`}>
                        <div className="text-4xl mb-2" aria-hidden="true">{dishEmoji(d)}</div>
                        <p className="font-bold leading-tight pr-8">{d.name}</p>
                        <p className="text-sm text-gray-500">{d.price !== null ? gbp(d.price) : 'no price'} · {none ? <span className="text-red-600 font-semibold">out of stock</span> : `${d.canMake} left`}</p>
                      </button>
                      {n > 0 && (
                        <div className="absolute top-3 right-3 flex items-center gap-1">
                          <button type="button" onClick={() => setCount(d.id, n - 1)} aria-label={`One less ${d.name}`}
                            className="w-7 h-7 rounded-full bg-white border border-black/10 text-gray-700 font-bold leading-none">−</button>
                          <span className="w-7 h-7 rounded-full text-white text-sm font-bold flex items-center justify-center" style={{ background: FP.green }}>{n}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Something else: an amount of a product, typed in */}
            {!extra ? (
              <button type="button" onClick={() => setExtra({ product: '', quantity: '', name: '', price: '' })}
                className="w-full rounded-3xl border-2 border-dashed border-gray-300 p-4 text-sm font-semibold text-gray-600 hover:border-green-600 hover:text-green-700">
                ✏️ Something else (type an amount from your stock)
              </button>
            ) : (
              <Panel title="✏️ Something else">
                <div className="space-y-2">
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
                    <button type="button" onClick={addExtra} className="text-sm bg-gray-800 text-white px-4 py-2 rounded-xl font-semibold">Add to bill</button>
                    <button type="button" onClick={() => setExtra(null)} className="text-sm text-gray-600 hover:underline">Cancel</button>
                  </div>
                </div>
              </Panel>
            )}
            <p className="text-xs text-gray-500 px-1">💡 Tap a dish once for each serving. Print the QR code on their bill: when they scan it, they see where their food came from and collect a badge for each farm.</p>
          </div>
          {billPanel}
        </form>
      )}
    </>
  );
}

// A friendly picture for a dish, from its name (or its main ingredient)
function dishEmoji(d) {
  const t = `${d.name} ${(d.ingredients || []).map(i => i.productName).join(' ')}`.toLowerCase();
  const pick = [
    [/soup|broth/, '🥣'], [/pie/, '🥧'], [/salad|leaves|greens/, '🥗'], [/burger/, '🍔'], [/steak|sirloin|ribeye|beef|brisket/, '🥩'],
    [/lamb|chop/, '🍖'], [/pork|bacon|sausage|ham/, '🥓'], [/chicken/, '🍗'], [/breakfast|egg|omelette/, '🍳'], [/crumble|cake|tart|pudding/, '🍰'],
    [/apple/, '🍎'], [/pizza/, '🍕'], [/pasta|spaghetti/, '🍝'], [/sandwich|toast|bread/, '🥪'], [/curry|stew/, '🍛'], [/fish|cod|salmon/, '🐟'],
    [/bean/, '🫛'], [/carrot/, '🥕'], [/potato|chips|mash/, '🥔'], [/squash|pumpkin/, '🎃'], [/mushroom/, '🍄'], [/honey/, '🍯'], [/cheese/, '🧀'],
  ].find(([re]) => re.test(t));
  return pick ? pick[1] : '🍽️';
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
  // v4.4b: with a "needs to last until" date, only batches whose use-by reaches it count
  const lastingQty = product && until && product.lots
    ? Math.max(0, Math.round((product.lots.filter(l => !l.useBy || l.useBy.slice(0, 10) >= until).reduce((n, l) => n + Number(l.quantity), 0) - (product.reserved || 0)) * 1000) / 1000)
    : null;
  const latestUseBy = product?.lots?.length && product.lots.every(l => l.useBy) ? product.lots.map(l => l.useBy).sort().pop() : null;
  const max = deal ? deal.remaining : lastingQty !== null ? Math.min(lastingQty, product.available) : product?.available;
  const unit = deal?.unit || product?.unit || '';
  const price = deal ? deal.dealPrice : product?.pricePerUnit;
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // What can be ordered, and why not more (stock held for other cafés' open orders)
  const heldNote = product?.reserved > 0 ? ` · ${formatQty(product.reserved, unit)} held for other orders` : '';
  const untilNote = lastingQty !== null && lastingQty < product.available
    ? ` that will last until ${day(until)}${latestUseBy && latestUseBy.slice(0, 10) < until ? ` · the latest use-by is ${day(latestUseBy)}` : ''}` : '';
  const tooMuch = Number(quantity) > 0 && max !== undefined && Number(quantity) > max;

  const submit = async (e) => {
    e.preventDefault();
    if (tooMuch) { setError(untilNote && !(max > 0) ? `None of it will last until ${day(until)}. Try an earlier date, or another farm.` : `Only ${formatQty(max, unit)} available${untilNote}${heldNote ? ` (${heldNote.slice(3)})` : ''}`); return; }
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

  // v4.4: small forms on the page instead of browser pop-ups
  const [poEdit, setPoEdit] = useState(null);       // { id, value }
  const [asking, setAsking] = useState(null);       // { id, kind: 'cancel' | 'cancel-rest' | 'again', quantity?, po?, note? }
  const savePo = async () => {
    try { await axios.put(`${API_BASE}/restaurant/orders/${poEdit.id}/ref`, { poNumber: poEdit.value.trim() }, authHeader); setPoEdit(null); load(); }
    catch (err) { setError(err.response?.data?.error || 'Could not save the PO number'); }
  };
  // "Order again": the same product and frozen choice from the same farm; the amount, PO number and note can be changed first (v4.4b)
  const orderAgain = async (o, form = {}) => {
    setError(null); setMessage(null);
    const quantity = Number(form.quantity) > 0 ? Number(form.quantity) : o.quantity;
    const poNumber = (form.po ?? o.poNumber ?? '').trim() || undefined;
    const note = (form.note || '').trim() || undefined;
    try {
      await axios.post(`${API_BASE}/restaurant/orders`, o.isMeat
        ? { meat: true, farmerAddress: o.farmerAddress, productName: o.productName, species: o.species || undefined, quantity, frozen: o.frozen || undefined, poNumber, note }
        : { farmerAddress: o.farmerAddress, productName: o.productName, unit: o.unit, quantity, poNumber, note }, authHeader);
      setAsking(null);
      setMessage(`Ordered ${formatQty(quantity, o.unit)} ${o.productName} from ${o.farmName} again.`);
      load();
    } catch (err) {
      setAsking(null);
      setError(`${o.productName}: ${err.response?.data?.error || 'could not order it again'}`);
    }
  };
  // What's owed to each farm (delivered, not marked paid)
  const owedByFarm = owedByFarmOf(orders);

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
            className={`flex-1 py-2 rounded-md font-semibold text-sm ${kind === k ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>{label}</button>
        ))}
      </div>

      {kind === 'meat' && <MeatOrder authHeader={authHeader} approved={approved} onOrdered={load} />}

      {/* v4.4c: fruit, veg & more ordered like meat — a farm, its products as cards, several at once */}
      {kind === 'produce' && <ProduceOrder products={products} deals={deals} authHeader={authHeader} approved={approved} onOrdered={load} />}

      {/* v4.5: "Owed to farms" now lives on the Money page (and the Today page) */}
      {message && <p className="text-sm text-green-700 font-semibold">✅ {message}</p>}
      {error && <p className="text-sm text-red-600 font-semibold">⚠️ {error}</p>}

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
                  <p className="text-xs"><Refs x={o} /> {!['declined', 'cancelled'].includes(o.status) && poEdit?.id !== o.id && <button onClick={() => setPoEdit({ id: o.id, value: o.poNumber || '' })} className="text-blue-600 hover:underline ml-1">{o.poNumber ? 'change PO' : '+ add your PO number'}</button>}</p>
                  {poEdit?.id === o.id && (
                    <div className="flex gap-2 items-center mt-1">
                      <input autoFocus value={poEdit.value} maxLength={40} onChange={(e) => setPoEdit({ ...poEdit, value: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && savePo()}
                        placeholder="Your PO number" className="px-2 py-1 border border-gray-300 rounded text-xs w-40" />
                      <button onClick={savePo} className="text-xs font-semibold text-white bg-green-600 px-2 py-1 rounded">Save</button>
                      <button onClick={() => setPoEdit(null)} className="text-xs text-gray-500 hover:underline">Don't change</button>
                    </div>
                  )}
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
                  {asking?.id === o.id && asking.kind === 'again' && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-semibold text-gray-800">🔁 Order {o.productName} from {o.farmName} again</p>
                      <div className="flex flex-wrap gap-2 items-center text-sm">
                        <input type="number" step="any" min="0.001" value={asking.quantity} onChange={(e) => setAsking({ ...asking, quantity: e.target.value })}
                          className="w-24 px-2 py-1.5 border border-gray-300 rounded" aria-label="Quantity" />
                        <span className="text-gray-600">{o.unit}</span>
                        <input value={asking.po} maxLength={40} onChange={(e) => setAsking({ ...asking, po: e.target.value })}
                          placeholder="Your PO number (optional)" className="flex-1 min-w-[10rem] px-2 py-1.5 border border-gray-300 rounded" />
                      </div>
                      <input value={asking.note} maxLength={280} onChange={(e) => setAsking({ ...asking, note: e.target.value })}
                        placeholder="Note to the farm (optional), e.g. small ones please" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                      <div className="flex gap-3 items-center">
                        <button onClick={() => orderAgain(o, asking)} disabled={!(Number(asking.quantity) > 0)}
                          className="bg-green-600 text-white text-sm font-semibold px-3 py-1.5 rounded-lg hover:bg-green-700 disabled:bg-gray-400">Place order</button>
                        <button onClick={() => setAsking(null)} className="text-sm text-gray-500 hover:underline">Don't order</button>
                      </div>
                    </div>
                  )}
                </div>
                {poEdit?.id !== o.id && <div className="text-right space-y-1 shrink-0">
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
                  {o.status === 'part_sent' && (asking?.id === o.id && asking.kind === 'cancel-rest' ? (
                    <span className="block text-xs text-gray-700">Cancel the {formatQty(o.outstanding, o.unit)} still to come?{' '}
                      <button onClick={() => { setAsking(null); cancelOrder(o); }} className="text-red-600 font-semibold hover:underline">Yes</button>{' · '}
                      <button onClick={() => setAsking(null)} className="hover:underline">No</button></span>
                  ) : (
                    <button onClick={() => setAsking({ id: o.id, kind: 'cancel-rest' })}
                      className="block text-xs text-red-600 hover:underline ml-auto">Cancel the rest</button>
                  ))}
                  {o.status === 'requested' && (asking?.id === o.id && asking.kind === 'cancel' ? (
                    <span className="block text-xs text-gray-700">Cancel this order?{' '}
                      <button onClick={() => { setAsking(null); cancelOrder(o); }} className="text-red-600 font-semibold hover:underline">Yes, cancel it</button>{' · '}
                      <button onClick={() => setAsking(null)} className="hover:underline">No, keep it</button></span>
                  ) : (
                    <button onClick={() => setAsking({ id: o.id, kind: 'cancel' })} className="block text-xs text-red-600 hover:underline ml-auto">Cancel order</button>
                  ))}
                  {!['requested', 'part_sent'].includes(o.status) && !o.isDeal && approved && !(asking?.id === o.id && asking.kind === 'again') && (
                    <button onClick={() => setAsking({ id: o.id, kind: 'again', quantity: String(o.quantity), po: o.poNumber || '', note: '' })} className="block text-xs font-semibold text-green-700 hover:underline ml-auto">🔁 Order again</button>
                  )}
                </div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// v4.4 — getting started for a new café: verified → approved → first order → first delivery → a dish → a receipt
// What the café owes each farm (delivered orders the farm hasn't marked paid)
function owedByFarmOf(orders) {
  return Object.values((orders || [])
    .filter(o => ['dispatched', 'part_sent', 'closed_short'].includes(o.status) && o.paymentStatus !== 'paid' && (o.owed ?? o.total) > 0)
    .reduce((m, o) => {
      const f = m[o.farmerAddress] || (m[o.farmerAddress] = { farm: o.farmName, owed: 0, orders: 0, estimate: false });
      f.owed = Math.round((f.owed + Number(o.owed ?? o.total)) * 100) / 100; f.orders++; if (!o.owedFinal) f.estimate = true;
      return m;
    }, {}));
}

// ─────────────────────────────────────────────────────────
// v4.5 — Today: the café's day at a glance. Bills today, what's arriving (one tap to confirm),
// what to use first, what's owed to farms, and the badges diners collected this week.
// ─────────────────────────────────────────────────────────
function CafeToday({ authHeader, approved, restaurantUser, go, onReceived }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const load = async () => {
    const get = (p) => axios.get(`${API_BASE}${p}`, authHeader).then(r => r.data).catch(() => ({}));
    const [rc, inb, st, od] = await Promise.all([get('/restaurant/my-receipts'), get('/restaurant/inbound'), get('/restaurant/my-stock'), get('/restaurant/orders')]);
    setD({ receipts: rc.receipts || [], inbound: inb.shipments || [], stock: st.stock || [], orders: od.orders || [] });
  };
  useEffect(() => { load(); }, []);

  // One tap: everything arrived as sent (the same as "All arrived" in Deliveries)
  const allArrived = async (s) => {
    setBusy(s.shipmentId); setErr(null);
    try {
      const form = new FormData();
      form.append('quantityReceived', String(s.quantitySent));
      form.append('quantityRejected', '0');
      form.append('acceptTerms', 'true');
      form.append('notes', '');
      await axios.post(`${API_BASE}/restaurant/shipments/${s.shipmentId}/receive`, form, authHeader);
      await load(); onReceived?.();
    } catch (e) { setErr(e.response?.data?.error || 'Could not confirm the delivery'); }
    finally { setBusy(null); }
  };

  if (!d) return <Panel><p className="text-gray-500">⏳ Getting your day ready…</p></Panel>;
  const dayKey = (x) => new Date(x).toDateString();
  const today = new Date().toDateString();
  const weekAgo = new Date(Date.now() - 7 * 864e5).toDateString();
  const billsToday = d.receipts.filter(r => r.createdAt && dayKey(r.createdAt) === today);
  const takeOf = (r) => Number(r.amountPaid ?? r.total ?? 0) || 0;
  const takings = Math.round(billsToday.reduce((n, r) => n + takeOf(r), 0) * 100) / 100;
  const lastWeek = d.receipts.filter(r => r.createdAt && dayKey(r.createdAt) === weekAgo);
  const lastTakings = lastWeek.reduce((n, r) => n + takeOf(r), 0);
  const change = lastTakings > 0 ? Math.round(((takings - lastTakings) / lastTakings) * 100) : null;
  const arriving = d.inbound.filter(s => s.status === 'in_transit');
  const soon = (u) => u && (new Date(u) - new Date(today)) / 864e5 <= 3;
  // one line per recalled product (it may have come in several deliveries)
  const recalled = Object.values(d.stock.filter(s => s.recalled).reduce((m, s) => { m[`${s.productName}|${s.farmName}`] ||= s; return m; }, {}));
  const useFirst = d.stock.filter(s => !s.recalled && soon(s.useBy)).sort((a, b) => new Date(a.useBy) - new Date(b.useBy));
  const owed = owedByFarmOf(d.orders);
  const owedTotal = Math.round(owed.reduce((n, f) => n + f.owed, 0) * 100) / 100;
  // Badges diners collected from your bills, each of the last 7 days
  const days = [...Array(7)].map((_, i) => new Date(Date.now() - (6 - i) * 864e5).toDateString());
  const claimedPerDay = days.map(k => d.receipts.filter(r => r.claimed && r.claimedAt && dayKey(r.claimedAt) === k).length);
  const claimedWeek = claimedPerDay.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...claimedPerDay);
  const spark = claimedPerDay.map((v, i) => `${i ? 'L' : 'M'}${(i / 6) * 150},${40 - (v / max) * 36}`).join(' ');
  const day = (x) => new Date(x).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="space-y-6">
      <PageTitle kicker={todayLabel()} title={`${greeting()}, ${restaurantUser.restaurantName} 👋`}
        actions={[
          <button key="o" onClick={() => go('order')} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white border border-black/10 hover:bg-gray-100">🛒 Order stock</button>,
          <button key="b" onClick={() => go('create')} className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 shadow-md">🧾 New bill</button>,
        ]} />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <StatTile icon="🧾" value={gbp(takings) || '£0.00'} label="Bills today" onClick={() => go('history')}
          sub={`${billsToday.length} bill${billsToday.length === 1 ? '' : 's'}${change !== null ? ` · ${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}% on last ${new Date().toLocaleDateString('en-GB', { weekday: 'long' })}` : ''}`} />
        <StatTile icon="🚚" value={arriving.length} label="Arriving" sub={arriving.length ? 'Confirm them in one tap' : 'Nothing on its way'} tone="honey" onClick={() => go('deliveries')} />
        <StatTile icon={recalled.length ? '🚨' : '⏰'} value={recalled.length || useFirst.length} label={recalled.length ? 'Recalled' : 'Use first'} sub={recalled.length ? 'Don’t use it: send it back or write it off' : 'Use-by in the next 3 days'} tone="coral" onClick={() => go('deliveries')} />
        <StatTile icon="💷" value={gbp(owedTotal) || '£0.00'} label="Owed to farms" sub={owed.length ? owed.map(f => f.farm).join(', ') : 'All paid up'} tone="white" onClick={() => go('money')} />
      </div>

      {err && <p className="text-sm text-red-600 font-semibold">⚠️ {err}</p>}

      <div className="grid xl:grid-cols-5 gap-4 items-start">
        <Panel className="xl:col-span-3" title="🚚 Arriving" action={<button onClick={() => go('deliveries')} className="text-sm font-semibold text-green-700 hover:underline">All deliveries →</button>}>
          {arriving.length === 0 ? (
            <p className="text-sm text-gray-500">Nothing on its way right now. <button onClick={() => go('order')} className="text-green-700 font-semibold hover:underline">Order something?</button></p>
          ) : (
            <div className="space-y-3">
              {arriving.map(s => (
                <div key={s.shipmentId} className="rounded-2xl border border-black/5 bg-gray-50 p-4 flex gap-4 items-center flex-wrap">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="font-bold">{formatQty(s.quantitySent, s.unit)} {s.productName} <span className="font-normal text-gray-500">· {s.fromName}</span></p>
                    <p className="text-xs text-gray-500">{[s.orderRef, s.poNumber && `PO ${s.poNumber}`, `delivery #${s.shipmentId}`].filter(Boolean).join(' · ')}
                      {s.lastStep ? <> · <span className="text-green-700 font-semibold">{s.lastStep.stage === 'Out for delivery' || /out for delivery/i.test(s.lastStep.notes || '') ? 'Out for delivery' : 'On its way'}</span></> : null}</p>
                    {s.senderNote && <p className="text-xs text-gray-600 mt-0.5">💬 “{s.senderNote}”</p>}
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => go('deliveries')} className="px-3 py-2 rounded-xl bg-white border border-black/10 text-sm font-semibold hover:bg-gray-100">Something wrong?</button>
                    <button onClick={() => allArrived(s)} disabled={!approved || busy !== null}
                      className="px-3 py-2 rounded-xl text-white text-sm font-semibold bg-green-600 hover:bg-green-700 disabled:bg-gray-300">
                      {busy === s.shipmentId ? '⛓️ Recording…' : '✅ All arrived'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="xl:col-span-2 space-y-4">
          <Panel title={recalled.length ? '🚨 Recalled & ⏰ use first' : '⏰ Use first'}>
            {recalled.map(s => (
              <p key={`r${s.shipmentId}`} className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-2">🚨 <strong>{s.productName}</strong> ({s.farmName}) is recalled. Don’t use it.</p>
            ))}
            {useFirst.length === 0 && !recalled.length ? (
              <p className="text-sm text-gray-500">Nothing needs using up in the next few days. 👍</p>
            ) : (
              <div className="space-y-4">
                {useFirst.slice(0, 6).map(s => (
                  <div key={s.shipmentId}>
                    <div className="flex justify-between gap-2 text-sm"><span className="font-semibold">{s.productName} <span className="text-gray-500 font-normal">· {formatQty(s.available, s.unit)}</span></span><span className="text-gray-500 shrink-0">{day(s.useBy)}</span></div>
                    <div className="mt-1.5"><UseByBar useBy={s.useBy} /></div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          <div className="rounded-3xl p-5 flex items-center gap-3 text-white" style={{ background: FP.forest }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white/60 font-semibold uppercase tracking-wide">Diners this week</p>
              <p className="text-2xl font-extrabold">{claimedWeek} badge{claimedWeek === 1 ? '' : 's'}</p>
              <p className="text-xs text-white/70">claimed from your bills</p>
            </div>
            <svg width="150" height="44" viewBox="0 0 150 44" aria-hidden="true">
              <path d={`${spark} L150,44 L0,44 Z`} fill="rgba(226,176,74,.25)" />
              <path d={spark} fill="none" stroke={FP.honey} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// v4.5 — Money: what you owe each farm, and what's been paid (invoices arrive here in v4.6)
// ─────────────────────────────────────────────────────────
function CafeMoney({ authHeader }) {
  const [orders, setOrders] = useState(null);
  useEffect(() => { axios.get(`${API_BASE}/restaurant/orders`, authHeader).then(r => setOrders(r.data.orders || [])).catch(() => setOrders([])); }, []);
  if (!orders) return <Panel><p className="text-gray-500">⏳ Loading…</p></Panel>;
  const owed = owedByFarmOf(orders);
  const owedTotal = Math.round(owed.reduce((n, f) => n + f.owed, 0) * 100) / 100;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const paid = orders.filter(o => o.paymentStatus === 'paid');
  const paidMonth = paid.filter(o => o.paidAt ? new Date(o.paidAt) >= monthStart : true);   // (all paid orders until payment dates are recorded)
  const paidTotal = Math.round(paidMonth.reduce((n, o) => n + Number(o.owed ?? o.total ?? 0), 0) * 100) / 100;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
        <StatTile icon="💷" value={gbp(owedTotal) || '£0.00'} label="Owed to farms" sub={`${owed.length} farm${owed.length === 1 ? '' : 's'}`} tone="honey" />
        <StatTile icon="✅" value={gbp(paidTotal) || '£0.00'} label="Paid" sub={`${paidMonth.length} order${paidMonth.length === 1 ? '' : 's'}`} />
      </div>
      <Panel title="💷 Owed to each farm">
        <p className="text-xs text-gray-500 mb-3">Delivered orders the farm hasn't marked as paid yet. You only pay for what you accepted. Pay the farm directly; they tick it off.</p>
        {owed.length === 0 ? <p className="text-sm text-gray-500">Nothing owed. 👍</p> : (
          <div className="divide-y divide-black/5">
            {owed.map(f => (
              <div key={f.farm} className="py-3 flex justify-between gap-3">
                <span className="font-semibold">{f.farm} <span className="text-gray-500 font-normal text-sm">· {f.orders} order{f.orders === 1 ? '' : 's'}</span></span>
                <span className="font-extrabold">{gbp(f.owed)}{f.estimate && <span className="text-xs font-normal text-gray-500"> so far</span>}</span>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel title="🧾 Invoices">
        <p className="text-sm text-gray-500">Coming next: every delivery you confirm will create its invoice here automatically, with its due date, and you can query one if something's not right.</p>
      </Panel>
    </div>
  );
}

function CafeChecklist({ authHeader, emailVerified, approved, restaurantUser, go }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    if (!approved) { setD({}); return; }
    const get = (p) => axios.get(`${API_BASE}${p}`, authHeader).then(r => r.data).catch(() => ({}));
    Promise.all([get('/restaurant/orders'), get('/restaurant/inbound'), get('/restaurant/dishes'), get('/restaurant/my-receipts')])
      .then(([o, i, ds, rc]) => setD({ orders: (o.orders || []).length, received: (i.shipments || []).filter(s => s.status === 'delivered').length, dishes: (ds.dishes || []).length, receipts: (rc.receipts || []).length }));
  }, [approved]);
  if (!d) return null;
  return (
    <Checklist storageKey={`fp_cafe_checklist_${restaurantUser.email}`} title="Getting started" steps={[
      { done: emailVerified !== false, label: 'Verify your email', hint: 'Click the link we emailed you.' },
      { done: !!approved, label: 'Get approved', hint: 'We check every café before it can order, usually within a day. You’ll get an email.' },
      { done: d.orders > 0, label: 'Order from a local farm', hint: 'Fruit & veg, or meat from a farm’s meat prices.', action: { label: 'Order stock', onClick: () => go('order') } },
      { done: d.received > 0, label: 'Confirm your first delivery', hint: 'When it arrives, tap “All arrived”. Add a photo if you can.', action: { label: 'Open Deliveries', onClick: () => go('deliveries') } },
      { done: d.dishes > 0, label: 'Save a dish', hint: 'Its menu price and what goes into one serving, so receipts take the right amounts off your stock.', action: { label: 'Add a dish', onClick: () => go('create') } },
      { done: d.receipts > 0, label: 'Make your first receipt', hint: 'Diners scan its QR code to see where their food came from.', action: { label: 'New receipt', onClick: () => go('create') } },
    ]} />
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
                className={`text-left border-2 rounded-lg p-3 ${farmAddr === f.farmerAddress ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-bold text-gray-800">{f.farmName || 'Farm'} {inBasket > 0 && <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5 ml-1">{inBasket} in order</span>}</p>
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
                  <div key={k} className={`border rounded-lg p-3 flex flex-col ${q > 0 ? (st === 'short' ? 'border-red-400 bg-red-50' : 'border-green-500 bg-green-50') : 'border-gray-200'} ${unavailable ? 'opacity-50' : ''}`}>
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
        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-green-500 sticky bottom-2">
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
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400">
              {busy ? '⏳ Ordering…' : !approved ? '🔒 Waiting for approval' : problems.length ? `Fix ${problems.length} item${problems.length === 1 ? '' : 's'} first` : `🛒 Place ${basket.length} order${basket.length === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// v4.4c — fruit, veg & more, laid out like the meat tab: pick a farm, browse its products by type,
// put amounts on as many as you like, then place them all at once (one order per product).
// ─────────────────────────────────────────────────────────
const PRODUCE_GROUPS = [
  ['Vegetable', '🥕 Veg'], ['Salad & herbs', '🌿 Salad & herbs'], ['Fruit', '🍎 Fruit'], ['Mushrooms', '🍄 Mushrooms'],
  ['Eggs', '🥚 Eggs'], ['Dairy', '🧀 Dairy'], ['Honey', '🍯 Honey'], ['Grain & flour', '🌾 Grain & flour'], ['Grain', '🌾 Grain & flour'],
  ['Nuts', '🌰 Nuts'], ['Preserves', '🫙 Preserves'], ['Juice & drinks', '🧃 Juice & drinks'], ['Flowers', '💐 Flowers'],
];
const groupOf = (t) => { const g = PRODUCE_GROUPS.find(([k]) => k === t); return g ? g[1] : '🧺 Other'; };
const groupRank = (label) => { const i = PRODUCE_GROUPS.findIndex(([, l]) => l === label); return label === '🏷️ Deals' ? 99 : i < 0 ? 98 : i; };
// "£6.50/jar", not "/jars"
const perUnit = (u) => ({ jars: 'jar', bottles: 'bottle', bunches: 'bunch', trays: 'tray', litres: 'litre', units: 'unit' }[u] || u);

function ProduceOrder({ products, deals, authHeader, approved, onOrdered }) {
  const [farmAddr, setFarmAddr] = useState(null);
  const [group,   setGroup]   = useState(null);
  const [qty,     setQty]     = useState({});       // product key (or deal:<batchId>) → amount typed
  const [until,   setUntil]   = useState('');
  const [note,    setNote]    = useState('');
  const [po,      setPo]      = useState('');
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState(null);
  const [message, setMessage] = useState(null);
  const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  // Everything for sale (deals as their own cards), grouped by farm
  const items = [
    ...products.map(p => ({ k: p.key, p, group: groupOf(p.productType), farmerAddress: p.farmerAddress, farmName: p.farmName, unit: p.unit,
      name: p.productName, price: p.pricePerUnit, priceFrom: p.priceFrom, priceTo: p.priceTo, available: p.available })),
    ...deals.map(d => ({ k: `deal:${d.batchId}`, d, group: '🏷️ Deals', farmerAddress: d.farmerAddress, farmName: d.farmName, unit: d.unit,
      name: d.productName, price: d.dealPrice, available: d.remaining })),
  ];
  const farms = Object.values(items.reduce((m, x) => {
    const f = m[x.farmerAddress] || (m[x.farmerAddress] = { farmerAddress: x.farmerAddress, farmName: x.farmName, items: [] });
    f.items.push(x); return m;
  }, {})).sort((a, b) => String(a.farmName).localeCompare(String(b.farmName)));
  const farm = farms.find(f => f.farmerAddress === farmAddr) || (farms.length === 1 ? farms[0] : null);
  const groups = farm ? [...new Set(farm.items.map(x => x.group))].sort((a, b) => groupRank(a) - groupRank(b)) : [];
  const g = groups.includes(group) ? group : groups[0];

  // How much lasts until the "needs to last until" date (deals: their own use-by)
  const lasting = (x) => {
    if (!until) return x.available;
    if (x.d) return !x.d.useBy || x.d.useBy.slice(0, 10) >= until ? x.available : 0;
    if (!x.p.lots) return x.available;
    const n = x.p.lots.filter(l => !l.useBy || l.useBy.slice(0, 10) >= until).reduce((t, l) => t + Number(l.quantity), 0) - (x.p.reserved || 0);
    return Math.max(0, Math.min(x.available, Math.round(n * 1000) / 1000));
  };
  const basket = items.map(x => ({ ...x, q: Number(qty[x.k]) })).filter(x => x.q > 0);
  const short = basket.filter(x => x.q > lasting(x));
  const priced = basket.filter(x => x.price !== null && x.price !== undefined);
  const total = priced.reduce((n, x) => n + x.q * x.price, 0);
  const step = (u) => (['kg', 'litres'].includes(u) ? 0.5 : 1);

  const place = async () => {
    setBusy(true); setError(null); setMessage(null);
    const ok = [];
    try {
      for (const x of basket) {
        await axios.post(`${API_BASE}/restaurant/orders`, x.d
          ? { dealBatchId: x.d.batchId, quantity: x.q, note: note.trim() || undefined, poNumber: po.trim() || undefined }
          : { farmerAddress: x.farmerAddress, productName: x.name, unit: x.unit, quantity: x.q,
              neededUntil: until || undefined, note: note.trim() || undefined, poNumber: po.trim() || undefined }, authHeader);
        ok.push(x);
      }
      setMessage(`${ok.length} order${ok.length === 1 ? '' : 's'} sent to ${[...new Set(ok.map(x => x.farmName || 'the farm'))].join(' and ')}. You'll get an email when ${ok.length === 1 ? 'it’s' : 'they’re'} on the way.`);
      setQty({}); setNote(''); setUntil(''); setPo('');
    } catch (err) {
      setError(`${ok.length ? `${ok.length} sent, then ` : ''}${basket[ok.length]?.name}: ${err.response?.data?.error || 'could not order'}`);
      setQty(Object.fromEntries(basket.slice(ok.length).map(x => [x.k, String(x.q)])));
    } finally {
      setBusy(false);
      onOrdered?.();
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🛒 Order from a farm</h3>
        <p className="text-sm text-gray-500 mb-4">Pick a farm, then put amounts on as many products as you like. The farm sends the soonest use-by first. Payment is arranged directly with the farm for now.</p>
        {farms.length === 0 && <p className="text-sm text-gray-500">Nothing for sale right now. Check back soon.</p>}

        {/* 1. Farm */}
        <div className="grid sm:grid-cols-2 gap-2">
          {farms.map(f => {
            const inBasket = basket.filter(x => x.farmerAddress === f.farmerAddress).length;
            const nDeals = f.items.filter(x => x.d).length;
            return (
              <button key={f.farmerAddress} onClick={() => { setFarmAddr(f.farmerAddress); setGroup(null); }}
                className={`text-left border-2 rounded-lg p-3 ${farm?.farmerAddress === f.farmerAddress ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                <p className="font-bold text-gray-800">{f.farmName || 'Farm'} {inBasket > 0 && <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5 ml-1">{inBasket} in order</span>}</p>
                <p className="text-xs text-gray-600">{[...new Set(f.items.filter(x => !x.d).map(x => x.group))].sort((a, b) => groupRank(a) - groupRank(b)).join(' · ')}</p>
                <p className="text-xs text-green-700 font-semibold">{f.items.filter(x => !x.d).length} product{f.items.filter(x => !x.d).length === 1 ? '' : 's'}{nDeals ? <span className="text-amber-700"> · 🏷️ {nDeals} deal{nDeals === 1 ? '' : 's'}</span> : null}</p>
              </button>
            );
          })}
        </div>

        {/* 2. Type, 3. Products */}
        {farm && (
          <div className="mt-5">
            <div className="flex gap-1 border-b border-gray-200 mb-3 overflow-x-auto">
              {groups.map(t => (
                <button key={t} onClick={() => setGroup(t)}
                  className={`px-4 py-2 text-sm font-semibold rounded-t-lg whitespace-nowrap ${g === t ? (t === '🏷️ Deals' ? 'bg-amber-600 text-white' : 'bg-gray-800 text-white') : 'text-gray-600 hover:bg-gray-100'}`}>
                  {t} <span className="font-normal opacity-75">({farm.items.filter(x => x.group === t).length})</span>
                </button>
              ))}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {farm.items.filter(x => x.group === g).map(x => {
                const q = Number(qty[x.k]);
                const left = lasting(x);
                const tooMuch = q > left;
                return (
                  <div key={x.k} className={`border rounded-lg p-3 flex flex-col ${q > 0 ? (tooMuch ? 'border-red-400 bg-red-50' : 'border-green-500 bg-green-50') : x.d ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}>
                    <div className="flex justify-between gap-2">
                      <p className="font-semibold text-gray-800">{x.name}</p>
                      <p className="text-sm font-semibold text-gray-700 shrink-0 text-right">
                        {x.d ? <>{x.d.normalPrice !== null && <span className="line-through text-gray-400 font-normal mr-1">{gbp(x.d.normalPrice)}</span>}<span className="text-amber-800">{gbp(x.price)}/{perUnit(x.unit)}</span></>
                          : x.priceFrom !== null && x.priceFrom !== undefined ? `${x.priceFrom === x.priceTo ? gbp(x.priceFrom) : `${gbp(x.priceFrom)}–${gbp(x.priceTo)}`}/${perUnit(x.unit)}`
                          : <span className="text-xs text-gray-400 font-normal">price on request</span>}
                      </p>
                    </div>
                    <p className="text-xs mt-0.5 text-green-700 font-semibold">✅ {formatQty(x.available, x.unit)} available</p>
                    <p className="text-xs text-gray-500">
                      {x.d ? `🏷️ Short-date deal · use by ${x.d.useBy ? day(x.d.useBy) : '—'}`
                        : x.p.useByFrom ? `Use by ${day(x.p.useByFrom)}${x.p.useByTo && x.p.useByTo !== x.p.useByFrom ? ` – ${day(x.p.useByTo)}` : ''}` : 'No use-by set'}
                    </p>
                    {x.p?.reserved > 0 && <p className="text-xs text-gray-500">🔒 {formatQty(x.p.reserved, x.unit)} more already held for other cafés' orders</p>}
                    {until && left < x.available && <p className="text-xs text-amber-800">{left > 0 ? `Only ${formatQty(left, x.unit)} lasts until ${day(until)}` : `None of it lasts until ${day(until)}`}</p>}
                    <div className="mt-auto pt-2 flex items-center gap-1">
                      <button type="button" disabled={!(q > 0)} onClick={() => setQty({ ...qty, [x.k]: String(Math.max(0, Math.round(((q || 0) - step(x.unit)) * 1000) / 1000) || '') })}
                        className="w-8 h-8 rounded border border-gray-300 bg-white disabled:opacity-40" aria-label="Less">−</button>
                      <input type="number" step="any" min="0" value={qty[x.k] ?? ''} onChange={(e) => setQty({ ...qty, [x.k]: e.target.value })}
                        placeholder="0" className="w-20 px-2 py-1 border border-gray-300 rounded text-center" aria-label={`${x.name} ${x.unit}`} />
                      <button type="button" onClick={() => setQty({ ...qty, [x.k]: String(Math.round(((q || 0) + step(x.unit)) * 1000) / 1000) })}
                        className="w-8 h-8 rounded border border-gray-300 bg-white" aria-label="More">+</button>
                      <span className="text-sm text-gray-500">{x.unit}</span>
                    </div>
                    {tooMuch && <p className="text-xs text-red-700 mt-1">Only {formatQty(left, x.unit)} {until ? `lasts until ${day(until)}` : 'available'}.</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {(basket.length > 0 || message || error) && (
        <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-green-500 sticky bottom-2">
          {basket.length > 0 && (
            <>
              <p className="font-bold text-gray-800 mb-2">🧺 Your order</p>
              <div className="divide-y divide-gray-100 text-sm mb-3">
                {basket.map(x => (
                  <div key={x.k} className="py-1.5 flex justify-between gap-2">
                    <span>{formatQty(x.q, x.unit)} {x.name} <span className="text-gray-500">· {x.farmName}</span>
                      {x.d && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 ml-1">deal</span>}
                      {x.q > lasting(x) && <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-100 text-red-800 ml-1">not enough</span>}</span>
                    <span className="text-gray-700 shrink-0 flex items-center gap-2">
                      {x.price !== null && x.price !== undefined ? gbp(x.q * x.price) : '—'}
                      <button onClick={() => setQty({ ...qty, [x.k]: '' })} className="text-xs text-red-600" aria-label="Remove">✕</button></span>
                  </div>
                ))}
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mb-3">
                <label className="text-xs font-semibold text-gray-700">Needs to last until <span className="font-normal text-gray-400">(optional)</span>
                  <input type="date" value={until} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setUntil(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-normal" />
                </label>
                <label className="text-xs font-semibold text-gray-700">Note to the farm <span className="font-normal text-gray-400">(optional)</span>
                  <input value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Delivery Tuesday morning please" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-normal" />
                </label>
                <label className="text-xs font-semibold text-gray-700">Your PO number <span className="font-normal text-gray-400">(optional)</span>
                  <input value={po} maxLength={40} onChange={(e) => setPo(e.target.value)} placeholder="e.g. PO-4521" className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg font-normal" />
                </label>
              </div>
              <p className="text-sm text-gray-700 mb-2">{priced.length ? <>Estimated <strong>{gbp(total)}</strong>{priced.length < basket.length ? ' + items priced on request' : ''}</> : 'Prices on request'} <span className="text-xs text-gray-400">· the farm confirms the final price and any delivery charge when it sends</span></p>
            </>
          )}
          {error && <p className="text-sm text-red-600 font-semibold mb-2">⚠️ {error}</p>}
          {message && <p className="text-sm text-green-700 font-semibold mb-2">✅ {message}</p>}
          {basket.length > 0 && (
            <button onClick={place} disabled={busy || !approved || short.length > 0}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-gray-400">
              {busy ? '⏳ Ordering…' : !approved ? '🔒 Waiting for approval' : short.length ? `Fix ${short.length} item${short.length === 1 ? '' : 's'} first` : `🛒 Place ${basket.length} order${basket.length === 1 ? '' : 's'}`}
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

  const [removing, setRemoving] = useState(null);   // dish id waiting for "Yes, remove"
  const remove = async (d) => {
    if (removing !== d.id) { setRemoving(d.id); return; }
    setRemoving(null);
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
                <button type="button" onClick={() => remove(d)} className="text-xs text-red-600 hover:underline">{removing === d.id ? 'Tap again to remove' : 'Remove'}</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!form ? (
        <button type="button" onClick={() => setForm(blank)} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700">+ Add a dish</button>
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
            <button type="submit" disabled={busy} className="bg-green-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400">
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
  const [detail,    setDetail]    = useState({});   // shipmentId → showing the "something's wrong" form (v4.4)
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

  // v4.4: "all" = the one-tap path (everything arrived as sent). The warnings that used to pop up
  // (no photo, courier not marked out for delivery) are now shown on the card instead.
  const receive = async (s, all = false) => {
    const photo = photos[s.shipmentId];
    setBusyId(s.shipmentId);
    setError(null);
    try {
      const form = new FormData();
      form.append('quantityReceived', String(all ? s.quantitySent : acceptedOf(s)));
      form.append('quantityRejected', String(all ? 0 : refusedOf(s)));
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

  // v4.4: stock nudges — recalled, past its use-by, use first (use-by within 2 days), running low (under a fifth left)
  const DAY = 86400e3;
  const held = received.filter(s => s.available > 0);
  const nudges = [
    ...held.filter(s => s.recalled).map(s => ({ tone: 'red', icon: '🚨', text: `${s.productName} (${s.farmName || s.fromName}) is recalled: don't use it. Send it back or write it off below.` })),
    ...held.filter(s => !s.recalled && s.useBy && new Date(s.useBy) < new Date()).map(s => ({ tone: 'red', icon: '⛔', text: `${formatQty(s.available, s.unit)} ${s.productName} is past its use-by (${new Date(s.useBy).toLocaleDateString('en-GB')}). Write it off below.` })),
    ...held.filter(s => !s.recalled && s.useBy && new Date(s.useBy) >= new Date() && new Date(s.useBy) - Date.now() < 2 * DAY)
      .map(s => ({ tone: 'amber', icon: '⏰', text: `Use first: ${formatQty(s.available, s.unit)} ${s.productName}, use by ${new Date(s.useBy).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}` })),
    ...held.filter(s => !s.recalled && s.quantityReceived > 0 && s.available <= s.quantityReceived * 0.2)
      .map(s => ({ tone: 'gray', icon: '📉', text: `Running low: ${formatQty(s.available, s.unit)} ${s.productName} left of ${formatQty(s.quantityReceived, s.unit)}. Time to order more?` })),
  ];

  return (
    <div className="space-y-6">
      {nudges.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-bold text-gray-800 mb-3">🧺 Your stock today</h3>
          <div className="space-y-2">
            {nudges.map((n, i) => (
              <p key={i} className={`text-sm rounded-lg px-3 py-2 border ${n.tone === 'red' ? 'bg-red-50 border-red-200 text-red-800' : n.tone === 'amber' ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-gray-50 border-gray-200 text-gray-700'}`}>
                {n.icon} {n.text}
              </p>
            ))}
          </div>
        </div>
      )}
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h3 className="text-lg font-bold text-gray-800 mb-1">🚚 On its way to you</h3>
        <p className="text-sm text-gray-500 mb-4">When it arrives, tap <strong>All arrived</strong>. If anything's short, damaged or you're turning some away, tap <strong>Something wrong?</strong> instead.</p>
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
                {s.senderNote && <p className="text-sm text-gray-700">💬 {s.fromName}: "{s.senderNote}"</p>}
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
                {/* v4.4: one tap when everything's there; the full form only when something's wrong */}
                {!detail[s.shipmentId] && (
                  <div className="mt-3 space-y-2">
                    <PhotoPicker photo={photos[s.shipmentId]} onChange={(p) => setPhotos({ ...photos, [s.shipmentId]: p })} disabled={busyId === s.shipmentId} />
                    {!photos[s.shipmentId] && <p className="text-xs text-gray-500">📷 A photo is optional, but it settles any disagreement about what arrived.</p>}
                    {/* v4.4c: a note to the farm without opening "Something wrong?" (private between you and the farm) */}
                    <input type="text" maxLength={280} value={notes[s.shipmentId] || ''} disabled={busyId === s.shipmentId}
                      onChange={(e) => setNotes({ ...notes, [s.shipmentId]: e.target.value })}
                      placeholder={`Note to ${s.fromName || 'the farm'} (optional), e.g. Lovely, thanks!`} aria-label="Note to the farm"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                    {s.terms && (s.terms.unitPrice != null || s.terms.total != null) && (
                      <p className="text-xs text-gray-600">Confirming agrees the price: {s.terms.unitPrice != null ? <>{gbp(s.terms.unitPrice)}/{s.unit}{s.terms.deliveryFee ? ` + ${gbp(s.terms.deliveryFee)} delivery` : ''}</> : gbp(s.terms.total)}{payOf(s) !== null ? <> · you'll pay <strong>{gbp(payOf(s))}</strong></> : null}</p>
                    )}
                    <div className="flex gap-3 flex-wrap items-center">
                      <button onClick={() => receive(s, true)} disabled={busyId === s.shipmentId || !approved}
                        className="bg-green-600 text-white text-base font-bold px-5 py-3 rounded-xl hover:bg-green-700 disabled:bg-gray-400">
                        {busyId === s.shipmentId ? '⛓️ Recording… (about 5 sec)' : `✅ All ${formatQty(s.quantitySent, s.unit)} arrived`}
                      </button>
                      <button onClick={() => setDetail({ ...detail, [s.shipmentId]: true })} disabled={busyId === s.shipmentId}
                        className="text-sm text-gray-700 underline underline-offset-2 hover:text-gray-900">Something wrong? Short, damaged or refusing some →</button>
                    </div>
                  </div>
                )}
                {detail[s.shipmentId] && (<>
                <button onClick={() => setDetail({ ...detail, [s.shipmentId]: false })} className="mt-3 text-xs text-gray-500 hover:underline">← Back to "all arrived"</button>
                <div className="flex gap-2 mt-2 flex-wrap items-center">
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
                  {busyId === s.shipmentId ? (photos[s.shipmentId] ? '📷 Uploading & recording…' : '⛓️ Recording… (about 5 sec)') : '✅ Confirm what arrived'}
                </button>
                </>)}
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
                    {s.shortfall > 0 && <span className="text-green-600 font-semibold"> · ⚠️ {formatQty(s.shortfall, s.unit)} missing</span>}
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
                  {s.senderNote && <p className="text-xs text-gray-600">💬 {s.fromName}: "{s.senderNote}"</p>}
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
              {r.billName && <p className="text-sm text-gray-600">🪑 {r.billName}</p>}
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
              className="text-sm font-semibold text-green-600 hover:text-green-700"
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