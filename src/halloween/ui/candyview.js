/**
 * halloween/ui/candyview.js — candy you can see.
 *
 * The brief for this mode was that betting should be more satisfying to
 * watch than ordinary poker chips, and the way to get that is to make the
 * quantity physical: a stack of pieces that visibly grows and shrinks, and
 * candy that actually travels across the table when it changes hands.
 */
import { h, centreOf } from '../../ui/dom.js';
import { pieces, format } from '../candy.js';
import { scale } from '../../engine/tween.js';

/** A row of candy pieces, biggest denominations first. */
export function candyStack(amount, opts = {}) {
  const el = h('div.candy-stack', { style: opts.size ? { '--sz': opts.size } : null });
  pieces(amount, opts.cap || 12).forEach((d, i) => {
    el.appendChild(h('i', { text: d.icon, style: { '--i': i }, title: d.name }));
  });
  return el;
}

/** The number, with a candy in front of it. */
export function candyCount(amount, opts = {}) {
  return h('div.candy-count' + (opts.big ? '.big' : ''), [
    h('span', { text: '\u{1F36C}' }),
    h('span.n', { text: format(amount) })
  ]);
}

export function setCandyCount(el, amount, bump) {
  const n = el.querySelector('.n');
  if (!n) return;
  const was = n.textContent;
  n.textContent = format(amount);
  if (bump && was !== n.textContent) {
    el.classList.remove('bumping');
    void el.offsetWidth;
    el.classList.add('bumping');
    setTimeout(() => el.classList.remove('bumping'), 500);
  }
}

/**
 * Candy flying from one element to another. Used for every bet (stack to
 * pot) and every win (pot to winner), which is the single most satisfying
 * thing on the table and worth doing properly.
 */
export function flyCandy(fromEl, toEl, amount, opts = {}) {
  if (!fromEl || !toEl) return;
  const from = centreOf(fromEl), to = centreOf(toEl);
  const set = pieces(amount, opts.cap || 9);
  if (!set.length) return;

  set.forEach((d, i) => {
    const el = h('div.candy-fly', { text: d.icon });
    const jitterX = (Math.random() - 0.5) * 28;
    const jitterY = (Math.random() - 0.5) * 20;
    el.style.left = (from.x - 9) + 'px';
    el.style.top = (from.y - 9) + 'px';
    el.style.fontSize = (15 * d.size) + 'px';
    document.body.appendChild(el);

    const flight = scale(opts.duration || 620);
    const delay = i * scale(45);
    // An arc, not a straight line: candy thrown across a table has a top
    // to its flight, and the eye notices when it does not.
    const midX = (from.x + to.x) / 2 + jitterX;
    const midY = Math.min(from.y, to.y) - 60 - Math.random() * 40;

    el.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${midX - from.x}px, ${midY - from.y}px) rotate(180deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${to.x - from.x + jitterX}px, ${to.y - from.y + jitterY}px) rotate(360deg)`, opacity: 0.9 }
    ], {
      duration: Math.max(1, flight),
      delay,
      easing: 'cubic-bezier(.3,.1,.3,1)',
      fill: 'forwards'
    });
    setTimeout(() => el.remove(), flight + delay + 80);
  });
}

/** An explosion of candy out of a point. For all-ins and jackpots. */
export function burstCandy(el, amount, opts = {}) {
  if (!el) return;
  const at = centreOf(el);
  const set = pieces(amount, opts.cap || 16);
  set.forEach((d, i) => {
    const piece = h('div.candy-fly', { text: d.icon });
    piece.style.left = (at.x - 9) + 'px';
    piece.style.top = (at.y - 9) + 'px';
    piece.style.fontSize = (16 * d.size) + 'px';
    document.body.appendChild(piece);
    const angle = (i / set.length) * Math.PI * 2 + Math.random() * 0.5;
    const dist = 90 + Math.random() * 160;
    const ms = scale(900);
    piece.animate([
      { transform: 'translate(0,0) scale(.4)', opacity: 1 },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 40}px) scale(1.2) rotate(${Math.random() * 720 - 360}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${Math.cos(angle) * dist * 1.2}px, ${Math.sin(angle) * dist + 220}px) scale(1) rotate(${Math.random() * 720}deg)`, opacity: 0 }
    ], { duration: Math.max(1, ms), easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
    setTimeout(() => piece.remove(), ms + 60);
  });
}
