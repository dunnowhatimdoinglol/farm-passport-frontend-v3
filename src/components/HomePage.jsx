// HomePage — the front door of Farm Passport.
// Self-contained: its own nav, sections, animations and styles (no extra packages).
// Animations use IntersectionObserver (works in every browser) and respect "reduce motion".
import { useState, useEffect, useRef } from 'react';

const CONTACT_EMAIL = 'farmpassport.hello@gmail.com';
const ACCENT = '#2F6B3A';

// ─────────────────────────────────────────────
// Content
// ─────────────────────────────────────────────
const JOURNEY = [
  { icon: '🌱', title: 'Harvested at Hollow Lane Farm', detail: '50 kg registered · Somerset' },
  { icon: '🚚', title: 'Arrived at Avonside Depot', detail: 'Stored chilled · logged by the depot' },
  { icon: '📦', title: 'Out for delivery', detail: 'Van left at 06:40' },
  { icon: '🍽️', title: 'Arrived at Quay Street Kitchen', detail: 'Received 15 kg of 15 kg · 📷 photo on record' },
];

const FLOW = [
  { icon: '🌾', label: 'Farm', text: 'Registers the harvest' },
  { icon: '🏭', label: 'Depot', text: 'Logs every handover' },
  { icon: '🍽️', label: 'Café', text: 'Confirms what arrived' },
  { icon: '😋', label: 'You', text: 'Scan the bill, see it all' },
];

const AUDIENCES = {
  farms: {
    tab: '🌾 Farms',
    title: 'Your name stays on your produce',
    text: 'Register a harvest in a minute, take orders from local cafés and dispatch them direct or through your depot. Every handover is recorded, so your farm gets the credit on every plate.',
    points: [
      'Set your own prices, adjust them per order and add a delivery charge',
      'Shortfalls are visible to both sides — no more arguing over delivery notes',
      'Free during the pilot, and we pay every network fee',
    ],
    cta: 'Join as a farm',
    action: 'farm',
  },
  cafes: {
    tab: '🍽️ Cafés',
    title: 'Prove you buy local, plate by plate',
    text: 'Order straight from farms near you, confirm deliveries with a photo, and print a QR code on every bill. Diners see the journey their food took to your door.',
    points: [
      'Save your dishes once — each receipt takes the right amount off your stock',
      'Delivery photos are fingerprinted, so nobody can swap them later',
      'Customers come back to collect badges for the farms you support',
    ],
    cta: 'Join as a café',
    action: 'cafe',
  },
  diners: {
    tab: '😋 Diners',
    title: 'Know exactly where your food came from',
    text: 'Scan the QR code on your bill with your phone camera. You’ll see the farm, the journey and every stop along the way — and collect a badge for the farm you just supported.',
    points: [
      'No app to download — your phone camera is all you need',
      'Collect badges and stamps for every farm you support',
      'Climb the leaderboard of the South West’s most local eaters',
    ],
    cta: 'Create a free account',
    action: 'diner',
  },
};

const FEATURES = [
  { icon: '🔗', title: 'A journey nobody can rewrite', text: 'Every harvest, delivery and sale is recorded on a public blockchain. Mistakes are corrected with a new, visible entry — never edited away.' },
  { icon: '⚖️', title: 'Quantities that add up', text: 'Nobody can send, receive or sell more than exists at each step. A café can’t claim more “local” than it actually bought.' },
  { icon: '📷', title: 'Proof of delivery', text: 'Cafés snap a photo when goods arrive. Its fingerprint goes on the blockchain, so a swapped photo is spotted instantly.' },
  { icon: '💷', title: 'Fair, private pricing', text: 'Farms set prices and delivery charges. Only the farm and café see the money — customers just see the story.' },
  { icon: '🏅', title: 'Badges worth collecting', text: 'Diners earn a badge for each farm they support and a stamp every time they come back.' },
  { icon: '📱', title: 'Scan or tap', text: 'Every receipt and batch has a QR code any phone camera can open. NFC tags work too, for those who want them.' },
];

const STEPS = [
  { n: '1', title: 'The farm registers a harvest', text: 'What it is, how much, and the price. It goes on the blockchain under the farm’s verified name.' },
  { n: '2', title: 'It travels, and every handover is logged', text: 'Dispatched to a café, direct or via a depot. Each stop records what it handled — and the café confirms what arrived.' },
  { n: '3', title: 'You scan your bill', text: 'The café prints a QR code on your receipt. Scan it to see the whole journey and collect your badge.' },
];

