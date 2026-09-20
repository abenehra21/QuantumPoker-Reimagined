/**
 * halloween/brain.js — how the monsters decide.
 *
 * One brain, six personalities. The brain answers "how often does this hand
 * win from here?" by actually dealing it out: it fills in the unseen cards a
 * few hundred times, evaluates every showdown, and counts. That is the
 * honest way to play poker and it is fast enough to do before every action.
 *
 * Crucially the sampler also rolls the haunted cards. A "?" on the board is
 * resolved to one of its two possibilities, weighted by the real amplitudes,
 * on every single trial — so an opponent facing a mystery card is genuinely
 * reasoning about a superposition rather than ignoring it or cheating and
 * looking. When two mystery cards are entangled the sampler respects the
 * link, because it asks the quantum state rather than flipping its own coin.
 */
import { evaluate } from './evaluate.js';
import { DECK_SIZE, rankOf } from './deck.js';
import { POWERS } from './powers.js';
import { holeKey, boardKey } from './game.js';

/**
 * Chance this seat wins or ties a showdown from here.
 *
 * `samples` is the only accuracy dial. 240 is enough to get within a couple
 * of points, which is far inside the noise of the personality that reads it.
 */
export function equity(game, seat, samples = 240, rng = Math.random) {
  const me = game.players[seat];
  const opponents = game.inHand().filter((p) => p.seat !== seat);
  if (!opponents.length) return 1;

  // What this seat legitimately knows: its own two cards and the board.
  const known = [];
  const myKeys = [holeKey(seat, 0), holeKey(seat, 1)];
  const mysteryKeys = [];

  for (const k of myKeys) {
    const c = game.cardAt(k);
    if (c === null) mysteryKeys.push(k); else known.push(c);
  }
  const boardKeys = [];
  for (let i = 0; i < game.revealed; i++) {
    const k = boardKey(i);
    boardKeys.push(k);
    const c = game.cardAt(k);
    if (c === null) mysteryKeys.push(k); else known.push(c);
  }

  // Everything not accounted for is still out there somewhere.
  const seen = new Set(known);
  for (const k of mysteryKeys) {
    const opts = game.haunting.optionsAt(k);
    if (opts) for (const o of opts) seen.add(o);
  }
  const deck = [];
  for (let c = 0; c < DECK_SIZE; c++) if (!seen.has(c)) deck.push(c);

  const boardToCome = 5 - game.revealed;
  const need = boardToCome + opponents.length * 2;
  if (deck.length < need) return 0.5;

  let wins = 0, ties = 0;
  const pool = deck.slice();

  for (let s = 0; s < samples; s++) {
    // Resolve every "?" by asking the real quantum state, not a private coin.
    const resolved = new Map();
    for (const k of mysteryKeys) {
      const opts = game.haunting.optionsAt(k);
      if (!opts) continue;
      const pOne = game.haunting.odds(k);
      resolved.set(k, rng() < pOne ? opts[1] : opts[0]);
    }
    // Entangled pairs must agree; the state already encodes how.
    for (const link of game.haunting.links) {
      if (!resolved.has(link.a) || !resolved.has(link.b)) continue;
      const optsA = game.haunting.optionsAt(link.a);
      const optsB = game.haunting.optionsAt(link.b);
      const aIndex = resolved.get(link.a) === optsA[1] ? 1 : 0;
      const bIndex = link.kind === 'same' ? aIndex : 1 - aIndex;
      resolved.set(link.b, optsB[bIndex]);
    }

    // Partial Fisher-Yates over the live pool: only shuffle what we draw.
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(rng() * (pool.length - i));
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    let cursor = 0;

    const board = [];
    for (const k of boardKeys) {
      board.push(resolved.has(k) ? resolved.get(k) : game.cardAt(k));
    }
    for (let i = 0; i < boardToCome; i++) board.push(pool[cursor++]);

    const mine = myKeys.map((k) => (resolved.has(k) ? resolved.get(k) : game.cardAt(k)));
    const myBest = evaluate(mine.concat(board)).value;

    let best = -1, tied = 0;
    for (let o = 0; o < opponents.length; o++) {
      const theirs = [pool[cursor++], pool[cursor++]];
      const v = evaluate(theirs.concat(board)).value;
      if (v > best) { best = v; tied = 1; }
      else if (v === best) tied++;
    }
    if (myBest > best) wins++;
    else if (myBest === best) ties += 1 / (tied + 1);
  }
  return (wins + ties) / samples;
}

