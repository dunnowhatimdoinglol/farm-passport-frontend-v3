import { useState, useEffect } from 'react';
import axios from 'axios';
import AchievementPopup from './AchievementPopup';
import JourneyTimeline from './JourneyTimeline';

const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';

const money = (n) => `£${Number(n).toFixed(2)}`;
const qty = (n, unit) => `${Number(n).toLocaleString('en-GB', { maximumFractionDigits: 3 })} ${unit || ''}`.trim();
const listOf = (names) => names.length <= 1 ? (names[0] || 'the farm')
  : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/**
 * ReceiptView (v4.1) — a diner's receipt: the bill, every product (and farm) on it, each one's journey,
 * and claiming a badge for every farm on the bill (or a stamp on a badge they already have).
 * Old one-product receipts look and work the same as before.
 *
 * Props:
 *   receiptId       – the RECEIPT-YYYYMMDD-XXXXXX string
 *   authToken       – JWT (can be null if not logged in)
 *   onSuccess       – called after a successful claim (opens the success popup)
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
  const [result,     setResult]     = useState(null);   // what the claim gave: badges and/or stamps
  const [journeyOf,  setJourneyOf]  = useState(null);   // which product's journey is showing

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
        setError(err.response?.data?.error || 'Could not load this receipt. Check the code and try again.');
      } finally {
        setLoading(false);
      }
    };
    if (receiptId) fetchReceipt();
  }, [receiptId]);

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
            <p className="text-gray-500 text-sm mb-4">Make sure you scanned the correct QR code from your receipt.</p>
            <button onClick={onBack} className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-semibold">
              ← Back to Scanner
            </button>
          </div>
        </div>
      </div>
    );
  }

  const restaurantName = receipt.restaurantName || receipt.restaurant_name || 'Restaurant';
  const amountPaid     = receipt.amountPaid     ?? receipt.amount_paid;
  const createdAt      = receipt.createdAt      || receipt.created_at;
  const expiresAt      = receipt.expiresAt      || receipt.expires_at;
  const isExpired      = expiresAt ? new Date(expiresAt) < new Date() : false;
  const lines          = receipt.lines || [];
  const discount       = receipt.discount || null;
  const subtotal       = receipt.subtotal ?? null;

  // Every product on the bill (v4.1). Old receipts: the one batch they were made from.
  const products = (receipt.products && receipt.products.length) ? receipt.products : [{
    batchId:     receipt.batchId || receipt.batch_id,
    productName: receipt.productName || receipt.product_name || receipt.batch?.productName || null,
    unit:        receipt.batch?.unit || '',
    farmName:    receipt.farmName || receipt.farm_name || receipt.farmer?.farmName || 'Farm',
    quantity:    receipt.quantitySold ?? receipt.quantity_sold ?? null,
    shipmentId:  receipt.shipmentId || null,
    recalled:    !!receipt.batch?.recalled,
  }];
  const farms = [...new Set(products.map(p => p.farmName).filter(Boolean))];
  const farmText = listOf(farms);
  const shown = products.find(p => p.batchId === journeyOf) || products[0];
  const anyRecalled = products.some(p => p.recalled);

  const handleClaim = async () => {
    if (!authToken) { if (onLoginRequired) onLoginRequired(); return; }
    try {
      setClaiming(true);
      setClaimError(null);
      const res = await axios.post(`${API_BASE}/receipt/${receiptId}/claim-badge`, {},
        { headers: { Authorization: `Bearer ${authToken}` } });
      const d = res.data;
      setClaimed(true);
      // Older backends only send one badge; make it look like the new list
      const list = d.badges || [{ batchId: d.batchId, isNew: !d.stamp, farmName: d.farmName, productName: d.productName,
                                  collectorNumber: d.collectorNumber, isLimited: d.isLimited, supportCount: d.supportCount }];
      setResult({ ...d, badges: list });

      if (d.newAchievements && d.newAchievements.length > 0) {
        setAchievements(d.newAchievements);
        setCurrentAchievement(d.newAchievements[0]);
      }
      // A new badge (not only stamps) → the celebration popup
      if (!d.stamp && onSuccess) {
        onSuccess({
          farmName:        d.farmName || farmText,
          batchId:         d.batchId || products[0].batchId,
          restaurantName,
          receiptId,
          transactionHash: d.transactionHash || null,
          badges:          list,
        });
      }
    } catch (err) {
      console.error('ReceiptView claim error:', err);
      const msg = err.response?.data?.error || 'Failed to claim badge. Please try again.';
      setClaimError(msg);
      if (msg.toLowerCase().includes('already claimed') || msg.toLowerCase().includes('already been')) setClaimed(true);
    } finally {
      setClaiming(false);
    }
  };

  const okBadges = (result?.badges || []).filter(b => !b.error);
  const newCount = okBadges.filter(b => b.isNew).length;
  const stampCount = okBadges.length - newCount;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {currentAchievement && (
        <AchievementPopup
          achievement={currentAchievement}
          onClose={() => {
            const nextIndex = achievements.indexOf(currentAchievement) + 1;
            setCurrentAchievement(nextIndex < achievements.length ? achievements[nextIndex] : null);
          }}
        />
      )}

      {/* ── The receipt ── */}
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
              <p className="text-3xl font-bold text-gray-800">{money(amountPaid)}</p>
            </div>
          )}
          {createdAt && (
            <div className="text-center">
              <p className="text-sm text-gray-500 uppercase tracking-wide">Date</p>
              <p className="text-xl font-semibold text-gray-800">
                {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>

        {/* The bill (v4.1 receipts with dishes) */}
        {lines.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-5 mb-6">
            <h3 className="font-bold text-gray-800 mb-3">🍽️ What you had</h3>
            <div className="space-y-1">
              {lines.map((l, i) => (
                <div key={i} className="flex justify-between text-gray-700">
                  <span>{l.servings > 1 ? `${l.servings} × ` : ''}{l.name}</span>
                  {l.lineTotal !== null && <span>{money(l.lineTotal)}</span>}
                </div>
              ))}
            </div>
            {discount && subtotal !== null && (
              <div className="flex justify-between text-sm text-gray-500 mt-2 pt-2 border-t border-gray-100">
                <span>Discount{discount.type === 'percent' ? ` (${discount.value}%)` : ''}</span>
                <span>−{money(Math.max(0, subtotal - Number(amountPaid || 0)))}</span>
              </div>
            )}
          </div>
        )}

        {/* Where it came from — one row per product / farm */}
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6">
          <h3 className="text-xl font-bold text-gray-800 mb-1">🌱 Where your food came from</h3>
          <p className="text-sm text-gray-600 mb-4">
            {products.length > 1 ? `${products.length} products from ${farmText}` : `From ${farmText}`}
            {products.length > 1 && ' — each one’s story is below'}
          </p>
          <div className="space-y-2">
            {products.map(p => {
              const active = shown.batchId === p.batchId;
              return (
                <button key={p.batchId} type="button" onClick={() => { setJourneyOf(p.batchId); document.getElementById(`journey-${p.batchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                  className={`w-full text-left bg-white rounded-lg px-4 py-3 border-2 transition flex justify-between items-center gap-3
                    ${active && products.length > 1 ? 'border-green-500' : 'border-transparent hover:border-green-300'}`}>
                  <div>
                    <p className="font-semibold text-gray-800">
                      {p.productName || 'Product'}{p.recalled && <span className="ml-2 text-red-600 text-sm">🚨 recalled</span>}
                    </p>
                    <p className="text-sm text-gray-600">{p.farmName || 'Farm'}</p>
                    <p className="font-mono text-xs text-gray-400">{p.batchId}</p>
                  </div>
                  {p.quantity !== null && p.quantity !== undefined && (
                    <span className="text-sm text-gray-500 whitespace-nowrap">{qty(p.quantity, p.unit)}</span>
                  )}
                </button>
              );
            })}
          </div>
          <p className="font-mono text-xs text-gray-400 mt-4">Receipt {receiptId}</p>
        </div>

        {anyRecalled && (
          <div className="mt-4 bg-red-50 border border-red-300 rounded-lg p-4">
            <p className="text-red-700 font-bold">🚨 Something on this receipt has since been recalled</p>
            <p className="text-red-600 text-sm mt-1">Check its journey below for the farm's recall notice.</p>
          </div>
        )}
      </div>

      {/* v4.4b: the journey of every product on the bill (a dish with carrots, beans and steak shows all three) */}
      {products.filter(p => p.batchId).map(p => (
        <div key={p.batchId} id={`journey-${p.batchId}`} className="scroll-mt-4">
          <JourneyTimeline batchId={p.batchId} shipmentId={p.shipmentId || null} />
        </div>
      ))}

      {isExpired && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 text-center">
          <p className="text-orange-700 font-bold">⏰ This receipt has expired</p>
          <p className="text-orange-600 text-sm mt-1">Receipts must be redeemed within 7 days of purchase.</p>
        </div>
      )}

      {/* ── Claiming ── */}
      {result ? (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-5">
            <div className="text-6xl mb-3">{newCount ? '🎖️' : '⭐'}</div>
            <h3 className="text-2xl font-bold text-green-700">
              {newCount && stampCount ? `${newCount} new badge${newCount > 1 ? 's' : ''} + ${stampCount} stamp${stampCount > 1 ? 's' : ''}!`
                : newCount ? (newCount > 1 ? `${newCount} new badges!` : 'Badge collected!')
                : (stampCount > 1 ? `${stampCount} stamps added!` : 'Stamp added!')}
            </h3>
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            {result.badges.map(b => (
              <div key={b.batchId} className={`rounded-lg px-4 py-3 border ${b.error ? 'bg-gray-50 border-gray-200' : b.isNew ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <p className="font-semibold text-gray-800">
                  {b.error ? '⚠️' : b.isNew ? '🎖️' : '⭐'} {b.farmName || 'Farm'}{b.productName ? ` — ${b.productName}` : ''}
                </p>
                <p className="text-sm text-gray-600">
                  {b.error ? b.error
                    : b.isNew ? `New badge${b.collectorNumber ? ` · collector #${b.collectorNumber}` : ''}${b.isLimited ? ' · ✨ limited' : ''}`
                    : `You already had this badge — ${restaurantName} stamp added${b.supportCount ? ` · supported ${b.supportCount}×` : ''}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : claimed ? (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🎖️</div>
            <h3 className="text-2xl font-bold text-green-700 mb-2">Badge Already Claimed!</h3>
            <p className="text-green-600">
              The {farms.length > 1 ? 'badges' : 'badge'} from <strong>{farmText}</strong> on this receipt {farms.length > 1 ? 'have' : 'has'} already been collected.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🎖️</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">
              {products.length > 1 ? `Claim ${products.length} Farm Badges!` : 'Claim Your Farm Badge!'}
            </h3>
            <p className="text-gray-600 mb-1">
              You supported <strong>{farmText}</strong> — now collect your {products.length > 1 ? 'badges' : 'badge'}!
            </p>
            {products.length > 1 && (
              <p className="text-gray-500 text-sm">One for each product on your bill. If you already have one, you get a stamp on it instead.</p>
            )}
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
                ${(claiming || isExpired) ? 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none' : 'bg-green-600 text-white hover:bg-green-700'}`}
            >
              {claiming    ? '⏳ Claiming…'
               : isExpired ? '⏰ Expired'
               : !authToken? `🔐 Login to Claim ${products.length > 1 ? 'Badges' : 'Badge'}`
               :            `🎖️ Claim ${products.length > 1 ? `${products.length} Badges` : 'Badge'}`}
            </button>

            {!authToken && <p className="text-gray-500 text-sm mt-3">Click above to login and claim</p>}
          </div>
        </div>
      )}

      <div className="text-center">
        <button onClick={onBack} className="text-gray-600 hover:underline">← Back to Scanner</button>
      </div>
    </div>
  );
}

export default ReceiptView;