/**
 * gameplay/status.js — temporary effects on a player or a coin.
 *
 * A status is a small badge under a seat with a duration. It is deliberately
 * dumb data: the game loop asks the registry questions ("is this coin frozen?",
 * "what multiplies this payout?") rather than statuses reaching into the game.
 */

export const STATUSES = {
  frozen: {
    key: 'frozen', name: 'Frozen', icon: '❄', tint: '#7dd3fc', perCoin: true,
    blurb: 'This coin is sealed. Noise and rival cards cannot move it.',
    physics: 'Dynamical decoupling holding a qubit still.'
  },
  shield: {
    key: 'shield', name: 'Superposition Shield', icon: '◎', tint: '#a5b4fc',
    blurb: 'The first card played against you this hand is refused.',
    physics: 'A decoherence-free subspace: information hidden where the environment cannot reach it.'
  },
  decoherence: {
    key: 'decoherence', name: 'Decoherence', icon: '✳', tint: '#fb7185', bad: true,
    blurb: 'Your board takes an extra noise roll after every card you play.',
    physics: 'Coupling to the environment. Every real qubit has this status, permanently.'
  },
  entangled: {
    key: 'entangled', name: 'Entangled', icon: '∞', tint: '#c084fc',
    blurb: 'Two of your coins are perfectly linked. Scoring both pays a bonus.',
    physics: 'A Bell pair: correlations stronger than any classical pair of coins can produce.'
  },
  phaselocked: {
    key: 'phaselocked', name: 'Phase Locked', icon: '⦿', tint: '#67e8f9',
    blurb: 'Twist and the rotation cards have no effect on your board.',
    physics: 'A qubit pinned to the z axis, where phase is meaningless.'
  },
  amplified: {
    key: 'amplified', name: 'Amplified', icon: '⤴', tint: '#fbbf24',
    blurb: 'Every coin above even odds gets a little likelier at showdown.',
    physics: 'Amplitude amplification biasing the measurement.'
  },
  measured: {
    key: 'measured', name: 'Measured', icon: 'M', tint: '#94a3b8', bad: true,
    blurb: 'Your board is fully settled. No card can add superposition back this hand.',
    physics: 'Collapse is the one irreversible thing in quantum mechanics.'
  },
  lucky: {
    key: 'lucky', name: 'Lucky Collapse', icon: '✦', tint: '#4ade80',
    blurb: 'Your next Collapse is rerolled once if it lands badly.',
    physics: 'Postselection — legal in a laboratory, cheating at a card table.'
  },
  drift: {
    key: 'drift', name: 'Quantum Drift', icon: '∿', tint: '#f0abfc', bad: true,
    blurb: 'Every coin’s tilt rotates a little at the end of each street.',
    physics: 'Slow phase drift from an imperfect clock. The reason calibration never ends.'
  },
  oracle: {
    key: 'oracle', name: 'Oracle', icon: '◉', tint: '#38bdf8',
    blurb: 'You can see every opponent’s exact odds.',
    physics: 'A black box queried, never opened.'
  },
  mitigated: {
    key: 'mitigated', name: 'Mitigated', icon: '⛨', tint: '#86efac',
    blurb: 'Noise cannot touch your board this hand.',
    physics: 'Zero-noise extrapolation, applied live.'
  },
  tilt: {
    key: 'tilt', name: 'On Tilt', icon: '▲', tint: '#f87171', bad: true,
    blurb: 'You just lost a big pot. Bots read you as weak and push harder.',
    physics: 'Not quantum. Just poker.'
  }
};

export class StatusSet {
  constructor() { this.list = []; }

  /** duration: 'hand' | 'street' | 'run' | a number of hands. */
  add(key, opts = {}) {
    const def = STATUSES[key];
    if (!def) return null;
    const existing = this.list.find((s) => s.key === key && s.coin === opts.coin);
    if (existing) {
      existing.stacks = (existing.stacks || 1) + 1;
      if (opts.hands) existing.hands = Math.max(existing.hands || 0, opts.hands);
      return existing;
    }
    const s = {
      key, def, coin: opts.coin === undefined ? null : opts.coin,
      hand: !!opts.hand, street: !!opts.street, run: !!opts.run,
      hands: opts.hands || 0, stacks: 1, note: opts.note || ''
    };
    this.list.push(s);
    return s;
  }

  has(key, coin) {
    return this.list.some((s) => s.key === key && (coin === undefined || s.coin === null || s.coin === coin));
  }

  get(key) { return this.list.find((s) => s.key === key) || null; }

  remove(key, coin) {
    this.list = this.list.filter((s) => !(s.key === key && (coin === undefined || s.coin === coin)));
  }

  /** Coins that cannot be touched right now. */
  frozenCoins() {
    return this.list.filter((s) => s.key === 'frozen' && s.coin !== null).map((s) => s.coin);
  }

  endStreet() {
    this.list = this.list.filter((s) => !s.street);
  }

  endHand() {
    this.list = this.list.filter((s) => {
      if (s.run) return true;
      if (s.hands > 1) { s.hands--; return true; }
      return false;
    });
  }

  clear() { this.list = []; }

  /** For the badge row: bad ones last, so the good news reads first. */
  display() {
    return this.list.slice().sort((a, b) => (a.def.bad ? 1 : 0) - (b.def.bad ? 1 : 0));
  }
}
