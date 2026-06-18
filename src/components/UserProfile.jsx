import { useState, useEffect } from 'react';
import axios from 'axios';
import AchievementsTab from './AchievementsTab';
import BadgeCard from './BadgeCard';

function UserProfile({ authToken, onBack }) {
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [badges, setBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('badges'); // 'badges' or 'achievements'

  // Edit mode state
  const [editMode, setEditMode] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Image upload state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    if (!authToken) {
      setLoading(false);
      return;
    }
    fetchProfile();
  }, [authToken]);

  const fetchProfile = async () => {
    try {
      const res = await axios.get('http://localhost:3002/api/user/profile', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setProfile(res.data.profile);
      setStats(res.data.stats);
      setBadges(res.data.badges || []);
      setUsername(res.data.profile.username || '');
      setBio(res.data.profile.bio || '');

    } catch (err) {
      console.error('Error fetching profile:', err);
      setError('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setSaveError('');

      await axios.put(
        'http://localhost:3002/api/user/profile',
        { username, bio },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Refresh profile
      await fetchProfile();
      setEditMode(false);

    } catch (err) {
      setSaveError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploadingImage(true);
      setImageError('');

      const formData = new FormData();
      formData.append('image', file);

      await axios.post(
        'http://localhost:3002/api/user/profile/upload-image',
        formData,
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      // Refresh profile to show new image
      await fetchProfile();

    } catch (err) {
      setImageError(err.response?.data?.error || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
    }
  };

  if (!authToken) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center">
            <div className="text-6xl mb-4">🔒</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Login Required</h2>
            <p className="text-gray-600 mb-6">Please login to view your profile</p>
            <button
              onClick={onBack}
              className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
            >
              ← Back
            </button>
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
            <p className="text-gray-600">Loading profile...</p>
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

  const displayName = profile?.username || profile?.email?.split('@')[0] || 'User';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Profile Card */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            {/* Profile Picture */}
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                {profile?.profileImageUrl ? (
                  <img 
                    src={profile.profileImageUrl} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl">👤</span>
                )}
              </div>
              
              {/* Upload button */}
              <label className="absolute bottom-0 right-0 bg-green-600 text-white p-2 rounded-full cursor-pointer hover:bg-green-700 transition">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                  disabled={uploadingImage}
                />
                {uploadingImage ? '⏳' : '📷'}
              </label>
            </div>

            {/* Name & Bio */}
            <div>
              <h2 className="text-2xl font-bold text-gray-800">{displayName}</h2>
              {profile?.username && (
                <p className="text-sm text-gray-500">{profile.email}</p>
              )}
              {profile?.bio && !editMode && (
                <p className="text-gray-600 mt-2">{profile.bio}</p>
              )}
            </div>
          </div>

          {/* Edit Button */}
          {!editMode && (
            <button
              onClick={() => setEditMode(true)}
              className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition font-semibold"
            >
              ✏️ Edit Profile
            </button>
          )}
        </div>

        {imageError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-600 text-sm">{imageError}</p>
          </div>
        )}

        {/* Edit Mode */}
        {editMode && (
          <div className="border-t pt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Choose a username"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                3+ characters, letters, numbers, and underscores only
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell others about yourself..."
                rows="3"
                maxLength="200"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                {bio.length}/200 characters
              </p>
            </div>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-600 text-sm">{saveError}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-400"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setEditMode(false);
                  setUsername(profile?.username || '');
                  setBio(profile?.bio || '');
                  setSaveError('');
                }}
                className="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-200 transition font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
          <div className="text-3xl mb-2">🏆</div>
          <div className="text-2xl font-bold text-gray-800">{stats?.totalBadges || 0}</div>
          <div className="text-sm text-gray-600">Total Badges</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <div className="text-3xl mb-2">🌾</div>
          <div className="text-2xl font-bold text-gray-800">{stats?.farmsDiscovered || 0}</div>
          <div className="text-sm text-gray-600">Farms Discovered</div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <div className="text-3xl mb-2">🍽️</div>
          <div className="text-2xl font-bold text-gray-800">{stats?.restaurantsVisited || 0}</div>
          <div className="text-sm text-gray-600">Restaurants</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
          <div className="text-3xl mb-2">📅</div>
          <div className="text-sm font-semibold text-gray-800">
            {profile?.memberSince ? new Date(profile.memberSince).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'N/A'}
          </div>
          <div className="text-sm text-gray-600">Member Since</div>
        </div>
      </div>

      {/* Tabs Section - Badges & Achievements */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        {/* Tab Buttons */}
        <div className="flex gap-4 mb-6 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('badges')}
            className={`pb-3 px-4 font-semibold transition ${
              activeTab === 'badges'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🏆 Badge Collection
          </button>
          <button
            onClick={() => setActiveTab('achievements')}
            className={`pb-3 px-4 font-semibold transition ${
              activeTab === 'achievements'
                ? 'border-b-2 border-green-600 text-green-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            🎖️ Achievements
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'badges' ? (
          // Badge Collection Tab
          <>
            {badges.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-6xl mb-4">🌱</div>
                <h3 className="text-xl font-bold text-gray-700 mb-2">No Badges Yet</h3>
                <p className="text-gray-600 mb-6">
                  Scan receipt QR codes to start collecting badges!
                </p>
                <button
                  onClick={onBack}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
                >
                  Start Scanning
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {badges.map((badge, index) => (
                  <BadgeCard key={index} badge={badge} />
                ))}
              </div>
            )}
          </>
        ) : (
          // Achievements Tab
          <AchievementsTab authToken={authToken} />
        )}
      </div>

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

export default UserProfile;