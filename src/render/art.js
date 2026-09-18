/**
 * render/art.js — the drawn marks.
 *
 * Card faces carry the symbol a circuit diagram uses for that gate, so the
 * deck teaches the notation without ever saying so. Avatars are geometric
 * because a table of six portraits has to read at 40 pixels.
 *
 * Everything here is inline SVG: sharp at any zoom, themeable through
 * currentColor, and nothing to load.
 */

function svg(body, cls, viewBox) {
  return `<svg class="${cls || ''}" viewBox="${viewBox || '0 0 100 100'}" aria-hidden="true" focusable="false"
    fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

const wire = (y = 50) => `<path d="M4 ${y} H22 M78 ${y} H96" stroke-width="5" fill="none" opacity=".5"/>`;
const boxed = (label, sub) =>
  wire() +
  '<rect x="22" y="22" width="56" height="56" rx="7" fill="none" stroke-width="5"/>' +
  `<text x="50" y="${sub ? 50 : 56}" text-anchor="middle" font-size="${label.length > 2 ? 22 : 30}"
     font-family="ui-monospace, monospace" font-weight="700" stroke="none">${label}</text>` +
  (sub ? `<text x="50" y="68" text-anchor="middle" font-size="13" font-family="ui-monospace, monospace"
     opacity=".7" stroke="none">${sub}</text>` : '');

/** The circuit symbol for each card. */
export const GATE_ART = {
  X: wire() + '<circle cx="50" cy="50" r="24" fill="none" stroke-width="5"/>' +
     '<path d="M50 26 V74 M26 50 H74" stroke-width="5"/>',
  Y: boxed('Y'),
  Z: boxed('Z'),
  H: boxed('H'),
  SX: boxed('√X'),
  I: wire() + '<rect x="22" y="22" width="56" height="56" rx="7" fill="none" stroke-width="5" stroke-dasharray="6 5"/>' +
     '<path d="M34 50 H66" stroke-width="5"/>',
  M: '<path d="M4 50 H16" stroke-width="5" fill="none" opacity=".5"/>' +
     '<rect x="16" y="22" width="64" height="56" rx="7" fill="none" stroke-width="5"/>' +
     '<path d="M30 66 A18 18 0 0 1 66 66" fill="none" stroke-width="4"/>' +
     '<path d="M48 66 L66 44" stroke-width="5"/><circle cx="48" cy="66" r="4" stroke="none"/>' +
     '<path d="M80 44 H96 M80 56 H96" stroke-width="4" fill="none" opacity=".5"/>',
  RESET: wire() + '<rect x="22" y="22" width="56" height="56" rx="7" fill="none" stroke-width="5"/>' +
     '<path d="M36 40 H64 M40 52 H60 M44 64 H56" stroke-width="5"/>',

  CX: '<path d="M4 28 H96 M4 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="50" cy="28" r="8" stroke="none"/><path d="M50 28 V72" stroke-width="5"/>' +
      '<circle cx="50" cy="72" r="17" fill="none" stroke-width="5"/>' +
      '<path d="M33 72 H67 M50 55 V89" stroke-width="5"/>',
  CZ: '<path d="M4 28 H96 M4 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="50" cy="28" r="8" stroke="none"/><circle cx="50" cy="72" r="8" stroke="none"/>' +
      '<path d="M50 28 V72" stroke-width="5"/>',
  CPHASE: '<path d="M4 28 H96 M4 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="50" cy="28" r="8" stroke="none"/><circle cx="50" cy="72" r="8" stroke="none"/>' +
      '<path d="M50 28 V72" stroke-width="5"/>' +
      '<text x="68" y="54" font-size="17" font-family="ui-monospace,monospace" stroke="none" opacity=".85">π/2</text>',
  SWAP: '<path d="M4 28 H96 M4 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<path d="M40 18 L60 38 M60 18 L40 38 M40 62 L60 82 M60 62 L40 82" stroke-width="5"/>' +
      '<path d="M50 28 V72" stroke-width="4" opacity=".6"/>',
  ISWAP: '<path d="M4 28 H96 M4 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<path d="M40 18 L60 38 M60 18 L40 38 M40 62 L60 82 M60 62 L40 82" stroke-width="5"/>' +
      '<path d="M50 28 V72" stroke-width="4" opacity=".6"/>' +
      '<text x="76" y="56" font-size="20" font-family="ui-monospace,monospace" stroke="none">i</text>',
  CCX: '<path d="M4 20 H96 M4 50 H96 M4 80 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="50" cy="20" r="7" stroke="none"/><circle cx="50" cy="50" r="7" stroke="none"/>' +
      '<path d="M50 20 V80" stroke-width="5"/>' +
      '<circle cx="50" cy="80" r="14" fill="none" stroke-width="5"/>' +
      '<path d="M36 80 H64 M50 66 V94" stroke-width="5"/>',
  BELL: '<path d="M4 28 H96 M4 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<rect x="20" y="12" width="32" height="32" rx="5" fill="none" stroke-width="5"/>' +
      '<text x="36" y="35" text-anchor="middle" font-size="20" font-family="ui-monospace,monospace" stroke="none">H</text>' +
      '<circle cx="68" cy="28" r="7" stroke="none"/><path d="M68 28 V72" stroke-width="5"/>' +
      '<circle cx="68" cy="72" r="13" fill="none" stroke-width="5"/>' +
      '<path d="M55 72 H81 M68 59 V85" stroke-width="5"/>',
  CHAIN: '<path d="M4 20 H96 M4 50 H96 M4 80 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="34" cy="20" r="6" stroke="none"/><path d="M34 20 V50"/><circle cx="34" cy="50" r="11" fill="none" stroke-width="4"/>' +
      '<circle cx="68" cy="50" r="6" stroke="none"/><path d="M68 50 V80"/><circle cx="68" cy="80" r="11" fill="none" stroke-width="4"/>',

  S: boxed('S'), SDG: boxed('S†'), T: boxed('T'),
  RX: boxed('Rx', 'π/3'), RY: boxed('Ry', 'π/3'), RZ: boxed('Rz', 'π/3'),

  SPREAD: '<g stroke-width="4" fill="none" opacity=".45"><path d="M4 18 H96 M4 39 H96 M4 61 H96 M4 82 H96"/></g>' +
      '<g fill="none" stroke-width="4"><rect x="38" y="8" width="24" height="20" rx="4"/><rect x="38" y="29" width="24" height="20" rx="4"/>' +
      '<rect x="38" y="51" width="24" height="20" rx="4"/><rect x="38" y="72" width="24" height="20" rx="4"/></g>',
  ORACLE: wire() + '<rect x="22" y="22" width="56" height="56" rx="7" fill="none" stroke-width="5"/>' +
      '<circle cx="50" cy="50" r="15" fill="none" stroke-width="4"/><circle cx="50" cy="50" r="6" stroke="none"/>',
  DEUTSCH: '<path d="M4 30 H96 M4 70 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="50" cy="50" r="20" fill="none" stroke-width="5"/>' +
      '<path d="M50 30 V70 M30 50 H70" stroke-width="5"/>',
  FREEZE: wire() + '<g stroke-width="5" fill="none"><path d="M50 20 V80 M26 34 L74 66 M74 34 L26 66"/>' +
      '<path d="M50 20 l-7 9 M50 20 l7 9 M50 80 l-7 -9 M50 80 l7 -9"/></g>',
  ZENO: wire() + '<path d="M32 18 h36 v10 l-18 22 18 22 v10 h-36 v-10 l18 -22 -18 -22z" fill="none" stroke-width="5"/>',
  MEASUREX: '<path d="M4 50 H16" stroke-width="5" fill="none" opacity=".5"/>' +
      '<rect x="16" y="22" width="64" height="56" rx="7" fill="none" stroke-width="5"/>' +
      '<path d="M30 66 A18 18 0 0 1 66 66" fill="none" stroke-width="4"/><path d="M48 66 L34 46" stroke-width="5"/>' +
      '<text x="68" y="42" font-size="16" font-family="ui-monospace,monospace" stroke="none">x</text>',
  AMPLIFY: wire() + '<path d="M22 72 L40 52 L58 62 L78 26" fill="none" stroke-width="5"/>' +
      '<path d="M78 26 l-13 2 M78 26 l2 13" stroke-width="5" fill="none"/>',
  ENTBOMB: '<circle cx="50" cy="50" r="10" stroke="none"/>' +
      '<g stroke-width="4" fill="none"><path d="M50 50 L14 22 M50 50 L86 22 M50 50 L14 78 M50 50 L86 78 M50 50 V8"/></g>' +
      '<g stroke="none"><circle cx="14" cy="22" r="6"/><circle cx="86" cy="22" r="6"/><circle cx="14" cy="78" r="6"/><circle cx="86" cy="78" r="6"/><circle cx="50" cy="8" r="6"/></g>',
  PHASESTORM: '<g stroke-width="4" fill="none" opacity=".5"><path d="M4 22 H96 M4 50 H96 M4 78 H96"/></g>' +
      '<path d="M30 10 L18 46 H38 L26 90" fill="none" stroke-width="6"/>' +
      '<path d="M72 10 L60 46 H80 L68 90" fill="none" stroke-width="6" opacity=".6"/>',
  GROVER: wire() + '<circle cx="44" cy="44" r="24" fill="none" stroke-width="5"/>' +
      '<path d="M62 62 L88 88" stroke-width="7"/>' +
      '<path d="M34 44 H54 M44 34 V54" stroke-width="4" opacity=".8"/>',
  TELEPORT: '<path d="M4 28 H40 M60 72 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="30" cy="28" r="9" fill="none" stroke-width="4"/>' +
      '<path d="M40 28 C58 28 58 72 60 72" fill="none" stroke-width="5" stroke-dasharray="7 6"/>' +
      '<path d="M76 72 l-10 -7 M76 72 l-10 7" stroke-width="5" fill="none"/>',
  ERRORMIT: wire() + '<path d="M50 16 L80 30 V54 C80 72 66 82 50 88 C34 82 20 72 20 54 V30z" fill="none" stroke-width="5"/>' +
      '<path d="M36 52 L46 62 L66 40" fill="none" stroke-width="6"/>',
  NOISECANCEL: wire() + '<path d="M26 50 a24 24 0 1 1 8 17" fill="none" stroke-width="5"/>' +
      '<path d="M34 55 l0 14 l-13 -2" fill="none" stroke-width="5"/>',
  ANNEAL: wire() + '<path d="M22 74 C34 74 34 40 50 40 C66 40 66 26 78 26" fill="none" stroke-width="5"/>' +
      '<path d="M22 84 H78" stroke-width="4" opacity=".5"/>' +
      '<path d="M40 18 q6 -8 0 -14 M52 18 q6 -8 0 -14 M64 18 q6 -8 0 -14" fill="none" stroke-width="3.5" opacity=".7"/>',
  QFT: wire() + '<rect x="18" y="18" width="64" height="64" rx="8" fill="none" stroke-width="5"/>' +
      '<text x="50" y="62" text-anchor="middle" font-size="36" font-family="Georgia, serif" font-style="italic" stroke="none">F</text>',
  REWIND: wire() + '<path d="M72 50 a22 22 0 1 0 -8 17" fill="none" stroke-width="5"/>' +
      '<path d="M64 62 l0 14 l13 -2" fill="none" stroke-width="5"/>',
  SUPERDENSE: '<path d="M4 30 H96 M4 70 H96" stroke-width="4" fill="none" opacity=".45"/>' +
      '<circle cx="34" cy="30" r="8" stroke="none"/><circle cx="34" cy="70" r="8" stroke="none"/>' +
      '<path d="M34 30 V70" stroke-width="5"/>' +
      '<text x="70" y="40" text-anchor="middle" font-size="19" font-family="ui-monospace,monospace" stroke="none">1</text>' +
      '<text x="70" y="78" text-anchor="middle" font-size="19" font-family="ui-monospace,monospace" stroke="none">1</text>',
  COHERE: '<g stroke-width="4" fill="none" opacity=".5"><path d="M4 18 H96 M4 39 H96 M4 61 H96 M4 82 H96"/></g>' +
      '<g stroke="none"><circle cx="50" cy="18" r="6"/><circle cx="50" cy="39" r="6"/><circle cx="50" cy="61" r="6"/><circle cx="50" cy="82" r="6"/></g>'
};

export function gateArt(id) {
  return svg(GATE_ART[id] || boxed(id.slice(0, 3)), 'gate-art');
}

/* ------------------------------------------------------------------ *
 * Avatars
 * ------------------------------------------------------------------ */

export const AVATARS = {
  hero: '<path d="M50 8 L62 36 L92 40 L68 60 L76 90 L50 74 L24 90 L32 60 L8 40 L38 36 Z"/>',
  rook: '<rect x="22" y="34" width="56" height="52" rx="4"/><path d="M22 34 V16 h12 v8 h10 v-8 h12 v8 h10 v-8 h12 v18" />' +
        '<rect x="42" y="58" width="16" height="28" rx="3" fill="#0b1020"/>',
  vesper: '<path d="M50 6 C62 30 90 34 90 56 a40 40 0 0 1-80 0 C10 34 38 30 50 6z" fill="none" stroke-width="6"/>' +
        '<circle cx="50" cy="58" r="13"/>',
  moth: '<ellipse cx="50" cy="52" rx="9" ry="26"/>' +
        '<path d="M42 38 C14 14 4 44 20 58 C30 68 40 62 42 54z"/><path d="M58 38 C86 14 96 44 80 58 C70 68 60 62 58 54z"/>' +
        '<path d="M46 26 C40 14 34 12 30 8 M54 26 C60 14 66 12 70 8" fill="none" stroke-width="4"/>',
  ash: '<circle cx="50" cy="50" r="38" fill="none" stroke-width="6"/>' +
        '<path d="M50 12 a38 38 0 0 1 0 76z"/>',
  echo: '<g fill="none" stroke-width="5"><circle cx="50" cy="50" r="10"/><circle cx="50" cy="50" r="22" opacity=".7"/>' +
        '<circle cx="50" cy="50" r="34" opacity=".4"/></g><circle cx="50" cy="50" r="5"/>',
  quark: '<circle cx="50" cy="50" r="11"/><g fill="none" stroke-width="5">' +
        '<ellipse cx="50" cy="50" rx="42" ry="16"/><ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(60 50 50)"/>' +
        '<ellipse cx="50" cy="50" rx="42" ry="16" transform="rotate(120 50 50)"/></g>',
  cat: '<path d="M18 44 L14 14 L40 30 a44 44 0 0 1 20 0 L86 14 L82 44 a36 36 0 1 1-64 0z" fill="none" stroke-width="6"/>' +
        '<circle cx="36" cy="52" r="5"/><circle cx="64" cy="52" r="5"/>' +
        '<path d="M44 68 q6 6 12 0" fill="none" stroke-width="4"/>',
  search: '<circle cx="42" cy="42" r="26" fill="none" stroke-width="7"/><path d="M62 62 L88 88" stroke-width="10"/>',
  oracle: '<path d="M6 50 C24 22 76 22 94 50 C76 78 24 78 6 50z" fill="none" stroke-width="7"/>' +
        '<circle cx="50" cy="50" r="16"/><circle cx="56" cy="44" r="5" fill="#0b1020" stroke="none"/>',
  twins: '<circle cx="32" cy="50" r="20" fill="none" stroke-width="6"/><circle cx="68" cy="50" r="20" fill="none" stroke-width="6"/>' +
        '<path d="M52 50 H48" stroke-width="6"/><circle cx="32" cy="50" r="6"/><circle cx="68" cy="50" r="6"/>',
  chip: '<rect x="26" y="26" width="48" height="48" rx="5" fill="none" stroke-width="6"/>' +
        '<g stroke-width="5"><path d="M38 26 V10 M50 26 V10 M62 26 V10 M38 74 V90 M50 74 V90 M62 74 V90"/>' +
        '<path d="M26 38 H10 M26 50 H10 M26 62 H10 M74 38 H90 M74 50 H90 M74 62 H90"/></g>' +
        '<rect x="40" y="40" width="20" height="20" rx="2"/>',
  blur: '<g fill="none" stroke-width="5"><circle cx="42" cy="50" r="24" opacity=".35"/><circle cx="50" cy="50" r="24" opacity=".6"/>' +
        '<circle cx="58" cy="50" r="24" opacity=".35"/></g>',
  scientist: '<circle cx="50" cy="32" r="18" fill="none" stroke-width="6"/><path d="M20 90 a30 30 0 0 1 60 0z"/>' +
        '<path d="M34 28 h12 M54 28 h12" stroke-width="4"/>',
  alien: '<path d="M50 8 C74 8 88 28 88 46 C88 70 68 92 50 92 C32 92 12 70 12 46 C12 28 26 8 50 8z" fill="none" stroke-width="6"/>' +
        '<ellipse cx="34" cy="48" rx="9" ry="14" transform="rotate(-20 34 48)"/>' +
        '<ellipse cx="66" cy="48" rx="9" ry="14" transform="rotate(20 66 48)"/>',
  hacker: '<rect x="12" y="24" width="76" height="52" rx="6" fill="none" stroke-width="6"/>' +
        '<path d="M26 40 L38 50 L26 60" fill="none" stroke-width="5"/><path d="M46 62 H70" stroke-width="5"/>'
};

export function avatarArt(key) {
  return svg(AVATARS[key] || AVATARS.hero, 'avatar-art');
}

export const AVATAR_KEYS = Object.keys(AVATARS);

/* ------------------------------------------------------------------ *
 * Interface icons
 * ------------------------------------------------------------------ */

const I = (b) => svg(b, 'icon', '0 0 24 24');

export const ICONS = {
  play: () => I('<path d="M8 5v14l11-7z" stroke="none"/>'),
  pause: () => I('<path d="M6 5h4v14H6zM14 5h4v14h-4z" stroke="none"/>'),
  sound: () => I('<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="none"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" fill="none" stroke-width="1.7"/>'),
  muted: () => I('<path d="M4 9v6h4l5 4V5L8 9H4z" stroke="none"/><path d="M16 9.5l5 5m0-5l-5 5" fill="none" stroke-width="1.8"/>'),
  back: () => I('<path d="M15 5l-7 7 7 7" fill="none" stroke-width="2"/>'),
  close: () => I('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke-width="2"/>'),
  settings: () => I('<circle cx="12" cy="12" r="3.2" fill="none" stroke-width="1.8"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.2 5.2l2.1 2.1M16.7 16.7l2.1 2.1M18.8 5.2l-2.1 2.1M7.3 16.7l-2.1 2.1" stroke-width="1.8" fill="none"/>'),
  book: () => I('<path d="M4 4.5h6a2.5 2.5 0 0 1 2.5 2.5v13A2 2 0 0 0 11 19H4z" fill="none" stroke-width="1.7"/><path d="M20 4.5h-6A2.5 2.5 0 0 0 11.5 7v13A2 2 0 0 1 13 19h7z" fill="none" stroke-width="1.7"/>'),
  chart: () => I('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke-width="2"/>'),
  trophy: () => I('<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="none" stroke-width="1.8"/><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M9 20h6M12 14v6" fill="none" stroke-width="1.8"/>'),
  circuit: () => I('<path d="M2 8h5M11 8h11M2 16h11M17 16h5" fill="none" stroke-width="1.8"/><circle cx="9" cy="8" r="2" fill="none" stroke-width="1.8"/><circle cx="15" cy="16" r="2" fill="none" stroke-width="1.8"/>'),
  sphere: () => I('<circle cx="12" cy="12" r="9" fill="none" stroke-width="1.7"/><ellipse cx="12" cy="12" rx="9" ry="3.6" fill="none" stroke-width="1.4"/><path d="M12 3v18" fill="none" stroke-width="1.2" opacity=".6"/>'),
  hint: () => I('<path d="M9 18h6M10 21h4" stroke-width="1.8" fill="none"/><path d="M12 2a6.5 6.5 0 0 0-4 11.6V16h8v-2.4A6.5 6.5 0 0 0 12 2z" fill="none" stroke-width="1.7"/>'),
  psi: () => I('<text x="12" y="18" text-anchor="middle" font-size="17" font-family="ui-monospace,monospace" stroke="none">Ψ</text>'),
  shop: () => I('<path d="M3 6h18l-1.6 12.2A2 2 0 0 1 17.4 20H6.6a2 2 0 0 1-2-1.8z" fill="none" stroke-width="1.7"/><path d="M8.5 9V6a3.5 3.5 0 0 1 7 0v3" fill="none" stroke-width="1.7"/>'),
  reroll: () => I('<path d="M20 11a8 8 0 1 0-1.5 5.5" fill="none" stroke-width="1.8"/><path d="M20 4v6h-6" fill="none" stroke-width="1.8"/>'),
  share: () => I('<circle cx="18" cy="5" r="2.6" fill="none" stroke-width="1.7"/><circle cx="6" cy="12" r="2.6" fill="none" stroke-width="1.7"/><circle cx="18" cy="19" r="2.6" fill="none" stroke-width="1.7"/><path d="M8.4 10.8l7.2-4.2M8.4 13.2l7.2 4.2" fill="none" stroke-width="1.6"/>'),
  check: () => I('<path d="M5 13l4 4L19 7" fill="none" stroke-width="2.2"/>'),
  lock: () => I('<rect x="4.5" y="10.5" width="15" height="10" rx="2" fill="none" stroke-width="1.7"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" fill="none" stroke-width="1.7"/>'),
  fullscreen: () => I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke-width="1.9"/>'),
  info: () => I('<circle cx="12" cy="12" r="9" fill="none" stroke-width="1.7"/><path d="M12 11v6" stroke-width="2"/><circle cx="12" cy="7.6" r="1.2" stroke="none"/>')
};

export function icon(name) {
  return ICONS[name] ? ICONS[name]() : '';
}

/** A poker chip, drawn as SVG so it scales and can be tinted per style. */
export function chipArt(style = 'default', value = 0) {
  const rings = {
    default: ['#6ee7ff', '#0b1020'],
    chips_neon: ['#f472b6', '#1a0a20'],
    chips_bone: ['#f1f5f9', '#2a2622']
  }[style] || ['#6ee7ff', '#0b1020'];
  return `<svg class="chip-art" viewBox="0 0 48 48" aria-hidden="true">
    <circle cx="24" cy="24" r="22" fill="${rings[1]}" stroke="${rings[0]}" stroke-width="2"/>
    <circle cx="24" cy="24" r="15" fill="none" stroke="${rings[0]}" stroke-width="1.5" stroke-dasharray="5 4" opacity=".8"/>
    <circle cx="24" cy="24" r="9" fill="${rings[0]}" opacity=".18"/>
    ${value ? `<text x="24" y="28" text-anchor="middle" font-size="11" font-family="ui-monospace,monospace"
       font-weight="700" fill="${rings[0]}">${value}</text>` : ''}
  </svg>`;
}
