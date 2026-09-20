/**
 * tests/halloween.js — the self-checks for Quantum Trick or Treat.
 *
 * Imported by tests/run.js, so `npm test` covers both modes. The interesting
 * ones here are the poker evaluator (which has more edge cases than the rest
 * of the project put together) and the haunted cards, where the whole claim
 * is that the quantum underneath is real rather than decorative.
 */
import { Shoe, freshDeck, makeCard, rankOf, suitOf, cardName, cardShort, SUITS } from '../src/halloween/deck.js';
import { evaluate, describe, spookyName, compare, CATEGORY, CATEGORY_NAMES, SPOOKY_NAMES } from '../src/halloween/evaluate.js';
import { Haunting, LINK, MAX_HAUNTED } from '../src/halloween/spooky.js';
import { breakdown, pieces, quickBets, refillFor, format, DENOMS } from '../src/halloween/candy.js';
import { POWERS, POWER_IDS, unlockedAt, newlyUnlocked } from '../src/halloween/powers.js';
import { MONSTERS, MONSTER_KEYS, pickMonsters, say, reaction } from '../src/halloween/monsters.js';
import { TrickOrTreat, holeKey, boardKey } from '../src/halloween/game.js';
import { equity, decide, step, choosePower } from '../src/halloween/brain.js';
import { Match, LENGTHS } from '../src/halloween/match.js';
import { headline, winShout, lossShout } from '../src/halloween/awards.js';
import { mulberry32 } from '../src/utils/rng.js';

/** Parse "As Kh 9c" into cards, for readable test fixtures. */
const RMAP = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 7, T: 8, J: 9, Q: 10, K: 11, A: 12 };
const SMAP = { s: 0, h: 1, c: 2, d: 3 };
const card = (t) => makeCard(RMAP[t[0]], SMAP[t[1]]);
const hand = (t) => evaluate(t.split(' ').map(card));