/**
 * Decide an action. Returns { action, to?, line }.
 *
 * The shape is ordinary poker: compare equity against the price of a call,
 * then let the personality push the decision around. A monster that is on
 * tilt, or that is chaotic by nature, gets its numbers scrambled before it
 * reads them rather than getting different rules.
 */
export function decide(game, seat, rng) {
  const p = game.players[seat];
  const m = p.monster;
  const toCall = game.toCall(seat);
  const pot = game.potTotal();
  const minTo = game.minRaiseTo(seat), maxTo = game.maxRaiseTo(seat);
  const canRaise = maxTo > game.currentBet;
  const opponents = game.inHand().length - 1;

  const samples = m.chaotic ? 120 : 220;
  let eq = equity(game, seat, samples, rng);

  let aggression = m.aggression, bluff = m.bluff, tight = m.tight;

  // Tilt. A monster that just lost a big pot plays worse, visibly.
  if (p.tilt > 0) {
    aggression = clamp(aggression + p.tilt * 0.3);
    tight = clamp(tight - p.tilt * 0.3);
  }
  // The Cat does not read the board so much as vibe with it.
  if (m.chaotic) eq = eq * 0.45 + rng() * 0.55;

  // A visible board matters here: a scary-looking face-up card opposite you
  // is worth something even when the hand behind it is nothing, and these
  // opponents respect that the same way a person would.
  const scare = scaryBoardBonus(game, seat);

  const raiseTo = () => {
    if (p.raisedStreet === game.round && eq < 0.8) return { action: 'call', line: 'call' };
    p.raisedStreet = game.round;
    const size = Math.round(pot * (0.4 + aggression * 0.7) + game.currentBet);
    return { action: 'raise', to: Math.max(minTo, Math.min(maxTo, size)), line: 'raise' };
  };

  if (toCall === 0) {
    if (canRaise && eq > 0.55 + (1 - aggression) * 0.14 && rng() < 0.4 + aggression * 0.5) return raiseTo();
    if (canRaise && rng() < bluff * (1 + scare)) return Object.assign(raiseTo(), { bluff: true });
    return { action: 'call', line: 'check' };
  }

  const potOdds = toCall / (pot + toCall);

  // How much better than break-even this monster needs before it will put
  // candy in. Centred on 0.4 so that a middling personality plays roughly
  // correct pot odds, and swinging wide either side of it: the whole point
  // of six personalities is that somebody can call the Werewolf's bluff on
  // hand three because they have noticed he never folds. A timid weighting
  // here makes every monster play the same and the table goes flat.
  const demand = (tight - 0.4) * 0.34 + opponents * 0.02;

  if (eq > potOdds + demand) {
    if (canRaise && eq > 0.62 + (1 - aggression) * 0.16 && rng() < 0.3 + aggression * 0.6) return raiseTo();
    return { action: 'call', line: 'call' };
  }
  // A loose monster talks itself into marginal calls; a tight one does not.
  const stubborn = 0.55 + tight * 0.5;
  const affordable = p.candy * (0.08 + (1 - tight) * 0.3);
  if (eq > potOdds * stubborn && toCall <= affordable) return { action: 'call', line: 'call' };
  if (rng() < bluff * 0.4 && canRaise && toCall < p.candy * 0.25) {
    return Object.assign(raiseTo(), { bluff: true });
  }
  return { action: 'fold', line: 'fold' };
}

