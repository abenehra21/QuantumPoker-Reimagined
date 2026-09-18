/**
 * gameplay/game.js — the rules.
 *
 * Chips, blinds, streets, side pots, the card phase, the showdown. Everything
 * the original Quantum Poker had, plus the things a run needs: per-player
 * circuits, status effects, relics, noise and boss modifiers.
 *
 * No DOM anywhere in this file. The whole game can be driven from a script,
 * which is how the bots, the self-checks and the replay system use it.
 */
import { QState } from '../quantum/state.js';
import { Circuit } from '../quantum/circuit.js';
import { dealBoard, readCoin, findLinks, expectedScore, entropy, scoreDistribution } from '../quantum/read.js';
import { PROFILES, NoiseProfile } from '../quantum/noise.js';
import { CARDS, playCard, legal, starterDeck } from './cards.js';
import { plan, SKILL, describeLine } from './planner.js';
import { StatusSet } from './status.js';
import { RelicSet } from './relics.js';
import { mulberry32, mix, shuffle, pickWeighted } from '../utils/rng.js';

export const RANKS = ['Blank', 'One', 'Pair', 'Trips', 'Quads', 'Coherence'];
export const STREETS = ['Deal', 'Flop', 'Turn', 'River'];

/**
 * Most coins on 1 wins. Tied counts go to whoever has a 1 further left —
 * coin 1 is the ace — so five coins read like a hand with a kicker.
 */
export function rankKey(bits) {
  let value = 0;
  bits.forEach((b, i) => { value += b << (bits.length - 1 - i); });
  return bits.reduce((a, b) => a + b, 0) * (1 << bits.length) + value;
}

export function rankName(score) {
  return RANKS[Math.max(0, Math.min(RANKS.length - 1, score))];
}

/** Main pot plus side pots, each with the seats allowed to win it. */
export function buildPots(players) {
  const levels = [];
  players.forEach((p) => { if (p.committed > 0 && !levels.includes(p.committed)) levels.push(p.committed); });
  levels.sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  levels.forEach((lvl) => {
    let amount = 0;
    const eligible = [];
    players.forEach((p, i) => {
      amount += Math.min(p.committed, lvl) - Math.min(p.committed, prev);
      if (p.committed >= lvl && !p.folded) eligible.push(i);
    });
    if (amount > 0) pots.push({ amount, eligible });
    prev = lvl;
  });
  return pots;
}

export class Game {
  /**
   * opts:
   *   seats        [{ name, avatar, bot, skill, relics, deck }]
   *   seed         integer; a seed replays the same deals whatever anyone does
   *   noise        a NoiseProfile, or a key of PROFILES
   *   coins        board width (5)
   *   handSize     cards dealt to each seat (3)
   *   modifier     a boss rule object, or null
   */
  constructor(opts) {
    this.seed = (opts.seed === undefined || opts.seed === null) ? (Date.now() & 0x7fffffff) : opts.seed >>> 0;
    this.rng = mulberry32(mix(this.seed, 0xC0FFEE));   // measurement + bot dice
    this.startChips = opts.startChips || 1000;
    this.baseBlind = opts.smallBlind || 10;
    this.handsPerLevel = opts.handsPerLevel || 5;
    this.maxHands = opts.maxHands || 0;
    this.coins = opts.coins || 5;
    this.handSize = opts.handSize || 3;
    this.modifier = opts.modifier || null;
    this.noise = typeof opts.noise === 'string' ? PROFILES[opts.noise] : (opts.noise || PROFILES.clean);
    this.handNo = 0;
    this.dealer = 0;
    this.log = [];
    this.history = [];
    this.events = [];

    this.players = opts.seats.map((s, i) => ({
      seat: i, name: s.name, avatar: s.avatar || 0, bot: s.bot || null,
      skill: s.skill || SKILL.student,
      chips: s.chips === undefined ? this.startChips : s.chips,
      deck: (s.deck || starterDeck()).slice(),
      relics: new RelicSet(s.relics || []),
      status: new StatusSet(),
      bet: 0, committed: 0,
      folded: false, allIn: false, acted: false, out: false,
      hand: [], board: null, circuit: null, plays: [], noiseLog: [],
      bits: null, score: null, rankKey: 0, won: 0, handsWon: 0,
      usedSecondLife: false,
      /** Rewind needs a way back; a measurement cannot be undone. */
      rewindLast: () => this.rewind(i)
    }));
    this.n = this.players.length;
    if (this.modifier && this.modifier.setup) this.modifier.setup(this);
    this.startHand();
  }

