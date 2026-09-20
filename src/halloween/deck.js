/**
 * halloween/deck.js — an actual deck of playing cards.
 *
 * The main game has no playing cards at all: there, your hand is a set of
 * quantum gates and the board is five qubits. Trick or Treat is ordinary
 * Texas Hold'em, because "the poker you already know" is the whole premise —
 * so it needs ranks, suits, and a real fifty-two card deck.
 *
 * A card is a plain integer, 0..51:  rank = card >> 2,  suit = card & 3.
 * Small enough to compare, sort and hash without allocating anything, which
 * matters because the hand evaluator runs a few hundred thousand times in
 * the tests and inside the opponents' equity estimates.
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const RANK_NAMES = [
  'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'
];

/**
 * Suits, Halloween-dressed. The pip shapes are swapped for spooky ones but
 * the colours keep the two-red-two-black convention, so anybody who has
 * held a deck of cards can read the table instantly.
 */
export const SUITS = [
  { key: 'bats',      pip: '\u{1F987}', glyph: 'M', name: 'Bats',      colour: 'dark',  classic: '♠' },
  { key: 'pumpkins',  pip: '\u{1F383}', glyph: 'P', name: 'Pumpkins',  colour: 'warm',  classic: '♥' },
  { key: 'ghosts',    pip: '\u{1F47B}', glyph: 'G', name: 'Ghosts',    colour: 'dark',  classic: '♣' },
  { key: 'candies',   pip: '\u{1F36C}', glyph: 'C', name: 'Candies',   colour: 'warm',  classic: '♦' }
];

export const DECK_SIZE = 52;

export const rankOf = (card) => card >> 2;
export const suitOf = (card) => card & 3;
export const makeCard = (rank, suit) => (rank << 2) | suit;

/** "Q of Ghosts". Used by tooltips, the log and the after-game summary. */
export function cardName(card) {
  return `${RANK_NAMES[rankOf(card)]} of ${SUITS[suitOf(card)].name}`;
}

/** "Q\u{1F47B}" — the short form that fits on a chip or in a speech bubble. */
export function cardShort(card) {
  return RANKS[rankOf(card)] + SUITS[suitOf(card)].pip;
}

/** A fresh ordered deck. Shuffle it yourself with the seeded rng. */
export function freshDeck() {
  return Array.from({ length: DECK_SIZE }, (_, i) => i);
}

/**
 * A dealer that draws without replacement and can be told to avoid cards
 * that are logically already in play — which matters here, because a card in
 * superposition occupies *two* deck slots until somebody measures it.
 */
export class Shoe {
  constructor(rng) {
    this.rng = rng;
    this.cards = freshDeck();
    this.burned = new Set();
    this.shuffle();
  }

  shuffle() {
    const a = this.cards;
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    this.next = 0;
    return this;
  }

  get remaining() { return this.cards.length - this.next; }

  /** Take the next card that is not spoken for. */
  draw() {
    while (this.next < this.cards.length) {
      const c = this.cards[this.next++];
      if (!this.burned.has(c)) return c;
    }
    throw new Error('the shoe is empty');
  }

  drawMany(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.draw());
    return out;
  }

  /** Mark cards as already in play so they are never dealt twice. */
  reserve(...cards) {
    for (const c of cards.flat()) if (c !== null && c !== undefined) this.burned.add(c);
    return this;
  }

  /** Put a card back out of play without dealing it. */
  release(card) { this.burned.delete(card); return this; }
}
