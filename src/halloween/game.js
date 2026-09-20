/**
 * halloween/game.js — Quantum Trick or Treat.
 *
 * Texas Hold'em, played for candy, with two changes.
 *
 * The first is the rule that makes the whole mode work socially: each player
 * has one hole card face UP (their "treat", which everyone can see) and one
 * face DOWN (their "trick"). It is one sentence to explain, it is how Stud
 * has worked for a century, and it turns a table of strangers into a table
 * of people reading each other. It also gives the quantum powers something
 * visible to act on — hiding a card nobody could see anyway would be a
 * power with no theatre in it.
 *
 * The second is that cards can be haunted: a "?" that is genuinely two
 * cards at once until something measures it. That runs on the real
 * state-vector simulator in ../quantum/, so an entangled pair really is a
 * Bell pair and really does decide both cards the instant either is read.
 *
 * A player who ignores every power is playing plain Hold'em and can win.
 * That is deliberate and it is the balance line the whole mode is built on.
 *
 * No DOM in here. The tests play thousands of hands headless.
 */
import { Shoe, cardShort, cardName } from './deck.js';
import { evaluate, describe } from './evaluate.js';
import { Haunting, LINK } from './spooky.js';
import { POWERS, unlockedAt, CHARGES_PER_HAND } from './powers.js';
import { refillFor } from './candy.js';
import { buildPots } from '../gameplay/game.js';
import { mulberry32, mix } from '../utils/rng.js';

export const STREETS = ['Deal', 'Flop', 'Turn', 'River'];

/** Slot keys. Everything haunted is addressed by one of these. */
export const holeKey = (seat, i) => `p${seat}h${i}`;
export const boardKey = (i) => `b${i}`;

export class TrickOrTreat {
  /**
   * opts:
   *   seats     [{ name, monster }]  — monster null for a human
   *   seed      integer; the same seed deals the same night
   *   candy     starting candy each (50)
   *   ante      the opening blind (1)
   *   maxHands  0 for no limit
   *   chaos     0..1, how often the dealer interferes
   *   onboarding  true to drip-feed the powers over the first rounds
   */
  constructor(opts = {}) {
    this.seed = (opts.seed === undefined ? (Date.now() & 0x7fffffff) : opts.seed) >>> 0;
    this.rng = mulberry32(mix(this.seed, 0xB00));
    this.startCandy = opts.candy || 50;
    this.baseAnte = opts.ante || 1;
    this.maxHands = opts.maxHands || 0;
    this.chaos = opts.chaos === undefined ? 0.28 : opts.chaos;
    this.onboarding = opts.onboarding !== false;
    this.handNo = 0;
    this.dealer = 0;
    this.events = [];
    this.log = [];
    this.history = [];

    this.players = (opts.seats || []).map((s, i) => ({
      seat: i,
      name: s.name,
      monster: s.monster || null,
      candy: s.candy === undefined ? this.startCandy : s.candy,
      hole: [null, null],
      shown: 0,                 // which hole card is face up
      bet: 0, committed: 0,
      folded: false, allIn: false, acted: false, out: false,
      charges: CHARGES_PER_HAND,
      bluffing: false,
      refills: 0,
      won: 0, handsWon: 0,
      stats: {
        candyWon: 0, candyLost: 0, biggestPot: 0, bluffsWon: 0, allIns: 0,
        measures: 0, swaps: 0, haunts: 0, bluffs: 0, showdowns: 0,
        bestHand: -1, bestHandName: '', collapses: 0, lowPoint: s.candy || this.startCandy
      }
    }));
    this.n = this.players.length;
    this.haunting = new Haunting(this.rng);
    this.startHand();
  }

  /* ================= queries ================= */

