/**
 * gameplay/bosses.js — the fifth round of every five.
 *
 * A boss is one opponent with a rule attached. The rule is always something a
 * physicist would recognise and always announced before the hand, because a
 * boss that cheats in secret is just a bug.
 */
import { PERSONAS } from '../ai/personalities.js';
import { SKILL } from './planner.js';
import { PROFILES } from '../quantum/noise.js';

export const BOSSES = {
  schrodinger: {
    key: 'schrodinger', name: 'Schrödinger', accent: '#a5b4fc', avatar: 'cat',
    title: 'The Cat',
    warning: 'Every coin is dealt spinning. Nothing is settled until the showdown.',
    physics: 'A system in superposition has no value to hide. The cat is not secretly one thing.',
    persona: Object.assign({}, PERSONAS.moth, {
      key: 'schrodinger', name: 'Schrödinger', skill: SKILL.master,
      aggression: 0.45, bluff: 0.1, tight: 0.5,
      lines: {
        greet: ['The box is closed. Bet accordingly.'],
        raise: ['I am both certain and uncertain.'],
        call: ['Call. Or do not. Both.'],
        fold: ['I withdraw. Partially.'],
        win: ['Alive, then.'],
        lose: ['Ah. The other one.']
      }
    }),
    deal: { pairBias: -0.4 },
    setup: (game) => { game.bossAllSpinning = true; },
    handStart: (game) => {
      for (const p of game.players) {
        if (!p.board) continue;
        for (let q = 0; q < game.coins; q++) {
          const pr = p.board.probOne(q);
          if (pr < 1e-6 || pr > 1 - 1e-6) { p.board.h(q); p.circuit.add('h', [q], null, { boss: true }); }
        }
      }
      game.note('Schrödinger deals every coin spinning.');
    }
  },

  grover: {
    key: 'grover', name: 'Grover', accent: '#fbbf24', avatar: 'search',
    title: 'The Search',
    warning: 'Grover finds the best coin on the board every street and pushes it further.',
    physics: 'Amplitude amplification: √N queries to find a needle in N haystacks.',
    persona: Object.assign({}, PERSONAS.ash, {
      key: 'grover', name: 'Grover', skill: SKILL.perfect,
      aggression: 0.65, bluff: 0.08, tight: 0.35,
      lines: {
        greet: ['I have already looked.'],
        raise: ['Found it.'],
        call: ['Searching.'],
        fold: ['Not in this space.'],
        win: ['Marked, amplified, measured.'],
        lose: ['An unmarked branch. It happens.']
      }
    }),
    handStart: (game) => {
      const boss = game.players.find((p) => p.bot && p.bot.key === 'grover');
      if (!boss || !boss.board) return;
      let best = -1, bp = 0.5;
      for (let q = 0; q < game.coins; q++) {
        const pr = boss.board.probOne(q);
        if (pr > bp && pr < 1 - 1e-9) { bp = pr; best = q; }
      }
      if (best >= 0) {
        const theta = Math.asin(Math.sqrt(bp));
        boss.board.ry(best, 2 * (Math.min(Math.PI / 2, theta * 1.6) - theta));
        boss.circuit.add('ry', [best], null, { boss: true, note: 'amplified' });
      }
    }
  },

  deutsch: {
    key: 'deutsch', name: 'Deutsch', accent: '#34d399', avatar: 'oracle',
    title: 'The Oracle',
    warning: 'Deutsch sees your board exactly, all hand, every hand.',
    physics: 'One query to a black box answers a question about all its inputs at once.',
    persona: Object.assign({}, PERSONAS.rook, {
      key: 'deutsch', name: 'Deutsch', skill: SKILL.perfect,
      aggression: 0.55, bluff: 0.02, tight: 0.6,
      lines: {
        greet: ['I need only one question.'],
        raise: ['I know what you have.'],
        call: ['Call. I am certain.'],
        fold: ['You have it. Take it.'],
        win: ['One query. That is all it ever takes.'],
        lose: ['Then the function was balanced after all.']
      }
    }),
    setup: (game) => {
      const boss = game.players.find((p) => p.bot && p.bot.key === 'deutsch');
      if (boss) boss.status.add('oracle', { run: true });
    }
  },

  bell: {
    key: 'bell', name: 'The Bell Twins', accent: '#c084fc', avatar: 'twins',
    title: 'Two Seats, One Hand',
    warning: 'The Twins take two seats and share one board. Beat them both or neither.',
    physics: 'Two qubits in a Bell state have no individual description — only a joint one.',
    twins: true,
    persona: Object.assign({}, PERSONAS.vesper, {
      key: 'bell', name: 'Bell', skill: SKILL.master,
      aggression: 0.6, bluff: 0.15, tight: 0.35,
      lines: {
        greet: ['We are ready.', 'We have looked at our cards.'],
        raise: ['We raise.'],
        call: ['We call.'],
        fold: ['We fold.'],
        win: ['We win.'],
        lose: ['We lost. Both of us, exactly equally.']
      }
    }),
    handStart: (game) => {
      const twins = game.players.filter((p) => p.bot && p.bot.key === 'bell');
      if (twins.length === 2 && twins[0].board) {
        twins[1].board.copyFrom(twins[0].board);
        twins[1].hand = twins[0].hand.slice();
      }
    }
  },

  nisq: {
    key: 'nisq', name: 'NISQ', accent: '#fb7185', avatar: 'chip',
    title: 'The Machine',
    warning: 'The hardware itself is the opponent. Noise on every card, on every board but its own.',
    physics: 'Noisy Intermediate-Scale Quantum: the era we are actually in.',
    persona: Object.assign({}, PERSONAS.ash, {
      key: 'nisq', name: 'NISQ', skill: SKILL.master,
      aggression: 0.5, bluff: 0.05, tight: 0.4,
      lines: {
        greet: ['CALIBRATION COMPLETE.'],
        raise: ['FIDELITY ACCEPTABLE.'],
        call: ['MATCHED.'],
        fold: ['THERMAL LIMIT REACHED.'],
        win: ['ERROR RATE WITHIN SPEC.'],
        lose: ['RECALIBRATING.']
      }
    }),
    noise: PROFILES.storm,
    setup: (game) => {
      const boss = game.players.find((p) => p.bot && p.bot.key === 'nisq');
      if (boss) boss.status.add('mitigated', { run: true });
    }
  },

  heisenberg: {
    key: 'heisenberg', name: 'Heisenberg', accent: '#38bdf8', avatar: 'blur',
    title: 'The Uncertain',
    warning: 'You cannot see your own probabilities. Only the shape of them.',
    physics: 'Measure position precisely and momentum blurs. The trade is not a limit of your equipment.',
    persona: Object.assign({}, PERSONAS.ash, {
      key: 'heisenberg', name: 'Heisenberg', skill: SKILL.master,
      aggression: 0.55, bluff: 0.2, tight: 0.4,
      lines: {
        greet: ['You may know one thing precisely. Choose.'],
        raise: ['Somewhere between certain and not.'],
        call: ['Within the bound.'],
        fold: ['Too blurred.'],
        win: ['Position, then.'],
        lose: ['Momentum, apparently.']
      }
    }),
    blindPlayer: true,
    setup: (game) => { game.hideProbabilities = true; }
  }
};

export const BOSS_KEYS = Object.keys(BOSSES);

/** Which boss guards round `round` of an endless run. */
export function bossFor(round, rng) {
  const idx = Math.floor(round / 5) - 1;
  if (idx < 0) return null;
  if (idx < BOSS_KEYS.length) return BOSSES[BOSS_KEYS[idx]];
  return BOSSES[BOSS_KEYS[Math.floor(rng() * BOSS_KEYS.length) % BOSS_KEYS.length]];
}

export function isBossRound(round) { return round > 0 && round % 5 === 0; }
