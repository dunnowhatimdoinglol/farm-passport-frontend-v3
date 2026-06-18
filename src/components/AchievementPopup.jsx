import { useState, useEffect } from 'react';

function AchievementPopup({ achievement, onClose }) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger animation
    setTimeout(() => setIsVisible(true), 100);

    // Auto-close after 5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for fade out
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  if (!achievement) return null;

  // Rarity colors
  const rarityColors = {
    common: 'from-gray-400 to-gray-600',
    rare: 'from-blue-400 to-blue-600',
    epic: 'from-purple-400 to-purple-600',
    legendary: 'from-yellow-400 to-yellow-600'
  };

  const rarityGlow = {
    common: 'shadow-gray-400/50',
    rare: 'shadow-blue-400/50',
    epic: 'shadow-purple-400/50',
    legendary: 'shadow-yellow-400/50'
  };

  return (
    <div
      className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10'
      }`}
    >
      <div
        className={`bg-gradient-to-r ${rarityColors[achievement.rarity] || rarityColors.common} 
                    rounded-2xl shadow-2xl ${rarityGlow[achievement.rarity] || rarityGlow.common} 
                    p-6 max-w-sm animate-bounce-once`}
      >
        <div className="flex items-center gap-4">
          {/* Achievement Icon */}
          <div className="text-5xl animate-pulse">
            {achievement.icon}
          </div>

          {/* Achievement Info */}
          <div className="flex-1 text-white">
            <div className="text-xs font-bold uppercase tracking-wider opacity-90 mb-1">
              {achievement.rarity} Achievement
            </div>
            <h3 className="text-xl font-bold mb-1">
              {achievement.name}
            </h3>
            <p className="text-sm opacity-90">
              {achievement.description}
            </p>
            <div className="text-xs mt-2 font-semibold">
              +{achievement.points} points
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={() => {
              setIsVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-white hover:text-gray-200 text-2xl"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}

export default AchievementPopup;