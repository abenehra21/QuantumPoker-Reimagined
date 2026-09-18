/**
 * gameplay/modes.js — the ways to play.
 *
 * A mode is a small bundle of settings. It never changes the rules of poker
 * or the physics; it changes who you face, how noisy the hardware is, and how
 * much the deck is allowed to surprise you.
 */
import { PROFILES } from '../quantum/noise.js';
import { SKILL } from './planner.js';

export const MODES = {
  casual: {
    key: 'casual', name: 'Casual', order: 0, accent: '#6ee7ff',
    tagline: 'Learn the table. Nothing is out to get you.',
    blurb: 'Gentle opponents, no noise, generous stacks. The mode to play your first ten hands in.',
    skill: SKILL.casual, noise: 'clean', bots: 2, startChips: 1200, handSize: 3,
    handsPerRound: 8, target: 0.60, payoutScale: 0.8, chaos: 0
  },
  student: {
    key: 'student', name: 'Quantum Student', order: 1, accent: '#7c9dff',
    tagline: 'A fair game against people who have read the textbook.',
    blurb: 'Balanced opponents and a faint hum of decoherence. The intended way to play.',
    skill: SKILL.student, noise: 'faint', bots: 3, startChips: 1000, handSize: 3,
    handsPerRound: 8, target: 0.72, payoutScale: 1, chaos: 0
  },
  master: {
    key: 'master', name: 'Quantum Master', order: 2, accent: '#c084fc',
    tagline: 'They see every line you see, and one more.',
    blurb: 'Opponents run the same search you do at full width. Real NISQ-level noise. Blinds climb fast.',
    skill: SKILL.master, noise: 'nisq', bots: 3, startChips: 900, handSize: 3,
    handsPerLevel: 4, handsPerRound: 8, target: 0.85, payoutScale: 1.35, chaos: 0
  },
  chaos: {
    key: 'chaos', name: 'Chaos', order: 3, accent: '#fbbf24',
    tagline: 'Something happens every round. It is rarely good.',
    blurb: 'A random quantum event fires every street: storms, cascades, spontaneous entanglement, honest-to-goodness bad luck.',
    skill: SKILL.student, noise: 'storm', bots: 3, startChips: 1100, handSize: 4,
    handsPerRound: 8, target: 0.75, payoutScale: 1.5, chaos: 1
  },
  experimental: {
    key: 'experimental', name: 'Experimental', order: 4, accent: '#34d399',
    tagline: 'Continuous angles. Nothing is 50/50 any more.',
    blurb: 'Boards are dealt at arbitrary rotations, so no coin reads as a clean plus or minus. The rotation cards stop being situational and start being essential.',
    skill: SKILL.master, noise: 'faint', bots: 3, startChips: 1000, handSize: 4,
    deal: { tiltChance: 0.55, pairBias: 0.2 }, handsPerRound: 8, target: 0.78,
    payoutScale: 1.4, chaos: 0
  },
  daily: {
    key: 'daily', name: 'Daily Deal', order: 5, accent: '#f472b6',
    tagline: 'Everyone on Earth gets the same ten hands today.',
    blurb: 'Ten hands, one seed, one attempt. Share your result as an emoji grid and keep a streak.',
    skill: SKILL.student, noise: 'faint', bots: 3, startChips: 1000, handSize: 3,
    maxHands: 10, payoutScale: 1, chaos: 0, locked: true
  },
  endless: {
    key: 'endless', name: 'Endless', order: 6, accent: '#fb7185',
    tagline: 'It scales until it beats you. It will beat you.',
    blurb: 'Difficulty, noise and opponent skill all climb. A boss every fifth round. There is no ending, only a number.',
    skill: SKILL.student, noise: 'faint', bots: 3, startChips: 1000, handSize: 3,
    handsPerRound: 8, target: 0.72, payoutScale: 1.2, chaos: 0, endless: true
  },
  sandbox: {
    key: 'sandbox', name: 'Sandbox', order: 7, accent: '#94a3b8',
    tagline: 'No chips, no opponents, every card.',
    blurb: 'A circuit editor with the whole deck unlocked, live probabilities, undo and a Bloch sphere. The teaching tool.',
    sandbox: true
  }
};

/**
 * How many chips you must still have at the end of a round to go shopping.
 * Poker is zero-sum, so a hero facing equally good opponents breaks even on
 * average; asking for a profit every round would make a run unwinnable. The
 * ask is therefore survival, and it tightens each round while the blinds and
 * the opponents' skill climb underneath it. Calibrated against 40 simulated
 * runs: median depth 3 rounds, the top tenth reaching 9 or more.
 */
export const TARGET_STEP = 0.075;

export function targetFor(mode, round, startChips) {
  return Math.round((startChips || mode.startChips || 1000) *
    ((mode.target || 0.72) + (round - 1) * TARGET_STEP));
}

