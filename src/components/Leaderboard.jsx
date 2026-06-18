import { useState, useEffect } from 'react';
import axios from 'axios';

function Leaderboard({ authToken, onBack }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('all-time'); // 'all-time' or 'monthly'

  useEffect(() => {
    fetchLeaderboard();
  }, [period]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      setError('');

      // Fetch leaderboard
      const res = await axios.get('https://farm-passport-backend-v3.onrender.com//api/leaderboard', {
        params: { period, limit: 15 }
      });

      setLeaderboard(res.data.leaderboard || []);

      // Fetch my rank if authenticated
      if (authToken) {
        try {
          const myRankRes = await axios.get('https://farm-passport-backend-v3.onrender.com//api/leaderboard/me', {
            params: { period },
            headers: { Authorization: `Bearer ${authToken}` }
          });
          setMyRank(myRankRes.data);
        } catch (err) {
          console.log('Could not fetch user rank:', err);
        }
      }

    } catch (err) {
      console.error('Error fetching leaderboard:', err);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  // Medal emojis for top 3
  const getMedal = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  // Rank color
  const getRankColor = (rank) => {
    if (rank === 1) return 'text-yellow-600';
    if (rank === 2) return 'text-gray-500';
    if (rank === 3) return 'text-orange-600';
    return 'text-gray-700';
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">⏳</div>
            <p className="text-gray-600">Loading leaderboard...</p>
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
            <button
              onClick={onBack}
              className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-semibold"
            >
              ← Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Header */}
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg p-6 border-2 border-yellow-200">
        <div className="text-center">
          <div className="text-6xl mb-2">🏆</div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Leaderboard</h1>
          <p className="text-gray-600">Top collectors ranked by achievement points</p>
        </div>
      </div>

      {/* Period Toggle */}
      <div className="flex gap-2 justify-center">
        <button
          onClick={() => setPeriod('all-time')}
          className={`px-6 py-2 rounded-lg font-semibold transition ${
            period === 'all-time'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All Time
        </button>
        <button
          onClick={() => setPeriod('monthly')}
          className={`px-6 py-2 rounded-lg font-semibold transition ${
            period === 'monthly'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          This Month
        </button>

        <button
  onClick={() => setPeriod('weekly')}
  className={`px-6 py-2 rounded-lg font-semibold transition ${
    period === 'weekly'
      ? 'bg-green-600 text-white'
      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
       }`}
      >
      This Week
     </button>
      </div>

      {/* Leaderboard Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {leaderboard.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">👻</div>
            <h3 className="text-xl font-bold text-gray-700 mb-2">No Rankings Yet</h3>
            <p className="text-gray-600">Be the first to earn achievements!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Points
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Badges
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Farms
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Achievements
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leaderboard.map((entry) => (
                  <tr 
                    key={entry.userId}
                    className={`hover:bg-gray-50 transition ${
                      entry.rank === 1 ? 'bg-yellow-50' :
                      entry.rank === 2 ? 'bg-gray-100' :
                      entry.rank === 3 ? 'bg-orange-50' : ''
                    }`}
                  >
                    {/* Rank */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-2xl font-bold ${getRankColor(entry.rank)}`}>
                        {getMedal(entry.rank)}
                      </span>
                    </td>

                    {/* User */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10 mr-3">
                          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                            {entry.profileImageUrl ? (
  <img src={entry.profileImageUrl} className="w-10 h-10 rounded-full" />
) : (
  <span className="text-xl">👤</span>
)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {entry.username}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Points */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-lg font-bold text-green-600">
                        {entry.totalPoints}
                      </span>
                    </td>

                    {/* Badges */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-700">
                        🏅 {entry.totalBadges}
                      </span>
                    </td>

                    {/* Farms */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-700">
                        🌾 {entry.farmsDiscovered}
                      </span>
                    </td>

                    {/* Achievements */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className="text-sm text-gray-700">
                        🎖️ {entry.totalAchievements}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* My Rank Card (if authenticated) */}
      {myRank && myRank.rank && (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-6 border-2 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Your Rank</h3>
              <p className="text-gray-600 text-sm">
                Keep collecting to climb the leaderboard!
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-blue-600">
                #{myRank.rank}
              </div>
              <div className="text-sm text-gray-600">
                {myRank.stats?.totalPoints || 0} points
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Back Button */}
      <div className="text-center">
        <button
          onClick={onBack}
          className="text-gray-600 hover:underline"
        >
          ← Back
        </button>
      </div>
    </div>
  );
}

export default Leaderboard;