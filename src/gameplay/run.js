/**
 * gameplay/run.js — a run: rounds, shops, bosses and the record of it all.
 *
 * The Game object knows one table. The Run knows the campaign around it:
 * which round you are on, what you bought, which boss is next, and what to
 * hand the next Game.
 */
import { Game } from './game.js';
import { MODES, optionsFor, CHAOS_EVENTS, targetFor } from './modes.js';
import { bossFor, isBossRound } from './bosses.js';
import { chooseOpponents, PERSONAS } from '../ai/personalities.js';
import { HeroWatcher } from '../ai/brain.js';
import { starterDeck } from './cards.js';
import { SKILL } from './planner.js';
import { stock, priceFor, rerollCost, freeRerolls, COSMETICS } from './shop.js';
import { RelicSet } from './relics.js';
import { mulberry32, mix, seedFrom } from '../utils/rng.js';

export class Run {
  constructor(opts = {}) {
    this.mode = MODES[opts.mode] || MODES.student;
    this.seed = seedFrom(opts.seed);
    this.round = 0;
    this.bank = 0;                      // chips carried between rounds
    this.deck = (opts.deck || starterDeck()).slice();
    this.relics = [];
    this.cosmetics = (opts.cosmetics || []).slice();
    this.equipped = Object.assign({}, opts.equipped || {});
    this.heroName = opts.heroName || 'You';
    this.watcher = new HeroWatcher();
    this.log = [];
    this.rng = mulberry32(mix(this.seed, 0xBADA55));
    this.game = null;
    this.boss = null;
    this.shopState = null;
    this.stats = {
      handsPlayed: 0, handsWon: 0, folds: 0, raises: 0, calls: 0,
      gatesPlayed: 0, collapses: 0, coherences: 0, bossesBeaten: 0,
      chipsWon: 0, chipsLost: 0, bestScore: 0, entropySum: 0, entropyCount: 0,
      gateCounts: {}, biggestPot: 0
    };
    this.over = false;
    this.outcome = null;
  }

  get relicSet() { return new RelicSet(this.relics); }

  /** Start the next round. Returns the Game. */
  nextRound() {
    this.round++;
    const roundSeed = mix(this.seed, this.round * 31337);
    const rng = mulberry32(roundSeed);
    this.boss = this.mode.endless && isBossRound(this.round) ? bossFor(this.round, rng) : null;

    const seats = [{
      name: this.heroName, avatar: 'hero', bot: null,
      deck: this.deck.slice(), relics: this.relics.slice(),
      chips: this.mode.startChips + this.bank
    }];

    if (this.boss) {
      const copies = this.boss.twins ? 2 : 1;
      for (let i = 0; i < copies; i++) {
        seats.push({
          name: this.boss.twins ? `${this.boss.name} ${i + 1}` : this.boss.name,
          avatar: this.boss.avatar, bot: this.boss.persona, skill: this.boss.persona.skill,
          chips: Math.round((this.mode.startChips + this.bank) * (this.boss.twins ? 0.8 : 1.4))
        });
      }
      const extra = chooseOpponents(Math.max(0, (this.mode.bots || 3) - copies), rng);
      for (const p of extra) seats.push({ name: p.name, avatar: p.avatar, bot: p, skill: this.skillFor(p) });
    } else {
      for (const p of chooseOpponents(this.mode.bots || 3, rng)) {
        seats.push({ name: p.name, avatar: p.avatar, bot: p, skill: this.skillFor(p) });
      }
    }

    const options = optionsFor(this.mode, {
      seed: roundSeed, seats, round: this.round,
      modifier: this.boss || (this.mode.deal ? { deal: this.mode.deal } : null)
    });
    if (this.boss && this.boss.noise) options.noise = this.boss.noise;

    this.game = new Game(options);
    this.game.run = this;
    // Every round is a target, not a fight to the death. Survive the hand
    // limit with enough chips and you go shopping; fall short and the run
    // ends. This is what gives the shop something to be between.
    this.target = targetFor(this.mode, this.round, this.mode.startChips);
    this.startingChips = this.mode.startChips + this.bank;
    this.game.target = this.target;
    this.game.heroProfile = this.watcher.profile;
    this.chaosArmed = this.mode.chaos > 0;
    this.lastChaos = null;
    return this.game;
  }

  /** Difficulty scales with the round in Endless, and with the mode otherwise. */
  skillFor(persona) {
    if (!this.mode.endless) return this.mode.skill || persona.skill;
    const tier = Math.min(3, Math.floor((this.round - 1) / 3));
    const ladder = ['casual', 'student', 'master', 'perfect'];
    return SKILL[ladder[tier]] || persona.skill;
  }

  /** Fire a chaos event, if this mode has them. Called on every street. */
  fireChaos() {
    if (!this.chaosArmed || !this.game) return null;
    const ev = CHAOS_EVENTS[Math.floor(this.rng() * CHAOS_EVENTS.length) % CHAOS_EVENTS.length];
    ev.fire(this.game);
    this.lastChaos = ev;
    this.game.note(`${ev.name}: ${ev.blurb}`);
    this.game.emit('chaos', { key: ev.key, name: ev.name, icon: ev.icon, blurb: ev.blurb });
    return ev;
  }

