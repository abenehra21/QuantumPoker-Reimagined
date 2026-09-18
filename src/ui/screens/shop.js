/**
 * ui/screens/shop.js — between rounds.
 *
 * Also the run-over screen, because the difference between "you passed" and
 * "you did not" is one banner and whether the Continue button exists.
 */
import { h, clear, num, copy } from '../dom.js';
import { icon } from '../../render/art.js';
import { cardEl } from '../components/card.js';
import { attach, wireTerms } from '../tooltip.js';
import { toast, errorToast } from '../toast.js';
import { SFX } from '../../audio/sfx.js';
import { priceFor, rerollCost, COSMETICS } from '../../gameplay/shop.js';
import { RELICS } from '../../gameplay/relics.js';
import { CARDS, RARITY } from '../../gameplay/cards.js';
import { MODES, targetFor } from '../../gameplay/modes.js';
import { bossFor, isBossRound } from '../../gameplay/bosses.js';
import { clearRun } from '../../save/store.js';

export const title = 'Shop';
export const mood = 'shop';
export const rebuild = true;

let view = null;

export function build(app, opts) {
  view = new ShopView(app, opts);
  return view.root;
}

export function enter(app, opts) { if (view) view.refresh(); }

export function key(e, app) {
  if (!view) return false;
  if (e.key === 'r') { view.reroll(); return true; }
  if (e.key === 'Enter' && !view.over) { view.next(); return true; }
  return false;
}

class ShopView {
  constructor(app, opts) {
    this.app = app;
    this.run = opts.run || app.run;
    this.over = !!opts.over;
    this.root = h('div.shop.screen-inner.col');
    if (!this.over) this.run.openShop();
    this.render();
  }

  render() {
    clear(this.root);
    this.over ? this.renderOver() : this.renderShop();
    wireTerms(this.root);
  }

  /* ---- the run is finished ---- */

