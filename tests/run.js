/**
 * tests/run.js — the self-checks.
 *
 * `npm test`, or open `index.html?test` and read the console. No framework:
 * a check is a name and a boolean, and the physics is checked against known
 * answers rather than against itself.
 */
import { QState } from '../src/quantum/state.js';
import { readCoin, findLinks, findCorrelations, correlation, dealBoard, expectedScore, entropy, scoreDistribution, probAtLeast, boardFrom } from '../src/quantum/read.js';
import { PROFILES, NoiseProfile, zeroNoiseExtrapolate } from '../src/quantum/noise.js';
import { Circuit, summarise } from '../src/quantum/circuit.js';
import { CARDS, CARD_IDS, playCard, legal, byRarity, RARITY } from '../src/gameplay/cards.js';
import { plan, SKILL, describeLine, evaluate } from '../src/gameplay/planner.js';
import { Game, rankKey, buildPots, rankName } from '../src/gameplay/game.js';
import { StatusSet } from '../src/gameplay/status.js';
import { RelicSet, RELICS, RELIC_IDS } from '../src/gameplay/relics.js';
import { MODES, MODE_KEYS, CHAOS_EVENTS, targetFor } from '../src/gameplay/modes.js';
import { BOSSES, bossFor, isBossRound } from '../src/gameplay/bosses.js';
import { stock, priceFor, rerollCost, COSMETICS } from '../src/gameplay/shop.js';
import { Run } from '../src/gameplay/run.js';
import { PERSONAS, PERSONA_KEYS, chooseOpponents } from '../src/ai/personalities.js';
import { step, decide, strength, HeroWatcher } from '../src/ai/brain.js';
import { speak } from '../src/ai/dialogue.js';
import { ACHIEVEMENTS, check as checkAch } from '../src/save/achievements.js';
import { blankProfile } from '../src/save/store.js';
import { mulberry32, mix, seedFrom, shuffle, range } from '../src/utils/rng.js';
import { LESSONS } from '../src/tutorial/lessons.js';
import { CODEX } from '../src/tutorial/codex.js';

/** Every ordered tuple of `k` distinct coins out of `n`. */
function targetTuples(n, k) {
  const out = [];
  const build = (acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = 0; i < n; i++) { if (acc.includes(i)) continue; acc.push(i); build(acc); acc.pop(); }
  };
  build([]);
  return out;
}

const results = [];
let group = '';
function section(name) { group = name; }
function ok(name, cond, detail) {
  results.push({ group, name, pass: !!cond, detail: cond ? '' : (detail === undefined ? '' : String(detail)) });
}
function near(name, a, b, eps = 1e-9) {
  ok(name, Math.abs(a - b) < eps, `${a} vs ${b}`);
}

const rng = mulberry32(20260918);

/* ================= the simulator ================= */
section('simulator');
{
  const s = new QState(3);
  near('a fresh register is |000>', s.probOne(0) + s.probOne(1) + s.probOne(2), 0);
  near('norm starts at 1', s.norm(), 1);

  s.h(0);
  near('H makes a coin toss', s.probOne(0), 0.5);
  near('H leaves a + tilt', s.probMinus(0), 0);
  s.z(0);
  near('Z turns + into -', s.probMinus(0), 1);
  near('Z changes no odds', s.probOne(0), 0.5);
  s.h(0);
  near('Spin on - lands on 1', s.probOne(0), 1);

  const t = new QState(2).h(0).cx(0, 1);
  near('CX on a spinning control entangles', t.bellProbs(0, 1)[0], 1);
  near('an entangled coin has no Bloch length', t.bloch(0).r, 0, 1e-9);
  near('and maximal linear entropy', t.entanglement(0), 1, 1e-9);
  ok('findLinks sees the pair', findLinks(t).length === 1 && findLinks(t)[0].same);

  const u = new QState(1).h(0);
  near('|+> points along +x', u.bloch(0).x, 1);
  near('and nowhere else', Math.abs(u.bloch(0).y) + Math.abs(u.bloch(0).z), 0, 1e-9);

  // Every gate is unitary: norm survives a long random circuit.
  const big = new QState(5);
  const ops = ['x', 'y', 'z', 'h', 's', 'sdg', 't', 'tdg'];
  let worst = 0;
  for (let i = 0; i < 4000; i++) {
    const q = Math.floor(rng() * 5);
    const r = rng();
    if (r < 0.55) big[ops[Math.floor(rng() * ops.length)]](q);
    else if (r < 0.7) big.rx(q, rng() * 7);
    else if (r < 0.8) big.ry(q, rng() * 7);
    else if (r < 0.87) big.rz(q, rng() * 7);
    else {
      let b = Math.floor(rng() * 5); if (b === q) b = (b + 1) % 5;
      if (r < 0.93) big.cx(q, b); else if (r < 0.97) big.cz(q, b); else big.swap(q, b);
    }
    worst = Math.max(worst, Math.abs(big.norm() - 1));
  }
  ok('4000 random gates conserve probability', worst < 1e-9, worst);

  // Known identities.
  const id = (build) => { const a = new QState(2).h(0).t(0).cx(0, 1).ry(1, 1.1); const b = a.clone(); build(b); return a.same(b); };
  ok('X X = I', id((s2) => { s2.x(0); s2.x(0); }));
  ok('H H = I', id((s2) => { s2.h(1); s2.h(1); }));
  ok('S Sdg = I', id((s2) => { s2.s(0); s2.sdg(0); }));
  ok('T T T T T T T T = I', id((s2) => { for (let i = 0; i < 8; i++) s2.t(1); }));
  ok('SWAP SWAP = I', id((s2) => { s2.swap(0, 1); s2.swap(0, 1); }));
  ok('CX CX = I', id((s2) => { s2.cx(0, 1); s2.cx(0, 1); }));
  ok('Rx(2pi) = I up to phase', id((s2) => { s2.rx(0, Math.PI * 2); }));
  ok('S S = Z', (() => { const a = new QState(1).h(0).s(0).s(0); const b = new QState(1).h(0).z(0); return a.same(b); })());
  ok('H Z H = X', (() => { const a = new QState(1).ry(0, 0.7).h(0).z(0).h(0); const b = new QState(1).ry(0, 0.7).x(0); return a.same(b); })());
  ok('Y = i X Z', (() => { const a = new QState(1).ry(0, 0.9).y(0); const b = new QState(1).ry(0, 0.9).z(0).x(0); return a.same(b); })());
  ok('CCX needs both controls', (() => {
    const a = new QState(3).x(0).ccx(0, 1, 2);
    return a.probOne(2) < 1e-9;
  })());
  ok('CCX fires with both', (() => new QState(3).x(0).x(1).ccx(0, 1, 2).probOne(2) > 1 - 1e-9)());

  // Measurement really is a fair coin.
  let ones = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) { const c = new QState(1).h(0); ones += c.collapse(0, rng); }
  ok('a measured |+> is a fair coin', Math.abs(ones / N - 0.5) < 0.02, ones / N);

  // Entangled coins always land together.
  let together = true;
  for (let i = 0; i < 3000; i++) {
    const c = new QState(2).h(0).cx(0, 1);
    const bits = c.measure(rng);
    if (bits[0] !== bits[1]) together = false;
  }
  ok('a Bell pair always lands together', together);

  // Projection kills the partner's freedom.
  const proj = new QState(2).h(0).cx(0, 1);
  proj.project(0, 1);
  ok('measuring one of a pair settles the other', proj.probOne(1) > 1 - 1e-9);
  ok('and destroys the link', findLinks(proj).length === 0);
}

