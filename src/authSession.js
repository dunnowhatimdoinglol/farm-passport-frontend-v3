// authSession.js — keeps customer and restaurant logins mutually exclusive.
// Only one of them can be signed in at a time in this browser.

export const AUTH_EVENT = 'fp-auth-change';

const CUSTOMER_KEYS   = ['fp_auth', 'authToken', 'userEmail'];  // incl. older keys from Login/Register
const RESTAURANT_KEYS = ['fp_restaurant_auth'];

export function clearCustomerSession() {
  CUSTOMER_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
}

export function clearRestaurantSession() {
  RESTAURANT_KEYS.forEach(k => { try { localStorage.removeItem(k); } catch (_) {} });
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
// detail: { role: 'customer' | 'restaurant', action: 'login' | 'logout', name? }
export function announceAuth(detail) {
  window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
}