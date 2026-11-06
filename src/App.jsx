import { useState, useEffect } from 'react';
import axios from 'axios';

import Login            from './components/Login';
import Register         from './components/Register';
import QRScanner        from './components/QRScanner';
import UserProfile from './components/UserProfile';
import FarmStory        from './components/FarmStory';
import ReceiptView      from './components/ReceiptView';
import UnlockBadge      from './components/UnlockBadge';
import BadgeCollection  from './components/BadgeCollection';
import FarmerPortal     from './components/FarmerPortal';
import RestaurantPortal from './components/RestaurantPortal';
import RestaurantFinder from './components/RestaurantFinder';
import EmailVerificationBanner from './components/EmailVerificationBanner';
import VerifyEmail from './components/VerifyEmail';
import Leaderboard from './components/Leaderboard';
import SupplyChainPage from './components/SupplyChainPage';
import AdminPage from './components/AdminPage';
import Maru from './components/Maru';
import AppNav from './components/AppNav';
import HomePage from './components/HomePage';
import LegalPage from './components/LegalPage';
import { parseFarmLink } from './components/walletHelpers';
import {
  AUTH_EVENT, announceAuth,
  clearCustomerSession, clearRestaurantSession, readRestaurantSession, clearFarmerSession
} from './authSession';

function App() {
  // ── Auth state ──
  const [user,     setUser]     = useState(null);
  const [token,    setToken]    = useState(null);

  // ── Restaurant sign-in (only one of customer / restaurant at a time) ──
  const [restaurantName, setRestaurantName] = useState(null);
  
  // ── Auth modal state (login/register overlays) ──
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authView,      setAuthView]      = useState('login'); // 'login' | 'register'

  // ── View routing ──
  const [currentView,      setCurrentView]      = useState('home');
  const [portalStart,      setPortalStart]      = useState(null);   // 'register' when arriving from a "Join" button
  const [currentBatchId,   setCurrentBatchId]   = useState(null);
  const [currentReceiptId, setCurrentReceiptId] = useState(null);

  // ── Success modal (receipt badge claim) ──
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo,      setSuccessInfo]      = useState(null);

  // ── Restore session from localStorage on first render ──
  useEffect(() => {
    let customerRestored = false;
    try {
      const saved = localStorage.getItem('fp_auth');
      if (saved) {
        const { user: u, token: t } = JSON.parse(saved);
        if (u && t) {
          setUser(u);
          setToken(t);
          customerRestored = true;
          console.log('User authenticated:', u.email);
        }
      }
    } catch (_) {}

    // If both logins were saved (from before this change), keep the customer one
    const restaurant = readRestaurantSession();
    if (restaurant && customerRestored) {
      clearRestaurantSession();
    } else if (restaurant) {
      setRestaurantName(restaurant.user.restaurantName);
    }
  }, []);

  // ── React to the restaurant portal logging in / out ──
  useEffect(() => {
    const onAuthChange = (e) => {
      const { role, action, name } = e.detail || {};
      if (role === 'restaurant' && action === 'login') {
        // Restaurant signed in → sign the customer out
        setUser(null);
        setToken(null);
        setRestaurantName(name || 'Restaurant');
      }
      if (role === 'restaurant' && action === 'logout') {
        setRestaurantName(null);
      }
    };
    window.addEventListener(AUTH_EVENT, onAuthChange);
    return () => window.removeEventListener(AUTH_EVENT, onAuthChange);
  }, []);

  // Check if URL contains verification token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      setCurrentView('verify-email');
    } else if (/^\/(r|b)\//.test(window.location.pathname)) {
      // Opened from a QR code or NFC tag: /r/<receiptId> or /b/<batchId>
      const link = parseFarmLink(window.location.pathname);
      if (link?.type === 'receipt') {
        setCurrentReceiptId(link.id);
        setCurrentView('receipt');
      } else if (link?.type === 'batch') {
        setCurrentBatchId(link.id);
        setCurrentView('farm');
      }
    } else if (/^\/(farm|cafe)\/?$/.test(window.location.pathname)) {
      // v4.4b: a button in an alert email, e.g. /farm?go=orders or /cafe?go=deliveries.
      // The dashboard opens on that tab, after signing in if needed.
      const go = params.get('go');
      const farm = window.location.pathname.startsWith('/farm');
      try { if (go) sessionStorage.setItem(farm ? 'fp_farm_tab' : 'fp_cafe_tab', go); } catch (_) { /* private window */ }
      window.history.replaceState({}, '', '/');
      setCurrentView(farm ? 'farmer' : 'restaurant');
    } else if (window.location.pathname.startsWith('/supply') || window.location.pathname.startsWith('/checkpoint')) {
      // v4.4b: alert emails to abattoirs open a tab of their panel: /supply?go=orders
      const go = params.get('go');
      try { if (go) sessionStorage.setItem('fp_proc_tab', go); } catch (_) { /* private window */ }
      // Opened from an NFC sticker: /supply?shipment=12  (old /checkpoint?batch=... links still work)
      setCurrentView('supply');
    } else if (window.location.pathname.startsWith('/admin')) {
      setCurrentView('admin');
    } else if (window.location.pathname.startsWith('/privacy')) {
      setCurrentView('privacy');
    } else if (window.location.pathname.startsWith('/terms')) {
      setCurrentView('terms');
    }
  }, []);

  // ── Persist / clear session ──
  useEffect(() => {
    if (user && token) {
      localStorage.setItem('fp_auth', JSON.stringify({ user, token }));
    } else {
      localStorage.removeItem('fp_auth');
    }
  }, [user, token]);

  // ── Auth handlers ──
  const handleLogin = (userData, jwtToken) => {
    // Diner signed in → sign the business accounts (café, farm) out: diner and business accounts are kept separate
    clearRestaurantSession();
    clearFarmerSession();
    setRestaurantName(null);
    announceAuth({ role: 'customer', action: 'login' });

    setUser(userData);
    setToken(jwtToken);
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    clearCustomerSession();
    setUser(null);
    setToken(null);
    setCurrentView('home');
  };

  const handleRestaurantLogout = () => {
    clearRestaurantSession();
    setRestaurantName(null);
    announceAuth({ role: 'restaurant', action: 'logout' });
    setCurrentView('home');
  };

  const openLoginModal = () => {
    setAuthView('login');
    setShowAuthModal(true);
  };

  const openRegisterModal = () => {
    setAuthView('register');
    setShowAuthModal(true);
  };

  // ── Scanner callback ──
  const handleScanComplete = (payload) => {
    // New QR codes hold a full link (…/r/<id> or …/b/<id>); old ones hold just the ID
    const raw = typeof payload === 'string' ? payload : (payload?.receiptId || payload?.batchId);
    const link = parseFarmLink(raw);
    if (link && raw && /\/(r|b)\//.test(raw)) {
      payload = link.type === 'receipt' ? { type: 'receipt', receiptId: link.id } : { batchId: link.id };
    }
    if (payload && payload.type === 'receipt') {
      setCurrentReceiptId(payload.receiptId);
      setCurrentBatchId(null);
      setCurrentView('receipt');
    } else {
      const batchId = payload?.batchId || payload;
      setCurrentBatchId(String(batchId));
      setCurrentReceiptId(null);
      setCurrentView('farm');
    }
  };

  // ── Navigation helpers ──
  const handleBackToScanner = () => {
    // Leaving a sticker/verification link → reset the address bar to the homepage
    if (window.location.pathname !== '/' || window.location.search) {
      window.history.replaceState({}, '', '/');
    }
    setCurrentBatchId(null);
    setCurrentReceiptId(null);
    setShowSuccessModal(false);
    setCurrentView('scanner');
  };

  const handleViewBadges = () => {
    // Redirect to login if not authenticated
    if (!user) {
      openLoginModal();
      return;
    }
    setShowSuccessModal(false);
    setCurrentView('badges');
  };

  // ── Receipt claim success ──
  const handleReceiptClaimSuccess = (badgeInfo) => {
    setSuccessInfo(badgeInfo);
    setShowSuccessModal(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };


  // ── Home page navigation ──
  const goTo = (view, start = null) => {
    setPortalStart(start);
    setCurrentView(view);
    window.scrollTo({ top: 0 });
  };
  // Privacy policy / Terms of use — get their own links (/privacy, /terms) so they can be shared
  const openLegal = (doc) => {
    window.history.replaceState({}, '', `/${doc}`);
    setShowAuthModal(false);
    goTo(doc);
  };
  const goHome = () => {
    if (window.location.pathname !== '/' || window.location.search) window.history.replaceState({}, '', '/');
    setShowSuccessModal(false);
    goTo('home');
  };

  const authModal = (
    showAuthModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative">
              <button
                onClick={() => setShowAuthModal(false)}
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>

              <div className="text-center mb-6">
                <h1 className="text-3xl font-bold text-green-600 mb-2">🌾 Farm Passport</h1>
                <p className="text-gray-600">Discover the story behind your food</p>
              </div>

              {authView === 'login' ? (
                <Login
                  onLogin={handleLogin}
                  onSwitchToRegister={() => setAuthView('register')}
                />
              ) : (
                <Register
                  onRegister={handleLogin}
                  onSwitchToLogin={() => setAuthView('login')}
                />
              )}
            </div>
          </div>
        )
  );

  if (currentView === 'privacy' || currentView === 'terms') {
    return <LegalPage doc={currentView} onBack={goHome} onSwitch={openLegal} />;
  }

  if (currentView === 'home') {
    return (
      <>
        <HomePage
          onNavigate={(view, start) => (
            view === 'badges' ? handleViewBadges()
            : view === 'privacy' || view === 'terms' ? openLegal(view)
            : goTo(view, start)
          )}
          onLogin={openLoginModal}
          onRegister={openRegisterModal}
          signedInAs={user ? { label: 'My profile', view: 'badges' } : restaurantName ? { label: restaurantName, view: 'restaurant' } : null}
        />
        {authModal}
      </>
    );
  }

  // v4.5: the floating top bar (same buttons as before)
  const topNav = (
    <AppNav
      current={currentView}
      user={user}
      restaurantName={restaurantName}
      onHome={goHome}
      onScan={handleBackToScanner}
      onProfile={handleViewBadges}
      onGo={(v) => setCurrentView(v)}
      onLogout={handleLogout}
      onRestaurantLogout={handleRestaurantLogout}
      onLogin={openLoginModal}
    />
  );

  // v4.5: dashboards fill the screen with their own sidebar (signed out, they show the top bar instead)
  if (currentView === 'farmer' && !user) {
    return (
      <>
        {authModal}
        <FarmerPortal onBackToCustomer={goHome} startOn={portalStart} topNav={topNav} />
      </>
    );
  }
  if (currentView === 'supply') {
    return (
      <>
        {authModal}
        <SupplyChainPage onBack={handleBackToScanner} onHome={goHome} topNav={topNav} />
      </>
    );
  }
  if (currentView === 'admin') {
    return (
      <>
        {authModal}
        <AdminPage onBack={handleBackToScanner} onHome={goHome} topNav={topNav} />
      </>
    );
  }
  if (currentView === 'restaurant') {
    return (
      <>
        {authModal}
        <RestaurantPortal onBack={handleBackToScanner} onHome={goHome} topNav={topNav} startOn={portalStart} />
      </>
    );
  }

  return (
    // v4.5: the home page's look. A floating bar on top (same buttons as before), warm paper background.
    <div className="fp-app min-h-screen bg-gray-50 px-3 sm:px-4 pt-3 pb-24">
        {topNav}
      <div className="max-w-4xl mx-auto">
        <EmailVerificationBanner authToken={token} />

        {authModal}

        {/* ── Success modal (receipt badge claim) ── */}
        {showSuccessModal && successInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-bounce-once overflow-y-auto max-h-screen">
              {/* v4.4b: Maru pops up and hands over the medal */}
              <div className="flex justify-center mt-8 mb-2"><Maru mode="give" size={170} flyAway={2800} /></div>
              <h2 className="text-3xl font-bold text-gray-800 mb-2">Badge Unlocked!</h2>
              <p className="text-gray-600">
                You've earned a badge from <strong>{successInfo.farmName}</strong>!
              </p>

              {successInfo.transactionHash && (
                <p className="text-xs text-gray-400 mt-2">
                  Blockchain tx:{' '}
                  <a
                    href={`https://sepolia.basescan.org/tx/${successInfo.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-mono"
                  >
                    {successInfo.transactionHash.slice(0, 14)}…
                  </a>
                </p>
              )}

              <RestaurantFinder
                batchId={successInfo.batchId}
                excludeRestaurant={successInfo.restaurantName}
              />

              <div className="flex gap-3 justify-center mt-6">
                <button
                  onClick={handleViewBadges}
                  className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-green-700 transition"
                >
                  🏆 View My Badges
                </button>
                <button
                  onClick={() => { setShowSuccessModal(false); handleBackToScanner(); }}
                  className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-bold hover:bg-gray-200 transition"
                >
                  Scan Another
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ──────────────── VIEW ROUTING ──────────────── */}

        {currentView === 'scanner' && (
          <QRScanner onScanSuccess={handleScanComplete} />
        )}

        {currentView === 'farm' && currentBatchId && (
          <FarmStory
            batchId={currentBatchId}
            onBack={handleBackToScanner}
            onViewBadges={handleViewBadges}
            viewOnly={true}
          />
        )}

        {currentView === 'receipt' && currentReceiptId && (
          <ReceiptView
            receiptId={currentReceiptId}
            authToken={token}
            onSuccess={handleReceiptClaimSuccess}
            onBack={handleBackToScanner}
            onLoginRequired={openLoginModal}
          />
        )}

        {currentView === 'badges' && (
  <UserProfile
    authToken={token}
    onBack={handleBackToScanner}
  />
)}
        {currentView === 'verify-email' && (
          <VerifyEmail
            onBack={() => {
              // Clear token from URL
              window.history.replaceState({}, '', window.location.pathname);
              handleBackToScanner();
            }}
          />
        )}

        {currentView === 'farmer' && (user ? (
          // Diner accounts are kept separate from farm accounts
          <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-8 text-center space-y-4">
            <div className="text-5xl">👨‍🌾</div>
            <h2 className="text-xl font-bold text-gray-800">You're signed in as a diner</h2>
            <p className="text-sm text-gray-600">
              Farm accounts are kept separate from diner accounts. Log out of <strong>{user.email}</strong> to use the Farmer Portal.
            </p>
            <button onClick={() => { clearCustomerSession(); setUser(null); setToken(null); announceAuth({ role: 'customer', action: 'logout' }); }}
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Log out and open the Farmer Portal</button>
            <button onClick={goHome} className="text-gray-600 hover:underline text-sm">← Back</button>
          </div>
        ) : (
          <FarmerPortal
            onBackToCustomer={() => setCurrentView('home')}
            startOn={portalStart}
          />
        ))}


        {currentView === 'leaderboard' && (
  <Leaderboard
    authToken={token}
    onBack={handleBackToScanner}
  />
)}

        {/* ── Footer: legal links ── */}
        <div className="text-center text-xs text-gray-500 mt-10 space-x-3">
          <button onClick={() => openLegal('privacy')} className="hover:underline">Privacy policy</button>
          <span>·</span>
          <button onClick={() => openLegal('terms')} className="hover:underline">Terms of use</button>
        </div>

      </div>
    </div>
  );
}

export default App;