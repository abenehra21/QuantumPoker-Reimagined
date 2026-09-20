/**
 * halloween/match.js — a night of it.
 *
 * The game object knows one hand. The match knows the evening: how many
 * hands are left, who needs topping up, which power unlocked just now, and
 * what the scoreboard says at the end.
 *
 * Length is the design constraint. A party game that overstays is a party
 * game nobody plays twice, so a match is a fixed number of hands rather
 * than a fight to the last candy — everybody finishes at the same moment
 * and the next group can sit down.
 */
import { TrickOrTreat } from './game.js';
import { pickMonsters } from './monsters.js';
import { applyTilt, coolDown } from './brain.js';
import { handOut, headline } from './awards.js';
import { newlyUnlocked, POWERS } from './powers.js';
import { mulberry32, seedFrom } from '../utils/rng.js';

/** Match lengths, in hands. Named for how long they actually take. */
export const LENGTHS = {
  quick:  { key: 'quick',  name: 'Quick Fright', hands: 8,  blurb: 'About five minutes.' },
  normal: { key: 'normal', name: 'Full Haunt',   hands: 14, blurb: 'Ten minutes or so. The default.' },
  long:   { key: 'long',   name: 'All Hallows',  hands: 22, blurb: 'Fifteen minutes. Bring snacks.' }
};

export class Match {
  /**
   * opts:
   *   seed       shareable; the same seed deals the same night
   *   length     'quick' | 'normal' | 'long'
   *   opponents  how many monsters (1..5)
   *   humans     names of the people at the keyboard (1 for solo)
   *   candy      starting candy each
   *   chaos      0..1
   *   onboarding drip-feed the powers over the first hands
   */
  constructor(opts = {}) {
    this.seed = seedFrom(opts.seed);
    this.length = LENGTHS[opts.length] || LENGTHS.normal;
    this.chaos = opts.chaos === undefined ? 0.28 : opts.chaos;
    this.onboarding = opts.onboarding !== false;
    this.startCandy = opts.candy || 50;
    this.humanNames = (opts.humans && opts.humans.length ? opts.humans : ['You']).slice(0, 5);
    this.rng = mulberry32(this.seed);

    const wanted = Math.max(1, Math.min(5, opts.opponents === undefined ? 3 : opts.opponents));
    const room = Math.max(1, 6 - this.humanNames.length);
    this.monsters = pickMonsters(Math.min(wanted, room), this.rng);

    const seats = this.humanNames.map((name) => ({ name, monster: null }))
      .concat(this.monsters.map((m) => ({ name: m.name, monster: m })));

    this.game = new TrickOrTreat({
      seed: this.seed, seats, candy: this.startCandy,
      maxHands: this.length.hands, chaos: this.chaos, onboarding: this.onboarding
    });

    this.over = false;
    this.unlockedThisHand = this.onboarding ? newlyUnlocked(1) : null;
  }

  get players() { return this.game.players; }
  get handNo() { return this.game.handNo; }
  get handsLeft() { return Math.max(0, this.length.hands - this.game.handNo); }
  get isPartyMode() { return this.humanNames.length > 1; }

  /** Whose turn it is, and whether a person has to look at the screen. */
  get waitingOnHuman() {
    const p = this.game.current();
    return !!p && !p.monster && this.game.phase === 'betting';
  }

  /**
   * Finish the current hand and set up the next. Returns what the table
   * should announce: refills taken, any power that just unlocked, and
   * whether the night is over.
   */
  advance() {
    const g = this.game;
    applyTilt(g);
    coolDown(g);

    const refills = [];
    for (const p of g.needsRefill()) {
      refills.push({ seat: p.seat, name: p.name, amount: g.refill(p.seat) });
    }

    if (g.handNo >= this.length.hands) {
      this.over = true;
      return { over: true, refills, unlocked: null };
    }

    g.nextHand();
    const unlocked = this.onboarding ? newlyUnlocked(g.handNo) : null;
    this.unlockedThisHand = unlocked;
    return { over: false, refills, unlocked: unlocked ? POWERS[unlocked] : null };
  }

  /** The scoreboard. */
  results() {
    const players = this.players.slice();
    const ranked = players.slice().sort((a, b) => b.candy - a.candy);
    return {
      winner: ranked[0],
      ranked,
      awards: handOut(players),
      headline: headline(players, this.game.history),
      totals: {
        hands: this.game.handNo,
        biggestPot: Math.max(0, ...this.game.history.map((h) => h.pot)),
        collapses: Math.max(0, ...players.map((p) => p.stats.collapses)),
        powers: players.reduce((s, p) => s + p.stats.measures + p.stats.swaps + p.stats.haunts + p.stats.bluffs, 0)
      }
    };
  }

  /** A link that replays this exact night. */
  shareLink(origin) {
    const base = origin || '';
    return `${base}?mode=spooky&seed=${this.seed}&length=${this.length.key}&bots=${this.monsters.length}`;
  }
}
