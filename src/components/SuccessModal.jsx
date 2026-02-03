function SuccessModal({ farmName, transactionHash, onClose, onViewBadges }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-8 text-center">
        {/* Celebration Animation */}
        <div className="mb-4">
          <div className="text-8xl mb-4 animate-bounce">🎉</div>
          <div className="text-6xl mb-4">🎖️</div>
        </div>

        {/* Success Message */}
        <h2 className="text-3xl font-bold text-green-600 mb-3">
          Badge Unlocked!
        </h2>
        
        <div className="bg-green-50 border-2 border-green-500 rounded-lg p-4 mb-6">
          <p className="text-xl font-semibold text-gray-800 mb-2">
            {farmName}
          </p>
          <p className="text-sm text-gray-600">
            Added to your collection
          </p>
        </div>

        {/* Transaction Info */}
        <div className="bg-gray-50 rounded-lg p-3 mb-6">
          <p className="text-xs text-gray-500 mb-1">Verified on Blockchain</p>
          <a
            href={`https://sepolia.etherscan.io/tx/${transactionHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline font-mono text-xs break-all"
          >
            {transactionHash?.slice(0, 20)}...
          </a>
        </div>

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={onViewBadges}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 transition"
          >
            🎖️ View My Badges
          </button>
          <button
            onClick={onClose}
            className="w-full bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition"
          >
            Continue Exploring
          </button>
        </div>
      </div>
    </div>
  );
}

export default SuccessModal;