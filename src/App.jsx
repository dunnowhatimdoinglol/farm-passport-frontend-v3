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
import HomePage from './components/HomePage';
import { parseFarmLink } from './components/walletHelpers';
import {
  AUTH_EVENT, announceAuth,
  clearCustomerSession, clearRestaurantSession, readRestaurantSession
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
    } else if (window.location.pathname.startsWith('/supply') || window.location.pathname.startsWith('/checkpoint')) {
      // Opened from an NFC sticker: /supply?shipment=12  (old /checkpoint?batch=... links still work)
      setCurrentView('supply');
    } else if (window.location.pathname.startsWith('/admin')) {
      setCurrentView('admin');
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
    // Customer signed in → sign the restaurant out
    clearRestaurantSession();
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

  if (currentView === 'home') {
    return (
      <>
        <HomePage
          onNavigate={(view, start) => (view === 'badges' ? handleViewBadges() : goTo(view, start))}
          onLogin={openLoginModal}
          onRegister={openRegisterModal}
          signedInAs={user ? { label: 'My profile', view: 'badges' } : restaurantName ? { label: restaurantName, view: 'restaurant' } : null}
        />
        {authModal}
      </>
    );
  }

  return (
<div className="min-h-screen bg-red-500 p-4 pb-24">      {/* Email verification banner */}
        <div className="max-w-4xl mx-auto">
           <EmailVerificationBanner authToken={token} />

        {/* ── Header / nav bar ── */}
        <div className="text-center mb-6 pt-4">
          <h1 className="text-4xl font-bold text-green-600 mb-1">
            <button onClick={goHome} className="hover:opacity-80 transition" title="Back to the home page">🌾 Farm Passport</button>
          </h1>
          <p className="text-gray-500 text-sm">Scan produce to discover its story</p>

          <div className="mt-3 flex gap-2 justify-center flex-wrap">
            <button
              onClick={goHome}
              className="bg-white text-green-700 px-4 py-1.5 rounded-lg font-semibold hover:bg-green-50 transition text-sm"
            >
              🏠 Home
            </button>
            {currentView !== 'scanner' && (
              <button
                onClick={handleBackToScanner}
                className="text-green-700 hover:text-green-800 font-semibold text-sm underline"
              >
                ← Scan Another
              </button>
            )}

            {user ? (
              <>
               <button
  onClick={handleViewBadges}
  className="bg-green-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-green-700 transition text-sm"
>
  👤 Profile
</button>

                <button
                  onClick={() => setCurrentView('farmer')}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                >
                  👨‍🌾 Farmer Portal
                </button>

                <button
                  onClick={() => setCurrentView('restaurant')}
                  className="bg-orange-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-orange-700 transition text-sm"
                >
                  🍽️ Restaurant
                </button>

                <button
                  onClick={() => setCurrentView('supply')}
                  className="bg-teal-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-teal-700 transition text-sm"
                >
                  🚚 Supply Chain
                </button>

                <button
                 onClick={() => setCurrentView('leaderboard')}
                 className="bg-purple-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-purple-700 transition text-sm"
                 >
                    🏆 Leaderboard
                 </button>

                <button
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-gray-700 font-semibold text-sm"
                >
                  Logout
                </button>

                <p className="text-xs text-gray-400 w-full mt-1">Logged in as {user.email}</p>
              </>
            ) : (
              <>
                <button
                  onClick={handleViewBadges}
                  className="bg-green-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-green-700 transition text-sm"
                >
                  👤 Profile
                </button>

                <button
                  onClick={() => setCurrentView('farmer')}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                >
                  👨‍🌾 Farmer Portal
                </button>

                <button
                  onClick={() => setCurrentView('restaurant')}
                  className="bg-orange-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-orange-700 transition text-sm"
                >
                  🍽️ Restaurant
                </button>

                <button
                  onClick={() => setCurrentView('supply')}
                  className="bg-teal-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-teal-700 transition text-sm"
                >
                  🚚 Supply Chain
                </button>

                {restaurantName ? (
                  <>
                    <button
                      onClick={handleRestaurantLogout}
                      className="text-gray-500 hover:text-gray-700 font-semibold text-sm"
                    >
                      Logout
                    </button>
                    <p className="text-xs text-gray-400 w-full mt-1">
                      🍽️ Signed in as <strong>{restaurantName}</strong> (restaurant account)
                    </p>
                  </>
                ) : (
                  <button
                    onClick={openLoginModal}
                    className="bg-gray-700 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-gray-800 transition text-sm"
                  >
                    Login
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {authModal}

        {/* ── Success modal (receipt badge claim) ── */}
        {showSuccessModal && successInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-bounce-once overflow-y-auto max-h-screen">
              <div className="text-7xl mb-4">🎉</div>
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

        {currentView === 'farmer' && (
          <FarmerPortal
            onBackToCustomer={() => setCurrentView('home')}
            startOn={portalStart}
          />
        )}

        {currentView === 'restaurant' && (
          <RestaurantPortal
            onBack={handleBackToScanner}
            startOn={portalStart}
          />
        )}

        {currentView === 'supply' && (
          <SupplyChainPage onBack={handleBackToScanner} />
        )}

        {currentView === 'admin' && (
          <AdminPage onBack={handleBackToScanner} />
        )}

        {currentView === 'leaderboard' && (
  <Leaderboard
    authToken={token}
    onBack={handleBackToScanner}
  />
)}

      </div>
    </div>
  );
}

export default App;