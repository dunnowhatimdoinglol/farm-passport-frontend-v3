// Shared helpers for pages that use a wallet (Supply Chain, Admin, Farmer sign-in)
import axios from 'axios';
import { ethers } from 'ethers';

export const API_BASE = 'https://farm-passport-backend-v3.onrender.com/api';
export const EXPLORER = 'https://sepolia.basescan.org';
export const QTY_SCALE = 1000;   // the contract stores quantities in thousandths (1.5 kg = 1500)

// Base Sepolia network details (used to switch MetaMask to the right network)
export const BASE_SEPOLIA = {
  chainId: '0x14a34',                     // 84532
  chainName: 'Base Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia.base.org'],
  blockExplorerUrls: [EXPLORER],
};

// Only the contract functions the browser calls directly (depots in MetaMask, the admin)
export const SUPPLY_CHAIN_ABI = [
  'function confirmReceipt(address _onBehalfOf, uint256 _shipmentId, uint256 _received, uint256 _rejected, bytes32 _photo, bytes32 _orderHash, string _notes)',
  'function forward(address _onBehalfOf, uint256 _parentId, address _to, uint256 _quantity, address _carrier, bytes32 _orderHash, string _notes) returns (uint256)',
  'function returnGoods(address _onBehalfOf, uint256 _shipmentId, uint256 _quantity, address _carrier, string _notes) returns (uint256)',
  'function cancel(address _onBehalfOf, uint256 _shipmentId, string _notes)',
  'function carrierArrived(address _onBehalfOf, uint256 _shipmentId, string _location, string _notes, bytes32 _photo)',
  'function carrierOutForDelivery(address _onBehalfOf, uint256 _shipmentId, string _notes, bytes32 _photo)',
  'function addCheckpoint(address _onBehalfOf, string _batchId, uint256 _shipmentId, string _stage, string _location, string _notes, bytes32 _evidence)',
  'function authorizeHandler(address _who, string _name, string[] _stages)',
  'function revokeParticipant(address _who)',
  'function setOperator(address _who, bool _allowed)',
  'function liftRecall(string _batchId, string _reason)',
  'function pause()',
  'function unpause()',
  'error EnforcedPause()',
  'error ExpectedPause()',
  'error OwnableUnauthorizedAccount(address account)',
];
// The badges contract: the admin only ever needs to make the backend an operator
export const BADGES_ABI = [
  'function setOperator(address who, bool allowed)',
  'function operators(address) view returns (bool)',
  'error OwnableUnauthorizedAccount(address account)',
];
const CUSTOM_ERRORS = {
  EnforcedPause: 'Farm Passport is paused right now — please try again later.',
  OwnableUnauthorizedAccount: 'Only the contract owner wallet can do this.',
};

export const hasWallet = () => typeof window !== 'undefined' && !!window.ethereum;
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const toScaled = (q) => BigInt(Math.round(Number(q) * QTY_SCALE));
export const formatQty = (amount, unit) =>
  `${Number(amount || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 })} ${unit || ''}`.trim();

/** One line describing a shipment's latest step, e.g. "Warehouse · Bristol Depot: "due out tomorrow" · 17 Oct, 09:10" */
export function lastStepText(step) {
  if (!step) return null;
  const when = new Date(step.recordedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const who = step.recorderName || step.location;
  return `${step.stage}${who ? ` · ${who}` : ''}${step.notes ? `: "${step.notes}"` : ''} · ${when}`;
}

/** Short time label, e.g. "17 Oct, 09:10" */
export const shortWhen = (d) =>
  new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Make sure MetaMask is on Base Sepolia (adds the network if it's missing). */
export async function ensureBaseSepolia() {
  const current = await window.ethereum.request({ method: 'eth_chainId' });
  if (current?.toLowerCase() === BASE_SEPOLIA.chainId) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: BASE_SEPOLIA.chainId }] });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [BASE_SEPOLIA] });
    } else {
      throw err;
    }
  }
}

/** Ask MetaMask for an account (and switch to Base Sepolia). Returns the address. */
export async function connectMetaMask() {
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  await ensureBaseSepolia();
  return accounts[0];
}