  /* ---- queries ---- */

  live() { return this.players.filter((p) => !p.out); }
  inHand() { return this.players.filter((p) => !p.out && !p.folded); }
  humans() { return this.players.filter((p) => !p.bot); }
  hero() { return this.humans()[0] || this.players[0]; }
  canAct(p) { return !p.out && !p.folded && !p.allIn && p.chips > 0; }
  potTotal() { return this.players.reduce((s, p) => s + p.committed, 0); }
  current() { return this.actor >= 0 ? this.players[this.actor] : null; }

  street() {
    return this.phase === 'gates' ? 'Card phase'
      : this.phase === 'betting' ? STREETS[this.round]
      : 'Showdown';
  }

  /** Seats still in the game, starting from the dealer. */
  liveSeats() {
    const out = [];
    for (let k = 0; k < this.n; k++) {
      const i = (this.dealer + k) % this.n;
      if (!this.players[i].out) out.push(i);
    }
    return out;
  }

  note(text) {
    this.message = text;
    this.log.push(text);
    if (this.log.length > 120) this.log.shift();
  }

  /** Anything the UI should animate. Drained by the presenter each frame. */
  emit(type, data) {
    this.events.push(Object.assign({ type, at: this.handNo }, data || {}));
    return this;
  }

  drain() {
    const e = this.events;
    this.events = [];
    return e;
  }

  /* ---- starting a hand ---- */

  startHand() {
    this.handNo++;
    this.blindLevel = Math.min(8, Math.floor((this.handNo - 1) / this.handsPerLevel));
    this.smallBlind = this.baseBlind * Math.pow(2, this.blindLevel);
    this.bigBlind = this.smallBlind * 2;
    this.phase = 'betting';
    this.round = 0;
    this.revealed = 0;
    this.results = null;
    this.lastCollapse = null;

    const dealRng = mulberry32(mix(this.seed, this.handNo));
    const flavour = this.modifier && this.modifier.deal ? this.modifier.deal : {};
    this.origin = dealBoard(dealRng, this.coins, flavour);

    this.players.forEach((p) => {
      p.bet = 0; p.committed = 0; p.won = 0;
      p.folded = p.out; p.allIn = false; p.acted = false;
      p.score = null; p.bits = null; p.plays = []; p.noiseLog = [];
      p.raisedStreet = -1;
      p.board = this.origin.clone();
      p.circuit = new Circuit(this.coins, this.origin);
      p.hand = [];
      p.status.endHand();
      if (p.relics.flag('alwaysOracle')) p.status.add('oracle', { hand: true });
      p.relics.list.forEach((r) => { if (r.handStart) r.handStart(this, this, p.seat); });
    });

    this.dealCards(dealRng);

    // Blinds sit left of the dealer. Heads-up, the dealer posts the small
    // blind and acts first before the flop; after it, the other seat does.
    const seats = this.liveSeats();
    const hu = seats.length === 2;
    const sb = hu ? seats[0] : seats[1 % seats.length];
    const bb = hu ? seats[1] : seats[2 % seats.length];
    this.sbSeat = sb; this.bbSeat = bb;
    this.forceBet(sb, this.blindFor(sb, this.smallBlind));
    this.forceBet(bb, this.blindFor(bb, this.bigBlind));
    this.currentBet = this.bigBlind;
    this.minRaise = this.bigBlind;

    this.actor = hu ? seats[0] : seats[3 % seats.length];
    if (!this.canAct(this.players[this.actor])) this.actor = this.nextActor(this.actor);
    this.note(`Hand ${this.handNo} — blinds ${this.smallBlind}/${this.bigBlind}.`);
    this.emit('handStart', { handNo: this.handNo });
    if (this.modifier && this.modifier.handStart) this.modifier.handStart(this);
    if (this.actor < 0) this.closeRound();
  }

  blindFor(seat, amount) {
    return this.players[seat].relics.chain('blindDiscount', amount, {});
  }

