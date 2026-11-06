// DashShell (v4.5) — the frame every dashboard sits in (café, farm, abattoir, admin).
//   Computer: a dark green sidebar on the left — logo, who you are, the pages, Maru, Home / Log out.
//   Phone:    a slim top bar, and a bottom bar with the main pages and one big button in the middle.
//             "More" opens a sheet with the rest.
// It only lays things out: each dashboard keeps its own pages, buttons and logic.
import { useState, useEffect } from 'react';
import Maru from './Maru';
import { ThemeToggle } from '../theme';

// v4.5b: ink, mint and paper follow light / dark mode (see index.css)
export const FP = { ink: 'var(--fp-ink)', forest: '#13261A', green: '#2F6B3A', mint: 'var(--fp-tint-mint)', paper: 'var(--fp-tint-paper)', honey: '#E2B04A', coral: '#E0644B' };

function Leaf({ color = '#9BD3A3', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 21c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 21l7-7" />
    </svg>
  );
}

const initialsOf = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'FP';

/**
 * who:     { name, sub, status: 'ok' | 'wait' | 'stop' }
 * nav:     [{ key, icon, label, badge? }]  — the pages, in order
 * phone:   [key, key, CENTRE, key]         — four phone tabs; the third is the big middle button. "More" is added.
 * active, onNav(key)
 * extras:  [{ key, icon, label, onClick }] — e.g. Alerts (shown under the pages, and in "More")
 * onHome, onLogout, tips: ['…'] (Maru's tips, one per tap)
 */
