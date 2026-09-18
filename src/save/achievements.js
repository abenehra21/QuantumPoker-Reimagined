/**
 * save/achievements.js — forty things worth doing.
 *
 * Each achievement is a predicate over the profile plus the event that just
 * happened. Keeping them declarative means the game never has to remember to
 * check anything: it fires one `check()` after every hand and every round.
 *
 * `secret: true` hides the description until it unlocks.
 */

export const ACHIEVEMENTS = [
  // --- first steps ---
  { id: 'first_hand', name: 'First Light', icon: '●', tier: 1,
    blurb: 'Play a hand.', test: (p) => p.totals.hands >= 1 },
  { id: 'first_win', name: 'First Pot', icon: '◆', tier: 1,
    blurb: 'Win a hand.', test: (p) => p.totals.handsWon >= 1 },
  { id: 'first_gate', name: 'Gate Crasher', icon: 'X', tier: 1,
    blurb: 'Play your first gate card.', test: (p) => p.totals.gates >= 1 },
  { id: 'read_codex', name: 'Did The Reading', icon: '▤', tier: 1,
    blurb: 'Open every page of the Encyclopedia.', test: (p) => (p.codexRead || []).length >= 12 },
  { id: 'tutorial', name: 'Certified', icon: '✓', tier: 1,
    blurb: 'Finish the tutorial.', test: (p) => !!p.tutorialDone },

  // --- quantum literacy ---
  { id: 'interference', name: 'Constructive', icon: '∿', tier: 2,
    blurb: 'Turn a spinning coin into a certain 1 with Twist then Spin.',
    test: (p) => (p.flags.interferenceLine || 0) >= 1 },
  { id: 'bell_collector', name: 'Bell Collector', icon: '∞', tier: 2,
    blurb: 'Create 25 entangled pairs.', test: (p) => (p.totals.links || 0) >= 25 },
  { id: 'collapse_master', name: 'Collapse Master', icon: 'M', tier: 2,
    blurb: 'Measure 100 coins.', test: (p) => (p.totals.collapses || 0) >= 100 },
  { id: 'ghz', name: 'All Together Now', icon: '☢', tier: 3,
    blurb: 'Entangle all five coins at once.', test: (p) => (p.flags.ghz || 0) >= 1 },
  { id: 'teleported', name: 'No Faster Than Light', icon: '⟶', tier: 3,
    blurb: 'Complete a teleportation.', test: (p) => (p.flags.teleport || 0) >= 1 },
  { id: 'grover_genius', name: 'Grover Genius', icon: 'G', tier: 3,
    blurb: 'Win a hand on the turn Grover was played.', test: (p) => (p.flags.groverWin || 0) >= 1 },
  { id: 'deutsch', name: 'One Question', icon: '⊕', tier: 2,
    blurb: 'Use Parity Read and then win the hand.', test: (p) => (p.flags.deutschWin || 0) >= 1 },
  { id: 'fourier', name: 'Frequency Domain', icon: 'ℱ', tier: 3,
    blurb: 'Play Fourier and still win.', test: (p) => (p.flags.qftWin || 0) >= 1 },
  { id: 'all_gates', name: 'Complete Set', icon: '✳', tier: 3,
    blurb: 'Play all forty cards at least once.', test: (p) => Object.keys(p.gateCounts || {}).length >= 40 },
  { id: 'zeno', name: 'A Watched Pot', icon: '⌛', tier: 2,
    blurb: 'Freeze a certain 1 and take it to showdown.', test: (p) => (p.flags.zenoHeld || 0) >= 1 },

  // --- hands ---
  { id: 'coherence', name: 'Coherence', icon: '◈', tier: 2,
    blurb: 'Land all five coins on 1.', test: (p) => (p.totals.coherences || 0) >= 1 },
  { id: 'coherence_10', name: 'Quantum Royal Flush', icon: '✦', tier: 4,
    blurb: 'Land Coherence ten times.', test: (p) => (p.totals.coherences || 0) >= 10 },
  { id: 'lucky_11111', name: 'Lucky 11111', icon: '1', tier: 3,
    blurb: 'Win with Coherence without playing a single card.', test: (p) => (p.flags.freeCoherence || 0) >= 1 },
  { id: 'blank', name: 'Absolute Zero', icon: '0', tier: 2,
    blurb: 'Go to showdown with zero coins on 1, and win anyway.', test: (p) => (p.flags.wonWithBlank || 0) >= 1 },
  { id: 'kicker', name: 'Left Of The Decimal', icon: '◀', tier: 2,
    blurb: 'Win a tied showdown on the kicker.', test: (p) => (p.flags.kickerWin || 0) >= 1 },
  { id: 'split', name: 'Indistinguishable', icon: '=', tier: 2,
    blurb: 'Split a pot three ways.', test: (p) => (p.flags.threeWaySplit || 0) >= 1 },

  // --- poker ---
  { id: 'bluff', name: 'Bluff Scientist', icon: '◑', tier: 2,
    blurb: 'Win a pot after raising with the worst board at the table.',
    test: (p) => (p.flags.bluffWin || 0) >= 1 },
  { id: 'bluff_10', name: 'Reputation', icon: '◕', tier: 3,
    blurb: 'Win ten pots by bluffing.', test: (p) => (p.flags.bluffWin || 0) >= 10 },
  { id: 'allin', name: 'Everything', icon: '▲', tier: 2,
    blurb: 'Win an all-in.', test: (p) => (p.flags.allinWin || 0) >= 1 },
  { id: 'comeback', name: 'Tunnelled Through', icon: '↗', tier: 3,
    blurb: 'Win a round after dropping below a tenth of your starting chips.',
    test: (p) => (p.flags.comeback || 0) >= 1 },
  { id: 'sidepot', name: 'Pot Committed', icon: '⊞', tier: 3,
    blurb: 'Win a side pot.', test: (p) => (p.flags.sidePotWin || 0) >= 1 },
  { id: 'hands_100', name: 'Regular', icon: '○', tier: 2,
    blurb: 'Play 100 hands.', test: (p) => p.totals.hands >= 100 },
  { id: 'hands_1000', name: 'Resident', icon: '●', tier: 4,
    blurb: 'Play 1000 hands.', test: (p) => p.totals.hands >= 1000 },

  // --- runs and bosses ---
  { id: 'round_5', name: 'Past The First Gate', icon: '5', tier: 2,
    blurb: 'Reach round 5 of an Endless run.', test: (p) => (p.best.round || 0) >= 5 },
  { id: 'round_10', name: 'Deep Circuit', icon: '10', tier: 3,
    blurb: 'Reach round 10.', test: (p) => (p.best.round || 0) >= 10 },
  { id: 'round_20', name: 'Fault Tolerant', icon: '20', tier: 4,
    blurb: 'Reach round 20.', test: (p) => (p.best.round || 0) >= 20 },
  { id: 'boss_1', name: 'Boxed', icon: '◐', tier: 2,
    blurb: 'Beat Schrödinger.', test: (p) => (p.bosses || []).includes('schrodinger') },
  { id: 'boss_all', name: 'Full House', icon: '⚔', tier: 4,
    blurb: 'Beat every boss.', test: (p) => (p.bosses || []).length >= 6 },
  { id: 'decoherence_survivor', name: 'Decoherence Survivor', icon: '✳', tier: 3,
    blurb: 'Win a round in Chaos mode without a single noise event touching you.',
    test: (p) => (p.flags.cleanChaos || 0) >= 1 },
  { id: 'nisq', name: 'Beat The Machine', icon: '⊟', tier: 4,
    blurb: 'Beat NISQ without Error Mitigation or Surface Code.',
    test: (p) => (p.flags.beatNisqHonestly || 0) >= 1 },

  // --- collection ---
  { id: 'relic_5', name: 'Collector', icon: '◇', tier: 2,
    blurb: 'Own five relics in one run.', test: (p) => (p.best.relics || 0) >= 5 },
  { id: 'relic_legendary', name: 'Unique', icon: '★', tier: 3,
    blurb: 'Own a legendary relic.', test: (p) => (p.flags.legendaryRelic || 0) >= 1 },
  { id: 'deck_slim', name: 'Minimalist', icon: '—', tier: 3,
    blurb: 'Finish a round with eight cards or fewer in your deck.',
    test: (p) => (p.flags.slimDeck || 0) >= 1 },
  { id: 'cosmetics', name: 'Well Appointed', icon: '◆', tier: 3,
    blurb: 'Unlock eight cosmetics.', test: (p) => (p.cosmetics || []).length >= 8 },

  // --- daily and secrets ---
  { id: 'daily_1', name: 'Today’s Deal', icon: '☀', tier: 1,
    blurb: 'Finish a Daily Deal.', test: (p) => (p.daily.played || 0) >= 1 },
  { id: 'daily_7', name: 'A Week Of It', icon: '☵', tier: 3,
    blurb: 'A seven-day Daily streak.', test: (p) => (p.daily.bestStreak || 0) >= 7 },
  { id: 'infinite_superposition', name: 'Infinite Superposition', icon: '∞', tier: 4, secret: true,
    blurb: 'Reach showdown with all five coins still spinning.',
    test: (p) => (p.flags.allSpinning || 0) >= 1 },
  { id: 'sandbox_hour', name: 'Just Playing', icon: '◎', tier: 2, secret: true,
    blurb: 'Spend an hour in the Sandbox.', test: (p) => (p.totals.sandboxSeconds || 0) >= 3600 },
  { id: 'no_hint', name: 'Unassisted', icon: '○', tier: 3, secret: true,
    blurb: 'Clear five rounds in a run without pressing Hint.',
    test: (p) => (p.flags.noHintRun || 0) >= 5 }
];

export const ACHIEVEMENT_IDS = ACHIEVEMENTS.map((a) => a.id);

/** Newly unlocked ids, given a profile. */
export function check(profile) {
  const have = new Set(profile.achievements || []);
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    let ok = false;
    try { ok = !!a.test(profile); } catch (e) { ok = false; }
    if (ok) { fresh.push(a.id); have.add(a.id); }
  }
  profile.achievements = Array.from(have);
  return fresh.map((id) => ACHIEVEMENTS.find((a) => a.id === id));
}

export function progress(profile) {
  const have = new Set(profile.achievements || []);
  return { got: have.size, total: ACHIEVEMENTS.length, pct: have.size / ACHIEVEMENTS.length };
}
