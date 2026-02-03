import { useState, useEffect } from 'react';
import axios from 'axios';
import UnlockBadge from './UnlockBadge';

function FarmStory({ batchId, onBack, onViewBadges, viewOnly = false }) {
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBatchData();
  }, [batchId]);

  const fetchBatchData = async () => {
    try {
      console.log('Fetching batch:', batchId);
      
      const response = await axios.get(`http://localhost:3002/api/batch/${batchId}`);
      
      console.log('Batch data:', response.data);

      if (response.data.success) {
        setBatchData(response.data.data);
      }
    } catch (err) {
      console.error('Error fetching batch:', err);
      setError('Failed to load batch information');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⏳</div>
            <p className="text-gray-600">Loading farm story...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !batchData) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">❌</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
            <p className="text-red-600 mb-4">{error || 'Batch not found'}</p>
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

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Farm Story Card */}
      <div className="bg-white rounded-lg shadow-lg p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🌾</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            {batchData.farmer.name}
          </h2>
          <p className="text-gray-600 text-lg">
            📍 {batchData.farmer.location}
          </p>
        </div>

        {/* Batch Info */}
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-6">
          <h3 className="text-xl font-bold text-gray-800 mb-4">
            Product Information
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Batch ID</p>
              <p className="font-mono text-sm font-semibold text-gray-800">
                {batchData.batchId}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Product Type</p>
              <p className="font-semibold text-gray-800">{batchData.cropType}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Harvest Date</p>
              <p className="font-semibold text-gray-800">
                {new Date(batchData.harvestDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Quantity</p>
              <p className="font-semibold text-gray-800">{batchData.quantity}</p>
            </div>
          </div>
        </div>

        {/* Farm Description */}
        {batchData.farmer.description && (
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-800 mb-3">
              About the Farm
            </h3>
            <p className="text-gray-700 leading-relaxed">
              {batchData.farmer.description}
            </p>
          </div>
        )}

        {/* Certifications */}
        {batchData.farmer.certifications && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              🏅 Certifications
            </h3>
            <p className="text-gray-700">{batchData.farmer.certifications}</p>
          </div>
        )}
      </div>

      {/* ─── ONLY CHANGE: conditional badge section ─── */}
      {viewOnly ? (
        /* Menu QR scanned → no unlock, just a nudge */
        <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-8">
          <div className="text-center">
            <div className="text-5xl mb-3">🎟️</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">Want a Farm Badge?</h3>
            <p className="text-gray-500 max-w-md mx-auto">
              When you purchase a dish made with this product, check your receipt for a unique QR code you can scan to claim your badge.
            </p>
          </div>
        </div>
      ) : (
        /* Direct unlock (used when viewOnly is not passed or false) */
        <UnlockBadge 
          batchId={batchData.batchId}
          farmName={batchData.farmer.name}
          onViewBadges={onViewBadges}
          onBack={onBack}
        />
      )}

      {/* Back Button */}
      <div className="text-center">
        <button
          onClick={onBack}
          className="text-gray-600 hover:underline"
        >
          ← Back to Scanner
        </button>
      </div>
    </div>
  );
}

export default FarmStory;