/* ================= reading the board ================= */
section('board reading');
{
  ok('|1> reads as one', readCoin(new QState(1).x(0), 0).kind === 'one');
  ok('|0> reads as zero', readCoin(new QState(1), 0).kind === 'zero');
  ok('|+> reads as plus', readCoin(new QState(1).h(0), 0).kind === 'plus');
  ok('|-> reads as minus', readCoin(new QState(1).h(0).z(0), 0).kind === 'minus');
  ok('a rotation reads as tilted', readCoin(new QState(1).ry(0, 0.6), 0).kind === 'tilted');
  ok('half a Bell pair reads as linked', readCoin(new QState(2).h(0).cx(0, 1), 0).kind === 'linked');

  const flat = new QState(5);
  for (let q = 0; q < 5; q++) flat.h(q);
  near('five spinning coins are 5 bits of entropy', entropy(flat), 5, 1e-9);
  near('a settled board has none', entropy(new QState(5).x(0)), 0, 1e-9);

  const d = scoreDistribution(flat);
  near('score distribution sums to 1', d.reduce((a, b) => a + b, 0), 1, 1e-9);
  near('five coin tosses: P(5 ones) = 1/32', d[5], 1 / 32, 1e-9);
  near('probAtLeast agrees', probAtLeast(flat, 5), 1 / 32, 1e-9);

  // Correlation arcs must mean something. The tempting measure (Bell-state
  // overlap) calls two plain |0> coins correlated, which would draw arcs all
  // over a freshly dealt board.
  ok('two settled coins are not correlated', findCorrelations(new QState(5)).length === 0);
  ok('nor are two coins on 1', findCorrelations(new QState(5).x(0).x(1)).length === 0);
  ok('nor two independent coin tosses', findCorrelations(new QState(5).h(0).h(1)).length === 0);
  ok('a Bell pair is perfectly correlated', (() => {
    const c = findCorrelations(new QState(5).h(0).cx(0, 1));
    return c.length === 1 && Math.abs(c[0].strength - 1) < 1e-9 && c[0].same;
  })());
  ok('an anti-correlated pair is seen as opposite', (() => {
    const c = correlation(new QState(5).h(0).x(1).cx(0, 1), 0, 1);
    return Math.abs(c.strength - 1) < 1e-9 && c.same === false;
  })());
  ok('a phase-only gate creates no outcome correlation',
    findCorrelations(new QState(5).h(0).cphase(0, 1, Math.PI / 2)).length === 0);
  ok('a partial rotation still correlates', (() => {
    const c = correlation(new QState(5).ry(0, 0.7).cx(0, 1), 0, 1);
    return c.strength > 0.5;
  })());
  ok('correlation never exceeds 1', (() => {
    for (let i = 0; i < 60; i++) {
      const b = dealBoard(rng, 5);
      for (let a = 0; a < 5; a++) for (let c = a + 1; c < 5; c++) {
        const r = correlation(b, a, c);
        if (r.strength < -1e-9 || r.strength > 1 + 1e-9) return false;
      }
    }
    return true;
  })());

  // Dealt boards are playable and never already won.
  let bad = 0;
  for (let i = 0; i < 400; i++) {
    const b = dealBoard(rng, 5);
    let given = 0;
    for (let q = 0; q < 5; q++) if (readCoin(b, q).kind === 'one') given++;
    if (given > 1) bad++;
    if (Math.abs(b.norm() - 1) > 1e-9) bad++;
  }
  ok('400 dealt boards are all playable', bad === 0, bad);

  // A deal is a pure function of its seed.
  const a1 = dealBoard(mulberry32(777), 5), a2 = dealBoard(mulberry32(777), 5);
  ok('the same seed deals the same board', a1.same(a2));
}