  live() { return this.players.filter((p) => !p.out); }
  inHand() { return this.players.filter((p) => !p.out && !p.folded); }
  humans() { return this.players.filter((p) => !p.monster); }
  hero() { return this.humans()[0] || this.players[0]; }
  canAct(p) { return !p.out && !p.folded && !p.allIn && p.candy > 0; }
  current() { return this.actor >= 0 ? this.players[this.actor] : null; }
  potTotal() { return this.players.reduce((s, p) => s + p.committed, 0); }
  street() { return this.phase === 'showdown' || this.phase === 'over' ? 'Showdown' : STREETS[this.round]; }

  /** The round number a player is on, for onboarding. 1-based. */
  get roundNo() { return this.handNo; }

  /** Which powers exist right now. */
  availablePowers() {
    return this.onboarding ? unlockedAt(this.handNo) : Object.keys(POWERS);
  }

  note(text) {
    this.message = text;
    this.log.push(text);
    if (this.log.length > 120) this.log.shift();
    return text;
  }

  emit(type, data) {
    this.events.push(Object.assign({ type }, data || {}));
    return this;
  }

  drain() { const e = this.events; this.events = []; return e; }

  /* ================= cards ================= */

  /**
   * The actual card in a slot, or null when it is still a "?".
   * Everything that needs to know what a card *is* goes through here, so
   * there is exactly one place that understands haunting.
   */
  cardAt(key) {
    if (this.haunting.has(key)) return this.haunting.cardAt(key);
    return this.plain.get(key) === undefined ? null : this.plain.get(key);
  }

  isMystery(key) {
    return this.haunting.has(key) && this.haunting.cardAt(key) === null;
  }

  /** Board cards dealt so far, resolved where possible. */
  boardCards() {
    const out = [];
    for (let i = 0; i < this.revealed; i++) out.push(this.cardAt(boardKey(i)));
    return out;
  }

  /** A player's two hole cards, resolved where possible. */
  holeCards(seat) {
    return [this.cardAt(holeKey(seat, 0)), this.cardAt(holeKey(seat, 1))];
  }

  /** What an opponent can legitimately see of a seat. */
  visibleTo(seat, viewer) {
    const p = this.players[seat];
    const out = [];
    for (let i = 0; i < 2; i++) {
      const key = holeKey(seat, i);
      const mine = seat === viewer;
      const faceUp = i === p.shown;
      const mystery = this.isMystery(key);
      // A spectral bluff hides a face-up card from everyone but its owner.
      const hidden = faceUp && p.bluffing && !mine;
      out.push({
        key, index: i, faceUp,
        card: (mine || faceUp) && !hidden ? this.cardAt(key) : null,
        mystery: mystery || hidden,
        options: mine || faceUp ? this.haunting.optionsAt(key) : null,
        bluffed: hidden
      });
    }
    return out;
  }

  /* ================= starting a hand ================= */

  startHand() {
    this.handNo++;
    this.phase = 'betting';
    this.round = 0;
    this.revealed = 0;
    this.results = null;
    this.plain = new Map();
    this.haunting.reset();
    this.shoe = new Shoe(mulberry32(mix(this.seed, this.handNo * 7919)));
    this.collapseFired = false;

    // Blinds climb slowly. A game night wants a game that ends, but not one
    // that ends because the numbers ran away.
    this.ante = this.baseAnte * (1 + Math.floor((this.handNo - 1) / 6));
    this.bigBet = this.ante * 2;

    this.players.forEach((p) => {
      p.bet = 0; p.committed = 0; p.won = 0;
      p.folded = p.out; p.allIn = false; p.acted = false;
      p.charges = CHARGES_PER_HAND;
      p.bluffing = false;
      p.hole = [null, null];
      p.shown = Math.floor(this.rng() * 2);
      p.lastHand = null;
    });

    // Two hole cards each: one shown, one hidden.
    for (const p of this.live()) {
      for (let i = 0; i < 2; i++) {
        const c = this.shoe.draw();
        this.plain.set(holeKey(p.seat, i), c);
        p.hole[i] = c;
      }
    }
    // Five community cards, dealt now and revealed street by street.
    for (let i = 0; i < 5; i++) this.plain.set(boardKey(i), this.shoe.draw());

    this.maybeHauntBoard();

    const seats = this.liveSeats();
    const sb = seats.length === 2 ? seats[0] : seats[1 % seats.length];
    const bb = seats.length === 2 ? seats[1] : seats[2 % seats.length];
    this.forceBet(sb, this.ante);
    this.forceBet(bb, this.bigBet);
    this.currentBet = this.bigBet;
    this.minRaise = this.bigBet;
    this.actor = seats.length === 2 ? seats[0] : seats[3 % seats.length];
    if (!this.canAct(this.players[this.actor])) this.actor = this.nextActor(this.actor);

    this.note(`Hand ${this.handNo}. Antes are ${this.ante} and ${this.bigBet} candy.`);
    this.emit('handStart', { handNo: this.handNo });
    if (this.actor < 0) this.closeRound();
  }

