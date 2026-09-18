/**
 * gameplay/cards.js — the deck.
 *
 * Forty cards. Every one of them is a real quantum operation: the common ones
 * are the Clifford gates a first lecture covers, the rares add phase, the
 * epics add continuous rotation and the legendaries are named algorithms.
 * The card art *is* the circuit symbol, so a player who learns this deck has
 * learned to read a circuit diagram without being told that is what happened.
 *
 * A card is data plus two functions:
 *   ops(targets, ctx)  -> circuit instructions to apply (the physics)
 *   effect(ctx)        -> anything that is not a gate (status, reveal, draw)
 * Everything else — preview text, AI search, the circuit view, the tooltip,
 * the shop — is derived from those, so a new card is one entry here and
 * nothing else.
 */
import { QState } from '../quantum/state.js';
import { readCoin, findLinks, expectedScore } from '../quantum/read.js';

export const RARITY = {
  common:    { key: 'common',    name: 'Common',    tint: '#6ee7ff', weight: 100, price: 24,  glow: 0.35 },
  rare:      { key: 'rare',      name: 'Rare',      tint: '#7c9dff', weight: 46,  price: 55,  glow: 0.55 },
  epic:      { key: 'epic',      name: 'Epic',      tint: '#c084fc', weight: 18,  price: 110, glow: 0.8  },
  legendary: { key: 'legendary', name: 'Legendary', tint: '#ffb648', weight: 5,   price: 240, glow: 1.0  }
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

const PI = Math.PI;

/** Shorthand for a card that is exactly one gate. */
function gate(op, param) {
  return (t) => [{ op, targets: t, param: param === undefined ? null : param }];
}

/**
 * The catalogue. `arity` is how many coins you pick. `pick` describes the
 * picks in order so the table can prompt "choose the control, then the target".
 */
export const CARDS = {

  /* ================= COMMON ================= */

  X: {
    id: 'X', name: 'Flip', rarity: 'common', arity: 1, gate: 'X', symbol: 'X',
    pick: ['the coin to flip'],
    blurb: 'Turns 0 into 1 and 1 into 0. A spinning coin ignores it.',
    physics: 'Pauli-X. A half turn about the x axis — the quantum NOT.',
    hint: 'The bluntest point in the game. Best saved for a coin you have already settled on 0.',
    ops: gate('x')
  },

  H: {
    id: 'H', name: 'Spin', rarity: 'common', arity: 1, gate: 'H', symbol: 'H',
    pick: ['the coin to spin'],
    blurb: 'Spins a settled coin. Stops a spinning one: + lands on 0, − lands on 1.',
    physics: 'Hadamard. Swaps the z and x axes, so it turns certainty into superposition and back.',
    hint: 'A − coin is one Spin from a point. That is interference, and it is the best deal on the table.',
    ops: gate('h')
  },

  Z: {
    id: 'Z', name: 'Twist', rarity: 'common', arity: 1, gate: 'Z', symbol: 'Z',
    pick: ['the coin to twist'],
    blurb: 'Turns a + spin into − and back. Does nothing to a settled coin.',
    physics: 'Pauli-Z. It changes only the phase, which is invisible until a Spin converts it into an outcome.',
    hint: 'Twist then Spin turns a + coin into a guaranteed point. Two cards, one certainty.',
    ops: gate('z')
  },

  Y: {
    id: 'Y', name: 'Wrench', rarity: 'common', arity: 1, gate: 'Y', symbol: 'Y',
    pick: ['the coin to wrench'],
    blurb: 'Flips a settled coin and twists a spinning one, in a single move.',
    physics: 'Pauli-Y = iXZ. A half turn about the y axis.',
    hint: 'Flip and Twist in one card. Rarely the best play, never a wasted one.',
    ops: gate('y')
  },

  SX: {
    id: 'SX', name: 'Half Flip', rarity: 'common', arity: 1, gate: '√X', symbol: '√X',
    pick: ['the coin to nudge'],
    blurb: 'Half of a Flip. A settled coin becomes a coin toss; toss it again to finish the flip.',
    physics: '√X = Rx(π/2) up to phase. One of the two gates IBM hardware actually runs.',
    hint: 'Two Half Flips make a Flip. One makes a 50/50 that a Twist cannot touch.',
    ops: (t) => [{ op: 'rx', targets: t, param: PI / 2 }]
  },

  M: {
    id: 'M', name: 'Collapse', rarity: 'common', arity: 1, gate: 'measure', symbol: 'M',
    pick: ['the coin to land'],
    blurb: 'Lands a spinning coin right now, on your board. You can still play on it afterwards.',
    physics: 'A projective measurement. The branch that disagrees is deleted and the rest renormalised.',
    hint: 'Collapse a coin toss, then Flip it if it lands wrong. Two cards, one guaranteed point.',
    random: true,
    ops: (t) => [{ op: 'measure', targets: t }]
  },

  I: {
    id: 'I', name: 'Idle', rarity: 'common', arity: 0, gate: 'I', symbol: 'I',
    pick: [],
    blurb: 'Does nothing to the board. Discard it to draw a fresh card.',
    physics: 'The identity gate. On real hardware it is a deliberate wait, used to measure how fast a qubit decays.',
    hint: 'Free. Always play it first — the card you draw cannot be worse than this one.',
    cantrip: true,
    ops: () => [],
    effect: (ctx) => ({ draw: 1, note: 'Idle — drew a card.' })
  },

  RESET: {
    id: 'RESET', name: 'Ground', rarity: 'common', arity: 1, gate: 'reset', symbol: '⏚',
    pick: ['the coin to ground'],
    blurb: 'Forces a coin down to 0, whatever it was doing. Breaks any link through it.',
    physics: 'Reset: measure, then flip if the answer was 1. Real hardware does exactly this between shots.',
    hint: 'Looks like a wasted point, but a grounded coin is a clean slate for Spin or Flip.',
    // The coin itself always lands on 0, but grounding it measures it, and
    // that collapses anything it was linked to. The planner has to branch.
    random: true,
    ops: (t) => [{ op: 'reset', targets: t }]
  },

  /* ================= RARE ================= */

  CX: {
    id: 'CX', name: 'Link', rarity: 'rare', arity: 2, gate: 'CNOT', symbol: 'CX',
    pick: ['the control coin', 'the coin it flips'],
    blurb: 'If the first coin is 1, flips the second. If it is spinning, links the two together.',
    physics: 'Controlled-NOT. The gate that creates entanglement, and the one every algorithm is built from.',
    hint: 'Link a spinning coin to a 0 and they always land together. Then Flip one and exactly one of them is a point.',
    ops: gate('cx')
  },

  SWAP: {
    id: 'SWAP', name: 'Exchange', rarity: 'rare', arity: 2, gate: 'SWAP', symbol: '✕',
    pick: ['a coin', 'the coin to swap it with'],
    blurb: 'Trades two coins completely — spin, tilt, links and all.',
    physics: 'Three CNOTs back to back. Expensive on real hardware, which is why chips are laid out to avoid it.',
    hint: 'Ties break leftwards, so moving your certain 1 to coin 1 can win a hand you had already tied.',
    ops: gate('swap')
  },

  S: {
    id: 'S', name: 'Quarter', rarity: 'rare', arity: 1, gate: 'S', symbol: 'S',
    pick: ['the coin to turn'],
    blurb: 'A quarter twist. Two of them make a full Twist.',
    physics: 'The phase gate, S = √Z. It moves the arrow a quarter turn around the equator.',
    hint: 'Quarter then Spin lands a + coin on a true coin toss instead of a certainty. Sometimes that is what you want.',
    ops: gate('s')
  },

  SDG: {
    id: 'SDG', name: 'Unquarter', rarity: 'rare', arity: 1, gate: 'S†', symbol: 'S†',
    pick: ['the coin to turn back'],
    blurb: 'A quarter twist the other way. Undoes a Quarter exactly.',
    physics: 'S-dagger, the inverse phase gate. Every quantum gate has an inverse; that is what unitary means.',
    hint: 'The cleanest answer to an opponent’s Quarter, and the only way to unwind a T.',
    ops: gate('sdg')
  },

  T: {
    id: 'T', name: 'Eighth', rarity: 'rare', arity: 1, gate: 'T', symbol: 'T',
    pick: ['the coin to turn'],
    blurb: 'An eighth of a twist. Small, awkward, and the reason quantum computers are powerful.',
    physics: 'The T gate. Clifford gates alone are classically simulable; adding T is what makes a computer universal.',
    hint: 'Alone it does almost nothing. Stacked with Spin it reaches angles no other card can.',
    ops: gate('t')
  },

  BELL: {
    id: 'BELL', name: 'Bell Pair', rarity: 'rare', arity: 2, gate: 'H·CX', symbol: '∞',
    pick: ['the first coin', 'the second coin'],
    blurb: 'Forces two coins into a perfect link. They will always land the same way.',
    physics: 'Hadamard then CNOT: the standard recipe for the Bell state (|00⟩+|11⟩)/√2.',
    hint: 'Two linked coins are worth 0 or 2, never 1. Play it when you need a swing, not a sure thing.',
    random: true,                                   // resetting the pair measures it
    ops: (t) => [
      { op: 'reset', targets: [t[0]] },
      { op: 'reset', targets: [t[1]] },
      { op: 'h', targets: [t[0]] },
      { op: 'cx', targets: t }
    ]
  },

  FREEZE: {
    id: 'FREEZE', name: 'Freeze', rarity: 'rare', arity: 1, gate: 'shield', symbol: '❄',
    pick: ['the coin to protect'],
    blurb: 'Seals a coin for the rest of the hand. Noise, storms and opponents cannot touch it.',
    physics: 'Dynamical decoupling: a pulse sequence that holds a qubit still while the environment batters it.',
    hint: 'Only worth a card when the board is noisy. On a clean table it is a blank.',
    ops: () => [],
    effect: (ctx) => ({ status: { key: 'frozen', coin: ctx.targets[0], hand: true }, note: `Coin ${ctx.targets[0] + 1} is frozen.` })
  },

  DEUTSCH: {
    id: 'DEUTSCH', name: 'Parity Read', rarity: 'rare', arity: 2, gate: 'Deutsch', symbol: '⊕',
    pick: ['a coin', 'another coin'],
    blurb: 'Tells you whether two coins will land the same or differently — without landing either.',
    physics: 'The Deutsch trick: one query answers a global question about a function you never evaluated.',
    hint: 'Information, not points. Worth it right before you commit your last two cards.',
    ops: () => [],
    effect: (ctx) => {
      const p = ctx.state.bellProbs(ctx.targets[0], ctx.targets[1]);
      const same = p[0] + p[1];
      return {
        reveal: { kind: 'parity', coins: ctx.targets.slice(), same },
        note: same > 0.99 ? 'They will always land the same.'
          : same < 0.01 ? 'They will always land differently.'
          : `${Math.round(same * 100)}% chance they land the same.`
      };
    }
  },

  SPREAD: {
    id: 'SPREAD', name: 'Broadcast', rarity: 'rare', arity: 0, gate: 'H⊗n', symbol: '≡',
    pick: [],
    blurb: 'Spins every settled coin on your board at once.',
    physics: 'Hadamard on every wire — the opening move of almost every quantum algorithm.',
    hint: 'Chaos. Play it when you are behind and need the board rewritten, never when you are ahead.',
    ops: (t, ctx) => {
      const out = [];
      for (let q = 0; q < ctx.state.n; q++) {
        if (readCoin(ctx.state, q).settled) out.push({ op: 'h', targets: [q] });
      }
      return out;
    }
  },

  CHAIN: {
    id: 'CHAIN', name: 'Cascade', rarity: 'rare', arity: 1, gate: 'CX chain', symbol: '⋮',
    pick: ['the coin to cascade from'],
    blurb: 'Links the chosen coin to the one after it, and that one to the next.',
    physics: 'A CNOT ladder: how a GHZ state is built, one rung at a time.',
    hint: 'Three coins that rise and fall together. Enormous when it lands, nothing when it does not.',
    ops: (t, ctx) => {
      const n = ctx.state.n, a = t[0];
      const b = (a + 1) % n, c = (a + 2) % n;
      return [{ op: 'cx', targets: [a, b] }, { op: 'cx', targets: [b, c] }];
    }
  },

  /* ================= EPIC ================= */

  CZ: {
    id: 'CZ', name: 'Bind', rarity: 'epic', arity: 2, gate: 'CZ', symbol: 'CZ',
    pick: ['a coin', 'another coin'],
    blurb: 'Twists the second coin, but only on the branches where the first is 1.',
    physics: 'Controlled-Z. Symmetric — it does not matter which coin you call the control.',
    hint: 'Invisible on its own. Follow it with Spin and the interference does the work.',
    ops: gate('cz')
  },

  CPHASE: {
    id: 'CPHASE', name: 'Tether', rarity: 'epic', arity: 2, gate: 'CP(π/2)', symbol: 'CP',
    pick: ['a coin', 'another coin'],
    blurb: 'A quarter-strength Bind. Partial correlation instead of a hard link.',
    physics: 'Controlled phase. The tunable dial between "not entangled" and "Bell pair".',
    hint: 'The subtle card. It sets up interference two plays ahead.',
    ops: (t) => [{ op: 'cphase', targets: t, param: PI / 2 }]
  },

  CCX: {
    id: 'CCX', name: 'Toffoli', rarity: 'epic', arity: 3, gate: 'CCX', symbol: 'CCX',
    pick: ['the first control', 'the second control', 'the coin it flips'],
    blurb: 'Flips the last coin only when both of the first two are 1.',
    physics: 'The Toffoli gate. Classical computing in one card: it is a reversible AND.',
    hint: 'Set up two certain 1s and this is a guaranteed third point.',
    ops: gate('ccx')
  },

  RX: {
    id: 'RX', name: 'Tip', rarity: 'epic', arity: 1, gate: 'Rx(π/3)', symbol: 'Rx',
    pick: ['the coin to tip'],
    blurb: 'Tips a coin a third of the way over. A 0 becomes a 25% chance of a 1.',
    physics: 'A rotation about x by π/3. Continuous angles — most of the sphere is only reachable this way.',
    hint: 'Three Tips make a Flip. Two leave you at 75%, which beats a coin toss and costs one card less.',
    ops: (t) => [{ op: 'rx', targets: t, param: PI / 3 }]
  },

  RY: {
    id: 'RY', name: 'Lean', rarity: 'epic', arity: 1, gate: 'Ry(π/3)', symbol: 'Ry',
    pick: ['the coin to lean'],
    blurb: 'Leans a coin a third of the way over, with no tilt left behind.',
    physics: 'A rotation about y. Keeps the amplitudes real, which is why state-prep uses it.',
    hint: 'Tip’s cleaner cousin. Use it when you still want to Twist afterwards.',
    ops: (t) => [{ op: 'ry', targets: t, param: PI / 3 }]
  },

  RZ: {
    id: 'RZ', name: 'Precess', rarity: 'epic', arity: 1, gate: 'Rz(π/3)', symbol: 'Rz',
    pick: ['the coin to precess'],
    blurb: 'Rotates a spinning coin’s tilt part way round. Changes no odds by itself.',
    physics: 'A rotation about z. On hardware it is free — it is done by changing when the next pulse fires.',
    hint: 'Never worth a card alone. With Spin after it, it sets any probability you like.',
    ops: (t) => [{ op: 'rz', targets: t, param: PI / 3 }]
  },

  ISWAP: {
    id: 'ISWAP', name: 'Braid', rarity: 'epic', arity: 2, gate: 'iSWAP', symbol: '⨂',
    pick: ['a coin', 'another coin'],
    blurb: 'Swaps two coins and twists them on the way past.',
    physics: 'iSWAP: a native two-qubit gate on superconducting chips, cheaper there than a plain SWAP.',
    hint: 'Exchange plus two free Quarters. Almost always the better half of that trade.',
    ops: (t) => [
      { op: 'swap', targets: t },
      { op: 's', targets: [t[0]] },
      { op: 's', targets: [t[1]] },
      { op: 'cz', targets: t }
    ]
  },

  ORACLE: {
    id: 'ORACLE', name: 'Oracle', rarity: 'epic', arity: 0, gate: 'oracle', symbol: '◉',
    pick: [],
    blurb: 'Reveals every opponent’s exact chance of beating you, for the rest of the hand.',
    physics: 'A black box you may query but never open — the object every quantum algorithm is built around.',
    hint: 'Turns the last betting round into arithmetic. Save it for a big pot.',
    ops: () => [],
    effect: () => ({ status: { key: 'oracle', hand: true }, reveal: { kind: 'opponents' }, note: 'The table is open to you.' })
  },

  ENTBOMB: {
    id: 'ENTBOMB', name: 'Entanglement Bomb', rarity: 'epic', arity: 1, gate: 'GHZ', symbol: '☢',
    pick: ['the coin at the centre'],
    blurb: 'Links the chosen coin to every other coin at once. All five land together, or none do.',
    physics: 'A GHZ state. The most fragile object in quantum mechanics: one measurement anywhere destroys it.',
    hint: 'A coin flip for the whole hand. Five points or none.',
    ops: (t, ctx) => {
      const out = [];
      for (let q = 0; q < ctx.state.n; q++) out.push({ op: 'reset', targets: [q] });
      out.push({ op: 'h', targets: [t[0]] });
      for (let q = 0; q < ctx.state.n; q++) if (q !== t[0]) out.push({ op: 'cx', targets: [t[0], q] });
      return out;
    }
  },

  PHASESTORM: {
    id: 'PHASESTORM', name: 'Phase Storm', rarity: 'epic', arity: 0, gate: 'Z⊗rand', symbol: '⛈',
    pick: [],
    blurb: 'Twists a random handful of coins — on every board at the table, not just yours.',
    physics: 'Correlated phase noise. The failure mode that ruins a real chip’s whole register at once.',
    hint: 'The only card that reaches across the table. Play it when your board has no tilt left to lose.',
    random: true, global: true,
    ops: (t, ctx) => {
      const out = [];
      for (let q = 0; q < ctx.state.n; q++) if (ctx.rng() < 0.5) out.push({ op: 'z', targets: [q] });
      return out;
    }
  },

  MEASUREX: {
    id: 'MEASUREX', name: 'Sideways Look', rarity: 'epic', arity: 1, gate: 'Mₓ', symbol: 'Mₓ',
    pick: ['the coin to read sideways'],
    blurb: 'Lands a coin on + or − instead of 1 or 0. It keeps spinning, but you know the tilt.',
    physics: 'Measurement in the x basis: H, measure, H. There is no privileged basis — only the one you chose.',
    hint: 'Turns an unknown tilt into a known one, and a known tilt is a guaranteed point after a Spin.',
    random: true,
    ops: (t) => [{ op: 'h', targets: t }, { op: 'measure', targets: t }, { op: 'h', targets: t }]
  },

  ZENO: {
    id: 'ZENO', name: 'Zeno', rarity: 'epic', arity: 1, gate: 'M\u207F', symbol: '\u231B',
    pick: ['the coin to watch'],
    blurb: 'Stares at a coin. It stops wherever it is now and cannot move again this hand.',
    physics: 'The quantum Zeno effect: measure a system often enough and it never evolves. A watched pot truly never boils.',
    hint: 'The only way to keep a 1 in a storm without spending Freeze.',
    random: true,
    ops: (t) => [{ op: 'measure', targets: t }],
    effect: (ctx) => ({ status: { key: 'frozen', coin: ctx.targets[0], hand: true }, note: `Coin ${ctx.targets[0] + 1} is watched, and so it is still.` })
  },

  AMPLIFY: {
    id: 'AMPLIFY', name: 'Amplify', rarity: 'epic', arity: 1, gate: 'diffuse', symbol: '⤴',
    pick: ['the coin to amplify'],
    blurb: 'Pushes a coin’s odds away from the middle — a likely 1 becomes likelier.',
    physics: 'One step of amplitude amplification, the engine inside Grover’s algorithm.',
    hint: 'Useless at 50/50. Devastating at 70%.',
    ops: (t, ctx) => {
      const p = ctx.state.probOne(t[0]);
      const theta = Math.asin(Math.sqrt(Math.max(0, Math.min(1, p))));
      const target = Math.min(PI / 2, theta * 1.8);
      return [{ op: 'ry', targets: t, param: 2 * (target - theta) }];
    }
  },

  /* ================= LEGENDARY ================= */

  GROVER: {
    id: 'GROVER', name: 'Grover', rarity: 'legendary', arity: 0, gate: 'Grover', symbol: 'G',
    pick: [],
    blurb: 'Searches every possible ending of your board and tilts all of them toward the best one.',
    physics: 'Grover’s algorithm: amplitude amplification over the whole 2ⁿ space, marking the all-ones state.',
    hint: 'The strongest card in the game and it still cannot promise you anything. That is the lesson.',
    /**
     * The real thing, written out: mark the all-ones branch with a
     * multi-controlled Z, then reflect about the mean as H, X, MCZ, X, H.
     *
     * Doing it as a genuine circuit rather than as a direct edit of the
     * amplitudes matters. The Circuit View and the QASM export both read
     * from these instructions, so an effect that edits the state behind
     * their back would draw a diagram that does not reproduce the board.
     * tools/verify_with_qiskit.py is what caught that, and now guards it.
     */
    ops: (t, ctx) => {
      const qs = [];
      for (let q = 0; q < ctx.state.n; q++) qs.push(q);
      const all = (op) => qs.map((q) => ({ op, targets: [q] }));
      return [
        { op: 'mcz', targets: qs },
        ...all('h'), ...all('x'),
        { op: 'mcz', targets: qs },
        ...all('x'), ...all('h')
      ];
    },
    effect: () => ({ note: 'Grover amplified the all-ones branch.', fx: 'grover' })
  },

  TELEPORT: {
    id: 'TELEPORT', name: 'Teleport', rarity: 'legendary', arity: 2, gate: 'teleport', symbol: '⟶',
    pick: ['the coin to send', 'where to send it'],
    blurb: 'Moves one coin’s exact state onto another and leaves the first grounded.',
    physics: 'Quantum teleportation: Bell measurement plus two classical bits. Nothing travels faster than light.',
    hint: 'Copy your best coin onto coin 1 and win every tie for the rest of the hand.',
    random: true,                                   // the Bell measurement is a real one
    ops: (t) => [
      { op: 'barrier', targets: [] },
      { op: 'cx', targets: t },
      { op: 'h', targets: [t[0]] },
      { op: 'measure', targets: [t[0]], teleport: true }
    ],
    effect: (ctx) => ({ note: `Coin ${ctx.targets[0] + 1} teleported into coin ${ctx.targets[1] + 1}.`, fx: 'teleport' })
  },

  ERRORMIT: {
    id: 'ERRORMIT', name: 'Error Mitigation', rarity: 'legendary', arity: 0, gate: 'ZNE', symbol: '⛨',
    pick: [],
    blurb: 'Immune to noise for the rest of the hand, and your true odds are shown exactly.',
    physics: 'Zero-noise extrapolation: run the circuit noisier on purpose, then extrapolate back to zero.',
    hint: 'On a clean table it is a dead card. In a storm it is the whole hand.',
    ops: () => [],
    effect: () => ({ status: { key: 'mitigated', hand: true }, note: 'Noise cannot reach you this hand.' })
  },

  NOISECANCEL: {
    id: 'NOISECANCEL', name: 'Echo', rarity: 'legendary', arity: 0, gate: 'echo', symbol: '↺',
    pick: [],
    blurb: 'Undoes every noise event that has hit your board this hand.',
    physics: 'A spin echo: a refocusing pulse that makes the drift of the last few microseconds cancel itself out.',
    hint: 'Hold it. The longer the hand runs in a storm, the more it gives back.',
    ops: () => [],
    effect: (ctx) => {
      const undone = ctx.player.noiseLog ? ctx.player.noiseLog.length : 0;
      if (ctx.player.noiseLog) {
        for (let i = ctx.player.noiseLog.length - 1; i >= 0; i--) {
          const e = ctx.player.noiseLog[i];
          if (e.kind === 'bitflip') ctx.state.x(e.q);
          else if (e.kind === 'phaseflip') ctx.state.z(e.q);
          else if (e.kind === 'dephasing') ctx.state.rz(e.q, -(e.angle || 0));
        }
        ctx.player.noiseLog.length = 0;
      }
      return { note: undone ? `Echo undid ${undone} noise event${undone === 1 ? '' : 's'}.` : 'Echo — nothing to undo.', fx: 'echo' };
    }
  },

  ANNEAL: {
    id: 'ANNEAL', name: 'Anneal', rarity: 'legendary', arity: 0, gate: 'anneal', symbol: '♨',
    pick: [],
    blurb: 'Cools the whole board. Every coin settles on whichever side it was already leaning.',
    physics: 'Quantum annealing: lower the temperature slowly and the system falls into its lowest-energy state.',
    hint: 'Turns a board of maybes into a board of certainties. Make sure they are leaning your way first.',
    random: true,
    ops: () => [],
    effect: (ctx) => {
      const settled = [];
      for (let q = 0; q < ctx.state.n; q++) {
        const p = ctx.state.probOne(q);
        if (p > 1e-6 && p < 1 - 1e-6) {
          const bit = p >= 0.5 ? 1 : 0;
          if (ctx.state.project(q, bit)) settled.push(q + 1);
          ctx.circuit.add('measure', [q], null, { bit, card: 'ANNEAL' });
        }
      }
      return { note: settled.length ? `Annealed coins ${settled.join(', ')}.` : 'Anneal — the board was already cold.', fx: 'anneal' };
    }
  },

  QFT: {
    id: 'QFT', name: 'Fourier', rarity: 'legendary', arity: 0, gate: 'QFT', symbol: 'ℱ',
    pick: [],
    blurb: 'Rewrites your whole board into its frequencies. Nobody can read what comes out, including you.',
    physics: 'The quantum Fourier transform: the engine inside Shor’s algorithm, in n² gates instead of n2ⁿ.',
    hint: 'A board with one certain 1 comes out perfectly flat. A flat board comes out sharp. Use it backwards.',
    ops: (t, ctx) => {
      const n = ctx.state.n, out = [];
      for (let j = 0; j < n; j++) {
        out.push({ op: 'h', targets: [j] });
        for (let k = j + 1; k < n; k++) {
          out.push({ op: 'cphase', targets: [k, j], param: PI / Math.pow(2, k - j) });
        }
      }
      for (let j = 0; j < Math.floor(n / 2); j++) out.push({ op: 'swap', targets: [j, n - 1 - j] });
      return out;
    }
  },

  REWIND: {
    id: 'REWIND', name: 'Rewind', rarity: 'legendary', arity: 0, gate: 'U†', symbol: '↶',
    pick: [],
    blurb: 'Takes back the last card you played, and gives it back to your hand.',
    physics: 'Every quantum gate is reversible — except measurement, which is why Rewind cannot undo a Collapse.',
    hint: 'The only card that forgives a mistake. It cannot forgive a Collapse.',
    ops: () => [],
    effect: (ctx) => {
      const ok = ctx.player.rewindLast && ctx.player.rewindLast();
      return { note: ok ? `Rewound — ${ok} is back in your hand.` : 'Nothing reversible to rewind.', fx: 'rewind' };
    }
  },

  SUPERDENSE: {
    id: 'SUPERDENSE', name: 'Superdense', rarity: 'legendary', arity: 2, gate: 'SDC', symbol: '⬡',
    pick: ['the coin you hold', 'the coin you send'],
    blurb: 'Writes two certain points into a single linked pair. Both coins land on 1.',
    physics: 'Superdense coding: with a shared Bell pair, one qubit carries two classical bits.',
    hint: 'Needs the two coins linked already. Play Bell Pair first and this closes the hand.',
    requires: (st, t) => findLinks(st).some((l) => (l.a === t[0] && l.b === t[1]) || (l.a === t[1] && l.b === t[0])),
    requiresText: 'Those two coins must be linked.',
    ops: (t) => [
      { op: 'z', targets: [t[0]] },
      { op: 'x', targets: [t[0]] },
      { op: 'cx', targets: t },
      { op: 'h', targets: [t[0]] }
    ]
  },

  COHERE: {
    id: 'COHERE', name: 'Coherence', rarity: 'legendary', arity: 0, gate: 'purify', symbol: '◈',
    pick: [],
    blurb: 'Breaks every link on your board and leaves each coin at its own best odds.',
    physics: 'Entanglement distillation, run in reverse: trade correlation for individually cleaner qubits.',
    hint: 'Linked coins are all-or-nothing. This card turns a gamble into five separate ones.',
    random: true,
    ops: () => [],
    effect: (ctx) => {
      const st = ctx.state;
      const probs = [];
      for (let q = 0; q < st.n; q++) probs.push(st.probOne(q));
      const fresh = new QState(st.n);
      for (let q = 0; q < st.n; q++) {
        const p = Math.max(0, Math.min(1, probs[q]));
        if (p > 1e-9) fresh.ry(q, 2 * Math.asin(Math.sqrt(p)));
      }
      st.copyFrom(fresh);
      // Not a unitary, and the circuit should not pretend otherwise: record
      // where it landed so replay and the diagram both stay honest.
      ctx.circuit.add('snapshot', [], null, { state: st.clone(), note: 'entanglement traded for local purity' });
      return { note: 'Every link dissolved; the odds survived.', fx: 'cohere' };
    }
  }
};

export const CARD_IDS = Object.keys(CARDS);

/* ------------------------------------------------------------------ *
 * Playing a card
 * ------------------------------------------------------------------ */

/**
 * Apply a card to a state, recording it in a circuit. Returns everything the
 * UI and the AI need: the measured bits, the note, any status effect asked
 * for, and whether anything actually changed.
 *
 * `ctx` needs { state, circuit, rng, player, game }; `targets` is the coins.
 */
export function playCard(id, targets, ctx) {
  const card = CARDS[id];
  if (!card) throw new Error('unknown card ' + id);
  const st = ctx.state;
  const c = Object.assign({}, ctx, { targets, card });
  const before = st.clone();
  const outcomes = [];
  const instructions = card.ops(targets, c) || [];
  for (const ins of instructions) {
    if (ins.op === 'measure' || ins.op === 'reset') {
      const q = ins.targets[0];
      const bit = st.collapse(q, ctx.rng);
      ctx.circuit.add('measure', [q], null, { bit, card: id });

      // Corrections conditioned on the outcome have to be *recorded*, not
      // just applied. Replaying the circuit is how the Circuit View, the
      // QASM export and the after-action rewind reconstruct the board, so a
      // silent correction leaves all three showing a board that never existed.
      if (ins.op === 'reset') {
        if (bit === 1) { st.x(q); ctx.circuit.add('x', [q], null, { card: id, conditional: true }); }
        outcomes.push({ coin: q, bit, reset: true });
        continue;
      }
      if (ins.teleport && bit === 1) {
        st.z(targets[1]);
        ctx.circuit.add('z', [targets[1]], null, { card: id, conditional: true });
      }
      outcomes.push({ coin: q, bit });
      continue;
    }
    if (ins.op === 'barrier') { ctx.circuit.add('barrier', []); continue; }
    applyInstruction(st, ins);
    ctx.circuit.add(ins.op, ins.targets, ins.param, { card: id });
  }

  const extra = card.effect ? card.effect(c) : {};
  st.renormalise();

  return Object.assign({
    card: id,
    targets: targets.slice(),
    outcomes,
    changed: !st.same(before),
    delta: expectedScore(st) - expectedScore(before)
  }, extra || {});
}

/**
 * The planner's version of playCard: applies the physics and nothing else.
 * No circuit, no status, no cloning for a delta nobody reads. The search
 * calls this tens of thousands of times a second, so the bookkeeping that
 * makes playCard useful to the UI is exactly what has to go.
 */
export function simulateCard(st, id, targets, rng) {
  const card = CARDS[id];
  if (!card) return;
  const ctx = { state: st, targets, rng, circuit: NULL_CIRCUIT, player: NULL_PLAYER, planning: true };
  const instructions = card.ops(targets, ctx) || [];
  for (const ins of instructions) {
    if (ins.op === 'measure' || ins.op === 'reset') {
      const bit = st.collapse(ins.targets[0], rng);
      if (ins.op === 'reset' && bit === 1) st.x(ins.targets[0]);
      if (ins.teleport && bit === 1) st.z(targets[1]);
      continue;
    }
    if (ins.op === 'barrier') continue;
    applyInstruction(st, ins);
  }
  if (card.effect) card.effect(ctx);
  st.renormalise();
}

const NULL_CIRCUIT = { add() {} };
const NULL_PLAYER = { noiseLog: [], rewindLast: () => null };

function applyInstruction(st, ins) {
  const t = ins.targets;
  switch (ins.op) {
    case 'x': return st.x(t[0]);
    case 'y': return st.y(t[0]);
    case 'z': return st.z(t[0]);
    case 'h': return st.h(t[0]);
    case 's': return st.s(t[0]);
    case 'sdg': return st.sdg(t[0]);
    case 't': return st.t(t[0]);
    case 'tdg': return st.tdg(t[0]);
    case 'rx': return st.rx(t[0], ins.param);
    case 'ry': return st.ry(t[0], ins.param);
    case 'rz': return st.rz(t[0], ins.param);
    case 'phase': return st.phase(t[0], ins.param);
    case 'cx': return st.cx(t[0], t[1]);
    case 'cz': return st.cz(t[0], t[1]);
    case 'cphase': return st.cphase(t[0], t[1], ins.param);
    case 'swap': return st.swap(t[0], t[1]);
    case 'ccx': return st.ccx(t[0], t[1], t[2]);
    case 'mcz': return st.mcz(t);
    default: throw new Error('cannot apply ' + ins.op);
  }
}

/** Is this a legal set of targets for this card, on this board? */
export function legal(id, targets, st) {
  const card = CARDS[id];
  if (!card) return { ok: false, why: 'unknown card' };
  if (targets.length !== card.arity) {
    return { ok: false, why: card.arity === 0 ? 'no coin needed' : `pick ${card.arity} coin${card.arity > 1 ? 's' : ''}` };
  }
  if (new Set(targets).size !== targets.length) return { ok: false, why: 'pick different coins' };
  if (card.requires && !card.requires(st, targets)) return { ok: false, why: card.requiresText || 'not possible here' };
  return { ok: true };
}

/** Cards grouped by rarity, in catalogue order. For the codex and the shop. */
export function byRarity() {
  const out = {};
  for (const r of RARITY_ORDER) out[r] = CARD_IDS.filter((id) => CARDS[id].rarity === r);
  return out;
}

/** A starting deck: the basics, a couple of copies each. */
export function starterDeck() {
  return ['X', 'X', 'X', 'H', 'H', 'H', 'Z', 'Z', 'CX', 'CX', 'M', 'M', 'Y', 'SX', 'I'];
}
