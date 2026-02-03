import { useState, useEffect } from 'react';
import axios from 'axios';
import CreateBatchForm from './CreateBatchForm';
import { QRCodeSVG } from 'qrcode.react';

function FarmerDashboard({ privateKey, onLogout }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [farmerData, setFarmerData] = useState(null);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, [refreshTrigger]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post('http://localhost:3002/api/farmer/dashboard', {
        privateKey: privateKey
      });

      setFarmerData(response.data);
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

  return (
    <div className="max-w-6xl mx-auto">
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

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3">
            <div className="text-3xl">👁️</div>
            <div>
              <p className="text-gray-500 text-sm">Total Scans</p>
              <p className="text-3xl font-bold text-gray-800">
                {batches.reduce((sum, batch) => sum + (batch.scans || 0), 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Batch Button / Form */}
      {!showCreateBatch ? (
        <button
          onClick={() => setShowCreateBatch(true)}
          className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-lg hover:bg-green-700 transition mb-6"
        >
          ➕ Create New Batch
        </button>
      ) : (
        <div className="mb-6">
          <CreateBatchForm
            privateKey={privateKey}
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
              // SAFE STRING CONVERSION - Fixes "object Object" bug
              const batchId = String(batch.batchId || 'Unknown');
              const productType = String(batch.productType || 'Unknown');
              const productName = String(batch.productName || 'Unknown');
              const quantity = String(batch.quantity || '0');
              const unit = String(batch.unit || '');
              const timestamp = batch.timestamp || new Date().toISOString();
              const txHash = String(batch.transactionHash || '');
              
              // Product emoji based on type
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
                      {/* Product Info */}
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
                      
                      {/* Batch ID */}
                      <p className="text-xs text-gray-500 mb-1 font-mono">
                        ID: {batchId}
                      </p>
                      
                      {/* Timestamp */}
                      <p className="text-sm text-gray-600 mb-2">
                        Created: {new Date(timestamp).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      
                      {/* Transaction Link */}
                      {txHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs font-mono"
                        >
                          View on Etherscan ↗
                        </a>
                      )}
                    </div>

                    {/* QR Code */}
                    <div className="ml-4">
                      <div className="bg-white p-2 border-2 border-gray-300 rounded-lg">
                        <QRCodeSVG
                          value={batchId}
                          size={100}
                          level="H"
                          includeMargin={true}
                        />
                      </div>
                      <p className="text-xs text-center text-gray-500 mt-1">
                        Customer Scan
                      </p>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="mt-3 pt-3 border-t flex gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Scans:</span>
                      <span className="font-semibold text-gray-800 ml-1">
                        {batch.scans || 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Badges:</span>
                      <span className="font-semibold text-gray-800 ml-1">
                        {batch.unlocks || 0}
                      </span>
                    </div>
                  </div>

                  {/* Download QR Button */}
                  <button
                    onClick={() => downloadQRCode(batchId, productName)}
                    className="mt-3 w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition text-sm"
                  >
                    📥 Download QR Code for Printing
                  </button>
                  
                  <p className="text-xs text-gray-500 text-center mt-2">
                    Print this QR code and attach to product packaging
                  </p>

                  {/* Hidden high-res QR for download */}
                  <div className="hidden">
                    <QRCodeSVG
                      id={`qr-download-${batchId}`}
                      value={batchId}
                      size={512}
                      level="H"
                      includeMargin={true}
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