// Maru — Farm Passport's badge cat (v4.4b). A white cat with a black cap, a white stripe down his forehead,
// green eyes, a pink nose, a little black chin spot, one black sock and a big fluffy black tail.
//
//   <Maru mode="give" />   pops up and hands over a medal (when a diner collects a badge)
//   <Maru mode="sit" />    sits quietly, blinks now and then, and waves when tapped (the badges page)
//   <Maru mode="give" gift="stamp" />   the same, handing over a star stamp (a badge you already had)
//   <Maru mode="loading" /> wags his tail slowly while his eyes go round and round (while the site's busy)
//
// Drawn in SVG and animated with CSS: no images or extra packages. Calm for people who turn motion off.
import { useState, useEffect } from 'react';

const INK = '#1C1C1E';
const PINK = '#F4A7B0';
const EAR = '#F6C1C7';
const EYE = '#A9B347';
const GOLD = '#E7B52C';
const GREEN = '#2F6B3A';

const CSS = `
.maru{position:relative;display:inline-block;line-height:0}
.maru svg{overflow:visible}
.maru-pop{animation:maru-pop .9s cubic-bezier(.2,1.4,.4,1) both}
@keyframes maru-pop{0%{transform:translateY(70%) scale(.85);opacity:0}60%{opacity:1}100%{transform:none;opacity:1}}
.maru-body{transform-origin:100px 205px;animation:maru-breathe 3.2s ease-in-out infinite}
.maru-happy .maru-body{animation:maru-wiggle .5s ease-in-out 1s 3, maru-breathe 3.2s ease-in-out 2.5s infinite}
@keyframes maru-breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.012,.988)}}
@keyframes maru-wiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}}
.maru-tail{transform-origin:62px 186px;animation:maru-tail 2.6s ease-in-out infinite}
.maru-loading .maru-tail{animation-duration:3.6s}
.maru-loading .maru-eyes{animation:none}
.maru-loading .maru-pupils{animation:maru-roll 1.4s linear infinite}
@keyframes maru-roll{0%{transform:translate(3px,0)}12.5%{transform:translate(2.1px,2.1px)}25%{transform:translate(0,3px)}37.5%{transform:translate(-2.1px,2.1px)}
  50%{transform:translate(-3px,0)}62.5%{transform:translate(-2.1px,-2.1px)}75%{transform:translate(0,-3px)}87.5%{transform:translate(2.1px,-2.1px)}100%{transform:translate(3px,0)}}
@keyframes maru-tail{0%,100%{transform:rotate(0)}50%{transform:rotate(9deg)}}
.maru-eyes{transform-origin:100px 82px;animation:maru-blink 4.6s infinite}
@keyframes maru-blink{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.08)}}
.maru-ears{transform-origin:100px 60px;animation:maru-ear 7s ease-in-out infinite}
@keyframes maru-ear{0%,88%,100%{transform:rotate(0)}91%{transform:rotate(-3deg)}94%{transform:rotate(2deg)}}
.maru-arm{transform-origin:128px 150px}
.maru-give .maru-arm{animation:maru-offer .7s cubic-bezier(.3,1.4,.5,1) .55s both}
@keyframes maru-offer{from{transform:rotate(55deg) translateY(10px)}to{transform:rotate(0)}}
.maru-wave .maru-arm{animation:maru-wave .45s ease-in-out 4}
@keyframes maru-wave{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(18deg)}}
.maru-medal{transform-origin:150px 108px}
.maru-give .maru-medal{animation:maru-shine 1.6s ease-in-out 1.3s infinite}
@keyframes maru-shine{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
.maru-flying .maru-medal{animation:maru-fly .9s cubic-bezier(.5,-.3,.6,1) forwards}
@keyframes maru-fly{0%{transform:none;opacity:1}100%{transform:translate(-20px,-170px) scale(.4) rotate(360deg);opacity:0}}
.maru-bubble{position:absolute;left:50%;top:-6px;transform:translate(-50%,-100%);white-space:nowrap;line-height:1.2;
  background:#fff;border:1px solid rgba(0,0,0,.08);box-shadow:0 6px 18px rgba(0,0,0,.08);border-radius:14px;padding:6px 12px;
  font:700 14px/1.2 Manrope,system-ui,sans-serif;color:#141414;animation:maru-say .4s cubic-bezier(.2,1.4,.4,1) both}
.maru-bubble:after{content:'';position:absolute;left:50%;bottom:-6px;width:12px;height:12px;background:#fff;
  border-right:1px solid rgba(0,0,0,.08);border-bottom:1px solid rgba(0,0,0,.08);transform:translateX(-50%) rotate(45deg)}
.maru-give:not(.maru-flying) .maru-bubble{animation-delay:1.1s}
@keyframes maru-say{from{opacity:0;transform:translate(-50%,-80%) scale(.6)}to{opacity:1;transform:translate(-50%,-100%) scale(1)}}
.maru-tap{cursor:pointer;-webkit-tap-highlight-color:transparent}
.maru-tap:focus-visible{outline:2px solid ${GREEN};outline-offset:4px;border-radius:12px}
@media (prefers-reduced-motion: reduce){
  .maru *, .maru{animation:none !important}
  .maru-flying .maru-medal{opacity:0}
}
`;

