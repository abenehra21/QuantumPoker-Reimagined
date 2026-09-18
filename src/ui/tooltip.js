/**
 * ui/tooltip.js — one tooltip element, reused.
 *
 * Also the home of the glossary: any element with `data-term` gets an
 * explanation on hover, which is how the game teaches vocabulary without
 * ever interrupting anyone.
 */
import { h, $ } from './dom.js';
import { CODEX } from '../tutorial/codex.js';

let el = null;
let timer = null;

/** Short definitions for the words that appear on the table. */
export const GLOSSARY = {
  qubit: ['Qubit', 'A coin that has not landed. It can be 0, 1, or a genuine blend of both.'],
  superposition: ['Superposition', 'Undecided, not hidden. There is no secret answer waiting to be read.'],
  entanglement: ['Entanglement', 'Two coins with one shared fate. Neither has a state of its own.'],
  phase: ['Phase', 'The tilt of a spinning coin. Invisible to a measurement, decisive for the next gate.'],
  interference: ['Interference', 'Two routes to the same outcome cancelling out. The whole trick of quantum computing.'],
  measurement: ['Measurement', 'Making a coin decide. The one operation in quantum mechanics you cannot undo.'],
  bloch: ['Bloch sphere', 'Every state of one qubit, drawn as a globe. Poles are 0 and 1; the equator is 50/50.'],
  decoherence: ['Decoherence', 'The environment measuring your qubit by accident. The reason real machines are hard.'],
  bell: ['Bell pair', 'The strongest possible link between two qubits.'],
  amplitude: ['Amplitude', 'A complex number whose squared length is a probability. They can cancel; probabilities cannot.'],
  gate: ['Gate', 'A reversible operation on one or more qubits. Every card in the deck is one.'],
  circuit: ['Circuit', 'Gates in order, drawn on wires. The picture in Circuit View is the real notation.'],
  kicker: ['Kicker', 'The tiebreak. Level on ones, a 1 further left wins — coin 1 is the ace.'],
  coherence: ['Coherence', 'All five coins on 1. The best hand in the game.'],
  entropy: ['Entropy', 'How undecided your board is, in bits. Five spinning coins is 5 bits.'],
  nisq: ['NISQ', 'Noisy Intermediate-Scale Quantum: the era of machines we actually have.'],
  mitigation: ['Error mitigation', 'Getting a good answer out of a noisy machine by measuring the noise and subtracting it.']
};

function mount() {
  if (el) return el;
  el = h('div.tooltip', { role: 'tooltip' });
  document.body.appendChild(el);
  return el;
}

/** Show a tooltip near a rectangle. `content` is html or an options object. */
export function show(anchor, content, opts = {}) {
  const t = mount();
  if (typeof content === 'string') t.innerHTML = content;
  else {
    t.innerHTML = '';
    if (content.title) t.appendChild(h('h4', { text: content.title }));
    if (content.body) t.appendChild(h('div', { html: content.body }));
    if (content.physics) t.appendChild(h('div.physics', { text: content.physics }));
    if (content.hint) t.appendChild(h('div.hint-line', { text: '→ ' + content.hint }));
    if (content.tone) t.style.setProperty('--tone', content.tone);
    else t.style.removeProperty('--tone');
  }
  place(t, anchor, opts.placement);
  t.classList.add('show');
  return t;
}

function place(t, anchor, placement) {
  const r = anchor instanceof Element ? anchor.getBoundingClientRect() : anchor;
  t.style.left = '0px'; t.style.top = '0px';
  const b = t.getBoundingClientRect();
  const gap = 10;
  let x = r.left + r.width / 2 - b.width / 2;
  let y = placement === 'below' ? r.bottom + gap : r.top - b.height - gap;
  if (y < 8) y = r.bottom + gap;
  if (y + b.height > innerHeight - 8) y = Math.max(8, r.top - b.height - gap);
  x = Math.max(8, Math.min(innerWidth - b.width - 8, x));
  t.style.left = Math.round(x) + 'px';
  t.style.top = Math.round(y) + 'px';
}

export function hide() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (el) el.classList.remove('show');
}

/** Attach hover and focus tooltips to an element. */
export function attach(node, content, opts = {}) {
  const enter = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => show(node, typeof content === 'function' ? content() : content, opts), opts.delay || 260);
  };
  node.addEventListener('pointerenter', enter);
  node.addEventListener('focus', enter);
  node.addEventListener('pointerleave', hide);
  node.addEventListener('blur', hide);
  node.addEventListener('pointerdown', hide);
  return () => {
    node.removeEventListener('pointerenter', enter);
    node.removeEventListener('pointerleave', hide);
  };
}

/**
 * Turn every `data-term` in a subtree into a hoverable definition. Called
 * once per screen render, so writing `<span data-term="phase">tilt</span>`
 * anywhere is enough to make a word teachable.
 */
export function wireTerms(root) {
  for (const node of root.querySelectorAll('[data-term]')) {
    if (node.dataset.wired) continue;
    node.dataset.wired = '1';
    node.classList.add('term');
    const key = node.dataset.term;
    const g = GLOSSARY[key];
    const entry = CODEX.find((c) => c.id === key);
    attach(node, () => ({
      title: g ? g[0] : entry ? entry.title : key,
      body: g ? g[1] : entry ? entry.lede : '',
      physics: entry ? 'Read more in the Encyclopedia.' : ''
    }));
  }
}

/** Mark up any glossary word found in a plain string. */
export function markTerms(text) {
  let out = text;
  for (const key of Object.keys(GLOSSARY)) {
    const word = GLOSSARY[key][0];
    const re = new RegExp(`\\b(${word})\\b`, 'i');
    if (re.test(out) && !out.includes('data-term')) {
      out = out.replace(re, `<span data-term="${key}">$1</span>`);
    }
  }
  return out;
}