  /**
   * Deal from each seat's own deck. Relic weights bias the draw, and
   * No-Cloning stops an opponent holding a card the hero already has.
   */
  dealCards(rng) {
    const seats = this.liveSeats();
    const heroSeat = this.hero().seat;
    const heroCards = [];
    for (const seat of seats) {
      const p = this.players[seat];
      const size = this.handSize + p.relics.sum('extraCards') + (this.modifier && this.modifier.extraCards ? this.modifier.extraCards(p) : 0);
      const granted = p.relics.granted();
      p.hand = granted.slice(0, size);
      const pool = p.deck.slice();
      let guard = 0;
      while (p.hand.length < size && pool.length && guard++ < 200) {
        const weights = pool.map((id) => p.relics.weightFor(id));
        const pickId = pickWeighted(pool, weights, rng);
        pool.splice(pool.indexOf(pickId), 1);
        if (p.bot && this.players[heroSeat].relics.flag('noCloning') && heroCards.includes(pickId)) continue;
        p.hand.push(pickId);
      }
      if (seat === heroSeat) heroCards.push(...p.hand);
      p.hand.sort(handOrder);
    }
  }

  /** Draw one more card mid-hand. Idle and a few relics do this. */
  draw(seat, count = 1) {
    const p = this.players[seat];
    const rng = this.rng;
    const got = [];
    for (let i = 0; i < count; i++) {
      const pool = p.deck.slice();
      if (!pool.length) break;
      const id = pickWeighted(pool, pool.map((c) => p.relics.weightFor(c)), rng);
      p.hand.push(id);
      got.push(id);
    }
    p.hand.sort(handOrder);
    if (got.length) this.emit('draw', { seat, cards: got });
    return got;
  }

  /* ---- betting ---- */

  forceBet(seat, amount) {
    const p = this.players[seat];
    const pay = Math.min(amount, p.chips);
    p.chips -= pay; p.bet += pay; p.committed += pay;
    if (p.chips === 0) p.allIn = true;
    return pay;
  }

  toCall(seat) {
    const p = this.players[seat];
    return Math.max(0, Math.min(this.currentBet - p.bet, p.chips));
  }

  minRaiseTo(seat) {
    const p = this.players[seat];
    return Math.min(this.currentBet + this.minRaise, p.bet + p.chips);
  }