  renderOver() {
    const r = this.run;
    const won = r.outcome && r.outcome.win;
    this.app.accent(won ? 'var(--lime)' : 'var(--rose)');

    this.root.appendChild(h('div.center.col', { style: { gap: 'var(--s4)', padding: 'var(--s6) 0' } }, [
      h('h1', { text: won ? 'Run complete' : 'Run over', style: { fontSize: 'var(--fs-3xl)' } }),
      h('p.dim', { text: r.outcome ? describeOutcome(r) : '' }),
      h('div.row.wrap.center', [
        stat('Rounds', r.round),
        stat('Hands', r.stats.handsPlayed),
        stat('Hands won', r.stats.handsWon),
        stat('Best hand', r.stats.bestScore + ' ones'),
        stat('Coherences', r.stats.coherences),
        stat('Bosses beaten', r.stats.bossesBeaten),
        stat('Gates played', r.stats.gatesPlayed),
        stat('Avg entropy', r.averageEntropy.toFixed(2) + ' bits')
      ])
    ]));

    if (r.relics.length) {
      this.root.appendChild(h('div.panel.panel-pad', [
        h('div.panel-title', { text: 'What you were carrying' }),
        h('div.relic-row', r.relics.map((id) => relicChip(id)))
      ]));
    }

    this.root.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: 'Your deck at the end' }),
      h('div.deck-strip', r.deck.map((id) => cardEl(id, { mini: true, focusable: false })))
    ]));

    if (r.log.length) {
      this.root.appendChild(h('div.panel.panel-pad', [
        h('div.panel-title', { text: 'Round by round' }),
        h('table.data-table', [
          h('thead', h('tr', [h('th', { text: 'Round' }), h('th', { text: 'Boss' }),
            h('th.num', { text: 'Finished' }), h('th.num', { text: 'Needed' }), h('th', { text: '' })])),
          h('tbody', r.log.map((l) => h('tr', [
            h('td', { text: String(l.round) }),
            h('td', { text: l.boss || '—' }),
            h('td.num', { text: num(l.chips) }),
            h('td.num', { text: num(l.target || 0) }),
            h('td', { html: l.survived ? '<span style="color:var(--good)">passed</span>' : '<span style="color:var(--bad)">out</span>' })
          ])))
        ])
      ]));
    }

    this.root.appendChild(h('div.row.center.wrap', { style: { gap: 'var(--s3)' } }, [
      h('button.btn.btn-primary', {
        text: 'Run it again', onclick: () => { SFX.click(); clearRun(); this.app.accent(); this.app.router.go('table', { mode: this.run.mode.key, force: true }); }
      }),
      h('button.btn', {
        html: icon('share') + '<span>Share seed</span>',
        onclick: async () => {
          const url = `${location.origin}${location.pathname}?mode=${this.run.mode.key}&seed=${this.run.seed}`;
          const text = `Quantum Poker — ${this.run.mode.name}\nReached round ${this.run.round}, ${this.run.stats.coherences} Coherence${this.run.stats.coherences === 1 ? '' : 's'}\n${url}`;
          const ok = await copy(text);
          toast({ icon: ok ? '✓' : '!', body: ok ? 'Seed and result copied.' : 'Could not copy.' });
        }
      }),
      h('button.btn.btn-ghost', { text: 'Menu', onclick: () => { SFX.back(); clearRun(); this.app.accent(); this.app.router.go('menu'); } })
    ]));
  }

  /* ---- the shop proper ---- */

  renderShop() {
    const r = this.run;
    const nextRound = r.round + 1;
    const boss = r.mode.endless && isBossRound(nextRound) ? bossFor(nextRound, () => 0.5) : null;

    this.root.appendChild(h('div.shop-head', [
      h('div', [
        h('h2', { text: `Round ${r.round} cleared` }),
        h('p.dim.small', {
          text: `Next: round ${nextRound}, keep ${num(targetFor(r.mode, nextRound, r.mode.startChips))} chips.` +
            (boss ? ` ${boss.name} is waiting.` : '')
        })
      ]),
      h('div.grow'),
      h('div.pot', [h('span', { text: num(r.bank) })]),
      h('span.dim.small', { text: 'to spend' })
    ]));

    if (boss) {
      this.root.appendChild(h('div.panel.panel-pad', {
        style: { borderColor: boss.accent, boxShadow: `0 0 26px color-mix(in srgb, ${boss.accent} 26%, transparent)` }
      }, [
        h('div.row', [
          h('h3', { text: `${boss.name} — ${boss.title}`, style: { color: boss.accent } }),
          h('div.grow'),
          h('span.badge', { style: { '--tone': boss.accent }, text: 'BOSS' })
        ]),
        h('p', { text: boss.warning, style: { marginTop: 'var(--s2)' } }),
        h('p.small.dim', { text: boss.physics })
      ]));
    }

    this.gridEl = h('div.shop-grid');
    this.root.appendChild(this.gridEl);

    this.root.appendChild(h('div.row.wrap', [
      h('button.btn', {
        html: icon('reroll') + `<span>Reroll · ${r.rerollPrice() === 0 ? 'free' : num(r.rerollPrice())}</span>`,
        onclick: () => this.reroll()
      }),
      h('span.dim.small', { text: `${r.freeRerollsLeft()} free reroll${r.freeRerollsLeft() === 1 ? '' : 's'} left` }),
      h('div.grow'),
      h('button.btn.btn-primary', { text: 'Next round · Enter', onclick: () => this.next() })
    ]));

    this.root.appendChild(h('div.panel.panel-pad', [
      h('div.panel-title', { text: `Your relics (${r.relics.length})` }),
      r.relics.length
        ? h('div.relic-row', r.relics.map((id) => relicChip(id)))
        : h('p.dim.small', { text: 'None yet. Relics change the rules in your favour for the whole run.' })
    ]));

    this.root.appendChild(h('div.panel.panel-pad', [
      h('div.row', [
        h('div.panel-title', { text: `Your deck (${r.deck.length} cards)` }),
        h('div.grow'),
        h('span.dim.tiny', { text: 'A smaller deck draws its best cards more often.' })
      ]),
      h('div.deck-strip', r.deck.map((id) => cardEl(id, { mini: true, focusable: false })))
    ]));

    this.refresh();
  }

  refresh() {
    if (this.over || !this.gridEl) return;
    clear(this.gridEl);
    const r = this.run;
    const relics = r.relicSet;
    r.shopState.items.forEach((item, i) => {
      const price = priceFor(item, relics);
      const el = h('div.shop-item' + (item.sold ? '.sold' : ''), { dataset: { rarity: item.rarity } }, [
        h('div.row', [
          h('strong', { text: item.name }),
          h('div.grow'),
          h('span.tag-rarity', { dataset: { r: item.rarity }, text: item.kind })
        ]),
        item.kind === 'card' ? h('div.center', { style: { padding: 'var(--s2) 0' } }, [cardEl(item.id, { focusable: false })]) : null,
        item.kind === 'relic' ? h('div', { style: { fontSize: 'var(--fs-2xl)', textAlign: 'center', color: 'var(--rarity)' }, text: RELICS[item.id].icon }) : null,
        h('p.small', { text: item.blurb }),
        item.flavour ? h('p.flavour', { text: item.flavour }) : null,
        h('div.row', [
          h('span.price', { text: num(price) }),
          h('div.grow'),
          h('button.btn.btn-sm' + (price <= r.bank ? '.btn-primary' : ''), {
            text: item.sold ? 'Sold' : 'Buy',
            disabled: item.sold || price > r.bank,
            onclick: () => this.buy(i, item)
          })
        ])
      ]);
      this.gridEl.appendChild(el);
    });
  }

  buy(i, item) {
    if (item.kind === 'service') { this.pickFromDeck(i, item); return; }
    const res = this.run.buy(i);
    if (!res.ok) { errorToast(res.why); return; }
    SFX.buy();
    toast({ icon: '✓', title: item.name, body: `Bought for ${num(res.price)}.`, tone: RARITY[item.rarity] ? RARITY[item.rarity].tint : null });
    if (item.kind === 'cosmetic') this.app.applySettings();
    this.render();
  }

  /** Incinerate and Duplicate both need you to point at a card first. */
  pickFromDeck(index, item) {
    const overlay = h('div.overlay.open', { role: 'dialog', 'aria-modal': 'true' });
    const close = () => overlay.remove();
    overlay.appendChild(h('div.overlay-card.panel.panel-hi', [
      h('div.overlay-head', [
        h('h3', { text: item.id === 'burn' ? 'Remove which card?' : 'Copy which card?' }),
        h('div.grow'),
        h('button.btn.btn-icon.btn-ghost', { html: icon('close'), onclick: close })
      ]),
      h('div.overlay-body', [
        h('div.deck-strip', { style: { gap: 'var(--s2)' } },
          this.run.deck.map((id) => cardEl(id, {
            mini: true,
            onPick: () => {
              const res = this.run.buy(index, id);
              close();
              if (!res.ok) { errorToast(res.why); return; }
              SFX.buy();
              toast({ icon: '✓', body: item.id === 'burn' ? `${CARDS[id].name} removed.` : `${CARDS[id].name} duplicated.` });
              this.render();
            }
          })))
      ])
    ]));
    document.body.appendChild(overlay);
  }

  reroll() {
    const res = this.run.reroll();
    if (!res || !res.ok) { errorToast(res ? res.why : 'Cannot reroll.'); return; }
    SFX.shop();
    this.render();
  }

  next() {
    SFX.click();
    this.app.accent(this.run.mode.accent);
    this.app.router.go('table', { mode: this.run.mode.key, run: this.run, force: true });
  }
}

function stat(label, value) {
  return h('div.stat', { style: { minWidth: '130px' } }, [
    h('div.label', { text: label }),
    h('div.value', { text: String(value) })
  ]);
}

function relicChip(id) {
  const r = RELICS[id];
  if (!r) return h('span');
  const el = h('div.relic-chip', [
    h('span.glyph', { text: r.icon }),
    h('span', { text: r.name })
  ]);
  attach(el, { title: r.name, body: r.blurb, physics: r.flavour });
  return el;
}

function describeOutcome(r) {
  const o = r.outcome;
  if (!o) return '';
  if (o.win) return `You cleared every round of ${r.mode.name}.`;
  if (o.reason === 'busted') return `You ran out of chips in round ${o.round}.`;
  return `Round ${o.round}: you finished on ${num(o.chips)} and needed ${num(o.target)}.`;
}