  /**
   * Some hands start with a haunted community card. It is never the flop's
   * first card, so the opening board always reads as ordinary poker, and it
   * is off entirely for the first round so nobody meets a "?" before they
   * have played a normal hand.
   */
  maybeHauntBoard() {
    if (this.onboarding && this.handNo < 2) return;
    if (this.rng() > this.chaos + 0.2) return;
    const i = 1 + Math.floor(this.rng() * 4);
    const key = boardKey(i);
    const shown = this.plain.get(key);
    const alt = this.shoe.draw();
    this.haunting.haunt(key, shown, alt);
    this.plain.delete(key);
    this.emit('haunted', { key, where: 'board', index: i });
  }

  liveSeats() {
    const out = [];
    for (let k = 0; k < this.n; k++) {
      const i = (this.dealer + k) % this.n;
      if (!this.players[i].out) out.push(i);
    }
    return out;
  }

  /* ================= betting ================= */

  forceBet(seat, amount) {
    const p = this.players[seat];
    const pay = Math.min(Math.round(amount), p.candy);
    p.candy -= pay; p.bet += pay; p.committed += pay;
    if (p.candy === 0) p.allIn = true;
    return pay;
  }

  toCall(seat) {
    const p = this.players[seat];
    return Math.max(0, Math.min(this.currentBet - p.bet, p.candy));
  }

  minRaiseTo(seat) {
    const p = this.players[seat];
    return Math.min(this.currentBet + this.minRaise, p.bet + p.candy);
  }

  maxRaiseTo(seat) { return this.players[seat].bet + this.players[seat].candy; }

  fold() {
    if (this.phase !== 'betting') return false;
    const p = this.players[this.actor];
    p.folded = true; p.acted = true;
    this.note(`${p.name} folds.`);
    this.emit('fold', { seat: p.seat });
    this.afterAction();
    return true;
  }

  call() {
    if (this.phase !== 'betting') return false;
    const seat = this.actor, p = this.players[seat];
    const amount = this.toCall(seat);
    this.forceBet(seat, amount);
    p.acted = true;
    if (amount === 0) this.note(`${p.name} checks.`);
    else this.note(`${p.name} ${p.allIn ? 'is all in for' : 'calls'} ${amount}.`);
    this.emit(amount === 0 ? 'check' : 'call', { seat, amount, allIn: p.allIn });
    this.afterAction();
    return true;
  }

  raiseTo(to) {
    if (this.phase !== 'betting') return { ok: false, why: 'not betting' };
    const seat = this.actor, p = this.players[seat];
    const max = p.bet + p.candy;
    to = Math.round(to);
    if (to > max) return { ok: false, why: `You only have ${max} candy.` };
    const allIn = to === max;
    if (!allIn && to < this.currentBet + this.minRaise) {
      return { ok: false, why: `Raise to at least ${this.currentBet + this.minRaise}, or push it all in.` };
    }
    if (to <= p.bet) return { ok: false, why: 'That is not a raise.' };
    this.forceBet(seat, to - p.bet);
    if (p.bet > this.currentBet) {
      this.minRaise = Math.max(this.minRaise, p.bet - this.currentBet);
      this.currentBet = p.bet;
      this.players.forEach((q) => { if (q.seat !== seat) q.acted = false; });
    }
    p.acted = true;
    if (p.allIn) p.stats.allIns++;
    this.note(`${p.name} ${p.allIn ? 'shoves ALL their candy in' : 'raises to'} ${p.bet}.`);
    this.emit(p.allIn ? 'allin' : 'raise', { seat, amount: p.bet });
    this.afterAction();
    return { ok: true };
  }

