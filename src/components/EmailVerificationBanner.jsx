import { useState, useEffect } from 'react';
import axios from 'axios';

/**
 * EmailVerificationBanner
 * Shows at the top of the app when user is logged in but email not verified
 * 
 * Props:
 *   authToken - JWT token
 */
function EmailVerificationBanner({ authToken }) {
  const [verified, setVerified] = useState(true); // Default true to avoid flash
  const [email, setEmail] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authToken) {
      setLoading(false);
      return;
    }
    checkVerificationStatus();
  }, [authToken]);

  const checkVerificationStatus = async () => {
    try {
      const res = await axios.get('https://farm-passport-backend-v3.onrender.com//api/auth/verification-status', {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      setVerified(res.data.emailVerified);
      setEmail(res.data.email);
    } catch (err) {
      console.error('Error checking verification status:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      setResending(true);
      setResendMessage('');

      const res = await axios.post(
        'https://farm-passport-backend-v3.onrender.com//api/auth/resend-verification',
        {},
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setResendMessage(res.data.message || 'Verification email sent!');
    } catch (err) {
      setResendMessage(err.response?.data?.error || 'Failed to send email. Try again.');
    } finally {
      setResending(false);
    }
  };

  // Don't show anything while loading or if verified
  if (loading || verified) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-b-2 border-yellow-300 px-4 py-3">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-yellow-800">
                Please verify your email
              </p>
              <p className="text-sm text-yellow-700">
                Check your inbox at <strong>{email}</strong> for the verification link.
              </p>
            </div>
          </div>

          <button
            onClick={handleResend}
            disabled={resending}
            className="bg-yellow-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-yellow-700 transition text-sm disabled:bg-gray-400"
          >
            {resending ? 'Sending...' : 'Resend Email'}
          </button>
        </div>

        {resendMessage && (
          <p className={`text-sm mt-2 ${resendMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {resendMessage}
          </p>
        )}
      </div>
    </div>
  );
}

export default EmailVerificationBanner;