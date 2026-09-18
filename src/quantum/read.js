/**
 * quantum/read.js — turning amplitudes into something a player can read.
 *
 * The table never shows a number without a word beside it. This module is the
 * translation layer: what kind of coin is this, what is it linked to, how
 * surprising is the board, and how do you deal a board worth playing.
 */
import { QState, LOOSE } from './state.js';
import { range, shuffle, pickWeighted } from '../utils/rng.js';

export const KETS = {
  one: '|1⟩', zero: '|0⟩', plus: '|+⟩', minus: '|−⟩',
  tilted: 'ψ', linked: 'ρ'
};

/** Plain-language names, for tooltips and the after-action report. */
export const KIND_NAMES = {
  one: 'settled on 1', zero: 'settled on 0', plus: 'spinning +',
  minus: 'spinning −', tilted: 'tilted', linked: 'linked'
};

/**
 * What a single coin looks like on the table.
 *
 *   one     settled, showing 1                     |1>
 *   zero    settled, showing 0                     |0>
 *   plus    spinning, + tilt                       |+>
 *   minus   spinning, - tilt                       |->
 *   tilted  a lone coin at some other angle        (rotation gates make these)
 *   linked  entangled: it has no state of its own  rho
 */
export function readCoin(st, q) {
  const up = st.probOne(q);
  const minus = st.probMinus(q);
  const v = st.bloch(q);
  const ent = Math.max(0, 1 - v.r * v.r);
  let kind;
  if (ent > LOOSE) kind = 'linked';
  else if (up > 1 - LOOSE) kind = 'one';
  else if (up < LOOSE) kind = 'zero';
  else if (Math.abs(up - 0.5) < LOOSE && minus < LOOSE) kind = 'plus';
  else if (Math.abs(up - 0.5) < LOOSE && minus > 1 - LOOSE) kind = 'minus';
  else kind = 'tilted';
  return {
    kind, up, minus, ent,
    bloch: v,
    ket: KETS[kind],
    name: KIND_NAMES[kind],
    settled: up < LOOSE || up > 1 - LOOSE,
    /** Where the arrow points, for the orb and the Bloch widget. */
    theta: Math.acos(Math.max(-1, Math.min(1, v.r > 1e-9 ? v.z / v.r : 0))),
    phi: Math.atan2(v.y, v.x)
  };
}

/** Every pair of coins that is perfectly linked. `same` means they land alike. */
export function findLinks(st) {
  const out = [], used = {};
  for (let i = 0; i < st.n - 1; i++) {
    if (used[i]) continue;
    for (let j = i + 1; j < st.n; j++) {
      if (used[j]) continue;
      const p = st.bellProbs(i, j);
      let best = 0;
      for (let k = 1; k < 4; k++) if (p[k] > p[best]) best = k;
      if (p[best] > 1 - LOOSE) {
        out.push({ a: i, b: j, same: best < 2, bell: best, strength: p[best] });
        used[i] = used[j] = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Softer than findLinks: every pair whose outcomes are related at all, and
 * how strongly. The table draws these as faint arcs so a partial link is
 * still visible once rotation gates and noise are in the deck.
 *
 * The measure is the normalised mutual information of the two coins'
 * measurement outcomes: knowing how coin a lands, how much do you now know
 * about coin b? That is precisely the question a player is asking, and it is
 * 1 for a Bell pair and 0 for two independent coins.
 *
 * The obvious shortcut — Bell-state overlap — is wrong, and wrong in a way
 * that looks plausible: a plain |00> pair overlaps both |00>+|11> and
 * |00>-|11> at one half each, so every freshly dealt board would draw arcs
 * between coins that have nothing to do with each other.
 */
export function findCorrelations(st, threshold = 0.08) {
  const out = [];
  for (let i = 0; i < st.n - 1; i++) {
    for (let j = i + 1; j < st.n; j++) {
      const c = correlation(st, i, j);
      if (c.strength > threshold) out.push({ a: i, b: j, strength: c.strength, same: c.same });
    }
  }
  return out;
}

/**
 * The joint outcome distribution of two coins, and what it implies.
 * Returns { joint, strength, same } where strength is in [0, 1].
 */
export function correlation(st, qa, qb) {
  const ba = 1 << qa, bb = 1 << qb;
  const joint = [0, 0, 0, 0];             // p00, p01, p10, p11
  for (let k = 0; k < st.size; k++) {
    const p = st.re[k] * st.re[k] + st.im[k] * st.im[k];
    if (p < 1e-15) continue;
    joint[((k & ba) ? 2 : 0) | ((k & bb) ? 1 : 0)] += p;
  }
  const pa1 = joint[2] + joint[3], pb1 = joint[1] + joint[3];
  const ha = binaryEntropy(pa1), hb = binaryEntropy(pb1);
  const floor = Math.min(ha, hb);
  if (floor < 1e-9) return { joint, strength: 0, same: true, mi: 0 };

  let mi = 0;
  const marg = [(1 - pa1) * (1 - pb1), (1 - pa1) * pb1, pa1 * (1 - pb1), pa1 * pb1];
  for (let k = 0; k < 4; k++) {
    if (joint[k] < 1e-12 || marg[k] < 1e-12) continue;
    mi += joint[k] * Math.log2(joint[k] / marg[k]);
  }
  return {
    joint, mi,
    strength: Math.max(0, Math.min(1, mi / floor)),
    same: joint[0] + joint[3] >= 0.5
  };
}

function binaryEntropy(p) {
  if (p <= 1e-12 || p >= 1 - 1e-12) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

/** Expected number of coins landing 1 among the first `upTo`. */
export function expectedScore(st, upTo) {
  const n = upTo === undefined ? st.n : upTo;
  let s = 0;
  for (let q = 0; q < n; q++) s += st.probOne(q);
  return s;
}

/**
 * Shannon entropy of the board's outcome distribution, in bits. 0 means the
 * result is already decided; 5 means every one of the 32 endings is equally
 * likely. The stats page calls this your "entropy score" and it is a genuinely
 * good measure of how wild a board you left yourself.
 */
export function entropy(st) {
  const d = st.distribution();
  let h = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] > 1e-12) h -= d[i] * Math.log2(d[i]);
  }
  return h;
}

/** The chance of scoring at least `target` ones, exactly, over all branches. */
export function probAtLeast(st, target, upTo) {
  const n = upTo === undefined ? st.n : upTo;
  const d = st.distribution();
  let p = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] < 1e-12) continue;
    let ones = 0;
    for (let q = 0; q < n; q++) if (i & (1 << q)) ones++;
    if (ones >= target) p += d[i];
  }
  return p;
}

