/**
 * quantum/noise.js — decoherence, the thing that makes real quantum hardware
 * hard and this game interesting.
 *
 * A state vector cannot represent a mixed state, so rather than fake density
 * matrices we do what a real simulator does: sample a Kraus operator from the
 * channel and apply it. Over many hands the statistics are exactly right, and
 * within one hand the player gets a concrete, visible event — "coin 3 flipped"
 * — which is far better drama than a number quietly sliding.
 *
 * This is the honest version of "Quantum Noise" from the design brief, and the
 * Error Mitigation and Noise Cancel relics push directly against it.
 */
import { LOOSE } from './state.js';
import { readCoin } from './read.js';

/** Named noise channels, each a sampler that mutates the state in place. */
export const CHANNELS = {
  /** Bit flip: X with probability p. The classical error. */
  bitflip: {
    name: 'Bit flip',
    symbol: 'X',
    blurb: 'A stray photon flips a coin outright.',
    apply(st, q, p, rng) {
      if (rng() >= p) return null;
      st.x(q);
      return { kind: 'bitflip', q, text: `coin ${q + 1} flipped` };
    }
  },

  /** Phase flip: Z with probability p. Invisible until a gate reveals it. */
  phaseflip: {
    name: 'Phase flip',
    symbol: 'Z',
    blurb: 'The tilt of a spinning coin reverses. You cannot see it happen.',
    apply(st, q, p, rng) {
      if (rng() >= p) return null;
      st.z(q);
      return { kind: 'phaseflip', q, text: `coin ${q + 1} lost its phase`, hidden: true };
    }
  },

  /** Depolarising: X, Y or Z, each with p/3. The textbook worst case. */
  depolarising: {
    name: 'Depolarising',
    symbol: '✳',
    blurb: 'The coin forgets what it was, in one of three ways.',
    apply(st, q, p, rng) {
      if (rng() >= p) return null;
      const r = rng();
      if (r < 1 / 3) { st.x(q); return { kind: 'depolarising', q, text: `coin ${q + 1} depolarised (X)` }; }
      if (r < 2 / 3) { st.y(q); return { kind: 'depolarising', q, text: `coin ${q + 1} depolarised (Y)` }; }
      st.z(q);
      return { kind: 'depolarising', q, text: `coin ${q + 1} depolarised (Z)`, hidden: true };
    }
  },

  /**
   * Amplitude damping: energy leaks and |1> relaxes toward |0>. This is T1,
   * the reason a real qubit has a lifetime. A 1 is never safe for long.
   */
  damping: {
    name: 'Relaxation',
    symbol: '↓',
    blurb: 'A coin showing 1 loses energy and slumps toward 0. Real qubits do this constantly.',
    apply(st, q, p, rng) {
      const p1 = st.probOne(q);
      if (p1 < LOOSE) return null;
      if (rng() >= p * p1) return null;
      st.project(q, 1);
      st.x(q);
      return { kind: 'damping', q, text: `coin ${q + 1} relaxed to 0` };
    }
  },

  /**
   * Dephasing measured in the +/- basis: superposition survives but the tilt
   * randomises. Visually the orb keeps spinning but its colour goes grey.
   */
  dephasing: {
    name: 'Dephasing',
    symbol: '∿',
    blurb: 'The coin keeps spinning but forgets which way it was tilted.',
    apply(st, q, p, rng) {
      if (rng() >= p) return null;
      st.rz(q, (rng() * 2 - 1) * Math.PI);
      return { kind: 'dephasing', q, text: `coin ${q + 1} drifted`, hidden: true };
    }
  },

  /** Crosstalk: a neighbour's gate leaks. Only fires on a linked pair. */
  crosstalk: {
    name: 'Crosstalk',
    symbol: '⇄',
    blurb: 'Neighbouring coins interfere with each other.',
    apply(st, q, p, rng) {
      if (rng() >= p) return null;
      const other = (q + 1) % st.n;
      if (other === q) return null;
      st.cphase(q, other, Math.PI / 4);
      return { kind: 'crosstalk', q, b: other, text: `coins ${q + 1} and ${other + 1} crosstalked`, hidden: true };
    }
  }
};

