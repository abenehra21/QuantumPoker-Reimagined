/**
 * ui/components/orb.js — a community coin.
 *
 * The orb is the single most important thing on screen, so it carries a lot:
 * its kind by colour, its probability as a number, its spin speed by how
 * undecided it is, its entanglement as a shrinking core, and a link arc to
 * its partner. Everything animates from the real quantum state.
 */
import { h } from '../dom.js';
import { attach } from '../tooltip.js';
import { readCoin, KIND_NAMES } from '../../quantum/read.js';
import { pct } from '../dom.js';
import { SFX } from '../../audio/sfx.js';

const FACES = { one: '1', zero: '0', plus: '+', minus: '−', tilted: '◔', linked: '∞' };

export function orbEl(index, opts = {}) {
  const el = h('button.orb', {
    type: 'button',
    dataset: { coin: index, kind: 'zero' },
    'aria-label': `Coin ${index + 1}`
  }, [
    h('div.orb-body'),
    h('div.orb-ring'),
    h('div.orb-ring.two'),
    h('div.orb-index', { text: String(index + 1) }),
    h('div.orb-face', { text: '0' }),
    h('div.orb-prob', { text: '' })
  ]);
  if (opts.onPick) el.addEventListener('click', () => opts.onPick(index, el));
  el.addEventListener('pointerenter', () => SFX.hover());
  return el;
}

/**
 * Point an orb at a quantum state. Called every time the board changes, and
 * cheap enough to call on every frame of an animation.
 */
export function updateOrb(el, state, index, opts = {}) {
  const c = readCoin(state, index);
  const face = el.querySelector('.orb-face');
  const prob = el.querySelector('.orb-prob');

  el.dataset.kind = c.kind;
  face.textContent = c.kind === 'tilted'
    ? (c.up > 0.5 ? '◕' : '◔')
    : FACES[c.kind] || '?';

  if (opts.hideProbabilities) {
    prob.textContent = c.settled ? '' : '???';
  } else if (opts.showKets) {
    prob.textContent = `${c.ket}  ${pct(c.up)}`;
  } else {
    prob.textContent = c.settled ? '' : pct(c.up);
  }

  // Spin speed carries information: the closer to a coin toss, the faster.
  const undecided = 1 - Math.abs(c.up - 0.5) * 2;
  el.style.setProperty('--spin-time', (4.4 - undecided * 3.2).toFixed(2) + 's');
  el.style.setProperty('--ent', c.ent.toFixed(3));

  el.setAttribute('aria-label',
    `Coin ${index + 1}: ${KIND_NAMES[c.kind]}${c.settled ? '' : `, ${pct(c.up)} chance of a 1`}`);

  if (!el.dataset.tipped) {
    el.dataset.tipped = '1';
    attach(el, () => {
      const cc = readCoin(state, index);
      return {
        title: `Coin ${index + 1} — ${KIND_NAMES[cc.kind]}`,
        body: `<p class="mono">${cc.ket} &nbsp; P(1) = ${(cc.up * 100).toFixed(1)}%</p>` +
          (cc.ent > 1e-6
            ? `<p>Entangled with another coin. It has no value of its own — only the pair does.</p>`
            : cc.settled
              ? `<p>Settled. No card will move it unless you unsettle it first.</p>`
              : `<p>Spinning. Tilt ${cc.minus < 0.5 ? '+' : '−'}, which decides what a Spin will do to it.</p>`),
        physics: `Bloch: x ${cc.bloch.x.toFixed(2)}, y ${cc.bloch.y.toFixed(2)}, z ${cc.bloch.z.toFixed(2)} · |r| ${cc.bloch.r.toFixed(2)}`
      };
    });
  }
  return c;
}

/**
 * Draw the entanglement arcs over a row of orbs. Perfect links are solid,
 * partial correlations are faint: a weaker link genuinely looks weaker.
 */
export function drawLinks(svg, orbs, links, correlations) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (!orbs.length) return;
  const host = svg.parentElement.getBoundingClientRect();
  const centre = (i) => {
    const r = orbs[i].getBoundingClientRect();
    return { x: r.left + r.width / 2 - host.left, y: r.top + r.height / 2 - host.top, r: r.width / 2 };
  };

  const drawn = new Set();
  const arc = (a, b, weak, strength) => {
    if (a === b || !orbs[a] || !orbs[b]) return;
    const key = Math.min(a, b) + ':' + Math.max(a, b);
    if (drawn.has(key)) return;
    drawn.add(key);
    const p = centre(a), q = centre(b);
    const lift = Math.min(90, 28 + Math.abs(a - b) * 26);
    const mx = (p.x + q.x) / 2, my = Math.min(p.y, q.y) - lift;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${p.x} ${p.y - p.r} Q ${mx} ${my} ${q.x} ${q.y - q.r}`);
    path.setAttribute('class', 'link-arc' + (weak ? ' weak' : ''));
    if (strength !== undefined) path.style.opacity = String(0.25 + strength * 0.75);
    svg.appendChild(path);
  };

  for (const l of links) arc(l.a, l.b, false);
  for (const c of (correlations || [])) arc(c.a, c.b, true, c.strength);
}

export function collapseOrb(el, bit) {
  el.classList.remove('collapsing');
  void el.offsetWidth;
  el.classList.add('collapsing');
  SFX.collapse(bit);
  setTimeout(() => el.classList.remove('collapsing'), 700);
}

export function strikeOrb(el) {
  el.classList.remove('struck');
  void el.offsetWidth;
  el.classList.add('struck');
  setTimeout(() => el.classList.remove('struck'), 500);
}
