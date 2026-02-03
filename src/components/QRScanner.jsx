import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * QRScanner – camera + manual input.
 *
 * Props:
 *   onScanSuccess(payload)
 *     payload = { type: 'receipt', receiptId: 'RECEIPT-...' }
 *            OR { type: 'batch',   batchId:  'VEGMIX-...' }
 *
 * Detection rule:
 *   starts with "RECEIPT-"  →  receipt
 *   anything else           →  batch
 */

function classifyInput(raw) {
  const trimmed = raw.trim();
  if (trimmed.toUpperCase().startsWith('RECEIPT-')) {
    return { type: 'receipt', receiptId: trimmed };
  }
  return { type: 'batch', batchId: trimmed };
}

function QRScanner({ onScanSuccess }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [manualInput, setManualInput] = useState('');
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);

  // ──────────────────────────────────────────────
  // Camera scanning
  // ──────────────────────────────────────────────
  const startScanner = async () => {
    try {
      setError(null);
      setScanning(true);

      html5QrCodeRef.current = new Html5Qrcode('qr-reader');

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          stopScanner();
          onScanSuccess(classifyInput(decodedText));
        },
        () => {
          // scanning frame misses – ignore silently
        }
      );
    } catch (err) {
      setError(err.message);
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current.clear();
      } catch (_) {}
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => stopScanner();
  }, []);

  // ──────────────────────────────────────────────
  // Manual entry
  // ──────────────────────────────────────────────
  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      onScanSuccess(classifyInput(manualInput));
      setManualInput('');
    }
  };

  // ──────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Camera card ── */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">📸 Scan QR Code</h2>
        <p className="text-gray-600 mb-4">
          Point your camera at the QR code on produce or your receipt
        </p>

        {!scanning ? (
          <button
            onClick={startScanner}
            className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition flex items-center justify-center gap-2"
          >
            📷 Start Camera
          </button>
        ) : (
          <button
            onClick={stopScanner}
            className="w-full bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition flex items-center justify-center gap-2"
          >
            ⏹ Stop Camera
          </button>
        )}

        {error && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">⚠️ {error}</p>
          </div>
        )}

        {/* html5-qrcode mounts here */}
        <div
          id="qr-reader"
          className={scanning ? 'mt-4 border-4 border-green-500 rounded-lg overflow-hidden' : 'mt-4'}
        />
      </div>

      {/* ── Manual entry card ── */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-3">
          Or enter code manually:
        </h3>
        <form onSubmit={handleManualSubmit} className="space-y-3">
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Batch ID or Receipt ID…"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition"
          >
            Look Up
          </button>
        </form>

        {/* ── Hint about the two QR types ── */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500 font-semibold mb-1">💡 Two types of QR code:</p>
          <p className="text-xs text-gray-500">
            <strong>Menu QR</strong> – e.g. <code className="bg-gray-100 px-1 rounded">VEGMIX-BIG-20260102-001</code> – view the farm story.
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            <strong>Receipt QR</strong> – e.g. <code className="bg-gray-100 px-1 rounded">RECEIPT-20260201-ABC123</code> – claim your badge.
          </p>
        </div>
      </div>
    </div>
  );
}

export default QRScanner;