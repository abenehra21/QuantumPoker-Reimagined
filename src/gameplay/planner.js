/**
 * gameplay/planner.js — "what is the best way to spend this hand of cards?"
 *
 * One planner serves both the Hint button and every bot, so the hint is never
 * advice the machine would not take itself.
 *
 * The old five-card deck could be searched exhaustively. Forty cards with
 * arity up to three cannot: a six-card hand of Toffolis is 60^6 orderings.
 * So this is a beam search with a transposition table, and the beam width is
 * the difficulty dial — Casual thinks two moves wide, Quantum Master thinks
 * thirty-two. Same code, same rules, visibly different opponents.
 *
 * Collapse and the other random cards branch on their outcomes, weighted by
 * probability, up to a depth budget; past that they are evaluated by their
 * mean, which is exact for score and only approximate for the tiebreak.
 */
import { CARDS, legal } from './cards.js';
import { simulateCard } from './cards.js';
import { mulberry32 } from '../utils/rng.js';

const TARGET_CACHE = new Map();

/** Every legal target tuple of size k over n coins, minus frozen ones. */
function targetSets(n, k, blocked) {
  const key = n + ':' + k + ':' + (blocked && blocked.length ? blocked.join(',') : '');
  let hit = TARGET_CACHE.get(key);
  if (hit) return hit;
  const ok = [];
  for (let i = 0; i < n; i++) if (!blocked || !blocked.includes(i)) ok.push(i);
  const out = [];
  const build = (acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (const c of ok) {
      if (acc.includes(c)) continue;
      acc.push(c); build(acc); acc.pop();
    }
  };
  build([]);
  if (TARGET_CACHE.size > 400) TARGET_CACHE.clear();
  TARGET_CACHE.set(key, out);
  return out;
}

/**
 * How good is this board? Expected ones is the headline; the kicker is the
 * tiebreak (a 1 further left wins), scaled small enough that it never
 * outranks a whole extra point.
 */
export function evaluate(st, upTo) {
  const n = upTo === undefined ? st.n : upTo;
  let score = 0, kick = 0;
  for (let q = 0; q < n; q++) {
    const p = st.probOne(q);
    score += p;
    kick += p * Math.pow(2, n - 1 - q);
  }
  return { score, kicker: kick / Math.pow(2, n) };
}

/**
 * Difficulty presets. `width` is how many candidate moves survive move
 * ordering at each level; it is the only dial, and a bigger one is always at
 * least as good a player.
 */
export const SKILL = {
  casual:   { width: 2,  deep: 1, noise: 0.35, name: 'Casual' },
  student:  { width: 4,  deep: 2, noise: 0.15, name: 'Quantum Student' },
  master:   { width: 8,  deep: 3, noise: 0.02, name: 'Quantum Master' },
  perfect:  { width: 14, deep: 4, noise: 0,    name: 'Perfect' }
};

/**
 * Plan a line. Returns { value, kicker, used, line, first, gain }.
 *
 * This is expectimax over the hand: the player maximises at every choice, and
 * chance averages at every measurement. Writing it as a recursion rather than
 * a flat beam matters, because a measurement genuinely splits the future —
 * "Collapse, then Flip only if it landed wrong" is two different second moves
 * in two different worlds, and any structure that forces one line on both
 * worlds either undervalues the gamble or, worse, quietly lets the search bet
 * on the lucky branch.
 *
 * The search is kept affordable by move ordering: at each level only the
 * `width` most promising moves are explored, judged on the board they leave
 * immediately. `width` is therefore the difficulty dial, and a wider search
 * can never plan worse than a narrower one.
 *
 * opts: { upTo, skill, blocked, rng, memo }
 */
