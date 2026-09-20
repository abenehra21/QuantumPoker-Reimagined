/**
 * halloween/evaluate.js — which poker hand wins.
 *
 * Standard five-from-seven Texas Hold'em evaluation. Every hand collapses to
 * one comparable integer, so the showdown is a `>` and ties are exact:
 *
 *     value = category * 15^5 + kicker1 * 15^4 + … + kicker5
 *
 * Base fifteen because ranks run 0..12 and that leaves room to spare. The
 * whole thing is allocation-light and runs about a million hands a second,
 * which it needs to, because the opponents estimate their equity by dealing
 * out the rest of the board a few thousand times before every decision.
 */
import { rankOf, suitOf, RANK_NAMES } from './deck.js';

export const CATEGORY = {
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4,
  FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8, ROYAL_FLUSH: 9
};

/** The plain name, and the one the table shouts. */
export const CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush', 'Royal Flush'
];

export const SPOOKY_NAMES = [
  'Lone Wanderer', 'Twin Terror', 'Double Trouble', 'Three Witches', 'Midnight Run',
  'Cursed Flush', 'Full House of Horrors', 'Four Horsemen', 'Straight from the Crypt', 'Royal Fright'
];

const BASE = 15;
const P = [BASE ** 4, BASE ** 3, BASE ** 2, BASE, 1];
const CAT = BASE ** 5;

/**
 * Best five-card hand out of any number of cards (five, six or seven).
 * Returns { value, category, ranks, cards } where `cards` is the five that
 * actually play — the table highlights exactly those at showdown.
 */
export function evaluate(cards) {
  if (cards.length < 5) throw new Error('need at least five cards');

  // Rank histogram and suit histogram in one pass.
  const byRank = new Int8Array(13);
  const bySuit = new Int8Array(4);
  for (const c of cards) { byRank[rankOf(c)]++; bySuit[suitOf(c)]++; }

  // --- flush, and the straight flush hiding inside it -------------------
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (bySuit[s] >= 5) { flushSuit = s; break; }

  if (flushSuit >= 0) {
    const suited = cards.filter((c) => suitOf(c) === flushSuit);
    const sfTop = straightTop(suited.map(rankOf));
    if (sfTop >= 0) {
      const run = straightCards(suited, sfTop);
      const category = sfTop === 12 ? CATEGORY.ROYAL_FLUSH : CATEGORY.STRAIGHT_FLUSH;
      return pack(category, [sfTop, 0, 0, 0, 0], run);
    }
  }

  // --- the rank groups, best first --------------------------------------
  const quads = [], trips = [], pairs = [], singles = [];
  for (let r = 12; r >= 0; r--) {
    if (byRank[r] === 4) quads.push(r);
    else if (byRank[r] === 3) trips.push(r);
    else if (byRank[r] === 2) pairs.push(r);
    else if (byRank[r] === 1) singles.push(r);
  }

  if (quads.length) {
    const r = quads[0];
    const kicker = bestExcluding(byRank, [r], 1)[0];
    return pack(CATEGORY.QUADS, [r, kicker, 0, 0, 0],
      pick(cards, [[r, 4], [kicker, 1]]));
  }

  if (trips.length && (pairs.length || trips.length > 1)) {
    const three = trips[0];
    const two = trips.length > 1 ? Math.max(trips[1], pairs[0] === undefined ? -1 : pairs[0]) : pairs[0];
    return pack(CATEGORY.FULL_HOUSE, [three, two, 0, 0, 0],
      pick(cards, [[three, 3], [two, 2]]));
  }

  if (flushSuit >= 0) {
    const suited = cards.filter((c) => suitOf(c) === flushSuit)
      .sort((a, b) => rankOf(b) - rankOf(a)).slice(0, 5);
    return pack(CATEGORY.FLUSH, suited.map(rankOf), suited);
  }

  const top = straightTop(cards.map(rankOf));
  if (top >= 0) {
    return pack(CATEGORY.STRAIGHT, [top, 0, 0, 0, 0], straightCards(cards, top));
  }

  if (trips.length) {
    const r = trips[0];
    const ks = bestExcluding(byRank, [r], 2);
    return pack(CATEGORY.TRIPS, [r, ks[0], ks[1], 0, 0],
      pick(cards, [[r, 3], [ks[0], 1], [ks[1], 1]]));
  }

  if (pairs.length >= 2) {
    const [hi, lo] = pairs;
    const kicker = bestExcluding(byRank, [hi, lo], 1)[0];
    return pack(CATEGORY.TWO_PAIR, [hi, lo, kicker, 0, 0],
      pick(cards, [[hi, 2], [lo, 2], [kicker, 1]]));
  }

  if (pairs.length === 1) {
    const r = pairs[0];
    const ks = bestExcluding(byRank, [r], 3);
    return pack(CATEGORY.PAIR, [r, ks[0], ks[1], ks[2], 0],
      pick(cards, [[r, 2], [ks[0], 1], [ks[1], 1], [ks[2], 1]]));
  }

  const five = singles.slice(0, 5);
  return pack(CATEGORY.HIGH_CARD, five, pick(cards, five.map((r) => [r, 1])));
}

