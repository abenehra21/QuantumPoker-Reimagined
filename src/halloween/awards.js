/**
 * halloween/awards.js — the end of the night.
 *
 * Everyone gets something. That is the entire design rule: a party game
 * that ranks six people from first to sixth has made five people feel
 * slightly worse, so instead the scoreboard hands out a title to every
 * seat and lets the candy count speak for itself.
 *
 * Awards are ordered by how funny they are to receive, not by prestige,
 * and each one is claimed by exactly one player.
 */

export const AWARDS = [
  {
    id: 'hoarder', name: 'Candy Hoarder', icon: '\u{1F36D}',
    blurb: 'Went home with the most candy.',
    score: (p) => p.candy,
    line: (p) => `${p.candy} candy. Just leave some for the children.`
  },
  {
    id: 'bluffer', name: 'Biggest Bluffer', icon: '\u{1F3AD}',
    blurb: 'Won the most pots with nothing at all.',
    score: (p) => p.stats.bluffsWon * 10 + p.stats.bluffs,
    min: 1,
    line: (p) => `${p.stats.bluffs} spectral bluff${p.stats.bluffs === 1 ? '' : 's'}, and they knew it.`
  },
  {
    id: 'menace', name: 'Quantum Menace', icon: '⚛',
    blurb: 'Used the most powers.',
    score: (p) => p.stats.measures + p.stats.swaps + p.stats.haunts + p.stats.bluffs,
    min: 1,
    line: (p) => `${p.stats.measures + p.stats.swaps + p.stats.haunts + p.stats.bluffs} powers cast. Physics is exhausted.`
  },
  {
    id: 'shover', name: 'All The Candy', icon: '\u{1F4A5}',
    blurb: 'Pushed everything in the most times.',
    score: (p) => p.stats.allIns,
    min: 1,
    line: (p) => `${p.stats.allIns} all-in${p.stats.allIns === 1 ? '' : 's'}. Subtlety is for other people.`
  },
  {
    id: 'bestHand', name: 'Best Hand of the Night', icon: '\u{1F451}',
    blurb: 'Held the strongest five cards anyone saw.',
    score: (p) => p.stats.bestHand,
    min: 0,
    line: (p) => p.stats.bestHandName || 'Something respectable.'
  },
  {
    id: 'comeback', name: 'Back From The Dead', icon: '\u{1F9DF}',
    blurb: 'Was nearly out, and is not.',
    score: (p) => (p.candy > 0 ? (p.stats.lowPoint <= 5 ? 1000 - p.stats.lowPoint + p.candy : 0) : 0),
    min: 1,
    line: (p) => `Down to ${p.stats.lowPoint}, finished on ${p.candy}.`
  },
  {
    id: 'unlucky', name: 'Unluckiest At The Table', icon: '\u{1F480}',
    blurb: 'Lost the most candy trying.',
    score: (p) => p.stats.candyLost,
    min: 1,
    line: (p) => `${p.stats.candyLost} candy donated to the cause.`
  },
  {
    id: 'survivor', name: 'Collapse Survivor', icon: '\u{1F30C}',
    blurb: 'Sat through the most reality-bending.',
    score: (p) => p.stats.collapses,
    min: 1,
    line: (p) => `${p.stats.collapses} quantum collapses endured without complaint.`
  },
  {
    id: 'scientist', name: 'The Scientist', icon: '\u{1F50D}',
    blurb: 'Measured more mysteries than anyone.',
    score: (p) => p.stats.measures,
    min: 1,
    line: (p) => `${p.stats.measures} card${p.stats.measures === 1 ? '' : 's'} forced to make up their mind.`
  },
  {
    id: 'trickortreat', name: 'Trick or Treater', icon: '\u{1F383}',
    blurb: 'Asked for the most refills.',
    score: (p) => p.refills,
    min: 1,
    line: (p) => `${p.refills} refill${p.refills === 1 ? '' : 's'}. No shame in it.`
  },
  {
    id: 'rock', name: 'The Quiet One', icon: '\u{1F576}',
    blurb: 'Folded more than anyone and lived.',
    score: (p) => (p.stats.showdowns === 0 && p.candy > 0 ? 100 : 0),
    min: 1,
    line: () => 'Never showed a single card. Suspicious.'
  }
];

/**
 * Give out the awards. One per player where possible: each award goes to
 * its best unclaimed candidate, and anybody still without a title at the
 * end gets a consolation one so nobody is left off the board.
 */
export function handOut(players) {
  const claimed = new Map();
  const taken = new Set();

  for (const award of AWARDS) {
    const candidates = players
      .filter((p) => !taken.has(p.seat))
      .map((p) => ({ p, score: award.score(p) }))
      .filter((c) => c.score > (award.min === undefined ? -Infinity : award.min) - 1 && c.score > 0)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) continue;
    const winner = candidates[0].p;
    claimed.set(winner.seat, { award, line: award.line(winner) });
    taken.add(winner.seat);
  }

  // Everybody goes home with something.
  for (const p of players) {
    if (claimed.has(p.seat)) continue;
    claimed.set(p.seat, {
      award: { id: 'participant', name: 'Survived The Night', icon: '\u{1F56F}', blurb: 'Was there.' },
      line: `${p.candy} candy and all their limbs.`
    });
  }
  return claimed;
}

/**
 * The headline. One line summarising the night, chosen from what actually
 * happened rather than from a list of generic congratulations.
 */
export function headline(players, history) {
  const winner = players.slice().sort((a, b) => b.candy - a.candy)[0];
  const biggest = Math.max(0, ...history.map((h) => h.pot));
  const total = players.reduce((s, p) => s + p.candy, 0);
  const comeback = players.find((p) => p.stats.lowPoint <= 3 && p.candy > total / players.length);

  if (comeback && comeback.seat === winner.seat) {
    return `${winner.name} was down to ${winner.stats.lowPoint} candy and won the whole night.`;
  }
  if (winner.stats.bluffs >= 3) {
    return `${winner.name} lied their way to ${winner.candy} candy.`;
  }
  if (biggest > total / 3) {
    return `One pot of ${biggest} candy decided most of this.`;
  }
  return `${winner.name} goes home with ${winner.candy} candy.`;
}

/** Win and loss shouts, picked to match what happened. */
export function winShout(hand, potSize, bigPot) {
  if (!hand) return 'YOU ATE THE POT!';
  const byCategory = [
    'STOLE IT!', 'TWIN TERROR!', 'DOUBLE TROUBLE!', 'THREE WITCHES!', 'MIDNIGHT RUN!',
    'CURSED FLUSH!', 'FULL HOUSE OF HORRORS!', 'FOUR HORSEMEN!', 'STRAIGHT FROM THE CRYPT!', 'ROYAL FRIGHT!!!'
  ];
  if (bigPot && hand.category >= 6) return 'QUANTUM JACKPOT!';
  return byCategory[hand.category] || 'YOU ATE THE POT!';
}

export const LOSS_SHOUTS = [
  'THE CANDY HAS CHOSEN ANOTHER.',
  'MEASURED. COLLAPSED. DESTROYED.',
  'THE QUANTUM UNIVERSE HATES YOU.',
  'YOU HAVE BEEN QUANTUMLY ROBBED.',
  'THAT WENT BADLY IN EVERY UNIVERSE.',
  'SOMEWHERE, ANOTHER YOU WON THAT.'
];

export function lossShout(rng) {
  return LOSS_SHOUTS[Math.floor(rng() * LOSS_SHOUTS.length) % LOSS_SHOUTS.length];
}
