import { useState } from 'react';
import axios from 'axios';

function UnlockBadge({ batchId, farmName, onViewBadges, onBack }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setError('Please login to unlock badges');
        setLoading(false);
        return;
      }

      console.log('Unlocking badge for batch:', batchId);

      const response = await axios.post(
        'http://localhost:3002/api/unlock-badge',
        { batchId },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      console.log('Badge unlocked:', response.data);

      if (response.data.success) {
        setSuccess(true);
      }

    } catch (err) {
      console.error('Error unlocking badge:', err);
      
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Session expired. Please login again.');
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
      } else {
        setError(err.response?.data?.error || 'Failed to unlock badge');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border-2 border-green-400 rounded-lg p-8">
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h3 className="text-2xl font-bold text-green-800 mb-2">
            Badge Unlocked!
          </h3>
          <p className="text-green-700 mb-6">
            You've earned a badge from <span className="font-semibold">{farmName}</span>!
          </p>
          
          {/* Single button to view badges */}
          <div className="flex gap-3 justify-center">
            <button
              onClick={onViewBadges}
              className="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 transition font-semibold text-lg"
            >
              🏆 View My Badges
            </button>
            <button
              onClick={onBack}
              className="bg-gray-600 text-white px-8 py-3 rounded-lg hover:bg-gray-700 transition font-semibold text-lg"
            >
              Scan Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-gray-200 rounded-lg p-6">
      <div className="text-center mb-4">
        <div className="text-5xl mb-3">🏅</div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">
          Unlock Your Badge
        </h3>
        <p className="text-gray-600">
          Collect a badge from <span className="font-semibold">{farmName}</span>
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Unlocking Badge...' : '🔓 Unlock Badge'}
        </button>
      </form>

      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-xs text-blue-800">
          <span className="font-semibold">💡 Tip:</span> You can collect multiple badges from the same farm by purchasing different batches!
        </p>
      </div>
    </div>
  );
}

export default UnlockBadge;