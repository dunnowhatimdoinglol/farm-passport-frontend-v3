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
function App() {
  // ── Auth state ──
  const [user,     setUser]     = useState(null);
  const [token,    setToken]    = useState(null);
  
  // ── Auth modal state (login/register overlays) ──
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authView,      setAuthView]      = useState('login'); // 'login' | 'register'

  // ── View routing ──
  const [currentView,      setCurrentView]      = useState('scanner');
  const [currentBatchId,   setCurrentBatchId]   = useState(null);
  const [currentReceiptId, setCurrentReceiptId] = useState(null);

  // ── Success modal (receipt badge claim) ──
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successInfo,      setSuccessInfo]      = useState(null);

  // ── Restore session from localStorage on first render ──
  useEffect(() => {
    try {
      const saved = localStorage.getItem('fp_auth');
      if (saved) {
        const { user: u, token: t } = JSON.parse(saved);
        if (u && t) {
          setUser(u);
          setToken(t);
          console.log('User authenticated:', u.email);
        }
      }
    } catch (_) {}
  }, []);

  // Check if URL contains verification token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    
    if (token) {
      setCurrentView('verify-email');
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
    setUser(userData);
    setToken(jwtToken);
    setShowAuthModal(false);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setCurrentView('scanner');
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

  return (
<div className="min-h-screen bg-red-500 p-4 pb-24">      {/* Email verification banner */}
        <div className="max-w-4xl mx-auto">
           <EmailVerificationBanner authToken={token} />

        {/* ── Header / nav bar ── */}
        <div className="text-center mb-6 pt-4">
          <h1 className="text-4xl font-bold text-green-600 mb-1">🌾 Farm Passport</h1>
          <p className="text-gray-500 text-sm">Scan produce to discover its story</p>

          <div className="mt-3 flex gap-2 justify-center flex-wrap">
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
                  onClick={openLoginModal}
                  className="bg-gray-700 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-gray-800 transition text-sm"
                >
                  Login
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Auth Modal (Login / Register) ── */}
        {showAuthModal && (
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
        )}

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
                    href={`https://sepolia.etherscan.io/tx/${successInfo.transactionHash}`}
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
            onBackToCustomer={() => setCurrentView('scanner')}
          />
        )}

        {currentView === 'restaurant' && (
          <RestaurantPortal
            onBack={handleBackToScanner}
          />
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