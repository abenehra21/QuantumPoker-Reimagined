/**
 * ui/screens/results.js — what just happened, and why.
 *
 * The after-action report is the teaching moment. It shows every board that
 * went to showdown, then explains in plain words which card mattered, what
 * the odds were before the coins landed, and what the better line would
 * have been. This is the part that turns a lucky win into a lesson.
 */
import { h, clear, num, pct, trapFocus } from '../dom.js';
import { wireTerms } from '../tooltip.js';
import { icon } from '../../render/art.js';
import { cardEl } from '../components/card.js';
import { rankName } from '../../gameplay/game.js';
import { CARDS } from '../../gameplay/cards.js';
import { plan, SKILL, describeLine } from '../../gameplay/planner.js';
import { scoreDistribution, entropy, findLinks } from '../../quantum/read.js';
import { SFX } from '../../audio/sfx.js';
import { wait } from '../../engine/tween.js';

let overlay = null;

export function openResults(app, game, run, onClose) {
  if (!overlay) {
    overlay = h('div.overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Hand results' });
    document.body.appendChild(overlay);
  }
  clear(overlay);

  const body = h('div.overlay-body.results-body');
  const card = h('div.overlay-card.panel.panel-hi', [
    h('div.overlay-head', [
      h('h3', { text: game.results.uncontested ? 'Everyone folded' : 'Showdown' }),
      h('div.grow'),
      h('button.btn.btn-icon.btn-ghost', { html: icon('close'), 'aria-label': 'Close',
        onclick: () => close(onClose) })
    ]),
    body,
    h('div.overlay-foot', [
      h('button.btn.btn-primary', { text: 'Continue · Space', onclick: () => close(onClose) })
    ])
  ]);
  overlay.appendChild(card);

  body.appendChild(h('p', { text: game.results.summary, style: { fontSize: 'var(--fs-lg)' } }));

  // Every board that reached showdown, side by side.
  if (!game.results.uncontested) {
    const winners = new Set();
    game.results.pots.forEach((p) => p.winners.forEach((w) => winners.add(w)));
    for (const p of game.players) {
      if (p.score === null) continue;
      body.appendChild(resultLine(p, winners.has(p.seat)));
    }
  }

  body.appendChild(explain(game, run));

  overlay.classList.add('open');
  wireTerms(overlay);
  const release = trapFocus(overlay);
  overlay._release = release;
  const btn = overlay.querySelector('.btn-primary');
  if (btn) btn.focus();

  overlay._key = (e) => {
    if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); close(onClose); }
  };
  window.addEventListener('keydown', overlay._key);

  // The bits land one at a time, left to right.
  const bits = overlay.querySelectorAll('.bit');
  bits.forEach((b, i) => { b.style.animationDelay = (i * 60) + 'ms'; b.classList.add('landing'); });
}

function close(onClose) {
  if (!overlay) return;
  overlay.classList.remove('open');
  if (overlay._key) window.removeEventListener('keydown', overlay._key);
  if (overlay._release) overlay._release();
  SFX.click();
  if (onClose) onClose();
}

function resultLine(p, won) {
  return h('div.result-line' + (won ? '.winner' : ''), [
    h('div', [
      h('div', { text: p.name, style: { fontWeight: '600' } }),
      h('div.tiny.dim', { text: p.plays.length ? p.plays.map((x) => CARDS[x.card].name).join(' · ') : 'played nothing' })
    ]),
    h('div.bits', p.bits.map((b) => h('div.bit' + (b ? '.one' : '.zero'), { text: String(b) }))),
    h('div.mono', { text: rankName(p.score) }),
    h('div.mono', { style: { color: won ? 'var(--amber)' : 'var(--ink-faint)' },
      text: won ? '+' + num(p.won) : '—' })
  ]);
}

/**
 * The explanation. Three questions: what were your odds, which card did the
 * work, and was there a better line? All three are computed, not canned.
 */
