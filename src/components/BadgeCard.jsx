import React from 'react';

function BadgeCard({ badge }) {
  // Get season info
  const seasonInfo = {
    spring: { icon: '🌸', borderColor: 'border-pink-400', bgColor: 'bg-pink-50', name: 'Spring' },
    summer: { icon: '🌞', borderColor: 'border-yellow-400', bgColor: 'bg-yellow-50', name: 'Summer' },
    autumn: { icon: '🍂', borderColor: 'border-orange-400', bgColor: 'bg-orange-50', name: 'Autumn' },
    winter: { icon: '❄️', borderColor: 'border-blue-400', bgColor: 'bg-blue-50', name: 'Winter' }
  };

  const season = badge.season;
  const isLimited = badge.isLimited || badge.is_limited;
  const collectorNumber = badge.collectorNumber || badge.collector_number;
  
  const seasonData = season ? seasonInfo[season] : null;
  const farmName = badge.farmName || badge.farm_name;
  const restaurantName = badge.restaurantName || badge.restaurant_name;
  const productName = badge.productName || badge.product_name;
  const unlockDate = badge.unlockDate || badge.unlocked_at;

  // Determine styling based on rarity
  let borderStyle = 'border-green-200';
  let bgStyle = 'from-green-50 to-blue-50';
  
  if (seasonData) {
    borderStyle = seasonData.borderColor;
    bgStyle = seasonData.bgColor;
  }

  if (isLimited) {
    borderStyle = 'border-yellow-400 shadow-lg shadow-yellow-200';
  }

  return (
    <div
      className={`bg-gradient-to-br ${bgStyle} rounded-lg p-4 border-2 ${borderStyle} hover:scale-105 transition-transform relative`}
    >
      {/* Season Badge (top right) */}
      {seasonData && (
        <div className="absolute top-2 right-2 text-2xl">
          {seasonData.icon}
        </div>
      )}

      {/* Limited Badge (sparkle effect) */}
      {isLimited && (
        <div className="absolute -top-2 -right-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded-full animate-pulse">
          ⚡ LIMITED
        </div>
      )}

      {/* First Collector Badge */}
      {collectorNumber && collectorNumber <= 10 && (
        <div className="absolute -top-2 -left-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-full">
          🏃 #{collectorNumber}
        </div>
      )}

      <div className="text-center mt-2">
        <div className="text-3xl mb-2">🏅</div>
        
        <h4 className="text-sm font-bold text-gray-800 mb-1 line-clamp-1">
          {farmName}
        </h4>
        
        {productName && (
          <p className="text-xs text-green-700 font-semibold mb-1">
            🌱 {productName}
          </p>
        )}
        
        {restaurantName && (
          <p className="text-xs text-orange-600 font-semibold mb-2">
            🍽️ {restaurantName}
          </p>
        )}

        {/* Season name */}
        {seasonData && (
          <p className="text-xs font-semibold mb-1 text-gray-600">
            {seasonData.name}
          </p>
        )}
        
        {unlockDate && (
          <p className="text-xs text-gray-500">
            {new Date(unlockDate).toLocaleDateString()}
          </p>
        )}
      </div>
    </div>
  );
}

export default BadgeCard;