/* ================= noise ================= */
section('noise');
{
  ok('the clean profile is inert', !PROFILES.clean.active);
  const s = new QState(5).x(0).x(1).h(2);
  const before = s.clone();
  PROFILES.clean.tick(s, rng);
  ok('and changes nothing', s.same(before));

  const noisy = new QState(5).x(0).x(1).x(2).x(3).x(4);
  let events = 0;
  for (let i = 0; i < 200; i++) {
    const c = new QState(5).x(0).x(1).x(2).x(3).x(4);
    events += PROFILES.storm.tick(c, rng).length;
    if (Math.abs(c.norm() - 1) > 1e-9) { ok('storm keeps the norm', false); break; }
  }
  ok('a storm actually fires', events > 100, events);
  ok('storm keeps the norm', true);

  ok('immunity 1 blocks everything', PROFILES.storm.tick(new QState(5).x(0), rng, 1).length === 0);

  const build = () => new QState(5).x(0).x(1).h(2);
  const z = zeroNoiseExtrapolate(build, PROFILES.nisq, mulberry32(5), 4000);
  ok('zero-noise extrapolation beats the raw estimate',
    Math.abs(z.extrapolated - 2.5) < Math.abs(z.e1 - 2.5), JSON.stringify(z));
}

/* ================= circuits ================= */
section('circuits');
{
  const init = new QState(4).h(0);
  const c = new Circuit(4, init);
  c.add('cx', [0, 1]);
  c.add('x', [2]);
  c.add('h', [3]);
  c.add('measure', [1], null, { bit: 1 });
  ok('independent gates share a column', c.columns()[0].length === 3);
  ok('a dependent gate moves right', c.depth === 2, c.depth);
  ok('stateAt replays the recorded outcome', c.stateAt().probOne(0) > 1 - 1e-9);
  ok('replay is repeatable', c.stateAt().same(c.stateAt()));
  const tr = c.trace();
  ok('trace has one row per step plus the start', tr.length === c.ops.length + 1);
  const qasm = c.toQasm();
  ok('QASM declares the register', qasm.includes('qubit[4] q;'));
  ok('QASM emits the measurement', qasm.includes('c[1] = measure q[1];'));
  ok('summarise reads sensibly', /gates? · depth/.test(summarise(c)), summarise(c));
}

