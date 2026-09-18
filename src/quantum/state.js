/**
 * QuantumPoker-Reimagined — quantum/state.js
 *
 * An exact state-vector simulator. The table's five coins are five qubits and
 * this keeps all 2^n complex amplitudes, applying the genuine gate matrices to
 * them. Nothing on screen is a faked probability.
 *
 * Qubit 0 is the least significant bit of the basis index (Qiskit ordering),
 * so a circuit written here transcribes straight into Qiskit — see
 * tools/verify_with_qiskit.py.
 *
 * Pure maths. No DOM, no imports. Runs in the browser and in Node.
 */

const R2 = Math.SQRT1_2;
export const LOOSE = 1e-6;

export class QState {
  constructor(n) {
    this.n = n;
    this.size = 1 << n;
    this.re = new Float64Array(this.size);
    this.im = new Float64Array(this.size);
    this.re[0] = 1; // |00…0>
  }

  clone() {
    const s = Object.create(QState.prototype);
    s.n = this.n;
    s.size = this.size;
    s.re = this.re.slice();
    s.im = this.im.slice();
    return s;
  }

  /** Overwrite this state from another of the same width. Avoids allocating. */
  copyFrom(o) {
    this.re.set(o.re);
    this.im.set(o.im);
    return this;
  }

  /* ---------------------------------------------------------------- *
   * The one primitive every single-qubit gate is built from.
   * Applies the 2x2 matrix [[a, b], [c, d]] to qubit q, where each entry
   * is a complex pair. Everything else here is a convenience wrapper with
   * the constants folded in, because the hot path is worth the duplication.
   * ---------------------------------------------------------------- */
  u(q, ar, ai, br, bi, cr, ci, dr, di) {
    const bit = 1 << q;
    for (let i = 0; i < this.size; i++) {
      if (i & bit) continue;
      const j = i | bit;
      const xr = this.re[i], xi = this.im[i];
      const yr = this.re[j], yi = this.im[j];
      this.re[i] = ar * xr - ai * xi + br * yr - bi * yi;
      this.im[i] = ar * xi + ai * xr + br * yi + bi * yr;
      this.re[j] = cr * xr - ci * xi + dr * yr - di * yi;
      this.im[j] = cr * xi + ci * xr + dr * yi + di * yr;
    }
    return this;
  }

  /** The same 2x2, but only on the branches where every control qubit is 1. */
  cu(controls, q, ar, ai, br, bi, cr, ci, dr, di) {
    const bit = 1 << q;
    let mask = 0;
    for (const c of controls) {
      if (c === q) throw new Error('cu: control cannot be the target');
      mask |= 1 << c;
    }
    for (let i = 0; i < this.size; i++) {
      if (i & bit) continue;
      if ((i & mask) !== mask) continue;
      const j = i | bit;
      const xr = this.re[i], xi = this.im[i];
      const yr = this.re[j], yi = this.im[j];
      this.re[i] = ar * xr - ai * xi + br * yr - bi * yi;
      this.im[i] = ar * xi + ai * xr + br * yi + bi * yr;
      this.re[j] = cr * xr - ci * xi + dr * yr - di * yi;
      this.im[j] = cr * xi + ci * xr + dr * yi + di * yr;
    }
    return this;
  }

  /* ---- Pauli ---- */

  /** X: 0 <-> 1. A coin in superposition is unmoved. */
  x(q) {
    const b = 1 << q;
    for (let i = 0; i < this.size; i++) {
      if (i & b) continue;
      const j = i | b;
      let t = this.re[i]; this.re[i] = this.re[j]; this.re[j] = t;
      t = this.im[i]; this.im[i] = this.im[j]; this.im[j] = t;
    }
    return this;
  }

  /** Y = iXZ. */
  y(q) {
    const b = 1 << q;
    for (let i = 0; i < this.size; i++) {
      if (i & b) continue;
      const j = i | b;
      const xr = this.re[i], xi = this.im[i];
      const yr = this.re[j], yi = this.im[j];
      this.re[i] = yi; this.im[i] = -yr;   // -i * y
      this.re[j] = -xi; this.im[j] = xr;   //  i * x
    }
    return this;
  }

