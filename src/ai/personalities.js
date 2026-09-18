/**
 * ai/personalities.js — who you are playing against.
 *
 * Each opponent is a set of dials on one shared brain plus a voice. The dials
 * are deliberately few: aggression, bluff, tightness, and how well they read
 * a quantum board. Everything that makes them feel different at the table
 * comes out of those four numbers interacting with the hand, not from
 * scripted behaviour.
 */
import { SKILL } from '../gameplay/planner.js';

export const PERSONAS = {
  rook: {
    key: 'rook', name: 'Rook', avatar: 'rook', accent: '#6ee7ff',
    title: 'The Straight Player',
    aggression: 0.35, bluff: 0.06, tight: 0.55, skill: SKILL.student,
    tell: 'Plays it straight. If Rook bets big, Rook has it.',
    bio: 'A lab technician who learned poker from a textbook and quantum mechanics from a colleague. Does the arithmetic, then does what it says.',
    lines: {
      greet: ['Deal them.', 'Let us be sensible about this.'],
      raise: ['I like my odds.', 'That is worth a bet.', 'Raising. The numbers say so.'],
      call: ['Call.', 'I will see it.'],
      fold: ['Not this one.', 'Folding. The maths disagrees.'],
      bluffCaught: ['Worth a try.', 'You read me.'],
      win: ['As expected.', 'The arithmetic held.'],
      lose: ['Variance.', 'Well played. Genuinely.'],
      bigLoss: ['I had the better hand and the worse board.'],
      quantum: ['Interference. Beautiful every time.', 'That is a clean Bell pair.']
    }
  },

  vesper: {
    key: 'vesper', name: 'Vesper', avatar: 'vesper', accent: '#f472b6',
    title: 'The Gambler',
    aggression: 0.78, bluff: 0.24, tight: 0.18, skill: SKILL.student,
    tell: 'Bets at everything. The trouble is telling which everything.',
    bio: 'Discovered superposition and decided it meant she could have it both ways. Has not been talked out of it yet.',
    lines: {
      greet: ['Finally. Someone worth taking money from.', 'Let us make this expensive.'],
      raise: ['More.', 'Put it in.', 'I am not here to check.', 'All of it sounds good.'],
      call: ['Sure.', 'Why not.'],
      fold: ['Fine. Keep it.', 'Have that one.'],
      bluffCaught: ['You are no fun.', 'Lucky.'],
      win: ['Obviously.', 'Told you.', 'Superposition: I win and I win.'],
      lose: ['Rude.', 'That was MY pot.'],
      bigLoss: ['I want a rematch and I want it now.'],
      quantum: ['I have no idea what that did but I love it.']
    }
  },

  moth: {
    key: 'moth', name: 'Moth', avatar: 'moth', accent: '#a5b4fc',
    title: 'The Risk-Averse',
    aggression: 0.18, bluff: 0.02, tight: 0.88, skill: SKILL.student,
    tell: 'Folds unless certain. When Moth calls, worry.',
    bio: 'Spent nine years on error correction. Has a professional horror of anything that might go wrong, which is everything.',
    lines: {
      greet: ['I will be careful.', 'Hello.'],
      raise: ['I am certain enough.', 'This one I will back.'],
      call: ['Calling. Reluctantly.', 'I suppose.'],
      fold: ['No.', 'Too much can go wrong.', 'Fold. Sorry.'],
      bluffCaught: ['I should have folded.'],
      win: ['Oh. Good.', 'I was sure, so.'],
      lose: ['I knew it.', 'Yes, that is about right.'],
      bigLoss: ['I should never have called.'],
      quantum: ['That will decohere. Everything decoheres.']
    }
  },

  ash: {
    key: 'ash', name: 'Ash', avatar: 'ash', accent: '#c084fc',
    title: 'The Unreadable',
    aggression: 0.5, bluff: 0.14, tight: 0.45, skill: SKILL.master,
    tell: 'Nothing. That is the tell.',
    bio: 'Nobody at the table knows what Ash does for a living. Ash bets the same amount whether the board is a gift or a disaster.',
    lines: {
      greet: ['…', 'Deal.'],
      raise: ['Raise.', '…raise.'],
      call: ['Call.', '…'],
      fold: ['Fold.', '…'],
      bluffCaught: ['…'],
      win: ['Mm.', 'Thank you.'],
      lose: ['Mm.'],
      bigLoss: ['…'],
      quantum: ['Mm.']
    }
  },

  echo: {
    key: 'echo', name: 'Echo', avatar: 'echo', accent: '#34d399',
    title: 'The Adaptive',
    aggression: 0.5, bluff: 0.12, tight: 0.5, skill: SKILL.master,
    adaptive: true,
    tell: 'Plays the way you played last hand. Beat yourself.',
    bio: 'A reinforcement learner that was fed ten million hands and came out with opinions. Copies whatever just worked, including your worst habits.',
    lines: {
      greet: ['Observing.', 'Let us see what you do.'],
      raise: ['You would raise here.', 'Adapting upward.'],
      call: ['Matching you.', 'Call.'],
      fold: ['You would fold. So do I.', 'Discarding the line.'],
      bluffCaught: ['Noted. Weight updated.'],
      win: ['Your strategy, applied better.', 'Converged.'],
      lose: ['Useful data.'],
      bigLoss: ['Recalibrating.'],
      quantum: ['Higher entropy than my policy expected.']
    }
  },

  quark: {
    key: 'quark', name: 'Quark', avatar: 'quark', accent: '#fbbf24',
    title: 'The Chaos Agent',
    aggression: 0.6, bluff: 0.4, tight: 0.25, skill: SKILL.casual,
    chaotic: true,
    tell: 'None of it means anything. That is genuinely the strategy.',
    bio: 'Claims to be a quantum random number generator wearing a hat. Nobody has disproved this.',
    lines: {
      greet: ['!', 'Numbers! Chips! Hello!'],
      raise: ['Yes.', 'Bigger.', 'I have decided.', 'The dice said so.'],
      call: ['Okay!', 'Mhm.'],
      fold: ['Boring.', 'No thank you.'],
      bluffCaught: ['Ha!'],
      win: ['HA.', 'Randomness prevails.'],
      lose: ['Worth it.'],
      bigLoss: ['Again! Again!'],
      quantum: ['That one made a NOISE.']
    }
  }
};

export const PERSONA_KEYS = Object.keys(PERSONAS);

/** Pick `n` distinct opponents deterministically from a seed. */
export function chooseOpponents(n, rng, exclude = []) {
  const pool = PERSONA_KEYS.filter((k) => !exclude.includes(k));
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length) % pool.length;
    out.push(pool.splice(i, 1)[0]);
  }
  return out.map((k) => PERSONAS[k]);
}
