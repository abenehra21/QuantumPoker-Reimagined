/**
 * ui/screens/tutorial.js — learning by doing.
 *
 * Ten lessons. Each hands you a rigged board and exactly the cards that make
 * one idea obvious, and nothing is explained before you have watched it
 * happen. The self-checks prove every lesson is completable with the cards
 * it gives you, so this screen can never ship a dead end.
 */
import { h, clear, pct } from '../dom.js';
import { icon } from '../../render/art.js';
import { cardEl } from '../components/card.js';
import { orbEl, updateOrb, drawLinks, collapseOrb, strikeOrb } from '../components/orb.js';
import { toast, errorToast } from '../toast.js';
import { wireTerms } from '../tooltip.js';
import { SFX } from '../../audio/sfx.js';
import { loop } from '../../engine/loop.js';
import { wait } from '../../engine/tween.js';
import { update } from '../../save/store.js';

import { LESSONS } from '../../tutorial/lessons.js';
import { Circuit } from '../../quantum/circuit.js';
import { CARDS, playCard, legal } from '../../gameplay/cards.js';
import { findLinks, findCorrelations, readCoin } from '../../quantum/read.js';
import { mulberry32 } from '../../utils/rng.js';

export const title = 'Tutorial';
export const mood = 'sandbox';
export const rebuild = true;

let t = null;

export function build(app) { t = new Tutorial(app); return t.root; }
export function leave() { if (t) t.destroy(); }
export function key(e, app) {
  if (!t) return false;
  if (e.key === 'Escape') { if (t.selected) { t.clearSelection(); return true; } app.router.back(); return true; }
  if (e.key === 'Enter' && t.complete) { t.next(); return true; }
  return false;
}

class Tutorial {
  constructor(app) {
    this.app = app;
    this.index = 0;
    this.rng = mulberry32(7);
    this.build();
    this.load(0);
  }

  build() {
    this.panelEl = h('div.lesson-panel');
    this.boardEl = h('div.board');
    this.linkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.linkSvg.setAttribute('class', 'link-layer');
    this.handEl = h('div.hand-row', { style: { justifyContent: 'center' } });
    this.progressEl = h('div.lesson-progress', LESSONS.map(() => h('i')));
    this.actionsEl = h('div.row.center', { style: { gap: 'var(--s3)' } });
    this.hintEl = h('div.targeting-hint.hidden');

    this.root = h('div.tutorial.grow', [
      h('div.row', { style: { padding: 'var(--s3) var(--s4)', borderBottom: '1px solid var(--line)' } }, [
        h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back', onclick: () => this.app.router.back() }),
        h('h2', { text: 'Tutorial' }),
        h('div.grow'),
        this.progressEl,
        h('div.grow'),
        h('button.btn.btn-sm.btn-ghost', { text: 'Skip to the end', onclick: () => this.finish(true) })
      ]),
      h('div.felt.grow.scroll', [
        this.hintEl,
        this.panelEl,
        h('div', { style: { position: 'relative' } }, [this.linkSvg, this.boardEl]),
        this.actionsEl
      ]),
      h('div', { style: { padding: 'var(--s3)', borderTop: '1px solid var(--line)' } }, [this.handEl])
    ]);

    this.tick = loop.add(() => {
      if (this.state) drawLinks(this.linkSvg, this.orbs, findLinks(this.state), findCorrelations(this.state, 0.12));
    }, 'tutorial');
  }

  destroy() { if (this.tick) this.tick(); }

  load(i) {
    this.index = i;
    this.lesson = LESSONS[i];
    this.state = this.lesson.board();
    this.circuit = new Circuit(this.state.n, this.state);
    this.hand = (this.lesson.hand || []).slice();
    this.plays = [];
    this.uiFlags = { inspected: 0, psiOpened: false };
    this.complete = false;
    this.selected = null;
    this.targets = [];
    this.render();
  }

