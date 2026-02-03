import { useState, useEffect } from 'react';
import axios from 'axios';

import Login            from './components/Login';
import Register         from './components/Register';
import QRScanner        from './components/QRScanner';
import FarmStory        from './components/FarmStory';
import ReceiptView      from './components/ReceiptView';
import UnlockBadge      from './components/UnlockBadge';
import BadgeCollection  from './components/BadgeCollection';
import FarmerPortal       from './components/FarmerPortal';
import RestaurantPortal   from './components/RestaurantPortal';

function App() {
  // ── Auth state ──
  const [user,     setUser]     = useState(null);
  const [token,    setToken]    = useState(null);
  const [authView, setAuthView] = useState('login');   // 'login' | 'register'

  // ── View routing: scanner | farm | receipt | badges | farmer ──
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

  // ── Persist / clear session ──
  useEffect(() => {
    if (user && token) {
      localStorage.setItem('fp_auth', JSON.stringify({ user, token }));
    } else {
      localStorage.removeItem('fp_auth');
    }
  }, [user, token]);

  // ── Auth handlers (Login & Register both call this) ──
  const handleLogin = (userData, jwtToken) => {
    setUser(userData);
    setToken(jwtToken);
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    setCurrentView('scanner');
  };

  // ── Scanner callback ──
  // QRScanner calls onScanSuccess with { type: 'receipt', receiptId } or { type: 'batch', batchId }
  const handleScanComplete = (payload) => {
    if (payload && payload.type === 'receipt') {
      setCurrentReceiptId(payload.receiptId);
      setCurrentBatchId(null);
      setCurrentView('receipt');
    } else {
      // 'batch' typed payload  OR  plain string fallback
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
    setShowSuccessModal(false);
    setCurrentView('badges');
  };

  // ── Receipt claim success → celebrate modal ──
  const handleReceiptClaimSuccess = (badgeInfo) => {
    setSuccessInfo(badgeInfo);
    setShowSuccessModal(true);
  };

  // ──────────────────────────────────────────────────────
  // NOT LOGGED IN → Login / Register screen
  // ──────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Brand header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-green-600 mb-2">🌾 Farm Passport</h1>
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
    );
  }

  // ──────────────────────────────────────────────────────
  // LOGGED IN
  // ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 p-4 pb-24">
      <div className="max-w-4xl mx-auto">

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

            <button
              onClick={() => setCurrentView('badges')}
              className="bg-green-600 text-white px-4 py-1.5 rounded-lg font-semibold hover:bg-green-700 transition text-sm"
            >
              🏆 My Badges
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
              onClick={handleLogout}
              className="text-gray-500 hover:text-gray-700 font-semibold text-sm"
            >
              Logout
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-2">Logged in as {user.email}</p>
        </div>

        {/* ── Success modal (receipt badge claim) ── */}
        {showSuccessModal && successInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center animate-bounce-once">
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
          />
        )}

        {currentView === 'badges' && (
          <BadgeCollection
            userEmail={user.email}
            authToken={token}
            onBack={handleBackToScanner}
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

      </div>
    </div>
  );
}

export default App;