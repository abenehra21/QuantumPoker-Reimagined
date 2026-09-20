/**
 * ui/screens/spooky-results.js — the end of the night.
 *
 * A scoreboard nobody loses. Everyone is ranked by candy, and everyone also
 * gets a title, because the point of the last screen at a party is that
 * people want to play again rather than that a winner is established.
 */
import { h, clear, copy } from '../dom.js';
import { icon } from '../../render/art.js';
import { toast } from '../toast.js';
import { SFX } from '../../audio/sfx.js';
import { SPOOK } from '../../halloween/sounds.js';
import { candyCount } from '../../halloween/ui/candyview.js';
import { format } from '../../halloween/candy.js';
import { decorate, undecorate, faceOf } from './spooky-intro.js';

export const title = 'The night is over';
export const mood = 'victory';
export const rebuild = true;

let view = null;

export function build(app, opts) { view = new Scoreboard(app, opts || {}); return view.root; }
export function enter(app) {
  document.documentElement.dataset.theme = 'spooky';
  app.accent('var(--pumpkin)', 'var(--witch)');
  decorate(app);
  if (view) view.celebrate();
}
export function leave(app) {
  document.documentElement.dataset.theme = '';
  app.accent();
  undecorate();
}
export function key(e, app) {
  if (e.key === 'Escape' || e.key === 'Enter') { app.router.go('spooky-intro'); return true; }
  return false;
}

class Scoreboard {
  constructor(app, opts) {
    this.app = app;
    this.match = opts.match || app.spooky;
    this.root = h('div.scoreboard.grow.col');
    this.render();
  }

  render() {
    clear(this.root);
    if (!this.match) {
      this.root.appendChild(h('p', { text: 'No night to report.' }));
      return;
    }
    const r = this.match.results();
    const t = r.totals;

    this.root.appendChild(h('div.center.col', { style: { gap: 'var(--s2)' } }, [
      h('h1.spooky-title', { style: { fontSize: 'clamp(30px, 6vw, 62px)' },
        text: '\u{1F383} GAME OVER \u{1F383}' }),
      h('p.spooky-pitch', { style: { maxWidth: '40ch' }, text: r.headline })
    ]));

    // The scoreboard.
    this.root.appendChild(h('div.col', { style: { gap: 'var(--s2)' } },
      r.ranked.map((p, i) => {
        const a = r.awards.get(p.seat);
        return h('div.score-row' + (i === 0 ? '.first' : ''), { style: { '--i': i } }, [
          h('div.place', { text: i === 0 ? '\u{1F451}' : String(i + 1) }),
          h('div', [
            h('div.row', { style: { gap: 'var(--s2)' } }, [
              h('span', { text: p.monster ? faceOf(p.monster) : '\u{1F9D1}' }),
              h('strong', { text: p.name })
            ]),
            h('div.award', { text: `${a.award.icon} ${a.award.name}` }),
            h('div.award-line', { text: a.line })
          ]),
          candyCount(p.candy, { big: i === 0 }),
          h('div.tally', { html:
            `${p.handsWon} pot${p.handsWon === 1 ? '' : 's'}<br>` +
            `${p.stats.showdowns} shown<br>` +
            (p.refills ? `${p.refills} refill${p.refills === 1 ? '' : 's'}` : '\u2014') })
        ]);
      })));

    // The numbers from the night.
    this.root.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: 'The night in numbers' }),
      h('div.row.wrap', { style: { gap: 'var(--s4)' } }, [
        stat('Hands', t.hands),
        stat('Biggest pot', '\u{1F36C}' + format(t.biggestPot)),
        stat('Powers cast', t.powers),
        stat('Collapses', t.collapses)
      ])
    ]));

    // Everything anybody did, for the arguments afterwards.
    this.root.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: 'Who did what' }),
      h('table.data-table', [
        h('thead', h('tr', [
          h('th', { text: '' }), h('th.num', { text: 'Won' }), h('th.num', { text: 'Lost' }),
          h('th.num', { text: 'Bluffs' }), h('th.num', { text: 'Measures' }),
          h('th.num', { text: 'Swaps' }), h('th.num', { text: 'Haunts' }),
          h('th.num', { text: 'All-ins' }), h('th', { text: 'Best hand' })
        ])),
        h('tbody', r.ranked.map((p) => h('tr', [
          h('td', { text: p.name }),
          h('td.num', { text: format(p.stats.candyWon) }),
          h('td.num', { text: format(p.stats.candyLost) }),
          h('td.num', { text: String(p.stats.bluffs) }),
          h('td.num', { text: String(p.stats.measures) }),
          h('td.num', { text: String(p.stats.swaps) }),
          h('td.num', { text: String(p.stats.haunts) }),
          h('td.num', { text: String(p.stats.allIns) }),
          h('td', { text: p.stats.bestHandName || '—' })
        ])))
      ])
    ]));

    this.root.appendChild(h('div.row.center.wrap', { style: { gap: 'var(--s3)' } }, [
      h('button.btn.btn-primary.btn-lg', {
        text: '\u{1F36C}  Again',
        onclick: () => { SFX.click(); this.app.router.go('spooky', { force: true }); }
      }),
      h('button.btn', {
        text: 'Change the table',
        onclick: () => { SFX.click(); this.app.router.go('spooky-intro'); }
      }),
      h('button.btn.btn-ghost', {
        html: icon('share') + '<span>Share this night</span>',
        onclick: async () => {
          const link = this.match.shareLink(location.origin + location.pathname);
          const text = `\u{1F383} Quantum Trick or Treat\n${r.headline}\n${link}`;
          const ok = await copy(text);
          toast({ icon: ok ? '✓' : '!', body: ok ? 'Copied. Same deals for whoever you send it to.' : 'Could not copy.' });
        }
      }),
      h('button.btn.btn-ghost', {
        text: 'Main menu',
        onclick: () => { SFX.back(); this.app.router.go('menu'); }
      })
    ]));
  }

  celebrate() {
    if (!this.match) return;
    const P = this.app.particles;
    SPOOK.win(true);
    P.confetti(innerWidth, innerHeight, [[255, 139, 44], [168, 85, 247], [134, 239, 172], [248, 231, 192]]);
    setTimeout(() => P.confetti(innerWidth, innerHeight, [[255, 139, 44], [255, 200, 80]]), 500);
  }
}

function stat(label, value) {
  return h('div.stat', { style: { minWidth: '120px', flex: '1 1 120px' } }, [
    h('div.label', { text: label }),
    h('div.value', { text: String(value) })
  ]);
}