  render() {
    const l = this.lesson;
    clear(this.panelEl);
    this.panelEl.appendChild(h('div.lesson-step', { text: `Lesson ${this.index + 1} of ${LESSONS.length}` }));
    this.panelEl.appendChild(h('div.lesson-concept', { text: l.concept }));
    this.panelEl.appendChild(h('h3.lesson-title', { text: l.title }));
    this.panelEl.appendChild(h('p.lesson-text', { text: l.text }));
    if (l.aside) this.panelEl.appendChild(h('div.lesson-aside', { text: l.aside }));
    this.goalEl = h('div.lesson-goal', [h('span', { text: l.goal })]);
    this.panelEl.appendChild(this.goalEl);
    if (l.bonus) this.panelEl.appendChild(h('div.tiny.dim', { style: { marginTop: 'var(--s2)' }, text: l.bonus }));

    clear(this.boardEl);
    this.orbs = [];
    for (let q = 0; q < this.state.n; q++) {
      const el = orbEl(q, { onPick: (i) => this.pick(i) });
      el.addEventListener('pointerenter', () => { this.uiFlags.inspected++; this.check(); });
      this.boardEl.appendChild(el);
      this.orbs.push(el);
    }

    this.refresh();
    this.renderHand();
    this.renderActions();
    Array.from(this.progressEl.children).forEach((n, i) => {
      n.className = i < this.index ? 'done' : i === this.index ? 'now' : '';
    });
    wireTerms(this.root);
  }

  renderHand() {
    clear(this.handEl);
    if (!this.hand.length) {
      this.handEl.appendChild(h('div.dim.small', {
        text: this.lesson.interactive ? 'No cards for this one — just look.' : 'No cards left.'
      }));
      return;
    }
    this.hand.forEach((id) => {
      const el = cardEl(id, { onPick: () => this.select(id, el) });
      if (this.selected && this.selected.id === id) el.classList.add('selected');
      this.handEl.appendChild(el);
    });
  }

  renderActions() {
    clear(this.actionsEl);
    if (this.lesson.interactive === 'psi') {
      this.actionsEl.appendChild(h('button.btn', {
        html: icon('psi') + '<span>Open the readout</span>',
        onclick: () => {
          this.uiFlags.psiOpened = true;
          const lines = [];
          for (let q = 0; q < this.state.n; q++) {
            const c = readCoin(this.state, q);
            lines.push(`coin ${q + 1}  ${c.ket}  P(1)=${pct(c.up)}  |r|=${c.bloch.r.toFixed(2)}`);
          }
          toast({ icon: 'Ψ', title: this.state.toKet(4), body: lines.join('\n'), duration: 9000 });
          this.check();
        }
      }));
    }
    this.actionsEl.appendChild(h('button.btn.btn-ghost.btn-sm', { text: 'Start this lesson over', onclick: () => this.load(this.index) }));
    if (this.index > 0) {
      this.actionsEl.appendChild(h('button.btn.btn-ghost.btn-sm', { text: 'Previous', onclick: () => this.load(this.index - 1) }));
    }
    this.nextBtn = h('button.btn.btn-primary', {
      text: this.index === LESSONS.length - 1 ? 'Finish' : 'Next · Enter',
      disabled: !this.complete,
      onclick: () => this.next()
    });
    this.actionsEl.appendChild(this.nextBtn);
  }

  select(id, el) {
    if (this.selected && this.selected.id === id) { this.clearSelection(); return; }
    this.selected = { id, el };
    this.targets = [];
    Array.from(this.handEl.children).forEach((c) => c.classList && c.classList.remove('selected'));
    el.classList.add('selected');
    const card = CARDS[id];
    if (card.arity === 0) { this.apply(); return; }
    this.hintEl.textContent = `${card.name}: choose ${card.pick[0]}`;
    this.hintEl.classList.remove('hidden');
    for (const o of this.orbs) o.classList.add('targetable');
  }

  clearSelection() {
    this.selected = null; this.targets = [];
    this.hintEl.classList.add('hidden');
    for (const o of this.orbs) o.classList.remove('targetable', 'chosen');
    Array.from(this.handEl.children).forEach((c) => c.classList && c.classList.remove('selected'));
  }

  pick(q) {
    if (!this.selected) return;
    if (this.targets.includes(q)) { errorToast('Pick a different coin.'); return; }
    this.targets.push(q);
    this.orbs[q].classList.add('chosen');
    const card = CARDS[this.selected.id];
    if (this.targets.length >= card.arity) this.apply();
    else this.hintEl.textContent = `${card.name}: choose ${card.pick[this.targets.length]}`;
  }