  /** Z: + <-> -. A settled coin is unmoved. */
  z(q) {
    const b = 1 << q;
    for (let i = 0; i < this.size; i++) {
      if (i & b) { this.re[i] = -this.re[i]; this.im[i] = -this.im[i]; }
    }
    return this;
  }

  /* ---- Clifford + T ---- */

  /** Hadamard: 0 <-> +, 1 <-> -. */
  h(q) {
    const b = 1 << q;
    for (let i = 0; i < this.size; i++) {
      if (i & b) continue;
      const j = i | b;
      const ar = this.re[i], ai = this.im[i], br = this.re[j], bi = this.im[j];
      this.re[i] = (ar + br) * R2; this.im[i] = (ai + bi) * R2;
      this.re[j] = (ar - br) * R2; this.im[j] = (ai - bi) * R2;
    }
    return this;
  }

  /** Phase by `angle` on the |1> branch. S, T and Z are all special cases. */
  phase(q, angle) {
    const b = 1 << q;
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let i = 0; i < this.size; i++) {
      if (!(i & b)) continue;
      const r = this.re[i], m = this.im[i];
      this.re[i] = r * c - m * s;
      this.im[i] = r * s + m * c;
    }
    return this;
  }

  s(q) { return this.phase(q, Math.PI / 2); }
  sdg(q) { return this.phase(q, -Math.PI / 2); }
  t(q) { return this.phase(q, Math.PI / 4); }
  tdg(q) { return this.phase(q, -Math.PI / 4); }

  /* ---- Rotations: the continuous gates ---- */

  rx(q, a) {
    const c = Math.cos(a / 2), s = Math.sin(a / 2);
    return this.u(q, c, 0, 0, -s, 0, -s, c, 0);
  }

  ry(q, a) {
    const c = Math.cos(a / 2), s = Math.sin(a / 2);
    return this.u(q, c, 0, -s, 0, s, 0, c, 0);
  }

  rz(q, a) {
    const c = Math.cos(a / 2), s = Math.sin(a / 2);
    return this.u(q, c, -s, 0, 0, 0, 0, c, s);
  }

  /* ---- Two and three qubit ---- */

  /** Controlled NOT. Entangles when the control is in superposition. */
  cx(c, t) {
    if (c === t) throw new Error('cx: control and target must differ');
    const bc = 1 << c, bt = 1 << t;
    for (let i = 0; i < this.size; i++) {
      if (!(i & bc) || (i & bt)) continue;
      const j = i | bt;
      let tmp = this.re[i]; this.re[i] = this.re[j]; this.re[j] = tmp;
      tmp = this.im[i]; this.im[i] = this.im[j]; this.im[j] = tmp;
    }
    return this;
  }

  /** Controlled Z. Symmetric: it does not matter which is which. */
  cz(a, b) {
    if (a === b) throw new Error('cz: qubits must differ');
    const m = (1 << a) | (1 << b);
    for (let i = 0; i < this.size; i++) {
      if ((i & m) === m) { this.re[i] = -this.re[i]; this.im[i] = -this.im[i]; }
    }
    return this;
  }

  /** Controlled phase, the tunable cousin of CZ. */
  cphase(a, b, angle) {
    const m = (1 << a) | (1 << b);
    const c = Math.cos(angle), s = Math.sin(angle);
    for (let i = 0; i < this.size; i++) {
      if ((i & m) !== m) continue;
      const r = this.re[i], im = this.im[i];
      this.re[i] = r * c - im * s;
      this.im[i] = r * s + im * c;
    }
    return this;
  }

  /** Exchange two coins entirely, superposition, phase, links and all. */
  swap(a, b) {
    if (a === b) return this;
    const ba = 1 << a, bb = 1 << b;
    for (let i = 0; i < this.size; i++) {
      const ia = (i & ba) !== 0, ib = (i & bb) !== 0;
      if (ia === ib) continue;
      const j = (i ^ ba) ^ bb;
      if (j < i) continue;
      let t = this.re[i]; this.re[i] = this.re[j]; this.re[j] = t;
      t = this.im[i]; this.im[i] = this.im[j]; this.im[j] = t;
    }
    return this;
  }

  /** Toffoli: flips the target only when both controls are 1. */
  ccx(c1, c2, t) {
    if (c1 === t || c2 === t || c1 === c2) throw new Error('ccx: three distinct qubits');
    const m = (1 << c1) | (1 << c2), bt = 1 << t;
    for (let i = 0; i < this.size; i++) {
      if ((i & m) !== m || (i & bt)) continue;
      const j = i | bt;
      let tmp = this.re[i]; this.re[i] = this.re[j]; this.re[j] = tmp;
      tmp = this.im[i]; this.im[i] = this.im[j]; this.im[j] = tmp;
    }
    return this;
  }

  /** iSWAP-free Bell maker: H on a, then CX a->b. Used by the deal and Bell Pair. */
  bell(a, b) { return this.h(a).cx(a, b); }

  /* ---- Readout ---- */

  /** Probability that coin q measures 1. */
  probOne(q) {
    const b = 1 << q;
    let p = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & b) p += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    }
    return p;
  }

  /** Probability of |-> in the +/- basis. 0 -> plus, 1 -> minus, 0.5 -> settled. */
  probMinus(q) {
    const b = 1 << q;
    let p = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & b) continue;
      const j = i | b;
      const dr = this.re[i] - this.re[j], di = this.im[i] - this.im[j];
      p += dr * dr + di * di;
    }
    return p / 2;
  }

  /**
   * The Bloch vector of one coin, from its reduced density matrix.
   * Length 1 means a pure, lonely qubit; shorter means it is entangled with
   * something and the arrow lives inside the sphere. This is what the 3D
   * Bloch widget draws, and why an entangled coin's arrow visibly shrinks.
   */
  bloch(q) {
    const b = 1 << q;
    let xr = 0, yi = 0, p1 = 0;
    for (let i = 0; i < this.size; i++) {
      if (i & b) { p1 += this.re[i] * this.re[i] + this.im[i] * this.im[i]; continue; }
      const j = i | b;
      // rho_01 = sum over the other qubits of a0 * conj(a1)
      xr += this.re[i] * this.re[j] + this.im[i] * this.im[j];
      yi += this.im[i] * this.re[j] - this.re[i] * this.im[j];
    }
    const x = 2 * xr, y = 2 * yi, zz = 1 - 2 * p1;
    return { x, y, z: zz, r: Math.sqrt(x * x + y * y + zz * zz) };
  }

  /**
   * Weight of the pair (a, b) on each Bell state, in the order
   * |00>+|11>, |00>-|11>, |01>+|10>, |01>-|10>. A 1 means perfectly linked.
   */
  bellProbs(qa, qb) {
    const ba = 1 << qa, bb = 1 << qb;
    const p = [0, 0, 0, 0];
    for (let k = 0; k < this.size; k++) {
      if ((k & ba) || (k & bb)) continue;
      const a = k, b = k | ba, c = k | bb, d = k | ba | bb;
      let r = this.re[a] + this.re[d], m = this.im[a] + this.im[d]; p[0] += r * r + m * m;
      r = this.re[a] - this.re[d]; m = this.im[a] - this.im[d]; p[1] += r * r + m * m;
      r = this.re[b] + this.re[c]; m = this.im[b] + this.im[c]; p[2] += r * r + m * m;
      r = this.re[b] - this.re[c]; m = this.im[b] - this.im[c]; p[3] += r * r + m * m;
    }
    return p.map((v) => v / 2);
  }

  /**
   * Entanglement of coin q with everything else, as the linear entropy
   * 1 - |bloch|^2, in [0, 1]. 0 is a free coin, 1 is maximally entangled.
   * The table uses this to decide how hard an orb's link arcs glow.
   */
  entanglement(q) {
    const v = this.bloch(q);
    const r2 = v.x * v.x + v.y * v.y + v.z * v.z;
    return Math.max(0, Math.min(1, 1 - r2));
  }

  /* ---- Measurement ---- */

  /**
   * Project coin q onto `bit` and renormalise. Returns the probability that
   * outcome had; 0 means it was impossible and the state is untouched.
   * A real projective measurement: every superposition and link through this
   * coin is destroyed.
   */
  project(q, bit) {
    const b = 1 << q;
    const p1 = this.probOne(q);
    const keep = bit ? p1 : 1 - p1;
    if (keep < 1e-12) return 0;
    const scale = 1 / Math.sqrt(keep);
    for (let i = 0; i < this.size; i++) {
      if (((i & b) ? 1 : 0) === bit) { this.re[i] *= scale; this.im[i] *= scale; }
      else { this.re[i] = 0; this.im[i] = 0; }
    }
    return keep;
  }

  /** Measure one coin for real and keep the collapsed state. */
  collapse(q, rng) {
    const p1 = this.probOne(q);
    let bit = rng() < p1 ? 1 : 0;
    if (!this.project(q, bit)) { bit = 1 - bit; this.project(q, bit); }
    return bit;
  }

  /** Collapse the whole board once. Returns n bits, coin 0 first. */
  measure(rng) {
    const r = rng();
    let acc = 0, chosen = this.size - 1;
    for (let i = 0; i < this.size; i++) {
      acc += this.re[i] * this.re[i] + this.im[i] * this.im[i];
      if (r <= acc) { chosen = i; break; }
    }
    const bits = [];
    for (let k = 0; k < this.n; k++) bits.push((chosen >> k) & 1);
    return bits;
  }

  /** The full outcome distribution, as 2^n probabilities. For the codex. */
  distribution() {
    const out = new Float64Array(this.size);
    for (let i = 0; i < this.size; i++) out[i] = this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return out;
  }

  /* ---- Housekeeping ---- */

  /** True when two states are equal up to a global phase: |<a|b>|^2 = 1. */
  same(o) {
    let re = 0, im = 0;
    for (let i = 0; i < this.size; i++) {
      re += this.re[i] * o.re[i] + this.im[i] * o.im[i];
      im += this.re[i] * o.im[i] - this.im[i] * o.re[i];
    }
    return re * re + im * im > 1 - 1e-9;
  }

  /** Total probability. Always 1; the self-checks verify it. */
  norm() {
    let s = 0;
    for (let i = 0; i < this.size; i++) s += this.re[i] * this.re[i] + this.im[i] * this.im[i];
    return s;
  }

  /** Floating point drifts over a long circuit. Pull it back to 1. */
  renormalise() {
    const nrm = Math.sqrt(this.norm());
    if (nrm < 1e-12 || Math.abs(nrm - 1) < 1e-12) return this;
    for (let i = 0; i < this.size; i++) { this.re[i] /= nrm; this.im[i] /= nrm; }
    return this;
  }

  /**
   * A cheap 32-bit hash of the amplitudes, for the planner's transposition
   * table. Collisions cost one duplicated branch, never a wrong answer, so
   * this is worth an order of magnitude over building a string key.
   */
  hash() {
    let h = 0x811c9dc5;
    for (let i = 0; i < this.size; i++) {
      h ^= (this.re[i] * 4096) | 0;
      h = Math.imul(h, 0x01000193);
      h ^= (this.im[i] * 4096) | 0;
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** A stable key for caching: the amplitudes rounded to 6 places. */
  key() {
    let s = '';
    for (let i = 0; i < this.size; i++) {
      s += (Math.round(this.re[i] * 1e6) | 0) + ',' + (Math.round(this.im[i] * 1e6) | 0) + ';';
    }
    return s;
  }

  /** Readable ket notation, for the developer overlay and the codex. */
  toKet(maxTerms = 6) {
    const terms = [];
    for (let i = 0; i < this.size; i++) {
      const m = Math.hypot(this.re[i], this.im[i]);
      if (m < 1e-9) continue;
      let bits = '';
      for (let k = this.n - 1; k >= 0; k--) bits += (i >> k) & 1;
      terms.push({ m, bits, ph: Math.atan2(this.im[i], this.re[i]) });
    }
    terms.sort((a, b) => b.m - a.m);
    const head = terms.slice(0, maxTerms).map((t) => {
      const amp = t.m.toFixed(2);
      const ph = Math.abs(t.ph) < 1e-6 ? '' :
        Math.abs(Math.abs(t.ph) - Math.PI) < 1e-6 ? '-' : `e^{${(t.ph / Math.PI).toFixed(2)}pi i}`;
      return `${ph === '-' ? '-' : ''}${amp}${ph && ph !== '-' ? ph : ''}|${t.bits}>`;
    });
    return head.join(' + ').replace(/\+ -/g, '- ') + (terms.length > maxTerms ? ' + …' : '');
  }
}
