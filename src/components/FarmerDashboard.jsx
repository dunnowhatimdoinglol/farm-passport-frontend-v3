import { useState, useEffect } from 'react';
import axios from 'axios';
import CreateBatchForm from './CreateBatchForm';
import { QRCodeSVG } from 'qrcode.react';
import { FarmerOrders, DispatchForm, FarmerShipments, FarmerReturns } from './FarmerSupply';
import { formatQty, batchLink } from './walletHelpers';
import NfcShare from './NfcShare';

// farmerToken = sign-in token from FarmerPortal (the private key is never sent to the server)
function FarmerDashboard({ farmerToken, farmerAddress, season, setSeason, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [farmerData, setFarmerData] = useState(null);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dispatchBatchId, setDispatchBatchId] = useState(null);   // which batch's "Send" form is open
  const [priceEdit, setPriceEdit] = useState({});   // batchId → price being typed (only while editing)
  const [priceSaving, setPriceSaving] = useState(null);
  const [priceError, setPriceError] = useState({});
  const authHeader = { headers: { Authorization: `Bearer ${farmerToken}` } };

  // Bio editing state
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState('');
  const [bioSaving, setBioSaving] = useState(false);
  const [bioError, setBioError] = useState('');

  // Email verification resend state
  const [resendingEmail, setResendingEmail] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const [resendError, setResendError] = useState('');

  // Which batch is being recalled (hooks must all sit up here, before any early "return")
  const [recallBusy, setRecallBusy] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, [refreshTrigger]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/dashboard', {}, authHeader);

      setFarmerData(response.data);

      // Fetch farmer profile (bio) if we have the address
      if (response.data.farmer?.address) {
        try {
          const profileRes = await axios.get(
            `https://farm-passport-backend-v3.onrender.com/api/farmer/profile/${response.data.farmer.address}`
          );
          setBioText(profileRes.data.profile?.bio || '');
        } catch (err) {
          console.log('No profile yet:', err.message);
          setBioText('');
        }
      }
    } catch (err) {
      console.error('Dashboard error:', err);
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBatchCreated = () => {
    setShowCreateBatch(false);
    setRefreshTrigger(prev => prev + 1);
  };

  const handleSaveBio = async () => {
    if (!farmerData?.farmer?.address) return;

    try {
      setBioSaving(true);
      setBioError('');

      await axios.put(
        `https://farm-passport-backend-v3.onrender.com/api/farmer/profile/${farmerData.farmer.address}`,
        { bio: bioText.trim() },
        authHeader
      );

      setEditingBio(false);
    } catch (err) {
      console.error('Error saving bio:', err);
      setBioError(err.response?.data?.error || 'Failed to save bio');
    } finally {
      setBioSaving(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      setResendingEmail(true);
      setResendError('');
      setResendSuccess('');

      const res = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/resend-verification', {
        farmerAddress
      });

      setResendSuccess(res.data.message);
      console.log('✅ Verification email resent');

    } catch (err) {
      console.error('Error resending verification:', err);
      setResendError(err.response?.data?.error || 'Failed to resend email');
    } finally {
      setResendingEmail(false);
    }
  };

  const downloadQRCode = (batchId, productName) => {
    const svg = document.getElementById(`qr-download-${batchId}`);
    if (!svg) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 512;

    const svgData = new XMLSerializer().serializeToString(svg);
    const img = new Image();
    
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const link = document.createElement('a');
      link.download = `${batchId}-${productName.replace(/\s+/g, '-')}-QR.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-pulse">
            <div className="text-4xl mb-4">👨‍🌾</div>
            <p className="text-gray-600">Loading dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto">
        <div className="bg-red-100 border border-red-400 rounded-lg p-6">
          <h3 className="font-bold text-red-700 mb-2">Error Loading Dashboard</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={onLogout}
            className="text-blue-600 hover:underline"
          >
            ← Back to Login
          </button>
        </div>
      </div>
    );
  }

  if (!farmerData || !farmerData.farmer) {
    return null;
  }

  const { farmer, batches } = farmerData;
  const approved = farmer.approvalStatus === 'approved';
  const refreshAll = () => setRefreshTrigger(prev => prev + 1);

  // Recall a batch (food safety): no more dispatches or sales; cafés holding it are warned
  const recallBatch = async (batchId, productName) => {
    const reason = window.prompt(
      `Recall ${productName} (${batchId})?\n\nThis is recorded on the blockchain. It stops any more dispatches and sales from this batch, ` +
      `and every café holding it is warned.\n\nReason (shown to cafés and customers):`
    );
    if (reason === null) return;
    if (!reason.trim()) { window.alert('Please give a reason for the recall.'); return; }
    setRecallBusy(batchId);
    try {
      const res = await axios.post(
        `https://farm-passport-backend-v3.onrender.com/api/farmer/batches/${encodeURIComponent(batchId)}/recall`,
        { reason: reason.trim() },
        { headers: { Authorization: `Bearer ${farmerToken}` } }
      );
      const holders = res.data.holders || [];
      window.alert(holders.length
        ? `Recalled. These businesses are holding stock from this batch and have been warned in the app:\n\n• ${holders.join('\n• ')}\n\nPlease contact them directly too.`
        : 'Recalled. Nobody is holding stock from this batch right now.');
      refreshAll();
    } catch (err) {
      window.alert(err.response?.data?.error || 'Could not recall the batch');
    } finally {
      setRecallBusy(null);
    }
  };

  // Save (or clear) the default price per unit for a batch — only the farm & restaurants see it
  const saveBatchPrice = async (batchId) => {
    const raw = priceEdit[batchId];
    const value = raw === '' || raw === undefined ? null : Number(raw);
    if (value !== null && (isNaN(value) || value < 0)) {
      setPriceError({ ...priceError, [batchId]: 'Enter a price of 0 or more' });
      return;
    }
    setPriceSaving(batchId);
    setPriceError({ ...priceError, [batchId]: null });
    try {
      await axios.put(
        `https://farm-passport-backend-v3.onrender.com/api/farmer/batches/${encodeURIComponent(batchId)}/price`,
        { pricePerUnit: value },
        { headers: { Authorization: `Bearer ${farmerToken}` } }
      );
      const next = { ...priceEdit }; delete next[batchId]; setPriceEdit(next);
      refreshAll();
    } catch (err) {
      setPriceError({ ...priceError, [batchId]: err.response?.data?.error || 'Could not save price' });
    } finally {
      setPriceSaving(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      
      {/* Email Verification Warning */}
      {!farmer.emailVerified && (
        <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚠️</span>
            <div className="flex-1">
              <h3 className="font-bold text-yellow-800 mb-2">
                Email Verification Required
              </h3>
              <p className="text-sm text-yellow-700 mb-3">
                Please verify your email to create batches. Check your inbox for the verification link.
              </p>
              
              {resendSuccess && (
                <div className="bg-green-100 border border-green-400 text-green-700 px-3 py-2 rounded mb-3 text-sm">
                  ✅ {resendSuccess}
                </div>
              )}
              
              {resendError && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm">
                  ❌ {resendError}
                </div>
              )}
              
              <button
                onClick={handleResendVerification}
                disabled={resendingEmail}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg hover:bg-yellow-700 transition font-semibold disabled:bg-gray-400 text-sm"
              >
                {resendingEmail ? 'Sending...' : '📧 Resend Verification Email'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Waiting for approval */}
      {!approved && (
        <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-6 mb-6">
          <h3 className="font-bold text-blue-800 mb-1">⏳ Your farm is waiting for approval</h3>
          <p className="text-sm text-blue-700">
            We check every new farm before it goes on the blockchain. Once approved you'll be able to create batches
            and accept orders. {!farmer.emailVerified && 'Please verify your email in the meantime.'}
          </p>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Farmer Dashboard</h1>
          <p className="text-gray-600">Welcome back, {farmer.farmName}!</p>
        </div>
        <button
          onClick={onLogout}
          className="bg-gray-600 text-white px-6 py-2 rounded-lg hover:bg-gray-700 transition"
        >
          Logout
        </button>
      </div>

      {/* Farm Overview Card */}
      <div className="bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <span className="text-4xl">🏡</span>
              <div>
                <h2 className="text-2xl font-bold">{farmer.farmName}</h2>
                <p className="text-green-100">📍 {farmer.location}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-green-500">
          <p className="text-xs text-green-100 mb-1">Wallet Address:</p>
          <p className="font-mono text-sm break-all">{farmer.address}</p>
        </div>
      </div>

      {/* Farm Bio Section */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800">📝 Farm Bio</h3>
          {!editingBio && (
            <button
              onClick={() => setEditingBio(true)}
              className="text-blue-600 hover:underline text-sm font-semibold"
            >
              ✏️ Edit
            </button>
          )}
        </div>

        {editingBio ? (
          <div>
            <textarea
              value={bioText}
              onChange={(e) => setBioText(e.target.value)}
              placeholder="Tell customers about your farm, your animals, and your farming practices..."
              rows="6"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
              maxLength="500"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">{bioText.length}/500 characters</p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingBio(false);
                    setBioError('');
                    // Reset to original
                    fetchDashboardData();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition"
                  disabled={bioSaving}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveBio}
                  disabled={bioSaving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:bg-gray-400"
                >
                  {bioSaving ? 'Saving...' : 'Save Bio'}
                </button>
              </div>
            </div>
            {bioError && (
              <p className="text-red-600 text-sm mt-2">⚠️ {bioError}</p>
            )}
          </div>
        ) : (
          <div>
            {bioText ? (
              <p className="text-gray-700 whitespace-pre-wrap">{bioText}</p>
            ) : (
              <p className="text-gray-400 italic">
                No bio yet. Click "Edit" to tell customers about your farm!
              </p>
            )}
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            💡 This bio will appear on the farm story page when customers scan your product QR codes.
          </p>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">📦</div>
            <div>
              <p className="text-gray-500 text-sm">Total Batches</p>
              <p className="text-3xl font-bold text-gray-800">{batches.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">🎖️</div>
            <div>
              <p className="text-gray-500 text-sm">Badges Unlocked</p>
              <p className="text-3xl font-bold text-gray-800">
                {batches.reduce((sum, batch) => sum + (batch.unlocks || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Orders from restaurants */}
      <FarmerOrders farmerToken={farmerToken} approved={approved} refreshKey={refreshTrigger} onChanged={refreshAll} />

      {/* Shipments sent */}
      <FarmerShipments farmerToken={farmerToken} refreshKey={refreshTrigger} onChanged={refreshAll} />

      {/* Returns coming back to the farm (only shows when there are some) */}
      <FarmerReturns farmerToken={farmerToken} refreshKey={refreshTrigger} onChanged={refreshAll} />

      {/* Create Batch Button / Form */}
      {!showCreateBatch ? (
        <button
          onClick={() => setShowCreateBatch(true)}
          disabled={!approved}
          className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition mb-6 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {approved ? '➕ Create New Batch' : '🔒 Create batches once approved'}
        </button>
      ) : (
        <div className="mb-6">
          <CreateBatchForm
            farmerToken={farmerToken}
            season={season}
            setSeason={setSeason}
            onSuccess={handleBatchCreated}
            onCancel={() => setShowCreateBatch(false)}
          />
        </div>
      )}

      {/* Batches List */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-800 mb-4">
          Your Batches ({batches.length})
        </h3>

        {batches.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📦</div>
            <h4 className="text-xl font-semibold text-gray-700 mb-2">
              No Batches Yet
            </h4>
            <p className="text-gray-600 mb-6">
              Create your first batch to start tracking your products!
            </p>
            <button
              onClick={() => setShowCreateBatch(true)}
              className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition"
            >
              Create First Batch
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {batches.map((batch, index) => {
              const batchId = String(batch.batchId || 'Unknown');
              const productType = String(batch.productType || 'Unknown');
              const productName = String(batch.productName || 'Unknown');
              const quantity = String(batch.quantity || '0');
              const unit = String(batch.unit || '');
              const timestamp = batch.timestamp || new Date().toISOString();
              const txHash = String(batch.transactionHash || '');
              
              const getEmoji = (type) => {
                const typeStr = String(type).toLowerCase();
                if (typeStr.includes('vegetable')) return '🥬';
                if (typeStr.includes('fruit')) return '🍎';
                if (typeStr.includes('meat')) return '🥩';
                if (typeStr.includes('dairy')) return '🥛';
                if (typeStr.includes('grain')) return '🌾';
                return '📦';
              };
              
              return (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{getEmoji(productType)}</span>
                        <div>
                          <h4 className="font-bold text-gray-800 text-lg">
                            {productName}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {productType} • {quantity} {unit}
                          </p>
                        </div>
                      </div>
                      
                      <p className="text-xs text-gray-500 mb-1 font-mono">
                        ID: {batchId}
                      </p>
                      
                      {(batch.harvestDate || batch.useBy) && (
                        <p className="text-sm text-gray-600">
                          {batch.harvestDate && <>Harvested {new Date(batch.harvestDate).toLocaleDateString('en-GB')}</>}
                          {batch.useBy && (
                            <span className={new Date(batch.useBy) < new Date() ? 'text-red-600 font-semibold' : ''}>
                              {batch.harvestDate ? ' · ' : ''}Use by {new Date(batch.useBy).toLocaleDateString('en-GB')}
                              {new Date(batch.useBy) < new Date() ? ' (passed)' : ''}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="text-sm text-gray-600 mb-2">
                        Created: {new Date(timestamp).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      
                      {txHash && (
                        <a
                          href={`https://sepolia.basescan.org/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs font-mono"
                        >
                          View on Basescan ↗
                        </a>
                      )}
                    </div>

                    {/* QR Code */}
                    <div className="ml-4">
                      <div className="bg-white p-2 border-2 border-gray-300 rounded-lg">
                        <QRCodeSVG
                          value={batchLink(batchId)}
                          size={100}
                          level="H"
                          includeMargin={true}
                          bgColor="#ffffff"
                          fgColor="#000000"
                        />
                      </div>
                      <p className="text-xs text-center text-gray-500 mt-1">
                        Customer Scan
                      </p>
                    </div>
                  </div>

                  {batch.recalled && (
                    <div className="mt-3 bg-red-50 border border-red-300 rounded-lg p-3">
                      <p className="text-sm font-bold text-red-800">🚨 Recalled{batch.recallReason ? `: ${batch.recallReason}` : ''}</p>
                      <p className="text-xs text-red-700 mt-1">No more dispatches or sales from this batch. If it was a mistake, ask the Farm Passport admin to lift the recall.</p>
                    </div>
                  )}

                  {/* Stats Row */}
                  <div className="mt-3 pt-3 border-t flex gap-4 text-sm flex-wrap items-center">
                    <div>
                      <span className="text-gray-500">Badges:</span>
                      <span className="font-semibold text-gray-800 ml-1">
                        {batch.unlocks || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Still at farm:</span>
                      <span className="font-semibold text-gray-800 ml-1">
                        {formatQty(batch.quantityRemaining ?? batch.quantity, unit)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-500">Price:</span>
                      {priceEdit[batchId] === undefined ? (
                        <>
                          <span className="font-semibold text-gray-800 ml-1">
                            {batch.pricePerUnit != null ? `£${Number(batch.pricePerUnit).toFixed(2)} per ${unit}` : 'not set'}
                          </span>
                          <button
                            onClick={() => setPriceEdit({ ...priceEdit, [batchId]: batch.pricePerUnit ?? '' })}
                            className="text-green-700 text-xs font-semibold hover:underline ml-1"
                          >
                            ✏️ {batch.pricePerUnit != null ? 'Change' : 'Set price'}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="ml-1">£</span>
                          <input
                            type="number" step="0.01" min="0"
                            value={priceEdit[batchId]}
                            onChange={(e) => setPriceEdit({ ...priceEdit, [batchId]: e.target.value })}
                            placeholder="0.00"
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                            disabled={priceSaving === batchId}
                          />
                          <span className="text-gray-500 text-xs">per {unit}</span>
                          <button
                            onClick={() => saveBatchPrice(batchId)}
                            disabled={priceSaving === batchId}
                            className="text-xs bg-green-600 text-white px-2 py-1 rounded hover:bg-green-700 disabled:bg-gray-400"
                          >
                            {priceSaving === batchId ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            onClick={() => { const n = { ...priceEdit }; delete n[batchId]; setPriceEdit(n); }}
                            className="text-xs text-gray-500 hover:underline"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {priceError[batchId] && <span className="text-xs text-red-600 ml-1">{priceError[batchId]}</span>}
                    </div>
                    {approved && !batch.recalled && Number(batch.quantityRemaining ?? batch.quantity) > 0 && dispatchBatchId !== batchId && (
                      <button
                        onClick={() => setDispatchBatchId(batchId)}
                        className="ml-auto text-green-700 font-semibold hover:underline"
                      >
                        🚚 Send to a depot / business
                      </button>
                    )}
                  </div>

                  {dispatchBatchId === batchId && (
                    <DispatchForm
                      farmerToken={farmerToken}
                      batch={batch}
                      onCancel={() => setDispatchBatchId(null)}
                      onDone={() => { setDispatchBatchId(null); refreshAll(); }}
                    />
                  )}

                  {/* Download QR Button */}
                  <button
                    onClick={() => downloadQRCode(batchId, productName)}
                    className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                  >
                    📥 Download QR Code for Printing
                  </button>
                  <NfcShare url={batchLink(batchId)} compact />
                  {approved && !batch.recalled && (
                    <button
                      onClick={() => recallBatch(batchId, productName)}
                      disabled={recallBusy === batchId}
                      className="mt-3 w-full text-sm font-semibold text-red-700 border border-red-300 py-2 rounded-lg hover:bg-red-50 disabled:opacity-50"
                    >
                      {recallBusy === batchId ? '⛓️ Recording recall…' : '🚨 Recall this batch'}
                    </button>
                  )}
                  
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Print this QR code and attach to product packaging
                  </p>

                  {/* Hidden high-res QR for download */}
                  <div className="hidden">
                    <QRCodeSVG
                      id={`qr-download-${batchId}`}
                      value={batchLink(batchId)}
                      size={512}
                      level="H"
                      includeMargin={true}
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default FarmerDashboard;