  nextActor(from) {
    for (let k = 1; k <= this.n; k++) {
      const i = (from + k) % this.n, p = this.players[i];
      if (this.canAct(p) && (!p.acted || p.bet < this.currentBet)) return i;
    }
    return -1;
  }

  afterAction() {
    if (this.inHand().length <= 1) { this.endUncontested(); return; }
    const next = this.nextActor(this.actor);
    if (next < 0) { this.closeRound(); return; }
    this.actor = next;
  }

  closeRound() {
    this.players.forEach((p) => { p.bet = 0; p.acted = false; });
    this.currentBet = 0;
    this.minRaise = this.bigBet;

    while (this.round < 3) {
      this.round++;
      this.revealed = this.round === 1 ? 3 : this.revealed + 1;
      this.emit('street', { round: this.round, revealed: this.revealed });
      this.maybeCollapse();
      if (this.players.filter((p) => this.canAct(p)).length >= 2) {
        this.actor = this.firstToAct();
        if (this.actor >= 0) {
          this.note(`${STREETS[this.round]}.`);
          return;
        }
      }
    }
    this.showdown();
  }

  firstToAct() {
    const seats = this.liveSeats();
    for (let k = 1; k <= seats.length; k++) {
      const s = seats[k % seats.length];
      if (this.canAct(this.players[s])) return s;
    }
    return -1;
  }

  /* ================= powers ================= */

  /**
   * Use a power. `target` is a slot key for the ones that need one.
   * Returns { ok, why } or { ok: true, ...result } so the table can animate
   * exactly what changed — nothing in this mode is ever allowed to alter a
   * card silently.
   */
  usePower(seat, id, target) {
    const p = this.players[seat];
    const power = POWERS[id];
    if (!power) return { ok: false, why: 'no such power' };
    if (!this.availablePowers().includes(id)) return { ok: false, why: `${power.name} unlocks later tonight.` };
    if (this.phase !== 'betting') return { ok: false, why: 'Powers are for the betting rounds.' };
    if (p.folded || p.out) return { ok: false, why: 'You are out of this hand.' };
    if (p.charges < power.cost) return { ok: false, why: `Not enough charges — ${power.name} costs ${power.cost}.` };

    const result = this[`power_${id}`](p, target);
    if (!result.ok) return result;

    p.charges -= power.cost;
    this.emit('power', Object.assign({ seat, power: id }, result));
    return result;
  }

  power_MEASURE(p, target) {
    if (!target || !this.isMystery(target)) return { ok: false, why: 'Pick a "?" to reveal.' };
    const r = this.haunting.measure(target);
    p.stats.measures++;
    const names = [`${cardShort(r.card)}`].concat(r.cascade.map((c) => cardShort(c.card)));
    this.note(`${p.name} measures: ${names.join(' and ')}.`);
    return {
      ok: true, kind: 'measure', key: target, card: r.card,
      cascade: r.cascade,
      text: r.cascade.length
        ? `It was ${cardName(r.card)} — and its linked partner snapped to ${cardName(r.cascade[0].card)}.`
        : `It was ${cardName(r.card)}.`
    };
  }