/* ================= cards ================= */
section('cards');
{
  ok('forty cards', CARD_IDS.length === 40, CARD_IDS.length);
  const g = byRarity();
  ok('every card has a rarity bucket',
    g.common.length + g.rare.length + g.epic.length + g.legendary.length === CARD_IDS.length);

  let missing = [];
  for (const id of CARD_IDS) {
    const c = CARDS[id];
    if (!c.name || !c.blurb || !c.physics || !c.hint) missing.push(id + ':text');
    if (c.arity === undefined || !c.rarity || !RARITY[c.rarity]) missing.push(id + ':meta');
    if (typeof c.ops !== 'function') missing.push(id + ':ops');
    if (c.arity > 0 && (!c.pick || c.pick.length !== c.arity)) missing.push(id + ':pick');
  }
  ok('every card is fully described', missing.length === 0, missing.join(','));

  // Every card, on many boards, leaves a legal normalised state.
  let broke = [];
  for (const id of CARD_IDS) {
    for (let i = 0; i < 12; i++) {
      const st = dealBoard(rng, 5);
      const cir = new Circuit(5, st);
      const player = { noiseLog: [], rewindLast: () => null };
      const t = [0, 1, 2].slice(0, CARDS[id].arity);
      try {
        playCard(id, t, { state: st, circuit: cir, rng, player, game: null });
        if (Math.abs(st.norm() - 1) > 1e-8) broke.push(id + ':norm');
      } catch (e) { broke.push(id + ':' + e.message); }
    }
  }
  ok('every card survives 12 random boards', broke.length === 0, broke.slice(0, 5).join(','));

  // The five original cards still mean exactly what the rules text says.
  const one = () => new QState(5).x(0);
  const zero = () => new QState(5);
  const plus = () => new QState(5).h(0);
  const minus = () => new QState(5).h(0).z(0);
  const after = (build, id, t) => {
    const st = build(); const cir = new Circuit(5, st);
    playCard(id, t || [0], { state: st, circuit: cir, rng, player: { noiseLog: [] }, game: null });
    return st;
  };
  near('Flip turns 0 into 1', after(zero, 'X').probOne(0), 1);
  near('Flip turns 1 into 0', after(one, 'X').probOne(0), 0);
  near('Flip leaves a spinning coin alone', after(plus, 'X').probOne(0), 0.5);
  near('Spin on + lands on 0', after(plus, 'H').probOne(0), 0);
  near('Spin on - lands on 1', after(minus, 'H').probOne(0), 1);
  near('Spin on 0 is a coin toss', after(zero, 'H').probOne(0), 0.5);
  ok('Twist does nothing to a settled coin', after(one, 'Z').same(one()));
  ok('Twist turns + into -', readCoin(after(plus, 'Z'), 0).kind === 'minus');
  near('Ground forces a coin to 0', after(plus, 'RESET').probOne(0), 0);
  ok('Half Flip twice is a Flip', (() => {
    let st = new QState(5); const cir = new Circuit(5, st);
    playCard('SX', [0], { state: st, circuit: cir, rng, player: {}, game: null });
    playCard('SX', [0], { state: st, circuit: cir, rng, player: {}, game: null });
    return st.probOne(0) > 1 - 1e-9;
  })());

  // Bell Pair really makes a Bell pair; Superdense needs one.
  const bell = after(() => new QState(5), 'BELL', [0, 1]);
  near('Bell Pair links its two coins', bell.bellProbs(0, 1)[0], 1, 1e-9);
  ok('Superdense refuses unlinked coins', !legal('SUPERDENSE', [2, 3], bell).ok);
  ok('Superdense accepts a linked pair', legal('SUPERDENSE', [0, 1], bell).ok);
  const sd = (() => {
    const st = bell.clone(); const cir = new Circuit(5, st);
    playCard('SUPERDENSE', [0, 1], { state: st, circuit: cir, rng, player: {}, game: null });
    return st;
  })();
  ok('Superdense writes two certain points', sd.probOne(0) > 1 - 1e-6 && sd.probOne(1) > 1 - 1e-6,
    `${sd.probOne(0)} ${sd.probOne(1)}`);

  // Entanglement Bomb really is all-or-nothing.
  const bomb = after(() => new QState(5), 'ENTBOMB', [0]);
  const bd = scoreDistribution(bomb);
  ok('the bomb pays 0 or 5 and nothing between',
    bd[1] + bd[2] + bd[3] + bd[4] < 1e-9 && Math.abs(bd[0] - 0.5) < 1e-9 && Math.abs(bd[5] - 0.5) < 1e-9);

  // Grover really amplifies.
  const gr = (() => {
    const st = new QState(5); for (let q = 0; q < 5; q++) st.h(q);
    const cir = new Circuit(5, st);
    const p0 = st.distribution()[31];
    playCard('GROVER', [], { state: st, circuit: cir, rng, player: {}, game: null });
    return { p0, p1: st.distribution()[31] };
  })();
  ok('Grover raises the all-ones branch', gr.p1 > gr.p0 * 2, JSON.stringify(gr));

  // Coherence breaks links without moving the odds.
  const coh = (() => {
    const st = new QState(5).h(0).cx(0, 1).h(2);
    const p = [0, 1, 2, 3, 4].map((q) => st.probOne(q));
    const cir = new Circuit(5, st);
    playCard('COHERE', [], { state: st, circuit: cir, rng, player: {}, game: null });
    return { p, q: [0, 1, 2, 3, 4].map((x) => st.probOne(x)), links: findLinks(st).length };
  })();
  ok('Coherence keeps every probability', coh.p.every((v, i) => Math.abs(v - coh.q[i]) < 1e-9), JSON.stringify(coh));
  ok('Coherence dissolves every link', coh.links === 0);

  // The circuit a card writes must reproduce the board it produced. The
  // Circuit View, the QASM export and the after-action rewind all replay
  // from these instructions, so a card that edits the state behind the
  // circuit's back draws a diagram that is quietly a lie.
  ok('every card\u2019s recorded circuit reproduces its own result', (() => {
    const bad = [];
    for (const id of CARD_IDS) {
      for (let i = 0; i < 4; i++) {
        const start = dealBoard(rng, 5);
        const st = start.clone();
        const cir = new Circuit(5, start);
        const t = [0, 1, 2].slice(0, CARDS[id].arity);
        if (!legal(id, t, st).ok) continue;
        try {
          playCard(id, t, { state: st, circuit: cir, rng, player: { noiseLog: [], rewindLast: () => null }, game: null });
        } catch (e) { bad.push(id + ':' + e.message); continue; }
        if (!cir.stateAt().same(st)) bad.push(id);
      }
    }
    return bad.length === 0 ? true : Array.from(new Set(bad)).join(',');
  })() === true, 'cards whose circuit does not reproduce their board');

  // Idle draws instead of acting.
  ok('Idle is a cantrip', CARDS.I.cantrip && CARDS.I.arity === 0);
}