function pack(category, ranks, cards) {
  let value = category * CAT;
  for (let i = 0; i < 5; i++) value += (ranks[i] || 0) * P[i];
  return { value, category, ranks, cards: cards.slice(0, 5) };
}

/**
 * Highest card of a five-long run, or -1. The wheel (A-2-3-4-5) is the one
 * special case in poker that catches every naive implementation: the ace
 * plays low, and the straight is ranked by its five, not its ace.
 */
function straightTop(ranks) {
  // Ranks live at bits 1..13 so that bit 0 can be a dedicated "ace playing
  // low" slot. Putting the low ace at bit 0 of an unshifted mask instead
  // silently sets the bit for a two, and A-3-4-5-6 then reads as a
  // six-high straight.
  let mask = 0;
  for (const r of ranks) mask |= 1 << (r + 1);
  if (mask & (1 << 13)) mask |= 1;
  for (let top = 12; top >= 3; top--) {
    const run = 0b11111 << (top - 3);           // bits top+1 down to top-3
    if ((mask & run) === run) return top;
  }
  return -1;
}

/** The five actual cards making a straight that tops out at `top`. */
function straightCards(cards, top) {
  const want = [];
  for (let i = 0; i < 5; i++) {
    const r = top - i;
    want.push(r < 0 ? 12 : r);                  // the wheel reaches back to the ace
  }
  const out = [];
  for (const r of want) {
    const c = cards.find((x) => rankOf(x) === r && !out.includes(x));
    if (c !== undefined) out.push(c);
  }
  return out;
}

function bestExcluding(byRank, exclude, count) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < count; r--) {
    if (byRank[r] > 0 && !exclude.includes(r)) out.push(r);
  }
  while (out.length < count) out.push(0);
  return out;
}

/** Pull `n` cards of each named rank out of the pile, in order. */
function pick(cards, spec) {
  const out = [];
  for (const [rank, n] of spec) {
    let taken = 0;
    for (const c of cards) {
      if (rankOf(c) === rank && !out.includes(c) && taken < n) { out.push(c); taken++; }
    }
  }
  return out;
}

/** "Full House, Kings over Threes" — what the results screen prints. */
export function describe(hand) {
  const r = hand.ranks;
  const n = (i) => RANK_NAMES[r[i]];
  const p = (i) => RANK_NAMES[r[i]] + (RANK_NAMES[r[i]].endsWith('x') ? 'es' : 's');
  switch (hand.category) {
    case CATEGORY.ROYAL_FLUSH: return 'Royal Flush';
    case CATEGORY.STRAIGHT_FLUSH: return `Straight Flush, ${n(0)} high`;
    case CATEGORY.QUADS: return `Four ${p(0)}`;
    case CATEGORY.FULL_HOUSE: return `Full House, ${p(0)} over ${p(1)}`;
    case CATEGORY.FLUSH: return `Flush, ${n(0)} high`;
    case CATEGORY.STRAIGHT: return `Straight, ${n(0)} high`;
    case CATEGORY.TRIPS: return `Three ${p(0)}`;
    case CATEGORY.TWO_PAIR: return `Two Pair, ${p(0)} and ${p(1)}`;
    case CATEGORY.PAIR: return `Pair of ${p(0)}`;
    default: return `${n(0)} High`;
  }
}

export function spookyName(hand) { return SPOOKY_NAMES[hand.category]; }

/** Compare two evaluated hands. Positive when a wins. */
export function compare(a, b) { return a.value - b.value; }
