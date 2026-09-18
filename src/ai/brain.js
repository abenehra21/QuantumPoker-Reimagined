/**
 * ai/brain.js — how an opponent decides.
 *
 * One brain, six personalities. The brain answers two questions:
 *
 *   How good is my hand?   -> strength(), in (0, 1), where 0.5 is average
 *   What do I do about it? -> decide(), fold / call / raise
 *
 * Strength is the honest part: it runs the same planner the Hint button runs,
 * capped at the bot's own skill, so a Casual bot genuinely cannot see the line
 * a Master bot can. It never looks at an unrevealed coin or at anyone's cards.
 */
import { plan, SKILL } from '../gameplay/planner.js';
import { expectedScore } from '../quantum/read.js';

/** What an average hand of cards adds to an average board. Measured; see tests. */
export const AVG_UPLIFT = 1.15;

/** Rough worth of a card before the board is out. Calibrated in tests/. */
const CARD_WEIGHT = {
  X: 0.55, H: 0.50, Z: 0.30, Y: 0.45, SX: 0.35, M: 0.35, I: 0.15, RESET: 0.15,
  CX: 0.45, SWAP: 0.25, S: 0.20, SDG: 0.20, T: 0.15, BELL: 0.35, FREEZE: 0.10,
  DEUTSCH: 0.05, SPREAD: 0.30, CHAIN: 0.40,
  CZ: 0.25, CPHASE: 0.20, CCX: 0.60, RX: 0.40, RY: 0.40, RZ: 0.15, ISWAP: 0.30,
  ORACLE: 0.10, ENTBOMB: 0.50, PHASESTORM: 0.25, MEASUREX: 0.40, ZENO: 0.25, AMPLIFY: 0.55,
  GROVER: 0.90, TELEPORT: 0.70, ERRORMIT: 0.20, NOISECANCEL: 0.25, ANNEAL: 0.60,
  QFT: 0.35, REWIND: 0.30, SUPERDENSE: 0.55, COHERE: 0.45
};

export function handPotential(hand) {
  return hand.reduce((s, id) => s + (CARD_WEIGHT[id] === undefined ? 0.35 : CARD_WEIGHT[id]), 0);
}

/**
 * Strength in (0, 1). 0.5 is an average hand for this board. Coins not yet
 * revealed count as 50/50 for everyone, plus whatever the bot's leftover
 * cards could still do to them.
 */
export function strength(game, seat) {
  const p = game.players[seat];
  const rev = game.revealed, unrev = game.coins - rev;
  const skill = p.skill || SKILL.student;
  const mine = (rev ? plan(p.board, p.hand, { upTo: rev, skill, rng: game.rng }).value : 0)
    + 0.5 * unrev
    + handPotential(p.hand) * (unrev / game.coins) * 0.8;
  const baseline = expectedScore(game.origin, rev) + 0.5 * unrev + AVG_UPLIFT;
  const edge = mine - baseline;
  return 1 / (1 + Math.exp(-edge * 1.8));
}

/**
 * Decide a betting action. Returns { action, to?, line? } where `line` is the
 * short phrase the seat says while doing it.
 */
export function decide(game, seat, rng) {
  const p = game.players[seat];
  const me = p.bot;
  let s = strength(game, seat);
  const toCall = game.toCall(seat);
  const pot = game.potTotal();
  const minTo = game.minRaiseTo(seat), maxTo = game.maxRaiseTo(seat);
  const canRaise = maxTo > game.currentBet;
  const opponents = game.inHand().length - 1;

  let aggression = me.aggression, bluff = me.bluff, tight = me.tight;

  // Echo copies whatever the hero did last hand; Quark ignores the board.
  if (me.adaptive && game.heroProfile) {
    aggression = clamp(aggression * 0.4 + game.heroProfile.aggression * 0.6);
    bluff = clamp(bluff * 0.4 + game.heroProfile.bluff * 0.6);
    tight = clamp(tight * 0.4 + game.heroProfile.tight * 0.6);
  }
  if (me.chaotic) s = s * 0.35 + rng() * 0.65;

  // A seat on tilt pushes harder and folds less. Not quantum. Just poker.
  if (p.status && p.status.has('tilt')) { aggression = clamp(aggression + 0.25); tight = clamp(tight - 0.25); }

  // One raise per street each, unless the hand is a monster. Without this,
  // two aggressive bots re-raise each other all in on the very first hand.
  const raisedAlready = p.raisedStreet === game.round;
  const raise = () => {
    if (raisedAlready && s < 0.85) return { action: 'call', line: 'call' };
    p.raisedStreet = game.round;
    const size = Math.round(pot * (0.4 + aggression * 0.6) + game.currentBet);
    return { action: 'raise', to: Math.max(minTo, Math.min(maxTo, size)), line: 'raise' };
  };

  if (toCall === 0) {
    if (canRaise && s > 0.58 + (1 - aggression) * 0.12 && rng() < 0.45 + aggression * 0.5) return raise();
    if (canRaise && s > 0.4 && rng() < bluff) return Object.assign(raise(), { bluff: true });
    return { action: 'call', line: 'call' };
  }

  const potOdds = toCall / (pot + toCall);
  const margin = tight * 0.18 + opponents * 0.03;
  if (s > potOdds + margin) {
    if (canRaise && s > 0.7 && rng() < aggression * 0.7) return raise();
    return { action: 'call', line: 'call' };
  }
  if (s > 0.35 && rng() < bluff * 0.5 && toCall < p.chips * 0.15) return { action: 'call', line: 'call' };
  return { action: 'fold', line: 'fold' };
}

function clamp(v) { return Math.max(0, Math.min(1, v)); }

/** Play a bot's cards, best line first, until nothing helps. */
export function playCards(game, seat) {
  const p = game.players[seat];
  const played = [];
  let guard = 0;
  while (p.hand.length && guard++ < 10) {
    const h = game.hint(seat, p.skill || SKILL.student);
    if (!h) break;
    const res = game.playCard(h.card, h.targets);
    if (!res.ok) break;
    played.push(h);
  }
  return played;
}

/** Advance the game through one bot action. Returns false if it is not a bot's turn. */
export function step(game) {
  const p = game.current();
  if (!p || !p.bot) return false;
  if (game.phase === 'betting') {
    const d = decide(game, p.seat, game.rng);
    if (d.action === 'fold') game.fold();
    else if (d.action === 'raise') { if (!game.raiseTo(d.to).ok) game.call(); }
    else game.call();
    return d;
  }
  if (game.phase === 'gates') {
    const played = playCards(game, p.seat);
    game.endTurn();
    return { action: 'cards', played };
  }
  return false;
}

/**
 * Watch the hero and build the profile Echo copies. Aggression is how often
 * they raise, bluff is how often they raise with a bad board, tightness is
 * how often they fold.
 */
export class HeroWatcher {
  constructor() { this.raises = 0; this.calls = 0; this.folds = 0; this.bluffs = 0; this.spots = 0; }

  record(action, s) {
    this.spots++;
    if (action === 'raise') { this.raises++; if (s < 0.45) this.bluffs++; }
    else if (action === 'fold') this.folds++;
    else this.calls++;
  }

  get profile() {
    const n = Math.max(1, this.spots);
    return {
      aggression: this.raises / n,
      bluff: this.bluffs / Math.max(1, this.raises),
      tight: this.folds / n
    };
  }
}