  apply() {
    const id = this.selected.id, targets = this.targets.slice();
    const check = legal(id, targets, this.state);
    if (!check.ok) { errorToast(check.why); this.clearSelection(); return; }

    const before = this.state.clone();
    let res;
    try {
      res = playCard(id, targets, {
        state: this.state, circuit: this.circuit, rng: this.rng,
        player: { noiseLog: [], rewindLast: () => null }, game: null
      });
    } catch (e) { errorToast(e.message); this.clearSelection(); return; }

    this.hand.splice(this.hand.indexOf(id), 1);
    this.plays.push({ card: id, targets, outcomes: res.outcomes });
    SFX.gate(id);

    for (const q of (targets.length ? targets : [0])) {
      const el = this.orbs[q];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      this.app.particles.burst(r.left + r.width / 2, r.top + r.height / 2, [110, 231, 255], 20, 190);
      if (res.outcomes && res.outcomes.some((o) => o.coin === q)) collapseOrb(el, res.outcomes[0].bit);
      else strikeOrb(el);
    }

    // The teaching bit: say what just happened, in words.
    const note = this.narrate(before, this.state, id, targets, res);
    if (note) toast({ icon: CARDS[id].symbol, body: note, duration: 5200 });

    this.clearSelection();
    this.refresh();
    this.renderHand();
    this.check();
  }

  /** A plain-language description of the change this card made. */
  narrate(before, after, id, targets, res) {
    if (res && res.note) return res.note;
    const changes = [];
    for (let q = 0; q < after.n; q++) {
      const a = before.probOne(q), b = after.probOne(q);
      if (Math.abs(a - b) > 1e-6) changes.push(`coin ${q + 1}: ${pct(a)} → ${pct(b)}`);
    }
    const linksBefore = findLinks(before).length, linksAfter = findLinks(after).length;
    if (linksAfter > linksBefore) changes.push('two coins are now entangled');
    if (linksAfter < linksBefore) changes.push('a link broke');
    if (!changes.length) {
      return before.same(after)
        ? `${CARDS[id].name} did nothing here. That is the lesson: ${CARDS[id].blurb.toLowerCase()}`
        : 'The odds did not move, but the tilt did. A Spin will now do something different.';
    }
    return changes.join(' · ');
  }

  refresh() {
    for (let q = 0; q < this.state.n; q++) updateOrb(this.orbs[q], this.state, q, { showKets: true });
  }

  check() {
    if (this.complete) return;
    let done = false;
    try { done = !!this.lesson.done(this.state, this.plays, this.uiFlags); } catch (e) { done = false; }
    if (!done) return;
    this.complete = true;
    this.goalEl.classList.add('done');
    this.goalEl.innerHTML = '';
    this.goalEl.appendChild(h('span', { html: icon('check') }));
    this.goalEl.appendChild(h('span', { text: 'Done. ' + this.lesson.goal }));
    if (this.lesson.starred && this.lesson.starred(this.state)) {
      this.goalEl.appendChild(h('span.badge', { style: { '--tone': 'var(--legendary)' }, text: 'nicely done' }));
    }
    SFX.unlock();
    const r = this.boardEl.getBoundingClientRect();
    this.app.particles.confetti(innerWidth, innerHeight, [[110, 231, 255], [74, 222, 128]]);
    if (this.nextBtn) { this.nextBtn.disabled = false; this.nextBtn.focus(); }
  }

  next() {
    if (this.index < LESSONS.length - 1) { SFX.click(); this.load(this.index + 1); }
    else this.finish(false);
  }

  finish(skipped) {
    update((p) => { p.tutorialDone = true; });
    this.app.checkAchievements();
    if (!skipped) {
      this.app.vfx.shout('READY', 'gold');
      SFX.coherence();
    }
    toast({
      icon: '✓', title: skipped ? 'Tutorial skipped' : 'Tutorial complete',
      body: skipped ? 'You can come back to it any time.'
        : 'You have used superposition, phase, interference, entanglement and measurement to win a hand. That is a first course in quantum computing.',
      tone: 'var(--good)', duration: 7000
    });
    this.app.router.go('modes');
  }
}
