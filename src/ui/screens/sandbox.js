/**
 * ui/screens/sandbox.js — the laboratory.
 *
 * Every card, unlimited, with undo, a live circuit, a Bloch sphere and the
 * full outcome distribution. No chips, no opponents, no clock. This is the
 * screen a lecturer would actually project.
 */
import { h, clear, copy } from '../dom.js';
import { icon } from '../../render/art.js';
import { cardEl } from '../components/card.js';
import { orbEl, updateOrb, drawLinks } from '../components/orb.js';
import { toast, errorToast } from '../toast.js';
import { SFX } from '../../audio/sfx.js';
import { loop } from '../../engine/loop.js';
import { bump } from '../../save/store.js';

import { QState } from '../../quantum/state.js';
import { Circuit, summarise } from '../../quantum/circuit.js';
import { CARDS, byRarity, playCard, legal } from '../../gameplay/cards.js';
import { dealBoard, readCoin, findLinks, findCorrelations, entropy, scoreDistribution } from '../../quantum/read.js';
import { BlochSphere } from '../../render/bloch.js';
import { CircuitView } from '../../render/circuit.js';
import { mulberry32 } from '../../utils/rng.js';
import { plan, SKILL, describeLine } from '../../gameplay/planner.js';

export const title = 'Sandbox';
export const mood = 'sandbox';
export const rebuild = true;

let box = null;

export function build(app) { box = new Sandbox(app); return box.root; }
export function enter(app) { box.enteredAt = Date.now(); }
export function leave(app) {
  if (!box) return;
  if (box.enteredAt) bump('totals.sandboxSeconds', Math.round((Date.now() - box.enteredAt) / 1000));
  box.destroy();
  app.checkAchievements();
}
export function key(e, app) {
  if (!box) return false;
  if (e.key === 'Escape') { if (box.selected) { box.clearSelection(); return true; } app.router.back(); return true; }
  if ((e.metaKey || e.ctrlKey) && e.key === 'z') { box.undo(); return true; }
  if (e.key === 'r') { box.randomise(); return true; }
  return false;
}

class Sandbox {
  constructor(app) {
    this.app = app;
    this.n = 5;
    this.rng = mulberry32(Date.now() & 0xffff);
    this.history = [];
    this.selected = null;
    this.targets = [];
    this.build();
    this.reset(new QState(this.n));
  }

  build() {
    this.boardEl = h('div.board');
    this.linkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.linkSvg.setAttribute('class', 'link-layer');
    this.paletteEl = h('div.palette');
    this.statsEl = h('div.col');
    this.distEl = h('div.dist-bars');
    this.hintEl = h('div.targeting-hint.hidden');
    const circuitCanvas = h('canvas.circuit-canvas', { style: { height: '200px' } });
    const blochCanvas = h('canvas.bloch-canvas', { style: { maxHeight: '190px' } });

    this.root = h('div.sandbox.grow', [
      h('div.sandbox-main', [
        h('div.row', { style: { padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--line)' } }, [
          h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back', onclick: () => this.app.router.back() }),
          h('h2', { text: 'Sandbox' }),
          h('div.grow'),
          h('button.btn.btn-sm', { text: 'Undo · ⌘Z', onclick: () => this.undo() }),
          h('button.btn.btn-sm', { text: 'Reset', onclick: () => this.reset(new QState(this.n)) }),
          h('button.btn.btn-sm', { text: 'Random · R', onclick: () => this.randomise() }),
          h('button.btn.btn-sm.btn-ghost', { text: 'Best line', onclick: () => this.suggest() })
        ]),
        h('div.felt.grow', [
          this.hintEl,
          h('div', { style: { position: 'relative' } }, [this.linkSvg, this.boardEl]),
          h('div.small.dim.center', { style: { maxWidth: '560px', textAlign: 'center' },
            text: 'Pick a card, then pick the coins it acts on. Nothing here costs anything and nothing is scored — the point is to see what the gates do.' })
        ]),
        h('div', { style: { padding: 'var(--s4)', borderTop: '1px solid var(--line)' } }, [
          h('div.panel-title', { text: 'Every card in the game' }),
          this.paletteEl
        ])
      ]),
      h('div.sandbox-side', [
        h('div.panel.panel-pad', [h('div.panel-title', { text: 'State' }), this.statsEl]),
        h('div.panel.panel-pad', [
          h('div.panel-title', { text: 'Chance of landing N ones' }), this.distEl
        ]),
        h('div.panel.panel-pad', [h('div.panel-title', { text: 'Bloch sphere' }), this.blochPicker(), blochCanvas]),
        h('div.panel.panel-pad', [
          h('div.row', [
            h('div.panel-title', { text: 'Circuit' }),
            h('div.grow'),
            h('button.btn.btn-sm.btn-ghost', {
              text: 'QASM', onclick: async () => {
                const ok = await copy(this.circuit.toQasm());
                toast({ icon: ok ? '✓' : '!', body: ok ? 'OpenQASM copied.' : 'Could not copy.' });
              }
            })
          ]),
          circuitCanvas
        ])
      ])
    ]);

    this.bloch = new BlochSphere(blochCanvas, { theme: this.app.profile.equipped.bloch || 'default' });
    this.circuitView = new CircuitView(circuitCanvas);
    this.currentCoin = 0;
    this.renderPalette();
    this.renderBoard();
    this.tick = loop.add(() => {
      drawLinks(this.linkSvg, this.orbs, findLinks(this.state), findCorrelations(this.state, 0.1));
      this.bloch.set(readCoin(this.state, this.currentCoin).bloch);
    }, 'sandbox');
  }