export const CHANNEL_KEYS = Object.keys(CHANNELS);

/**
 * A noise profile: which channels are live and how hard. Modes and bosses
 * hand one of these to the hand. `immunity` in [0, 1] comes from relics.
 */
export class NoiseProfile {
  constructor(spec = {}) {
    this.rates = Object.assign({}, spec.rates || {});
    this.label = spec.label || 'Clean';
    this.perGate = spec.perGate === undefined ? true : spec.perGate;
    this.perStreet = spec.perStreet === undefined ? false : spec.perStreet;
  }

  get active() { return Object.values(this.rates).some((r) => r > 0); }

  scaled(k) {
    const out = new NoiseProfile(this);
    out.rates = {};
    for (const key of Object.keys(this.rates)) out.rates[key] = this.rates[key] * k;
    return out;
  }

  /**
   * Roll every live channel against every coin once. Returns the list of
   * events that actually fired, for the table to animate and narrate.
   * A settled |0> in a bit-flip-free profile is left alone, which keeps the
   * early tutorial boards quiet.
   */
  tick(st, rng, immunity = 0, only = null) {
    const events = [];
    if (immunity >= 1) return events;
    const k = 1 - immunity;
    for (const key of Object.keys(this.rates)) {
      const rate = this.rates[key] * k;
      if (rate <= 0) continue;
      const ch = CHANNELS[key];
      if (!ch) continue;
      for (let q = 0; q < st.n; q++) {
        if (only && !only.includes(q)) continue;
        const ev = ch.apply(st, q, rate, rng);
        if (ev) { ev.channel = key; ev.label = ch.name; events.push(ev); }
      }
    }
    if (events.length) st.renormalise();
    return events;
  }
}

/** Presets the modes pick from. */
export const PROFILES = {
  clean: new NoiseProfile({ label: 'Clean', rates: {} }),
  faint: new NoiseProfile({ label: 'Faint', rates: { dephasing: 0.03, damping: 0.02 } }),
  nisq: new NoiseProfile({
    label: 'NISQ',
    rates: { bitflip: 0.03, phaseflip: 0.04, damping: 0.05, dephasing: 0.06 }
  }),
  storm: new NoiseProfile({
    label: 'Decoherence storm',
    rates: { bitflip: 0.09, phaseflip: 0.10, damping: 0.12, dephasing: 0.14, crosstalk: 0.08 }
  })
};

/**
 * Zero-noise extrapolation, in miniature. Run the same board at two noise
 * levels and extrapolate linearly back to zero. This is a real error
 * mitigation technique, and the Error Mitigation relic literally performs it
 * on the player's score estimate, which is a nice thing to have learned by
 * accident while playing a card game.
 */
export function zeroNoiseExtrapolate(build, profile, rng, shots = 200) {
  const at = (scale) => {
    let total = 0;
    for (let i = 0; i < shots; i++) {
      const st = build();
      profile.scaled(scale).tick(st, rng);
      const bits = st.measure(rng);
      total += bits.reduce((a, b) => a + b, 0);
    }
    return total / shots;
  };
  const e1 = at(1), e2 = at(2);
  return { e1, e2, extrapolated: 2 * e1 - e2 };
}

/** A one-line human description of what a profile will do to you. */
export function describeProfile(p) {
  if (!p.active) return 'No noise. The board does exactly what your cards say.';
  const worst = Object.entries(p.rates).sort((a, b) => b[1] - a[1])[0];
  return `${p.label}: mostly ${CHANNELS[worst[0]].name.toLowerCase()}. ${CHANNELS[worst[0]].blurb}`;
}

/** Which coins look damaged right now, for the orb's warning ring. */
export function fragility(st) {
  const out = [];
  for (let q = 0; q < st.n; q++) {
    const c = readCoin(st, q);
    out.push(c.kind === 'one' ? 1 : c.settled ? 0 : 0.5 + c.ent * 0.5);
  }
  return out;
}