/** Traceability contract (or, with abi = BADGES_ABI, the badges contract) connected to the MetaMask signer. */
export async function supplyChainWithSigner(contractAddress, abi = SUPPLY_CHAIN_ABI) {
  await ensureBaseSepolia();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, abi, signer);
}

/**
 * Sign-in without sending a private key anywhere:
 * the server gives a one-time message, the wallet signs it, the server checks the signature.
 * @param address   wallet address
 * @param signFn    async (message) => signature   (MetaMask, or a local ethers.Wallet)
 * @param endpoint  e.g. '/farmer/auth' or '/admin/auth'
 */
export async function walletSignIn(address, signFn, endpoint) {
  const { data } = await axios.get(`${API_BASE}/auth/wallet/nonce/${address}`);
  const signature = await signFn(data.message);
  const res = await axios.post(`${API_BASE}${endpoint}`, { address, signature });
  return res.data;
}

/** Sign with MetaMask (personal_sign). */
export async function metaMaskSign(address, message) {
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner(address);
  return signer.signMessage(message);
}

/** Turn a wallet/contract error into a short readable message. */
export function walletError(err) {
  if (err?.code === 'ACTION_REJECTED' || err?.code === 4001) return 'Cancelled in MetaMask.';
  if (err?.revert?.name) return CUSTOM_ERRORS[err.revert.name] || err.revert.name;
  const reason = err?.reason || err?.shortMessage || err?.info?.error?.message || err?.response?.data?.error || err?.message || '';
  if (/insufficient funds/i.test(reason)) return 'This wallet needs a little Base Sepolia ETH to pay for gas.';
  return reason.replace(/^execution reverted:\s*/i, '').replace(/^"|"$/g, '') || 'Something went wrong.';
}

/**
 * Send a contract call from MetaMask: dry run first (clear error messages),
 * then send, wait, and ask the backend to copy the result from the chain.
 * Returns the transaction hash; `synced` says whether the app's copy was updated.
 */
export async function sendAndConfirm(contract, method, args, onStatus = () => {}) {
  await contract[method].staticCall(...args);
  onStatus('signing');
  const tx = await contract[method](...args);
  onStatus('mining');
  await tx.wait();
  onStatus('saving');
  const synced = await syncTransaction(tx.hash);
  onStatus('done');
  return { hash: tx.hash, synced };
}

/** Ask the backend to copy a transaction's results from the chain (retries a couple of times). */
export async function syncTransaction(txHash) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await axios.post(`${API_BASE}/supply/confirm-tx`, { txHash });
      return true;
    } catch (err) {
      console.error(`confirm-tx attempt ${attempt}:`, err.response?.data?.error || err.message);
      if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
    }
  }
  return false;   // it's on-chain either way; can be re-synced from the Admin page
}

// ─────────────────────────────────────────────
// Links for QR codes & NFC tags
//   /r/<receiptId>  → a receipt (claim the badge)
//   /b/<batchId>    → a batch's farm story
// Set VITE_SITE_URL on Render if the site ever moves to its own domain (e.g. https://fpass.uk)
// ─────────────────────────────────────────────
export const SITE_URL = (import.meta.env?.VITE_SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
export const receiptLink = (id) => `${SITE_URL}/r/${encodeURIComponent(id)}`;
export const batchLink   = (id) => `${SITE_URL}/b/${encodeURIComponent(id)}`;

// Turn anything scanned / opened into { type: 'receipt' | 'batch', id }.
// Understands the new links AND the old QR codes that hold just the ID.
export function parseFarmLink(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  const m = t.match(/\/(r|b)\/([^/?#\s]+)/);           // https://…/r/RECEIPT-… or /b/BATCH-…
  if (m) {
    let id = m[2];
    try { id = decodeURIComponent(id); } catch { /* keep as is */ }
    return { type: m[1] === 'r' ? 'receipt' : 'batch', id };
  }
  if (/^https?:\/\//i.test(t)) return null;             // some other website — not ours
  return { type: /^RECEIPT-/i.test(t) ? 'receipt' : 'batch', id: t };
}

// Writing NFC tags from a web page only works in Chrome on Android
export const canWriteNfc = () => typeof window !== 'undefined' && 'NDEFReader' in window;
export async function writeNfcUrl(url) {
  const ndef = new window.NDEFReader();
  await ndef.write({ records: [{ recordType: 'url', data: url }] }, { overwrite: true });
}