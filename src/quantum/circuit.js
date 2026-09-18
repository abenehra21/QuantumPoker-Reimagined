/**
 * quantum/circuit.js — the live circuit the player is building.
 *
 * Every card played appends a real instruction here. The Circuit View renders
 * it with wires, boxes, control dots and measurement meters, which means the
 * picture on screen is the same picture a physicist would draw, and
 * `toQasm()` will paste straight into IBM Quantum Composer.
 *
 * The circuit is also the replay: re-running it from |0...0> reproduces the
 * board exactly, which is how the after-action report rewinds.
 */
import { QState } from './state.js';

/** How each instruction draws and what it does to a state. */
export const OPS = {
  x:      { label: 'X', arity: 1, box: true,  apply: (s, t) => s.x(t[0]) },
  y:      { label: 'Y', arity: 1, box: true,  apply: (s, t) => s.y(t[0]) },
  z:      { label: 'Z', arity: 1, box: true,  apply: (s, t) => s.z(t[0]) },
  h:      { label: 'H', arity: 1, box: true,  apply: (s, t) => s.h(t[0]) },
  s:      { label: 'S', arity: 1, box: true,  apply: (s, t) => s.s(t[0]) },
  sdg:    { label: 'S†', arity: 1, box: true, apply: (s, t) => s.sdg(t[0]) },
  t:      { label: 'T', arity: 1, box: true,  apply: (s, t) => s.t(t[0]) },
  tdg:    { label: 'T†', arity: 1, box: true, apply: (s, t) => s.tdg(t[0]) },
  rx:     { label: 'Rx', arity: 1, box: true, param: true, apply: (s, t, a) => s.rx(t[0], a) },
  ry:     { label: 'Ry', arity: 1, box: true, param: true, apply: (s, t, a) => s.ry(t[0], a) },
  rz:     { label: 'Rz', arity: 1, box: true, param: true, apply: (s, t, a) => s.rz(t[0], a) },
  phase:  { label: 'P',  arity: 1, box: true, param: true, apply: (s, t, a) => s.phase(t[0], a) },
  cx:     { label: 'CX', arity: 2, control: 1, target: 'plus',  apply: (s, t) => s.cx(t[0], t[1]) },
  cz:     { label: 'CZ', arity: 2, control: 2, apply: (s, t) => s.cz(t[0], t[1]) },
  cphase: { label: 'CP', arity: 2, control: 2, param: true, apply: (s, t, a) => s.cphase(t[0], t[1], a) },
  swap:   { label: '×', arity: 2, cross: true, apply: (s, t) => s.swap(t[0], t[1]) },
  ccx:    { label: 'CCX', arity: 3, control: 2, target: 'plus', apply: (s, t) => s.ccx(t[0], t[1], t[2]) },
  /** Multi-controlled Z: a dot on every wire it touches, joined by a line. */
  mcz:    { label: 'Z', arity: 0, allDots: true, apply: (s, t) => s.mcz(t) },
  measure:{ label: 'M', arity: 1, meter: true, apply: null },
  barrier:{ label: '', arity: 0, barrier: true, apply: null },
  noise:  { label: '✳', arity: 1, noiseMark: true, apply: null },
  /**
   * A state the circuit jumps to rather than computes. Exactly one card
   * (Coherence) is genuinely not a unitary - it trades entanglement for
   * cleaner single-coin odds - so it records where it landed instead of
   * pretending to be a sequence of gates. Replay stays exact, and the
   * diagram says plainly that something non-unitary happened here.
   */
  snapshot: { label: '◈', arity: 0, snapshot: true, apply: null }
};

export class Circuit {
  constructor(n, initial = null) {
    this.n = n;
    /** The state the wires start in. The dealt board, not |0...0>. */
    this.initial = initial ? initial.clone() : new QState(n);
    this.ops = [];
  }

  clone() {
    const c = new Circuit(this.n, this.initial);
    c.ops = this.ops.map((o) => Object.assign({}, o, { targets: o.targets.slice() }));
    return c;
  }

  /**
   * Record an instruction. `meta` carries whatever the UI wants to show:
   * which card it came from, who played it, the measured bit, the note text.
   */
  add(op, targets, param = null, meta = {}) {
    if (!OPS[op]) throw new Error('unknown op ' + op);
    const entry = Object.assign({ op, targets: targets.slice(), param }, meta);
    entry.column = this.nextColumn(targets);
    this.ops.push(entry);
    return entry;
  }