  power_SWAP(p, target) {
    const own = [holeKey(p.seat, 0), holeKey(p.seat, 1)];
    if (!own.includes(target)) return { ok: false, why: 'Pick one of your own cards.' };
    if (this.isMystery(target)) return { ok: false, why: 'Measure it first — you cannot trade a maybe.' };
    const old = this.cardAt(target);
    const fresh = this.shoe.draw();
    if (this.haunting.has(target)) this.haunting.release(target);
    this.plain.set(target, fresh);
    const i = own.indexOf(target);
    p.hole[i] = fresh;
    p.stats.swaps++;
    this.note(`${p.name} swaps ${cardShort(old)} for ${cardShort(fresh)}.`);
    return { ok: true, kind: 'swap', key: target, from: old, to: fresh,
      text: `${cardName(old)} became ${cardName(fresh)}.` };
  }

  power_HAUNT(p, target) {
    const own = [holeKey(p.seat, 0), holeKey(p.seat, 1)];
    if (!own.includes(target)) return { ok: false, why: 'Pick one of your own cards.' };
    if (this.isMystery(target)) return { ok: false, why: 'That one is already a "?".' };
    const keep = this.cardAt(target);
    const alt = this.shoe.draw();
    this.plain.delete(target);
    if (!this.haunting.haunt(target, keep, alt)) {
      this.plain.set(target, keep);
      return { ok: false, why: 'Too much is haunted already. Measure something first.' };
    }
    p.stats.haunts++;
    this.note(`${p.name} haunts a card. It is now two cards at once.`);
    return { ok: true, kind: 'haunt', key: target, options: [keep, alt],
      text: `That card is now ${cardName(keep)} or ${cardName(alt)} — and will not decide until it is measured.` };
  }

  power_BLUFF(p) {
    if (p.bluffing) return { ok: false, why: 'You are already bluffing.' };
    p.bluffing = true;
    p.stats.bluffs++;
    this.note(`${p.name} pulls a spectral bluff. Their face-up card goes dark.`);
    return { ok: true, kind: 'bluff', seat: p.seat,
      text: 'Nobody else can see your face-up card. It might hold.' };
  }

  /**
   * A bluff is a gamble, and it is settled at the end of each street so the
   * table finds out in public. That timing is the joke: the bluff either
   * survives another round of betting or falls apart in front of everybody.
   */
  settleBluffs() {
    for (const p of this.inHand()) {
      if (!p.bluffing) continue;
      if (this.rng() < POWERS.BLUFF.risk) {
        p.bluffing = false;
        this.note(`${p.name}’s bluff collapses! Everyone can see it again.`);
        this.emit('bluffFailed', { seat: p.seat });
      }
    }
  }

  /* ================= the dealer interferes ================= */

  /**
   * Quantum Collapse. Rare, loud, and always announced before it lands, so
   * it reads as an event rather than as the game cheating. At most once a
   * hand, and never on the first round of the night.
   */
  maybeCollapse() {
    if (this.collapseFired) return null;
    if (this.onboarding && this.handNo < 3) return null;
    if (this.rng() > this.chaos * 0.45) return null;

    const options = ['measureAll', 'hauntBoard', 'entangle', 'swapBoard', 'candyRain'];
    const pending = this.haunting.pending();
    const usable = options.filter((o) => {
      if (o === 'measureAll') return pending.length > 0;
      if (o === 'entangle') return pending.length >= 2;
      return true;
    });
    const kind = usable[Math.floor(this.rng() * usable.length) % usable.length];
    this.collapseFired = true;

    const ev = this[`collapse_${kind}`]();
    for (const p of this.inHand()) p.stats.collapses++;
    this.emit('collapse', Object.assign({ kind }, ev));
    this.note(`QUANTUM COLLAPSE — ${ev.text}`);
    return ev;
  }

  collapse_measureAll() {
    const done = this.haunting.measureAll();
    return {
      title: 'Everything Decides At Once',
      text: done.length
        ? `every "?" on the table resolved: ${done.map((d) => cardShort(d.card)).join(', ')}.`
        : 'nothing was undecided. Awkward.',
      revealed: done
    };
  }

