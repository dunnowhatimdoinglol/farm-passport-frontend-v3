import { useState } from 'react';
import axios from 'axios';
import QRCode from 'qrcode';
import { batchLink } from './walletHelpers';
import NfcShare from './NfcShare';

// farmerToken = the farmer's sign-in token (the farm is worked out from it on the server)
function CreateBatchForm({ farmerToken, season, setSeason, onBatchCreated, onSuccess, onCancel, onSendToAbattoir, recent = [] }) {
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
  // Cattle: one row per animal (its own ear tag + date of birth, optional breed) → one batch each
  const [animals, setAnimals] = useState([{ tag: '', dob: '', breed: '' }]);
  const [pasting, setPasting] = useState(null);           // text being pasted as a list, or null
  const [progress, setProgress] = useState(null);         // "Registering 2 of 5…"
  const [breed, setBreed] = useState('');
  const [bornIn, setBornIn] = useState('United Kingdom');
  const [rearedIn, setRearedIn] = useState('United Kingdom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdBatch, setCreatedBatch] = useState(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [warn, setWarn] = useState('');                   // e.g. a note about where the animal was born (v4.4: shown here, not as a pop-up)
  // v4.4: "Same as last time" — the farm's recent products (not animals), newest first, one each
  const repeats = [];
  for (const b of recent) {
    if (b.productType === 'Livestock' || !b.productName) continue;
    const k = `${String(b.productName).toLowerCase()}|${b.unit}`;
    if (!repeats.some(r => r.k === k)) repeats.push({ k, b });
    if (repeats.length >= 4) break;
  }
  const repeat = (b) => {
    setProductType(b.productType || 'Vegetable'); setProductName(b.productName || ''); setUnit(b.unit || 'kg');
    setPricePerUnit(b.pricePerUnit != null ? String(b.pricePerUnit) : '');
    setHarvestDate(today); setUseBy(''); setQuantity('');
  };

  // No "Meat": meat sold to cafés comes from an approved abattoir, so register the live animals instead
  const productTypes = ['Vegetable', 'Fruit', 'Dairy', 'Grain', 'Livestock'];
  const units = ['kg', 'units', 'litres', 'dozen'];
  const isLivestock = productType === 'Livestock';
  const isCattle = isLivestock && species === 'Cattle';
  const tidyTag = (t) => t.trim().replace(/\s+/g, ' ').toUpperCase();
  const filled = animals.filter(a => a.tag.trim());
  const tags = filled.map(a => tidyTag(a.tag));
  const dupTag = tags.find((t, i) => tags.findIndex(x => x.replace(/ /g, '') === t.replace(/ /g, '')) !== i);
  const noDob = filled.some(a => !a.dob);
  const setAnimal = (i, k, v) => setAnimals(animals.map((a, j) => (j === i ? { ...a, [k]: v } : a)));
  // "UK 123456 700123, 02/03/2024, Hereford" per line (date as DD/MM/YYYY or YYYY-MM-DD; breed optional)
  const readList = (text) => text.split(/\n+/).map(l => l.trim()).filter(Boolean).map(l => {
    const [tag, d = '', breed = ''] = l.split(/\s*[,;\t]\s*/);
    const m = d.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
    const dob = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : (/^\d{4}-\d{2}-\d{2}$/.test(d) ? d : '');
    return { tag, dob, breed };
  });
  const SPECIES = { Cattle: 'Cattle', Sheep: 'Sheep / lambs', Pig: 'Pigs', Goat: 'Goats' };
  const refLabel = species === 'Cattle' ? 'Ear tag number' : species === 'Pig' ? 'Herd mark' : 'Flock mark';
  const refExample = species === 'Cattle' ? 'e.g. UK 123456 700123' : species === 'Pig' ? 'e.g. AB1234' : 'e.g. UK 0123456';

  const chooseType = (t) => {
    setProductType(t);
    if (t === 'Livestock') setUnit('head');
    else if (unit === 'head') setUnit('kg');
  };
  const chooseSpecies = (sp) => setSpecies(sp);

  const generateBatchId = () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    const type = productType.substring(0, 3).toUpperCase();
    return `${type}-${date}-${random}`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (isCattle) return registerCattle();
    setLoading(true);
    // v4.4: the batch ID is optional — one is made up for you if left blank
    const id = batchId.trim() || generateBatchId();
    if (!batchId.trim()) setBatchId(id);

    try {
      console.log('Creating batch (GASLESS)...');

      // GASLESS: Backend pays gas! The sign-in token says which farm this is.
      const response = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/create-batch', {
        batchId: id,
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
      if (response.data.originWarning) setWarn(response.data.originWarning);

      console.log('Batch created (gasless):', response.data);

      // Generate QR code
      const qrUrl = await QRCode.toDataURL(batchLink(id), {
        width: 300,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      setQrCodeUrl(qrUrl);
      setCreatedBatch({
        batchId: id,
        productName,
        transactionHash: response.data.transactionHash
      });
      
      setShowSuccess(true);

      // Reset form
      setBatchId('');
      setProductName('');
      setQuantity('');
      setAnimalRef('');

    } catch (err) {
      console.error('Error creating batch:', err);
      setError(err.response?.data?.error || err.message || 'Failed to create batch');
    } finally {
      setLoading(false);
    }
  };

  // Cattle: one batch per animal (each has its own ear tag and passport), all with the same details
  const registerCattle = async () => {
    if (!tags.length) { setError('Enter at least one ear tag'); return; }
    if (dupTag) { setError(`${dupTag} is in the list twice`); return; }
    if (noDob) { setError('Enter a date of birth for each animal (it’s on its passport)'); return; }
    setLoading(true);
    const done = [];
    const failed = [];
    for (const [i, a] of filled.entries()) {
      const tag = tidyTag(a.tag);
      setProgress(`Registering ${i + 1} of ${filled.length}…`);
      const id = `COW-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      try {
        const r = await axios.post('https://farm-passport-backend-v3.onrender.com/api/farmer/create-batch', {
          batchId: id, productType: 'Livestock', productName, quantity: 1, unit: 'head',
          harvestDate: a.dob, season: season === 'auto' ? null : season,
          species, animalRef: tag, breed: a.breed.trim() || breed || undefined, bornIn, rearedIn
        }, { headers: { Authorization: `Bearer ${farmerToken}` } });
        done.push({ batchId: id, animalRef: tag, transactionHash: r.data.transactionHash, warning: r.data.originWarning || null });
      } catch (err) {
        failed.push({ a, why: `${tag}: ${err.response?.data?.error || err.message}` });
      }
    }
    setProgress(null);
    setLoading(false);
    if (failed.length) setError(`${done.length ? `${done.length} registered. ` : ''}Not registered — ${failed.map(f => f.why).join(' · ')}`);
    if (done.length) {
      // Keep only the ones that didn't go through, so they can be fixed and tried again
      setAnimals(failed.length ? failed.map(f => f.a) : [{ tag: '', dob: '', breed: '' }]);
      const qrUrl = done.length === 1 ? await QRCode.toDataURL(batchLink(done[0].batchId), { width: 300, margin: 2 }) : '';
      setQrCodeUrl(qrUrl);
      setCreatedBatch({ batchId: done[0].batchId, productName, transactionHash: done[0].transactionHash, list: done });
      setShowSuccess(true);
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
      {warn && <p className="mb-3 text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">⚠️ {warn}</p>}
      {repeats.length > 0 && (
        <div className="mb-4">
          <p className="text-sm font-semibold text-gray-700 mb-1.5">⚡ Same as last time</p>
          <div className="flex gap-2 flex-wrap">
            {repeats.map(({ k, b }) => (
              <button key={k} type="button" onClick={() => repeat(b)}
                className={`text-sm px-3 py-1.5 rounded-full border transition ${productName === b.productName && unit === b.unit ? 'bg-green-600 text-white border-green-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {b.productName}{b.pricePerUnit != null ? ` · £${Number(b.pricePerUnit).toFixed(2)}/${b.unit}` : ` · ${b.unit}`}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">Fills in the product, unit and price. Then just add the amount.</p>
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        {!isCattle && <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Batch ID <span className="font-normal text-gray-400">(optional: we make one up if you leave it blank)</span>
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
              placeholder="e.g., VEG-20260129-ABC1"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
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
            A batch is one lot of produce (e.g. this week's carrots). Its ID goes on the QR code and the blockchain record.
          </p>
        </div>}

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
          {!isLivestock && <p className="text-xs text-gray-500 mt-1">Selling meat? Register the live animals as <strong>Livestock</strong>. The abattoir records the carcass and cuts, and cafés order them from your meat list.</p>}
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
              {!isCattle && <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{refLabel} *</label>
                <input value={animalRef} onChange={(e) => setAnimalRef(e.target.value)} required placeholder={refExample}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono" />
              </div>}

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
                <label className="block text-xs font-medium text-gray-700 mb-1">Breed <span className="text-gray-400 font-normal">— optional{isCattle ? ', for all of them unless a row says otherwise' : ''}</span></label>
                <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="e.g. Aberdeen Angus"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
              </div>
            </div>
            {isCattle && (
              <div className="bg-white border border-amber-200 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                  <p className="text-sm font-semibold text-gray-800">The animals <span className="font-normal text-gray-500">({tags.length})</span></p>
                  <button type="button" onClick={() => setPasting(pasting === null ? '' : null)} className="text-xs text-blue-600 hover:underline">
                    {pasting === null ? '📋 Paste a list instead' : 'Back to the rows'}</button>
                </div>
                {pasting !== null ? (
                  <div className="space-y-2">
                    <textarea value={pasting} onChange={(e) => setPasting(e.target.value)} rows={5}
                      placeholder={'One animal per line: ear tag, date of birth, breed (optional)\nUK 123456 700123, 02/03/2024, Hereford\nUK 123456 700124, 15/04/2024'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs" />
                    <button type="button" disabled={!pasting.trim()} onClick={() => { setAnimals(readList(pasting)); setPasting(null); }}
                      className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded-lg disabled:bg-gray-300">Use this list ({readList(pasting).length})</button>
                    <p className="text-xs text-gray-500">You can copy the ear tags and dates of birth from your herd records or a spreadsheet.</p>
                  </div>
                ) : (
                  <>
                    <div className="hidden sm:flex gap-2 text-xs font-semibold text-gray-600 mb-1">
                      <span className="flex-1">Ear tag *</span><span className="w-40">Date of birth *</span><span className="w-36">Breed (if different)</span><span className="w-4" />
                    </div>
                    {animals.map((a, i) => {
                      const t = tidyTag(a.tag);
                      const dup = a.tag.trim() && tags.filter(x => x.replace(/ /g, '') === t.replace(/ /g, '')).length > 1;
                      return (
                        <div key={i} className="flex gap-2 items-center mb-2 flex-wrap">
                          <input value={a.tag} onChange={(e) => setAnimal(i, 'tag', e.target.value)} placeholder="UK 123456 700123" aria-label="Ear tag"
                            className={`flex-1 min-w-[10rem] px-2 py-1.5 border rounded font-mono text-sm ${dup ? 'border-red-500 bg-red-50' : 'border-gray-300'}`} />
                          <input type="date" value={a.dob} max={today} onChange={(e) => setAnimal(i, 'dob', e.target.value)} aria-label="Date of birth"
                            className={`w-40 px-2 py-1.5 border rounded text-sm ${a.tag.trim() && !a.dob ? 'border-amber-400' : 'border-gray-300'}`} />
                          <input value={a.breed} onChange={(e) => setAnimal(i, 'breed', e.target.value)} placeholder={breed || 'e.g. Hereford'} aria-label="Breed"
                            className="w-36 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                          <span className="w-4">{animals.length > 1 && <button type="button" onClick={() => setAnimals(animals.filter((_, j) => j !== i))} className="text-xs text-red-600" aria-label="Remove animal">✕</button>}</span>
                        </div>
                      );
                    })}
                    <button type="button" onClick={() => setAnimals([...animals, { tag: '', dob: animals[animals.length - 1]?.dob || '', breed: '' }])}
                      className="text-xs text-blue-600 hover:underline">+ another animal</button>
                    {dupTag && <p className="text-xs text-red-600 mt-1">{dupTag} is listed twice.</p>}
                  </>
                )}
              </div>
            )}
            <p className="text-xs text-amber-800">
              {species === 'Cattle'
                ? 'Cattle are tracked one by one (each has its own ear tag and passport), so each animal becomes its own batch with its own date of birth. Add several rows to register them all at once.'
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
            {isCattle ? (
              <p className="px-4 py-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-700">{tags.length} <span className="text-xs text-gray-500">(one per ear tag)</span></p>
            ) : (
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={isLivestock ? 'Number of animals' : 'e.g., 50'}
              step={isLivestock ? '1' : 'any'}
              min={isLivestock ? '1' : '0.001'}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
              required
            />
            )}
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
        {!isCattle && <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{isLivestock ? 'Date of birth' : 'Harvest date'}</label>
            <input
              type="date"
              value={harvestDate}
              max={today}
              onChange={(e) => setHarvestDate(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">{isLivestock ? 'For a group: the oldest animal\'s, roughly' : 'When it was picked / harvested'}</p>
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
        </div>}

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
          disabled={loading || (isCattle && (!tags.length || !!dupTag || noDob))}
          className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {loading ? (progress || 'Creating Batch (Gasless)...')
            : isCattle ? `Register ${tags.length || ''} ${tags.length === 1 ? 'animal' : 'animals'} (No ETH Needed!)` : 'Create Batch (No ETH Needed!)'}
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
              {createdBatch.list?.length > 1 ? (
                <div className="text-sm text-gray-600 max-h-40 overflow-y-auto">
                  <p className="font-semibold">{createdBatch.list.length} animals registered:</p>
                  {createdBatch.list.map(c => <p key={c.batchId} className="font-mono text-xs">{c.animalRef} → {c.batchId}</p>)}
                  <p className="text-xs mt-1">Print each animal's QR code from its batch page.</p>
                </div>
              ) : (
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Batch ID:</span> {createdBatch.batchId}
              </p>
              )}
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
                <NfcShare url={batchLink(createdBatch.batchId)} compact />
              </div>
            )}

            {createdBatch.list?.length > 0 && onSendToAbattoir && (
              <button
                onClick={() => { const ids = createdBatch.list.map(c => c.batchId); handleClose(); onSendToAbattoir(ids); }}
                className="w-full mb-3 bg-red-700 text-white py-3 rounded-lg hover:bg-red-800 transition font-semibold"
              >
                🐄 Send {createdBatch.list.length === 1 ? 'it' : `these ${createdBatch.list.length}`} to an abattoir now
              </button>
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