  maxRaiseTo(seat) { return this.players[seat].bet + this.players[seat].chips; }

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
    this.note(amount === 0 ? `${p.name} checks.` : `${p.name}${p.allIn ? ' calls all in for ' : ' calls '}${amount}.`);
    this.emit(amount === 0 ? 'check' : 'call', { seat, amount });
    this.afterAction();
    return true;
  }

  /** Raise the total bet this street to `to`. */
  raiseTo(to) {
    if (this.phase !== 'betting') return { ok: false, why: 'not betting' };
    const seat = this.actor, p = this.players[seat];
    const max = p.bet + p.chips;
    to = Math.round(to);
    if (to > max) return { ok: false, why: `You only have ${max}.` };
    const allIn = to === max;
    if (!allIn && to < this.currentBet + this.minRaise) {
      return { ok: false, why: `Raise to at least ${this.currentBet + this.minRaise}, or go all in.` };
    }
    if (to <= p.bet) return { ok: false, why: 'That is not a raise.' };
    this.forceBet(seat, to - p.bet);
    if (p.bet > this.currentBet) {
      this.minRaise = Math.max(this.minRaise, p.bet - this.currentBet);
      this.currentBet = p.bet;
      this.players.forEach((q) => { if (q.seat !== seat) q.acted = false; });
    }
    p.acted = true;
    this.note(`${p.name}${p.allIn ? ' goes all in for ' : ' raises to '}${p.bet}.`);
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
    if (this.inHand().length <= 1) { this.endHandUncontested(); return; }
    const next = this.nextActor(this.actor);
    if (next < 0) { this.closeRound(); return; }
    this.actor = next;
  }

  closeRound() {
    this.players.forEach((p) => { p.bet = 0; p.acted = false; p.status.endStreet(); });
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    while (this.round < 3) {
      this.round++;
      this.revealed = this.round === 1 ? 3 : this.revealed + 1;
      this.applyNoise('street');
      if (this.players.filter((p) => this.canAct(p)).length >= 2) {
        this.actor = this.firstToAct();
        if (this.actor >= 0) {
          this.note(`${STREETS[this.round]} — ${this.revealed} coins showing.`);
          this.emit('street', { round: this.round, revealed: this.revealed });
          return;
        }
      }
    }
    this.startGatePhase();
  }

  /** After the flop the first live seat left of the dealer opens. */
  firstToAct() {
    const seats = this.liveSeats();
    for (let k = 1; k <= seats.length; k++) {
      const s = seats[k % seats.length];
      if (this.canAct(this.players[s])) return s;
    }
    return -1;
  }

  /* ---- noise ---- */

  /**
   * Roll the noise profile against every live board. Frozen coins, the
   * Mitigated status and shielding relics all reduce it, and every event is
   * logged so Echo can undo exactly what happened.
   */
  applyNoise(when, seat) {
    if (!this.noise || !this.noise.active) return [];
    if (when === 'street' && !this.noise.perStreet) return [];
    if (when === 'gate' && !this.noise.perGate) return [];
    const all = [];
    const targets = seat === undefined ? this.inHand() : [this.players[seat]];
    for (const p of targets) {
      if (!p.board) continue;
      if (p.status.has('mitigated')) continue;
      const immunity = Math.max(p.relics.immunity({ round: this.round }), 0);
      const frozen = p.status.frozenCoins();
      const allowed = [];
      for (let q = 0; q < this.coins; q++) if (!frozen.includes(q)) allowed.push(q);
      if (!allowed.length) continue;
      const evs = this.noise.tick(p.board, this.rng, immunity, allowed);
      for (const e of evs) {
        p.noiseLog.push(e);
        p.circuit.add('noise', [e.q], null, { note: e.text, channel: e.channel });
        all.push(Object.assign({ seat: p.seat }, e));
      }
      if (evs.length && !p.bot) this.note(evs.map((e) => e.hidden ? 'something shifted' : e.text).join('; ') + '.');
    }
    if (all.length) this.emit('noise', { events: all });
    return all;
  }

  /* ---- the card phase ---- */

  startGatePhase() {
    this.phase = 'gates';
    this.revealed = this.coins;
    this.gateOrder = this.liveSeats().filter((s) => !this.players[s].folded);
    this.gateIdx = 0;
    this.actor = this.gateOrder.length ? this.gateOrder[0] : -1;
    if (this.actor < 0) { this.showdown(); return; }
    this.note('Everyone plays their cards on their own copy of the board.');
    this.emit('gatePhase', {});
  }

  /** Play a card from the acting seat's hand. */
  playCard(id, targets) {
    if (this.phase !== 'gates') return { ok: false, why: 'not the card phase' };
    const p = this.players[this.actor];
    const idx = p.hand.indexOf(id);
    if (idx < 0) return { ok: false, why: `no ${CARDS[id] ? CARDS[id].name : id} in hand` };
    const check = legal(id, targets, p.board);
    if (!check.ok) return check;
    const frozen = p.status.frozenCoins();
    if (targets.some((t) => frozen.includes(t))) return { ok: false, why: 'that coin is frozen' };

    const before = p.board.clone();
    const opsBefore = p.circuit.ops.length;
    // Spend the card *before* applying it. Rewind and Idle both rewrite the
    // hand from inside their effect, so an index taken beforehand is stale by
    // the time the card is done.
    p.hand.splice(idx, 1);
    const res = playCard(id, targets, {
      state: p.board, circuit: p.circuit, rng: this.rng, player: p, game: this
    });

    if (res.status) p.status.add(res.status.key, res.status);
    if (res.draw) this.draw(p.seat, res.draw);
    if (CARDS[id].global) this.applyGlobal(id, p);
    if (p.relics.flag('kickback') && id === 'Z') this.kickback(p);
    if (p.autoFreeze) this.autoFreeze(p);

    const play = {
      card: id, targets: targets.slice(), outcomes: res.outcomes,
      note: res.note || '', reveal: res.reveal || null, fx: res.fx || null,
      opsFrom: opsBefore, before
    };
    p.plays.push(play);
    if (res.outcomes && res.outcomes.length) {
      this.lastCollapse = { seat: p.seat, coin: res.outcomes[0].coin, bit: res.outcomes[0].bit };
    }
    this.emit('play', { seat: p.seat, card: id, targets: targets.slice(), fx: res.fx, note: res.note });
    this.applyNoise('gate', p.seat);
    if (p.status.has('decoherence')) this.applyNoise('gate', p.seat);
    return Object.assign({ ok: true, play }, res);
  }

  /** Cards marked `global` reach every other live board. */
  applyGlobal(id, from) {
    for (const q of this.inHand()) {
      if (q.seat === from.seat) continue;
      if (q.status.has('mitigated')) continue;
      const frozen = q.status.frozenCoins();
      for (let c = 0; c < this.coins; c++) {
        if (frozen.includes(c)) continue;
        if (this.rng() < 0.5) { q.board.z(c); q.circuit.add('z', [c], null, { card: id, foreign: true }); }
      }
    }
    this.emit('globalCard', { card: id, from: from.seat });
  }

  kickback(from) {
    const others = this.inHand().filter((q) => q.seat !== from.seat && !q.status.has('mitigated'));
    if (!others.length) return;
    const victim = others[Math.floor(this.rng() * others.length)];
    const c = Math.floor(this.rng() * this.coins);
    victim.board.z(c);
    victim.circuit.add('z', [c], null, { foreign: true, note: 'phase kickback' });
    this.emit('kickback', { from: from.seat, to: victim.seat, coin: c });
  }

  /** Zeno Clamp: the first coin to reach a certain 1 gets frozen. */
  autoFreeze(p) {
    if (p.status.frozenCoins().length) return;
    for (let q = 0; q < this.coins; q++) {
      if (p.board.probOne(q) > 1 - 1e-9) {
        p.status.add('frozen', { coin: q, hand: true });
        this.emit('freeze', { seat: p.seat, coin: q });
        return;
      }
    }
  }

  /**
   * Rewind: undo the last play by replaying the circuit without it. Only
   * reversible plays qualify — a measurement is the one thing in quantum
   * mechanics that cannot be taken back, and the card says so.
   */
  rewind(seat) {
    const p = this.players[seat];
    for (let i = p.plays.length - 1; i >= 0; i--) {
      const pl = p.plays[i];
      if (pl.card === 'REWIND') continue;
      if (pl.outcomes && pl.outcomes.length) return null;   // a measurement stands
      p.board.copyFrom(pl.before);
      p.circuit.ops.length = pl.opsFrom;
      p.plays.splice(i, 1);
      p.hand.push(pl.card);
      p.hand.sort(handOrder);
      this.emit('rewind', { seat, card: pl.card });
      return CARDS[pl.card].name;
    }
    return null;
  }

  /** The best next play for a seat, or null if nothing helps. */
  hint(seat, skill) {
    const p = this.players[seat];
    const res = plan(p.board, p.hand, {
      upTo: this.coins, skill: skill || SKILL.master,
      blocked: p.status.frozenCoins(), rng: this.rng
    });
    if (!res.first) return null;
    return {
      card: res.first.card, targets: res.first.targets,
      line: res.line, text: describeLine(res.line), value: res.value, gain: res.gain
    };
  }

  endTurn() {
    if (this.phase !== 'gates') return;
    this.gateIdx++;
    if (this.gateIdx < this.gateOrder.length) { this.actor = this.gateOrder[this.gateIdx]; return; }
    this.showdown();
  }

  /* ---- finishing ---- */

  /** Run every payout hook a winner has. */
  payout(seat, amount, ctx) {
    const p = this.players[seat];
    return Math.max(0, Math.round(p.relics.chain('payout', amount, ctx)));
  }

  endHandUncontested() {
    const winner = this.inHand()[0];
    const total = this.potTotal();
    const got = this.payout(winner.seat, total, { uncontested: true, score: null });
    winner.chips += got; winner.won = got; winner.handsWon++;
    this.results = {
      uncontested: true,
      pots: [{ amount: got, winners: [winner.seat], score: null }],
      summary: `${winner.name}${winner.name === 'You' ? ' take ' : ' takes '}${got} — everyone else folded.`
    };
    this.finishHand();
  }

  showdown() {
    this.phase = 'showdown';
    this.revealed = this.coins;

    this.players.forEach((p) => {
      if (p.folded || p.out) { p.score = null; p.bits = null; return; }
      p.entropy = entropy(p.board);
      p.dist = scoreDistribution(p.board);
      p.links = findLinks(p.board);
      p.relics.list.forEach((r) => { if (r.onShowdown) r.onShowdown(p.board, { note: (t) => this.note(t) }); });
      if (p.status.has('amplified')) {
        for (let q = 0; q < this.coins; q++) {
          const pr = p.board.probOne(q);
          if (pr > 0.5 && pr < 1 - 1e-9) p.board.ry(q, 2 * (Math.asin(Math.sqrt(Math.min(1, pr * 1.25))) - Math.asin(Math.sqrt(pr))));
        }
      }
      p.bits = p.board.measure(this.rng);
      p.score = p.bits.reduce((a, b) => a + b, 0);
      p.rankKey = rankKey(p.bits);
      p.linkedScored = p.links.some((l) => p.bits[l.a] === 1 && p.bits[l.b] === 1);
      this.emit('measure', { seat: p.seat, bits: p.bits.slice(), score: p.score });
    });

    const awarded = [];
    buildPots(this.players).forEach((pot) => {
      let contenders = pot.eligible.filter((i) => this.players[i].score !== null);
      if (!contenders.length) contenders = this.inHand().map((p) => p.seat);
      const bestKey = Math.max(...contenders.map((i) => this.players[i].rankKey));
      const winners = contenders.filter((i) => this.players[i].rankKey === bestKey);
      const best = this.players[winners[0]].score;
      const share = Math.floor(pot.amount / winners.length);
      const remainder = pot.amount - share * winners.length;
      winners.forEach((i, k) => {
        const p = this.players[i];
        const raw = share + (k < remainder ? 1 : 0);
        const got = this.payout(i, raw, {
          score: p.score, entropy: p.entropy, linkedScored: p.linkedScored, uncontested: false
        });
        p.chips += got; p.won += got;
      });
      awarded.push({ amount: pot.amount, winners, score: best });
    });

    const winnerSeats = new Set();
    awarded.forEach((a) => a.winners.forEach((w) => winnerSeats.add(w)));
    winnerSeats.forEach((s) => { this.players[s].handsWon++; });

    this.results = { uncontested: false, pots: awarded, summary: this.describeResult(awarded) };
    this.finishHand();
  }

  describeResult(awarded) {
    const main = awarded[0];
    if (!main) return 'No chips changed hands.';
    const names = main.winners.map((i) => this.players[i].name);
    const who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
    const total = awarded.reduce((s, a) => s + a.amount, 0);
    const verb = names.length > 1 ? ' split ' : names[0] === 'You' ? ' win ' : ' wins ';
    return `${who}${verb}${total} with ${rankName(main.score)} (${main.score} coin${main.score === 1 ? '' : 's'} on 1).`;
  }

  finishHand() {
    this.phase = 'over';
    this.note(this.results.summary);
    this.players.forEach((p) => {
      if (p.out || p.chips > 0) return;
      // Schrödinger's Chip: until somebody opens the box, you are still in.
      if (p.relics.flag('secondLife') && !p.usedSecondLife && this.rng() < 0.5) {
        p.usedSecondLife = true;
        p.chips = Math.round(this.startChips / 2);
        this.note(`${p.name} was still in the box. Back with ${p.chips}.`);
        this.emit('secondLife', { seat: p.seat });
        return;
      }
      p.out = true; p.chips = 0;
      this.emit('bust', { seat: p.seat });
    });
    this.history.push({
      hand: this.handNo,
      winners: this.results.pots[0].winners.slice(),
      score: this.results.pots[0].score,
      pot: this.results.pots.reduce((s, a) => s + a.amount, 0),
      scores: this.players.map((p) => p.score)
    });
    this.emit('handOver', { results: this.results });
  }

  /** Why the game is over, or null if it is not. */
  finished() {
    if (this.phase !== 'over') return null;
    if (this.live().length <= 1) return 'last one standing';
    if (this.humans().length && this.humans().every((p) => p.out)) return 'busted';
    if (this.maxHands && this.handNo >= this.maxHands) return 'all hands played';
    return null;
  }

  nextHand() {
    if (this.finished()) return false;
    do { this.dealer = (this.dealer + 1) % this.n; } while (this.players[this.dealer].out);
    this.startHand();
    return true;
  }

  standings() { return this.players.slice().sort((a, b) => b.chips - a.chips); }
}

/** Hand order: by rarity, then by name, so a hand always reads the same way. */
const RARITY_RANK = { common: 0, rare: 1, epic: 2, legendary: 3 };
function handOrder(a, b) {
  const ca = CARDS[a], cb = CARDS[b];
  if (!ca || !cb) return 0;
  const d = RARITY_RANK[ca.rarity] - RARITY_RANK[cb.rarity];
  return d !== 0 ? d : ca.name.localeCompare(cb.name);
}