  collapse_hauntBoard() {
    const candidates = [];
    for (let i = 0; i < this.revealed; i++) {
      const k = boardKey(i);
      if (!this.haunting.has(k)) candidates.push(i);
    }
    if (!candidates.length) return { title: 'Nothing To Haunt', text: 'the board refused to cooperate.' };
    const i = candidates[Math.floor(this.rng() * candidates.length)];
    const key = boardKey(i);
    const keep = this.cardAt(key);
    const alt = this.shoe.draw();
    this.plain.delete(key);
    if (!this.haunting.haunt(key, keep, alt)) { this.plain.set(key, keep); return { title: 'Nothing Happened', text: 'the spirits were busy.' }; }
    return {
      title: 'A Card Forgets Itself',
      text: `community card ${i + 1} is now two cards at once.`,
      key, index: i
    };
  }

  collapse_entangle() {
    const pending = this.haunting.pending();
    if (pending.length < 2) return { title: 'Nothing To Link', text: 'not enough mystery to go round.' };
    const a = pending[0].key, b = pending[1].key;
    const kind = this.rng() < 0.5 ? LINK.SAME : LINK.OPPOSITE;
    if (!this.haunting.entangle(a, b, kind)) return { title: 'The Link Failed', text: 'they would not hold hands.' };
    return {
      title: 'Entangled!',
      text: `two mystery cards are now linked — measuring one decides the other, ${kind === LINK.SAME ? 'the same way' : 'the opposite way'}.`,
      a, b, kind
    };
  }

  collapse_swapBoard() {
    if (this.revealed < 2) return { title: 'Nothing To Swap', text: 'not enough board yet.' };
    let i = Math.floor(this.rng() * this.revealed);
    let j = Math.floor(this.rng() * this.revealed);
    if (i === j) j = (j + 1) % this.revealed;
    const ki = boardKey(i), kj = boardKey(j);
    if (this.haunting.has(ki) || this.haunting.has(kj)) {
      return { title: 'The Swap Fizzles', text: 'you cannot move what has not decided.' };
    }
    const ci = this.plain.get(ki), cj = this.plain.get(kj);
    this.plain.set(ki, cj); this.plain.set(kj, ci);
    return {
      title: 'The Board Shuffles Itself',
      text: `community cards ${i + 1} and ${j + 1} traded places.`,
      a: i, b: j
    };
  }

  collapse_candyRain() {
    const bonus = this.bigBet * 2;
    for (const p of this.inHand()) p.candy += bonus;
    return {
      title: 'Candy Rain',
      text: `${bonus} candy to everyone still in the hand. Nobody knows why.`,
      bonus
    };
  }

  /* ================= showdown ================= */

  endUncontested() {
    const winner = this.inHand()[0];
    const total = this.potTotal();
    winner.candy += total;
    winner.won = total;
    winner.handsWon++;
    winner.stats.candyWon += total;
    winner.stats.biggestPot = Math.max(winner.stats.biggestPot, total);
    if (winner.bluffing) winner.stats.bluffsWon++;
    this.results = {
      uncontested: true,
      pots: [{ amount: total, winners: [winner.seat], hand: null }],
      summary: `${winner.name} takes ${total} candy — everyone else folded.`,
      best: null
    };
    this.finish();
  }

  showdown() {
    this.phase = 'showdown';
    this.revealed = 5;

    // Everything left undecided decides now, in public.
    const collapsed = this.haunting.measureAll();
    if (collapsed.length) {
      this.emit('finalMeasure', { revealed: collapsed });
      this.note(`The last mysteries collapse: ${collapsed.map((c) => cardShort(c.card)).join(', ')}.`);
    }
    for (const p of this.players) p.bluffing = false;

    const board = this.boardCards();
    for (const p of this.players) {
      if (p.folded || p.out) { p.lastHand = null; continue; }
      const seven = this.holeCards(p.seat).concat(board).filter((c) => c !== null);
      p.lastHand = evaluate(seven);
      p.stats.showdowns++;
      if (p.lastHand.value > p.stats.bestHand) {
        p.stats.bestHand = p.lastHand.value;
        p.stats.bestHandName = describe(p.lastHand);
      }
      this.emit('reveal', { seat: p.seat, hand: p.lastHand });
    }

    const awarded = [];
    buildPots(this.players).forEach((pot) => {
      let contenders = pot.eligible.filter((i) => this.players[i].lastHand);
      if (!contenders.length) contenders = this.inHand().map((p) => p.seat);
      const best = Math.max(...contenders.map((i) => this.players[i].lastHand.value));
      const winners = contenders.filter((i) => this.players[i].lastHand.value === best);
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      winners.forEach((i, k) => {
        const got = share + (k < remainder ? 1 : 0);
        const p = this.players[i];
        p.candy += got; p.won += got;
        p.stats.candyWon += got;
        p.stats.biggestPot = Math.max(p.stats.biggestPot, pot.amount);
        if (p.bluffingThisHand) p.stats.bluffsWon++;
      });
      awarded.push({ amount: pot.amount, winners, hand: this.players[winners[0]].lastHand });
    });

    const winnerSeats = new Set();
    awarded.forEach((a) => a.winners.forEach((w) => winnerSeats.add(w)));
    winnerSeats.forEach((s) => { this.players[s].handsWon++; });
    for (const p of this.players) {
      if (p.won === 0 && p.committed > 0) p.stats.candyLost += p.committed;
    }

    const main = awarded[0];
    this.results = {
      uncontested: false,
      pots: awarded,
      best: main ? main.hand : null,
      summary: main ? this.describeResult(main) : 'Nobody wanted it.'
    };
    this.finish();
  }

  describeResult(pot) {
    const names = pot.winners.map((i) => this.players[i].name);
    const who = names.length === 1 ? names[0]
      : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    const verb = names.length > 1 ? 'split' : 'takes';
    return `${who} ${verb} ${pot.amount} candy with ${describe(pot.hand)}.`;
  }

  finish() {
    this.phase = 'over';
    // Record everyone's low-water mark *between* hands. Measuring it during
    // one would count every routine all-in as having been down to nothing,
    // and the comeback award would go to whoever shoved most recently.
    for (const p of this.players) p.stats.lowPoint = Math.min(p.stats.lowPoint, p.candy);
    this.note(this.results.summary);
    this.history.push({
      hand: this.handNo,
      winners: this.results.pots[0].winners.slice(),
      pot: this.results.pots.reduce((s, a) => s + a.amount, 0),
      hand_name: this.results.best ? describe(this.results.best) : null
    });
    this.emit('handOver', { results: this.results });
  }

  /**
   * Trick or Treat: nobody is eliminated from a party game. A player out of
   * candy is offered a refill, it is announced, and it is counted so the
   * final scoreboard still means something.
   */
  needsRefill() {
    return this.players.filter((p) => !p.out && p.candy <= 0);
  }

  refill(seat) {
    const p = this.players[seat];
    const amount = refillFor(p);
    p.candy += amount;
    p.refills++;
    p.allIn = false;
    this.note(`${p.name} takes a Trick or Treat refill: ${amount} candy.`);
    this.emit('refill', { seat, amount });
    return amount;
  }

  finished() {
    if (this.phase !== 'over') return null;
    if (this.maxHands && this.handNo >= this.maxHands) return 'all hands played';
    const withCandy = this.players.filter((p) => p.candy > 0);
    if (withCandy.length <= 1) return 'last one holding candy';
    return null;
  }

  nextHand() {
    if (this.finished()) return false;
    // Anybody flat broke is topped up before the next deal.
    for (const p of this.needsRefill()) this.refill(p.seat);
    do { this.dealer = (this.dealer + 1) % this.n; } while (this.players[this.dealer].out);
    this.startHand();
    return true;
  }

  standings() {
    return this.players.slice().sort((a, b) => b.candy - a.candy);
  }
}