export const MODE_KEYS = Object.keys(MODES).sort((a, b) => MODES[a].order - MODES[b].order);

/**
 * Chaos mode events. One fires at the start of each street. Each is a real
 * quantum phenomenon, applied to everybody equally.
 */
export const CHAOS_EVENTS = [
  {
    key: 'storm', name: 'Phase Storm', icon: '⛈',
    blurb: 'Every board takes a random twist on every coin.',
    fire: (game) => {
      for (const p of game.inHand()) {
        const frozen = p.status.frozenCoins();
        for (let q = 0; q < game.coins; q++) {
          if (frozen.includes(q) || game.rng() >= 0.5) continue;
          p.board.z(q);
          p.circuit.add('z', [q], null, { note: 'phase storm', chaos: true });
        }
      }
    }
  },
  {
    key: 'spontaneous', name: 'Spontaneous Entanglement', icon: '∞',
    blurb: 'Two random coins on every board become linked.',
    fire: (game) => {
      for (const p of game.inHand()) {
        const a = Math.floor(game.rng() * game.coins);
        let b = Math.floor(game.rng() * game.coins);
        if (b === a) b = (b + 1) % game.coins;
        p.board.cx(a, b);
        p.circuit.add('cx', [a, b], null, { note: 'spontaneous', chaos: true });
      }
    }
  },
  {
    key: 'cosmic', name: 'Cosmic Ray', icon: '☄',
    blurb: 'One coin on one board flips, for no reason anyone can control.',
    fire: (game) => {
      const live = game.inHand();
      if (!live.length) return;
      const p = live[Math.floor(game.rng() * live.length)];
      const q = Math.floor(game.rng() * game.coins);
      p.board.x(q);
      p.circuit.add('noise', [q], null, { note: 'cosmic ray', chaos: true });
      game.note(`A cosmic ray hit ${p.name}'s coin ${q + 1}.`);
    }
  },
  {
    key: 'annealing', name: 'Cooling Cycle', icon: '❄',
    blurb: 'Every board cools: each coin settles on whichever side it leans.',
    fire: (game) => {
      for (const p of game.inHand()) {
        for (let q = 0; q < game.coins; q++) {
          const pr = p.board.probOne(q);
          if (pr > 0.62) p.board.project(q, 1);
          else if (pr < 0.38 && pr > 1e-9) p.board.project(q, 0);
        }
      }
    }
  },
  {
    key: 'rebate', name: 'Grant Funding', icon: '◇',
    blurb: 'Everyone still in the hand is handed chips. Enjoy it.',
    fire: (game) => {
      const bonus = game.bigBlind * 2;
      for (const p of game.inHand()) p.chips += bonus;
      game.note(`Grant funding: ${bonus} chips each.`);
    }
  },
  {
    key: 'recalibration', name: 'Recalibration', icon: '↻',
    blurb: 'Everyone draws an extra card.',
    fire: (game) => { for (const p of game.inHand()) game.draw(p.seat, 1); }
  },
  {
    key: 'zeno', name: 'Zeno Freeze', icon: '⌛',
    blurb: 'One coin on every board is frozen where it stands.',
    fire: (game) => {
      const q = Math.floor(game.rng() * game.coins);
      for (const p of game.inHand()) p.status.add('frozen', { coin: q, hand: true });
      game.note(`Coin ${q + 1} is frozen on every board.`);
    }
  },
  {
    key: 'drift', name: 'Clock Drift', icon: '∿',
    blurb: 'Every unsettled coin rotates by a random angle.',
    fire: (game) => {
      for (const p of game.inHand()) {
        for (let q = 0; q < game.coins; q++) {
          const pr = p.board.probOne(q);
          if (pr < 1e-6 || pr > 1 - 1e-6) continue;
          p.board.rz(q, (game.rng() * 2 - 1) * Math.PI);
        }
      }
    }
  }
];

/** Build the Game options a mode implies, at a given round of a run. */
export function optionsFor(mode, opts = {}) {
  const round = opts.round || 1;
  const scale = mode.endless ? 1 + (round - 1) * 0.12 : 1;
  let noise = PROFILES[mode.noise] || PROFILES.clean;
  if (mode.endless && round > 1) noise = noise.scaled(Math.min(3, scale));
  return {
    seed: opts.seed,
    seats: opts.seats,
    coins: opts.coins || 5,
    handSize: mode.handSize || 3,
    startChips: Math.round((mode.startChips || 1000) * (opts.chipScale || 1)),
    smallBlind: Math.round(10 * (mode.endless ? Math.pow(1.35, round - 1) : 1)),
    handsPerLevel: mode.handsPerLevel || 5,
    maxHands: mode.maxHands || mode.handsPerRound || 0,
    noise,
    modifier: opts.modifier || (mode.deal ? { deal: mode.deal } : null)
  };
}
