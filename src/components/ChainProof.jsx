// ChainProof — help people check Farm Passport's records on the blockchain themselves.
//   <TxLink hash="0x…" />          a small "Verify ↗" link to the transaction on Basescan
//   <ChainHelp who="farm" />       a collapsible "How to check this on the blockchain" guide (farm / cafe / abattoir / diner)
import { useState, useEffect } from 'react';
import axios from 'axios';
import { API_BASE, EXPLORER } from './walletHelpers';

export function TxLink({ hash, label = 'Verify', className = '' }) {
  if (!hash || !/^0x[0-9a-fA-F]{64}$/.test(hash)) return null;
  return (
    <a href={`${EXPLORER}/tx/${hash}`} target="_blank" rel="noopener noreferrer" title="Open this record on the blockchain (Basescan)"
      className={`inline-flex items-center gap-0.5 text-xs text-blue-600 hover:underline whitespace-nowrap ${className}`}>
      🔗 {label} ↗
    </a>
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
              <li>Click a <span className="text-blue-600">🔗 Verify ↗</span> link next to it. Basescan (a public blockchain viewer) opens on that transaction.</li>
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