export default function DashShell({ who, nav, phone = [], active, onNav, extras = [], onHome, onLogout, tips = [], children }) {
  const [more, setMore] = useState(false);
  const [tip, setTip] = useState(-1);
  useEffect(() => { setMore(false); }, [active]);
  const byKey = Object.fromEntries(nav.map(n => [n.key, n]));
  const phoneTabs = phone.map(k => byKey[k]).filter(Boolean);
  const inMore = nav.filter(n => !phone.includes(n.key));
  const centre = phoneTabs.length >= 4 ? phoneTabs[2] : null;
  const nextTip = () => setTip(t => (tips.length ? (t + 1) % tips.length : -1));
  const dot = who.status === 'ok' ? 'bg-green-400' : who.status === 'stop' ? 'bg-red-400' : 'bg-amber-400';

  const NavItem = ({ n }) => (
    <button onClick={() => onNav(n.key)} aria-current={active === n.key ? 'page' : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${active === n.key ? 'fp-light bg-white text-[#13261A] shadow-sm' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}>
      <span className="text-base w-5 text-center">{n.icon}</span><span className="flex-1">{n.label}</span>
      {n.badge ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: FP.honey, color: FP.forest }}>{n.badge}</span> : null}
    </button>
  );

  return (
    <div className="fp-app min-h-screen flex bg-gray-50">
      {/* ── Sidebar (computer) ── */}
      <div className="hidden lg:block w-64 shrink-0" style={{ background: FP.forest }}>
      <aside className="flex flex-col w-64 h-screen sticky top-0 p-5 text-white overflow-y-auto">
        <button onClick={onHome} className="flex items-center gap-2 font-bold text-lg mb-7 text-left" title="Farm Passport home"><Leaf />Farm Passport</button>
        <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-3 mb-6">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0" style={{ background: FP.honey, color: FP.forest }}>{initialsOf(who.name)}</div>
          <div className="min-w-0"><p className="font-bold leading-tight truncate">{who.name}</p>
            <p className="text-xs text-white/60 flex items-center gap-1.5 truncate"><span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />{who.sub}</p></div>
        </div>
        <nav className="space-y-1">{nav.map(n => <NavItem key={n.key} n={n} />)}</nav>
        {extras.length > 0 && <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
          {extras.map(x => (
            <button key={x.key} onClick={x.onClick} className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-left ${x.active ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
              <span className="w-5 text-center">{x.icon}</span>{x.label}</button>
          ))}
        </div>}
        <div className="mt-auto pt-6 space-y-3">
          {tips.length > 0 && (
            <button onClick={nextTip} className="w-full bg-white/5 hover:bg-white/10 rounded-2xl p-3 flex items-center gap-3 text-left">
              <span className="shrink-0 pointer-events-none"><Maru mode="sit" size={52} /></span>
              <span className="min-w-0"><span className="block text-sm font-bold">{tip < 0 ? 'Need a hand?' : 'Maru says'}</span>
                <span className="block text-xs text-white/70">{tip < 0 ? 'Tap me for a tip' : tips[tip]}</span></span>
            </button>
          )}
          <ThemeToggle variant="side" />
          <div className="flex gap-2 text-xs text-white/60">
            <button onClick={onHome} className="hover:text-white">🏠 Home</button><span>·</span>
            <button onClick={onLogout} className="hover:text-white">Log out</button>
          </div>
        </div>
      </aside>
      </div>

      {/* ── Page ── */}
      <div className="flex-1 min-w-0">
        {/* top bar (phone) */}
        <div className="lg:hidden sticky top-0 z-30 bg-gray-50/90 backdrop-blur border-b border-black/5 px-4 py-3 flex items-center justify-between gap-3">
          <button onClick={onHome} className="flex items-center gap-2 min-w-0 text-left">
            <span className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0" style={{ background: FP.honey, color: FP.forest }}>{initialsOf(who.name)}</span>
            <span className="min-w-0"><span className="block font-bold leading-tight truncate">{who.name}</span><span className="block text-[11px] text-gray-500 truncate">{who.sub}</span></span>
          </button>
          <div className="flex gap-2 shrink-0 items-center">
            <ThemeToggle />
            {extras.slice(0, 1).map(x => (
              <button key={x.key} onClick={x.onClick} aria-label={x.label} className={`w-10 h-10 rounded-xl border flex items-center justify-center ${x.active ? 'bg-gray-800 border-gray-800 text-white' : 'bg-white border-black/5'}`}>{x.icon}</button>
            ))}
          </div>
        </div>
        <main className="px-4 sm:px-6 lg:px-8 pt-5 lg:pt-8 pb-32 lg:pb-12">
          <div className="max-w-6xl mx-auto">{children}</div>
        </main>
      </div>

      {/* ── Bottom bar (phone) ── */}
      {phoneTabs.length > 0 && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-black/5 px-2 pt-1.5" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="grid items-end" style={{ gridTemplateColumns: `repeat(${phoneTabs.length + 1}, minmax(0, 1fr))` }}>
            {[...phoneTabs, { key: '__more', icon: '☰', label: 'More' }].map(n => n === centre ? (
              <div key={n.key} className="flex justify-center">
                <button onClick={() => onNav(n.key)} className="-mt-7 w-16 h-16 rounded-2xl flex flex-col items-center justify-center text-white shadow-lg" style={{ background: FP.green }}>
                  <span className="text-xl leading-none">{n.icon}</span><span className="text-[10px] font-bold mt-0.5 leading-none">{n.label}</span>
                </button>
              </div>
            ) : (
              <button key={n.key} onClick={() => (n.key === '__more' ? setMore(!more) : onNav(n.key))}
                className={`flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold ${(n.key === '__more' ? more || inMore.some(m => m.key === active) : active === n.key) ? 'text-green-700' : 'text-gray-500'}`}>
                <span className="text-lg relative leading-none">{n.icon}
                  {n.badge ? <span className="absolute -top-1.5 -right-2.5 text-[9px] font-bold px-1 min-w-[16px] rounded-full text-white" style={{ background: FP.coral }}>{n.badge}</span> : null}</span>
                <span className="truncate max-w-full">{n.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* "More" sheet (phone) */}
      {more && (
        <div className="lg:hidden fixed inset-0 z-30 bg-black/30" onClick={() => setMore(false)}>
          <div className="absolute bottom-20 inset-x-3 bg-white rounded-3xl shadow-2xl p-3 space-y-1" onClick={(e) => e.stopPropagation()}>
            {inMore.map(n => (
              <button key={n.key} onClick={() => onNav(n.key)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left font-semibold ${active === n.key ? 'bg-green-50 text-green-800' : 'hover:bg-gray-100'}`}>
                <span className="w-6 text-center text-lg">{n.icon}</span><span className="flex-1">{n.label}</span>
                {n.badge ? <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: FP.honey, color: FP.forest }}>{n.badge}</span> : null}
              </button>
            ))}
            {extras.map(x => (
              <button key={x.key} onClick={() => { setMore(false); x.onClick(); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left font-semibold hover:bg-gray-100">
                <span className="w-6 text-center text-lg">{x.icon}</span>{x.label}</button>
            ))}
            <ThemeToggle variant="row" />
            <div className="flex gap-2 pt-2 border-t border-black/5">
              <button onClick={onHome} className="flex-1 py-3 rounded-2xl font-semibold text-gray-700 hover:bg-gray-100">🏠 Home</button>
              <button onClick={onLogout} className="flex-1 py-3 rounded-2xl font-semibold text-gray-700 hover:bg-gray-100">Log out</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Small shared pieces for dashboard pages ──
export function PageTitle({ kicker, title, actions }) {
  return (
    <div className="flex items-end justify-between gap-4 flex-wrap mb-6">
      <div className="min-w-0">
        {kicker && <p className="text-sm font-semibold text-gray-500">{kicker}</p>}
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight">{title}</h1>
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

export function StatTile({ icon, value, label, sub, tone = 'mint', onClick }) {
  const bg = { mint: 'var(--fp-tint-mint)', honey: 'var(--fp-tint-honey)', coral: 'var(--fp-tint-coral)', white: 'var(--fp-tint-paper)' }[tone];  // v4.5b: these follow light / dark mode
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`bg-white rounded-3xl border border-black/5 p-4 sm:p-5 text-left ${onClick ? 'hover:shadow-md transition-shadow' : ''}`}>
      <span className="w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-3" style={{ background: bg }}>{icon}</span>
      <p className="text-2xl sm:text-3xl font-extrabold tracking-tight tabular-nums leading-tight">{value}</p>
      <p className="text-sm text-gray-700 font-semibold">{label}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Tag>
  );
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`bg-white rounded-3xl border border-black/5 p-5 sm:p-6 ${className}`}>
      {(title || action) && <div className="flex justify-between items-center gap-3 mb-4">{title && <h2 className="text-lg font-bold">{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}

// A use-by bar: fuller and warmer the closer the date is (a week or more away = nearly empty, green)
export function UseByBar({ useBy }) {
  if (!useBy) return <div className="h-2 rounded-full bg-gray-100" />;
  const days = Math.ceil((new Date(useBy) - new Date(new Date().toDateString())) / 864e5);
  const pct = Math.max(6, Math.min(100, 100 - (days / 7) * 100));
  const color = days <= 1 ? FP.coral : days <= 3 ? FP.honey : FP.green;
  return <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} /></div>;
}

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
export const todayLabel = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });