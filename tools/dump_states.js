/**
 * tools/dump_states.js — emit random circuits and the state vectors this
 * game computes for them, as JSON on stdout.
 *
 * Feed the output to tools/verify_with_qiskit.py to check the simulator
 * against Qiskit. The JS side is the thing under test; Qiskit is the oracle.
 *
 *   node tools/dump_states.js 300 > /tmp/states.json
 */
import { QState } from '../src/quantum/state.js';
import { mulberry32 } from '../src/utils/rng.js';
import { CARDS, CARD_IDS, playCard, legal } from '../src/gameplay/cards.js';
import { Circuit } from '../src/quantum/circuit.js';

const count = Number(process.argv[2] || 200);
const rng = mulberry32(Number(process.argv[3] || 20260918));

/** Gates with a clean one-to-one Qiskit equivalent. */
const GATES = [
  { op: 'x', n: 1 }, { op: 'y', n: 1 }, { op: 'z', n: 1 }, { op: 'h', n: 1 },
  { op: 's', n: 1 }, { op: 'sdg', n: 1 }, { op: 't', n: 1 }, { op: 'tdg', n: 1 },
  { op: 'rx', n: 1, param: true }, { op: 'ry', n: 1, param: true }, { op: 'rz', n: 1, param: true },
  { op: 'phase', n: 1, param: true },
  { op: 'cx', n: 2 }, { op: 'cz', n: 2 }, { op: 'swap', n: 2 }, { op: 'cphase', n: 2, param: true },
  { op: 'ccx', n: 3 }
];

const cases = [];
for (let c = 0; c < count; c++) {
  const n = 2 + Math.floor(rng() * 3);          // 2 to 4 qubits
  const depth = 2 + Math.floor(rng() * 10);
  const st = new QState(n);
  const ops = [];
  for (let d = 0; d < depth; d++) {
    const g = GATES[Math.floor(rng() * GATES.length)];
    if (g.n > n) { d--; continue; }
    const pool = [];
    for (let i = 0; i < n; i++) pool.push(i);
    const targets = [];
    for (let k = 0; k < g.n; k++) targets.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    const param = g.param ? Math.round((rng() * 2 - 1) * Math.PI * 1000) / 1000 : null;
    st[g.op](...targets, ...(param === null ? [] : [param]));
    ops.push({ op: g.op, targets, param });
  }
  cases.push({
    n, ops,
    re: Array.from(st.re, (v) => Math.round(v * 1e12) / 1e12),
    im: Array.from(st.im, (v) => Math.round(v * 1e12) / 1e12)
  });
}

// Every deterministic card in the deck, played on a scrambled board. The
// card writes its own instructions into a Circuit, and those instructions
// are emitted alongside the resulting state, so Qiskit replays exactly what
// the card claims it did. That checks the *deck*, not only the primitives:
// if a card's circuit notation and its effect ever disagreed, this catches it.
const cardCases = [];
for (const id of CARD_IDS) {
  const card = CARDS[id];
  if (card.random) continue;                       // measurement is not unitary
  const n = 5;
  const prep = [
    { op: 'h', targets: [0], param: null },
    { op: 'ry', targets: [2], param: 0.7 },
    { op: 'x', targets: [3], param: null },
    { op: 'rz', targets: [1], param: 0.4 }
  ];
  const st = new QState(n);
  for (const p of prep) st[p.op](...p.targets, ...(p.param === null ? [] : [p.param]));
  const targets = [0, 1, 2].slice(0, card.arity);
  if (!legal(id, targets, st).ok) continue;

  const circuit = new Circuit(n, st);
  let res;
  try {
    res = playCard(id, targets, {
      state: st, circuit, rng: () => 0.5,
      player: { noiseLog: [], rewindLast: () => null }, game: null
    });
  } catch (e) { continue; }

  // Cards whose effect is not a gate (Oracle, Freeze, Parity Read) record no
  // instructions and change no amplitudes; there is nothing for Qiskit to do.
  const recorded = circuit.ops.filter((o) => o.op !== 'barrier' && o.op !== 'noise');
  // A state vector cannot replay a projection, so anything that measures is
  // out of scope for this comparison; the tests cover those in JavaScript.
  if (recorded.some((o) => o.op === 'measure' || o.op === 'snapshot')) continue;
  cardCases.push({
    card: id, n, prep, targets,
    ops: recorded.map((o) => ({ op: o.op, targets: o.targets, param: o.param })),
    re: Array.from(st.re, (v) => Math.round(v * 1e12) / 1e12),
    im: Array.from(st.im, (v) => Math.round(v * 1e12) / 1e12)
  });
}

process.stdout.write(JSON.stringify({ cases, cardCases }, null, 0));