function Medal() {
  return (
    <g className="maru-medal">
      {/* ribbon */}
      <path d="M140 82 L150 104 L160 82 Z" fill={GREEN} />
      <path d="M144 82 L150 96 L156 82 Z" fill="#4C9A5B" />
      {/* medal */}
      <circle cx="150" cy="114" r="14" fill={GOLD} stroke="#B8891A" strokeWidth="2" />
      <circle cx="150" cy="114" r="9" fill="#F5D267" />
      {/* a little leaf on it (Farm Passport) */}
      <path d="M145 117 C146 110 152 108 156 109 C155 114 151 118 145 117 Z" fill={GREEN} />
      <path d="M146 116 L153 111" stroke="#F5D267" strokeWidth="1" strokeLinecap="round" />
      <path d="M141 106 L143 104 M158 104 L160 106" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".8" />
    </g>
  );
}

function Stamp() {
  return (
    <g className="maru-medal">
      <circle cx="150" cy="110" r="16" fill="#FFF7E0" stroke={GOLD} strokeWidth="2.5" strokeDasharray="3 2.2" />
      <path d="M150 99 L153.2 106 L160.8 106.6 L155 111.6 L156.8 119 L150 115 L143.2 119 L145 111.6 L139.2 106.6 L146.8 106 Z" fill={GOLD} stroke="#B8891A" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M140 96 L142 94 M160 94 L162 96" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function Cat({ holding, armUp }) {
  return (
    <svg viewBox="0 0 200 220" width="100%" height="100%" role="img" aria-label="Maru the cat">
      <defs>
        <clipPath id="maru-head"><ellipse cx="100" cy="84" rx="50" ry="44" /></clipPath>
      </defs>
      {/* shadow */}
      <ellipse cx="100" cy="212" rx="58" ry="6" fill="#000" opacity=".08" />

      {/* big fluffy black tail, curling round on his left */}
      <g className="maru-tail">
        <path d="M70 192 C40 198 20 182 22 156 C23 140 32 132 40 134" stroke={INK} strokeWidth="20" fill="none" strokeLinecap="round" />
        {/* soft fluffy tufts */}
        <g fill={INK}>
          <circle cx="26" cy="146" r="9" /><circle cx="22" cy="162" r="10" /><circle cx="28" cy="178" r="10" />
          <circle cx="42" cy="190" r="9" /><circle cx="36" cy="133" r="8" />
        </g>
        <path d="M24 140 q-6 -2 -8 -8 M16 160 q-6 1 -9 -3 M22 182 q-5 4 -10 3" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>

      <g className="maru-body">
        {/* body */}
        <path d="M62 196 C52 168 60 128 100 122 C140 128 148 168 138 196 Z" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
        {/* the little black spot on his shoulder */}
        <ellipse cx="72" cy="140" rx="5" ry="8" fill={INK} transform="rotate(-20 72 140)" />

        {/* front legs and white paws; one black sock */}
        <rect x="78" y="168" width="18" height="38" rx="9" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
        {armUp ? null : (
          <g>
            <rect x="104" y="168" width="18" height="38" rx="9" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
            <path d="M104 178 C104 172 108 168 113 168 C118 168 122 172 122 178 L122 190 C116 194 110 194 104 190 Z" fill={INK} />
          </g>
        )}
        <ellipse cx="87" cy="206" rx="11" ry="6" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
        <path d="M84 204 v4 M90 204 v4" stroke="#D8D4CC" strokeWidth="1.2" strokeLinecap="round" />
        {!armUp && <>
          <ellipse cx="113" cy="206" rx="11" ry="6" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
          <path d="M110 204 v4 M116 204 v4" stroke="#D8D4CC" strokeWidth="1.2" strokeLinecap="round" />
        </>}

        {/* ears: black outside, pink inside */}
        <g className="maru-ears">
          <path d="M56 70 L58 26 L92 50 Z" fill={INK} />
          <path d="M62 62 L63 36 L84 51 Z" fill={EAR} />
          <path d="M144 70 L142 26 L108 50 Z" fill={INK} />
          <path d="M138 62 L137 36 L116 51 Z" fill={EAR} />
        </g>

        {/* head */}
        <ellipse cx="100" cy="84" rx="50" ry="44" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
        {/* his black cap, coming down over the eyes, with the white stripe up the middle */}
        <g clipPath="url(#maru-head)">
          <path d="M40 40 L160 40 L160 92 C150 90 140 84 132 78 C124 74 116 74 110 72 L104 56 L96 56 L90 72 C84 74 76 74 68 78 C60 84 50 90 40 92 Z" fill={INK} />
          {/* a few white hairs in the stripe */}
          <path d="M98 44 L99 54 M102 46 L101 55" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" opacity=".7" />
        </g>

        {/* eyes: green, a little sleepy */}
        <g className="maru-eyes">
          <ellipse cx="78" cy="86" rx="9" ry="8" fill={EYE} />
          <ellipse cx="122" cy="86" rx="9" ry="8" fill={EYE} />
          <g className="maru-pupils">
            <ellipse cx="79" cy="87" rx="4" ry="6" fill={INK} />
            <ellipse cx="121" cy="87" rx="4" ry="6" fill={INK} />
            <circle cx="81" cy="84" r="2" fill="#fff" />
            <circle cx="123" cy="84" r="2" fill="#fff" />
          </g>
          {/* relaxed lids */}
          <path d="M68 82 C72 77 84 77 88 82" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <path d="M112 82 C116 77 128 77 132 82" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>

        {/* rosy cheeks, pink nose, little smile, black chin spot */}
        <ellipse cx="66" cy="102" rx="7" ry="4" fill={PINK} opacity=".35" />
        <ellipse cx="134" cy="102" rx="7" ry="4" fill={PINK} opacity=".35" />
        <path d="M94 98 L106 98 L100 105 Z" fill={PINK} strokeLinejoin="round" stroke={PINK} strokeWidth="2" />
        <path d="M100 105 C99 110 94 112 90 109 M100 105 C101 110 106 112 110 109" stroke="#8A7F7A" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M95 117 C98 116 104 116 107 118 C105 122 99 123 95 120 Z" fill={INK} opacity=".85" />
        <path d="M93 116 l-2 2 M97 120 l-1 2" stroke={INK} strokeWidth="1.2" strokeLinecap="round" opacity=".6" />

        {/* whiskers */}
        <g stroke="#CFCBC3" strokeWidth="1.2" strokeLinecap="round">
          <path d="M70 104 L40 100 M70 108 L42 110" />
          <path d="M130 104 L160 100 M130 108 L158 110" />
        </g>

        {/* the raised paw (black sock) holding the medal — or waving */}
        {armUp && <g className="maru-arm">
          {holding === 'stamp' ? <Stamp /> : holding ? <Medal /> : null}
          <path d="M120 156 C124 140 134 124 144 120 C152 118 156 126 152 132 C146 142 138 152 132 162 Z" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
          <path d="M127 150 C131 142 136 135 141 131 L148 137 C143 143 138 150 134 156 Z" fill={INK} />
          <ellipse cx="149" cy="124" rx="8" ry="7" fill="#fff" stroke="#E6E3DC" strokeWidth="1.5" />
          <path d="M145 120 l1 3 M150 119 v3" stroke="#D8D4CC" strokeWidth="1.2" strokeLinecap="round" />
        </g>}
      </g>
    </svg>
  );
}

/**
 * mode: 'give' (pops up holding a medal) | 'sit' (blinks; tap to wave)
 * say: the speech bubble; size: width in px; flyAway: in 'give', the medal flies off after this many ms (0 = stays)
 */
export default function Maru({ mode = 'sit', gift = 'medal', say, size = 150, flyAway = 0, className = '' }) {
  const [waving, setWaving] = useState(false);
  const [bubble, setBubble] = useState(mode === 'give' ? (say ?? 'Here you go!') : null);
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    if (mode !== 'give' || !flyAway) return undefined;
    const t = setTimeout(() => { setFlying(true); setBubble(gift === 'stamp' ? 'Stamped!' : 'Added to your collection!'); }, flyAway);
    return () => clearTimeout(t);
  }, [mode, flyAway]);

  const hello = () => {
    if (mode !== 'sit') return;
    setWaving(false);
    requestAnimationFrame(() => setWaving(true));
    setBubble(say || 'Hi, I’m Maru!');
    clearTimeout(hello.t);
    hello.t = setTimeout(() => { setWaving(false); setBubble(null); }, 2200);
  };

  const cls = ['maru',
    mode === 'give' ? 'maru-pop maru-give maru-happy' : mode === 'loading' ? 'maru-loading' : 'maru-tap',
    waving ? 'maru-wave' : '', flying ? 'maru-flying' : '', className].join(' ');
  return (
    <span className={cls} style={{ width: size, height: size * 1.1 }}
      onClick={hello} role={mode === 'sit' ? 'button' : undefined} tabIndex={mode === 'sit' ? 0 : undefined}
      onKeyDown={(e) => { if (mode === 'sit' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); hello(); } }}
      aria-label={mode === 'sit' ? 'Maru the cat. Tap to say hello' : mode === 'loading' ? 'Loading' : undefined}>
      <style>{CSS}</style>
      {bubble && <span className="maru-bubble" key={bubble}>{bubble}</span>}
      <Cat holding={mode === 'give' ? gift : null} armUp={mode === 'give' || waving} />
    </span>
  );
}