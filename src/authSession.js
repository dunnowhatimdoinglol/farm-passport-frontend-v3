// authSession.js — keeps DINER logins separate from BUSINESS logins (café / restaurant, farm).
// A farm and a café can be signed in at the same time (e.g. a farm with its own café),
// but signing in as a diner signs the businesses out, and the other way round.

export const AUTH_EVENT = 'fp-auth-change';

const CUSTOMER_KEYS   = ['fp_auth', 'authToken', 'userEmail'];  // incl. older keys from Login/Register
const RESTAURANT_KEYS = ['fp_restaurant_auth'];

export function clearCustomerSession() {
  CUSTOMER_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}

export function clearRestaurantSession() {
  RESTAURANT_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}

// Farm sign-ins are kept by the Farmer Portal; any saved key with "farmer" in its name belongs to it
const isFarmerKey = (k) => /farmer/i.test(k || '');
function farmerKeys(store) {
  const keys = [];
  try { for (let i = 0; i < store.length; i++) { const k = store.key(i); if (isFarmerKey(k)) keys.push(k); } } catch (_) {}
  return keys;
}

export function clearFarmerSession() {
  for (const store of [localStorage, sessionStorage]) {
    farmerKeys(store).forEach(k => { try { store.removeItem(k); } catch (_) {} });
  }
}

export function hasFarmerSession() {
  return [localStorage, sessionStorage].some(store => farmerKeys(store).some(k => { try { return !!store.getItem(k); } catch (_) { return false; } }));
}

export function readRestaurantSession() {
  try {
    const saved = localStorage.getItem('fp_restaurant_auth');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    return parsed?.user && parsed?.token ? parsed : null;
  } catch (_) {
    return null;
  }
}

// Tell the rest of the app that someone logged in or out.
// detail: { role: 'customer' | 'restaurant' | 'farmer', action: 'login' | 'logout', name? }
export function announceAuth(detail) {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
}