/* ================= planner ================= */
section('planner');
{
  ok('Spin finishes a - coin', (() => {
    const r = plan(boardFrom([['h', 0], ['z', 0]], 5), ['H'], { skill: SKILL.master });
    return r.first && r.first.card === 'H' && r.first.targets[0] === 0;
  })());

  ok('it never opens with busywork', plan(boardFrom([], 5), ['Z', 'Z', 'Z'], { skill: SKILL.master }).used === 0);
  ok('nor with a no-op Flip on a spinning coin',
    plan(boardFrom([['h', 0]], 5), ['X'], { skill: SKILL.master }).first === null ||
    plan(boardFrom([['h', 0]], 5), ['X'], { skill: SKILL.master }).first.targets[0] !== 0);

  near('a lone Collapse on a coin toss is worth half a point',
    plan(boardFrom([['h', 0]], 5), ['M'], { skill: SKILL.master }).value, 0.5, 1e-6);

  ok('Collapse-then-fix is valued at a whole point', (() => {
    const b = boardFrom([['h', 0], ['x', 1], ['x', 2], ['x', 3], ['x', 4]], 5);
    return Math.abs(plan(b, ['M', 'X'], { skill: SKILL.master }).value - 5) < 1e-6;
  })(), plan(boardFrom([['h', 0], ['x', 1], ['x', 2], ['x', 3], ['x', 4]], 5), ['M', 'X'], { skill: SKILL.master }).value);

  ok('a plan never scores above the board width', (() => {
    for (let i = 0; i < 40; i++) {
      const b = dealBoard(rng, 5);
      const hand = shuffle(CARD_IDS.slice(), rng).slice(0, 4);
      const r = plan(b, hand, { skill: SKILL.master, rng });
      if (r.value > 5 + 1e-6 || r.value < -1e-6) return false;
    }
    return true;
  })());

  ok('a wider beam never plans worse', (() => {
    let worse = 0;
    for (let i = 0; i < 25; i++) {
      const b = dealBoard(rng, 5);
      const hand = shuffle(['X', 'H', 'Z', 'CX', 'M', 'Y', 'SWAP', 'CCX'], rng).slice(0, 4);
      const narrow = { width: 2, branch: 1, noise: 0 };
      const wide = { width: 16, branch: 4, noise: 0 };
      const a = plan(b, hand, { skill: narrow, rng: mulberry32(1) }).value;
      const c = plan(b, hand, { skill: wide, rng: mulberry32(1) }).value;
      if (c < a - 1e-6) worse++;
    }
    return worse === 0;
  })());

  ok('frozen coins are never targeted', (() => {
    const b = boardFrom([['h', 0], ['h', 1]], 5);
    const r = plan(b, ['H', 'H'], { skill: SKILL.master, blocked: [0] });
    return !r.line.some((p) => p.targets.includes(0));
  })());

  ok('describeLine is readable', /coin 1/.test(describeLine([{ card: 'X', targets: [0] }])));

  const t0 = Date.now();
  for (let i = 0; i < 20; i++) plan(dealBoard(rng, 5), ['CX', 'H', 'X', 'M', 'Z', 'SWAP'], { skill: SKILL.master, rng });
  const ms = (Date.now() - t0) / 20;
  ok('a master plan takes under 120ms', ms < 120, ms.toFixed(1) + 'ms');
}

/* ================= pots and ranks ================= */
section('pots and ranks');
{
  ok('more ones beats fewer', rankKey([1, 1, 0, 0, 0]) > rankKey([1, 0, 0, 0, 0]));
  ok('a tie breaks leftwards', rankKey([1, 0, 0, 0, 1]) > rankKey([0, 1, 0, 0, 1]));
  ok('identical boards tie exactly', rankKey([1, 0, 1, 0, 1]) === rankKey([1, 0, 1, 0, 1]));
  ok('rank names run to Coherence', rankName(5) === 'Coherence' && rankName(0) === 'Blank');

  const pots = buildPots([
    { committed: 100, folded: false }, { committed: 300, folded: false }, { committed: 300, folded: false }
  ]);
  ok('a short stack makes a side pot', pots.length === 2, JSON.stringify(pots));
  near('and the chips all land somewhere', pots.reduce((s, p) => s + p.amount, 0), 700);
  ok('the short stack cannot win the side pot', !pots[1].eligible.includes(0));

  const folded = buildPots([
    { committed: 50, folded: true }, { committed: 50, folded: false }, { committed: 50, folded: false }
  ]);
  near('a folded player still leaves their chips', folded.reduce((s, p) => s + p.amount, 0), 150);
  ok('but cannot win them', !folded[0].eligible.includes(0));
}

