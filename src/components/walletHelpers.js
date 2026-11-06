// Shared helpers for pages that use a wallet (Supply Chain, Admin, Farmer sign-in)
import axios from 'axios';
import { ethers } from 'ethers';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import Maru from './Maru';

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
  // v4.1: connect the Processing contract, and upgrades (owner only)
  'function setProcessing(address _processing)',
  'function processing() view returns (address)',
  'function version() view returns (string)',
  'function upgradeToAndCall(address newImplementation, bytes data) payable',
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
// The Processing contract (abattoirs, cutting plants): the admin approves processors and the backend operator
export const PROCESSING_ABI = [
  'function setProcessor(address who, string approvalNumber, bool active)',
  'function setOperator(address who, bool allowed)',
  'function operators(address) view returns (bool)',
  'error OwnableUnauthorizedAccount(address account)',
  'error EnforcedPause()',
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

// ─────────────────────────────────────────────
// v4.4c — friendlier waiting. When a request to Farm Passport takes a while, Maru appears in the middle of the
// screen, slowly wagging his tail while his eyes go round, with a short line saying why:
//   signing in → "Signing you in…" · saving to the blockchain → "Saving to the blockchain…"
//   a long wait (the server waking up after a quiet spell) → "Waking up Farm Passport…" · anything else → "Just a moment…"
// Installed once, for every page that uses axios. It never blocks clicks.
// ─────────────────────────────────────────────
const SIGN_IN = /(login|log-in|signin|sign-in|register|verify|nonce|auth|session|magic)/i;
const ON_CHAIN = /(create-batch|dispatch|receive|create-receipt|claim|recall|process|slaughter|forward|confirm-return|return|kill|carcass|cut|checkpoint|deliver|batch\/.*\/(deal|split)|write-off|wasted)/i;
if (typeof window !== 'undefined' && !window.__fpSlowNote) {
  window.__fpSlowNote = true;
  const pending = new Map();
  let seq = 0, el = null, label = null, timer = null;
  const ours = (url) => String(url || '').startsWith(API_BASE.replace(/\/api$/, ''));
  const render = () => {
    const now = Date.now();
    const slow = [...pending.values()].filter(p => now - p.t > 1500);
    if (!slow.length) { if (el) el.style.display = 'none'; if (!pending.size && timer) { clearInterval(timer); timer = null; } return; }
    const long = slow.some(p => now - p.t > 8000);
    const text = long ? 'Waking up Farm Passport… this can take up to 30 seconds'
      : slow.some(p => p.signIn) ? 'Signing you in…'
      : slow.some(p => p.chain) ? 'Saving to the blockchain…'
      : 'Just a moment…';
    if (!el) {
      el = document.createElement('div');
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;pointer-events:none;'
        + 'background:rgba(255,255,255,.96);border:1px solid rgba(0,0,0,.06);border-radius:24px;padding:18px 26px 16px;'
        + 'box-shadow:0 20px 50px rgba(0,0,0,.18);text-align:center;width:220px;max-width:calc(100% - 32px)';
      const cat = document.createElement('div');
      label = document.createElement('p');
      label.style.cssText = 'margin:6px 0 0;font:600 14px/1.35 Manrope,system-ui,sans-serif;color:#2E3A30';
      el.appendChild(cat); el.appendChild(label);
      document.body.appendChild(el);
      createRoot(cat).render(createElement(Maru, { mode: 'loading', size: 120 }));
    }
    label.textContent = text;
    el.style.display = 'block';
  };
  axios.interceptors.request.use((cfg) => {
    if (ours(cfg.url)) {
      cfg.__fpId = ++seq;
      const write = (cfg.method || 'get').toLowerCase() !== 'get';
      pending.set(cfg.__fpId, { t: Date.now(), signIn: SIGN_IN.test(cfg.url), chain: write && ON_CHAIN.test(cfg.url) && !SIGN_IN.test(cfg.url) });
      if (!timer) timer = setInterval(render, 500);
    }
    return cfg;
  });
  const done = (cfg) => { if (cfg?.__fpId) { pending.delete(cfg.__fpId); render(); } };
  axios.interceptors.response.use((r) => { done(r.config); return r; }, (e) => { done(e.config); return Promise.reject(e); });
}