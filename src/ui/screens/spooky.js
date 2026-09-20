/**
 * ui/screens/spooky.js — the Trick or Treat table.
 *
 * Same shape as the main game's table: the engine emits events, this screen
 * drains them one at a time and turns each into motion, sound and light
 * with the game paused in between. Nothing in this mode is ever allowed to
 * change a card silently — if something happened, the player watched it.
 */
import { h, clear, num, centreOf } from '../dom.js';
import { icon } from '../../render/art.js';
import { toast, errorToast } from '../toast.js';
import { attach, hide as hideTip } from '../tooltip.js';
import { SFX } from '../../audio/sfx.js';
import { music } from '../../audio/music.js';
import { wait } from '../../engine/tween.js';
import { loop } from '../../engine/loop.js';
import { update } from '../../save/store.js';

import { Match } from '../../halloween/match.js';
import { holeKey, boardKey } from '../../halloween/game.js';
import { step as monsterStep } from '../../halloween/brain.js';
import { POWERS } from '../../halloween/powers.js';
import { say, reaction } from '../../halloween/monsters.js';
import { describe, spookyName } from '../../halloween/evaluate.js';
import { quickBets, format } from '../../halloween/candy.js';
import { winShout, lossShout } from '../../halloween/awards.js';
import { SPOOK } from '../../halloween/sounds.js';
import { pcard, dealIn, collapseCard, swapCard, drawTangles } from '../../halloween/ui/pcard.js';
import { candyStack, candyCount, setCandyCount, flyCandy, burstCandy } from '../../halloween/ui/candyview.js';
import { decorate, undecorate, faceOf } from './spooky-intro.js';

export const title = 'Quantum Trick or Treat';
export const mood = 'table';
export const rebuild = true;

let ui = null;

export function build(app, opts) { ui = new SpookyTable(app, opts || {}); return ui.root; }
export function enter(app, opts) {
  document.documentElement.dataset.theme = 'spooky';
  app.accent('var(--pumpkin)', 'var(--witch)');
  app.background.setAccent([255, 139, 44], [168, 85, 247]);
  app.background.setIntensity(0.55);
  decorate(app);
  if (ui) ui.start();
}
export function leave(app) {
  if (ui) ui.teardown();
  document.documentElement.dataset.theme = '';
  app.accent();
  app.background.setAccent([110, 231, 255], [192, 132, 252]);
  app.background.setIntensity(1);
  undecorate();
}
export function key(e, app) { return ui ? ui.key(e) : false; }