  /** Fold this round's result into the run. */
  finishRound() {
    const g = this.game;
    if (!g) return null;
    const hero = g.hero();
    const won = hero.chips;
    const start = this.mode.startChips + this.bank;
    const delta = won - start;
    this.bank = Math.max(0, won - this.mode.startChips);

    if (this.boss && !hero.out) this.stats.bossesBeaten++;

    const survived = !hero.out && hero.chips >= this.target;
    this.log.push({
      round: this.round, boss: this.boss ? this.boss.key : null,
      chips: won, target: this.target, delta, hands: g.handNo, survived
    });

    if (!survived) {
      this.over = true;
      this.outcome = {
        win: false, round: this.round, chips: won, target: this.target,
        reason: hero.out ? 'busted' : `short of ${this.target} by ${this.target - won}`
      };
    } else if (this.mode.maxHands && !this.mode.endless) {
      this.over = true;
      this.outcome = { win: true, reason: 'all hands played', round: this.round, chips: won };
    }
    return { delta, survived, chips: won, target: this.target };
  }

  /* ---- shop ---- */

  openShop() {
    this.shopState = {
      rerolls: 0,
      spent: 0,
      items: stock(this.seed, this.round, 0, { relics: this.relics, cosmetics: this.cosmetics }),
      bought: []
    };
    return this.shopState;
  }

  reroll() {
    const s = this.shopState;
    if (!s) return null;
    const cost = rerollCost(s.rerolls, this.relicSet);
    if (cost > this.bank) return { ok: false, why: 'Not enough chips to reroll.' };
    this.bank -= cost;
    s.rerolls++;
    s.items = stock(this.seed, this.round, s.rerolls, { relics: this.relics, cosmetics: this.cosmetics });
    return { ok: true, cost, free: cost === 0 };
  }

  buy(index, arg) {
    const s = this.shopState;
    if (!s) return { ok: false, why: 'shop is closed' };
    const item = s.items[index];
    if (!item || item.sold) return { ok: false, why: 'gone' };
    const price = priceFor(item, this.relicSet);
    if (price > this.bank) return { ok: false, why: `Costs ${price}; you have ${this.bank}.` };

    switch (item.kind) {
      case 'card': this.deck.push(item.id); break;
      case 'relic': this.relics.push(item.id); break;
      case 'cosmetic':
        this.cosmetics.push(item.id);
        this.equipped[COSMETICS[item.id].kind] = item.id;
        break;
      case 'service':
        if (item.id === 'burn') {
          const i = this.deck.indexOf(arg);
          if (i < 0) return { ok: false, why: 'pick a card from your deck to remove' };
          this.deck.splice(i, 1);
        } else {
          if (!this.deck.includes(arg)) return { ok: false, why: 'pick a card from your deck to copy' };
          this.deck.push(arg);
        }
        break;
      default: return { ok: false, why: 'unknown item' };
    }

    this.bank -= price;
    s.spent += price;
    item.sold = true;
    s.bought.push(item);
    return { ok: true, price, item };
  }

  rerollPrice() { return rerollCost(this.shopState ? this.shopState.rerolls : 0, this.relicSet); }
  freeRerollsLeft() {
    const used = this.shopState ? this.shopState.rerolls : 0;
    return Math.max(0, freeRerolls(this.relicSet) - used);
  }

  /* ---- stats ---- */

  recordHand(game) {
    const hero = game.hero();
    const s = this.stats;
    s.handsPlayed++;
    if (hero.won > 0) s.handsWon++;
    if (hero.folded) s.folds++;
    if (hero.score !== null) {
      s.bestScore = Math.max(s.bestScore, hero.score);
      if (hero.score === game.coins) s.coherences++;
    }
    if (hero.entropy !== undefined) { s.entropySum += hero.entropy; s.entropyCount++; }
    for (const pl of hero.plays || []) {
      s.gatesPlayed++;
      s.gateCounts[pl.card] = (s.gateCounts[pl.card] || 0) + 1;
      if (pl.outcomes && pl.outcomes.length) s.collapses++;
    }
    const pot = game.results ? game.results.pots.reduce((a, b) => a + b.amount, 0) : 0;
    s.biggestPot = Math.max(s.biggestPot, pot);
    if (hero.won > 0) s.chipsWon += hero.won; else s.chipsLost += hero.committed;
  }

  get favouriteGate() {
    const e = Object.entries(this.stats.gateCounts).sort((a, b) => b[1] - a[1])[0];
    return e ? e[0] : null;
  }

  get averageEntropy() {
    return this.stats.entropyCount ? this.stats.entropySum / this.stats.entropyCount : 0;
  }

  /** A compact serialisable snapshot, for saves and for seed sharing. */
  snapshot() {
    return {
      mode: this.mode.key, seed: this.seed, round: this.round, bank: this.bank,
      deck: this.deck.slice(), relics: this.relics.slice(),
      cosmetics: this.cosmetics.slice(), equipped: Object.assign({}, this.equipped),
      stats: JSON.parse(JSON.stringify(this.stats)), log: this.log.slice(),
      over: this.over, outcome: this.outcome
    };
  }

  static restore(snap) {
    const r = new Run({ mode: snap.mode, seed: snap.seed, deck: snap.deck, cosmetics: snap.cosmetics, equipped: snap.equipped });
    r.round = snap.round; r.bank = snap.bank; r.relics = snap.relics.slice();
    r.stats = snap.stats; r.log = snap.log || []; r.over = snap.over; r.outcome = snap.outcome;
    return r;
  }
}