function explain(game, run) {
  const hero = game.hero();
  const wrap = h('div.explain-block');

  if (hero.folded) {
    wrap.appendChild(h('p', { html: 'You folded, so your board never landed. Folding is free; calling a bet you cannot win is not.' }));
    return wrap;
  }
  if (!hero.board) return wrap;

  const dist = hero.dist || scoreDistribution(hero.board);
  const expected = dist.reduce((s, p, i) => s + p * i, 0);
  const lines = [];

  lines.push(`Your board expected <strong>${expected.toFixed(2)}</strong> ones and landed <strong>${hero.score}</strong>. ` +
    (hero.score > expected + 0.7 ? 'You ran better than the maths said.'
      : hero.score < expected - 0.7 ? 'You ran worse than the maths said. That happens; the maths was still right.'
      : 'About what it should have been.'));

  if (hero.entropy !== undefined && hero.entropy > 0.1) {
    lines.push(`You took <strong>${hero.entropy.toFixed(1)} bits</strong> of <span data-term="entropy">entropy</span> to the showdown — ` +
      `${(dist[game.coins] * 100).toFixed(0)}% of your possible endings were Coherence, and ${(dist[0] * 100).toFixed(0)}% were Blank.`);
  } else {
    lines.push('Your board was fully settled before the coins landed. No luck involved either way.');
  }

  // Which card mattered: replay the circuit and diff the expected score.
  if (hero.plays.length) {
    let best = null;
    for (const play of hero.plays) {
      const before = play.before;
      if (!before) continue;
      const after = replayThrough(hero, play);
      if (!after) continue;
      const d = expectedOnes(after) - expectedOnes(before);
      if (!best || d > best.delta) best = { play, delta: d };
    }
    if (best && best.delta > 0.05) {
      lines.push(`The card that did the work was <strong>${CARDS[best.play.card].name}</strong>, worth ` +
        `<strong>+${best.delta.toFixed(2)}</strong> expected ones on its own.`);
    } else if (best) {
      lines.push('None of your cards moved the expected score much. Sometimes there is nothing there.');
    }
  } else {
    lines.push('You played no cards. On a board with nothing to fix, that is correct.');
  }

  // Was there a better line? Ask the perfect planner, on the board you had.
  const openingBoard = hero.plays.length && hero.plays[0].before ? hero.plays[0].before : hero.board;
  const heldCards = hero.plays.map((p) => p.card).concat(hero.hand);
  if (heldCards.length) {
    const ideal = plan(openingBoard, heldCards, { skill: SKILL.perfect, upTo: game.coins });
    const yours = expectedOnes(hero.board);
    if (ideal.value > yours + 0.12) {
      lines.push(`A better line was available: <strong>${describeLine(ideal.line)}</strong> ` +
        `would have expected ${ideal.value.toFixed(2)} instead of ${yours.toFixed(2)}.`);
    } else {
      lines.push('That was the best line available with those cards.');
    }
  }

  const links = hero.links || findLinks(hero.board);
  if (links.length) {
    lines.push(`You went to showdown with ${links.length} <span data-term="entanglement">entangled</span> pair${links.length > 1 ? 's' : ''}. ` +
      'A linked pair is all or nothing: it doubles your swing in both directions.');
  }
  if (hero.noiseLog && hero.noiseLog.length) {
    lines.push(`<strong>${hero.noiseLog.length}</strong> noise event${hero.noiseLog.length > 1 ? 's' : ''} hit your board. ` +
      'On real hardware that is not bad luck, it is Tuesday.');
  }

  for (const l of lines) wrap.appendChild(h('p', { html: l }));
  return wrap;
}

function expectedOnes(st) {
  let s = 0;
  for (let q = 0; q < st.n; q++) s += st.probOne(q);
  return s;
}

/** The board immediately after a given play, from the recorded circuit. */
function replayThrough(player, play) {
  const idx = player.plays.indexOf(play);
  if (idx < 0) return null;
  const next = player.plays[idx + 1];
  return next && next.before ? next.before : player.board;
}
