// Proof of delivery photos — shared bits for the restaurant and farm screens
//   shrinkPhoto(file)      → a smaller JPEG (max 1600px, ~200–400 KB) ready to upload
//   <PhotoPicker />        → "Take / add photo" button with a preview
//   <DeliveryPhotoButton/> → "View delivery photo" — opens the photo and shows if it matches the blockchain
import { useState, useRef } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER } from './walletHelpers';

export async function shrinkPhoto(file, maxSide = 1600, quality = 0.8) {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', quality));
    if (blob) return new File([blob], 'delivery.jpg', { type: 'image/jpeg' });
  } catch (e) {
    console.warn('Could not shrink photo, sending original', e);
  }
  // Fall back to the original if the browser couldn't redraw it
  if (/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  throw new Error('Please use a JPEG or PNG photo');
}

export function PhotoPicker({ photo, onChange, disabled }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';                       // allow picking the same file again
    if (!f) return;
    setBusy(true); setError(null);
    try {
      const small = await shrinkPhoto(f);
      onChange({ file: small, preview: URL.createObjectURL(small) });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2">
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
      {photo ? (
        <div className="flex items-center gap-3">
          <img src={photo.preview} alt="Delivery" className="w-20 h-20 object-cover rounded-lg border border-gray-300" />
          <div className="text-xs space-y-1">
            <p className="text-green-700 font-semibold">📷 Photo added</p>
            <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled} className="text-gray-600 hover:underline block">Retake</button>
            <button type="button" onClick={() => onChange(null)} disabled={disabled} className="text-red-600 hover:underline block">Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={disabled || busy}
          className="text-sm border-2 border-dashed border-green-400 text-green-800 bg-white px-4 py-2 rounded-lg hover:bg-green-50 disabled:opacity-50">
          {busy ? 'Preparing photo…' : '📷 Add a delivery photo (recommended)'}
        </button>
      )}
      {error && <p className="text-xs text-red-600 mt-1">⚠️ {error}</p>}
    </div>
  );
}

export function DeliveryPhotoButton({ shipmentId, token, label = '📷 View delivery photo' }) {
  const [state, setState] = useState(null);     // null | 'loading' | { url, verified, txHash } | { error }

  const open = async () => {
    if (state && state !== 'loading' && !state.error) { setState(null); return; }   // toggle closed
    setState('loading');
    try {
      const res = await axios.get(`${API_BASE}/shipments/${shipmentId}/delivery-photo`,
        { headers: { Authorization: `Bearer ${token}` } });
      setState(res.data);
    } catch (err) {
      setState({ error: err.response?.data?.error || 'Could not open the photo' });
    }
  };

  return (
    <div className="mt-1">
      <button type="button" onClick={open} className="text-xs text-green-700 font-semibold hover:underline">
        {state === 'loading' ? 'Opening…' : state && !state.error ? 'Hide photo' : label}
      </button>
      {state?.error && <p className="text-xs text-red-600">⚠️ {state.error}</p>}
      {state?.url && (
        <div className="mt-2">
          <a href={state.url} target="_blank" rel="noopener noreferrer">
            <img src={state.url} alt="Proof of delivery" className="max-w-xs w-full rounded-lg border border-gray-300" />
          </a>
          <p className={`text-xs mt-1 font-semibold ${state.verified ? 'text-green-700' : 'text-red-600'}`}>
            {state.verified ? '✅ Matches the fingerprint on the blockchain' : '⚠️ This photo does NOT match the blockchain record'}
            {state.txHash && (
              <> · <a href={`${EXPLORER}/tx/${state.txHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-normal">Verify ↗</a></>
            )}
          </p>
        </div>
      )}
    </div>
  );
}