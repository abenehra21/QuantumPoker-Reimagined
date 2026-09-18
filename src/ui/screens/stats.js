/**
 * ui/screens/stats.js — the dashboard.
 *
 * Numbers people actually care about, plus the achievement wall. The charts
 * are hand-drawn SVG: a bar chart and a sparkline are twenty lines each and
 * a charting library is two hundred kilobytes.
 */
import { h, clear, num, pct } from '../dom.js';
import { icon } from '../../render/art.js';
import { attach } from '../tooltip.js';
import { ACHIEVEMENTS, progress } from '../../save/achievements.js';
import { CARDS, RARITY, CARD_IDS } from '../../gameplay/cards.js';
import { BOSSES } from '../../gameplay/bosses.js';
import { SFX } from '../../audio/sfx.js';

export const title = 'Statistics';
export const mood = 'menu';
export const rebuild = true;

export function build(app) {
  const p = app.profile;
  const t = p.totals;
  const root = h('div.stats.grow.col');

  root.appendChild(h('div.row', [
    h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back', onclick: () => app.router.back() }),
    h('h2', { text: 'Statistics' }),
    h('div.grow'),
    h('span.dim.small', { text: `${formatTime(t.playSeconds)} played` })
  ]));

  const winRate = t.hands ? t.handsWon / t.hands : 0;
  const foldRate = t.hands ? t.folds / t.hands : 0;
  const aggression = (t.raises + t.calls) ? t.raises / (t.raises + t.calls) : 0;

  root.appendChild(h('div.stat-grid', [
    stat('Hands played', num(t.hands)),
    stat('Hands won', num(t.handsWon), pct(winRate) + ' of them'),
    stat('Fold rate', pct(foldRate), foldRate > 0.6 ? 'tight' : foldRate < 0.25 ? 'loose' : 'balanced'),
    stat('Aggression', pct(aggression), 'raises vs calls'),
    stat('Gates played', num(t.gates)),
    stat('Measurements', num(t.collapses)),
    stat('Pairs entangled', num(t.links)),
    stat('Coherences', num(t.coherences), 'all five coins on 1'),
    stat('Best round', num(p.best.round)),
    stat('Biggest pot', num(p.best.pot)),
    stat('Best entropy', (p.best.entropy || 0).toFixed(2) + ' bits', 'most undecided board taken to showdown'),
    stat('Chips won', num(t.chipsWon))
  ]));

  // Favourite gates.
  const counts = p.gateCounts || {};
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  if (top.length) {
    const max = top[0][1];
    root.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: 'Your hands, by card' }),
      h('div.bar-chart', top.map(([id, n]) => {
        const bar = h('i', {
          style: {
            height: (n / max * 100) + '%',
            background: `linear-gradient(180deg, ${RARITY[CARDS[id] ? CARDS[id].rarity : 'common'].tint}, transparent)`
          }
        });
        attach(bar, { title: CARDS[id] ? CARDS[id].name : id, body: `Played ${num(n)} times.` });
        return bar;
      })),
      h('div.row', { style: { gap: '4px', marginTop: 'var(--s2)' } },
        top.map(([id]) => h('div.tiny.dim', {
          style: { flex: '1 1 0', maxWidth: '64px', textAlign: 'center', overflow: 'hidden' },
          text: CARDS[id] ? CARDS[id].symbol : id
        })))
    ]));
  }

  // Cards never played: a to-do list, which is more motivating than a total.
  const unplayed = CARD_IDS.filter((id) => !counts[id]);
  if (unplayed.length) {
    root.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: `Never played (${unplayed.length} of ${CARD_IDS.length})` }),
      h('div.row.wrap', { style: { gap: 'var(--s2)' } }, unplayed.map((id) => {
        const el = h('span.badge', { style: { '--tone': RARITY[CARDS[id].rarity].tint }, text: CARDS[id].name });
        attach(el, { title: CARDS[id].name, body: CARDS[id].blurb, physics: CARDS[id].physics });
        return el;
      }))
    ]));
  }

  // Bosses.
  root.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'Bosses' }),
    h('div.row.wrap', Object.values(BOSSES).map((b) => {
      const beaten = (p.bosses || []).includes(b.key);
      const el = h('div.relic-chip', {
        style: beaten ? { borderColor: b.accent, color: b.accent } : { opacity: '.45' }
      }, [
        h('span.glyph', { html: beaten ? icon('check') : icon('lock'), style: { display: 'inline-flex' } }),
        h('span', { text: b.name })
      ]);
      attach(el, { title: `${b.name} — ${b.title}`, body: b.warning, physics: b.physics, tone: b.accent });
      return el;
    }))
  ]));

  // Daily streak.
  root.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'Daily Deal' }),
    h('div.row.wrap', [
      stat('Played', num(p.daily.played || 0)),
      stat('Streak', num(p.daily.streak || 0)),
      stat('Best streak', num(p.daily.bestStreak || 0))
    ])
  ]));

  // Achievements.
  const prog = progress(p);
  const got = new Set(p.achievements || []);
  root.appendChild(h('div.panel.panel-pad', [
    h('div.row', [
      h('div.panel-title', { text: 'Achievements' }),
      h('div.grow'),
      h('span.mono.small', { text: `${prog.got} / ${prog.total}` })
    ]),
    h('div.bar', { style: { marginBottom: 'var(--s4)' } }, [h('i', { style: { '--val': (prog.pct * 100) + '%' } })]),
    h('div.ach-grid', ACHIEVEMENTS.map((a) => {
      const have = got.has(a.id);
      const hidden = a.secret && !have;
      return h('div.ach' + (have ? '.got' : ''), { dataset: { tier: a.tier } }, [
        h('div.glyph', { text: hidden ? '?' : a.icon }),
        h('div', [
          h('div.name', { text: hidden ? 'Secret' : a.name }),
          h('div.desc', { text: hidden ? 'Found by playing.' : a.blurb })
        ])
      ]);
    }))
  ]));

  return root;
}

function stat(label, value, sub) {
  const text = String(value);
  return h('div.stat', [
    h('div.label', { text: label }),
    h('div.value' + (text.length > 7 ? '.long' : ''), { text, title: text }),
    sub ? h('div.sub', { text: sub }) : null
  ]);
}

function formatTime(secs) {
  if (!secs) return 'no time';
  const h1 = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  if (h1) return `${h1}h ${m}m`;
  if (m) return `${m}m`;
  return `${secs}s`;
}

export function key(e, app) {
  if (e.key === 'Escape') { app.router.back(); return true; }
  return false;
}
