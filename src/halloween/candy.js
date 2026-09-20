/**
 * halloween/candy.js — the currency.
 *
 * Candy, and only candy. There is no money anywhere in this mode, nothing
 * can be bought with anything real, and there is no way to put value in or
 * take value out. It is a party game that keeps score in sweets.
 *
 * The one job of this file is making a number of candy readable at a glance
 * from across a room: a stack of 47 should look obviously bigger than a
 * stack of 23 without anybody reading a digit.
 */

/** Denominations, biggest first. A stack is always made of the fewest pieces. */
export const DENOMS = [
  { value: 25, key: 'giant',   icon: '\u{1F36F}', name: 'Candy Apple', tint: '#ff4d6d', size: 1.5 },
  { value: 10, key: 'lolly',   icon: '\u{1F36D}', name: 'Lollipop',    tint: '#c084fc', size: 1.3 },
  { value: 5,  key: 'choc',    icon: '\u{1F36B}', name: 'Chocolate',   tint: '#a86b3c', size: 1.15 },
  { value: 1,  key: 'gummy',   icon: '\u{1F36C}', name: 'Gummy',       tint: '#ff9f1c', size: 1 }
];

export const CANDY = '\u{1F36C}';

/**
 * Break an amount into pieces, fewest first.
 * 47 -> one candy apple, two lollipops, two gummies.
 */
export function breakdown(amount) {
  const out = [];
  let left = Math.max(0, Math.round(amount));
  for (const d of DENOMS) {
    const n = Math.floor(left / d.value);
    if (n > 0) { out.push({ denom: d, count: n }); left -= n * d.value; }
  }
  return out;
}

/**
 * The individual pieces to draw, capped so a huge stack does not turn into
 * a thousand sprites. Past the cap the biggest denomination just repeats.
 */
export function pieces(amount, cap = 14) {
  const out = [];
  for (const { denom, count } of breakdown(amount)) {
    for (let i = 0; i < count && out.length < cap; i++) out.push(denom);
  }
  return out;
}

/** "47" with a thousands separator once the table gets silly. */
export function format(amount) {
  return Math.round(amount).toLocaleString('en-US');
}

/**
 * How a bet should *sound* and read. A game night wants "twelve" spoken
 * aloud more than it wants "1 apple, 0 lollipops, 2 chocolates".
 */
export function describeBet(amount) {
  if (amount <= 0) return 'nothing';
  if (amount === 1) return '1 candy';
  return `${format(amount)} candy`;
}

/** Suggested quick-bet buttons for a given pot and stack. */
export function quickBets(pot, stack, minimum) {
  const options = [
    { label: 'Nibble', amount: Math.max(minimum, Math.round(pot * 0.33)) },
    { label: 'Munch', amount: Math.max(minimum, Math.round(pot * 0.66)) },
    { label: 'Feast', amount: Math.max(minimum, pot) }
  ];
  const seen = new Set();
  return options
    .map((o) => ({ ...o, amount: Math.min(stack, o.amount) }))
    .filter((o) => {
      if (o.amount < minimum || o.amount > stack || seen.has(o.amount)) return false;
      seen.add(o.amount);
      return true;
    });
}

/**
 * The Trick or Treat refill. Nobody gets knocked out of a party game and
 * spends the next twenty minutes watching, so a bust player is handed
 * enough to keep playing — but it is announced, it is small, and it is
 * counted, so the scoreboard at the end still means something.
 */
export const REFILL = 10;

export function refillFor(player) {
  const taken = (player.refills || 0) + 1;
  // A little more each time, because somebody having a genuinely terrible
  // night should not have to ask four times in a row.
  return REFILL + Math.min(10, (taken - 1) * 2);
}