/** How intimidating this seat's own face-up card looks to the table. */
function scaryBoardBonus(game, seat) {
  const p = game.players[seat];
  const key = holeKey(seat, p.shown);
  if (game.isMystery(key) || p.bluffing) return 0.5;    // a "?" is the scariest thing on the table
  const c = game.cardAt(key);
  if (c === null) return 0.3;
  return rankOf(c) >= 10 ? 0.35 : 0;
}

function clamp(v) { return Math.max(0, Math.min(1, v)); }

/**
 * Should this monster use a power, and which? Deliberately simple: powers
 * are a personality trait here rather than an optimisation, because a
 * table where the Witch casts constantly and the Werewolf never does is
 * much more readable than one where everybody plays correctly.
 */
export function choosePower(game, seat, rng) {
  const p = game.players[seat];
  const m = p.monster;
  const available = game.availablePowers();
  if (!available.length || p.charges < 1) return null;
  if (rng() > m.spooky * 0.5) return null;

  const mysteries = game.haunting.pending().map((s) => s.key);
  const myKeys = [holeKey(seat, 0), holeKey(seat, 1)];

  // Measure a mystery that is on the board, or one of their own.
  if (available.includes('MEASURE') && mysteries.length && rng() < 0.6) {
    const mine = mysteries.filter((k) => myKeys.includes(k));
    const target = mine.length ? mine[0] : mysteries[Math.floor(rng() * mysteries.length)];
    return { id: 'MEASURE', target };
  }
  // Swap away a bad card.
  if (available.includes('SWAP') && p.charges >= POWERS.SWAP.cost && rng() < 0.4) {
    const solid = myKeys.filter((k) => !game.isMystery(k));
    if (solid.length) {
      const worst = solid.reduce((a, b) => (rankOf(game.cardAt(a)) <= rankOf(game.cardAt(b)) ? a : b));
      if (rankOf(game.cardAt(worst)) <= 6) return { id: 'SWAP', target: worst };
    }
  }
  // Haunt the face-up card, which is the one with an audience.
  if (available.includes('HAUNT') && p.charges >= POWERS.HAUNT.cost && rng() < 0.35) {
    const key = holeKey(seat, p.shown);
    if (!game.isMystery(key)) return { id: 'HAUNT', target: key };
  }
  // Bluff when the face-up card is embarrassing.
  if (available.includes('BLUFF') && p.charges >= POWERS.BLUFF.cost && !p.bluffing && rng() < 0.4) {
    const key = holeKey(seat, p.shown);
    const c = game.cardAt(key);
    if (c !== null && rankOf(c) <= 7) return { id: 'BLUFF' };
  }
  return null;
}

/**
 * Advance the game by one monster action. Returns what it did so the table
 * can animate it and give the monster a line, or false if it is not their
 * turn.
 */
export function step(game, rng = game.rng) {
  const p = game.current();
  if (!p || !p.monster || game.phase !== 'betting') return false;

  // They may cast before they act. At most one power per turn, so a hand
  // never turns into a fireworks display.
  let cast = null;
  const wish = choosePower(game, p.seat, rng);
  if (wish) {
    const res = game.usePower(p.seat, wish.id, wish.target);
    if (res.ok) cast = Object.assign({ id: wish.id }, res);
  }

  const d = decide(game, p.seat, rng);
  if (d.action === 'fold') game.fold();
  else if (d.action === 'raise') { if (!game.raiseTo(d.to).ok) game.call(); }
  else game.call();

  return Object.assign({}, d, { cast, seat: p.seat });
}

/** Tilt decays between hands, so a bad beat colours a few hands and no more. */
export function coolDown(game) {
  for (const p of game.players) {
    if (!p.monster) continue;
    p.tilt = Math.max(0, (p.tilt || 0) * 0.5);
  }
}

export function applyTilt(game) {
  for (const p of game.players) {
    if (!p.monster) continue;
    const lost = p.won === 0 && p.committed > 0;
    const big = p.committed > p.candy * 0.4;
    if (lost && big) p.tilt = Math.min(1, (p.tilt || 0) + p.monster.tilt);
  }
}