class SpookyTable {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.busy = false;
    this.armed = null;       // a power waiting for its target
    this.cardEls = new Map(); // slot key -> element
    this.build();
  }

  /* ================= layout ================= */

  build() {
    this.seatsEl = h('div.crypt-seats');
    this.communityEl = h('div.community');
    this.tangleSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.tangleSvg.setAttribute('class', 'tangle-layer');
    this.potEl = candyCount(0, { big: true });
    this.potStackEl = candyStack(0, { cap: 10 });
    this.handEl = h('div.your-hand');
    this.betsEl = h('div.bet-controls');
    this.powersEl = h('div.power-bar');
    this.statusEl = h('div.small.dim.center', { style: { minHeight: '20px' } });
    this.infoEl = h('div.row.small.dim', { style: { gap: 'var(--s2)' } });
    this.yourCandyEl = candyCount(0);

    this.root = h('div.spooky-table', [
      h('div.spooky-top', [
        h('button.btn.btn-icon.btn-ghost', {
          html: icon('back'), 'aria-label': 'Leave the table', onclick: () => this.leave()
        }),
        h('div', [
          this.streetEl = h('div', { style: { fontFamily: 'var(--font-display)', fontWeight: '600' }, text: 'Deal' }),
          this.handCountEl = h('div.tiny.dim', { text: '' })
        ]),
        h('div.grow'),
        this.infoEl,
        h('div.grow'),
        h('button.btn.btn-icon.btn-ghost', {
          html: icon('info'), 'aria-label': 'How to play', title: 'How to play',
          onclick: () => this.showHelp()
        })
      ]),

      h('div.spooky-felt', [
        h('div.felt-lanterns', [h('span', { text: '\u{1F383}' }), h('span', { text: '\u{1F56F}' })]),
        this.seatsEl,
        h('div', { style: { position: 'relative' } }, [this.tangleSvg, this.communityEl]),
        h('div.pot-pile', [
          h('div.label', { text: 'Pot' }),
          this.potEl,
          this.potStackEl
        ])
      ]),

      h('div', [
        this.statusEl,
        h('div.spooky-bottom', [
          h('div.col', { style: { gap: '4px' } }, [
            h('div.row', { style: { gap: 'var(--s2)' } }, [
              h('span.tiny.dim', { text: 'Your candy' }), this.yourCandyEl
            ]),
            this.handEl
          ]),
          this.powersEl,
          this.betsEl
        ])
      ])
    ]);
  }

  /* ================= lifecycle ================= */

  start() {
    this.match = this.opts.match || new Match({
      seed: this.opts.seed,
      length: this.opts.length,
      opponents: this.opts.opponents,
      humans: this.opts.humans,
      chaos: this.opts.chaos
    });
    this.game = this.match.game;
    this.app.spooky = this.match;
    this.activeHuman = 0;
    this.renderAll();
    if (this.match.isPartyMode) this.passTo(this.game.hero().seat, true);
    else this.pump();
    if (!this.tangleTick) {
      this.tangleTick = loop.add(() => this.drawLinks(), 'tangles');
    }
  }

  teardown() {
    if (this.tangleTick) { this.tangleTick(); this.tangleTick = null; }
    if (this.bubbles) { for (const b of this.bubbles.values()) b.remove(); this.bubbles.clear(); }
    for (const el of document.querySelectorAll('.pass-screen, .collapse-banner, .shout, .new-power')) el.remove();
    this.app.spooky = null;
  }

  leave() {
    SFX.back();
    this.app.router.go('spooky-intro');
  }

  /* ================= rendering ================= */

  renderAll() {
    this.renderSeats();
    this.renderCommunity();
    this.renderYourHand();
    this.renderPowers();
    this.renderBets();
    this.renderTop();
  }

  renderTop() {
    const g = this.game;
    this.streetEl.textContent = g.street();
    this.handCountEl.textContent = `Hand ${g.handNo} of ${this.match.length.hands}`;
    clear(this.infoEl);
    this.infoEl.appendChild(h('span.pill', { text: `Antes ${g.ante}/${g.bigBet}` }));
    const powers = g.availablePowers().length;
    this.infoEl.appendChild(h('span.pill', { text: `${powers} power${powers === 1 ? '' : 's'}` }));
    setCandyCount(this.potEl, g.potTotal(), true);
    clear(this.potStackEl);
    const fresh = candyStack(g.potTotal(), { cap: 10 });
    while (fresh.firstChild) this.potStackEl.appendChild(fresh.firstChild);
    setCandyCount(this.yourCandyEl, this.me().candy, true);
  }

  /** The human whose turn it is in party mode, or the only human. */
  me() {
    const humans = this.game.humans();
    return humans[Math.min(this.activeHuman, humans.length - 1)] || this.game.players[0];
  }

  renderSeats() {
    clear(this.seatsEl);
    this.seatEls = new Map();
    for (const p of this.game.players) {
      const isMe = p.seat === this.me().seat;
      const el = h('div.crypt-seat' + (isMe ? '.hero' : ''), {
        dataset: { seat: p.seat },
        style: { '--who': p.monster ? p.monster.accent : 'var(--pumpkin)' }
      }, [
        h('div.crypt-face', { text: p.monster ? faceOf(p.monster) : '\u{1F9D1}' }),
        h('div.grow', [
          h('div.crypt-name', { text: p.name + (isMe ? ' (you)' : '') }),
          h('div.crypt-line'),
          h('div.crypt-cards')
        ])
      ]);
      if (p.monster) {
        attach(el, {
          title: `${p.monster.name} — ${p.monster.title}`,
          body: `<p>${p.monster.bio}</p>`,
          hint: p.monster.tell,
          tone: p.monster.accent
        });
      }
      this.seatsEl.appendChild(el);
      this.seatEls.set(p.seat, el);
    }
    this.updateSeats();
  }

  updateSeats() {
    const g = this.game;
    for (const p of g.players) {
      const el = this.seatEls.get(p.seat);
      if (!el) continue;
      el.classList.toggle('acting', g.actor === p.seat && g.phase === 'betting');
      el.classList.toggle('folded', p.folded);
      el.querySelector('.crypt-face').classList.toggle('thinking',
        g.actor === p.seat && !!p.monster && g.phase === 'betting');

      const line = el.querySelector('.crypt-line');
      clear(line);
      line.appendChild(h('span', { text: '\u{1F36C} ' + format(p.candy) }));
      if (p.bet > 0) line.appendChild(h('span', { text: `  • bet ${p.bet}` }));
      if (p.allIn) line.appendChild(h('span', { style: { color: 'var(--blood)' }, text: '  ALL IN' }));
      if (p.folded) line.appendChild(h('span', { text: '  folded' }));

      // Their cards, as this viewer is allowed to see them.
      const cards = el.querySelector('.crypt-cards');
      clear(cards);
      if (p.seat === this.me().seat) continue;   // your own hand lives at the bottom
      for (const v of g.visibleTo(p.seat, this.me().seat)) {
        const c = pcard({
          card: v.card, mystery: v.mystery, options: v.options,
          width: 34, dimmed: p.folded,
          pickable: !!(this.armed && this.canTarget(v.key)),
          onPick: this.armed && this.canTarget(v.key) ? () => this.fire(v.key) : null
        });
        this.cardEls.set(v.key, c);
        cards.appendChild(c);
      }
    }
  }

  renderCommunity() {
    clear(this.communityEl);
    const g = this.game;
    for (let i = 0; i < 5; i++) {
      const key = boardKey(i);
      const shown = i < g.revealed;
      const mystery = shown && g.isMystery(key);
      const el = pcard({
        card: shown ? g.cardAt(key) : null,
        mystery,
        options: mystery ? g.haunting.optionsAt(key) : null,
        pickable: !!(this.armed && this.canTarget(key)),
        onPick: this.armed && this.canTarget(key) ? () => this.fire(key) : null
      });
      this.cardEls.set(key, el);
      this.communityEl.appendChild(el);
    }
  }

  renderYourHand() {
    clear(this.handEl);
    const g = this.game, me = this.me();
    const views = g.visibleTo(me.seat, me.seat);
    views.forEach((v, i) => {
      const el = pcard({
        card: v.card, mystery: v.mystery, options: v.options,
        pickable: !!(this.armed && this.canTarget(v.key)),
        chosen: this.armed && this.armedTarget === v.key,
        onPick: this.armed && this.canTarget(v.key) ? () => this.fire(v.key) : null
      });
      this.cardEls.set(v.key, el);
      this.handEl.appendChild(h('div.slot' + (v.faceUp ? '.up' : ''), [
        h('div.tag', { text: v.faceUp ? (me.bluffing ? 'hidden by you' : 'everyone sees') : 'only you' }),
        el
      ]));
    });
  }

  renderPowers() {
    clear(this.powersEl);
    const g = this.game, me = this.me();
    const available = g.availablePowers();
    if (!available.length) {
      this.powersEl.appendChild(h('div.tiny.dim', {
        style: { maxWidth: '150px', textAlign: 'center' },
        text: 'Spooky powers start on hand 2. Just play poker for now.'
      }));
      return;
    }
    for (const id of available) {
      const p = POWERS[id];
      const affordable = me.charges >= p.cost && !me.folded && g.phase === 'betting';
      const btn = h('button.power-btn' + (this.armed === id ? '.armed' : '')
        + (this.match.unlockedThisHand === id ? '.fresh' : ''), {
        type: 'button',
        style: { '--tone': p.tint },
        disabled: !affordable,
        onclick: () => this.arm(id)
      }, [
        h('span.glyph', { text: p.icon }),
        h('span.name', { text: p.name }),
        h('span.cost', { text: '●'.repeat(p.cost) })
      ]);
      attach(btn, {
        title: `${p.icon}  ${p.name}`,
        body: `<p>${p.blurb}</p><p class="dim tiny">${p.detail}</p>`,
        physics: p.learn,
        tone: p.tint
      });
      this.powersEl.appendChild(btn);
    }
    this.powersEl.appendChild(h('div.col', { style: { gap: '3px', alignItems: 'center' } }, [
      h('div.charges', Array.from({ length: 3 }, (_, i) =>
        h('i', { class: i < me.charges ? 'on' : '' }))),
      h('span.tiny.dim', { text: 'charges' })
    ]));
  }

  renderBets() {
    clear(this.betsEl);
    const g = this.game, me = this.me();

    if (g.phase === 'over') {
      this.betsEl.appendChild(h('button.btn.btn-primary.btn-lg.btn-block', {
        text: this.match.handsLeft <= 0 ? 'See the scoreboard' : 'Next hand',
        onclick: () => this.nextHand()
      }));
      return;
    }

    if (g.actor !== me.seat) {
      const who = g.current();
      this.betsEl.appendChild(h('div.center.dim.small', {
        style: { minHeight: '92px' },
        text: who ? `${who.name} is thinking…` : 'Dealing…'
      }));
      return;
    }

    const toCall = g.toCall(me.seat);
    const minTo = g.minRaiseTo(me.seat);
    const maxTo = g.maxRaiseTo(me.seat);
    const canRaise = maxTo > g.currentBet;

    this.betsEl.appendChild(h('div.bet-row', [
      h('button.btn.btn-fold', { text: 'Fold', onclick: () => this.act('fold') }),
      h('button.btn.btn-call', {
        onclick: () => this.act('call')
      }, toCall === 0 ? [h('span', { text: 'Check' })]
        : [h('span', { text: 'Call ' }), h('span.amt', { text: '\u{1F36C}' + toCall })])
    ]));

    if (canRaise) {
      const quick = quickBets(g.potTotal(), maxTo, minTo);
      const row = h('div.bet-row');
      for (const q of quick) {
        row.appendChild(h('button.btn.btn-sm.btn-raise', {
          onclick: () => this.act('raise', q.amount)
        }, [
          h('span', { text: q.label }),
          h('span.amt', { text: '\u{1F36C}' + q.amount })
        ]));
      }
      if (quick.length) this.betsEl.appendChild(row);
      this.betsEl.appendChild(h('button.btn.btn-allin.btn-block', {
        onclick: () => this.act('raise', maxTo)
      }, [h('span', { text: 'ALL CANDY ' }), h('span.amt', { text: '\u{1F36C}' + maxTo })]));
    }
  }

  drawLinks() {
    const pairs = [];
    for (const link of this.game.haunting.links) {
      const a = this.cardEls.get(link.a), b = this.cardEls.get(link.b);
      if (a && b && a.isConnected && b.isConnected) pairs.push([a, b]);
    }
    drawTangles(this.tangleSvg, pairs);
  }

  /* ================= powers ================= */

  arm(id) {
    const p = POWERS[id];
    SFX.click();
    // The tooltip that explained this power must not still be sitting over
    // the table when the power goes off. The reveal is the best moment in
    // the mode and it was being covered by its own help text.
    hideTip();
    if (this.armed === id) { this.disarm(); return; }
    this.armed = id;
    this.armedTarget = null;
    if (p.needsTarget === 'none') { this.fire(null); return; }
    this.prompt(p, p.needsTarget === 'own'
      ? 'Tap one of your own cards'
      : 'Tap any "?" on the table');
    this.renderAll();
  }

  disarm() {
    this.armed = null;
    this.armedTarget = null;
    this.status('');
    this.renderAll();
  }

  /** The loud version of the status line, used while a power is armed. */
  prompt(power, text) {
    clear(this.statusEl);
    this.statusEl.appendChild(h('div.arming', { style: { '--tone': power.tint } }, [
      h('span.glyph', { text: power.icon }),
      h('strong', { text: power.name }),
      h('span', { text: text }),
      h('span.esc', { text: 'Esc to cancel' })
    ]));
  }

  canTarget(key) {
    if (!this.armed) return false;
    const p = POWERS[this.armed];
    const me = this.me();
    if (p.needsTarget === 'own') return key === holeKey(me.seat, 0) || key === holeKey(me.seat, 1);
    if (p.needsTarget === 'mystery') return this.game.isMystery(key);
    return false;
  }

  async fire(key) {
    const id = this.armed;
    if (!id) return;
    hideTip();
    const me = this.me();
    const res = this.game.usePower(me.seat, id, key);
    this.armed = null;
    this.armedTarget = null;
    if (!res.ok) { errorToast(res.why); this.renderAll(); return; }
    this.status('');
    await this.animatePower(Object.assign({ seat: me.seat, power: id }, res));
    this.game.drain();
    this.renderAll();
  }

  async animatePower(ev) {
    const P = this.app.particles, V = this.app.vfx;
    const p = POWERS[ev.power];
    const el = ev.key ? this.cardEls.get(ev.key) : null;

    if (ev.kind === 'measure') {
      SPOOK.measure();
      V.shake(6); V.chroma(2);
      if (el) {
        const at = centreOf(el);
        P.collapse(at.x, at.y, [201, 139, 255]);
        collapseCard(el, () => this.renderAll());
      }
      await wait(680);
      if (ev.cascade && ev.cascade.length) {
        SPOOK.entangle();
        for (const c of ev.cascade) {
          const ce = this.cardEls.get(c.key);
          if (ce) {
            const at = centreOf(ce);
            P.burst(at.x, at.y, [201, 139, 255], 22, 190);
            collapseCard(ce, () => this.renderAll());
          }
        }
        this.shout('ENTANGLED!', 'epic');
        await wait(600);
      }
      toast({ icon: p.icon, title: 'Measured', body: ev.text, tone: p.tint });
      return;
    }

    if (ev.kind === 'swap') {
      SPOOK.swap();
      if (el) {
        const at = centreOf(el);
        P.beam(at.x, at.y - 60, at.x, at.y, [201, 139, 255], 1.4);
        swapCard(el, () => this.renderAll());
      }
      await wait(560);
      toast({ icon: p.icon, title: 'Swapped', body: ev.text, tone: p.tint });
      return;
    }

    if (ev.kind === 'haunt') {
      SPOOK.haunt();
      V.chroma(3);
      if (el) {
        const at = centreOf(el);
        P.burst(at.x, at.y, [168, 85, 247], 30, 200);
      }
      this.renderAll();
      await wait(520);
      toast({ icon: p.icon, title: 'Haunted', body: ev.text, tone: p.tint });
      return;
    }

    if (ev.kind === 'bluff') {
      SPOOK.bluff();
      V.flash('rgba(168,85,247,.24)', 400);
      this.renderAll();
      await wait(420);
      toast({ icon: p.icon, title: 'Spectral bluff', body: ev.text, tone: p.tint });
    }
  }

  /* ================= actions ================= */

  act(kind, amount) {
    if (this.busy) return;
    const g = this.game, me = this.me();
    if (g.actor !== me.seat) return;
    const seatEl = this.seatEls.get(me.seat);
    const before = me.candy;

    if (kind === 'fold') g.fold();
    else if (kind === 'call') g.call();
    else {
      const r = g.raiseTo(amount);
      if (!r.ok) { errorToast(r.why); return; }
    }
    const spent = before - me.candy;
    if (spent > 0) flyCandy(seatEl || this.handEl, this.potEl, spent);
    this.pump();
  }

  nextHand() {
    if (this.busy) return;
    const res = this.match.advance();
    for (const r of res.refills) {
      SPOOK.refill();
      toast({
        icon: '\u{1F383}', title: 'Trick or treat!',
        body: `${r.name} was out of candy and takes ${r.amount} more.`,
        tone: 'var(--pumpkin)', duration: 4200
      });
    }
    if (res.over) { this.finishNight(); return; }
    if (res.unlocked) this.announcePower(res.unlocked);
    this.cardEls.clear();
    this.renderAll();
    if (this.match.isPartyMode) this.passTo(this.game.hero().seat, true);
    else this.pump();
  }

  /* ================= the event pump ================= */

  async pump() {
    if (this.busy) return;
    this.busy = true;
    try {
      let guard = 0;
      while (guard++ < 400) {
        for (const ev of this.game.drain()) await this.animate(ev);
        this.updateSeats();
        this.renderTop();
        this.renderBets();
        this.renderPowers();

        if (this.game.phase === 'over') break;
        const p = this.game.current();
        if (!p) break;
        if (!p.monster) {
          // A human's turn. In party mode it may not be the person currently
          // looking at the screen, and handing over without a cover screen
          // would show them somebody else's face-down card and then refuse
          // their input, because act() only accepts the active player.
          if (this.match.isPartyMode && p.seat !== this.me().seat) {
            this.busy = false;
            this.passTo(p.seat);
            return;
          }
          break;
        }

        await wait(420 + Math.random() * 420);
        const did = monsterStep(this.game);
        if (did && did.cast) await this.animateMonsterPower(p, did.cast);
        if (did && did.line) {
          const line = say(p.monster, did.line, this.game.rng);
          if (line) this.speak(p.seat, line);
        }
      }
    } finally {
      this.busy = false;
      this.renderAll();
      if (this.game.phase === 'over') this.afterHand();
    }
  }

  async animate(ev) {
    const P = this.app.particles, V = this.app.vfx;
    const seatEl = ev.seat !== undefined ? this.seatEls.get(ev.seat) : null;

    switch (ev.type) {
      case 'handStart':
        this.cardEls.clear();
        this.renderAll();
        for (const [, el] of this.cardEls) { /* dealt below */ }
        this.dealAnimation();
        music.set('table');
        await wait(600);
        break;

      case 'street': {
        SPOOK.deal(0);
        this.renderCommunity();
        for (let i = 0; i < ev.revealed; i++) {
          const el = this.cardEls.get(boardKey(i));
          if (el && !el.dataset.shown) {
            el.dataset.shown = '1';
            dealIn(el, i % 3, { y: -180, r: (i % 2 ? 12 : -12) });
            SPOOK.deal(i % 3);
            const at = centreOf(el);
            P.puff(at.x, at.y, [255, 139, 44], 12);
            await wait(170);
          }
        }
        music.set(this.game.round >= 2 ? 'tension' : 'table');
        break;
      }

      case 'call': case 'check':
        SPOOK.candy(ev.amount ? 3 : 1);
        if (ev.amount && seatEl) flyCandy(seatEl, this.potEl, ev.amount);
        break;

      case 'raise':
        SPOOK.candy(5);
        if (seatEl) flyCandy(seatEl, this.potEl, ev.amount);
        V.shake(4);
        break;

      case 'allin':
        SPOOK.allIn();
        V.shake(14); V.chroma(3);
        this.shout('ALL CANDY!', 'lose');
        if (seatEl) { flyCandy(seatEl, this.potEl, ev.amount, { cap: 14 }); }
        this.reactTo('allIn');
        await wait(900);
        break;

      case 'fold':
        SFX.fold();
        break;

      case 'power':
        if (ev.seat !== this.me().seat) await this.animateMonsterPower(this.game.players[ev.seat], ev);
        break;

      case 'bluffFailed':
        SPOOK.bluffFail();
        V.shake(7);
        this.shout('BLUFF COLLAPSED!', '');
        toast({ icon: '\u{1F3AD}', title: 'The bluff falls apart',
          body: `${this.game.players[ev.seat].name}’s card is visible again.`, tone: 'var(--blood)' });
        this.renderAll();
        await wait(700);
        break;

      case 'collapse':
        await this.animateCollapse(ev);
        break;

      case 'refill':
        SPOOK.refill();
        break;

      case 'finalMeasure':
        SPOOK.measure();
        this.renderAll();
        for (const r of ev.revealed) {
          const el = this.cardEls.get(r.key);
          if (el) collapseCard(el, () => this.renderAll());
        }
        await wait(700);
        break;

      case 'handOver':
        break;

      default: break;
    }
  }

  dealAnimation() {
    const me = this.me();
    let i = 0;
    for (const v of this.game.visibleTo(me.seat, me.seat)) {
      const el = this.cardEls.get(v.key);
      if (el) { dealIn(el, i++, { y: -240 }); SPOOK.deal(i); }
    }
  }

  async animateMonsterPower(player, cast) {
    const P = this.app.particles;
    const p = POWERS[cast.power || cast.id];
    if (!p) return;
    const line = say(player.monster, 'power', this.game.rng);
    if (line) this.speak(player.seat, line);
    if (player.monster && player.monster.key === 'witch') SPOOK.cackle();

    const el = cast.key ? this.cardEls.get(cast.key) : this.seatEls.get(player.seat);
    if (el) {
      const at = centreOf(el);
      P.burst(at.x, at.y, [201, 139, 255], 22, 180);
    }
    if (cast.kind === 'measure') { SPOOK.measure(); this.reactTo('measured'); }
    else if (cast.kind === 'haunt') SPOOK.haunt();
    else if (cast.kind === 'swap') SPOOK.swap();
    else if (cast.kind === 'bluff') SPOOK.bluff();

    toast({
      icon: p.icon,
      title: `${player.name} used ${p.name}`,
      body: cast.text || p.blurb,
      tone: p.tint, duration: 3600
    });
    this.renderAll();
    await wait(560);
  }

  async animateCollapse(ev) {
    const V = this.app.vfx, P = this.app.particles;
    SPOOK.collapse();
    V.shake(18); V.chroma(5);
    V.flash('rgba(168,85,247,.32)', 700);

    const banner = h('div.collapse-banner', [
      h('div.inner', [
        h('div.title', { text: 'QUANTUM COLLAPSE' }),
        h('div.sub', { text: ev.title ? `${ev.title} — ${ev.text}` : ev.text })
      ])
    ]);
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 2500);

    P.rain(innerWidth, innerHeight, [168, 85, 247], 70);
    this.reactTo('collapse');
    await wait(1500);
    this.renderAll();
    if (ev.kind === 'candyRain') {
      SPOOK.candyPile();
      for (const p of this.game.inHand()) {
        const el = this.seatEls.get(p.seat);
        if (el) burstCandy(el, ev.bonus || 6, { cap: 8 });
      }
      await wait(500);
    }
    await wait(500);
  }

  /* ================= the end of a hand ================= */

  async afterHand() {
    const g = this.game, me = this.me();
    const results = g.results;
    if (!results) return;
    const won = results.pots.some((p) => p.winners.includes(me.seat));
    const potTotal = results.pots.reduce((s, p) => s + p.amount, 0);
    const big = potTotal > me.candy * 0.5;

    this.renderAll();
    await wait(300);

    for (const pot of results.pots) {
      for (const seat of pot.winners) {
        const el = this.seatEls.get(seat);
        if (el) {
          el.classList.add('winner');
          flyCandy(this.potEl, el, pot.amount, { cap: 12 });
        }
      }
    }
    SPOOK.candyPile();
    await wait(500);

    if (won) {
      const hand = me.lastHand;
      this.shout(winShout(hand, potTotal, big), hand && hand.category >= 7 ? 'epic' : 'win');
      SPOOK.win(big);
      const el = this.seatEls.get(me.seat);
      if (el) burstCandy(el, potTotal, { cap: 16 });
      this.app.particles.confetti(innerWidth, innerHeight, [[255, 139, 44], [168, 85, 247], [134, 239, 172]]);
      if (big) this.app.vfx.shake(12);
    } else if (!me.folded) {
      this.shout(lossShout(g.rng), 'lose');
      SPOOK.lose();
    }

    // Everybody says their piece.
    for (const p of g.players) {
      if (!p.monster || p.folded) continue;
      const line = say(p.monster, p.won > 0 ? 'win' : 'lose', g.rng);
      if (line) this.speak(p.seat, line);
    }

    // What actually happened, in one line, with the hands that showed.
    const rows = g.players.filter((p) => p.lastHand).map((p) => {
      const winner = results.pots.some((x) => x.winners.includes(p.seat));
      return h('div.row', { style: { gap: 'var(--s2)', opacity: winner ? '1' : '.65' } }, [
        h('span', { style: { minWidth: '92px', fontWeight: winner ? '700' : '400' }, text: p.name }),
        h('div.row', { style: { gap: '2px' } },
          g.holeCards(p.seat).map((c) => pcard({ card: c, width: 36 }))),
        h('span.small', { style: { color: winner ? 'var(--slime)' : 'var(--ink-mute)' },
          text: spookyName(p.lastHand) }),
        h('span.tiny.dim', { text: describe(p.lastHand) }),
        winner ? h('span.small', { style: { color: 'var(--pumpkin)' }, text: `+${p.won}` }) : null
      ]);
    });
    if (rows.length) {
      toast({
        icon: '\u{1F0CF}', title: results.summary,
        body: '', tone: 'var(--pumpkin)', duration: 6000
      });
      this.status('');
      clear(this.statusEl);
      this.statusEl.appendChild(h('div.col', { style: { gap: '3px', alignItems: 'center' } }, rows));
    } else {
      this.status(results.summary);
    }

    this.renderBets();
    this.recordStats();
  }

  recordStats() {
    const me = this.game.hero();
    update((p) => {
      p.spooky = Object.assign({ nights: 0, best: 0, hands: 0 }, p.spooky);
      p.spooky.hands = (p.spooky.hands || 0) + 1;
      p.spooky.best = Math.max(p.spooky.best || 0, me.candy);
    });
  }

  finishNight() {
    update((p) => {
      p.spooky = Object.assign({ nights: 0, best: 0 }, p.spooky);
      p.spooky.nights = (p.spooky.nights || 0) + 1;
    });
    this.app.router.go('spooky-results', { match: this.match, force: true });
  }

  /* ================= party mode ================= */

  /** Hand the keyboard over, with a screen in between so nobody peeks. */
  passTo(seat, initial) {
    const humans = this.game.humans();
    const idx = humans.findIndex((p) => p.seat === seat);
    if (idx < 0) { this.pump(); return; }
    if (document.querySelector('.pass-screen')) return;   // already handing over
    this.activeHuman = idx;
    const who = humans[idx];
    // Blank the table before the screen fades in, so nothing of the previous
    // player's hand is on display for even a frame.
    this.disarm();

    const screen = h('div.pass-screen', [
      h('div', [
        h('div.small.dim', { text: initial ? 'First up' : 'Pass the keyboard to' }),
        h('div.who', { text: who.name }),
        h('div.hint', { text: 'Everybody else: look away. Tap when ready.' }),
        h('button.btn.btn-primary.btn-lg', { text: 'I’m ready', style: { marginTop: 'var(--s5)' } })
      ])
    ]);
    const go = () => {
      screen.remove();
      this.renderAll();
      this.pump();
    };
    screen.addEventListener('click', go);
    screen.querySelector('button').addEventListener('click', go);
    document.body.appendChild(screen);
  }

  /* ================= chrome ================= */

  status(text) {
    clear(this.statusEl);
    if (text) this.statusEl.appendChild(h('span', { text }));
  }

  speak(seat, text) {
    const el = this.seatEls.get(seat);
    if (!el || !text) return;
    if (this.bubbles && this.bubbles.get(seat)) this.bubbles.get(seat).remove();
    if (!this.bubbles) this.bubbles = new Map();
    const r = el.getBoundingClientRect();
    const bubble = h('div.crypt-say', { text });
    document.body.appendChild(bubble);
    // Place it after it has a size, and keep it on screen at either edge.
    const b = bubble.getBoundingClientRect();
    // Keep clear of the header; a bubble over the hand counter is unreadable.
    const top = document.querySelector('.spooky-top');
    const floor = top ? top.getBoundingClientRect().bottom + 6 : 8;
    bubble.style.left = Math.max(8, Math.min(innerWidth - b.width - 8, r.left + 8)) + 'px';
    bubble.style.top = Math.max(floor, r.top - b.height - 8) + 'px';
    this.bubbles.set(seat, bubble);
    setTimeout(() => {
      bubble.style.transition = 'opacity 260ms';
      bubble.style.opacity = '0';
      setTimeout(() => { bubble.remove(); if (this.bubbles) this.bubbles.delete(seat); }, 280);
    }, 2500);
  }

  /** Somebody at the table reacts out loud. */
  reactTo(kind) {
    const others = this.game.inHand().filter((p) => p.monster);
    if (!others.length) return;
    const who = others[Math.floor(this.game.rng() * others.length)];
    const line = reaction(kind, this.game.rng);
    if (line) this.speak(who.seat, line);
  }

  shout(text, tone) {
    const el = h('div.shout' + (tone ? '.' + tone : ''), { text });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  announcePower(power) {
    SPOOK.unlockPower();
    const el = h('div.new-power', [
      h('span.glyph', { text: power.icon }),
      h('div', [
        h('div.what', { text: 'New power: ' + power.name }),
        h('div.how', { text: power.blurb })
      ])
    ]);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  }

  showHelp() {
    SFX.click();
    const g = this.game;
    const el = h('div.overlay.open', { role: 'dialog', 'aria-modal': 'true' });
    const close = () => el.remove();
    el.appendChild(h('div.overlay-card.panel.panel-hi', [
      h('div.overlay-head', [
        h('h3', { text: 'How to play' }),
        h('div.grow'),
        h('button.btn.btn-icon.btn-ghost', { html: icon('close'), onclick: close })
      ]),
      h('div.overlay-body', [
        h('div.quick-steps', [
          ['Two cards each.', 'One face up for everyone, one only you can see.'],
          ['Bet candy.', 'Check, call, raise or fold, four times as the middle cards appear.'],
          ['Best five-card poker hand wins.', 'Your two plus the five in the middle.'],
          ['Powers are optional.', 'They are there to make it strange, not to make it hard.']
        ].map(([what, why], i) => h('div.quick-step', { style: { '--i': i } }, [
          h('div.num', { text: String(i + 1) }),
          h('div', [h('div.what', { text: what }), h('div.why', { text: why })])
        ]))),
        h('div.divider'),
        h('div.col', { style: { gap: 'var(--s2)' } },
          g.availablePowers().map((id) => {
            const p = POWERS[id];
            return h('div.row', [
              h('span', { text: p.icon, style: { fontSize: '20px', minWidth: '28px' } }),
              h('div', [
                h('strong', { text: p.name, style: { color: p.tint } }),
                h('div.small.dim', { text: p.blurb })
              ])
            ]);
          }))
      ]),
      h('div.overlay-foot', [h('button.btn.btn-primary', { text: 'Got it', onclick: close })])
    ]));
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.body.appendChild(el);
  }

  key(e) {
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      if (this.armed) { this.disarm(); return true; }
      this.leave(); return true;
    }
    if (this.busy) return false;
    const g = this.game, me = this.me();
    if (g.phase === 'over' && (k === ' ' || k === 'enter')) { this.nextHand(); return true; }
    if (g.actor !== me.seat) return false;
    if (k === 'f') { this.act('fold'); return true; }
    if (k === ' ' || k === 'enter' || k === 'c') { this.act('call'); return true; }
    if (k === 'a') { this.act('raise', g.maxRaiseTo(me.seat)); return true; }
    const powers = g.availablePowers();
    const n = parseInt(k, 10);
    if (n >= 1 && n <= powers.length) { this.arm(powers[n - 1]); return true; }
    return false;
  }
}
