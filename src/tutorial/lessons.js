/**
 * tutorial/lessons.js — learning by doing, not by reading.
 *
 * Each lesson hands you a board that is rigged to make exactly one idea
 * obvious, a hand that can solve it, and a `done()` that recognises the
 * moment you have. Nothing is explained before you have seen it happen.
 *
 * The self-checks solve every lesson with the planner, so a lesson can never
 * ship unsolvable.
 */
import { QState } from '../quantum/state.js';
import { readCoin, findLinks, expectedScore } from '../quantum/read.js';

const ones = (st, n = 5) => { let c = 0; for (let q = 0; q < n; q++) if (st.probOne(q) > 1 - 1e-6) c++; return c; };

export const LESSONS = [
  {
    id: 'coins',
    title: 'Five coins',
    concept: 'Qubits',
    text: 'Five coins sit in the middle of the table. At the end of the hand every one of them lands on a 1 or a 0, and every 1 is a point. Three of these are already decided. Two are not.',
    aside: 'A coin is a qubit. "Not decided yet" is not the same as "decided but hidden" — that difference is the whole subject.',
    board: () => new QState(5).x(0).h(2).h(3).z(3),
    hand: [],
    goal: 'Hover each coin and read what it is.',
    interactive: 'inspect',
    done: (st, plays, ui) => !!(ui && ui.inspected >= 5),
    autoDone: true
  },

  {
    id: 'flip',
    title: 'Your first card',
    concept: 'The X gate',
    text: 'Your cards are the only way to change the board. Flip turns a 0 into a 1. Coin 2 is sitting on 0 and doing nothing for you. Fix that.',
    aside: 'Flip is the Pauli-X gate: the quantum NOT. It is the one operation that behaves exactly like its classical namesake.',
    board: () => new QState(5).x(0),
    hand: ['X'],
    goal: 'Get a second coin onto 1.',
    done: (st) => ones(st) >= 2
  },

  {
    id: 'spinning',
    title: 'A coin that has not landed',
    concept: 'Superposition',
    text: 'Coin 3 is spinning. It is not a 1 and not a 0; it is genuinely both until something makes it choose. Flip does nothing to it — try it and watch nothing happen. Spin is what stops a spinning coin.',
    aside: 'Superposition. The coin has no secret value you could look up. Physics has tested this to absurd precision and the coin really is undecided.',
    board: () => new QState(5).h(2).z(2),
    hand: ['H', 'X'],
    goal: 'Stop coin 3 on a 1.',
    done: (st) => st.probOne(2) > 1 - 1e-6
  },

  {
    id: 'tilt',
    title: 'The tilt',
    concept: 'Phase and interference',
    text: 'Both of these coins are 50/50, but they are not the same. One is spinning "+", one is spinning "−". Spin lands a + on 0 and a − on 1. Same odds, opposite destinies. Twist flips a coin between + and −.',
    aside: 'The tilt is relative phase. It changes no probability at all until a gate turns it into an outcome — and that conversion is interference, the engine every quantum algorithm runs on.',
    board: () => new QState(5).h(1).h(3).z(3),
    hand: ['H', 'H', 'Z'],
    goal: 'Land both spinning coins on 1.',
    done: (st) => st.probOne(1) > 1 - 1e-6 && st.probOne(3) > 1 - 1e-6
  },

  {
    id: 'link',
    title: 'Two coins, one fate',
    concept: 'Entanglement',
    text: 'Play Link with a spinning coin as the control and the two become one object. They will land the same way every time, but which way is still undecided. Then Flip one of them: now exactly one of the pair is guaranteed to be a 1.',
    aside: 'Entanglement. Neither coin has a state of its own any more — only the pair does. This is the resource that makes a quantum computer more than a fast classical one.',
    board: () => new QState(5).h(1),
    hand: ['CX', 'X'],
    goal: 'Link two coins together.',
    bonus: 'Then Flip one of the pair, and exactly one of them is guaranteed.',
    done: (st) => findLinks(st).length >= 1,
    starred: (st) => findLinks(st).some((l) => !l.same)
  },

  {
    id: 'collapse',
    title: 'Looking at it',
    concept: 'Measurement',
    text: 'Collapse lands a spinning coin right now, on your board, before the showdown. It is a fair toss — and afterwards you still have cards. Collapse this one. If it lands wrong, Flip it.',
    aside: 'A projective measurement. It is the only irreversible thing in quantum mechanics: every other gate can be undone, this one cannot.',
    board: () => new QState(5).x(0).x(1).x(2).x(3).h(4),
    hand: ['M', 'X'],
    goal: 'Guarantee all five coins on 1.',
    done: (st) => ones(st) === 5
  },

  {
    id: 'reading',
    title: 'Reading the table',
    concept: 'Probability',
    text: 'The number under each coin is its real chance of landing on 1, computed from the actual quantum state. Press Ψ at any time to see the kets and the maths underneath. Nothing here is decoration.',
    aside: 'Every probability the table shows comes from a genuine state-vector simulation — 2ⁿ complex amplitudes with the real gate matrices applied. It is the same arithmetic a physicist would do.',
    board: () => new QState(5).h(0).cx(0, 1).h(2).ry(3, Math.PI / 3),
    hand: [],
    goal: 'Open the readout and look at the state.',
    interactive: 'psi',
    done: (st, plays, ui) => !!(ui && ui.psiOpened),
    autoDone: true
  },

  {
    id: 'betting',
    title: 'Betting on it',
    concept: 'The poker part',
    text: 'You bet in four rounds as the coins come out, exactly as in Hold’em. You are not betting on the coins — everyone shares those. You are betting on what your cards can do to them, and nobody can see your cards.',
    aside: 'This is why the game works: the community board is public and the transformation is private. Your edge is knowing a line the table cannot see.',
    board: () => new QState(5).h(0).h(1).z(1).x(2),
    hand: ['H', 'Z', 'X'],
    goal: 'Build the best board you can from this hand.',
    done: (st) => ones(st) >= 3
  },

  {
    id: 'noise',
    title: 'The machine fights back',
    concept: 'Decoherence',
    text: 'On real hardware a qubit does not sit still. It leaks, drifts and flips on its own. In most modes something will go wrong on your board eventually, and Freeze is how you stop it.',
    aside: 'Decoherence is the reason we do not already have useful quantum computers. Every one of the noise events in this game is a channel from a real error model.',
    board: () => new QState(5).x(0).x(1).h(2),
    hand: ['FREEZE', 'H'],
    goal: 'Protect a coin that matters.',
    // The planner is a scoring engine and Freeze changes no score, so it can
    // never solve this one. It is checked by hand instead.
    plannerExempt: true,
    done: (st, plays) => plays.some((p) => p.card === 'FREEZE')
  },

  {
    id: 'showdown',
    title: 'Counting up',
    concept: 'Measurement, for real',
    text: 'At showdown every board lands at once and the ones are counted. Tied on count? A 1 further left wins — coin 1 is the ace. Five ones is Coherence, and it is worth shouting about.',
    aside: 'You have now used superposition, phase, interference, entanglement and measurement to win a hand of poker. That is a first undergraduate course in quantum computing.',
    board: () => new QState(5).h(0).z(0).h(1).z(1).x(2).h(3).z(3).x(4),
    hand: ['H', 'H', 'H'],
    goal: 'Land Coherence: all five coins on 1.',
    done: (st) => ones(st) === 5
  }
];

export function lessonById(id) { return LESSONS.find((l) => l.id === id) || null; }
