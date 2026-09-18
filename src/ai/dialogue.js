/**
 * ai/dialogue.js — what the table says.
 *
 * Lines are chosen deterministically from the seed and the hand number, so a
 * shared seed replays the same banter as well as the same cards. Nobody
 * repeats a line twice in a row.
 */
const recent = new Map();

export function speak(persona, situation, rng) {
  const pool = (persona.lines && persona.lines[situation]) || null;
  if (!pool || !pool.length) return null;
  const last = recent.get(persona.key + situation);
  let line = pool[Math.floor(rng() * pool.length) % pool.length];
  if (pool.length > 1 && line === last) {
    line = pool[(pool.indexOf(line) + 1) % pool.length];
  }
  recent.set(persona.key + situation, line);
  return line;
}

/** Which line fits what just happened. */
export function situationFor(ev, ctx) {
  switch (ev) {
    case 'raise': return ctx && ctx.bluff ? 'raise' : 'raise';
    case 'allin': return 'raise';
    case 'call': return 'call';
    case 'check': return null;
    case 'fold': return 'fold';
    case 'win': return ctx && ctx.big ? 'win' : 'win';
    case 'lose': return ctx && ctx.big ? 'bigLoss' : 'lose';
    case 'handStart': return ctx && ctx.first ? 'greet' : null;
    case 'quantum': return 'quantum';
    default: return null;
  }
}

/**
 * The dealer. Not a personality — a narrator. It explains what just happened
 * in the plainest words available, which is the single most useful teaching
 * device in the game.
 */
export const DEALER = {
  name: 'The Dealer',
  street: (round, revealed) => [
    'Cards out. You are betting on what your gates can do, not on what is showing.',
    `Flop. Three coins face up — ${revealed} of five.`,
    'Turn. A fourth coin.',
    'River. The last coin. This is what you get.'
  ][round] || '',
  gatePhase: 'Card phase. Everyone plays on their own copy of the board — nobody can touch yours.',
  showdown: 'Every board lands at once. Count the ones.',
  explain: {
    superposition: 'A spinning coin has not decided yet. It is not hiding an answer; there is no answer to hide.',
    entangle: 'Those two are linked. Neither has a value of its own any more — only the pair does.',
    interference: 'That is interference: two paths to the same outcome cancelling. It is the whole trick.',
    collapse: 'Measured. That is the one thing in quantum mechanics you cannot take back.',
    noise: 'The environment got in. Real machines fight this every microsecond they run.'
  }
};
