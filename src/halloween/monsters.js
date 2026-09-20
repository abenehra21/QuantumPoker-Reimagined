/**
 * halloween/monsters.js — who you are playing against.
 *
 * Six of them, and each one is a readable tell rather than a hidden number.
 * At a party the point of an opponent is that somebody can say "oh the
 * Werewolf always does this" out loud after two hands, so every personality
 * is built to be legible from behaviour alone.
 *
 * The dials feed one shared brain (see brain.js):
 *   aggression  how often they bet and raise rather than call
 *   bluff       how often they do it with nothing
 *   tight       how much they need before putting candy in
 *   spooky      how keen they are on using powers
 *   tilt        how much a lost pot changes all of the above
 */

export const MONSTERS = {
  vampire: {
    key: 'vampire', name: 'The Vampire', avatar: 'vampire', accent: '#e11d48',
    title: 'Impeccably confident',
    aggression: 0.72, bluff: 0.18, tight: 0.35, spooky: 0.4, tilt: 0.1,
    tell: 'Raises with real hands and raises with nothing. Charming either way.',
    bio: 'Has been playing this game since before the rules were written. Does not blink. Does not need to.',
    lines: {
      greet: ['Do come in.', 'I have been expecting a donation.'],
      raise: ['Care to raise?', 'A modest contribution.', 'I insist.'],
      call: ['I will see that.', 'Naturally.'],
      check: ['After you.', 'Take your time.'],
      fold: ['Keep it. I have centuries.', 'Beneath me.'],
      win: ['Delicious.', 'As it should be.', 'Thank you for the candy.'],
      lose: ['Hm. Novel.', 'Enjoy it while you last.'],
      power: ['Watch closely.', 'A small trick.'],
      bigLoss: ['I shall remember this.']
    }
  },

  witch: {
    key: 'witch', name: 'The Witch', avatar: 'witch', accent: '#a855f7',
    title: 'Never stops casting',
    aggression: 0.5, bluff: 0.12, tight: 0.45, spooky: 0.95, tilt: 0.15,
    tell: 'Uses a power almost every hand. If she has not cast anything, be worried.',
    bio: 'Treats the quantum abilities as a hobby rather than a strategy. Occasionally this works.',
    lines: {
      greet: ['Ooh, fresh candy.', 'Let us stir something.'],
      raise: ['The cauldron says yes.', 'Bubble, bubble.'],
      call: ['I will match that.', 'Mm, fine.'],
      check: ['Let it brew.', 'Not yet.'],
      fold: ['Wrong ingredients.', 'The omens are bad.'],
      win: ['It WORKED!', 'Science! Sorry — sorcery!'],
      lose: ['Wrong potion.', 'That was supposed to do something else.'],
      power: ['Abracadabra-ish!', 'Watch this bit.', 'I have been saving this.'],
      bigLoss: ['I need a bigger cauldron.']
    }
  },

  ghost: {
    key: 'ghost', name: 'The Ghost', avatar: 'ghost', accent: '#94a3b8',
    title: 'Bluffs constantly',
    aggression: 0.66, bluff: 0.42, tight: 0.2, spooky: 0.5, tilt: 0.05,
    tell: 'Bets at everything. The hard part is the one time in four when it is real.',
    bio: 'Has nothing to lose, being dead, and plays accordingly.',
    lines: {
      greet: ['BOO.', 'oooOOOooo.'],
      raise: ['Definitely have it.', 'Trust me.', 'Would a ghost lie?'],
      call: ['Sure.', 'Why not.'],
      check: ['...', 'Hmm.'],
      fold: ['Fine, I had nothing.', 'You got me.'],
      win: ['I had NOTHING.', 'Ha! Nothing!'],
      lose: ['Rude.', 'I was so close.'],
      power: ['Spooky.', 'Ooooh.'],
      bigLoss: ['I am going to go haunt a fridge.']
    }
  },

  werewolf: {
    key: 'werewolf', name: 'The Werewolf', avatar: 'werewolf', accent: '#f59e0b',
    title: 'One volume setting',
    aggression: 0.88, bluff: 0.25, tight: 0.12, spooky: 0.25, tilt: 0.45,
    tell: 'Bets big, always. Loses a pot and bets bigger.',
    bio: 'Has two strategies: all of the candy, and more of the candy.',
    lines: {
      greet: ['GRRR.', 'Deal. DEAL.'],
      raise: ['MORE.', 'RAISE.', 'BIGGER.'],
      call: ['Fine.', 'Yes.'],
      check: ['...grr.'],
      fold: ['GRRRRR.', 'No.'],
      win: ['MINE.', 'AWOOOO!'],
      lose: ['GRRRRRRR.', 'Again. AGAIN.'],
      power: ['Shiny.'],
      bigLoss: ['I am going to eat the moon.']
    }
  },

  cat: {
    key: 'cat', name: 'Schrödinger’s Cat', avatar: 'cat', accent: '#22d3ee',
    title: 'Simultaneously bluffing and not',
    aggression: 0.5, bluff: 0.5, tight: 0.5, spooky: 0.7, tilt: 0,
    chaotic: true,
    tell: 'None whatsoever. That is not a personality flaw, it is the whole bit.',
    bio: 'Both winning and losing until the showdown. Objects to being asked which.',
    lines: {
      greet: ['I am both in and out of this hand.', 'Mrrp.'],
      raise: ['Yes. And no.', 'I have decided. Probably.'],
      call: ['Fine, superposition of fine.', 'Mm.'],
      check: ['...', 'Purr.'],
      fold: ['I fold. I also do not.', 'Nope.'],
      win: ['Alive, then!', 'Told you. Partly.'],
      lose: ['The other one, apparently.', 'Hiss.'],
      power: ['Obviously.', 'This is my whole thing.'],
      bigLoss: ['Open the box. I dare you.']
    }
  },

  pumpkin: {
    key: 'pumpkin', name: 'Jack the Pumpkin', avatar: 'pumpkin', accent: '#fb923c',
    title: 'Friendly and readable',
    aggression: 0.3, bluff: 0.04, tight: 0.62, spooky: 0.3, tilt: 0.05,
    friendly: true,
    tell: 'Bets exactly when he has it. He will also tell you he has it.',
    bio: 'Genuinely delighted to be here. Explains his own reasoning out loud, which is a real problem for him.',
    lines: {
      greet: ['Hi! Good luck everyone!', 'Ooh, cards!'],
      raise: ['I think this one’s good!', 'Okay, I like my hand!'],
      call: ['I’ll stay in!', 'Sure!'],
      check: ['I’ll wait.', 'Nothing yet!'],
      fold: ['Ah, not this time.', 'Too rich for me!'],
      win: ['I WON!', 'Wow! Thanks!'],
      lose: ['Good hand!', 'Aw. Well played!'],
      power: ['Ooh, what does this do?', 'Here goes!'],
      bigLoss: ['That’s okay! Still fun!']
    }
  }
};

