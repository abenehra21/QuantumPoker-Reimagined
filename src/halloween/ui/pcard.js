/**
 * halloween/ui/pcard.js — a playing card on screen.
 *
 * Four states: face up, face down, haunted ("?"), and dimmed. A haunted card
 * shows both of its possibilities as little ghosts along the bottom, which
 * is the entire explanation of superposition that most players will ever
 * need — you can see it is two things, and you can see which two.
 */
import { h } from '../../ui/dom.js';
import { attach } from '../../ui/tooltip.js';
import { RANKS, SUITS, rankOf, suitOf, cardName, cardShort } from '../deck.js';

/**
 * opts:
 *   card     the card, or null for face down
 *   mystery  true to draw a haunted "?"
 *   options  the two possibilities, when haunted and known to this viewer
 *   width    css width in px
 *   pickable / chosen / dimmed / playing
 *   onPick   click handler
 */
export function pcard(opts = {}) {
  const { card, mystery, options } = opts;
  const el = h('div.pcard', {
    style: opts.width ? { '--card-w': opts.width + 'px' } : null,
    dataset: { card: card === null || card === undefined ? '' : String(card) },
    tabindex: opts.onPick ? 0 : -1,
    role: opts.onPick ? 'button' : 'img'
  });

  if (opts.pickable) el.classList.add('pickable');
  if (opts.chosen) el.classList.add('chosen');
  if (opts.dimmed) el.classList.add('dimmed');
  if (opts.playing) el.classList.add('playing');

  if (mystery) {
    el.classList.add('haunted');
    el.appendChild(h('div.pcard-mark', { text: '?' }));
    if (options && options.length === 2) {
      el.appendChild(h('div.pcard-ghosts', [
        h('span', { text: cardShort(options[0]) }),
        h('span', { text: cardShort(options[1]) })
      ]));
    }
    el.setAttribute('aria-label', options && options.length === 2
      ? `Mystery card: either the ${cardName(options[0])} or the ${cardName(options[1])}`
      : 'A mystery card. Nobody knows what it is yet.');
    attach(el, {
      title: 'A card in superposition',
      body: options && options.length === 2
        ? `<p>This card is genuinely <b>${cardName(options[0])}</b> <i>and</i> <b>${cardName(options[1])}</b> right now. ` +
          'It does not pick one until somebody measures it.</p>'
        : '<p>Two cards at once. It will not decide until it is measured.</p>',
      tone: 'var(--witch-hi)'
    });
  } else if (card === null || card === undefined) {
    el.classList.add('back');
    el.appendChild(h('div.pcard-centre', { text: '\u{1F577}' }));
    el.setAttribute('aria-label', 'A face-down card');
  } else {
    const r = rankOf(card), s = SUITS[suitOf(card)];
    el.classList.add(s.colour);
    el.appendChild(corner(r, s));
    el.appendChild(h('div.pcard-centre', { text: s.pip }));
    el.appendChild(corner(r, s, true));
    el.setAttribute('aria-label', cardName(card));
  }

  if (opts.onPick) {
    el.addEventListener('click', () => opts.onPick(opts));
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onPick(opts); }
    });
  }
  return el;
}

/**
 * The corner index. Classic pip here, Halloween emoji in the middle.
 *
 * Emoji are lovely at forty pixels and mud at sixteen, and the corner is
 * the thing a player reads from across a table while somebody else is
 * talking. So the corner keeps the shape every card player already knows
 * and the centre carries the costume.
 */
function corner(rank, suit, flipped) {
  return h('div.pcard-corner' + (flipped ? '.flip' : ''), [
    h('span', { text: RANKS[rank] }),
    h('span.pip', { text: suit.classic })
  ]);
}

/** Deal a card in from off screen, staggered. */
export function dealIn(el, index = 0, from = {}) {
  el.style.setProperty('--fx', (from.x || 0) + 'px');
  el.style.setProperty('--fy', (from.y === undefined ? -260 : from.y) + 'px');
  el.style.setProperty('--fr', (from.r === undefined ? -18 : from.r) + 'deg');
  el.style.animationDelay = (index * 85) + 'ms';
  el.classList.add('dealt');
  setTimeout(() => el.classList.remove('dealt'), 700 + index * 85);
}

/** The collapse animation: shake, blur, split, land. */
export function collapseCard(el, after) {
  el.classList.remove('collapsing');
  void el.offsetWidth;
  el.classList.add('collapsing');
  // Swap the face in at the moment of maximum blur, so the reveal lands on
  // the beat rather than before it.
  setTimeout(() => { if (after) after(); }, 380);
  setTimeout(() => el.classList.remove('collapsing'), 700);
}

export function swapCard(el, after) {
  el.classList.remove('swapping');
  void el.offsetWidth;
  el.classList.add('swapping');
  setTimeout(() => { if (after) after(); }, 280);
  setTimeout(() => el.classList.remove('swapping'), 620);
}

/** Draw the arc linking two entangled cards. */
export function drawTangles(svg, pairs) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const host = svg.parentElement;
  if (!host) return;
  const box = host.getBoundingClientRect();
  for (const [a, b] of pairs) {
    if (!a || !b) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const x1 = ra.left + ra.width / 2 - box.left, y1 = ra.top - box.top;
    const x2 = rb.left + rb.width / 2 - box.left, y2 = rb.top - box.top;
    const lift = Math.min(70, 26 + Math.abs(x2 - x1) * 0.2);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${Math.min(y1, y2) - lift} ${x2} ${y2}`);
    path.setAttribute('class', 'tangle');
    svg.appendChild(path);
  }
}
