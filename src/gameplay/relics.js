/**
 * gameplay/relics.js — the permanent upgrades a run accumulates.
 *
 * Bought in the shop between rounds, kept for the rest of the run. Each is a
 * set of hooks the game asks at the right moment, which keeps every rule in
 * one place instead of scattered through the engine as special cases.
 *
 * Hooks (all optional, all pure unless noted):
 *   handStart(run, game)          fires once as a hand is dealt
 *   extraCards()                  -> n extra cards in your opening hand
 *   deckBias(id)                  -> weight multiplier when drawing that card
 *   noiseImmunity()               -> 0..1 subtracted from every noise rate
 *   payout(amount, ctx)           -> modified chips won
 *   blindDiscount(amount)         -> modified blind you must post
 *   onScore(score, ctx)           -> modified final coin count
 *   onCollapse(bit, ctx)          -> modified measured bit
 *   shopDiscount(price)           -> modified shop price
 *   rerollsPerShop()              -> extra free shop rerolls
 *   onWin(run, game), onLose(run, game)
 */

export const RELICS = {
  qubit_warmer: {
    id: 'qubit_warmer', name: 'Qubit Warmer', rarity: 'common', price: 70, icon: '♨',
    blurb: 'Draw one extra card at the start of every hand.',
    flavour: 'A dilution fridge runs at 15 millikelvin. This one runs at 14.',
    extraCards: () => 1
  },
  lead_shielding: {
    id: 'lead_shielding', name: 'Lead Shielding', rarity: 'common', price: 60, icon: '▤',
    blurb: 'Noise is 40% less likely to reach your board.',
    flavour: 'Cosmic rays flip qubits. Lead does not care about cosmic rays.',
    noiseImmunity: () => 0.4
  },
  house_edge: {
    id: 'house_edge', name: 'House Edge', rarity: 'common', price: 80, icon: '◆',
    blurb: 'Every pot you win pays 12% more.',
    flavour: 'The casino always wins. Tonight, so do you.',
    payout: (a) => Math.round(a * 1.12)
  },
  small_blind_hedge: {
    id: 'small_blind_hedge', name: 'Blind Hedge', rarity: 'common', price: 65, icon: '◑',
    blurb: 'Blinds cost you 25% less.',
    flavour: 'Negotiated in advance, as all good hedges are.',
    blindDiscount: (a) => Math.max(1, Math.round(a * 0.75))
  },
  spare_cnot: {
    id: 'spare_cnot', name: 'Spare CNOT', rarity: 'common', price: 75, icon: 'CX',
    blurb: 'Link cards are three times likelier to appear in your hand.',
    flavour: 'Somebody left a two-qubit gate in the drawer.',
    deckBias: (id) => (id === 'CX' ? 3 : 1)
  },
  calibration_log: {
    id: 'calibration_log', name: 'Calibration Log', rarity: 'common', price: 55, icon: '≡',
    blurb: 'One extra free reroll in every shop.',
    flavour: 'Yesterday’s numbers, which is better than none.',
    rerollsPerShop: () => 1
  },

  bell_foundry: {
    id: 'bell_foundry', name: 'Bell Foundry', rarity: 'rare', price: 140, icon: '∞',
    blurb: 'Scoring two linked coins together pays a 150 chip bonus.',
    flavour: 'Entanglement, mass produced.',
    payout: (a, ctx) => a + (ctx && ctx.linkedScored ? 150 : 0)
  },
  zeno_clamp: {
    id: 'zeno_clamp', name: 'Zeno Clamp', rarity: 'rare', price: 150, icon: '⌛',
    blurb: 'Your first coin to reach a certain 1 is frozen for the rest of the hand.',
    flavour: 'Watched, and therefore still.',
    handStart: (run, game, seat) => { game.players[seat].autoFreeze = true; }
  },
  loaded_dice: {
    id: 'loaded_dice', name: 'Loaded Dice', rarity: 'rare', price: 160, icon: '⚀',
    blurb: 'Every Collapse that lands on 0 is rerolled once.',
    flavour: 'Postselection. Do not mention it to the referee.',
    onCollapse: (bit, ctx) => (bit === 0 && ctx.rng() < 1 ? (ctx.reroll ? ctx.reroll() : bit) : bit)
  },
  error_budget: {
    id: 'error_budget', name: 'Error Budget', rarity: 'rare', price: 135, icon: '⛨',
    blurb: 'Immune to noise on the first street of every hand.',
    flavour: 'Spend it early, live with the rest.',
    noiseImmunity: (ctx) => (ctx && ctx.round === 0 ? 1 : 0)
  },
  cryo_pump: {
    id: 'cryo_pump', name: 'Cryo Pump', rarity: 'rare', price: 145, icon: '❄',
    blurb: 'Start every hand with a Freeze card in hand.',
    flavour: 'Cold is the cheapest error correction there is.',
    grantCards: () => ['FREEZE']
  },
  tomography_kit: {
    id: 'tomography_kit', name: 'Tomography Kit', rarity: 'rare', price: 155, icon: '◉',
    blurb: 'You always see the exact odds of every opponent’s board.',
    flavour: 'Reconstructing a state you were never shown.',
    alwaysOracle: true
  },
  discount_broker: {
    id: 'discount_broker', name: 'Broker', rarity: 'rare', price: 120, icon: '%',
    blurb: 'Everything in the shop costs 30% less.',
    flavour: 'He knows a guy who knows a fab.',
    shopDiscount: (p) => Math.max(5, Math.round(p * 0.7))
  },

  surface_code: {
    id: 'surface_code', name: 'Surface Code', rarity: 'epic', price: 280, icon: '⊞',
    blurb: 'Completely immune to noise. All of it.',
    flavour: 'A thousand physical qubits pretending, very convincingly, to be one good one.',
    noiseImmunity: () => 1
  },
  grover_engine: {
    id: 'grover_engine', name: 'Grover Engine', rarity: 'epic', price: 300, icon: 'G',
    blurb: 'At showdown, one coin above even odds is pushed to certainty.',
    flavour: '√N queries. It never needed more.',
    onShowdown: (state, ctx) => {
      let best = -1, bp = 0.5001;
      for (let q = 0; q < state.n; q++) {
        const p = state.probOne(q);
        if (p > bp && p < 1 - 1e-9) { bp = p; best = q; }
      }
      if (best >= 0) { state.project(best, 1); ctx.note(`Grover Engine locked coin ${best + 1}.`); }
    }
  },
  ancilla_bank: {
    id: 'ancilla_bank', name: 'Ancilla Bank', rarity: 'epic', price: 260, icon: '⊚',
    blurb: 'Two extra cards every hand, but every pot pays 8% less.',
    flavour: 'Spare qubits are never really spare.',
    extraCards: () => 2,
    payout: (a) => Math.round(a * 0.92)
  },
  phase_kickback: {
    id: 'phase_kickback', name: 'Phase Kickback', rarity: 'epic', price: 250, icon: '↩',
    blurb: 'Every Twist you play also twists a random opponent’s board.',
    flavour: 'The control qubit picks up the phase. It always did.',
    kickback: true
  },
  entropy_harvest: {
    id: 'entropy_harvest', name: 'Entropy Harvest', rarity: 'epic', price: 270, icon: 'Σ',
    blurb: 'Win 40 chips for every bit of entropy left on your board at showdown.',
    flavour: 'Paid by the unknown.',
    payout: (a, ctx) => a + Math.round((ctx && ctx.entropy ? ctx.entropy : 0) * 40)
  },

  schrodingers_chip: {
    id: 'schrodingers_chip', name: 'Schrödinger’s Chip', rarity: 'legendary', price: 480, icon: '◐',
    blurb: 'When you would bust, flip a coin. Heads, you are back with half your buy-in.',
    flavour: 'Until somebody opens the box, you are still in the game.',
    secondLife: true
  },
  universal_gateset: {
    id: 'universal_gateset', name: 'Universal Gate Set', rarity: 'legendary', price: 520, icon: '✳',
    blurb: 'Every card in your hand may be played as any common card instead.',
    flavour: 'Clifford plus T. That is all a quantum computer has ever needed.',
    universal: true
  },
  quantum_advantage: {
    id: 'quantum_advantage', name: 'Quantum Advantage', rarity: 'legendary', price: 560, icon: '▲',
    blurb: 'Coherence — all five coins on 1 — pays triple.',
    flavour: 'The moment the classical machine gives up.',
    payout: (a, ctx) => (ctx && ctx.score === 5 ? a * 3 : a)
  },
  no_cloning: {
    id: 'no_cloning', name: 'No-Cloning Theorem', rarity: 'legendary', price: 500, icon: '⊘',
    blurb: 'Opponents can never hold the same card as you.',
    flavour: 'An unknown quantum state cannot be copied. Proven 1982, still holding.',
    noCloning: true
  }
};