export function plan(state, hand, opts = {}) {
  const upTo = opts.upTo === undefined ? state.n : opts.upTo;
  const skill = opts.skill || SKILL.master;
  const blocked = opts.blocked || [];
  const rng = opts.rng || mulberry32(1);
  const memo = new Map();
  let nodes = 0;
  const BUDGET = 40000;

  /** Rank two outcomes: more expected ones, then fewer cards, then kicker. */
  const better = (a, b) => {
    if (!b) return true;
    if (a.value > b.value + 1e-9) return true;
    if (a.value < b.value - 1e-9) return false;
    if (a.used < b.used - 1e-9) return true;
    if (a.used > b.used + 1e-9) return false;
    return a.kicker > b.kicker + 1e-9;
  };

  /** Every legal move from here, each with the state it leaves. */
  function moves(st, hand) {
    const out = [];
    const tried = new Set();
    for (let i = 0; i < hand.length; i++) {
      const id = hand[i];
      if (tried.has(id)) continue;
      tried.add(id);
      const card = CARDS[id];
      if (!card) continue;
      const rest = hand.slice(); rest.splice(i, 1);
      const sets = card.arity === 0 ? [[]] : targetSets(st.n, card.arity, blocked);
      for (const t of sets) {
        if (!legal(id, t, st).ok) continue;
        const branches = split(st, id, t, rng);
        if (!branches || branches.every((b) => b.st.same(st))) continue;
        let v = 0, k = 0;
        for (const b of branches) {
          const ev = evaluate(b.st, upTo);
          v += ev.score * b.p; k += ev.kicker * b.p;
        }
        out.push({ card: id, targets: t.slice(), rest, branches, immediate: v, kicker: k });
      }
    }
    // Move ordering: the board a move leaves right now is a good enough guide
    // to which moves are worth thinking about further.
    out.sort((a, b) => (b.immediate - a.immediate) || (b.kicker - a.kicker));
    return out;
  }

  function search(st, hand, depth) {
    const stand = evaluate(st, upTo);
    let best = { value: stand.score, kicker: stand.kicker, used: 0, line: [] };
    if (!hand.length || depth >= 8 || nodes > BUDGET) return best;

    const key = st.hash() + '|' + hand.slice().sort().join(',') + '|' + depth;
    const hit = memo.get(key);
    if (hit) return hit;

    const width = depth === 0 ? skill.width : Math.max(2, Math.min(skill.width, skill.deep));
    const candidates = moves(st, hand).slice(0, width);

    for (const mv of candidates) {
      nodes++;
      let value = 0, kicker = 0, used = 0, follow = null, followWeight = -1;
      for (const b of mv.branches) {
        const sub = search(b.st, mv.rest, depth + 1);
        value += b.p * sub.value;
        kicker += b.p * sub.kicker;
        used += b.p * (1 + sub.used);
        if (b.p > followWeight) { followWeight = b.p; follow = sub.line; }
      }
      const cand = {
        value, kicker, used,
        line: [{ card: mv.card, targets: mv.targets }].concat(follow || [])
      };
      if (better(cand, best)) best = cand;
    }

    memo.set(key, best);
    return best;
  }

  const base = evaluate(state, upTo);
  let best = search(state, hand.slice(), 0);

  // A weaker opponent sometimes takes a line it can see is second best. This
  // is how Casual stays beatable without ever being given different rules.
  if (skill.noise > 0 && rng() < skill.noise) {
    const alts = moves(state, hand.slice());
    if (alts.length > 1) {
      const mv = alts[1 + Math.floor(rng() * Math.min(2, alts.length - 1))];
      if (mv) {
        let value = 0, kicker = 0;
        for (const b of mv.branches) { const ev = evaluate(b.st, upTo); value += ev.score * b.p; kicker += ev.kicker * b.p; }
        best = { value, kicker, used: 1, line: [{ card: mv.card, targets: mv.targets }] };
      }
    }
  }

  return {
    value: best.value, kicker: best.kicker, used: best.used,
    line: best.line, first: best.line.length ? best.line[0] : null,
    gain: best.value - base.score, nodes
  };
}

/**
 * Apply a card to a copy of the state, returning every possible result with
 * its probability. A card that measures returns both outcomes; everything
 * else returns one.
 *
 * The tempting optimisation is to sample a single outcome and move on. Do
 * not: one sample counted with weight 1 is a measurement line evaluated at
 * its lucky case, and the planner then overrates every Collapse in the deck.
 */
function split(st, id, targets, rng) {
  const card = CARDS[id];
  if (card.random && card.arity >= 1) {
    const q = targets[0];
    const p1 = st.probOne(q);
    if (p1 > 1e-6 && p1 < 1 - 1e-6) {
      const out = [];
      for (const [bit, p] of [[1, p1], [0, 1 - p1]]) {
        const s = st.clone();
        runCard(s, id, targets, forceBit(bit));
        out.push({ st: s, p });
      }
      return out;
    }
  }
  const s = st.clone();
  runCard(s, id, targets, rng);
  return [{ st: s, p: 1 }];
}

/** An rng that drives the next measurement to a chosen bit. */
function forceBit(bit) { return () => (bit ? 0 : 0.999999999); }

/** Run a card for planning. An illegal line simply scores nothing. */
function runCard(st, id, targets, rng) {
  try { simulateCard(st, id, targets, rng); } catch (e) { /* ignore */ }
}

/**
 * Plain-language description of a planned line, for the Hint tooltip and the
 * after-action report: "Twist coin 3, then Spin it."
 */
export function describeLine(line) {
  if (!line || !line.length) return 'Nothing here beats playing no cards at all.';
  const parts = line.map((p) => {
    const c = CARDS[p.card];
    if (!p.targets.length) return c.name;
    return `${c.name} ${p.targets.map((t) => 'coin ' + (t + 1)).join(' → ')}`;
  });
  return parts.length === 1 ? parts[0] + '.' : parts.slice(0, -1).join(', ') + ', then ' + parts[parts.length - 1] + '.';
}