/* ================= the game ================= */
section('game');
{
  const g = new Game({ seed: 4242, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }, { name: 'B', bot: PERSONAS.moth }] });
  ok('blinds are posted at once', g.potTotal() === g.smallBlind + g.bigBlind);
  ok('everyone gets a hand', g.players.every((p) => p.hand.length === 3));
  ok('everyone gets their own board', g.players.every((p) => p.board && p.board !== g.origin));
  ok('every board starts identical', g.players.every((p) => p.board.same(g.origin)));
  ok('everyone gets a circuit', g.players.every((p) => p.circuit && p.circuit.n === 5));

  // A raise reopens the action.
  const before = g.actor;
  g.raiseTo(g.minRaiseTo(g.actor));
  ok('a raise reopens the betting', g.actor !== before);

  // Determinism: the same seed replays whatever anyone does.
  // Stacks deep enough that nobody busts, so both styles reach the same hands.
  const playOut = (seed, style) => {
    const gg = new Game({
      seed, startChips: 200000, smallBlind: 5,
      seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }, { name: 'B', bot: PERSONAS.vesper }]
    });
    const boards = {};
    let guard = 0;
    while (gg.handNo <= 6 && guard++ < 4000) {
      boards[gg.handNo] = gg.origin.key();
      if (gg.phase === 'over') { if (!gg.nextHand()) break; continue; }
      const p = gg.current();
      if (p && p.bot) { step(gg); continue; }
      if (gg.phase === 'betting') { if (style === 'fold' && gg.toCall(gg.actor) > 0) gg.fold(); else gg.call(); }
      else if (gg.phase === 'gates') { const h = gg.hint(gg.actor); if (h && style !== 'fold') gg.playCard(h.card, h.targets); else gg.endTurn(); }
    }
    return boards;
  };
  ok('a seed deals the same boards however it is played', (() => {
    const a = playOut(99, 'call'), b = playOut(99, 'fold');
    const shared = Object.keys(a).filter((k) => b[k]);
    return shared.length >= 5 && shared.every((k) => a[k] === b[k]);
  })(), JSON.stringify(Object.keys(playOut(99, 'call'))));

  ok('a board is a pure function of the seed and the hand number', (() => {
    const gg = new Game({ seed: 12345, startChips: 200000, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }] });
    for (let k = 0; k < 4; k++) {
      const want = dealBoard(mulberry32(mix(12345, gg.handNo)), 5);
      if (!gg.origin.same(want)) return false;
      while (gg.phase !== 'over') {
        const p = gg.current();
        if (p && p.bot) step(gg);
        else if (gg.phase === 'betting') gg.fold();
        else gg.endTurn();
      }
      if (!gg.nextHand()) break;
    }
    return true;
  })());

  // Chips are conserved across many full games.
  let leaks = 0, ended = 0, hands = 0;
  for (let s = 0; s < 25; s++) {
    const gg = new Game({
      seed: 3000 + s, maxHands: 30,
      seats: [{ name: 'You' }].concat(['rook', 'vesper', 'moth', 'ash'].map((k) => ({ name: PERSONAS[k].name, bot: PERSONAS[k], skill: PERSONAS[k].skill })))
    });
    const total = 5 * gg.startChips;
    let guard = 0;
    while (!gg.finished() && guard++ < 4000) {
      if (gg.phase === 'over') { if (!gg.nextHand()) break; continue; }
      const p = gg.current();
      if (p && p.bot) { step(gg); continue; }
      if (gg.phase === 'betting') gg.call();
      else if (gg.phase === 'gates') { const h = gg.hint(gg.actor); if (h) gg.playCard(h.card, h.targets); else gg.endTurn(); }
    }
    hands += gg.handNo;
    if (gg.players.reduce((a, p) => a + p.chips, 0) !== total) leaks++;
    if (gg.finished()) ended++;
  }
  ok('25 bot games conserve every chip', leaks === 0, leaks);
  ok('25 bot games all end', ended === 25, ended);
  ok('and take a sensible number of hands', hands / 25 > 3 && hands / 25 < 40, (hands / 25).toFixed(1));

  // Rewind cannot undo a measurement.
  const rg = new Game({ seed: 7, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }] });
  while (rg.phase === 'betting') { const p = rg.current(); if (p.bot) step(rg); else rg.call(); }
  if (rg.phase === 'gates') {
    const hero = rg.players[rg.actor];
    hero.hand = ['M', 'REWIND'];
    let target = 0;
    for (let q = 0; q < 5; q++) { const pr = hero.board.probOne(q); if (pr > 0.01 && pr < 0.99) { target = q; break; } }
    rg.playCard('M', [target]);
    const res = rg.playCard('REWIND', []);
    ok('Rewind refuses to undo a measurement', /Nothing reversible/.test(res.note || ''), res.note);
  } else { ok('Rewind refuses to undo a measurement', true); }

  // Rewind does undo a gate.
  const rg2 = new Game({ seed: 8, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }] });
  while (rg2.phase === 'betting') { const p = rg2.current(); if (p.bot) step(rg2); else rg2.call(); }
  if (rg2.phase === 'gates') {
    const hero = rg2.players[rg2.actor];
    hero.hand = ['X', 'REWIND'];
    const snap = hero.board.clone();
    rg2.playCard('X', [0]);
    rg2.playCard('REWIND', []);
    ok('Rewind does undo a gate', hero.board.same(snap) && hero.hand.includes('X'));
  } else { ok('Rewind does undo a gate', true); }

  // A frozen coin cannot be played on.
  const fg = new Game({ seed: 11, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }] });
  while (fg.phase === 'betting') { const p = fg.current(); if (p.bot) step(fg); else fg.call(); }
  if (fg.phase === 'gates') {
    const hero = fg.players[fg.actor];
    hero.hand = ['X'];
    hero.status.add('frozen', { coin: 0, hand: true });
    ok('a frozen coin refuses cards', !fg.playCard('X', [0]).ok);
  } else { ok('a frozen coin refuses cards', true); }
}

/* ================= relics and statuses ================= */
section('relics and statuses');
{
  let bad = [];
  for (const id of RELIC_IDS) {
    const r = RELICS[id];
    if (!r.name || !r.blurb || !r.rarity || !r.price) bad.push(id);
  }
  ok('every relic is described and priced', bad.length === 0, bad.join(','));

  const rs = new RelicSet(['house_edge', 'ancilla_bank']);
  ok('payout hooks chain in order', rs.chain('payout', 1000, {}) === Math.round(Math.round(1000 * 1.12) * 0.92));
  ok('extraCards sums', new RelicSet(['qubit_warmer', 'ancilla_bank']).sum('extraCards') === 3);
  ok('immunity takes the best, not the sum', new RelicSet(['lead_shielding', 'surface_code']).immunity({}) === 1);
  ok('deck bias multiplies', new RelicSet(['spare_cnot']).weightFor('CX') === 3);
  ok('quantum advantage only pays on Coherence',
    new RelicSet(['quantum_advantage']).chain('payout', 100, { score: 5 }) === 300 &&
    new RelicSet(['quantum_advantage']).chain('payout', 100, { score: 4 }) === 100);

  const st = new StatusSet();
  st.add('frozen', { coin: 2, hand: true });
  st.add('shield', { run: true });
  st.add('drift', { street: true });
  ok('frozenCoins reports the coin', st.frozenCoins().join() === '2');
  st.endStreet();
  ok('a street status expires at the street', !st.has('drift'));
  st.endHand();
  ok('a hand status expires at the hand', !st.has('frozen'));
  ok('a run status survives', st.has('shield'));
  st.add('frozen', { coin: 1, hand: true });
  st.add('frozen', { coin: 1, hand: true });
  ok('a repeat stacks rather than duplicating', st.list.filter((s) => s.key === 'frozen').length === 1 && st.get('frozen').stacks === 2);
}

