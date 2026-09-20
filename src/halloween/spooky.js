/**
 * halloween/spooky.js — the haunted cards.
 *
 * A haunted card is a card slot that has not made up its mind. It holds two
 * candidate cards and one real qubit: |0> means the first card, |1> means
 * the second. Measuring the qubit is what decides which card you actually
 * hold, and it is a genuine projective measurement on the same state-vector
 * simulator the rest of the project uses.
 *
 * That matters for one reason beyond honesty: because the qubits are real,
 * *entanglement is real too*. Two haunted cards in a Bell pair genuinely
 * cannot be described separately, and measuring one genuinely decides the
 * other with no message passing between them. The player is told "these two
 * are linked, they land together" and never hears the word Bell — but what
 * is running underneath is the actual physics, so the correlations a curious
 * student would go looking for are all there and all correct.
 *
 * Nothing in this file knows about poker. It knows about slots and qubits.
 */
import { QState } from '../quantum/state.js';

/** How many cards can be haunted at once. Five qubits is 32 amplitudes. */
export const MAX_HAUNTED = 6;

export const LINK = {
  SAME: 'same',        // both collapse to their first option, or both to their second
  OPPOSITE: 'opposite' // one takes its first option, the other takes its second
};

export class Haunting {
  constructor(rng) {
    this.rng = rng;
    this.state = new QState(MAX_HAUNTED);
    this.slots = new Map();        // key -> { qubit, options, resolved, weight }
    this.links = [];               // { a, b, kind }
    this.freeQubits = Array.from({ length: MAX_HAUNTED }, (_, i) => i);
    this.log = [];
  }

  get count() { return this.slots.size; }
  has(key) { return this.slots.has(key); }
  get(key) { return this.slots.get(key) || null; }

  /** Every haunted slot that has not yet been measured. */
  pending() {
    return Array.from(this.slots.entries())
      .filter(([, s]) => s.resolved === null)
      .map(([key, s]) => Object.assign({ key }, s));
  }

  /**
   * Put a slot into superposition between two cards.
   *
   * `bias` in (0, 1) is the chance of landing on the *second* option. The
   * default is an even coin toss, set with a Hadamard; anything else is an
   * Ry rotation, which is the honest way to build an uneven superposition
   * and keeps the amplitudes real so the arithmetic stays inspectable.
   */
  haunt(key, optionA, optionB, bias = 0.5) {
    if (this.slots.has(key)) this.release(key);
    if (!this.freeQubits.length) return null;
    const qubit = this.freeQubits.shift();

    // Reset the qubit to |0> before reusing it, or a previous hand's value
    // leaks into this one.
    if (this.state.probOne(qubit) > 1e-9) this.state.x(qubit);

    if (Math.abs(bias - 0.5) < 1e-9) this.state.h(qubit);
    else this.state.ry(qubit, 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, bias)))));

    const slot = { qubit, options: [optionA, optionB], resolved: null, weight: bias };
    this.slots.set(key, slot);
    return slot;
  }

  /**
   * Link two haunted slots so they always land together, or always apart.
   *
   * Built the textbook way: reset the pair, Hadamard one, CNOT onto the
   * other, and an X on the target when they should disagree. The result is
   * a real Bell state, which the main game's own link detector recognises.
   */
  entangle(keyA, keyB, kind = LINK.SAME) {
    const a = this.slots.get(keyA), b = this.slots.get(keyB);
    if (!a || !b || a.resolved !== null || b.resolved !== null) return false;
    if (this.linkOf(keyA) || this.linkOf(keyB)) return false;

    const st = this.state;
    st.project(a.qubit, 0);
    st.project(b.qubit, 0);
    st.renormalise();
    st.h(a.qubit);
    st.cx(a.qubit, b.qubit);
    if (kind === LINK.OPPOSITE) st.x(b.qubit);

    this.links.push({ a: keyA, b: keyB, kind });
    return true;
  }

  linkOf(key) {
    return this.links.find((l) => l.a === key || l.b === key) || null;
  }

  partnerOf(key) {
    const l = this.linkOf(key);
    if (!l) return null;
    return l.a === key ? l.b : l.a;
  }

  /** The chance this slot lands on its second option, right now. */
  odds(key) {
    const s = this.slots.get(key);
    if (!s) return 0;
    if (s.resolved !== null) return s.resolved === s.options[1] ? 1 : 0;
    return this.state.probOne(s.qubit);
  }

  /**
   * Measure a slot for real. Returns everything the table needs to animate
   * it: the card it became, and any linked partner that was decided at the
   * same instant — which is the moment entanglement stops being a word and
   * becomes a thing the player watched happen.
   */
  measure(key) {
    const s = this.slots.get(key);
    if (!s) return null;
    if (s.resolved !== null) return { key, card: s.resolved, already: true, cascade: [] };

    const bit = this.state.collapse(s.qubit, this.rng);
    s.resolved = s.options[bit];

    const cascade = [];
    const partnerKey = this.partnerOf(key);
    if (partnerKey) {
      const p = this.slots.get(partnerKey);
      if (p && p.resolved === null) {
        // No second roll: the partner's qubit is already decided by the
        // projection above. Reading it is all that is left to do.
        const pbit = this.state.probOne(p.qubit) > 0.5 ? 1 : 0;
        this.state.project(p.qubit, pbit);
        p.resolved = p.options[pbit];
        cascade.push({ key: partnerKey, card: p.resolved });
      }
    }

    this.log.push({ key, card: s.resolved, cascade: cascade.map((c) => c.key) });
    return { key, card: s.resolved, already: false, cascade };
  }

  /** Measure everything still undecided. The showdown always ends here. */
  measureAll() {
    const out = [];
    for (const key of Array.from(this.slots.keys())) {
      const s = this.slots.get(key);
      if (s.resolved !== null) continue;
      const r = this.measure(key);
      if (r) out.push(r);
    }
    return out;
  }

  /** What card is in this slot? Null while it is still undecided. */
  cardAt(key) {
    const s = this.slots.get(key);
    return s ? s.resolved : null;
  }

  /** Both possibilities, for the ghost previews on the card back. */
  optionsAt(key) {
    const s = this.slots.get(key);
    return s ? s.options.slice() : null;
  }

  /** Hand the qubit back. Used when a hand ends or a slot is discarded. */
  release(key) {
    const s = this.slots.get(key);
    if (!s) return;
    this.links = this.links.filter((l) => l.a !== key && l.b !== key);
    this.state.project(s.qubit, this.state.probOne(s.qubit) > 0.5 ? 1 : 0);
    this.state.renormalise();
    if (this.state.probOne(s.qubit) > 1e-9) this.state.x(s.qubit);
    this.freeQubits.push(s.qubit);
    this.freeQubits.sort((x, y) => x - y);
    this.slots.delete(key);
  }

  reset() {
    this.state = new QState(MAX_HAUNTED);
    this.slots.clear();
    this.links.length = 0;
    this.freeQubits = Array.from({ length: MAX_HAUNTED }, (_, i) => i);
    this.log.length = 0;
  }

  /**
   * For the optional "learn more" panel: the actual state, in real notation.
   * Nobody needs to read this to play, and the one person at the party who
   * wants to should find something true when they look.
   */
  inspect() {
    const rows = [];
    for (const [key, s] of this.slots) {
      rows.push({
        key,
        qubit: s.qubit,
        resolved: s.resolved,
        pOne: this.state.probOne(s.qubit),
        entangled: this.state.entanglement(s.qubit),
        link: this.linkOf(key)
      });
    }
    return { ket: this.state.toKet(4), norm: this.state.norm(), slots: rows };
  }
}
