// Farm Passport v4.5b — light / dark mode (theme.jsx, in src/ next to App.jsx).
// 'auto' follows the phone or computer's own setting; 'light' and 'dark' are fixed.
// The choice is remembered on this device. Dark mode is only ever on screen: printing always uses light.
import { useEffect, useState } from 'react';

const KEY = 'fp_theme';
const MODES = ['auto', 'light', 'dark'];
const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function getThemeChoice() {
  try { const t = localStorage.getItem(KEY); return MODES.includes(t) ? t : 'auto'; } catch { return 'auto'; }
}

function apply(choice) {
  if (typeof document === 'undefined') return;
  const dark = choice === 'dark' || (choice === 'auto' && !!media?.matches);
  document.documentElement.classList.toggle('dark', dark);
  // so the browser's own bits (scrollbars, date pickers) match too
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0F1310' : '#F6F6F2');
}

const listeners = new Set();
export function setThemeChoice(choice) {
  try { localStorage.setItem(KEY, choice); } catch { /* private browsing: just this visit */ }
  apply(choice);
  listeners.forEach(fn => fn(choice));
}

// Run once as soon as the app loads, and follow the device if it switches (e.g. at sunset)
apply(getThemeChoice());
media?.addEventListener?.('change', () => { if (getThemeChoice() === 'auto') apply('auto'); });

export function useThemeChoice() {
  const [choice, setChoice] = useState(getThemeChoice);
  useEffect(() => { listeners.add(setChoice); return () => listeners.delete(setChoice); }, []);
  return choice;
}

const LABEL = { auto: 'Auto (follows your device)', light: 'Light', dark: 'Dark' };
const ICON = { auto: '🌗', light: '☀️', dark: '🌙' };

// A small button that cycles Auto → Light → Dark.
// variant 'pill' for the top bars, 'side' for the dark dashboard sidebar, 'row' for the phone "More" menu.
export function ThemeToggle({ variant = 'pill' }) {
  const choice = useThemeChoice();
  const next = MODES[(MODES.indexOf(choice) + 1) % MODES.length];
  const title = `Theme: ${LABEL[choice]}. Tap for ${LABEL[next].split(' (')[0]}.`;
  const go = () => setThemeChoice(next);
  if (variant === 'side') {
    return (
      <button onClick={go} title={title} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-left text-white/75 hover:text-white hover:bg-white/10">
        <span className="w-6 text-center">{ICON[choice]}</span>Theme: {choice === 'auto' ? 'Auto' : LABEL[choice]}
      </button>
    );
  }
  if (variant === 'row') {
    return (
      <button onClick={go} title={title} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-left font-semibold text-gray-800 hover:bg-gray-50">
        <span className="text-xl w-7 text-center">{ICON[choice]}</span>Theme: {choice === 'auto' ? 'Auto' : LABEL[choice]}
      </button>
    );
  }
  return (
    <button onClick={go} title={title} aria-label={title}
      className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center text-base text-gray-600 hover:bg-gray-100">
      {ICON[choice]}
    </button>
  );
}