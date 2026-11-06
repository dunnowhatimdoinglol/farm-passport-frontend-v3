// AppNav (v4.5) — the floating bar at the top of every page inside the app, in the home page's style.
// The same buttons as before (Home, Scan, Profile, Farmer Portal, Restaurant, Supply Chain, Leaderboard,
// Login / Logout), just laid out as one tidy bar. On a phone the buttons scroll sideways.
const ACCENT = '#2F6B3A';

function Leaf() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 21l7-7" />
    </svg>
  );
}

export default function AppNav({ current, user, restaurantName, onHome, onScan, onProfile, onGo, onLogout, onRestaurantLogout, onLogin }) {
  const pill = (active) => `shrink-0 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors ${
    active ? 'text-white shadow-sm' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`;
  const items = [
    ['badges', '👤 Profile', onProfile],
    ['farmer', '👨‍🌾 Farmer Portal', () => onGo('farmer')],
    ['restaurant', '🍽️ Restaurant', () => onGo('restaurant')],
    ['supply', '🚚 Supply Chain', () => onGo('supply')],
    ...(user ? [['leaderboard', '🏆 Leaderboard', () => onGo('leaderboard')]] : []),
  ];
  return (
    <>
    <div className="sticky top-3 z-40 max-w-5xl mx-auto">
      <nav aria-label="Main" className="bg-white/80 backdrop-blur-xl border border-black/5 rounded-2xl shadow-sm px-2 py-2">
        <div className="flex items-center gap-2">
          <button onClick={onHome} className="flex items-center gap-2 font-bold text-base pl-2 pr-1 shrink-0" title="Back to the home page">
            <Leaf /><span className="hidden lg:inline">Farm Passport</span>
          </button>
          <div className="flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex gap-1 w-max ml-auto">
              <button onClick={onHome} className={pill(false)}>🏠 Home</button>
              <button onClick={onScan} className={pill(current === 'scanner')} style={current === 'scanner' ? { background: ACCENT } : undefined}>📷 Scan</button>
              {items.map(([key, label, fn]) => (
                <button key={key} onClick={fn} className={pill(current === key)} style={current === key ? { background: ACCENT } : undefined}>{label}</button>
              ))}
              {user ? (
                <button onClick={onLogout} className={pill(false)}>Logout</button>
              ) : restaurantName ? (
                <button onClick={onRestaurantLogout} className={pill(false)}>Logout</button>
              ) : (
                <button onClick={onLogin} className="shrink-0 px-4 py-2 rounded-xl text-sm font-semibold text-white whitespace-nowrap" style={{ background: ACCENT }}>Login</button>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
    <div className="max-w-4xl mx-auto mb-6">
      {(user || restaurantName) && (
        <p className="text-xs text-gray-500 mt-2 px-2">
          {user ? <>Logged in as {user.email}</> : <>🍽️ Signed in as <strong>{restaurantName}</strong> (restaurant account)</>}
        </p>
      )}
    </div>
    </>
  );
}