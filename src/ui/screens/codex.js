/**
 * ui/screens/codex.js — the Quantum Encyclopedia.
 *
 * Fourteen illustrated entries with a runnable demo on each: the reader
 * presses a button and watches the actual state move on a Bloch sphere.
 * Reading every page is an achievement, which is the only nudge it needs.
 */
import { h, clear } from '../dom.js';
import { icon } from '../../render/art.js';
import { wireTerms } from '../tooltip.js';
import { CODEX, CODEX_SECTIONS } from '../../tutorial/codex.js';
import { BlochSphere } from '../../render/bloch.js';
import { readCoin, entropy, findLinks } from '../../quantum/read.js';
import { QState } from '../../quantum/state.js';
import { update } from '../../save/store.js';
import { SFX } from '../../audio/sfx.js';
import { pct } from '../dom.js';

export const title = 'Encyclopedia';
export const mood = 'menu';

let current = CODEX[0].id;
let sphere = null;
let bodyEl = null;
let navEl = null;
let theApp = null;

export function build(app) {
  theApp = app;
  navEl = h('div.codex-nav');
  bodyEl = h('div.codex-body');

  const root = h('div.grow.col', { style: { minHeight: 0 } }, [
    h('div.row', { style: { padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--line)' } }, [
      h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back', onclick: () => app.router.back() }),
      h('h2', { text: 'Quantum Encyclopedia' }),
      h('div.grow'),
      h('span.dim.small', { text: 'Everything here is what the game actually does.' })
    ]),
    h('div.codex.grow', [navEl, bodyEl])
  ]);

  renderNav(app);
  show(app, current);
  return root;
}

export function leave() {
  if (sphere) { sphere.destroy(); sphere = null; }
}

export function enter(app) { renderNav(app); }

function renderNav(app) {
  clear(navEl);
  const read = new Set(app.profile.codexRead || []);
  for (const section of CODEX_SECTIONS) {
    navEl.appendChild(h('h4', { text: section }));
    for (const entry of CODEX.filter((c) => c.section === section)) {
      navEl.appendChild(h('button', {
        'aria-current': String(entry.id === current),
        onclick: () => { SFX.click(); show(app, entry.id); }
      }, [
        h('span.glyph', { text: entry.icon }),
        h('span', { text: entry.title }),
        read.has(entry.id) ? h('span.read', { text: '✓' }) : null
      ]));
    }
  }
}

function show(app, id) {
  const entry = CODEX.find((c) => c.id === id);
  if (!entry) return;
  current = id;

  update((p) => {
    p.codexRead = Array.from(new Set((p.codexRead || []).concat([id])));
  });
  app.checkAchievements();
  renderNav(app);

  if (sphere) { sphere.destroy(); sphere = null; }
  clear(bodyEl);
  bodyEl.scrollTop = 0;

  bodyEl.appendChild(h('div.caps.dim', { text: entry.section }));
  bodyEl.appendChild(h('h2', { text: entry.title }));
  bodyEl.appendChild(h('div.lede', { text: entry.lede }));
  for (const para of entry.body.split('\n\n')) {
    bodyEl.appendChild(h('p', { text: para }));
  }

  if (entry.demo) bodyEl.appendChild(demoBlock(app, entry));
  wireTerms(bodyEl);
}

/**
 * The demo. A Bloch sphere, a Run button, and a live readout of the state
 * the entry is describing. One qubit for the single-qubit topics, five for
 * anything about a board.
 */
function demoBlock(app, entry) {
  const wide = (entry.demo.board || []).concat(entry.demo.ops || [])
    .some((s) => s.length > 2 || (s[1] !== undefined && s[1] > 0) || s[0] === 'cx' || s[0] === 'cphase' || s[0] === 'swap');
  const n = wide ? 5 : 1;

  const canvas = h('canvas.bloch-canvas', { style: { maxWidth: '200px' } });
  const readout = h('div.mono.small');
  const caption = h('div.caption', { text: entry.demo.caption || '' });

  const block = h('div.codex-demo', [
    h('div', { style: { flex: '0 0 200px' } }, [canvas]),
    h('div.grow.col', [
      caption,
      readout,
      h('div.row', [
        h('button.btn.btn-sm.btn-primary', { text: 'Run it', onclick: () => run() }),
        h('button.btn.btn-sm.btn-ghost', { text: 'Reset', onclick: () => reset() })
      ])
    ])
  ]);

  sphere = new BlochSphere(canvas, { theme: app.profile.equipped.bloch || 'default' });

  const base = () => {
    const st = new QState(n);
    for (const s of (entry.demo.board || [])) { try { st[s[0]](...s.slice(1)); } catch (e) { /* skip */ } }
    return st;
  };

  const describe = (st) => {
    const c = readCoin(st, 0);
    const links = findLinks(st);
    readout.innerHTML =
      `state ${st.toKet(4)}<br>` +
      `coin 1: ${c.ket} &nbsp; P(1) = ${pct(c.up)} &nbsp; |r| = ${c.bloch.r.toFixed(2)}` +
      (links.length ? `<br>linked: ${links.map((l) => `${l.a + 1}↔${l.b + 1}`).join(', ')}` : '') +
      (n > 1 ? `<br>entropy ${entropy(st).toFixed(2)} bits` : '');
    sphere.set(c.bloch);
  };

  let st = base();
  const reset = () => { st = base(); sphere.set(readCoin(st, 0).bloch, true); describe(st); SFX.back(); };
  const run = () => {
    st = base();
    sphere.set(readCoin(st, 0).bloch, true);
    describe(st);
    const ops = entry.demo.ops || [];
    ops.forEach((op, i) => {
      setTimeout(() => {
        try {
          if (op[0] === 'measure') st.project(op[1], st.probOne(op[1]) >= 0.5 ? 1 : 0);
          else st[op[0]](...op.slice(1));
        } catch (e) { /* skip */ }
        SFX.gate(op[0].toUpperCase());
        describe(st);
      }, 480 * (i + 1));
    });
  };

  describe(st);
  return block;
}

export function key(e, app) {
  if (e.key === 'Escape') { app.router.back(); return true; }
  const i = CODEX.findIndex((c) => c.id === current);
  if (e.key === 'ArrowDown' || e.key === 'j') { show(app, CODEX[Math.min(CODEX.length - 1, i + 1)].id); return true; }
  if (e.key === 'ArrowUp' || e.key === 'k') { show(app, CODEX[Math.max(0, i - 1)].id); return true; }
  return false;
}
