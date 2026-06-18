import { useState, useEffect } from 'react';
import axios from 'axios';

function AchievementsTab({ authToken }) {
  const [achievements, setAchievements] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // 'all', 'earned', 'unearned'

  useEffect(() => {
    if (authToken) {
      fetchAchievements();
    }
  }, [authToken]);

  const fetchAchievements = async () => {
    try {
      const res = await axios.get('https://farm-passport-backend-v3.onrender.com//api/user/achievements', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setAchievements(res.data.achievements || []);
      setSummary(res.data.summary);
    } catch (err) {
      console.error('Error fetching achievements:', err);
      setError('Failed to load achievements');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">⏳</div>
        <p className="text-gray-600">Loading achievements...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-4">❌</div>
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  // Filter achievements
  const filteredAchievements = achievements.filter(a => {
    if (filter === 'earned') return a.earned;
    if (filter === 'unearned') return !a.earned;
    return true;
  });

  // Rarity colors
  const rarityColors = {
    common: 'border-gray-300 bg-gray-50',
    rare: 'border-blue-300 bg-blue-50',
    epic: 'border-purple-300 bg-purple-50',
    legendary: 'border-yellow-300 bg-yellow-50'
  };

  const rarityTextColors = {
    common: 'text-gray-700',
    rare: 'text-blue-700',
    epic: 'text-purple-700',
    legendary: 'text-yellow-700'
  };

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      {summary && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-6 border-2 border-green-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-3xl font-bold text-gray-800">{summary.totalEarned}</div>
              <div className="text-sm text-gray-600">Earned</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-800">{summary.totalAvailable}</div>
              <div className="text-sm text-gray-600">Total</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-800">{summary.totalPoints}</div>
              <div className="text-sm text-gray-600">Points</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-800">{summary.completionPercentage}%</div>
              <div className="text-sm text-gray-600">Complete</div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Buttons */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            filter === 'all'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('earned')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            filter === 'earned'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Earned
        </button>
        <button
          onClick={() => setFilter('unearned')}
          className={`px-4 py-2 rounded-lg font-semibold transition ${
            filter === 'unearned'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          Locked
        </button>
      </div>

      {/* Achievements Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredAchievements.map(achievement => (
          <div
            key={achievement.id}
            className={`rounded-lg border-2 p-4 transition ${
              achievement.earned
                ? `${rarityColors[achievement.rarity]} shadow-md`
                : 'border-gray-200 bg-gray-50 opacity-60'
            }`}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={`text-4xl ${achievement.earned ? '' : 'grayscale'}`}>
                {achievement.earned ? achievement.icon : '🔒'}
              </div>

              {/* Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-gray-800">{achievement.name}</h4>
                  {achievement.earned && (
                    <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">
                      ✓
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {achievement.description}
                </p>

                {/* Progress Bar */}
                {!achievement.earned && (
                  <div className="mb-2">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>
                        {achievement.progress}/{achievement.requirementValue}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${achievement.progressPercentage}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="flex justify-between items-center text-xs">
                  <span className={`font-semibold uppercase ${rarityTextColors[achievement.rarity]}`}>
                    {achievement.rarity}
                  </span>
                  <span className="text-gray-600">
                    +{achievement.points} pts
                  </span>
                  {achievement.earned && achievement.earnedAt && (
                    <span className="text-gray-500">
                      {new Date(achievement.earnedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredAchievements.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">🏆</div>
          <p className="text-gray-600">No achievements to show</p>
        </div>
      )}
    </div>
  );
}

export default AchievementsTab;