/**
 * utils/rng.js — deterministic randomness.
 *
 * Every board, every deal, every shop and every boss comes from a seed and an
 * index alone, so a Daily Deal is identical for everyone on Earth and a shared
 * seed replays the same run no matter how anyone plays it.
 */

/** mulberry32: small, fast, good enough, and identical across engines. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mix two integers into one seed, for per-hand and per-shop streams. */
export function mix(a, b) {
  let h = (a ^ 0x9E3779B9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
  h = (h ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Turn a human-typed seed phrase into an integer, so "banana" is shareable. */
export function seedFrom(text) {
  if (text === undefined || text === null || text === '') return (Date.now() & 0x7fffffff) >>> 0;
  const t = String(text).trim();
  if (/^\d+$/.test(t)) return (parseInt(t, 10) >>> 0);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Days since the epoch, in the player's own timezone. The Daily Deal seed. */
export function today() {
  const d = new Date();
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) + d.getFullYear() * 1000;
}

export function range(n) { return Array.from({ length: n }, (_, i) => i); }

export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

export function pick(arr, rng) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

export function pickWeighted(values, weights, rng) {
  const total = weights.reduce((a, b) => a + b, 0);
  const r = rng() * total;
  let acc = 0;
  for (let i = 0; i < values.length; i++) {
    acc += weights[i];
    if (r <= acc) return values[i];
  }
  return values[values.length - 1];
}

/** Sample k distinct items, weighted, without replacement. Used by the shop. */
export function sampleWeighted(values, weightOf, k, rng) {
  const pool = values.slice();
  const out = [];
  while (out.length < k && pool.length) {
    const w = pool.map(weightOf);
    const chosen = pickWeighted(pool, w, rng);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}