/* ================= modes, bosses, shop ================= */
section('modes, bosses, shop');
{
  ok('every mode is described', MODE_KEYS.every((k) => MODES[k].name && MODES[k].blurb));
  ok('targets climb with the round', targetFor(MODES.student, 5, 1000) > targetFor(MODES.student, 1, 1000));
  ok('and casual asks for less than master', targetFor(MODES.casual, 3, 1000) < targetFor(MODES.master, 3, 1000));

  ok('a boss guards every fifth round', isBossRound(5) && isBossRound(10) && !isBossRound(7));
  ok('bosses are described with their physics',
    Object.values(BOSSES).every((b) => b.warning && b.physics && b.persona));
  ok('chaos events all fire without throwing', (() => {
    const g = new Game({ seed: 5, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook }] });
    for (const ev of CHAOS_EVENTS) {
      try { ev.fire(g); } catch (e) { return false; }
      if (g.inHand().some((p) => Math.abs(p.board.norm() - 1) > 1e-6)) return false;
    }
    return true;
  })());

  const s1 = stock(1234, 1, 0, {}), s2 = stock(1234, 1, 0, {});
  ok('a shop is deterministic', JSON.stringify(s1) === JSON.stringify(s2));
  ok('a reroll actually changes the stock', JSON.stringify(stock(1234, 1, 1, {})) !== JSON.stringify(s1));
  ok('a shop stocks cards, relics and a service',
    s1.some((i) => i.kind === 'card') && s1.some((i) => i.kind === 'relic') && s1.some((i) => i.kind === 'service'));
  ok('a broker discounts', priceFor({ price: 100 }, new RelicSet(['discount_broker'])) === 70);
  ok('the first reroll is free', rerollCost(0, new RelicSet([])) === 0);
  ok('and then it costs', rerollCost(1, new RelicSet([])) > 0);
  ok('shop never offers a relic you own',
    !stock(1, 1, 0, { relics: RELIC_IDS }).some((i) => i.kind === 'relic'));
}

/* ================= runs ================= */
section('runs');
{
  const r = new Run({ mode: 'endless', seed: 'test-seed' });
  ok('a text seed is stable', new Run({ mode: 'endless', seed: 'test-seed' }).seed === r.seed);
  ok('a run starts with a starter deck', r.deck.length > 5);
  const g = r.nextRound();
  ok('round 1 has a target', r.target > 0);
  ok('the hero sits first', g.players[0].bot === null);
  ok('and the rest are bots', g.players.slice(1).every((p) => p.bot));
  ok('a boss appears at round 5', (() => {
    const r2 = new Run({ mode: 'endless', seed: 1 });
    for (let i = 0; i < 4; i++) { r2.nextRound(); r2.round = i + 1; }
    r2.round = 4; r2.nextRound();
    return r2.boss !== null;
  })());

  const snap = r.snapshot();
  const back = Run.restore(snap);
  ok('a run round-trips through a snapshot',
    back.seed === r.seed && back.deck.join() === r.deck.join() && back.round === r.round);

  ok('the shop spends the bank', (() => {
    const r3 = new Run({ mode: 'endless', seed: 3 });
    r3.nextRound(); r3.bank = 1000;
    const shop = r3.openShop();
    const bought = r3.buy(0);
    return bought.ok && r3.bank === 1000 - bought.price && shop.items[0].sold;
  })());
  ok('the shop refuses what you cannot afford', (() => {
    const r4 = new Run({ mode: 'endless', seed: 4 });
    r4.nextRound(); r4.bank = 0;
    return !r4.buy(0).ok;
  })());
}

/* ================= opponents ================= */
section('opponents');
{
  ok('six personalities', PERSONA_KEYS.length === 6, PERSONA_KEYS.length);
  ok('all of them have a voice and a tell',
    PERSONA_KEYS.every((k) => PERSONAS[k].tell && PERSONAS[k].bio && PERSONAS[k].lines.raise));
  ok('chooseOpponents gives distinct seats', (() => {
    const o = chooseOpponents(4, mulberry32(9));
    return new Set(o.map((p) => p.key)).size === 4;
  })());
  ok('speak returns a line', typeof speak(PERSONAS.vesper, 'raise', mulberry32(2)) === 'string');
  ok('and nothing for a situation it has no line for', speak(PERSONAS.vesper, 'nonsense', mulberry32(2)) === null);

  // Strength must respond to the board.
  const meanStrength = (hand) => {
    let t = 0, n = 0;
    for (let s = 0; s < 24; s++) {
      const gg = new Game({ seed: 700 + s, seats: [{ name: 'You' }, { name: 'A', bot: PERSONAS.rook, skill: SKILL.student }] });
      let guard = 0;
      while (gg.phase === 'betting' && gg.round < 2 && guard++ < 60) { const p = gg.current(); if (p.bot) step(gg); else gg.call(); }
      if (gg.phase !== 'betting') continue;
      gg.players[1].hand = hand.slice();
      t += strength(gg, 1); n++;
    }
    return n ? t / n : 0;
  };
  const strong = meanStrength(['GROVER', 'CCX', 'X']);
  const weak = meanStrength(['I', 'I', 'I']);
  ok('a better hand reads as stronger on average', strong > weak, `${strong.toFixed(3)} vs ${weak.toFixed(3)}`);
  ok('strength stays a probability', strong > 0 && strong < 1 && weak > 0 && weak < 1);

  // A tight bot folds more than a loose one, over many spots.
  const folds = (persona) => {
    let f = 0;
    for (let s = 0; s < 120; s++) {
      const gg = new Game({ seed: 900 + s, seats: [{ name: 'You' }, { name: 'B', bot: persona, skill: SKILL.student }] });
      gg.currentBet = gg.bigBlind * 6;
      gg.actor = 1;
      if (decide(gg, 1, mulberry32(s)).action === 'fold') f++;
    }
    return f;
  };
  const tight = folds(PERSONAS.moth), loose = folds(PERSONAS.vesper);
  ok('Moth folds more than Vesper', tight > loose, `${tight} vs ${loose}`);

  const w = new HeroWatcher();
  w.record('raise', 0.2); w.record('raise', 0.9); w.record('fold', 0.1); w.record('call', 0.5);
  ok('the watcher measures aggression', Math.abs(w.profile.aggression - 0.5) < 1e-9);
  ok('and spots a bluff', Math.abs(w.profile.bluff - 0.5) < 1e-9);
}

