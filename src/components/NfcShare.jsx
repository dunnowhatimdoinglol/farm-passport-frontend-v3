// "📶 Write to NFC tag" + "🔗 Copy link" for a receipt or batch link.
// Writing works in Chrome on Android; elsewhere, copy the link and use the free "NFC Tools" app.
import { useState } from 'react';
import { canWriteNfc, writeNfcUrl } from './walletHelpers';

export default function NfcShare({ url, compact = false }) {
  const [status, setStatus] = useState(null);   // { kind: 'wait' | 'ok' | 'err', text }
  const nfc = canWriteNfc();

  const write = async () => {
    setStatus({ kind: 'wait', text: 'Hold the NFC tag against the back of your phone…' });
    try {
      await writeNfcUrl(url);
      setStatus({ kind: 'ok', text: '✅ Written! Tap the tag with any phone to test it.' });
    } catch (err) {
      const text = err?.name === 'NotAllowedError'
        ? 'NFC permission was blocked — allow NFC for this site and try again.'
        : err?.name === 'NotSupportedError'
          ? 'NFC is turned off or not available — switch it on in your phone settings.'
          : `Could not write the tag (${err?.message || 'unknown error'}). It may be locked or too small.`;
      setStatus({ kind: 'err', text });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ kind: 'ok', text: '🔗 Link copied.' + (nfc ? '' : ' To put it on a tag, use the free "NFC Tools" app → Write → URL.') });
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const btn = compact
    ? 'text-xs font-semibold px-3 py-1.5 rounded-lg'
    : 'text-sm font-semibold px-4 py-2 rounded-lg';

  return (
    <div className={compact ? 'mt-2' : 'mt-3'}>
      <div className="flex gap-2 flex-wrap justify-center">
        {nfc && (
          <button type="button" onClick={write} disabled={status?.kind === 'wait'}
            className={`${btn} bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-400`}>
            📶 Write to NFC tag
          </button>
        )}
        <button type="button" onClick={copy}
          className={`${btn} bg-gray-100 text-gray-700 hover:bg-gray-200`}>
          🔗 Copy link
        </button>
      </div>
      {status && (
        <p className={`text-xs mt-2 text-center ${status.kind === 'err' ? 'text-red-600' : status.kind === 'ok' ? 'text-green-700' : 'text-gray-600'}`}>
          {status.text}
        </p>
      )}
      {!nfc && !compact && !status && (
        <p className="text-xs text-gray-400 mt-1 text-center">NFC writing works in Chrome on Android. On other phones, copy the link into the NFC Tools app.</p>
      )}
    </div>
  );
}