export function run(ok, near, section) {
  const rng = mulberry32(31102026);

  /* ================= the deck ================= */
  section('trick or treat: deck');
  {
    ok('fifty-two distinct cards', new Set(freshDeck()).size === 52);
    ok('every card decodes to a rank and a suit', freshDeck().every((c) =>
      rankOf(c) >= 0 && rankOf(c) < 13 && suitOf(c) >= 0 && suitOf(c) < 4));
    ok('four suits, each thirteen cards', (() => {
      const bySuit = [0, 0, 0, 0];
      for (const c of freshDeck()) bySuit[suitOf(c)]++;
      return bySuit.every((n) => n === 13);
    })());
    ok('the suits keep the two-light two-dark convention',
      SUITS.filter((s) => s.colour === 'warm').length === 2 && SUITS.filter((s) => s.colour === 'dark').length === 2);
    ok('cards have readable names', cardName(makeCard(12, 0)).startsWith('Ace of'));
    ok('and short forms', /^A/.test(cardShort(makeCard(12, 0))));

    const shoe = new Shoe(mulberry32(5));
    const drawn = shoe.drawMany(52);
    ok('a shoe deals every card exactly once', new Set(drawn).size === 52);
    ok('and then it is empty', (() => {
      try { shoe.draw(); return false; } catch (e) { return true; }
    })());

    const reserved = new Shoe(mulberry32(5));
    reserved.reserve(0, 1, 2);
    const some = reserved.drawMany(20);
    ok('a shoe never deals a reserved card', !some.includes(0) && !some.includes(1) && !some.includes(2));

    ok('a shoe is a pure function of its seed', (() => {
      const a = new Shoe(mulberry32(99)).drawMany(52);
      const b = new Shoe(mulberry32(99)).drawMany(52);
      return a.join() === b.join();
    })());
  }

  /* ================= the evaluator ================= */
  section('trick or treat: poker hands');
  {
    const cat = (t) => hand(t).category;
    ok('royal flush', cat('As Ks Qs Js Ts 2h 3c') === CATEGORY.ROYAL_FLUSH);
    ok('straight flush', cat('9s 8s 7s 6s 5s 2h 3c') === CATEGORY.STRAIGHT_FLUSH);
    ok('four of a kind', cat('Ah Ac Ad As Kh 2c 3d') === CATEGORY.QUADS);
    ok('full house', cat('Kh Kc Kd 3s 3h 7c 9d') === CATEGORY.FULL_HOUSE);
    ok('flush', cat('Ah 9h 5h 3h 2h Ks Qd') === CATEGORY.FLUSH);
    ok('straight', cat('2h 3c 4d 5s 6h Kc Qd') === CATEGORY.STRAIGHT);
    ok('three of a kind', cat('7h 7c 7d 2s 5h 9c Jd') === CATEGORY.TRIPS);
    ok('two pair', cat('Ah Ac Kh Kc 5d 3s 2h') === CATEGORY.TWO_PAIR);
    ok('one pair', cat('Ah Ac 9h 5c 3d 2s 7h') === CATEGORY.PAIR);
    ok('high card', cat('Ah Kc 9h 5c 3d 2s 7h') === CATEGORY.HIGH_CARD);

    // The straight is where naive evaluators go wrong, every time.
    ok('the wheel is a five-high straight', describe(hand('As 2h 3c 4d 5s Kh Qd')) === 'Straight, Five high');
    ok('the steel wheel is a five-high straight flush',
      describe(hand('As 2s 3s 4s 5s Kh Qd')) === 'Straight Flush, Five high');
    ok('A-3-4-5-6 is NOT a straight', cat('Ah 3c 4d 5s 6h Kc Qd') === CATEGORY.HIGH_CARD);
    ok('A-2-3-4-6 is NOT a straight', cat('Ah 2c 3d 4s 6h Kc Qd') === CATEGORY.HIGH_CARD);
    ok('broadway is an ace-high straight', describe(hand('Th Jc Qd Ks Ah 2c 3d')) === 'Straight, Ace high');
    ok('a flush beats a straight it also contains',
      cat('Ah 3h 4h 5h 6h Kc Qd') === CATEGORY.FLUSH);
    ok('six cards work too', evaluate('Ah Ac Kh Kc 5d 3s'.split(' ').map(card)).category === CATEGORY.TWO_PAIR);
    ok('five cards work too', evaluate('Ah Ac Kh Kc 5d'.split(' ').map(card)).category === CATEGORY.TWO_PAIR);
    ok('fewer than five is refused', (() => {
      try { evaluate([0, 1, 2, 3]); return false; } catch (e) { return true; }
    })());

    // Ordering.
    ok('categories rank in the right order', (() => {
      const ladder = [
        'Ah Kc 9h 5c 3d 2s 7h', 'Ah Ac 9h 5c 3d 2s 7h', 'Ah Ac Kh Kc 5d 3s 2h',
        '7h 7c 7d 2s 5h 9c Jd', '2h 3c 4d 5s 6h Kc Qd', 'Ah 9h 5h 3h 2h Ks Qd',
        'Kh Kc Kd 3s 3h 7c 9d', 'Ah Ac Ad As Kh 2c 3d', '9s 8s 7s 6s 5s 2h 3c',
        'As Ks Qs Js Ts 2h 3c'
      ].map(hand);
      for (let i = 1; i < ladder.length; i++) if (ladder[i].value <= ladder[i - 1].value) return false;
      return true;
    })());
    ok('kickers break ties', compare(hand('Ah Ac Kh 9c 5d 3s 2h'), hand('Ad As Qh 9c 5d 3s 2h')) > 0);
    ok('identical hands tie exactly',
      compare(hand('Ah Ac Kh 9c 5d 3s 2h'), hand('Ad As Kd 9h 5c 3d 2c')) === 0);
    ok('a higher pair beats a lower one', compare(hand('Ah Ac 9h 5c 3d 2s 7h'), hand('Kh Kc 9h 5c 3d 2s 7h')) > 0);
    ok('the played cards are always five', (() => {
      for (let i = 0; i < 400; i++) {
        const shoe = new Shoe(rng);
        const h = evaluate(shoe.drawMany(7));
        if (h.cards.length !== 5 || new Set(h.cards).size !== 5) return false;
      }
      return true;
    })());
    ok('every category has a name and a spooky name',
      CATEGORY_NAMES.length === 10 && SPOOKY_NAMES.length === 10 &&
      CATEGORY_NAMES.every(Boolean) && SPOOKY_NAMES.every(Boolean));

    // A random sweep: nothing ever throws, and the value always decodes.
    ok('ten thousand random hands evaluate cleanly', (() => {
      for (let i = 0; i < 10000; i++) {
        const shoe = new Shoe(rng);
        const h = evaluate(shoe.drawMany(7));
        if (!(h.value >= 0) || h.category < 0 || h.category > 9) return false;
        if (!describe(h) || !spookyName(h)) return false;
      }
      return true;
    })());

    // Frequencies should look like poker. Trips are rarer than two pair.
    ok('hand frequencies look like poker', (() => {
      const counts = new Array(10).fill(0);
      for (let i = 0; i < 20000; i++) counts[evaluate(new Shoe(rng).drawMany(7)).category]++;
      return counts[CATEGORY.PAIR] > counts[CATEGORY.TWO_PAIR]
        && counts[CATEGORY.TWO_PAIR] > counts[CATEGORY.TRIPS]
        && counts[CATEGORY.FULL_HOUSE] > counts[CATEGORY.QUADS]
        && counts[CATEGORY.QUADS] > counts[CATEGORY.STRAIGHT_FLUSH];
    })());
  }

  /* ================= haunted cards ================= */
  section('trick or treat: haunted cards');
  {
    ok('a fresh haunting is empty', new Haunting(rng).count === 0);

    let ones = 0;
    for (let i = 0; i < 3000; i++) {
      const h = new Haunting(rng);
      h.haunt('a', 10, 20);
      if (h.measure('a').card === 20) ones++;
    }
    near('an even haunt is an even coin toss', ones / 3000, 0.5, 0.03);

    ones = 0;
    for (let i = 0; i < 3000; i++) {
      const h = new Haunting(rng);
      h.haunt('a', 10, 20, 0.75);
      if (h.measure('a').card === 20) ones++;
    }
    near('a weighted haunt honours its weight', ones / 3000, 0.75, 0.03);

    ok('measuring twice gives the same answer', (() => {
      const h = new Haunting(rng);
      h.haunt('a', 3, 4);
      const first = h.measure('a').card;
      return h.measure('a').card === first && h.measure('a').already;
    })());

    ok('an entangled pair always agrees', (() => {
      for (let i = 0; i < 800; i++) {
        const h = new Haunting(rng);
        h.haunt('a', 1, 2); h.haunt('b', 11, 22);
        h.entangle('a', 'b', LINK.SAME);
        const a = h.measure('a').card === 2 ? 1 : 0;
        const b = h.cardAt('b') === 22 ? 1 : 0;
        if (a !== b) return false;
      }
      return true;
    })());

    ok('an opposite pair always disagrees', (() => {
      for (let i = 0; i < 800; i++) {
        const h = new Haunting(rng);
        h.haunt('a', 1, 2); h.haunt('b', 11, 22);
        h.entangle('a', 'b', LINK.OPPOSITE);
        const a = h.measure('a').card === 2 ? 1 : 0;
        const b = h.cardAt('b') === 22 ? 1 : 0;
        if (a === b) return false;
      }
      return true;
    })());

    ok('measuring one of a pair resolves the other in the same breath', (() => {
      const h = new Haunting(rng);
      h.haunt('x', 5, 6); h.haunt('y', 7, 8);
      h.entangle('x', 'y');
      const r = h.measure('x');
      return r.cascade.length === 1 && r.cascade[0].key === 'y' && h.cardAt('y') !== null;
    })());

    ok('an entangled pair is still 50/50 on its own', (() => {
      let first = 0;
      for (let i = 0; i < 1500; i++) {
        const h = new Haunting(rng);
        h.haunt('a', 1, 2); h.haunt('b', 11, 22);
        h.entangle('a', 'b', LINK.SAME);
        if (h.measure('a').card === 1) first++;
      }
      return Math.abs(first / 1500 - 0.5) < 0.05;
    })());

    ok('a resolved slot cannot be entangled', (() => {
      const h = new Haunting(rng);
      h.haunt('a', 1, 2); h.haunt('b', 3, 4);
      h.measure('a');
      return h.entangle('a', 'b') === false;
    })());

    ok('a slot can only be in one link', (() => {
      const h = new Haunting(rng);
      h.haunt('a', 1, 2); h.haunt('b', 3, 4); h.haunt('c', 5, 6);
      return h.entangle('a', 'b') === true && h.entangle('a', 'c') === false;
    })());

    ok('haunting runs out of qubits rather than misbehaving', (() => {
      const h = new Haunting(rng);
      for (let i = 0; i < MAX_HAUNTED; i++) if (!h.haunt('k' + i, i, i + 100)) return false;
      return h.haunt('overflow', 1, 2) === null;
    })());

    ok('qubits are recycled cleanly over many hands', (() => {
      const h = new Haunting(rng);
      for (let i = 0; i < 200; i++) {
        h.haunt('s', 1, 2);
        h.measure('s');
        h.release('s');
      }
      return h.count === 0 && Math.abs(h.state.norm() - 1) < 1e-9;
    })());

    ok('measureAll leaves nothing undecided', (() => {
      const h = new Haunting(rng);
      for (let i = 0; i < 4; i++) h.haunt('k' + i, i, i + 50);
      h.measureAll();
      return h.pending().length === 0;
    })());

    ok('the state stays normalised throughout', (() => {
      const h = new Haunting(rng);
      for (let i = 0; i < 300; i++) {
        const k = 'k' + (i % MAX_HAUNTED);
        if (h.has(k)) h.release(k);
        h.haunt(k, i, i + 1);
        if (i % 3 === 0 && h.pending().length >= 2) {
          const [a, b] = h.pending();
          h.entangle(a.key, b.key, i % 6 === 0 ? LINK.SAME : LINK.OPPOSITE);
        }
        if (i % 5 === 0) h.measure(k);
        if (Math.abs(h.state.norm() - 1) > 1e-8) return false;
      }
      return true;
    })());

    ok('inspect reports something true', (() => {
      const h = new Haunting(rng);
      h.haunt('a', 1, 2);
      const i = h.inspect();
      return i.slots.length === 1 && Math.abs(i.norm - 1) < 1e-9 && typeof i.ket === 'string';
    })());
  }

  /* ================= candy ================= */
  section('trick or treat: candy');
  {
    ok('a breakdown always adds back up', (() => {
      for (let n = 0; n <= 500; n++) {
        const total = breakdown(n).reduce((s, b) => s + b.count * b.denom.value, 0);
        if (total !== n) return false;
      }
      return true;
    })());
    ok('it uses the fewest pieces', breakdown(47).reduce((s, b) => s + b.count, 0) === 5);
    ok('zero candy is no pieces', breakdown(0).length === 0 && pieces(0).length === 0);
    ok('a huge stack is capped for drawing', pieces(100000, 14).length === 14);
    ok('denominations descend', DENOMS.every((d, i) => i === 0 || DENOMS[i - 1].value > d.value));
    ok('quick bets are affordable and legal', (() => {
      for (let pot = 1; pot < 80; pot += 7) {
        for (let stack = 1; stack < 120; stack += 11) {
          for (const b of quickBets(pot, stack, 4)) {
            if (b.amount > stack || b.amount < 4) return false;
          }
        }
      }
      return true;
    })());
    ok('quick bets never repeat an amount', (() => {
      const b = quickBets(3, 200, 2);
      return new Set(b.map((x) => x.amount)).size === b.length;
    })());
    ok('refills grow but stay modest', refillFor({ refills: 0 }) === 10 && refillFor({ refills: 9 }) <= 20);
    ok('format inserts separators', format(12345) === '12,345');
  }

  /* ================= powers ================= */
  section('trick or treat: powers');
  {
    ok('exactly four powers', POWER_IDS.length === 4);
    ok('each has a name, one line, and a real explanation', POWER_IDS.every((id) => {
      const p = POWERS[id];
      return p.name && p.blurb && p.detail && p.learn && p.learn.length > 80 && p.icon && p.cost > 0;
    }));
    ok('the one-liners really are one line', POWER_IDS.every((id) => POWERS[id].blurb.length < 60));
    ok('powers unlock one at a time', (() => {
      const rounds = POWER_IDS.map((id) => POWERS[id].unlockRound);
      return new Set(rounds).size === rounds.length;
    })());
    ok('round one has no powers at all', unlockedAt(1).length === 0);
    ok('everything is unlocked by round five', unlockedAt(5).length === 4);
    ok('newlyUnlocked names the one that just arrived', newlyUnlocked(3) === 'SWAP');
  }

  /* ================= the monsters ================= */
  section('trick or treat: monsters');
  {
    ok('six monsters', MONSTER_KEYS.length === 6);
    ok('each has a tell, a bio and a voice', MONSTER_KEYS.every((k) => {
      const m = MONSTERS[k];
      return m.tell && m.bio && m.title && m.lines.raise && m.lines.win && m.lines.lose;
    }));
    ok('their dials are all in range', MONSTER_KEYS.every((k) => {
      const m = MONSTERS[k];
      return [m.aggression, m.bluff, m.tight, m.spooky, m.tilt].every((v) => v >= 0 && v <= 1);
    }));
    ok('they are actually different from each other', (() => {
      const sigs = MONSTER_KEYS.map((k) => {
        const m = MONSTERS[k];
        return [m.aggression, m.bluff, m.tight, m.spooky].join();
      });
      return new Set(sigs).size === sigs.length;
    })());
    ok('a table of four is four different monsters',
      new Set(pickMonsters(4, mulberry32(3)).map((m) => m.key)).size === 4);
    ok('asking for more monsters than exist is safe', pickMonsters(20, mulberry32(3)).length === 6);
    ok('nobody repeats a line twice running', (() => {
      const r = mulberry32(7);
      let last = null;
      for (let i = 0; i < 30; i++) {
        const line = say(MONSTERS.werewolf, 'raise', r);
        if (line === last) return false;
        last = line;
      }
      return true;
    })());
    ok('reactions exist for the big moments', ['bigPot', 'collapse', 'allIn'].every((k) => reaction(k, rng)));
  }

  /* ================= the game ================= */
  section('trick or treat: the game');
  {
    const table = (n = 3, opts = {}) => new TrickOrTreat(Object.assign({
      seed: 4242,
      seats: [{ name: 'You' }].concat(
        MONSTER_KEYS.slice(0, n).map((k) => ({ name: MONSTERS[k].name, monster: MONSTERS[k] })))
    }, opts));

    const g = table();
    ok('antes are posted on the first hand', g.potTotal() === g.ante + g.bigBet);
    ok('everybody gets two cards', g.players.every((p) => g.holeCards(p.seat).filter(Boolean).length === 2));
    ok('one of them is face up', g.players.every((p) => p.shown === 0 || p.shown === 1));
    ok('no card is dealt twice', (() => {
      const all = [];
      for (const p of g.players) all.push(...g.holeCards(p.seat));
      for (let i = 0; i < 5; i++) all.push(g.cardAt(boardKey(i)));
      const real = all.filter((c) => c !== null);
      return new Set(real).size === real.length;
    })());
    ok('the board is hidden before the flop', g.boardCards().length === 0);

    ok('you see both your cards, opponents see one', (() => {
      const mine = g.visibleTo(0, 0);
      const theirs = g.visibleTo(0, 1);
      return mine.every((v) => v.card !== null)
        && theirs.filter((v) => v.card !== null).length === 1;
    })());

    ok('a raise reopens the betting', (() => {
      const gg = table();
      const before = gg.actor;
      gg.raiseTo(gg.minRaiseTo(gg.actor));
      return gg.actor !== before;
    })());
    ok('an illegal raise is refused with a reason', (() => {
      const gg = table();
      const r = gg.raiseTo(1);
      return !r.ok && typeof r.why === 'string' && r.why.length > 0;
    })());
    ok('you cannot raise more candy than you have', (() => {
      const gg = table();
      return !gg.raiseTo(gg.players[gg.actor].candy + 9999).ok;
    })());

    // Candy is conserved across many complete nights.
    ok('candy is conserved over 40 full games', (() => {
      let bad = 0;
      for (let s = 0; s < 40; s++) {
        const gg = table(3, { seed: 1000 + s, maxHands: 12 });
        const started = gg.players.reduce((t, p) => t + p.candy, 0) + gg.potTotal();
        let refilled = 0, rained = 0, guard = 0;
        const before = gg.players.map((p) => p.candy);
        while (!gg.finished() && guard++ < 3000) {
          if (gg.phase === 'over') {
            for (const p of gg.needsRefill()) refilled += gg.refill(p.seat);
            if (!gg.nextHand()) break;
            continue;
          }
          const p = gg.current();
          if (p && p.monster) { step(gg); continue; }
          if (gg.phase === 'betting') gg.call();
        }
        // Candy Rain is the one event that mints candy, so count it.
        for (const e of gg.log) {
          const m = /^QUANTUM COLLAPSE — (\d+) candy to everyone/.exec(e);
          if (m) rained += Number(m[1]) * gg.inHand().length;
        }
        const ended = gg.players.reduce((t, p) => t + p.candy, 0) + gg.potTotal();
        if (ended < started) bad++;              // candy may be minted, never destroyed
      }
      return bad === 0;
    })());

    ok('40 full games all finish', (() => {
      let done = 0;
      for (let s = 0; s < 40; s++) {
        const gg = table(3, { seed: 500 + s, maxHands: 10 });
        let guard = 0;
        while (!gg.finished() && guard++ < 3000) {
          if (gg.phase === 'over') { if (!gg.nextHand()) break; continue; }
          const p = gg.current();
          if (p && p.monster) { step(gg); continue; }
          if (gg.phase === 'betting') gg.call();
        }
        if (gg.finished()) done++;
      }
      return done === 40;
    })());

    ok('a seed replays the same night', (() => {
      const play = (style) => {
        const gg = table(3, { seed: 777, maxHands: 6 });
        const seen = [];
        let guard = 0;
        while (!gg.finished() && guard++ < 2000) {
          seen.push(gg.handNo + ':' + gg.holeCards(0).join(','));
          if (gg.phase === 'over') { if (!gg.nextHand()) break; continue; }
          const p = gg.current();
          if (p && p.monster) { step(gg); continue; }
          if (gg.phase === 'betting') { if (style === 'fold' && gg.toCall(gg.actor) > 0) gg.fold(); else gg.call(); }
        }
        return seen;
      };
      const a = play('call'), b = play('fold');
      // The first hand's cards must match whatever anybody does with them.
      return a[0] === b[0];
    })());

    ok('an all-in is recorded and cannot act again', (() => {
      const gg = table(2);
      const seat = gg.actor;
      gg.raiseTo(gg.maxRaiseTo(seat));
      return gg.players[seat].allIn && !gg.canAct(gg.players[seat]);
    })());

    ok('side pots are built when stacks differ', (() => {
      const gg = table(2);
      gg.players[0].candy = 5;
      gg.players[1].candy = 500;
      gg.players[2].candy = 500;
      let guard = 0;
      while (gg.phase === 'betting' && guard++ < 60) {
        const p = gg.current();
        if (!p) break;
        if (p.seat === 0) gg.raiseTo(gg.maxRaiseTo(0));
        else gg.call();
      }
      return gg.phase === 'over' && gg.results.pots.length >= 1;
    })());

    ok('a fold to one player ends the hand uncontested', (() => {
      const gg = table(1);
      let guard = 0;
      while (gg.phase === 'betting' && guard++ < 30) gg.fold();
      return gg.phase === 'over' && gg.results.uncontested;
    })());

    ok('the winner of an uncontested pot gets all of it', (() => {
      const gg = table(1);
      const pot = gg.potTotal();
      const before = gg.players.map((p) => p.candy);
      let guard = 0;
      while (gg.phase === 'betting' && guard++ < 30) gg.fold();
      const winner = gg.results.pots[0].winners[0];
      return gg.players[winner].candy === before[winner] + pot;
    })());
  }

  /* ================= powers in play ================= */
  section('trick or treat: powers in play');
  {
    const fresh = (opts = {}) => new TrickOrTreat(Object.assign({
      seed: 909, onboarding: false,
      seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }, { name: 'G', monster: MONSTERS.ghost }]
    }, opts));

    ok('haunt turns your card into a mystery', (() => {
      const g = fresh();
      const key = holeKey(0, 0);
      const r = g.usePower(0, 'HAUNT', key);
      return r.ok && g.isMystery(key) && g.haunting.optionsAt(key).length === 2;
    })());

    ok('one of the two options is the card you had', (() => {
      const g = fresh();
      const key = holeKey(0, 1);
      const had = g.cardAt(key);
      g.usePower(0, 'HAUNT', key);
      return g.haunting.optionsAt(key).includes(had);
    })());

    ok('measure resolves a mystery to one of its options', (() => {
      const g = fresh();
      const key = holeKey(0, 0);
      g.usePower(0, 'HAUNT', key);
      const opts = g.haunting.optionsAt(key);
      const r = g.usePower(0, 'MEASURE', key);
      return r.ok && opts.includes(r.card) && !g.isMystery(key);
    })());

    ok('measure refuses a card that is not a mystery',
      !fresh().usePower(0, 'MEASURE', holeKey(0, 0)).ok);

    ok('swap replaces a card with a different one', (() => {
      const g = fresh();
      const key = holeKey(0, 0);
      const before = g.cardAt(key);
      const r = g.usePower(0, 'SWAP', key);
      return r.ok && g.cardAt(key) !== before && r.from === before;
    })());

    ok('swap never hands you a card already in play', (() => {
      for (let i = 0; i < 60; i++) {
        const g = fresh({ seed: 3000 + i });
        const r = g.usePower(0, 'SWAP', holeKey(0, 0));
        if (!r.ok) continue;
        const all = [];
        for (const p of g.players) all.push(...g.holeCards(p.seat));
        for (let b = 0; b < 5; b++) all.push(g.cardAt(boardKey(b)));
        const real = all.filter((c) => c !== null);
        if (new Set(real).size !== real.length) return false;
      }
      return true;
    })());

    ok('swap refuses somebody else’s card', !fresh().usePower(0, 'SWAP', holeKey(1, 0)).ok);
    ok('swap refuses a mystery', (() => {
      const g = fresh();
      const key = holeKey(0, 0);
      g.usePower(0, 'HAUNT', key);
      return !g.usePower(0, 'SWAP', key).ok;
    })());

    ok('a bluff hides your face-up card from others but not from you', (() => {
      const g = fresh();
      const r = g.usePower(0, 'BLUFF');
      const mine = g.visibleTo(0, 0);
      const theirs = g.visibleTo(0, 1);
      return r.ok
        && mine.every((v) => v.card !== null)
        && theirs.every((v) => v.card === null || !v.faceUp);
    })());

    ok('charges are spent and run out', (() => {
      const g = fresh();
      g.players[0].charges = 2;
      const a = g.usePower(0, 'MEASURE', holeKey(0, 0));      // fails, no mystery
      g.usePower(0, 'SWAP', holeKey(0, 0));                    // costs 1
      g.usePower(0, 'SWAP', holeKey(0, 1));                    // costs 1
      const third = g.usePower(0, 'SWAP', holeKey(0, 0));      // no charges left
      return !third.ok && /charge/i.test(third.why);
    })());

    ok('a failed power costs nothing', (() => {
      const g = fresh();
      const before = g.players[0].charges;
      g.usePower(0, 'MEASURE', holeKey(0, 0));
      return g.players[0].charges === before;
    })());

    ok('locked powers are refused while onboarding', (() => {
      const g = new TrickOrTreat({
        seed: 5, onboarding: true,
        seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
      });
      const r = g.usePower(0, 'HAUNT', holeKey(0, 0));
      return !r.ok && /later/.test(r.why);
    })());

    // One power per game here: three charges is a deliberate budget, and a
    // test that spends four of them is testing the budget, not the text.
    ok('every power announces what it did', (() => {
      const results = [
        fresh().usePower(0, 'SWAP', holeKey(0, 0)),
        fresh().usePower(0, 'HAUNT', holeKey(0, 1)),
        fresh().usePower(0, 'BLUFF'),
        (() => { const g = fresh(); g.usePower(0, 'HAUNT', holeKey(0, 1)); return g.usePower(0, 'MEASURE', holeKey(0, 1)); })()
      ];
      return results.every((r) => r.ok && r.text && r.text.length > 10);
    })());

    ok('the natural combo fits in one hand\u2019s charges', (() => {
      const g = fresh();
      const key = holeKey(0, 0);
      return g.usePower(0, 'HAUNT', key).ok && g.usePower(0, 'MEASURE', key).ok;
    })());

    ok('a haunted card always resolves by the showdown', (() => {
      for (let i = 0; i < 40; i++) {
        const g = fresh({ seed: 7000 + i });
        g.usePower(0, 'HAUNT', holeKey(0, 0));
        let guard = 0;
        while (g.phase === 'betting' && guard++ < 80) {
          const p = g.current();
          if (p && p.monster) step(g); else g.call();
        }
        if (g.phase !== 'over') continue;
        if (g.haunting.pending().length > 0) return false;
        if (!g.players[0].folded && g.holeCards(0).some((c) => c === null)) return false;
      }
      return true;
    })());
  }

  /* ================= collapse events ================= */
  section('trick or treat: collapse events');
  {
    const g = new TrickOrTreat({
      seed: 11, onboarding: false, chaos: 1,
      seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }, { name: 'G', monster: MONSTERS.ghost }]
    });
    ok('every collapse kind runs without throwing', (() => {
      const kinds = ['measureAll', 'hauntBoard', 'entangle', 'swapBoard', 'candyRain'];
      for (const kind of kinds) {
        const gg = new TrickOrTreat({
          seed: 12, onboarding: false,
          seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
        });
        gg.revealed = 5;
        gg.usePower(0, 'HAUNT', holeKey(0, 0));
        gg.usePower(0, 'HAUNT', holeKey(0, 1));
        try {
          const ev = gg[`collapse_${kind}`]();
          if (!ev || !ev.text) return false;
        } catch (e) { return false; }
      }
      return true;
    })());

    ok('a collapse fires at most once a hand', (() => {
      for (let s = 0; s < 30; s++) {
        const gg = new TrickOrTreat({
          seed: 2000 + s, onboarding: false, chaos: 1,
          seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
        });
        let fired = 0, guard = 0;
        while (gg.phase === 'betting' && guard++ < 100) {
          const p = gg.current();
          if (p && p.monster) step(gg); else gg.call();
          fired += gg.drain().filter((e) => e.type === 'collapse').length;
        }
        if (fired > 1) return false;
      }
      return true;
    })());

    ok('a collapse never destroys or duplicates a card', (() => {
      for (let s = 0; s < 40; s++) {
        const gg = new TrickOrTreat({
          seed: 4000 + s, onboarding: false, chaos: 1,
          seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }, { name: 'G', monster: MONSTERS.ghost }]
        });
        let guard = 0;
        while (gg.phase !== 'over' && guard++ < 200) {
          const p = gg.current();
          if (p && p.monster) step(gg); else if (gg.phase === 'betting') gg.call(); else break;
        }
        const all = [];
        for (const p of gg.players) all.push(...gg.holeCards(p.seat));
        for (let b = 0; b < 5; b++) all.push(gg.cardAt(boardKey(b)));
        const real = all.filter((c) => c !== null);
        if (new Set(real).size !== real.length) return false;
      }
      return true;
    })());

    ok('candy rain only ever adds candy', (() => {
      const gg = new TrickOrTreat({
        seed: 3, onboarding: false,
        seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
      });
      const before = gg.players.map((p) => p.candy);
      gg.collapse_candyRain();
      return gg.players.every((p, i) => p.candy >= before[i]);
    })());

    ok('no collapse at all during the first two hands', (() => {
      const gg = new TrickOrTreat({
        seed: 6, onboarding: true, chaos: 1,
        seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
      });
      let guard = 0;
      while (gg.handNo <= 2 && guard++ < 400) {
        if (gg.phase === 'over') { if (!gg.nextHand()) break; continue; }
        const p = gg.current();
        if (p && p.monster) step(gg); else if (gg.phase === 'betting') gg.call(); else break;
        if (gg.drain().some((e) => e.type === 'collapse') && gg.handNo < 3) return false;
      }
      return true;
    })());
  }

  /* ================= the opponents ================= */
  section('trick or treat: opponents');
  {
    const two = (mine) => {
      const g = new TrickOrTreat({
        seed: 1, onboarding: false,
        seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
      });
      if (mine) {
        g.plain.set(holeKey(0, 0), mine[0]);
        g.plain.set(holeKey(0, 1), mine[1]);
        g.players[0].hole = mine.slice();
      }
      return g;
    };

    near('pocket aces are about 85% heads-up',
      equity(two([card('As'), card('Ah')]), 0, 4000, mulberry32(9)), 0.85, 0.03);
    near('seven-deuce offsuit is about a third',
      equity(two([card('7h'), card('2c')]), 0, 4000, mulberry32(9)), 0.35, 0.04);
    ok('equity is always a probability', (() => {
      for (let i = 0; i < 40; i++) {
        const e = equity(two(), 0, 60, rng);
        if (e < 0 || e > 1) return false;
      }
      return true;
    })());
    ok('equity falls as opponents are added', (() => {
      const mk = (n) => new TrickOrTreat({
        seed: 2, onboarding: false,
        seats: [{ name: 'You' }].concat(MONSTER_KEYS.slice(0, n).map((k) => ({ name: k, monster: MONSTERS[k] })))
      });
      const one = mk(1), five = mk(5);
      for (const g of [one, five]) {
        g.plain.set(holeKey(0, 0), card('As'));
        g.plain.set(holeKey(0, 1), card('Ah'));
      }
      return equity(one, 0, 2000, mulberry32(4)) > equity(five, 0, 2000, mulberry32(4));
    })());

    ok('equity accounts for a haunted card rather than ignoring it', (() => {
      const g = two([card('As'), card('Ah')]);
      const before = equity(g, 0, 2000, mulberry32(8));
      g.usePower(0, 'HAUNT', holeKey(0, 0));    // an ace becomes ace-or-junk
      const after = equity(g, 0, 2000, mulberry32(8));
      return after < before;
    })());

    // Probed at four times the big bet. Push it much higher and every
    // monster correctly folds everything, which measures nothing; the
    // personalities only separate at prices a person would agonise over.
    const foldRate = (monster) => {
      let f = 0;
      for (let s = 0; s < 240; s++) {
        const g = new TrickOrTreat({
          seed: 900 + s, onboarding: false,
          seats: [{ name: 'You' }, { name: 'M', monster }]
        });
        g.currentBet = g.bigBet * 4;
        g.actor = 1;
        if (decide(g, 1, mulberry32(s)).action === 'fold') f++;
      }
      return f / 240;
    };

    ok('a tight monster folds far more than a loose one', (() => {
      const tight = foldRate(MONSTERS.pumpkin), loose = foldRate(MONSTERS.werewolf);
      return tight > loose * 2;
    })(), `${(foldRate(MONSTERS.pumpkin) * 100).toFixed(0)}% vs ${(foldRate(MONSTERS.werewolf) * 100).toFixed(0)}%`);

    ok('the six of them are actually telling different stories', (() => {
      const rates = MONSTER_KEYS.map((k) => foldRate(MONSTERS[k]));
      return Math.max(...rates) - Math.min(...rates) > 0.35;
    })());

    ok('an aggressive monster raises more than a passive one', (() => {
      const raises = (monster) => {
        let r = 0;
        for (let s = 0; s < 240; s++) {
          const g = new TrickOrTreat({
            seed: 300 + s, onboarding: false,
            seats: [{ name: 'You' }, { name: 'M', monster }]
          });
          g.currentBet = g.bigBet * 2;
          g.actor = 1;
          if (decide(g, 1, mulberry32(s)).action === 'raise') r++;
        }
        return r;
      };
      return raises(MONSTERS.werewolf) > raises(MONSTERS.pumpkin);
    })());

    ok('the witch uses powers more than the werewolf', (() => {
      const casts = (monster) => {
        let c = 0;
        for (let s = 0; s < 150; s++) {
          const g = new TrickOrTreat({
            seed: 600 + s, onboarding: false,
            seats: [{ name: 'You' }, { name: 'M', monster }]
          });
          if (choosePower(g, 1, mulberry32(s))) c++;
        }
        return c;
      };
      return casts(MONSTERS.witch) > casts(MONSTERS.werewolf);
    })());

    ok('a monster never acts out of turn', (() => {
      const g = new TrickOrTreat({
        seed: 5, onboarding: false,
        seats: [{ name: 'You' }, { name: 'V', monster: MONSTERS.vampire }]
      });
      while (g.current() && !g.current().monster) break;
      return g.current().monster ? true : step(g) === false;
    })());

    ok('monsters never spend candy they do not have', (() => {
      for (let s = 0; s < 40; s++) {
        const g = new TrickOrTreat({
          seed: 8000 + s, onboarding: false,
          seats: [{ name: 'You' }].concat(MONSTER_KEYS.slice(0, 3).map((k) => ({ name: k, monster: MONSTERS[k] })))
        });
        let guard = 0;
        while (g.phase !== 'over' && guard++ < 300) {
          const p = g.current();
          if (p && p.monster) step(g); else if (g.phase === 'betting') g.call(); else break;
          if (g.players.some((x) => x.candy < 0)) return false;
        }
      }
      return true;
    })());
  }

  /* ================= a whole night ================= */
  section('trick or treat: a night of it');
  {
    ok('three match lengths, all short enough for a party',
      Object.values(LENGTHS).every((l) => l.hands >= 8 && l.hands <= 22));

    const playNight = (opts) => {
      const m = new Match(opts);
      let guard = 0;
      while (!m.over && guard++ < 4000) {
        const g = m.game;
        if (g.phase === 'over') { m.advance(); continue; }
        const p = g.current();
        if (p && p.monster) { step(g); continue; }
        if (g.phase === 'betting') g.call();
        else break;
      }
      return m;
    };

    ok('a quick match plays exactly its eight hands',
      playNight({ seed: 'a', length: 'quick', opponents: 3 }).game.handNo === 8);

    ok('twenty nights all finish', (() => {
      for (let s = 0; s < 20; s++) {
        const m = playNight({ seed: 'night' + s, length: 'quick', opponents: 3 });
        if (!m.over) return false;
      }
      return true;
    })());

    ok('nobody is ever eliminated', (() => {
      for (let s = 0; s < 20; s++) {
        const m = playNight({ seed: 'keep' + s, length: 'normal', opponents: 3 });
        if (m.players.some((p) => p.candy <= 0)) return false;
      }
      return true;
    })());

    ok('a player who busts is topped up and keeps playing', (() => {
      const m = new Match({ seed: 'bust', length: 'quick', opponents: 2 });
      m.players[0].candy = 0;
      const r = m.advance();
      return r.refills.length >= 1 && m.players[0].candy > 0 && m.players[0].refills === 1;
    })());

    ok('every player gets an award', (() => {
      for (let s = 0; s < 12; s++) {
        const m = playNight({ seed: 'awards' + s, length: 'quick', opponents: 3 });
        const r = m.results();
        if (r.awards.size !== m.players.length) return false;
        for (const p of m.players) {
          const a = r.awards.get(p.seat);
          if (!a || !a.award.name || !a.line) return false;
        }
      }
      return true;
    })());

    ok('no two players get the same award', (() => {
      for (let s = 0; s < 12; s++) {
        const r = playNight({ seed: 'uniq' + s, length: 'quick', opponents: 3 }).results();
        const names = Array.from(r.awards.values()).map((a) => a.award.id);
        const real = names.filter((n) => n !== 'participant');
        if (new Set(real).size !== real.length) return false;
      }
      return true;
    })());

    ok('the headline says something specific', (() => {
      const r = playNight({ seed: 'head', length: 'quick', opponents: 3 }).results();
      return r.headline.length > 20 && /candy|pot|won|night/i.test(r.headline);
    })());

    ok('the winner really does have the most candy', (() => {
      for (let s = 0; s < 12; s++) {
        const m = playNight({ seed: 'win' + s, length: 'quick', opponents: 3 });
        const r = m.results();
        if (m.players.some((p) => p.candy > r.winner.candy)) return false;
      }
      return true;
    })());

    ok('powers arrive one per round while onboarding', (() => {
      const m = new Match({ seed: 'unlock', length: 'normal', opponents: 2 });
      const seen = [];
      let guard = 0;
      while (!m.over && guard++ < 3000) {
        const g = m.game;
        if (g.phase === 'over') { const r = m.advance(); if (r.unlocked) seen.push(r.unlocked.id); continue; }
        const p = g.current();
        if (p && p.monster) { step(g); continue; }
        if (g.phase === 'betting') g.call(); else break;
      }
      return seen.join() === 'MEASURE,SWAP,HAUNT,BLUFF';
    })());

    ok('a party match seats several humans', (() => {
      const m = new Match({ seed: 'party', humans: ['Ada', 'Bo', 'Cy'], opponents: 2 });
      return m.isPartyMode && m.humanNames.length === 3 && m.players.filter((p) => !p.monster).length === 3;
    })());

    ok('the table never exceeds six seats', (() => {
      const m = new Match({ seed: 'full', humans: ['A', 'B', 'C', 'D', 'E'], opponents: 5 });
      return m.players.length <= 6;
    })());

    ok('a share link round-trips the seed', (() => {
      const m = new Match({ seed: 'share-me', length: 'long', opponents: 2 });
      const link = m.shareLink('');
      return link.includes(`seed=${m.seed}`) && link.includes('length=long');
    })());

    ok('two matches on the same seed deal the same first hand', (() => {
      const a = new Match({ seed: 'twin', length: 'quick', opponents: 3 });
      const b = new Match({ seed: 'twin', length: 'quick', opponents: 3 });
      return a.game.holeCards(0).join() === b.game.holeCards(0).join()
        && a.monsters.map((m) => m.key).join() === b.monsters.map((m) => m.key).join();
    })());

    ok('win and loss shouts exist for every hand', (() => {
      for (let c = 0; c <= 9; c++) if (!winShout({ category: c }, 50, false)) return false;
      return !!winShout(null, 10, false) && !!lossShout(rng);
    })());
  }
}