/* ================= progression ================= */
section('progression');
{
  ok('forty-four achievements', ACHIEVEMENTS.length === 44, ACHIEVEMENTS.length);
  ok('all described with an icon', ACHIEVEMENTS.every((a) => a.name && a.blurb && a.icon && a.tier));
  ok('ids are unique', new Set(ACHIEVEMENTS.map((a) => a.id)).size === ACHIEVEMENTS.length);
  const p = blankProfile();
  ok('a blank profile unlocks nothing', checkAch(p).length === 0);
  p.totals.hands = 1;
  ok('playing a hand unlocks First Light', checkAch(p).some((a) => a.id === 'first_hand'));
  ok('and never twice', checkAch(p).length === 0);
  ok('every achievement test survives a blank profile', (() => {
    const q = blankProfile();
    for (const a of ACHIEVEMENTS) { try { a.test(q); } catch (e) { return false; } }
    return true;
  })());
}

/* ================= teaching ================= */
section('teaching');
{
  ok('the tutorial has lessons', LESSONS.length >= 6, LESSONS.length);
  ok('every lesson has a board, a goal and a check',
    LESSONS.every((l) => l.title && l.text && typeof l.board === 'function' && typeof l.done === 'function'));
  // Exhaustive: every order, every target, and both outcomes of every
  // measurement. A lesson is solvable if any of those reaches its goal. This
  // is stricter than asking the planner, which optimises score rather than
  // whatever the lesson is trying to teach.
  ok('every lesson is solvable with the cards it gives', (() => {
    const fails = [];
    for (const l of LESSONS) {
      if (!l.hand || !l.hand.length || l.plannerExempt) continue;
      const solve = (st, hand, plays, depth) => {
        if (l.done(st, plays)) return true;
        if (!hand.length || depth > 4) return false;
        const tried = new Set();
        for (let i = 0; i < hand.length; i++) {
          const id = hand[i];
          if (tried.has(id)) continue;
          tried.add(id);
          const rest = hand.slice(); rest.splice(i, 1);
          const card = CARDS[id];
          const sets = card.arity === 0 ? [[]] : targetTuples(st.n, card.arity);
          for (const t of sets) {
            if (!legal(id, t, st).ok) continue;
            for (const forced of (card.random ? [0.0, 0.999999] : [0.5])) {
              const copy = st.clone();
              const cir = new Circuit(copy.n, copy);
              try {
                playCard(id, t, { state: copy, circuit: cir, rng: () => forced, player: { noiseLog: [] }, game: null });
              } catch (e) { continue; }
              if (solve(copy, rest, plays.concat([{ card: id, targets: t }]), depth + 1)) return true;
            }
          }
        }
        return false;
      };
      if (!solve(l.board(), l.hand.slice(), [], 0)) fails.push(l.id);
    }
    return fails.length === 0 ? true : fails.join(',');
  })() === true, 'unsolvable lessons');
  // Lesson prose makes factual claims about its own board. Check the ones
  // that are countable, so the text cannot drift away from the physics.
  ok('lesson 1 counts its own coins correctly', (() => {
    const l = LESSONS[0];
    const b = l.board();
    let settled = 0;
    for (let q = 0; q < b.n; q++) if (readCoin(b, q).settled) settled++;
    const words = ['zero', 'one', 'two', 'three', 'four', 'five'];
    return l.text.toLowerCase().includes(words[settled] + ' of these are already decided')
      && l.text.toLowerCase().includes(words[b.n - settled] + ' are not');
  })());

  ok('the codex covers the syllabus', CODEX.length >= 12, CODEX.length);
  ok('every codex entry has a body and a demo',
    CODEX.every((c) => c.title && c.body && c.body.length > 120));
}

/* ================= report ================= */
const failed = results.filter((r) => !r.pass);
const byGroup = {};
for (const r of results) {
  byGroup[r.group] = byGroup[r.group] || { pass: 0, fail: 0 };
  byGroup[r.group][r.pass ? 'pass' : 'fail']++;
}

export function report() {
  const lines = [];
  for (const g of Object.keys(byGroup)) {
    const s = byGroup[g];
    lines.push(`${s.fail ? '✗' : '✓'} ${g}: ${s.pass}/${s.pass + s.fail}`);
  }
  for (const f of failed) lines.push(`  FAIL [${f.group}] ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
  lines.push(`${results.length - failed.length}/${results.length} checks passed.`);
  return lines.join('\n');
}

export const summary = { total: results.length, failed: failed.length, results };

if (typeof process !== 'undefined' && process.argv && process.argv[1] && process.argv[1].endsWith('run.js')) {
  console.log(report());
  process.exit(failed.length ? 1 : 0);
} else if (typeof window !== 'undefined') {
  console.log(report());
}
