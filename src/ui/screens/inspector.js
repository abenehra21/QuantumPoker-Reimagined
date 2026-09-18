/**
 * ui/screens/inspector.js — the slide-out panel.
 *
 * Three tabs on the same state: the live circuit, a Bloch sphere for one
 * coin, and the raw readout. This is the "show me the physics" drawer, and
 * it is available at every moment of every hand.
 */
import { h, clear, copy, pct } from '../dom.js';
import { icon } from '../../render/art.js';
import { CircuitView } from '../../render/circuit.js';
import { BlochSphere } from '../../render/bloch.js';
import { readCoin, findLinks, entropy, scoreDistribution } from '../../quantum/read.js';
import { summarise } from '../../quantum/circuit.js';
import { toast } from '../toast.js';
import { hide as hideTooltip } from '../tooltip.js';
import { SFX } from '../../audio/sfx.js';
import { loop } from '../../engine/loop.js';

let panel = null;
let circuitView = null;
let bloch = null;
let tick = null;
let currentCoin = 0;

export function openInspector(app, game, tab = 'circuit') {
  if (!panel) buildPanel(app);
  panel.dataset.tab = tab;
  panel._game = game;
  panel._app = app;
  showTab(tab);
  hideTooltip();
  panel.classList.add('open');
  SFX.click();
  if (!tick) tick = loop.add(() => refresh(), 'inspector');
}

export function closeInspector() {
  if (panel) panel.classList.remove('open');
  if (tick) { tick(); tick = null; }
}

function buildPanel(app) {
  const tabsEl = h('div.segmented', [
    tabBtn('circuit', 'Circuit'),
    tabBtn('bloch', 'Bloch'),
    tabBtn('state', 'Readout')
  ]);

  panel = h('div.side-panel', { role: 'complementary', 'aria-label': 'Quantum inspector' }, [
    h('div.side-panel-head', [
      h('h3', { text: 'Under the table' }),
      h('div.grow'),
      tabsEl,
      h('button.btn.btn-icon.btn-ghost', { html: icon('close'), 'aria-label': 'Close',
        onclick: () => closeInspector() })
    ]),
    h('div.side-panel-body')
  ]);
  document.body.appendChild(panel);
  panel._tabs = tabsEl;
}

function tabBtn(id, label) {
  return h('button', {
    type: 'button', text: label, dataset: { tab: id },
    onclick: () => { SFX.click(); showTab(id); }
  });
}

