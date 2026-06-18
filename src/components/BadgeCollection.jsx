import { useState, useEffect } from 'react';
import axios from 'axios';

function BadgeCollection({ userEmail, authToken, onBack, onLoginRequired }) {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authToken) {
      setLoading(false);
      return;
    }
    
    fetchBadges();
  }, [authToken]);

  const fetchBadges = async () => {
    try {
      console.log('Fetching badges...');

      const response = await axios.get('https://farm-passport-backend-v3.onrender.com//api/user/badges', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });

      console.log('Badges response:', response.data);

      if (response.data.success) {
        setBadges(response.data.badges);
      }

    } catch (err) {
      console.error('Error fetching badges:', err);
      
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Session expired. Please login again.');
      } else {
        setError('Failed to load badges');
      }
    } finally {
      setLoading(false);
    }
  };

  // Not logged in - show login prompt
  if (!authToken) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Login Required</h2>
            <p className="text-gray-600 mb-6">
              Create an account or login to view your badge collection and track your farm discoveries!
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onLoginRequired}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
              >
                Login / Sign Up
              </button>
              <button
                onClick={onBack}
                className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition font-semibold"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⏳</div>
            <p className="text-gray-600">Loading your badges...</p>
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
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Error</h2>
            <p className="text-red-600 mb-4">{error}</p>
            {error.includes('Session expired') && (
              <button
                onClick={onLoginRequired}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold mb-3"
              >
                Login Again
              </button>
            )}
            <button
              onClick={onBack}
              className="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 transition font-semibold"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            My Badge Collection
          </h2>
          {userEmail && (
            <p className="text-gray-600">{userEmail}</p>
          )}
          <p className="text-lg text-green-600 font-semibold mt-2">
            {badges.length} {badges.length === 1 ? 'Badge' : 'Badges'} Collected
          </p>
        </div>

        {badges.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🌱</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">
              No Badges Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Scan receipt QR codes from your meals to start collecting badges!
            </p>
            <button
              onClick={onBack}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
            >
              Start Scanning
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {badges.map((badge, index) => {
              const farmName       = badge.farmName       || badge.farm_name;
              const batchId        = badge.batchId        || badge.batch_id;
              const restaurantName = badge.restaurantName || badge.restaurant_name;
              const productName    = badge.productName    || badge.product_name;
              const unlockDate     = badge.unlockDate     || badge.unlocked_at;

              return (
                <div
                  key={index}
                  className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-6 border-2 border-green-200 hover:border-green-400 transition"
                >
                  <div className="text-center">
                    <div className="text-5xl mb-3">🏅</div>

                    <h3 className="text-lg font-bold text-gray-800 mb-1">
                      {farmName}
                    </h3>

                    {productName && (
                      <p className="text-sm text-green-700 font-semibold mb-1">
                        🌱 {productName}
                      </p>
                    )}

                    {restaurantName && (
                      <p className="text-sm text-orange-600 font-semibold mb-2">
                        🍽️ {restaurantName}
                      </p>
                    )}

                    <div className="text-sm text-gray-600 mb-3">
                      <p className="font-mono text-xs bg-white px-2 py-1 rounded inline-block">
                        {batchId}
                      </p>
                    </div>

                    {unlockDate && (
                      <p className="text-xs text-gray-500">
                        Unlocked: {new Date(unlockDate).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {badges.length > 0 && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">🎉 Great job!</span> You've collected badges from {new Set(badges.map(b => b.farmName || b.farm_name)).size} different farms. Keep scanning to discover more!
            </p>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={onBack}
            className="text-gray-600 hover:underline"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

export default BadgeCollection;