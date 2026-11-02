import { useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { batchLink } from './walletHelpers';
import NfcShare from './NfcShare';

// farmerToken = the farmer's sign-in token (the farm is worked out from it on the server)
function CreateBatchForm({ farmerToken, season, setSeason, onBatchCreated, onSuccess, onCancel }) {
  const [batchId, setBatchId] = useState('');
  const [productType, setProductType] = useState('Vegetable');
  const [productName, setProductName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('kg');
  const [pricePerUnit, setPricePerUnit] = useState('');   // optional, £ — only farm & restaurants see it
  const today = new Date().toISOString().slice(0, 10);
  const [harvestDate, setHarvestDate] = useState(today);  // on-chain
  const [useBy, setUseBy] = useState('');                 // optional, on-chain
  // Livestock (going to an abattoir): species, ear tag / flock mark, where it was born and reared — all on-chain
  const [species, setSpecies] = useState('Cattle');
  const [animalRef, setAnimalRef] = useState('');
  const [breed, setBreed] = useState('');
  const [bornIn, setBornIn] = useState('United Kingdom');
  const [rearedIn, setRearedIn] = useState('United Kingdom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdBatch, setCreatedBatch] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');

  const productTypes = ['Vegetable', 'Fruit', 'Meat', 'Dairy', 'Grain', 'Livestock'];
  const units = ['kg', 'units', 'litres', 'dozen'];
  const isLivestock = productType === 'Livestock';
  const SPECIES = { Cattle: 'Cattle', Sheep: 'Sheep / lambs', Pig: 'Pigs', Goat: 'Goats' };
  const refLabel = species === 'Cattle' ? 'Ear tag number' : species === 'Pig' ? 'Herd mark' : 'Flock mark';
  const refExample = species === 'Cattle' ? 'e.g. UK 123456 700123' : species === 'Pig' ? 'e.g. AB1234' : 'e.g. UK 0123456';

  const chooseType = (t) => {
    setProductType(t);
    if (t === 'Livestock') { setUnit('head'); if (species === 'Cattle') setQuantity('1'); }
    else if (unit === 'head') setUnit('kg');
  };
  const chooseSpecies = (sp) => {
    setSpecies(sp);
    if (sp === 'Cattle') setQuantity('1');
  };

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
      console.log('Creating batch (GASLESS)...');

      // GASLESS: Backend pays gas! The sign-in token says which farm this is.
      const response = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/create-batch', {
        batchId,
        productType,
        productName,
        quantity: Number(quantity),
        harvestDate: harvestDate || undefined,
        useBy: isLivestock ? undefined : (useBy || undefined),
        unit: isLivestock ? 'head' : unit,
        pricePerUnit: isLivestock || pricePerUnit === '' ? null : Number(pricePerUnit),
        season: season === 'auto' ? null : season,
        ...(isLivestock ? { species, animalRef, breed: breed || undefined, bornIn, rearedIn } : {})
      }, { headers: { Authorization: `Bearer ${farmerToken}` } });
      if (response.data.originWarning) window.alert(response.data.originWarning);

      console.log('Batch created (gasless):', response.data);

      // Generate QR code
      const qrUrl = await QRCode.toDataURL(batchLink(batchId), {
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
      setQuantity(isLivestock && species === 'Cattle' ? '1' : '');
      setAnimalRef('');

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
    if (onBatchCreated) onBatchCreated();
    if (onSuccess) onSuccess();
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
            onChange={(e) => chooseType(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            required
          >
            {productTypes.map(type => (
              <option key={type} value={type}>{type === 'Livestock' ? 'Livestock (going to an abattoir)' : type}</option>
            ))}
          </select>
        </div>

        {/* Livestock: who the animals are — this goes on the blockchain, so every cut can be traced back */}
        {isLivestock && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">🐄 About the animals</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Species *</label>
                <select value={species} onChange={(e) => chooseSpecies(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
                  {Object.entries(SPECIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{refLabel} *</label>
                <input value={animalRef} onChange={(e) => setAnimalRef(e.target.value)} required placeholder={refExample}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Born in *</label>
                <input value={bornIn} onChange={(e) => { setBornIn(e.target.value); if (rearedIn === bornIn) setRearedIn(e.target.value); }} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Reared in *</label>
                <input value={rearedIn} onChange={(e) => setRearedIn(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Breed <span className="text-gray-400 font-normal">— optional</span></label>
                <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Aberdeen Angus"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            <p className="text-xs text-amber-800">
              {species === 'Cattle'
                ? 'Cattle are tracked one by one: register each animal as its own batch, with its ear tag.'
                : 'Animals from the same flock / herd going to slaughter together can be one batch.'}
              {' '}The ear tag / flock mark and countries are public (they're printed on meat labels by law).
            </p>
          </div>
        )}

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
              placeholder={isLivestock ? 'Number of animals' : 'e.g., 50'}
              step={isLivestock ? '1' : 'any'}
              min={isLivestock ? '1' : '0.001'}
              disabled={isLivestock && species === 'Cattle'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Unit *
            </label>
            {isLivestock ? (
              <p className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">head</p>
            ) : (
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
            )}
          </div>
          </div>

        {/* Dates — recorded on the blockchain */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{isLivestock ? 'Date of birth' : 'Harvest date'}</label>
            <input
              type="date"
              value={harvestDate}
              max={today}
              onChange={(e) => setHarvestDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{isLivestock ? 'For a group: the oldest animal\'s, roughly' : 'For meat: slaughter / processing date'}</p>
          </div>
          {!isLivestock && <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Use by <span className="text-gray-400 font-normal">— optional</span>
            </label>
            <input
              type="date"
              value={useBy}
              min={harvestDate || today}
              onChange={(e) => setUseBy(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">Cafés and customers will see this</p>
          </div>}
        </div>

        {/* Price field (optional) — not for live animals */}
        {!isLivestock && <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Price per {unit} (£) <span className="text-gray-400 font-normal">— optional</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value)}
            placeholder="e.g., 2.50"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500 mt-1">Restaurants see this when ordering. You can change it later, or per order. Customers never see prices.</p>
        </div>}

        {/* Season field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Season
          </label>
          <select
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="auto">Auto-detect (Current Season)</option>
            <option value="spring">🌸 Spring</option>
            <option value="summer">🌞 Summer</option>
            <option value="autumn">🍂 Autumn</option>
            <option value="winter">❄️ Winter</option>
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Auto-detected, can override for greenhouse crops
          </p>
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

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="w-full text-gray-600 hover:underline text-sm"
          >
            Cancel
          </button>
        )}
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
                href={`https://sepolia.basescan.org/tx/${createdBatch.transactionHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-xs font-mono break-all"
              >
                View on Basescan ↗
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
                <NfcShare url={batchLink(batchId)} compact />
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