const FAQS = [
  { q: 'Do I need to understand crypto or blockchain?', a: 'No. Farms and cafés sign in and press buttons like any other app. We pay all the network fees and handle the technical side. Diners just scan a QR code.' },
  { q: 'What does it cost?', a: 'Nothing during the pilot, for farms or cafés. Any future pricing will be agreed with pilot farms first.' },
  { q: 'Who can see what?', a: 'The journey of a batch is public so diners can check it. Prices, orders, emails and delivery photos stay private between the farm and the café.' },
  { q: 'How do you know a farm is real?', a: 'Every farm is reviewed before it goes live, including its CPH number, and every café is checked before it can order or print receipts.' },
  { q: 'What if a delivery arrives short or damaged?', a: 'The café records what actually arrived, with a note and a photo. The difference shows up for both sides, so it can be sorted out fairly.' },
  { q: 'Can a record be changed later?', a: 'No. Once a step is recorded it can’t be edited or deleted — that’s what makes it trustworthy. Corrections are added as new, visible entries.' },
];

const TAGLINE = 'Every crate keeps its name. Every plate can prove where it came from.';

// ─────────────────────────────────────────────
// Small animation helpers
// ─────────────────────────────────────────────
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Adds "is-in" once the element scrolls into view
function useInView(threshold = 0.2) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function Reveal({ children, delay = 0, className = '', as: Tag = 'div', ...rest }) {
  const [ref, inView] = useInView(0.15);
  return (
    <Tag ref={ref} className={`fp-reveal ${inView ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...rest}>
      {children}
    </Tag>
  );
}

// ─────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────

// The hero card: a receipt journey that plays itself, step by step, on a loop
function JourneyCard() {
  const [shown, setShown] = useState(prefersReducedMotion() ? JOURNEY.length + 1 : 0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const total = JOURNEY.length + 1;            // + the badge
    const t = setTimeout(() => setShown(s => (s >= total ? 0 : s + 1)), shown === 0 ? 600 : shown >= total ? 4200 : 1100);
    return () => clearTimeout(t);
  }, [shown]);

  return (
    <div className="fp-card fp-float relative bg-white border border-black/5 rounded-3xl p-6 shadow-[0_24px_48px_rgba(20,20,20,0.10)] w-full max-w-md"
      role="img" aria-label="Example of what a diner sees after scanning their receipt: the farm, the depot, delivery, the café, then a badge">
      <div className="flex justify-between items-center gap-3 mb-5">
        <div>
          <p className="text-xs font-semibold tracking-wider uppercase text-[#6A6A63]">Your receipt</p>
          <p className="text-lg font-bold">Heritage tomatoes</p>
        </div>
        <span className="text-xs font-semibold text-[#1F5A2E] bg-[#E3EDE3] px-2.5 py-1 rounded-full flex items-center gap-1.5">
          <span className="fp-pulse w-2 h-2 rounded-full" style={{ background: ACCENT }} /> Verified
        </span>
      </div>
      <ol className="space-y-0">
        {JOURNEY.map((s, i) => {
          const on = shown > i;
          return (
            <li key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all duration-500 ${on ? 'bg-[#E3EDE3] scale-100' : 'bg-gray-100 scale-90 grayscale opacity-50'}`}>
                  {s.icon}
                </span>
                {i < JOURNEY.length - 1 && (
                  <span className="w-0.5 flex-1 min-h-[18px] bg-gray-200 relative overflow-hidden">
                    <span className="absolute inset-x-0 top-0 bg-[#2F6B3A] transition-all duration-700 ease-out" style={{ height: shown > i + 1 ? '100%' : '0%' }} />
                  </span>
                )}
              </div>
              <div className={`pb-4 min-w-0 transition-all duration-500 ${on ? 'opacity-100 translate-x-0' : 'opacity-30 translate-x-1'}`}>
                <p className="text-sm font-semibold">{s.title}</p>
                <p className="text-xs text-[#6A6A63]">{s.detail}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <div className={`flex items-center gap-3 bg-[#FBF4E6] rounded-xl p-3 transition-all duration-500 ${shown > JOURNEY.length ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        <span className={`text-2xl ${shown > JOURNEY.length ? 'fp-pop' : ''}`}>🏅</span>
        <p className="text-sm text-[#6B4A10]"><strong>Badge unlocked.</strong> You’ve supported Hollow Lane Farm 2 times.</p>
      </div>
    </div>
  );
}

// Farm → Depot → Café → You, with a parcel travelling along the line
function FlowLine() {
  const [ref, inView] = useInView(0.3);
  return (
    <div ref={ref} className={`fp-flow ${inView ? 'is-in' : ''} relative`}>
      {/* the track */}
      <div className="hidden md:block absolute left-[12.5%] right-[12.5%] top-10 h-1 rounded-full bg-[#DCE6DC] overflow-hidden" aria-hidden="true">
        <div className="fp-flow-fill h-full rounded-full" style={{ background: ACCENT }} />
      </div>
      <div className="hidden md:block absolute left-[12.5%] right-[12.5%] top-10" aria-hidden="true">
        <span className="fp-parcel absolute -top-3.5 text-2xl">📦</span>
      </div>
      <ol className="grid grid-cols-1 md:grid-cols-4 gap-6 md:gap-4 relative">
        {FLOW.map((f, i) => (
          <li key={f.label} className="fp-stop flex md:flex-col items-center md:text-center gap-4 md:gap-3" style={{ '--d': `${i * 0.9}s` }}>
            <span className="fp-stop-icon w-20 h-20 shrink-0 rounded-2xl bg-white border border-black/5 shadow-sm flex items-center justify-center text-4xl relative z-10">
              {f.icon}
            </span>
            <div>
              <p className="font-bold text-lg">{f.label}</p>
              <p className="text-[#4A4A45]">{f.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Tagline that lights up word by word
function Tagline() {
  const [ref, inView] = useInView(0.5);
  const words = TAGLINE.split(' ');
  return (
    <p ref={ref} className="text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.05] tracking-tight max-w-4xl">
      {words.map((w, i) => (
        <span key={i} className="fp-word" style={{ color: inView ? '#141414' : 'rgba(20,20,20,0.18)', transitionDelay: `${i * 90}ms` }}>
          {w}{' '}
        </span>
      ))}
    </p>
  );
}

function Audience({ onAction }) {
  const keys = Object.keys(AUDIENCES);
  const [active, setActive] = useState('farms');
  const a = AUDIENCES[active];
  const idx = keys.indexOf(active);
  return (
    <div>
      <div className="relative inline-grid grid-cols-3 bg-white border border-black/5 rounded-2xl p-1 mb-8 w-full max-w-md" role="tablist" aria-label="Who it's for">
        <span className="absolute top-1 bottom-1 rounded-xl transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: `calc(${idx} * (100% - 8px) / 3 + 4px)`, width: 'calc((100% - 8px) / 3)', background: ACCENT }} aria-hidden="true" />
        {keys.map(k => (
          <button key={k} role="tab" aria-selected={active === k} onClick={() => setActive(k)}
            className={`relative z-10 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-300 ${active === k ? 'text-white' : 'text-[#55554F] hover:text-[#141414]'}`}>
            {AUDIENCES[k].tab}
          </button>
        ))}
      </div>
      <div key={active} className="fp-swap grid md:grid-cols-2 gap-8 items-start">
        <div>
          <h3 className="text-3xl font-bold tracking-tight mb-3">{a.title}</h3>
          <p className="text-lg text-[#4A4A45] mb-6">{a.text}</p>
          <button onClick={() => onAction(a.action)}
            className="fp-btn text-white font-semibold px-6 py-3 rounded-xl" style={{ background: ACCENT }}>
            {a.cta} →
          </button>
        </div>
        <ul className="space-y-3">
          {a.points.map((p, i) => (
            <li key={p} className="fp-swap-item flex gap-3 items-start bg-white border border-black/5 rounded-2xl p-4" style={{ animationDelay: `${i * 80}ms` }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-2">
      {FAQS.map((f, i) => (
        <div key={i} className="bg-white border border-black/5 rounded-2xl">
          <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}
            className="w-full flex justify-between items-center gap-4 px-6 py-4 text-left font-semibold">
            {f.q}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#55554F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              className={`shrink-0 transition-transform duration-500 ${open === i ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <div className={`fp-collapse ${open === i ? 'is-open' : ''}`}>
            <div className="overflow-hidden">
              <p className="px-6 pb-5 text-[#4A4A45]">{f.a}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
function HomePage({ onNavigate, onLogin, onRegister, signedInAs }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

 
  // Close the sign-in menu when clicking elsewhere
  useEffect(() => {
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const go = (action) => {
    setMenuOpen(false);
    if (action === 'farm')        onNavigate('farmer', 'register');
    else if (action === 'cafe')   onNavigate('restaurant', 'register');
    else if (action === 'diner')  onRegister();
    else if (action === 'farm-login')  onNavigate('farmer');
    else if (action === 'cafe-login')  onNavigate('restaurant');
    else if (action === 'depot')       onNavigate('supply');
    else if (action === 'diner-login') onLogin();
    else if (action === 'leaderboard') onNavigate('leaderboard');
  };

  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  const copyEmail = async () => {
    try { await navigator.clipboard.writeText(CONTACT_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  };

  return (
    <div className="fp-home min-h-screen text-[#141414] overflow-x-hidden">
      <style>{CSS}</style>

      {/* ── Floating nav ── */}
      <div className="sticky top-3 z-40 flex justify-center px-4">
        <nav aria-label="Main" className="w-full max-w-5xl flex items-center justify-between gap-4 pl-4 pr-2 py-2 bg-white/75 backdrop-blur-xl border border-black/5 rounded-2xl shadow-sm">
          <a href="#top" onClick={scrollTo('top')} className="flex items-center gap-2 font-bold text-base shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 21c0-8 5-13 14-14-1 9-6 14-14 14z" /><path d="M5 21l7-7" /></svg>
            Farm Passport
          </a>
          <div className="hidden md:flex gap-6 text-sm font-medium text-[#55554F]">
            <a href="#how" onClick={scrollTo('how')} className="hover:text-[#141414] transition-colors">How it works</a>
            <a href="#who" onClick={scrollTo('who')} className="hover:text-[#141414] transition-colors">Who it’s for</a>
            <a href="#features" onClick={scrollTo('features')} className="hover:text-[#141414] transition-colors">Features</a>
            <a href="#faq" onClick={scrollTo('faq')} className="hover:text-[#141414] transition-colors">FAQ</a>
          </div>
          <div className="relative shrink-0" ref={menuRef}>
            {signedInAs ? (
              <button onClick={() => onNavigate(signedInAs.view)} className="fp-btn text-white text-sm font-semibold px-4 py-2 rounded-xl" style={{ background: ACCENT }}>
                {signedInAs.label} →
              </button>
            ) : (
              <>
                <button onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }} aria-expanded={menuOpen}
                  className="fp-btn text-white text-sm font-semibold px-4 py-2 rounded-xl flex items-center gap-1.5" style={{ background: ACCENT }}>
                  Sign in
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform duration-300 ${menuOpen ? 'rotate-180' : ''}`} aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <div className={`absolute right-0 mt-2 w-56 bg-white border border-black/5 rounded-2xl shadow-xl p-1.5 origin-top-right transition-all duration-200 ${menuOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
                  {[
                    ['diner-login', '😋', 'Diner', 'Badges & profile'],
                    ['farm-login', '🌾', 'Farm', 'Batches & orders'],
                    ['cafe-login', '🍽️', 'Café / restaurant', 'Stock & receipts'],
                    ['depot', '🏭', 'Depot / courier', 'Supply chain'],
                  ].map(([a, icon, label, sub]) => (
                    <button key={a} onClick={() => go(a)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#F1F4EF] text-left transition-colors">
                      <span className="text-xl">{icon}</span>
                      <span><span className="block text-sm font-semibold">{label}</span><span className="block text-xs text-[#6A6A63]">{sub}</span></span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </nav>
      </div>

      <main>
        {/* ── Hero ── */}
        <section id="top" className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-16 md:pt-24 pb-20 flex flex-wrap gap-12 md:gap-16 items-center">
          <div className="fp-blob" aria-hidden="true" />
          <div className="flex-1 basis-[440px] min-w-0 flex flex-col gap-6 relative">
            <p className="fp-in self-start inline-flex items-center gap-2 text-sm font-semibold text-[#1F5A2E] bg-[#E3EDE3] px-3 py-1 rounded-full" style={{ animationDelay: '0ms' }}>
              <span className="fp-pulse w-2 h-2 rounded-full" style={{ background: ACCENT }} />
              Now welcoming pilot farms in the South West
            </p>
            <h1 className="fp-in fp-gradient text-[2.6rem] leading-[1.02] sm:text-6xl font-extrabold tracking-tight" style={{ animationDelay: '120ms' }}>
              Every plate has a story. Now you can prove it.
            </h1>
            <p className="fp-in text-lg sm:text-xl text-[#4A4A45] max-w-xl" style={{ animationDelay: '240ms' }}>
              Farm Passport follows local food from the field to your table. Every harvest, delivery and sale is recorded on a public blockchain — so farms get the credit, cafés prove they buy local, and diners see exactly where their food came from.
            </p>
            <div className="fp-in flex flex-wrap gap-3" style={{ animationDelay: '360ms' }}>
              <button onClick={() => go('farm')} className="fp-btn text-white font-semibold px-6 py-3 rounded-xl" style={{ background: ACCENT }}>Join as a farm</button>
              <button onClick={() => go('cafe')} className="fp-btn fp-ghost font-semibold px-6 py-3 rounded-xl bg-white border border-black/10">Join as a café</button>
            </div>
            <p className="fp-in text-sm text-[#5B5B55]" style={{ animationDelay: '480ms' }}>Free during the pilot · No crypto knowledge needed · We cover every network fee</p>
          </div>
          <div className="fp-in flex-1 basis-[340px] min-w-0 flex justify-center relative" style={{ animationDelay: '300ms' }}>
            <JourneyCard />
          </div>
        </section>

        {/* ── Problem → solution ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-2 gap-10 md:gap-16">
          <Reveal>
            <p className="text-sm font-semibold text-[#8A3B2A] mb-3">The problem</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Food loses its name the moment it leaves the farm</h2>
            <p className="text-lg text-[#4A4A45]">A crate goes on a van, through a depot and into a kitchen. By the time it reaches a plate, nobody can say whose field it came from — and the farm that grew it gets none of the credit.</p>
          </Reveal>
          <Reveal delay={150}>
            <p className="text-sm font-semibold text-[#1F5A2E] mb-3">With Farm Passport</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Every handover is recorded, so the story survives the journey</h2>
            <p className="text-lg text-[#4A4A45]">The farm records what it sent, the depot logs what it handled, and the café confirms what arrived. Each step is public and can never be edited afterwards.</p>
          </Reveal>
        </section>

        {/* ── Flow ── */}
        <section id="how" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-24">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">From field to fork, in plain sight</h2>
            <p className="text-lg text-[#4A4A45] mb-12 max-w-2xl">One record follows your food the whole way. Nobody has to trust anybody’s word — it’s all there to check.</p>
          </Reveal>
          <FlowLine />
          <ol className="grid md:grid-cols-3 gap-4 mt-16">
            {STEPS.map((s, i) => (
              <Reveal as="li" key={s.n} delay={i * 120} className="fp-card bg-white border border-black/5 rounded-2xl p-6">
                <span className="text-sm font-bold" style={{ color: ACCENT }}>Step {s.n}</span>
                <h3 className="text-xl font-bold mt-2 mb-2">{s.title}</h3>
                <p className="text-[#4A4A45]">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ── Tagline ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-20 md:py-28">
          <Tagline />
        </section>

        {/* ── Who it's for ── */}
        <section id="who" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-24">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8">Built for everyone around the table</h2>
            <Audience onAction={go} />
          </Reveal>
        </section>

        {/* ── Features ── */}
        <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 scroll-mt-24">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Trust, built in</h2>
            <p className="text-lg text-[#4A4A45] mb-10 max-w-2xl">The checks happen automatically, every time — so “local” actually means local.</p>
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {FEATURES.map((f, i) => (
              <Reveal as="article" key={f.title} delay={(i % 3) * 110} className="fp-card group bg-white border border-black/5 rounded-2xl p-6">
                <span className="w-12 h-12 rounded-xl bg-[#E3EDE3] flex items-center justify-center text-2xl mb-4 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">{f.icon}</span>
                <h3 className="text-lg font-bold mb-2">{f.title}</h3>
                <p className="text-[#4A4A45]">{f.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── Dark band: diners ── */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
          <Reveal className="fp-band relative overflow-hidden rounded-3xl p-8 sm:p-12 text-[#F6F6F2] flex flex-wrap gap-8 items-center justify-between">
            <div className="flex-1 basis-[380px] min-w-0 relative">
              <h2 className="text-3xl font-bold mb-3">Eating out this week?</h2>
              <p className="text-lg text-[#C9D3C9]">Look for the QR code on your bill. Scan it with your phone camera to meet the farm behind your meal — and start your badge collection.</p>
            </div>
            <div className="flex flex-wrap gap-3 relative">
              <button onClick={() => go('diner')} className="fp-btn bg-[#F6F6F2] text-[#1C2A1F] font-semibold px-6 py-3 rounded-xl">Create a free account</button>
              <button onClick={() => go('leaderboard')} className="fp-btn border border-white/25 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/10">🏆 Leaderboard</button>
            </div>
          </Reveal>
        </section>

        {/* ── FAQ ── */}
        <section id="faq" className="max-w-3xl mx-auto px-4 sm:px-6 py-16 scroll-mt-24">
          <Reveal>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-8">Questions people ask</h2>
            <Faq />
          </Reveal>
        </section>

        {/* ── Final CTA + contact ── */}
        <section id="join" className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-20">
          <Reveal className="bg-white border border-black/5 rounded-3xl px-6 py-14 sm:p-16 flex flex-col items-center text-center gap-6">
            <span className="text-5xl fp-float" aria-hidden="true">🌾</span>
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight max-w-2xl leading-[1.05]">Give your harvest a passport</h2>
            <p className="text-lg text-[#4A4A45] max-w-xl">Join the pilot and we’ll help you set up, register your first batch with you, and introduce you to cafés nearby.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => go('farm')} className="fp-btn text-white font-semibold px-6 py-3 rounded-xl" style={{ background: ACCENT }}>Join as a farm</button>
              <button onClick={() => go('cafe')} className="fp-btn fp-ghost font-semibold px-6 py-3 rounded-xl bg-white border border-black/10">Join as a café</button>
            </div>
            <div className="pt-4 text-sm text-[#5B5B55]">
              Questions first? Email us at{' '}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Farm%20Passport%20enquiry`} className="font-semibold underline underline-offset-4" style={{ color: '#1F5A2E' }}>{CONTACT_EMAIL}</a>
              <button onClick={copyEmail} className="ml-2 text-xs px-2 py-1 rounded-lg bg-[#F1F4EF] hover:bg-[#E3EDE3] transition-colors">{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-12 border-t border-[#E2E2DB] flex flex-wrap gap-4 justify-between text-sm text-[#5B5B55]">
        <p>© {new Date().getFullYear()} Farm Passport · Built in the South West</p>
        <div className="flex flex-wrap gap-6">
          <button onClick={() => go('leaderboard')} className="hover:text-[#141414]">Leaderboard</button>
          <button onClick={() => onNavigate('scanner')} className="hover:text-[#141414]">Scan a code</button>
          <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#141414]">{CONTACT_EMAIL}</a>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────
// Styles (scoped with .fp-home / fp- prefixes)
// ─────────────────────────────────────────────
const CSS = `
.fp-home{font-family:Manrope,system-ui,-apple-system,sans-serif;background:#F6F6F2}
.fp-home h1,.fp-home h2,.fp-home h3{text-wrap:balance}
.fp-home p,.fp-home li{text-wrap:pretty}
.fp-home button:focus-visible,.fp-home a:focus-visible{outline:2px solid #1F5A2E;outline-offset:2px}
.fp-gradient{background:linear-gradient(90deg,#0d1f12,#2F6B3A 55%,#6b8f4e);-webkit-background-clip:text;background-clip:text;color:transparent}

.fp-btn{transition:transform .3s cubic-bezier(.22,1,.36,1),box-shadow .3s,background-color .3s}
.fp-btn:hover{transform:translateY(-2px);box-shadow:0 10px 20px rgba(31,90,46,.18)}
.fp-btn:active{transform:scale(.98)}
.fp-ghost:hover{background:#ECECE6}
.fp-card{transition:transform .5s cubic-bezier(.22,1,.36,1),box-shadow .5s}
.fp-card:hover{transform:translateY(-4px);box-shadow:0 18px 36px rgba(20,20,20,.07)}

/* load-in for the hero */
.fp-in{opacity:0;animation:fp-in .9s cubic-bezier(.22,1,.36,1) forwards}
@keyframes fp-in{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:none}}

/* scroll reveal */
.fp-reveal{opacity:0;transform:translateY(28px);transition:opacity .9s cubic-bezier(.22,1,.36,1),transform .9s cubic-bezier(.22,1,.36,1)}
.fp-reveal.is-in{opacity:1;transform:none}

.fp-word{transition:color .6s ease}

/* soft background glow behind the hero */
.fp-blob{position:absolute;z-index:0;right:-10%;top:0;width:min(640px,90vw);height:min(640px,90vw);border-radius:9999px;
  background:radial-gradient(circle at 30% 30%,rgba(47,107,58,.16),rgba(214,180,96,.10) 45%,transparent 70%);filter:blur(10px);animation:fp-drift 18s ease-in-out infinite alternate;pointer-events:none}
@keyframes fp-drift{from{transform:translate(0,0) scale(1)}to{transform:translate(-40px,30px) scale(1.08)}}

.fp-float{animation:fp-float 6s ease-in-out infinite}
@keyframes fp-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}

.fp-pulse{animation:fp-pulse 2s ease-in-out infinite}
@keyframes fp-pulse{0%,100%{box-shadow:0 0 0 0 rgba(47,107,58,.45)}50%{box-shadow:0 0 0 6px rgba(47,107,58,0)}}

.fp-pop{display:inline-block;animation:fp-pop .6s cubic-bezier(.34,1.56,.64,1)}
@keyframes fp-pop{from{transform:scale(.3) rotate(-20deg)}to{transform:scale(1) rotate(0)}}

/* the flow line: track fills, parcel travels, stops light up in turn */
.fp-flow .fp-flow-fill{width:0}
.fp-flow .fp-parcel{left:0;opacity:0}
.fp-flow .fp-stop{opacity:.35;transform:translateY(10px);transition:opacity .6s,transform .6s cubic-bezier(.22,1,.36,1)}
.fp-flow.is-in .fp-stop{opacity:1;transform:none;transition-delay:var(--d)}
.fp-flow.is-in .fp-stop .fp-stop-icon{animation:fp-ring 1s ease-out both;animation-delay:var(--d)}
.fp-flow.is-in .fp-flow-fill{animation:fp-fill 2.7s cubic-bezier(.45,0,.2,1) forwards}
.fp-flow.is-in .fp-parcel{animation:fp-travel 2.7s cubic-bezier(.45,0,.2,1) forwards}
@keyframes fp-fill{to{width:100%}}
@keyframes fp-travel{0%{left:0;opacity:1;transform:translateX(-50%)}92%{opacity:1}100%{left:100%;opacity:0;transform:translateX(-50%)}}
@keyframes fp-ring{0%{box-shadow:0 0 0 0 rgba(47,107,58,.5)}100%{box-shadow:0 0 0 14px rgba(47,107,58,0)}}

/* audience tab switch */
.fp-swap{animation:fp-in .55s cubic-bezier(.22,1,.36,1)}
.fp-swap-item{opacity:0;animation:fp-in .55s cubic-bezier(.22,1,.36,1) forwards}

/* FAQ open/close */
.fp-collapse{display:grid;grid-template-rows:0fr;transition:grid-template-rows .5s cubic-bezier(.22,1,.36,1)}
.fp-collapse.is-open{grid-template-rows:1fr}

.fp-band{background:radial-gradient(120% 140% at 0% 0%,#2c4a33 0%,#1C2A1F 55%,#141d16 100%)}
.fp-band::after{content:"";position:absolute;right:-60px;bottom:-60px;width:260px;height:260px;border-radius:9999px;background:radial-gradient(circle,rgba(214,180,96,.25),transparent 65%);animation:fp-drift 12s ease-in-out infinite alternate}

@media (prefers-reduced-motion: reduce){
  .fp-in,.fp-swap,.fp-swap-item{animation:none;opacity:1}
  .fp-reveal{opacity:1;transform:none;transition:none}
  .fp-blob,.fp-float,.fp-pulse,.fp-band::after{animation:none}
  .fp-flow .fp-stop{opacity:1;transform:none}
  .fp-flow .fp-flow-fill{width:100%}
  .fp-btn,.fp-card,.fp-word{transition:none}
}
`;

export default HomePage;