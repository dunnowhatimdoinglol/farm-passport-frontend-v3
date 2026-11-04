// ChainProof — help people check Farm Passport's records on the blockchain themselves.
//   <TxLink hash="0x…" />          a small "🔗 Verify" button: the record in plain words (read from the chain), + a Basescan link
//   <ChainHelp who="farm" />       a collapsible "How to check this on the blockchain" guide (farm / cafe / abattoir / diner)
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER } from './walletHelpers';

// "🔗 Verify" opens the record in plain words, read straight from the blockchain, with a link to Basescan to check it there too
export function TxLink({ hash, label = 'Verify', className = '' }) {
  const [open, setOpen] = useState(false);
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return (
    <>
      <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true); }} title="See what the blockchain recorded"
        className={`inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline whitespace-nowrap ${className}`}>
        🔗 {label}
      </button>
      {open && <TxExplain hash={hash} onClose={() => setOpen(false)} />}
    </>
  );
}

export function TxExplain({ hash, onClose }) {
  const [tx, setTx] = useState(null);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  useEffect(() => {
    axios.get(`${API_BASE}/tx/${hash}`).then(r => setTx(r.data.tx)).catch(e => setError(e.response?.data?.error || 'Could not read this record right now'));
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [hash]);
  const main = (tx?.lines || []).filter(l => !l.history);
  const history = (tx?.lines || []).filter(l => l.history);
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg text-left" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Blockchain record">
        <div className="flex justify-between items-start gap-2 px-5 pt-4 pb-3 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">🔗 Blockchain record</p>
            <p className="text-lg font-bold text-gray-900 leading-snug">{tx ? tx.headline : error ? 'Not available' : 'Reading the blockchain…'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1" aria-label="Close">✕</button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          {error && <p className="text-red-600">⚠️ {error}</p>}
          {!tx && !error && <p className="text-gray-500">Loading…</p>}
          {tx && (
            <>
              <p className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${tx.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'}`}>
                {tx.status === 'success' ? '✔ Recorded' : '✖ Failed'}{tx.when ? ` · ${new Date(tx.when).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
              {main.length > 0 && (
                <ul className="space-y-1.5">
                  {main.map((l, i) => <li key={i} className="flex gap-2"><span className="shrink-0">{l.icon}</span><span className="text-gray-800">{l.text}</span></li>)}
                </ul>
              )}
              {tx.written?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  <p className="text-xs font-semibold text-amber-900 mb-0.5">Written into the record</p>
                  {tx.written.map((w, i) => <p key={i} className="text-gray-800"><span className="text-gray-500">{w.label}:</span> "{w.text}"</p>)}
                </div>
              )}
              {history.length > 0 && (
                <div>
                  <button onClick={() => setShowHistory(!showHistory)} className="text-xs text-gray-600 hover:underline">
                    {showHistory ? '▾' : '▸'} {history.length} entr{history.length === 1 ? 'y' : 'ies'} added to the product's permanent history
                  </button>
                  {showHistory && (
                    <ul className="mt-1 space-y-1 text-xs text-gray-600">
                      {history.map((l, i) => <li key={i} className="flex gap-2"><span>{l.icon}</span><span>{l.text}</span></li>)}
                    </ul>
                  )}
                </div>
              )}
              <div className="text-xs text-gray-500 space-y-0.5 border-t border-gray-100 pt-2">
                {tx.onBehalfOf && <p>Recorded for: <strong className="text-gray-700">{tx.onBehalfOf}</strong></p>}
                <p>Sent by: {tx.sentBy}</p>
                <p>Block {tx.blockNumber} · once recorded, nobody can change or delete it.</p>
              </div>
            </>
          )}
        </div>
        <div className="px-5 pb-4 flex flex-wrap gap-2 items-center justify-between">
          <p className="text-xs text-gray-500 max-w-xs">This is read from the blockchain just now. To check it yourself, open it on Basescan and look at the <strong>Logs</strong> tab.</p>
          <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noopener noreferrer"
            className="text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg whitespace-nowrap">Open on Basescan ↗</a>
        </div>
      </div>
    </div>
  );
}

const WHAT_YOU_DO = {
  farm: ['registering a batch or animal (BatchCreated)', 'sending, and every step on the way (ShipmentCreated, CheckpointAdded)', 'recalls (BatchRecalled)', 'the fingerprint of your Food Chain Information'],
  cafe: ['every delivery you confirm, and the order terms you accept (ShipmentReceived)', 'every bill: what came off your stock (SaleRecorded)', 'write-offs and returns'],
  abattoir: ['animals arriving or refused (ShipmentReceived)', 'each kill-sheet row and cutting session (Processed: weights in, weights out, waste)', 'everything you send (ShipmentCreated)', 'recalls of a carcass and everything made from it'],
  diner: ['where the animal or crop was born or grown', 'every hand-over on the way to the café', 'the moment the café served it', 'your badge'],
};

export function ChainHelp({ who = 'farm', className = '' }) {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState(null);
  useEffect(() => {
    if (!open || info) return;
    axios.get(`${API_BASE.replace(/\/api$/, '')}/health`).then(r => setInfo(r.data)).catch(() => setInfo({}));
  }, [open]);
  const addr = (a) => a && /^0x[0-9a-fA-F]{40}$/.test(a) && a !== '0x0000000000000000000000000000000000000000';

  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg ${className}`}>
      <button onClick={() => setOpen(!open)} className="w-full flex justify-between items-center px-4 py-2.5 text-left">
        <span className="text-sm font-semibold text-blue-900">🔍 How to check this on the blockchain</span>
        <span className="text-xs text-blue-700">{open ? 'Hide ▴' : 'Show ▾'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 text-sm text-gray-800 space-y-3">
          <p>
            Farm Passport records each step on <strong>Base Sepolia</strong>, a public blockchain (a test network for now).
            Once something is recorded, nobody can change or delete it, not even Farm Passport. Anyone can look it up for free.
          </p>
          <div>
            <p className="font-semibold">What gets recorded{who === 'diner' ? ' about your food' : ' when you use Farm Passport'}:</p>
            <ul className="list-disc ml-5 text-gray-700">{WHAT_YOU_DO[who].map(x => <li key={x}>{x}</li>)}</ul>
          </div>
          <div>
            <p className="font-semibold">To check a record:</p>
            <ol className="list-decimal ml-5 text-gray-700 space-y-1">
              <li>Click a <span className="text-blue-600">🔗 Verify</span> link next to it. You'll see what the blockchain recorded, in plain words. Click <strong>Open on Basescan</strong> (a public blockchain viewer) to check the same transaction yourself.</li>
              <li><strong>Status: Success</strong> and the timestamp show it was recorded then, and it can't have been changed since.</li>
              <li><strong>To</strong> is the Farm Passport contract (address below). <strong>From</strong> is Farm Passport's own wallet, which records the step for {who === 'diner' ? 'the farm or café' : 'you'} and pays the fee, so {who === 'diner' ? 'they' : 'you'} need no crypto.</li>
              <li>Open the <strong>Logs</strong> tab to see the details: the batch ID, who it went from and to, and quantities. Quantities are in thousandths, so 1500 means 1.5 kg or 1.5 head.
                If the logs only show codes, open the same transaction on <a className="text-blue-600 hover:underline" href="https://base-sepolia.blockscout.com" target="_blank" rel="noopener noreferrer">Blockscout</a>, another public viewer, which spells them out.</li>
            </ol>
          </div>
          {who !== 'diner' && (
            <p className="text-gray-700">
              <strong>What stays private:</strong> prices, Food Chain Information forms and delivery photos are <em>not</em> put on the blockchain. Only a
              {' '}<strong>fingerprint</strong> of them is, so a change would be spotted. Use the <strong>Verify</strong> buttons on orders, FCI and photos to check them against it.
            </p>
          )}
          <div className="bg-white border border-blue-100 rounded p-2 text-xs space-y-0.5">
            <p className="font-semibold text-gray-700">Farm Passport's contracts (read them yourself on Basescan → Contract → Read):</p>
            {!info ? <p className="text-gray-500">Loading…</p> : (
              <>
                {addr(info.traceabilityContract) && <p>Traceability (batches, deliveries, sales): <a className="font-mono text-blue-600 hover:underline break-all" href={`${EXPLORER}/address/${info.traceabilityContract}`} target="_blank" rel="noopener noreferrer">{info.traceabilityContract}</a></p>}
                {addr(info.processingContract) && <p>Processing (abattoirs, kill sheets, cutting): <a className="font-mono text-blue-600 hover:underline break-all" href={`${EXPLORER}/address/${info.processingContract}`} target="_blank" rel="noopener noreferrer">{info.processingContract}</a></p>}
                {addr(info.badgesContract) && <p>Badges: <a className="font-mono text-blue-600 hover:underline break-all" href={`${EXPLORER}/address/${info.badgesContract}`} target="_blank" rel="noopener noreferrer">{info.badgesContract}</a></p>}
                {addr(info.backendWallet) && <p>Farm Passport's wallet (sends on everyone's behalf): <a className="font-mono text-blue-600 hover:underline break-all" href={`${EXPLORER}/address/${info.backendWallet}`} target="_blank" rel="noopener noreferrer">{info.backendWallet}</a></p>}
                {!addr(info.traceabilityContract) && <p className="text-gray-500">Couldn't load the addresses right now.</p>}
              </>
            )}
            <p className="text-gray-500 pt-1">Tip: on the Traceability contract's page, <strong>Read as Proxy → getBatch</strong> with a batch ID shows its record straight from the blockchain.</p>
          </div>
        </div>
      )}
    </div>
  );
}