import { useState } from 'react';
import axios from 'axios';
import { ethers } from 'ethers';
import QRCode from 'qrcode';

function CreateBatchForm({ privateKey, onBatchCreated }) {
  const [batchId, setBatchId] = useState('');
  const [productType, setProductType] = useState('Vegetable');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdBatch, setCreatedBatch] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const productTypes = ['Vegetable', 'Fruit', 'Meat', 'Dairy', 'Grain'];
  const units = ['kg', 'units', 'litres', 'dozen'];

  const generateBatchId = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const type = productType.substring(0, 3).toUpperCase();
    return `${type}-${date}-${random}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Derive farmer address from private key
      const wallet = new ethers.Wallet(privateKey);
      const farmerAddress = wallet.address;

      console.log('Creating batch (GASLESS)...');
      console.log('Farmer address:', farmerAddress);

      // GASLESS: Backend pays gas!
      const response = await axios.post('http://localhost:3002/api/farmer/create-batch', {
        farmerAddress: farmerAddress,  // Include farmer address
        batchId,
        productType,
        productName,
        quantity: parseInt(quantity),
        unit
      });

      console.log('Batch created (gasless):', response.data);

      // Generate QR code
      const qrUrl = await QRCode.toDataURL(batchId, {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      setQrCodeUrl(qrUrl);
      setCreatedBatch({
        batchId,
        productName,
        transactionHash: response.data.transactionHash
      });
      
      setShowSuccess(true);

      // Reset form
      setBatchId('');
      setProductName('');
      setQuantity('');

    } catch (err) {
      console.error('Error creating batch:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create batch');
    } finally {
      setLoading(false);
    }
  };

  const downloadQRCode = () => {
    const link = document.createElement('a');
    link.download = `${createdBatch.batchId}-QR.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  const handleClose = () => {
    setShowSuccess(false);
    setCreatedBatch(null);
    setQrCodeUrl('');
    if (onBatchCreated) {
      onBatchCreated();
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Batch ID *
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder="e.g., VEG-20260129-ABC1"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
            <button
              type="button"
              onClick={() => setBatchId(generateBatchId())}
              className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Generate
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Unique identifier for this batch
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Type *
          </label>
          <select
            value={productType}
            onChange={(e) => setProductType(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            required
          >
            {productTypes.map(type => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Product Name *
          </label>
          <input
            type="text"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="e.g., Organic Carrots"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quantity *
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g., 50"
              min="1"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Unit *
            </label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            >
              {units.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">✨ Gasless Creation!</span> No ETH needed - we pay the gas for you.
          </p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating Batch (Gasless)...' : 'Create Batch (No ETH Needed!)'}
        </button>
      </form>

      {/* Success Modal */}
      {showSuccess && createdBatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4">✅</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-2">
                Batch Created Successfully!
              </h3>
              <p className="text-gray-600">
                Your batch is now on the blockchain (gas-free!)
              </p>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Batch Details:
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Batch ID:</span> {createdBatch.batchId}
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Product:</span> {createdBatch.productName}
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-xs text-gray-700 mb-2">
                <span className="font-semibold">✨ Gasless Transaction!</span>
              </p>
              <p className="text-xs text-gray-600 mb-2">
                You didn't pay any gas fees - our system covered it for you!
              </p>
              <a
                href={`https://sepolia.etherscan.io/tx/${createdBatch.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-xs font-mono break-all"
              >
                View on Etherscan ↗
              </a>
            </div>

            {qrCodeUrl && (
              <div className="mb-6">
                <p className="text-sm font-semibold text-gray-700 mb-3 text-center">
                  QR Code:
                </p>
                <div className="flex justify-center mb-4">
                  <img src={qrCodeUrl} alt="Batch QR Code" className="border-4 border-gray-200 rounded-lg" />
                </div>
                <button
                  onClick={downloadQRCode}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-sm"
                >
                  📥 Download QR Code
                </button>
              </div>
            )}

            <button
              onClick={handleClose}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default CreateBatchForm;