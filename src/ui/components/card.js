/**
 * ui/components/card.js — a gate card.
 *
 * One builder used by the hand, the shop, the codex, the deck view and the
 * sandbox palette, so a card looks and behaves the same everywhere.
 */
import { h } from '../dom.js';
import { attach } from '../tooltip.js';
import { CARDS, RARITY } from '../../gameplay/cards.js';
import { gateArt } from '../../render/art.js';
import { SFX } from '../../audio/sfx.js';

export function cardEl(id, opts = {}) {
  const c = CARDS[id];
  if (!c) return h('div.card', { text: id });
  const r = RARITY[c.rarity];

  const el = h(opts.mini ? 'button.card.card-mini' : 'button.card', {
    type: 'button',
    dataset: { rarity: c.rarity, card: id },
    'aria-label': `${c.name}. ${c.blurb}`,
    tabindex: opts.focusable === false ? -1 : 0
  }, [
    h('div.card-rarity-bar'),
    h('div.card-head', [
      h('span.card-name', { text: c.name }),
      h('span.card-gate', { text: c.gate })
    ]),
    h('div.card-art', { html: gateArt(id) }),
    opts.mini ? null : h('div.card-foot', { text: c.blurb }),
    opts.price ? h('div.card-cost', { text: opts.price }) : null
  ]);

  attach(el, {
    title: `${c.name}  ·  ${r.name}`,
    body: `<p>${c.blurb}</p>` + (c.pick && c.pick.length
      ? `<p class="dim tiny">Pick: ${c.pick.join(', then ')}</p>` : ''),
    physics: c.physics,
    hint: c.hint,
    tone: r.tint
  });

  el.addEventListener('pointerenter', () => SFX.cardHover());
  if (opts.onPick) {
    el.addEventListener('click', () => { SFX.cardPick(); opts.onPick(id, el); });
  }
  return el;
}

/** Deal a card in from off-screen, staggered by index. */
export function dealIn(el, index = 0, from = {}) {
  el.style.setProperty('--from-x', (from.x || 0) + 'px');
  el.style.setProperty('--from-y', (from.y === undefined ? -300 : from.y) + 'px');
  el.style.setProperty('--from-r', (from.r === undefined ? -28 : from.r) + 'deg');
  el.style.animationDelay = (index * 90) + 'ms';
  el.classList.add('dealing');
  SFX.deal(index);
  setTimeout(() => el.classList.remove('dealing'), 900 + index * 90);
}

/** A compact row of card backs, for "3 cards in hand". */
export function miniDeck(ids, opts = {}) {
  return h('div.deck-strip', ids.map((id) => cardEl(id, Object.assign({ mini: true, focusable: false }, opts))));
}
