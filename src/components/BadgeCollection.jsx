import { useState, useEffect } from 'react';
import axios from 'axios';

function BadgeCollection({ userEmail }) {
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchBadges();
  }, []);

  const fetchBadges = async () => {
    try {
      const token = localStorage.getItem('authToken');
      
      if (!token) {
        setError('Please login to see your badges');
        setLoading(false);
        return;
      }

      console.log('Fetching badges...');

      const response = await axios.get('http://localhost:3002/api/user/badges', {
        headers: {
          'Authorization': `Bearer ${token}`
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
        localStorage.removeItem('authToken');
        localStorage.removeItem('userEmail');
      } else {
        setError('Failed to load badges');
      }
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
            <p className="text-red-600">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🏆</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            My Badge Collection
          </h2>
          {userEmail && (
            <p className="text-gray-600">
              {userEmail}
            </p>
          )}
          <p className="text-lg text-green-600 font-semibold mt-2">
            {badges.length} {badges.length === 1 ? 'Badge' : 'Badges'} Collected
          </p>
        </div>

        {/* Badges Grid */}
        {badges.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🌱</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">
              No Badges Yet
            </h3>
            <p className="text-gray-600 mb-6">
              Scan product QR codes to start collecting badges!
            </p>
            <button
              onClick={() => window.location.reload()}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
            >
              Scan Your First Product
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {badges.map((badge, index) => {
              // normalise — GET endpoint may return camelCase or snake_case
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

                    {/* Farm name */}
                    <h3 className="text-lg font-bold text-gray-800 mb-1">
                      {farmName}
                    </h3>

                    {/* Product name */}
                    {productName && (
                      <p className="text-sm text-green-700 font-semibold mb-1">
                        🌱 {productName}
                      </p>
                    )}

                    {/* Restaurant — only shows if present */}
                    {restaurantName && (
                      <p className="text-sm text-orange-600 font-semibold mb-2">
                        🍽️ {restaurantName}
                      </p>
                    )}

                    {/* Batch ID */}
                    <div className="text-sm text-gray-600 mb-3">
                      <p className="font-mono text-xs bg-white px-2 py-1 rounded inline-block">
                        {batchId}
                      </p>
                    </div>

                    {/* Unlock date */}
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

        {/* Info Box */}
        {badges.length > 0 && (
          <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <span className="font-semibold">🎉 Great job!</span> You've collected badges from {new Set(badges.map(b => b.farmName || b.farm_name)).size} different farms. Keep scanning to discover more!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default BadgeCollection;