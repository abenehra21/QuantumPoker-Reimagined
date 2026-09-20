/**
 * halloween/powers.js — the four things a player can do that are not poker.
 *
 * The brief for this mode was a hard limit on how much anyone should have
 * to learn, so there are four powers and each one is a verb with a single
 * sentence attached. No gate names, no matrices, no vocabulary. A player who
 * ignores all four of them is playing ordinary Texas Hold'em and can still
 * win, which is the balance line this mode is built around.
 *
 * Every power carries a `learn` note, which is the only place the real
 * physics is named. It lives behind a "what is this really?" link that
 * nobody has to click.
 */

export const POWERS = {
  MEASURE: {
    id: 'MEASURE', name: 'Measure', icon: '\u{1F441}', tint: '#6ee7ff',
    blurb: 'Reveal a mystery card right now.',
    detail: 'Pick any "?" on the table and find out what it really is. Yours or anyone else’s.',
    learn: 'Measurement. Until you look, the card genuinely has no single value — it is not that the ' +
      'game is hiding the answer from you, it is that there is not one yet. Looking is what creates it, ' +
      'and it is the one move in quantum mechanics you cannot undo.',
    cost: 1, needsTarget: 'mystery',
    unlockRound: 2
  },

  SWAP: {
    id: 'SWAP', name: 'Swap', icon: '\u{1F500}', tint: '#c084fc',
    blurb: 'Trade one of your cards for a new one.',
    detail: 'Throw a card back into the night and take whatever comes out. No takebacks.',
    learn: 'A swap is a real two-qubit gate — the one that exchanges two states completely. On actual ' +
      'quantum hardware it is surprisingly expensive, which is why chips are laid out to avoid needing it.',
    cost: 1, needsTarget: 'own',
    unlockRound: 3
  },

  HAUNT: {
    id: 'HAUNT', name: 'Haunt', icon: '\u{1F47B}', tint: '#a5b4fc',
    blurb: 'Your card becomes two possibilities at once.',
    detail: 'Pick one of your cards. It turns into a "?" that is secretly either the card you had or a ' +
      'brand new one — and it does not decide until showdown.',
    learn: 'Superposition. The card is not secretly one of the two while pretending to be both; it is ' +
      'genuinely both until something measures it. Physicists have tested the alternative — that there ' +
      'is a hidden answer all along — and it is ruled out.',
    cost: 2, needsTarget: 'own',
    unlockRound: 4
  },

  BLUFF: {
    id: 'BLUFF', name: 'Spectral Bluff', icon: '\u{1F3AD}', tint: '#f472b6',
    blurb: 'Your face-up card turns into a "?" for everyone else.',
    detail: 'You still see it. They do not. It might hold — or it might collapse early and show them ' +
      'everything.',
    learn: 'A superposition nobody else can measure is still a superposition to them. Information and ' +
      'physics are the same subject here: what the other players can know is exactly what the state lets ' +
      'them know.',
    cost: 2, needsTarget: 'none',
    risk: 0.3,
    unlockRound: 5
  }
};

export const POWER_IDS = Object.keys(POWERS);

/** Which powers exist yet, given how many rounds have been played. */
export function unlockedAt(round) {
  return POWER_IDS.filter((id) => round >= POWERS[id].unlockRound);
}

/** The one that unlocks exactly on this round, for the "NEW POWER" banner. */
export function newlyUnlocked(round) {
  return POWER_IDS.find((id) => POWERS[id].unlockRound === round) || null;
}

/**
 * Charges, not cooldowns. A player gets a small pool each hand, which keeps
 * the powers exciting without turning every hand into a spell-casting
 * contest, and means somebody who forgets they exist loses nothing they
 * were counting on.
 *
 * Three, not two: Haunt costs two and Measure one, and at two charges a
 * player could never measure the card they had just haunted. That is the
 * most natural two-card combination in the mode and it was impossible.
 */
export const CHARGES_PER_HAND = 3;
