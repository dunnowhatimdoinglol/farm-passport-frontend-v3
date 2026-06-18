import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * VerifyEmail - Page that handles email verification links
 * Checks URL for token on mount
 * Handles both customer and farmer verification
 */
function VerifyEmail({ onBack }) {
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [userType, setUserType] = useState(null); // 'farmer' or 'customer'
  const hasRun = useRef(false); // Prevent double calls

  useEffect(() => {
    if (hasRun.current) return; // Only run once
    hasRun.current = true;
    
    verifyEmail();
  }, []);

  const verifyEmail = async () => {
    try {
      // Get token from URL query params
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('error');
        setMessage('Invalid verification link. No token provided.');
        return;
      }

      const res = await axios.get(`https://farm-passport-backend-v3.onrender.com//api/auth/verify-email/${token}`);

      setStatus('success');
      setMessage(res.data.message);
      setUserType(res.data.userType); // Get user type from backend

      // Auto-redirect farmers after 2 seconds
      if (res.data.userType === 'farmer') {
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
      }

    } catch (err) {
      setStatus('error');
      setMessage(err.response?.data?.error || 'Verification failed. Please try again.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          {status === 'verifying' && (
            <>
              <div className="text-6xl mb-4">⏳</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Verifying your email...
              </h2>
              <p className="text-gray-600">Please wait</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-green-700 mb-2">
                Email Verified!
              </h2>
              <p className="text-gray-600 mb-6">{message}</p>
              <button
                onClick={onBack}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition font-semibold"
              >
                {userType === 'farmer' ? 'Go to Farmer Dashboard 🌾' : 'Start Scanning 🌾'}
              </button>
              {userType === 'farmer' && (
                <p className="text-sm text-gray-500 mt-3">
                  Redirecting in 2 seconds...
                </p>
              )}
            </>
          )}

          {status === 'error' && (
            <>
              <div className="text-6xl mb-4">❌</div>
              <h2 className="text-2xl font-bold text-red-700 mb-2">
                Verification Failed
              </h2>
              <p className="text-red-600 mb-6">{message}</p>
              <button
                onClick={onBack}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition font-semibold"
              >
                ← Back to App
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default VerifyEmail;