export const RELIC_IDS = Object.keys(RELICS);

/** A player's relic collection, and the one place hooks are resolved. */
export class RelicSet {
  constructor(ids = []) { this.ids = ids.slice(); }

  get list() { return this.ids.map((id) => RELICS[id]).filter(Boolean); }
  has(id) { return this.ids.includes(id); }
  add(id) { if (RELICS[id]) this.ids.push(id); return this; }

  /** Sum a numeric hook across every relic. */
  sum(hook, ctx) {
    let t = 0;
    for (const r of this.list) if (r[hook]) t += r[hook](ctx) || 0;
    return t;
  }

  /** Chain a transform hook: each relic sees the previous one's output. */
  chain(hook, value, ctx) {
    let v = value;
    for (const r of this.list) if (r[hook]) v = r[hook](v, ctx);
    return v;
  }

  /** Multiply a per-card draw weight. */
  weightFor(id) {
    let w = 1;
    for (const r of this.list) if (r.deckBias) w *= r.deckBias(id);
    return w;
  }

  /** Noise immunity, capped at 1. */
  immunity(ctx) {
    let best = 0;
    for (const r of this.list) if (r.noiseImmunity) best = Math.max(best, r.noiseImmunity(ctx) || 0);
    return Math.min(1, best);
  }

  flag(name) { return this.list.some((r) => r[name]); }

  granted() {
    const out = [];
    for (const r of this.list) if (r.grantCards) out.push(...r.grantCards());
    return out;
  }
}
