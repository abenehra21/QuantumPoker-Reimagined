/**
 * ui/screens/table.js — the game.
 *
 * This screen owns the presentation of a hand: it drains the events the
 * engine emits and turns each one into motion, sound and light, one at a
 * time, with the game paused in between. That queue is the single most
 * important thing in the file: without it a bot's three actions would all
 * land on the same frame and the table would look like a spreadsheet.
 */
import { h, $, $$, clear, num, pct, centreOf, pulse, copy, nextFrame } from '../dom.js';
import { icon, chipArt } from '../../render/art.js';
import { cardEl, dealIn } from '../components/card.js';
import { orbEl, updateOrb, drawLinks, collapseOrb, strikeOrb } from '../components/orb.js';
import { seatEl, updateSeat, say, markWinner } from '../components/seat.js';
import { toast, errorToast } from '../toast.js';
import { SFX } from '../../audio/sfx.js';
import { music } from '../../audio/music.js';
import { wait, scale } from '../../engine/tween.js';
import { loop } from '../../engine/loop.js';

import { Run } from '../../gameplay/run.js';
import { MODES } from '../../gameplay/modes.js';
import { CARDS, legal, RARITY, simulateCard } from '../../gameplay/cards.js';
import { SKILL } from '../../gameplay/planner.js';
import { step as botStep, strength } from '../../ai/brain.js';
import { speak, DEALER } from '../../ai/dialogue.js';
import { findLinks, findCorrelations, readCoin, entropy, scoreDistribution } from '../../quantum/read.js';
import { openResults } from './results.js';
import { openInspector } from './inspector.js';
import { recordDaily, bump, raise, flag, saveRun, clearRun } from '../../save/store.js';

export const title = 'Table';
export const mood = 'table';
export const rebuild = true;   // a new table every time; the run carries state

let ui = null;

export function build(app, opts) {
  ui = new TableUI(app, opts);
  // Exposed so the screenshot tool and the developer overlay can drive the
  // table the way a player does, rather than poking the engine underneath
  // it and leaving the view showing a hand that already finished.
  app.table = ui;
  return ui.root;
}

export function enter(app, opts) {
  if (ui) ui.start(opts);
}

export function leave(app) {
  if (ui) ui.teardown();
  if (app.table === ui) app.table = null;
}

export function key(e, app) {
  return ui ? ui.key(e) : false;
}