  /**
   * Which column an instruction lands in: the first one to the right of
   * everything already touching its wires. This is what makes the drawn
   * circuit compact instead of a diagonal staircase.
   */
  nextColumn(targets) {
    let col = 0;
    for (const o of this.ops) {
      if (o.op === 'barrier') { col = Math.max(col, o.column + 1); continue; }
      if (o.targets.some((t) => targets.includes(t))) col = Math.max(col, o.column + 1);
    }
    return col;
  }

  get depth() {
    return this.ops.length ? Math.max(...this.ops.map((o) => o.column)) + 1 : 0;
  }

  get gateCount() {
    return this.ops.filter((o) => o.op !== 'barrier' && o.op !== 'noise').length;
  }

  /** The two-qubit gate count: the number that actually costs you on hardware. */
  get entanglingCount() {
    return this.ops.filter((o) => OPS[o.op] && OPS[o.op].arity >= 2).length;
  }

  /** Instructions grouped by column, for the renderer. */
  columns() {
    const cols = [];
    for (const o of this.ops) {
      (cols[o.column] || (cols[o.column] = [])).push(o);
    }
    for (let i = 0; i < cols.length; i++) if (!cols[i]) cols[i] = [];
    return cols;
  }

  /**
   * Re-run from the initial state up to (and including) op index `upTo`.
   * Measurements replay their recorded outcome rather than rolling again, so
   * a rewind is faithful: the same hand always tells the same story.
   */
  stateAt(upTo = this.ops.length - 1) {
    const st = this.initial.clone();
    for (let i = 0; i <= upTo && i < this.ops.length; i++) {
      const o = this.ops[i];
      const spec = OPS[o.op];
      if (o.op === 'measure') {
        if (o.bit === 0 || o.bit === 1) st.project(o.targets[0], o.bit);
        continue;
      }
      if (o.op === 'snapshot') { if (o.state) st.copyFrom(o.state); continue; }
      if (!spec || !spec.apply) continue;
      spec.apply(st, o.targets, o.param);
    }
    return st;
  }

  /** Probability of each wire reading 1, at every column. Drives the trace lines. */
  trace() {
    const rows = [];
    let st = this.initial.clone();
    const push = () => {
      const r = [];
      for (let q = 0; q < this.n; q++) r.push(st.probOne(q));
      rows.push(r);
    };
    push();
    for (const o of this.ops) {
      const spec = OPS[o.op];
      if (o.op === 'measure') { if (o.bit === 0 || o.bit === 1) st.project(o.targets[0], o.bit); }
      else if (o.op === 'snapshot') { if (o.state) st.copyFrom(o.state); }
      else if (spec && spec.apply) spec.apply(st, o.targets, o.param);
      push();
    }
    return rows;
  }

  /**
   * OpenQASM 3. Paste it into IBM Quantum Composer and you get the same
   * circuit. The initial board is emitted as the preparation that built it,
   * when we know it, or as a state-prep comment when we do not.
   */
  toQasm(prep = null) {
    const lines = [
      'OPENQASM 3.0;',
      'include "stdgates.inc";',
      `qubit[${this.n}] q;`,
      `bit[${this.n}] c;`,
      ''
    ];
    if (prep && prep.length) {
      lines.push('// the board as dealt');
      for (const p of prep) lines.push(qasmLine(p.op, p.targets, p.param));
      lines.push('barrier q;', '');
    }
    lines.push('// cards played');
    for (const o of this.ops) {
      if (o.op === 'barrier') { lines.push('barrier q;'); continue; }
      if (o.op === 'noise') { lines.push(`// noise: ${o.note || ''}`); continue; }
      if (o.op === 'snapshot') { lines.push('// non-unitary: entanglement traded for local purity'); continue; }
      if (o.op === 'mcz') { lines.push(`ctrl(${o.targets.length - 1}) @ z ${o.targets.map((t) => `q[${t}]`).join(', ')};`); continue; }
      if (o.op === 'measure') { lines.push(`c[${o.targets[0]}] = measure q[${o.targets[0]}];`); continue; }
      lines.push(qasmLine(o.op, o.targets, o.param));
    }
    lines.push('', 'c = measure q;');
    return lines.join('\n');
  }
}

function qasmLine(op, targets, param) {
  const q = targets.map((t) => `q[${t}]`).join(', ');
  const spec = OPS[op];
  if (spec && spec.param) return `${op}(${(param || 0).toFixed(6)}) ${q};`;
  return `${op} ${q};`;
}

/** A short human summary: "4 gates, depth 3, 1 entangling". */
export function summarise(c) {
  const parts = [`${c.gateCount} gate${c.gateCount === 1 ? '' : 's'}`, `depth ${c.depth}`];
  if (c.entanglingCount) parts.push(`${c.entanglingCount} entangling`);
  return parts.join(' · ');
}
