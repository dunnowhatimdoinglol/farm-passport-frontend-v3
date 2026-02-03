import { useState } from 'react';
import FarmerDashboard from './FarmerDashboard';
import axios from 'axios';
import { ethers } from 'ethers';

function FarmerPortal({ onBackToCustomer }) {
  const [view, setView] = useState('login'); // 'login', 'register', 'dashboard', 'registration-success'
  const [privateKey, setPrivateKey] = useState('');
  const [farmerAddress, setFarmerAddress] = useState('');
  const [registrationData, setRegistrationData] = useState(null);

  // Registration form state
  const [regPrivateKey, setRegPrivateKey] = useState('');
  const [generatedAddress, setGeneratedAddress] = useState('');
  const [farmName, setFarmName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateWallet = () => {
    const wallet = ethers.Wallet.createRandom();
    setRegPrivateKey(wallet.privateKey);
    setGeneratedAddress(wallet.address);
    setError('');
  };

  const handleLogin = () => {
    if (privateKey.trim()) {
      setView('dashboard');
    } else {
      setError('Please enter your private key');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Get farmer address from private key
      const wallet = new ethers.Wallet(regPrivateKey);
      const farmerAddr = wallet.address;

      console.log('Registering farmer (GASLESS)...');
      
      // GASLESS: Only send address to backend, backend pays gas!
      const response = await axios.post('http://localhost:3002/api/farmer/register', {
        farmerAddress: farmerAddr,  // Just the address, not private key!
        farmName,
        location,
        description
      });

      console.log('Registration response:', response.data);

      // Store registration data
      setRegistrationData({
        farmName,
        farmerAddress: response.data.farmerAddress,
        transactionHash: response.data.transactionHash,
        privateKey: regPrivateKey
      });

      // Set the private key for login
      setPrivateKey(regPrivateKey);
      setFarmerAddress(response.data.farmerAddress);

      // Show success page
      setView('registration-success');
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.response?.data?.error || err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueToDashboard = () => {
    // Navigate to dashboard using the stored private key
    setView('dashboard');
  };

  const handleBackToHome = () => {
    // Reset to login view
    setView('login');
    setPrivateKey('');
    setRegPrivateKey('');
    setGeneratedAddress('');
    setFarmName('');
    setLocation('');
    setDescription('');
    setRegistrationData(null);
    setError('');
  };

  if (view === 'dashboard') {
    return (
      <FarmerDashboard 
        privateKey={privateKey}
        onBack={onBackToCustomer}
        onLogout={() => {
          setView('login');
          setPrivateKey('');
        }}
      />
    );
  }

  if (view === 'registration-success' && registrationData) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">
              Registration Successful!
            </h2>
            <p className="text-gray-600">
              Your farm has been registered on the blockchain (gas-free!)
            </p>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <h3 className="font-bold text-gray-800 mb-4">Farm Details:</h3>
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-semibold">Farm Name:</span> {registrationData.farmName}
              </p>
              <p>
                <span className="font-semibold">Farmer Address:</span>
                <span className="font-mono text-xs ml-2">{registrationData.farmerAddress}</span>
              </p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700 mb-2">
              <span className="font-semibold">✨ Gasless Registration!</span>
            </p>
            <p className="text-xs text-gray-600">
              You didn't need any ETH - our backend paid the gas fee for you!
            </p>
          </div>

          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-6 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-3xl">⚠️</span>
              <div>
                <h3 className="font-bold text-yellow-800 mb-2">
                  IMPORTANT: Save Your Private Key
                </h3>
                <p className="text-sm text-yellow-800 mb-3">
                  You MUST save your private key securely. You'll need it to log in!
                </p>
                <div className="bg-white rounded p-3 mb-3">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Your Private Key:</p>
                  <p className="font-mono text-xs text-gray-800 break-all">
                    {registrationData.privateKey}
                  </p>
                </div>
                <p className="text-xs text-red-600 font-semibold">
                  ⚠️ Never share this with anyone! Store it in a password manager or secure location.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-700">
              <span className="font-semibold">Transaction Hash:</span>
            </p>
            <a
              href={`https://sepolia.etherscan.io/tx/${registrationData.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline text-xs font-mono break-all"
            >
              {registrationData.transactionHash} ↗
            </a>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleContinueToDashboard}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold"
            >
              Continue to Dashboard
            </button>
            <button
              onClick={handleBackToHome}
              className="flex-1 bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 transition font-semibold"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-3xl font-bold text-gray-800">
              Register New Farm (Gas-Free!)
            </h2>
            <button
              onClick={() => setView('login')}
              className="text-blue-600 hover:underline"
            >
              ← Back to Login
            </button>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">
              <span className="font-semibold">✨ No ETH required!</span> Our system pays the gas fees for you.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Wallet Setup
              </label>
              
              {/* Generate Wallet Button */}
              {!regPrivateKey && (
                <button
                  type="button"
                  onClick={handleGenerateWallet}
                  className="w-full mb-3 bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 transition font-semibold"
                >
                  🎲 Generate New Wallet (Recommended)
                </button>
              )}

              {regPrivateKey && (
                <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-xs font-semibold text-green-800 mb-1">
                    ✅ Wallet Generated!
                  </p>
                  <p className="text-xs text-gray-700 mb-2">
                    <span className="font-semibold">Address:</span>
                    <span className="font-mono ml-2 text-xs">{generatedAddress}</span>
                  </p>
                  <p className="text-xs text-green-600 font-semibold">
                    ✨ No ETH needed - registration is gasless!
                  </p>
                </div>
              )}

              {!regPrivateKey && (
                <>
                  <p className="text-sm text-gray-600 mb-2">Or enter existing private key:</p>
                  <input
                    type="password"
                    value={regPrivateKey}
                    onChange={(e) => {
                      setRegPrivateKey(e.target.value);
                      setGeneratedAddress('');
                    }}
                    placeholder="0x... (optional - or generate new wallet above)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Farm Name *
              </label>
              <input
                type="text"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                placeholder="e.g., Green Valley Farm"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location *
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Cornwall, UK"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tell customers about your farm..."
                rows="3"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !regPrivateKey}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Registering (Gasless)...' : 'Register Farm (No ETH Needed!)'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Login view
  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="text-center mb-6">
          <div className="text-6xl mb-4">👨‍🌾</div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Farmer Portal v2.0
          </h2>
          <p className="text-gray-600">
            Manage your farm and track your batches
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Private Key
            </label>
            <input
              type="password"
              value={privateKey}
              onChange={(e) => setPrivateKey(e.target.value)}
              placeholder="Enter your private key"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleLogin();
                }
              }}
            />
          </div>

          <button
            onClick={handleLogin}
            className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold"
          >
            Login
          </button>

          <div className="text-center">
            <button
              onClick={() => setView('register')}
              className="text-blue-600 hover:underline text-sm"
            >
              Don't have a farm yet? Register here (No ETH needed!)
            </button>
          </div>

          <div className="text-center pt-4">
            <button
              onClick={onBackToCustomer}
              className="text-gray-600 hover:underline text-sm"
            >
              ← Back to Customer View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FarmerPortal;