class TableUI {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts || {};
    this.selected = null;       // the card being played
    this.targets = [];          // coins chosen so far
    this.busy = false;          // an animation is running; input is refused
    this.queue = [];
    this.orbs = [];
    this.seatEls = [];
    this.build();
  }

  /* ================= construction ================= */

  build() {
    this.messageEl = h('div.message-bar');
    this.dealerEl2 = h('div.dealer-line');
    this.potEl = h('div.pot', [h('span', { text: '0' })]);
    this.streetEl = h('div.street-name', { text: 'Deal' });
    this.dotsEl = h('div.street-dots', [0, 1, 2, 3].map(() => h('i')));
    this.boardEl = h('div.board');
    this.linkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.linkSvg.setAttribute('class', 'link-layer');
    this.seatsEl = h('div.seats-row');
    this.handEl = h('div.hand-row', { role: 'group', 'aria-label': 'Your cards' });
    this.actionsEl = h('div.actions');
    this.targetHintEl = h('div.targeting-hint.hidden');
    this.runInfoEl = h('div.row.small.dim');

    this.feltEl = h('div.felt', [
      this.targetHintEl,
      this.seatsEl,
      h('div', { style: { position: 'relative' } }, [this.linkSvg, this.boardEl]),
      h('div.pot-area', [
        h('div.caps.dim', { text: 'Pot' }),
        this.potEl,
        this.dealerEl = h('div.dealer-button', { text: 'D', title: 'Dealer button' })
      ])
    ]);

    this.root = h('div.table-screen', [
      h('div.table-top', [
        h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Leave the table',
          onclick: () => this.confirmLeave() }),
        h('div', [this.streetEl, this.dotsEl]),
        h('div.grow'),
        this.runInfoEl,
        h('div.grow'),
        h('button.btn.btn-icon.btn-ghost', { html: icon('hint'), 'aria-label': 'Hint (H)', title: 'Hint · H',
          onclick: () => this.hint() }),
        h('button.btn.btn-icon.btn-ghost', { html: icon('circuit'), 'aria-label': 'Circuit view (C)', title: 'Circuit · C',
          onclick: () => this.inspect('circuit') }),
        h('button.btn.btn-icon.btn-ghost', { html: icon('sphere'), 'aria-label': 'Bloch sphere (B)', title: 'Bloch sphere · B',
          onclick: () => this.inspect('bloch') }),
        h('button.btn.btn-icon.btn-ghost', { html: icon('psi'), 'aria-label': 'Readout (P)', title: 'Readout · P',
          onclick: () => this.togglePsi() })
      ]),
      this.feltEl,
      h('div', [
        this.dealerEl2,
        this.messageEl,
        h('div.table-bottom', [this.handEl, this.actionsEl])
      ])
    ]);
  }

  /* ================= lifecycle ================= */

  start(opts) {
    const o = Object.assign({}, this.opts, opts);
    const mode = MODES[o.mode] || MODES.student;
    this.mode = mode;

    if (mode.key === 'daily') {
      const { today } = { today: () => Math.floor(Date.now() / 864e5) };
      o.seed = o.seed === undefined ? Math.floor(Date.now() / 864e5) : o.seed;
    }

    this.run = o.run || new Run({ mode: mode.key, seed: o.seed, heroName: this.app.profile.name || 'You' });
    this.app.run = this.run;
    this.app.accent(mode.accent);
    this.game = this.run.nextRound();
    this.app.game = this.game;

    if (this.run.boss) this.announceBoss();
    this.renderAll();
    this.pump();
  }

  teardown() {
    this.queue.length = 0;
    if (this.linkTick) { this.linkTick(); this.linkTick = null; }
    this.app.game = null;
  }

  confirmLeave() {
    SFX.back();
    if (this.run && !this.run.over && this.run.round > 0) saveRun(this.run.snapshot());
    this.app.accent();
    this.app.router.go('menu');
  }

  /**
   * The dealer. Not a personality, a narrator: it says what this part of the
   * hand is *for*, in the plainest words available. It is the single most
   * useful teaching device in the game, because it arrives at the moment the
   * player needs it and never asks to be read.
   */
  deal_say(text) {
    if (!text || text === this.lastDealerLine) return;
    this.lastDealerLine = text;
    clear(this.dealerEl2);
    this.dealerEl2.appendChild(h('span.dealer-who', { text: 'Dealer' }));
    this.dealerEl2.appendChild(h('span', { text }));
    pulse(this.dealerEl2, 'live', 700);
  }

  /* ================= rendering ================= */

  renderAll() {
    this.renderSeats();
    this.renderBoard();
    this.renderHand();
    this.renderActions();
    this.renderTop();
    this.renderLinks();
  }

  renderTop() {
    const g = this.game, r = this.run;
    this.streetEl.textContent = g.street();
    $$('i', this.dotsEl).forEach((d, i) => d.classList.toggle('on', i <= g.round));
    this.potEl.firstChild.textContent = num(g.potTotal());

    clear(this.runInfoEl);
    const items = [
      `Round ${r.round}`,
      `Hand ${g.handNo}/${this.mode.handsPerRound || this.mode.maxHands || '∞'}`,
      `Blinds ${g.smallBlind}/${g.bigBlind}`
    ];
    if (r.target) items.push(`Keep ${num(r.target)}`);
    if (r.boss) items.push(`BOSS: ${r.boss.name}`);
    for (const t of items) this.runInfoEl.appendChild(h('span.pill', { text: t }));
    if (this.game.noise && this.game.noise.active) {
      this.runInfoEl.appendChild(h('span.badge.warn', { text: this.game.noise.label }));
    }
  }

  renderSeats() {
    clear(this.seatsEl);
    this.seatEls = this.game.players.map((p) => {
      const el = seatEl(p, { boss: this.run.boss && p.bot && p.bot.key === this.run.boss.persona.key });
      this.seatsEl.appendChild(el);
      return el;
    });
    this.updateSeats();
  }

  updateSeats() {
    this.game.players.forEach((p, i) => updateSeat(this.seatEls[i], p, this.game));
  }

  renderBoard() {
    clear(this.boardEl);
    this.orbs = [];
    for (let q = 0; q < this.game.coins; q++) {
      const el = orbEl(q, { onPick: (i) => this.pickCoin(i) });
      el.addEventListener('pointerenter', () => this.previewOn(q, el));
      el.addEventListener('pointerleave', () => this.previewOff());
      this.boardEl.appendChild(el);
      this.orbs.push(el);
    }
    this.updateBoard();
    if (!this.linkTick) {
      // Link arcs are geometry, so they have to follow the layout every frame
      // rather than only when the state changes.
      this.linkTick = loop.add(() => this.renderLinks(), 'links');
    }
  }

  /** Whose board is on the table right now: yours, always. */
  viewBoard() {
    const hero = this.game.hero();
    return hero.board || this.game.origin;
  }

  updateBoard() {
    const st = this.viewBoard();
    const hero = this.game.hero();
    const frozen = hero.status.frozenCoins();
    const showAll = this.game.phase === 'gates' || this.game.phase === 'showdown' || this.game.phase === 'over';
    for (let q = 0; q < this.orbs.length; q++) {
      const el = this.orbs[q];
      const revealed = showAll || q < this.game.revealed;
      el.classList.toggle('unrevealed', !revealed);
      if (revealed) {
        updateOrb(el, st, q, {
          hideProbabilities: this.game.hideProbabilities && !hero.status.has('oracle'),
          showKets: this.app.settings.showKets
        });
      }
      el.classList.toggle('dimmed', frozen.includes(q));
      el.classList.toggle('targetable', !!this.selected && revealed && !frozen.includes(q));
      el.classList.toggle('chosen', this.targets.includes(q));
    }
  }

  renderLinks() {
    // Only ever draw an arc between two coins the player can already see.
    // A link to a face-down coin would leak the board a street early, and
    // the engine's `revealed` count runs ahead of the flip animation.
    const shown = this.orbs.reduce((n, el, i) => el.classList.contains('unrevealed') ? n : i + 1, 0);
    if (shown < 2) { clear(this.linkSvg); return; }
    const visible = (l) => l.a < shown && l.b < shown;
    const st = this.viewBoard();
    drawLinks(this.linkSvg, this.orbs,
      findLinks(st).filter(visible), findCorrelations(st, 0.1).filter(visible));
  }

  renderHand() {
    clear(this.handEl);
    const hero = this.game.hero();
    const playable = this.game.phase === 'gates' && this.game.actor === hero.seat;
    hero.hand.forEach((id, i) => {
      const el = cardEl(id, {
        onPick: playable ? () => this.selectCard(id, el) : null,
        focusable: playable
      });
      if (!playable) el.classList.add('idle');
      if (this.selected && this.selected.el === el) el.classList.add('selected');
      this.handEl.appendChild(el);
      if (this.dealtHand !== this.game.handNo) dealIn(el, i);
    });
    this.dealtHand = this.game.handNo;
    if (!hero.hand.length && playable) {
      this.handEl.appendChild(h('div.dim.small.center', {
        style: { minHeight: '150px' }, text: 'No cards left. End your turn.'
      }));
    }
  }

  renderActions() {
    clear(this.actionsEl);
    const g = this.game, hero = g.hero();
    const mine = g.actor === hero.seat && !hero.out && !hero.folded;

    if (g.phase === 'over') {
      this.actionsEl.appendChild(h('button.btn.btn-primary.btn-block', {
        text: this.run.over ? 'See how it went' : 'Next hand',
        onclick: () => this.afterHand()
      }));
      return;
    }

    if (!mine) {
      const who = g.current();
      this.actionsEl.appendChild(h('div.dim.small.center', {
        style: { minHeight: '84px' },
        text: who ? `${who.name} is thinking…` : 'Dealing…'
      }));
      return;
    }

    if (g.phase === 'betting') this.renderBetting(hero);
    else if (g.phase === 'gates') this.renderGatePhase(hero);
  }

  renderBetting(hero) {
    const g = this.game;
    const toCall = g.toCall(hero.seat);
    const minTo = g.minRaiseTo(hero.seat);
    const maxTo = g.maxRaiseTo(hero.seat);
    const canRaise = maxTo > g.currentBet;

    const amount = h('div.bet-amount', { text: num(minTo) });
    const slider = h('input.slider', {
      type: 'range', min: minTo, max: maxTo, value: minTo, step: Math.max(1, Math.round(g.bigBlind / 2)),
      'aria-label': 'Raise to',
      oninput: (e) => {
        amount.textContent = num(e.target.value);
        e.target.style.setProperty('--pct', ((e.target.value - minTo) / Math.max(1, maxTo - minTo) * 100) + '%');
      }
    });

    this.actionsEl.appendChild(h('div.row', [
      h('button.btn.btn-danger.grow', { text: 'Fold', onclick: () => this.act('fold') }),
      h('button.btn.grow', {
        text: toCall === 0 ? 'Check' : `Call ${num(toCall)}`,
        onclick: () => this.act('call')
      })
    ]));

    if (canRaise) {
      this.actionsEl.appendChild(h('div.bet-row', [
        slider,
        amount,
        h('button.btn.btn-primary', {
          text: 'Raise', onclick: () => this.act('raise', Number(slider.value))
        })
      ]));
      this.actionsEl.appendChild(h('div.row', [
        ...[['½ pot', 0.5], ['pot', 1], ['2×', 2]].map(([label, mul]) =>
          h('button.btn.btn-sm.btn-ghost.grow', {
            text: label,
            onclick: () => {
              const v = Math.max(minTo, Math.min(maxTo, Math.round(g.currentBet + g.potTotal() * mul)));
              slider.value = v; amount.textContent = num(v);
            }
          })),
        h('button.btn.btn-sm.btn-ghost.grow', {
          text: 'All in', onclick: () => this.act('raise', maxTo)
        })
      ]));
    }

    this.actionsEl.appendChild(h('div.tiny.dim.center', {
      text: `${num(hero.chips)} behind · pot ${num(g.potTotal())}`
    }));
  }

  renderGatePhase(hero) {
    const rows = [];
    if (this.selected) {
      rows.push(h('button.btn.btn-ghost.btn-block', {
        text: 'Cancel · Esc', onclick: () => this.clearSelection()
      }));
    } else {
      rows.push(h('div.row', [
        h('button.btn.grow', { html: icon('hint') + '<span>Hint</span>', onclick: () => this.hint() }),
        h('button.btn.btn-primary.grow', { text: 'Done', onclick: () => this.endTurn() })
      ]));
    }
    const st = hero.board;
    const dist = scoreDistribution(st);
    rows.push(h('div.tiny.dim.center', {
      text: `expected ${dist.reduce((s, p, i) => s + p * i, 0).toFixed(2)} ones · ` +
            `${(dist[5] * 100).toFixed(0)}% Coherence · ${entropy(st).toFixed(1)} bits left`
    }));
    for (const r of rows) this.actionsEl.appendChild(r);
  }

  /* ================= input ================= */

  selectCard(id, el) {
    if (this.busy) return;
    if (this.selected && this.selected.id === id) { this.clearSelection(); return; }
    this.selected = { id, el };
    this.targets = [];
    $$('.card', this.handEl).forEach((c) => c.classList.remove('selected'));
    el.classList.add('selected');
    const card = CARDS[id];
    if (card.arity === 0) { this.commit(); return; }
    this.showTargetHint();
    this.updateBoard();
    this.renderActions();
  }

  clearSelection() {
    this.selected = null;
    this.targets = [];
    $$('.card', this.handEl).forEach((c) => c.classList.remove('selected'));
    this.targetHintEl.classList.add('hidden');
    this.previewOff();
    this.updateBoard();
    this.renderActions();
  }

  showTargetHint() {
    const card = CARDS[this.selected.id];
    const which = card.pick[this.targets.length] || 'a coin';
    this.targetHintEl.textContent = `${card.name}: choose ${which}`;
    this.targetHintEl.classList.remove('hidden');
  }

  pickCoin(q) {
    if (this.busy || !this.selected) return;
    const hero = this.game.hero();
    if (hero.status.frozenCoins().includes(q)) { errorToast('That coin is frozen.'); return; }
    if (this.targets.includes(q)) { errorToast('Pick a different coin.'); return; }
    this.targets.push(q);
    SFX.click();
    const card = CARDS[this.selected.id];
    if (this.targets.length >= card.arity) this.commit();
    else { this.showTargetHint(); this.updateBoard(); }
  }

  commit() {
    const id = this.selected.id;
    const targets = this.targets.slice();
    const check = legal(id, targets, this.game.hero().board);
    if (!check.ok) { errorToast(check.why); this.clearSelection(); return; }
    const res = this.game.playCard(id, targets);
    if (!res.ok) { errorToast(res.why); this.clearSelection(); return; }
    this.clearSelection();
    this.recordPlay(id, res);
    this.pump();
  }

  recordPlay(id, res) {
    bump('totals.gates');
    bump('gateCounts.' + id);
    if (res.outcomes && res.outcomes.length) bump('totals.collapses');
    const links = findLinks(this.game.hero().board);
    if (links.length) bump('totals.links');
    if (links.length >= 2 || (links.length && this.game.coins === 5 &&
        findLinks(this.game.hero().board).length * 2 >= this.game.coins - 1)) flag('ghz');
    if (id === 'TELEPORT') flag('teleport');
  }

  act(kind, amount) {
    if (this.busy) return;
    const g = this.game, seat = g.actor;
    const s = strength(g, seat);
    this.run.watcher.record(kind, s);
    g.heroProfile = this.run.watcher.profile;
    if (kind === 'fold') { g.fold(); bump('totals.folds'); }
    else if (kind === 'call') { g.call(); bump('totals.calls'); }
    else {
      const r = g.raiseTo(amount);
      if (!r.ok) { errorToast(r.why); return; }
      bump('totals.raises');
      if (s < 0.45) this.bluffing = true;
    }
    this.pump();
  }

  endTurn() {
    if (this.busy) return;
    this.clearSelection();
    this.game.endTurn();
    this.pump();
  }

  hint() {
    if (this.busy) return;
    const g = this.game;
    if (g.phase === 'gates' && g.actor === g.hero().seat) {
      const hint = g.hint(g.hero().seat, SKILL.perfect);
      this.run.usedHint = true;
      if (!hint) { toast({ icon: '✓', body: 'Nothing left to play would help. Press Done.' }); return; }
      toast({ icon: '◉', title: 'Best line', body: hint.text, tone: 'var(--warn)', duration: 5200 });
      const el = $$('.card', this.handEl).find((c) => c.dataset.card === hint.card);
      if (el) { pulse(el, 'selected', 1400); }
      for (const t of hint.targets) pulse(this.orbs[t], 'targetable', 1400);
      return;
    }
    if (g.phase === 'betting') {
      const s = strength(g, g.hero().seat);
      const toCall = g.toCall(g.hero().seat);
      const odds = toCall / (g.potTotal() + toCall || 1);
      toast({
        icon: '◉', title: 'The arithmetic',
        body: `Your hand rates ${(s * 100).toFixed(0)} against this table. Calling costs ${num(toCall)}, which needs ${(odds * 100).toFixed(0)}% to break even. ${s > odds + 0.05 ? 'Calling is profitable.' : s < odds - 0.05 ? 'Folding is cheaper.' : 'It is close to even.'}`,
        tone: 'var(--warn)', duration: 6500
      });
    }
  }

  inspect(tab) {
    openInspector(this.app, this.game, tab);
  }

  togglePsi() {
    this.app.set('showKets', !this.app.settings.showKets);
    this.updateBoard();
    toast({ icon: 'Ψ', body: this.app.settings.showKets ? 'Kets shown on every coin' : 'Kets hidden' });
  }

  /* --- the hover preview: what will this card do, before you commit --- */

  previewOn(q, el) {
    if (!this.selected) return;
    const card = CARDS[this.selected.id];
    const targets = this.targets.concat([q]);
    if (targets.length !== card.arity) return;
    const hero = this.game.hero();
    if (!legal(this.selected.id, targets, hero.board).ok) return;

    const before = hero.board;
    const after = before.clone();
    let text;
    try { text = this.describeEffect(before, after, this.selected.id, targets); }
    catch (e) { return; }
    if (!text) return;

    this.previewOff();
    const r = el.getBoundingClientRect();
    const host = this.feltEl.getBoundingClientRect();
    this.previewEl = h('div.preview-chip', { html: text });
    this.previewEl.style.left = (r.left - host.left + r.width / 2 - 70) + 'px';
    this.previewEl.style.top = (r.bottom - host.top + 26) + 'px';
    this.feltEl.appendChild(this.previewEl);
  }

  /**
   * What this card would do, before you commit to it. Runs the card on a
   * copy of the board using the planner's side-effect-free path, and reports
   * the difference in plain numbers.
   */
  describeEffect(before, after, id, targets) {
    simulateCard(after, id, targets, () => 0.5);
    const d = [];
    for (let q = 0; q < before.n; q++) {
      const a = before.probOne(q), b = after.probOne(q);
      if (Math.abs(a - b) > 1e-6) {
        d.push(`coin ${q + 1} ${pct(a)} <span class="${b > a ? 'up' : 'down'}">→ ${pct(b)}</span>`);
      }
    }
    const linksBefore = findLinks(before).length, linksAfter = findLinks(after).length;
    if (linksAfter > linksBefore) d.push('<span class="up">creates a link</span>');
    if (linksAfter < linksBefore) d.push('<span class="down">breaks a link</span>');
    if (!d.length) {
      const same = before.same(after);
      d.push(same ? '<span class="down">nothing changes</span>' : 'changes the tilt only');
    }
    return d.join(' · ');
  }

  previewOff() {
    if (this.previewEl) { this.previewEl.remove(); this.previewEl = null; }
  }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape' && this.selected) { this.clearSelection(); return true; }
    if (this.busy) return false;
    const g = this.game;
    const mine = g.actor === g.hero().seat;

    if (k === 'h') { this.hint(); return true; }
    if (k === 'c') { this.inspect('circuit'); return true; }
    if (k === 'b') { this.inspect('bloch'); return true; }
    if (k === 'p') { this.togglePsi(); return true; }

    if (!mine) return false;
    if (g.phase === 'betting') {
      if (k === 'f') { this.act('fold'); return true; }
      if (k === ' ' || k === 'enter' || k === 'c') { this.act('call'); return true; }
    }
    if (g.phase === 'gates') {
      if (k === 'enter') { this.endTurn(); return true; }
      const n = parseInt(k, 10);
      if (n >= 1 && n <= 9) {
        if (this.selected) { this.pickCoin(n - 1); return true; }
        const cards = $$('.card', this.handEl);
        if (cards[n - 1]) { cards[n - 1].click(); return true; }
      }
    }
    if (g.phase === 'over' && (k === ' ' || k === 'enter')) { this.afterHand(); return true; }
    return false;
  }

  /* ================= the event pump ================= */

  /**
   * Drain the engine's events one at a time, animating each, then let the
   * bots act. Everything that makes the table feel alive is a case here.
   */
  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      let guard = 0;
      while (guard++ < 400) {
        const events = this.game.drain();
        for (const ev of events) await this.animate(ev);

        this.updateSeats();
        this.updateBoard();
        this.renderTop();
        this.renderActions();

        const p = this.game.current();
        if (this.game.phase === 'over') break;
        if (!p || !p.bot) break;

        await wait(420 + Math.random() * 380);
        const decision = botStep(this.game);
        if (decision && decision.line) {
          const line = speak(p.bot, decision.line === 'raise' ? 'raise' : decision.line, this.game.rng);
          if (line) say(this.seatEls[p.seat], line);
        }
        if (decision && decision.action === 'cards') await wait(260);
      }
    } finally {
      this.busy = false;
      this.updateSeats();
      this.updateBoard();
      this.renderHand();
      this.renderActions();
      this.renderTop();
    }
  }

  async animate(ev) {
    const app = this.app, P = app.particles, V = app.vfx;
    const seatEl = ev.seat !== undefined ? this.seatEls[ev.seat] : null;

    switch (ev.type) {
      case 'handStart':
        this.dealtHand = -1;
        this.renderHand();
        this.deal_say(DEALER.street(0, 0));
        music.set('table');
        await wait(220);
        break;

      case 'street': {
        SFX.street(ev.round);
        this.streetEl.textContent = this.game.street();
        this.deal_say(DEALER.street(ev.round, ev.revealed));
        for (let q = 0; q < ev.revealed; q++) {
          const el = this.orbs[q];
          if (!el.classList.contains('unrevealed')) continue;
          el.classList.remove('unrevealed');
          el.classList.add('flipping');
          updateOrb(el, this.viewBoard(), q, { showKets: app.settings.showKets });
          const c = centreOf(el);
          P.puff(c.x, c.y, [110, 231, 255], 14);
          SFX.deal(q);
          await wait(200);
          el.classList.remove('flipping');
        }
        if (this.run.chaosArmed) { this.run.fireChaos(); }
        music.set(this.game.round >= 2 ? 'tension' : 'table');
        break;
      }

      case 'call': case 'check':
        SFX.chip(ev.amount ? 3 : 1);
        if (ev.amount) this.flyChips(seatEl, 2);
        break;

      case 'raise':
        SFX.chip(4);
        this.flyChips(seatEl, 4);
        V.shake(4);
        break;

      case 'allin':
        SFX.allin();
        V.shake(12); V.chroma(2.5);
        V.shout('ALL IN', 'rose');
        this.flyChips(seatEl, 8);
        music.set('tension');
        await wait(600);
        break;

      case 'fold':
        SFX.fold();
        if (seatEl) seatEl.classList.add('folded');
        break;

      case 'gatePhase':
        music.set('cards');
        this.streetEl.textContent = 'Card phase';
        this.deal_say(DEALER.gatePhase);
        V.shout('CARD PHASE', 'violet');
        for (let q = 0; q < this.orbs.length; q++) {
          this.orbs[q].classList.remove('unrevealed');
          updateOrb(this.orbs[q], this.viewBoard(), q, { showKets: app.settings.showKets });
        }
        this.renderHand();
        await wait(700);
        break;

      case 'play':
        await this.animatePlay(ev);
        break;

      case 'draw':
        this.renderHand();
        SFX.deal(0);
        break;

      case 'noise':
        for (const n of ev.events) {
          if (n.seat !== this.game.hero().seat) continue;
          const el = this.orbs[n.q];
          if (!el) continue;
          strikeOrb(el);
          const c = centreOf(el);
          P.shatter(c.x, c.y, [251, 113, 133], 10);
          SFX.noiseHit();
          V.shake(5); V.chroma(1.6);
          this.game.hero().noiseLog.push(n);
        }
        if (ev.events.some((n) => n.seat === this.game.hero().seat)) {
          this.deal_say(DEALER.explain.noise);
          await wait(320);
        }
        break;

      case 'chaos':
        SFX.boss();
        V.shout(ev.name.toUpperCase(), 'violet');
        V.flash('rgba(192,132,252,.3)', 500);
        V.shake(10);
        toast({ icon: ev.icon, title: ev.name, body: ev.blurb, tone: 'var(--epic)', duration: 5000 });
        this.updateBoard();
        await wait(800);
        break;

      case 'freeze': {
        const el = this.orbs[ev.coin];
        if (el) { const c = centreOf(el); P.burst(c.x, c.y, [125, 211, 252], 18, 130); }
        SFX.freeze();
        break;
      }

      case 'kickback':
        SFX.gate('Z');
        break;

      case 'measure':
        if (ev.seat === this.game.hero().seat) {
          for (let q = 0; q < ev.bits.length; q++) {
            const el = this.orbs[q];
            updateOrb(el, this.game.hero().board, q, { showKets: app.settings.showKets });
            collapseOrb(el, ev.bits[q]);
            const c = centreOf(el);
            if (ev.bits[q]) P.burst(c.x, c.y, [74, 222, 128], 18, 170);
            await wait(150);
          }
        }
        break;

      case 'secondLife':
        SFX.legendary();
        V.shout('STILL IN THE BOX', 'gold');
        toast({ icon: '◐', title: 'Schrödinger’s Chip', body: 'You were both out and not out. Back in.', tone: 'var(--legendary)', duration: 6000 });
        await wait(900);
        break;

      case 'bust':
        if (seatEl) seatEl.classList.add('out');
        SFX.lose();
        break;

      case 'handOver':
        await this.showdown(ev.results);
        break;

      default:
        break;
    }
  }

  async animatePlay(ev) {
    const P = this.app.particles, V = this.app.vfx;
    const card = CARDS[ev.card];
    const hero = this.game.hero();
    const last = hero.plays[hero.plays.length - 1];
    const before = last && last.card === ev.card ? last.before : null;
    const rarity = RARITY[card.rarity];
    const colour = hexToRgb(rarity.tint);

    if (ev.seat !== this.game.hero().seat) {
      // Someone else played. A flicker on their seat is enough.
      const el = this.seatEls[ev.seat];
      if (el) { pulse(el, 'acting', 400); }
      SFX.gate(ev.card);
      await wait(180);
      return;
    }

    SFX.gate(ev.card);
    if (card.rarity === 'legendary') { SFX.legendary(); V.shout(card.name.toUpperCase(), 'gold'); V.shake(14); V.chroma(3); }
    else if (card.rarity === 'epic') { V.shake(7); V.chroma(1.5); }

    // The gate flies into each coin it touches.
    const spots = (ev.targets.length ? ev.targets : this.orbs.map((_, i) => i))
      .map((q) => ({ q, el: this.orbs[q] })).filter((s) => s.el);

    if (ev.targets.length === 2 && this.orbs[ev.targets[0]] && this.orbs[ev.targets[1]]) {
      const a = centreOf(this.orbs[ev.targets[0]]);
      const b = centreOf(this.orbs[ev.targets[1]]);
      P.beam(a.x, a.y, b.x, b.y, colour, 1.6);
      SFX.entangle();
    }

    for (const s of spots) {
      const c = centreOf(s.el);
      P.burst(c.x, c.y, colour, card.rarity === 'legendary' ? 40 : 22, card.rarity === 'legendary' ? 320 : 200);
      strikeOrb(s.el);
    }

    this.updateBoard();
    this.renderHand();

    if (ev.note) toast({ icon: card.symbol, body: ev.note, tone: rarity.tint });

    // The dealer explains the concept the moment the player first causes it.
    const taught = this.conceptFor(ev.card, before, this.game.hero().board);
    if (taught) this.deal_say(DEALER.explain[taught]);
    if (ev.fx) this.bigEffect(ev.fx);

    await wait(card.rarity === 'legendary' ? 700 : 340);
  }

  /**
   * Which idea did that card just demonstrate? Decided from what actually
   * changed on the board, not from the card's name, so Link only teaches
   * entanglement on the plays that genuinely entangle something.
   */
  conceptFor(id, before, after) {
    if (!before || !after) return null;
    const was = findLinks(before).length, now = findLinks(after).length;
    if (now > was) return 'entangle';
    if (id === 'M' || id === 'MEASUREX' || id === 'ZENO' || id === 'RESET') return 'collapse';
    for (let q = 0; q < after.n; q++) {
      const a = before.probOne(q), b = after.probOne(q);
      // A coin that was an even toss and is now certain got there by
      // interference; nothing else can do that in one card.
      if (Math.abs(a - 0.5) < 1e-6 && (b > 1 - 1e-6 || b < 1e-6)) return 'interference';
      if ((a > 1 - 1e-6 || a < 1e-6) && Math.abs(b - 0.5) < 1e-6) return 'superposition';
    }
    return null;
  }

  bigEffect(kind) {
    const P = this.app.particles, V = this.app.vfx;
    const w = innerWidth, hh = innerHeight;
    switch (kind) {
      case 'grover': V.flash('rgba(251,191,36,.3)', 600); P.rain(w, hh, [251, 191, 36], 70); break;
      case 'teleport': V.flash('rgba(110,231,255,.35)', 450); V.chroma(4); break;
      case 'anneal': P.rain(w, hh, [125, 211, 252], 90); break;
      case 'echo': V.flash('rgba(134,239,172,.25)', 500); break;
      case 'cohere': P.confetti(w, hh, [[110, 231, 255], [192, 132, 252]]); break;
      case 'rewind': V.chroma(5); break;
      default: break;
    }
  }

  flyChips(fromEl, n) {
    if (!fromEl || this.app.settings.particles === 'off') return;
    const from = centreOf(fromEl);
    const to = centreOf(this.potEl);
    const style = this.app.profile.equipped.chips || 'default';
    for (let i = 0; i < n; i++) {
      const el = h('div.chip-fly', { html: chipArt(style) });
      el.style.left = (from.x - 13) + 'px';
      el.style.top = (from.y - 13) + 'px';
      document.body.appendChild(el);
      const jx = (Math.random() - 0.5) * 30, jy = (Math.random() - 0.5) * 20;
      nextFrame(() => {
        el.style.transform = `translate(${to.x - from.x + jx}px, ${to.y - from.y + jy}px) rotate(${Math.random() * 360}deg)`;
      });
      setTimeout(() => el.remove(), scale(900) + 80);
    }
    pulse(this.potEl, 'bumping', 500);
  }

  /* ================= end of hand ================= */

  async showdown(results) {
    const P = this.app.particles, V = this.app.vfx;
    this.deal_say(DEALER.showdown);
    const hero = this.game.hero();
    const won = hero.won > 0;

    this.run.recordHand(this.game);
    this.recordProfileFromHand();

    for (const pot of results.pots) {
      for (const seat of pot.winners) markWinner(this.seatEls[seat], true);
    }

    if (!results.uncontested && hero.score === this.game.coins) {
      SFX.coherence();
      V.shout('COHERENCE', 'gold');
      V.flash('rgba(251,191,36,.34)', 700);
      V.shake(16);
      P.confetti(innerWidth, innerHeight, [[251, 191, 36], [110, 231, 255], [192, 132, 252]]);
      music.sting('victory');
      await wait(900);
    } else if (won) {
      SFX.win(hero.won > this.game.bigBlind * 8);
      P.confetti(innerWidth, innerHeight, [[251, 191, 36], [110, 231, 255]]);
      SFX.potWin();
      await wait(500);
    } else {
      SFX.lose();
      await wait(320);
    }

    for (const p of this.game.players) {
      if (!p.bot || p.folded || p.out) continue;
      const big = p.won > this.game.bigBlind * 8;
      const line = speak(p.bot, p.won > 0 ? 'win' : 'lose', this.game.rng);
      if (line) say(this.seatEls[p.seat], line);
    }

    await wait(500);
    openResults(this.app, this.game, this.run, () => this.afterHand());
  }

  recordProfileFromHand() {
    const g = this.game, hero = g.hero();
    bump('totals.hands');
    if (hero.won > 0) {
      bump('totals.handsWon');
      bump('totals.chipsWon', hero.won);
      if (this.bluffing) flag('bluffWin');
      if (hero.allIn) flag('allinWin');
      if (g.results && g.results.pots.length > 1) flag('sidePotWin');
      if (hero.score === 0) flag('wonWithBlank');
      const tied = g.inHand().filter((p) => p.score === hero.score);
      if (tied.length > 1 && g.results.pots[0].winners.length === 1) flag('kickerWin');
      if (g.results.pots[0].winners.length >= 3) flag('threeWaySplit');
      if (hero.plays.some((p) => p.card === 'GROVER')) flag('groverWin');
      if (hero.plays.some((p) => p.card === 'DEUTSCH')) flag('deutschWin');
      if (hero.plays.some((p) => p.card === 'QFT')) flag('qftWin');
    } else {
      bump('totals.chipsLost', hero.committed);
    }
    if (hero.score === g.coins) {
      bump('totals.coherences');
      if (!hero.plays.length) flag('freeCoherence');
    }
    if (hero.bits && hero.board) {
      let spinning = 0;
      for (let q = 0; q < g.coins; q++) if (!readCoin(g.origin, q).settled) spinning++;
      if (spinning === g.coins) flag('allSpinning');
    }
    if (hero.plays.some((p) => p.card === 'ZENO' || p.card === 'FREEZE') && hero.score > 0) flag('zenoHeld');
    if (hero.plays.some((p) => p.card === 'Z') && hero.plays.some((p) => p.card === 'H')) flag('interferenceLine');
    raise('best.score', hero.score || 0);
    raise('best.pot', g.results ? g.results.pots.reduce((a, b) => a + b.amount, 0) : 0);
    raise('best.entropy', hero.entropy || 0);
    this.bluffing = false;
    this.app.checkAchievements();
  }

  afterHand() {
    const g = this.game, r = this.run;
    const limit = this.mode.handsPerRound || this.mode.maxHands || 0;
    const roundDone = g.finished() || (limit && g.handNo >= limit);

    if (!roundDone) {
      g.nextHand();
      this.dealtHand = -1;
      this.renderAll();
      this.pump();
      return;
    }

    const res = r.finishRound();
    raise('best.round', r.round);
    bump('totals.rounds');
    if (r.boss && res.survived) {
      const key = r.boss.key;
      if (!this.app.profile.bosses.includes(key)) {
        this.app.profile.bosses.push(key);
        this.app.store.save(true);
      }
    }
    if (r.deck.length <= 8 && res.survived) flag('slimDeck');
    if (r.relics.some((id) => ['schrodingers_chip', 'universal_gateset', 'quantum_advantage', 'no_cloning'].includes(id))) flag('legendaryRelic');
    raise('best.relics', r.relics.length);
    if (!r.usedHint && r.round >= 5) flag('noHintRun', 1);
    this.app.checkAchievements();

    if (this.mode.key === 'daily') {
      recordDaily({ chips: res.chips, hands: g.handNo, scores: r.log });
      bump('daily.played', 0);
    }

    if (!res.survived || r.over) {
      clearRun();
      music.set('defeat');
      music.sting('defeat');
      this.app.router.push('shop', { run: r, over: true });
      return;
    }

    saveRun(r.snapshot());
    SFX.shop();
    this.app.router.push('shop', { run: r });
  }

  announceBoss() {
    const b = this.run.boss;
    this.app.accent(b.accent);
    music.set('boss');
    music.sting('boss');
    SFX.boss();
    this.app.vfx.shout(b.name.toUpperCase(), 'gold');
    this.app.vfx.flash('rgba(251,191,36,.26)', 800);
    this.app.vfx.shake(18);
    toast({
      icon: '⚔', title: `${b.name} — ${b.title}`,
      body: `${b.warning}  ${b.physics}`,
      tone: b.accent, duration: 9000
    });
  }
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [110, 231, 255];
}
