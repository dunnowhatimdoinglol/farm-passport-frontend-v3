import { useState, useEffect } from 'react';
import axios from 'axios';
import AchievementPopup from './AchievementPopup';

const API_BASE = 'http://localhost:3002/api';

/**
 * ReceiptView - Updated with achievement popups
 *
 * Props:
 *   receiptId       – the RECEIPT-YYYYMMDD-XXXXXX string
 *   authToken       – JWT (can be null if not logged in)
 *   onSuccess       – called after successful claim
 *   onBack          – navigate back
 *   onLoginRequired – opens login modal
 */
function ReceiptView({ receiptId, authToken, onSuccess, onBack, onLoginRequired }) {
  const [receipt,    setReceipt]    = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [claiming,   setClaiming]   = useState(false);
  const [claimError, setClaimError] = useState(null);
  const [claimed,    setClaimed]    = useState(false);

  // Achievement popup state
  const [achievements, setAchievements] = useState([]);
  const [currentAchievement, setCurrentAchievement] = useState(null);

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await axios.get(`${API_BASE}/receipt/${receiptId}`);
        const data = res.data.receipt || res.data.data || res.data;
        setReceipt(data);

        if (data.claimed) setClaimed(true);

      } catch (err) {
        console.error('ReceiptView fetch error:', err);
        setError(
          err.response?.data?.error ||
          'Could not load this receipt. Check the code and try again.'
        );
      } finally {
        setLoading(false);
      }
    };

    if (receiptId) fetchReceipt();
  }, [receiptId]);

  const handleClaim = async () => {
    // If not logged in, prompt login
    if (!authToken) {
      if (onLoginRequired) onLoginRequired();
      return;
    }

    try {
      setClaiming(true);
      setClaimError(null);

      const res = await axios.post(
        `${API_BASE}/receipt/${receiptId}/claim-badge`,
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setClaimed(true);

      // Show achievement popups if any were unlocked
      if (res.data.newAchievements && res.data.newAchievements.length > 0) {
        setAchievements(res.data.newAchievements);
        setCurrentAchievement(res.data.newAchievements[0]);
      }

      if (onSuccess) {
        onSuccess({
          farmName:        res.data.farmName        || res.data.farm_name        || farmName,
          batchId:         res.data.batchId         || res.data.batch_id         || batchId,
          restaurantName:  restaurantName,
          receiptId:       receiptId,
          transactionHash: res.data.transactionHash || res.data.transaction_hash || null,
        });
      }
    } catch (err) {
      console.error('ReceiptView claim error:', err);
      const msg = err.response?.data?.error || 'Failed to claim badge. Please try again.';
      setClaimError(msg);

      if (msg.toLowerCase().includes('already claimed') || msg.toLowerCase().includes('already been')) {
        setClaimed(true);
      }
    } finally {
      setClaiming(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⏳</div>
            <p className="text-gray-600">Loading receipt…</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Receipt Not Found</h2>
            <p className="text-red-600 mb-2">{error}</p>
            <p className="text-gray-500 text-sm mb-4">
              Make sure you scanned the correct QR code from your receipt.
            </p>
            <button
              onClick={onBack}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-semibold"
            >
              ← Back to Scanner
            </button>
          </div>
        </div>
      </div>
    );
  }

  const restaurantName = receipt.restaurantName || receipt.restaurant_name || 'Restaurant';
  const amountPaid     = receipt.amountPaid     || receipt.amount_paid;
  const batchId        = receipt.batchId        || receipt.batch_id;
  const farmName       = receipt.farmName       || receipt.farm_name || receipt.farmer?.farmName || 'Farm';
  const productName    = receipt.productName    || receipt.product_name;
  const createdAt      = receipt.createdAt      || receipt.created_at;
  const expiresAt      = receipt.expiresAt      || receipt.expires_at;
  const isExpired      = expiresAt ? new Date(expiresAt) < new Date() : false;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* Achievement Popup */}
      {currentAchievement && (
        <AchievementPopup
          achievement={currentAchievement}
          onClose={() => {
            // Show next achievement if any
            const nextIndex = achievements.indexOf(currentAchievement) + 1;
            if (nextIndex < achievements.length) {
              setCurrentAchievement(achievements[nextIndex]);
            } else {
              setCurrentAchievement(null);
            }
          }}
        />
      )}

      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">🧾</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-1">Your Receipt</h2>
          <p className="text-gray-600 text-lg">from <strong>{restaurantName}</strong></p>
        </div>

        <div className="flex justify-center gap-10 mb-6 flex-wrap">
          {amountPaid !== undefined && amountPaid !== null && (
            <div className="text-center">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Amount Paid</p>
              <p className="text-3xl font-bold text-gray-800">£{Number(amountPaid).toFixed(2)}</p>
            </div>
          )}
          {createdAt && (
            <div className="text-center">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Date</p>
              <p className="text-xl font-semibold text-gray-800">
                {new Date(createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'long', year: 'numeric'
                })}
              </p>
            </div>
          )}
        </div>

        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">🌱 Product Details</h3>
          <div className="grid grid-cols-2 gap-4">
            {productName && (
              <div>
                <p className="text-sm text-gray-600">Product</p>
                <p className="font-semibold text-gray-800">{productName}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600">Farm</p>
              <p className="font-semibold text-gray-800">{farmName}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Batch ID</p>
              <p className="font-mono text-sm font-semibold text-gray-800">{batchId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Receipt ID</p>
              <p className="font-mono text-sm font-semibold text-gray-800">{receiptId}</p>
            </div>
          </div>
        </div>
      </div>

      {isExpired && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 text-center">
          <p className="text-orange-700 font-bold">⏰ This receipt has expired</p>
          <p className="text-orange-600 text-sm mt-1">Receipts must be redeemed within 7 days of purchase.</p>
        </div>
      )}

      {claimed ? (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🎖️</div>
            <h3 className="text-2xl font-bold text-green-700 mb-2">Badge Already Claimed!</h3>
            <p className="text-green-600">
              You've already collected the badge from <strong>{farmName}</strong> using this receipt.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🎖️</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Claim Your Farm Badge!</h3>
            <p className="text-gray-600 mb-1">
              You supported <strong>{farmName}</strong> — now collect your badge!
            </p>
            <p className="text-gray-400 text-sm mb-6">This receipt can only be redeemed once.</p>

            {claimError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 max-w-sm mx-auto">
                <p className="text-red-600 text-sm font-semibold">⚠️ {claimError}</p>
              </div>
            )}

            <button
              onClick={handleClaim}
              disabled={claiming || isExpired}
              className={`px-8 py-3 rounded-lg font-bold text-lg transition shadow-md
                ${(claiming || isExpired)
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                  : 'bg-green-600 text-white hover:bg-green-700'
                }`}
            >
              {claiming    ? '⏳ Claiming…'
               : isExpired ? '⏰ Expired'
               : !authToken? '🔐 Login to Claim Badge'
               :            '🎖️ Claim Badge'}
            </button>

            {!authToken && (
              <p className="text-gray-500 text-sm mt-3">
                Click above to login and claim your badge
              </p>
            )}
          </div>
        </div>
      )}

      <div className="text-center">
        <button onClick={onBack} className="text-gray-600 hover:underline">
          ← Back to Scanner
        </button>
      </div>
    </div>
  );
}

export default ReceiptView;