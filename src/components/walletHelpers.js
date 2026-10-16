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

// Only the contract functions the browser calls directly (handlers in MetaMask, admin)
export const SUPPLY_CHAIN_ABI = [
  'function confirmReceipt(address _onBehalfOf, uint256 _shipmentId, uint256 _quantityReceived, string _notes)',
  'function forward(address _onBehalfOf, uint256 _parentId, address _to, uint256 _quantity, string _notes) returns (uint256)',
  'function cancel(address _onBehalfOf, uint256 _shipmentId, string _notes)',
  'function addCheckpoint(address _onBehalfOf, string _batchId, uint256 _shipmentId, string _stage, string _location, string _notes)',
  'function authorizeHandler(address _who, string _name, string[] _stages)',
  'function revokeParticipant(address _who)',
  'function setRegistrar(address _who, bool _allowed)',
  'function pause()',
  'function unpause()',
];

export const hasWallet = () => typeof window !== 'undefined' && !!window.ethereum;
export const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
export const toScaled = (q) => BigInt(Math.round(Number(q) * QTY_SCALE));
export const formatQty = (amount, unit) =>
  `${Number(amount || 0).toLocaleString('en-GB', { maximumFractionDigits: 3 })} ${unit || ''}`.trim();

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

/** Supply-chain contract connected to the MetaMask signer. */
export async function supplyChainWithSigner(contractAddress) {
  await ensureBaseSepolia();
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, SUPPLY_CHAIN_ABI, signer);
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
  const reason = err?.reason || err?.shortMessage || err?.info?.error?.message || err?.response?.data?.error || err?.message || '';
  if (/insufficient funds/i.test(reason)) return 'This wallet needs a little Base Sepolia ETH to pay for gas.';
  return reason.replace(/^execution reverted:\s*/i, '').replace(/^"|"$/g, '') || 'Something went wrong.';
}

/**
 * Send a contract call from MetaMask: dry run first (clear error messages),
 * then send, wait, and ask the backend to copy the result from the chain.
 */
export async function sendAndConfirm(contract, method, args, onStatus = () => {}) {
  await contract[method].staticCall(...args);
  onStatus('signing');
  const tx = await contract[method](...args);
  onStatus('mining');
  await tx.wait();
  onStatus('saving');
  try {
    await axios.post(`${API_BASE}/supply/confirm-tx`, { txHash: tx.hash });
  } catch (err) {
    console.error('confirm-tx:', err);   // it's on-chain either way
  }
  onStatus('done');
  return tx.hash;
}