import { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:3002/api';

function RestaurantFinder({ batchId, excludeRestaurant }) {
  const [restaurants, setRestaurants] = useState([]);
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    const fetchRestaurants = async () => {
      try {
        const params = excludeRestaurant
          ? `?exclude=${encodeURIComponent(excludeRestaurant)}`
          : '';
        const res = await axios.get(`${API_BASE}/restaurants/same-farm/${batchId}${params}`);
        setRestaurants(res.data.restaurants || []);
      } catch (err) {
        console.error('RestaurantFinder fetch error:', err);
        // silently fail — this is a bonus feature, not critical
      } finally {
        setLoading(false);
      }
    };

    if (batchId) fetchRestaurants();
  }, [batchId, excludeRestaurant]);

  // Don't render anything while loading or if nothing found
  if (loading || restaurants.length === 0) return null;

  return (
    <div className="mt-5 bg-blue-50 border border-blue-200 rounded-lg p-5">
      <h3 className="text-sm font-bold text-blue-800 mb-3">
        🌍 Other restaurants also sourcing from this farm:
      </h3>
      <div className="space-y-2">
        {restaurants.map((r, i) => (
          <div
            key={i}
            className="bg-white rounded-lg px-4 py-3 flex items-center justify-between shadow-sm"
          >
            <p className="font-semibold text-gray-800">🍽️ {r.name}</p>
            {r.postcode && (
              <p className="text-xs text-gray-400">{r.postcode}</p>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-blue-600 mt-3">
        Visit any of these to keep building your Farm Passport collection!
      </p>
    </div>
  );
}

export default RestaurantFinder;