export const MONSTER_KEYS = Object.keys(MONSTERS);

/** Pick `n` distinct opponents, deterministically from a seed. */
export function pickMonsters(n, rng) {
  const pool = MONSTER_KEYS.slice();
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(rng() * pool.length) % pool.length;
    out.push(MONSTERS[pool.splice(i, 1)[0]]);
  }
  return out;
}

/**
 * A short line for the moment. Never repeats itself twice running, because
 * a catchphrase stops being funny the second time and actively grates the
 * third.
 */
const recent = new Map();
export function say(monster, situation, rng) {
  const pool = monster.lines && monster.lines[situation];
  if (!pool || !pool.length) return null;
  const last = recent.get(monster.key + situation);
  let line = pool[Math.floor(rng() * pool.length) % pool.length];
  if (pool.length > 1 && line === last) line = pool[(pool.indexOf(line) + 1) % pool.length];
  recent.set(monster.key + situation, line);
  return line;
}

/** Reactions anyone at the table can throw out, for the big moments. */
export const REACTIONS = {
  bigPot: ['WHAT?!', 'Oh come ON.', 'That is a lot of candy.', 'Absolutely not.'],
  collapse: ['THAT WAS QUANTUM.', 'What just happened.', 'Schrödinger did NOT approve.', 'Science!'],
  measured: ['Ooooh.', 'Interesting…', 'Called it.', 'No way.'],
  allIn: ['BOO!', 'Are you serious?', 'Oh, it’s like that.', 'Respect.'],
  badBeat: ['Impossible.', 'I refuse.', 'That is illegal.', 'Somebody check the deck.'],
  goodHand: ['Nice hand.', 'Ugh, well played.', 'Fine. FINE.']
};

export function reaction(kind, rng) {
  const pool = REACTIONS[kind];
  if (!pool) return null;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}