  destroy() {
    if (this.tick) this.tick();
    if (this.bloch) this.bloch.destroy();
    if (this.circuitView) this.circuitView.destroy();
  }

  blochPicker() {
    const seg = h('div.segmented', { style: { marginBottom: 'var(--s2)' } },
      Array.from({ length: this.n }, (_, q) => h('button', {
        text: String(q + 1), 'aria-pressed': String(q === 0),
        onclick: (e) => {
          this.currentCoin = q;
          for (const b of seg.children) b.setAttribute('aria-pressed', String(b === e.target));
        }
      })));
    return seg;
  }

  renderPalette() {
    clear(this.paletteEl);
    const groups = byRarity();
    for (const rarity of ['common', 'rare', 'epic', 'legendary']) {
      for (const id of groups[rarity]) {
        this.paletteEl.appendChild(cardEl(id, { mini: true, onPick: () => this.select(id) }));
      }
    }
  }

  renderBoard() {
    clear(this.boardEl);
    this.orbs = [];
    for (let q = 0; q < this.n; q++) {
      const el = orbEl(q, { onPick: (i) => this.pick(i) });
      this.boardEl.appendChild(el);
      this.orbs.push(el);
    }
  }

  reset(state) {
    this.state = state;
    this.circuit = new Circuit(this.n, state);
    this.history = [];
    this.clearSelection();
    this.refresh();
    SFX.back();
  }

  randomise() {
    this.reset(dealBoard(this.rng, this.n, { tiltChance: 0.3, pairBias: 0.2 }));
    SFX.deal(0);
  }

  select(id) {
    if (this.selected === id) { this.clearSelection(); return; }
    this.selected = id;
    this.targets = [];
    const card = CARDS[id];
    if (card.arity === 0) { this.apply(); return; }
    this.hintEl.textContent = `${card.name}: choose ${card.pick[0]}`;
    this.hintEl.classList.remove('hidden');
    for (const o of this.orbs) o.classList.add('targetable');
  }

  clearSelection() {
    this.selected = null;
    this.targets = [];
    this.hintEl.classList.add('hidden');
    for (const o of this.orbs) o.classList.remove('targetable', 'chosen');
  }

  pick(q) {
    if (!this.selected) { this.currentCoin = q; return; }
    if (this.targets.includes(q)) { errorToast('Pick a different coin.'); return; }
    this.targets.push(q);
    this.orbs[q].classList.add('chosen');
    const card = CARDS[this.selected];
    if (this.targets.length >= card.arity) this.apply();
    else this.hintEl.textContent = `${card.name}: choose ${card.pick[this.targets.length]}`;
  }

  apply() {
    const id = this.selected, targets = this.targets.slice();
    const check = legal(id, targets, this.state);
    if (!check.ok) { errorToast(check.why); this.clearSelection(); return; }
    this.history.push({ state: this.state.clone(), ops: this.circuit.ops.length });
    try {
      playCard(id, targets, {
        state: this.state, circuit: this.circuit, rng: this.rng,
        player: { noiseLog: [], rewindLast: () => null }, game: null
      });
    } catch (e) { errorToast(e.message); }
    SFX.gate(id);
    const c = targets.length ? this.orbs[targets[0]] : this.orbs[0];
    if (c) {
      const r = c.getBoundingClientRect();
      this.app.particles.burst(r.left + r.width / 2, r.top + r.height / 2, [110, 231, 255], 18, 170);
    }
    this.clearSelection();
    this.refresh();
    bump('totals.gates');
    bump('gateCounts.' + id);
  }

  undo() {
    const last = this.history.pop();
    if (!last) { toast({ icon: '↶', body: 'Nothing to undo.' }); return; }
    this.state = last.state;
    this.circuit.ops.length = last.ops;
    this.clearSelection();
    this.refresh();
    SFX.back();
  }

  suggest() {
    const hand = ['X', 'H', 'Z', 'CX'];
    const r = plan(this.state, hand, { skill: SKILL.perfect });
    toast({
      icon: '◉', title: 'With Flip, Spin, Twist and Link',
      body: describeLine(r.line) + ` Expected ${r.value.toFixed(2)} ones.`,
      tone: 'var(--warn)', duration: 7000
    });
  }

  refresh() {
    for (let q = 0; q < this.n; q++) updateOrb(this.orbs[q], this.state, q, { showKets: true });
    this.circuitView.set(this.circuit);

    const dist = scoreDistribution(this.state);
    clear(this.distEl);
    const max = Math.max(...dist);
    dist.forEach((p, i) => {
      this.distEl.appendChild(h('div.col', { style: { flex: '1', justifyContent: 'flex-end', alignItems: 'center', gap: '2px' } }, [
        h('span.tick', { text: p > 0.005 ? Math.round(p * 100) + '' : '' }),
        h('i', { style: { height: (max > 0 ? p / max * 100 : 0) + '%' } }),
        h('span.tick', { text: String(i) })
      ]));
    });

    clear(this.statsEl);
    const line = (k, v) => this.statsEl.appendChild(h('div.row', [
      h('span.small.dim', { text: k, style: { minWidth: '92px' } }),
      h('span.mono.small', { text: v })
    ]));
    line('state', this.state.toKet(4));
    line('norm', this.state.norm().toFixed(9));
    line('entropy', entropy(this.state).toFixed(3) + ' bits');
    line('expected', dist.reduce((s, p, i) => s + p * i, 0).toFixed(3));
    line('circuit', summarise(this.circuit));
    const links = findLinks(this.state);
    line('links', links.length ? links.map((l) => `${l.a + 1}↔${l.b + 1}`).join(' ') : 'none');
  }
}