/** Full score distribution: index k is the chance of landing exactly k ones. */
export function scoreDistribution(st, upTo) {
  const n = upTo === undefined ? st.n : upTo;
  const d = st.distribution();
  const out = new Array(n + 1).fill(0);
  for (let i = 0; i < d.length; i++) {
    if (d[i] < 1e-12) continue;
    let ones = 0;
    for (let q = 0; q < n; q++) if (i & (1 << q)) ones++;
    out[ones] += d[i];
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Dealing a board
 * ------------------------------------------------------------------ */

const PLAIN_WEIGHTS = [0.38, 0.12, 0.32, 0.18]; // zero, one, plus, minus

/**
 * A fresh board: maybe a linked pair or two, the rest in one of the four
 * plain states. Links are disjoint pairs so each draws as one arc and breaks
 * with one Link card. Boards already won or already hopeless are redealt.
 *
 * `flavour` lets a mode tilt the deal without changing the rules:
 *   pairBias    more or fewer entangled pairs
 *   tiltChance  chance a coin is dealt at an odd angle (Experimental mode)
 */
export function dealBoard(rng, n = 5, flavour = {}) {
  const pairBias = flavour.pairBias === undefined ? 0 : flavour.pairBias;
  const tiltChance = flavour.tiltChance || 0;
  let fallback = null;

  for (let attempt = 0; attempt < 200; attempt++) {
    const st = new QState(n);
    const order = shuffle(range(n), rng);
    let pos = 0;
    const w = [
      Math.max(0.05, 0.45 - pairBias * 0.6),
      0.45,
      Math.max(0.02, 0.10 + pairBias * 0.6)
    ];
    const nPairs = pickWeighted([0, 1, 2], w, rng);
    for (let p = 0; p < nPairs && pos + 1 < n; p++) {
      const c = order[pos++], t = order[pos++];
      st.h(c);
      if (rng() < 0.5) st.z(c);
      if (rng() < 0.5) st.x(t);
      st.cx(c, t);
    }
    for (; pos < n; pos++) {
      const q = order[pos];
      if (tiltChance && rng() < tiltChance) {
        st.ry(q, (0.15 + rng() * 0.7) * Math.PI);
        if (rng() < 0.4) st.rz(q, rng() * Math.PI * 2);
        continue;
      }
      const pickk = pickWeighted(['zero', 'one', 'plus', 'minus'], PLAIN_WEIGHTS, rng);
      if (pickk === 'one') st.x(q);
      else if (pickk === 'plus') st.h(q);
      else if (pickk === 'minus') { st.h(q); st.z(q); }
    }
    if (isPlayable(st)) return st;
    if (!fallback) fallback = st;
  }
  return fallback;
}

/** At most one coin handed out as a 1, and at least two a card can change. */
export function isPlayable(st) {
  let given = 0, free = 0;
  for (let q = 0; q < st.n; q++) {
    const k = readCoin(st, q);
    if (k.kind === 'one') given++;
    if (!k.settled || k.kind === 'linked') free++;
  }
  return given <= 1 && free >= 2;
}

/** A named board, for the tutorial and the codex, written as a little script. */
export function boardFrom(script, n = 5) {
  const st = new QState(n);
  for (const step of script) {
    const [op, ...args] = step;
    st[op](...args);
  }
  return st;
}
