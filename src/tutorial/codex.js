/**
 * tutorial/codex.js — the Quantum Encyclopedia.
 *
 * Fourteen entries. Each one is written to be read by someone who came for a
 * card game, and each one carries a `demo` the reader can run on the spot:
 * a board plus a sequence of gates, so the idea is never only words.
 */
import { QState } from '../quantum/state.js';

export const CODEX = [
  {
    id: 'qubit', title: 'The qubit', icon: '●', section: 'Foundations',
    lede: 'A coin that has not landed.',
    body: `A classical bit is 0 or 1. A qubit is a direction in a two-dimensional space, which means it can be 0, or 1, or any blend of the two at once.

The blend is not ignorance. If you flip a real coin and cover it, the coin is already heads or tails and you simply do not know which. A qubit in superposition is not like that: there is no answer yet. Experiments have ruled out the "hidden answer" version to a precision that leaves no room to argue.

At the table, a settled coin is a 0 or a 1. A spinning coin is a qubit in superposition. When you measure it, it picks — and from then on it is an ordinary bit.`,
    demo: { board: [], ops: [['h', 0]], caption: 'A Spin turns a settled coin into a genuine 50/50.' }
  },
  {
    id: 'bloch', title: 'The Bloch sphere', icon: '◎', section: 'Foundations',
    lede: 'Every state of one qubit, drawn as a globe.',
    body: `Put |0⟩ at the north pole and |1⟩ at the south. Every other state of a single qubit is a point on the surface of the sphere between them.

Latitude is probability: at the equator you are at 50/50. Longitude is phase — the tilt — which changes no probability at all but decides what the next gate will do to you.

Gates are rotations of this sphere. Flip is a half turn about x. Twist is a half turn about z. Spin swaps the x and z axes, which is why it turns latitude into longitude and back.

If the arrow is shorter than the radius, the qubit is entangled with something else and has no state of its own. That is why an entangled coin's arrow visibly shrinks to nothing on the table.`,
    demo: { board: [], ops: [['h', 0], ['t', 0]], caption: 'Spin to the equator, then an eighth turn around it.' }
  },
  {
    id: 'superposition', title: 'Superposition', icon: '∿', section: 'Foundations',
    lede: 'Both, until asked.',
    body: `A qubit in superposition carries amplitudes for 0 and for 1 at the same time. Amplitudes are complex numbers, and the probability of an outcome is the square of its amplitude's length.

Because amplitudes are complex, they can cancel. Two paths to the same answer can add up to nothing. That is the difference between a quantum computer and a very fast random-number generator, and it is the only reason any of this is useful.

At the table, a spinning coin is worth exactly half a point in expectation. A player who knows the tilt can often make it worth a whole one.`,
    demo: { board: [], ops: [['h', 0], ['h', 0]], caption: 'Two Spins cancel exactly. The coin comes back to 0.' }
  },
  {
    id: 'phase', title: 'Phase', icon: '⦿', section: 'Foundations',
    lede: 'The invisible half of the state.',
    body: `Two coins can both be 50/50 and still be completely different. The difference is phase: which way the superposition is tilted.

Phase is invisible to measurement. Measure a + coin and a − coin a million times each and the statistics are identical. But apply a Spin first and they go in opposite directions — + lands on 0, − lands on 1, every single time.

This is why Twist looks like a wasted card until the move after it.`,
    demo: { board: [['h', 0], ['h', 1], ['z', 1]], ops: [['h', 0], ['h', 1]], caption: 'Same odds, opposite outcomes. Only the tilt differed.' }
  },
  {
    id: 'interference', title: 'Interference', icon: '✳', section: 'Foundations',
    lede: 'Paths that cancel.',
    body: `Run a Spin, then another Spin. The coin goes to 50/50 and then back to a certain 0 — not to a random answer. The two ways of reaching |1⟩ had opposite amplitudes and annihilated each other.

Every quantum algorithm is an exercise in arranging this: make the wrong answers cancel and the right answer add. Grover does it by reflection, Shor does it with a Fourier transform, and the Twist-then-Spin line you play at the table does it in two cards.`,
    demo: { board: [['h', 0], ['z', 0]], ops: [['h', 0]], caption: 'A − coin plus a Spin is a certain point. That is interference.' }
  },
  {
    id: 'entanglement', title: 'Entanglement', icon: '∞', section: 'Two qubits',
    lede: 'A pair with no parts.',
    body: `Play Link with a spinning control and the two coins stop being two things. The pair has a definite state — "we will land the same" — while neither coin alone has any state at all.

Measure one and the other is decided instantly, however far apart they are. Nothing travels: you cannot use it to send a message, because the outcome you got was random and you could not choose it.

At the table, a linked pair is worth 0 or 2 and never 1. That makes it a swing, not a safe point — unless you Flip one of them first, which guarantees exactly one.`,
    demo: { board: [], ops: [['h', 0], ['cx', 0, 1]], caption: 'A Bell pair. Neither coin has a Bloch arrow left.' }
  },
  {
    id: 'bell', title: 'Bell states', icon: 'Ω', section: 'Two qubits',
    lede: 'The four ways two qubits can be maximally linked.',
    body: `There are exactly four maximally entangled states of two qubits, and every entangled pair at the table is one of them. Two make the coins land alike, two make them land opposite.

The table detects a link by projecting each pair onto all four and drawing the arc only when the overlap is exactly 1. That is why a partial correlation shows as a faint arc rather than a solid one — it is genuinely a weaker link, not a rendering choice.

John Bell proved in 1964 that no theory with hidden answers can reproduce the correlations these states produce. Experiments have agreed with him ever since, and the 2022 Nobel Prize went to the people who ran them.`,
    demo: { board: [], ops: [['h', 0], ['cx', 0, 1], ['z', 0]], caption: 'A different Bell state. Same link, opposite phase.' }
  },
  {
    id: 'measurement', title: 'Measurement', icon: 'M', section: 'Two qubits',
    lede: 'The one thing you cannot undo.',
    body: `Every gate in this game is reversible. Play it twice, or play its inverse, and the board is exactly where it started. Measurement is the exception.

When you measure, the branches that disagree with the outcome are deleted and what remains is rescaled. Superposition through that coin is gone. Any link through it is gone. This is why Rewind, which can undo any gate, refuses to undo a Collapse — and why the card says so.

You also get to choose what you measure. Collapse asks "1 or 0". Sideways Look asks "+ or −" — the same coin, a different question, a different kind of answer.`,
    demo: { board: [['h', 0], ['cx', 0, 1]], ops: [['measure', 0]], caption: 'One measurement settles both halves of a pair.' }
  },
  {
    id: 'gates', title: 'Gates and circuits', icon: 'X', section: 'Circuits',
    lede: 'The card art is the notation.',
    body: `A quantum circuit is read left to right: horizontal wires are qubits, boxes are gates, a filled dot joined to a target is a controlled operation, and the little meter at the end is a measurement.

Every card in this game carries the symbol a physicist would draw for that gate. Press the Circuit View at the table and you can watch the diagram assemble itself as you play — and export it as OpenQASM, which will run unmodified on IBM hardware.

Depth matters more than count. Gates on different wires happen at the same time; only gates that share a wire have to queue. On real hardware depth is time, and time is decoherence.`,
    demo: { board: [], ops: [['h', 0], ['cx', 0, 1], ['x', 2]], caption: 'Three gates, depth two: the X happens alongside the H.' }
  },
  {
    id: 'universality', title: 'Universality', icon: '✦', section: 'Circuits',
    lede: 'Why a small set of cards is enough.',
    body: `You do not need every possible gate. Hadamard, phase and CNOT together with the T gate can approximate any quantum operation at all, to any accuracy you like.

There is a catch, and it is the reason T is a rare card. The gates without T — the Clifford group — can be simulated efficiently on an ordinary laptop. Add T and that stops being true. The T gates are where the quantum advantage actually lives, and on error-corrected hardware they are by far the most expensive thing you can do.`,
    demo: { board: [], ops: [['h', 0], ['t', 0], ['h', 0]], caption: 'An angle no Clifford gate can reach.' }
  },
  {
    id: 'noise', title: 'Decoherence', icon: '☢', section: 'Reality',
    lede: 'Why you do not own one of these.',
    body: `A qubit is only quantum while the rest of the universe is not watching. Stray photons, thermal vibration, a badly shielded cable, a cosmic ray: all of them measure it a little, and a little is enough.

The table models this with real channels. Relaxation is T1, energy leaking out of a |1⟩. Dephasing is T2, the tilt randomising while the odds stay put. Bit flips and depolarising noise are the blunt errors. None of them are invented for the game.

This is what "NISQ" means — Noisy Intermediate-Scale Quantum. It is the era we are actually in, and it is why circuit depth is a budget rather than a number.`,
    demo: { board: [['x', 0], ['x', 1], ['h', 2]], ops: [], caption: 'A board worth protecting. Play it in a storm and watch.' }
  },
  {
    id: 'mitigation', title: 'Error mitigation', icon: '⛨', section: 'Reality',
    lede: 'Getting the right answer from the wrong machine.',
    body: `Error correction — spending a thousand physical qubits to get one good one — is coming, but it is not here. Mitigation is what people do meanwhile: accept the noise, then subtract it statistically.

Zero-noise extrapolation is the clearest example, and this game actually runs it. Deliberately make the circuit noisier, measure again, and extrapolate the trend back to zero noise. The Error Mitigation card and the relic of the same name do exactly this, and the self-checks verify that the extrapolated answer is genuinely closer to the truth than the raw one.

The original Quantum Poker paper was written as a benchmark for precisely these techniques.`,
    demo: { board: [['x', 0], ['x', 1]], ops: [], caption: 'Two certain points — until the hardware disagrees.' }
  },
  {
    id: 'grover', title: 'Grover’s algorithm', icon: 'G', section: 'Algorithms',
    lede: 'Searching without looking.',
    body: `Given an unsorted list of N things and a way to recognise the one you want, a classical computer needs about N/2 looks. Grover needs about √N.

It works by repeating two reflections: mark the answer by flipping its phase, then reflect every amplitude about the average. Each round nudges a little more weight onto the marked answer. Do it too many times and it slides back off — there is such a thing as over-searching.

The Grover card performs one round on your whole board, marking the all-ones outcome. It cannot promise you anything, which is the honest lesson: quantum speedups are quadratic here, not miraculous.`,
    demo: { board: [['h', 0], ['h', 1], ['h', 2], ['h', 3], ['h', 4]], ops: [], caption: 'A flat board is what Grover is built to work on.' }
  },
  {
    id: 'teleportation', title: 'Teleportation', icon: '⟶', section: 'Algorithms',
    lede: 'Moving a state, not matter, and not faster than light.',
    body: `You cannot copy an unknown quantum state — that is the no-cloning theorem, and it is why the relic of that name exists. But you can move one.

Share an entangled pair, measure your qubit jointly with the one you want to send, and phone the two-bit result to the other end. Those two bits tell the receiver which of four corrections to apply, and the state appears there while vanishing from where it was.

The classical call is essential and it travels at ordinary speed, which is why nothing here outruns light. The Teleport card plays this out in full: the Bell measurement, the classical bit, the correction.`,
    demo: { board: [['ry', 0, 1.1]], ops: [['cx', 0, 1], ['h', 0]], caption: 'Halfway through a teleportation: the Bell measurement.' }
  }
];

export const CODEX_SECTIONS = ['Foundations', 'Two qubits', 'Circuits', 'Reality', 'Algorithms'];

export function codexById(id) { return CODEX.find((c) => c.id === id) || null; }

/** Run a codex demo and return the state it produces. */
export function runDemo(demo, n = 5) {
  const st = new QState(n);
  for (const step of (demo.board || [])) st[step[0]](...step.slice(1));
  for (const step of (demo.ops || [])) {
    if (step[0] === 'measure') st.project(step[1], st.probOne(step[1]) >= 0.5 ? 1 : 0);
    else st[step[0]](...step.slice(1));
  }
  return st;
}