function showTab(tab) {
  panel.dataset.tab = tab;
  for (const b of panel._tabs.children) b.setAttribute('aria-pressed', String(b.dataset.tab === tab));
  const body = panel.querySelector('.side-panel-body');
  clear(body);
  if (circuitView) { circuitView.destroy(); circuitView = null; }
  if (bloch) { bloch.destroy(); bloch = null; }

  const game = panel._game, app = panel._app;
  if (!game) return;
  const hero = game.hero();

  if (tab === 'circuit') {
    const canvas = h('canvas.circuit-canvas');
    body.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: 'Your circuit, live' }),
      canvas
    ]));
    circuitView = new CircuitView(canvas, { accent: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#6ee7ff' });
    circuitView.set(hero.circuit);

    body.appendChild(h('p.small.dim', {
      html: 'Wires are coins, boxes are gates, a filled dot joined to a target is a controlled gate, and the meter is a measurement. The faint line under each wire is that coin’s chance of landing on 1 as the circuit runs. This is the notation, not a picture of it.'
    }));

    const qasmEl = h('pre.qasm', { text: hero.circuit ? hero.circuit.toQasm() : '' });
    body.appendChild(h('div.panel.panel-pad', [
      h('div.row', [
        h('div.panel-title', { text: 'OpenQASM 3' }),
        h('div.grow'),
        h('button.btn.btn-sm.btn-ghost', {
          text: 'Copy',
          onclick: async () => {
            const ok = await copy(qasmEl.textContent);
            toast({ icon: ok ? '✓' : '!', body: ok ? 'Circuit copied. Paste it into IBM Quantum Composer.' : 'Could not copy.' });
          }
        })
      ]),
      qasmEl
    ]));
    panel._qasm = qasmEl;
  }

  if (tab === 'bloch') {
    const canvas = h('canvas.bloch-canvas');
    const picker = h('div.segmented', Array.from({ length: game.coins }, (_, q) =>
      h('button', {
        text: String(q + 1), dataset: { coin: q },
        'aria-pressed': String(q === currentCoin),
        onclick: () => { currentCoin = q; showTab('bloch'); }
      })));
    const info = h('div.small.dim');
    body.appendChild(h('div.panel.panel-pad', [
      h('div.row', [h('div.panel-title', { text: `Coin ${currentCoin + 1}` }), h('div.grow'), picker]),
      canvas,
      info
    ]));
    bloch = new BlochSphere(canvas, { theme: app.profile.equipped.bloch || 'default' });
    panel._blochInfo = info;
    body.appendChild(h('p.small.dim', {
      html: 'Drag to turn it. The poles are |0⟩ and |1⟩, the equator is an even coin toss, and going around the equator is the tilt. If the arrow is shorter than the sphere, this coin is entangled and has no state of its own — the missing length is exactly how much of it belongs to the pair.'
    }));
  }

  if (tab === 'state') {
    const out = h('div.col');
    body.appendChild(h('div.panel.panel-pad', [h('div.panel-title', { text: 'The state' }), out]));
    panel._state = out;
    body.appendChild(h('p.small.dim', {
      html: 'Everything the table shows comes from these numbers. Nothing is rounded for effect and nothing is faked.'
    }));
  }
}

function refresh() {
  if (!panel || !panel.classList.contains('open')) return;
  const game = panel._game;
  if (!game) return;
  const hero = game.hero();
  const st = hero.board || game.origin;

  if (panel.dataset.tab === 'circuit' && circuitView) {
    circuitView.set(hero.circuit);
    if (panel._qasm && hero.circuit) {
      const text = hero.circuit.toQasm();
      if (text !== panel._qasm.textContent) panel._qasm.textContent = text;
    }
  }

  if (panel.dataset.tab === 'bloch' && bloch) {
    const c = readCoin(st, currentCoin);
    bloch.set(c.bloch);
    if (panel._blochInfo) {
      panel._blochInfo.innerHTML =
        `<span class="mono">${c.ket}</span> &nbsp; P(1) = <span class="mono">${(c.up * 100).toFixed(1)}%</span>` +
        ` &nbsp; |r| = <span class="mono">${c.bloch.r.toFixed(3)}</span>` +
        (c.ent > 1e-6 ? ` &nbsp; <span style="color:var(--coin-linked)">entangled</span>` : '');
    }
  }

  if (panel.dataset.tab === 'state' && panel._state) {
    const dist = scoreDistribution(st);
    const links = findLinks(st);
    panel._state.innerHTML = '';
    const row = (k, v) => panel._state.appendChild(h('div.row', [
      h('span.small.dim', { text: k, style: { minWidth: '120px' } }),
      h('span.mono.small', { html: v })
    ]));
    row('state', st.toKet(5));
    row('norm', st.norm().toFixed(9));
    row('entropy', entropy(st).toFixed(3) + ' bits');
    row('expected', dist.reduce((s, p, i) => s + p * i, 0).toFixed(3) + ' ones');
    for (let q = 0; q < st.n; q++) {
      const c = readCoin(st, q);
      row(`coin ${q + 1}`, `${c.ket}  P(1)=${(c.up * 100).toFixed(1)}%  |r|=${c.bloch.r.toFixed(2)}`);
    }
    row('links', links.length ? links.map((l) => `${l.a + 1}↔${l.b + 1} (${l.same ? 'same' : 'opposite'})`).join(', ') : 'none');
    row('score odds', dist.map((p, i) => `${i}:${(p * 100).toFixed(0)}%`).join('  '));
    if (hero.circuit) row('circuit', summarise(hero.circuit));
  }
}
