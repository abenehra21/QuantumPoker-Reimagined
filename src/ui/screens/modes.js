/**
 * ui/screens/modes.js — picking a game.
 *
 * Every mode is described honestly, including how hard it is and what it
 * will do to you, because a mode whose rules are a surprise is a bad mode.
 */
import { h } from '../dom.js';
import { MODES, MODE_KEYS, targetFor } from '../../gameplay/modes.js';
import { describeProfile, PROFILES } from '../../quantum/noise.js';
import { SFX } from '../../audio/sfx.js';
import { icon } from '../../render/art.js';
import { seedFrom } from '../../utils/rng.js';

export const title = 'Choose a mode';
export const mood = 'menu';

export function build(app) {
  const root = h('div.screen-inner.scroll', { style: { padding: 'var(--s6) var(--s5)', gap: 'var(--s5)' } });

  root.appendChild(h('div.row', [
    h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back',
      onclick: () => app.router.back() }),
    h('h2', { text: 'Choose a mode' }),
    h('div.grow'),
    seedBox(app)
  ]));

  const grid = h('div.mode-grid');
  for (const key of MODE_KEYS) {
    const m = MODES[key];
    if (m.key === 'daily' || m.key === 'sandbox') continue;
    grid.appendChild(modeCard(app, m));
  }
  root.appendChild(grid);

  root.appendChild(h('p.dim.small', {
    text: 'Every mode uses the same rules and the same physics. What changes is who you face, how noisy the hardware is, and how much the deck is allowed to surprise you.'
  }));

  return root;
}

let seedInput = null;

function seedBox(app) {
  seedInput = h('input.input', { placeholder: 'seed (optional)', size: 14, 'aria-label': 'Game seed' });
  return h('div.row', [
    h('label.small.dim', { text: 'Seed', for: 'seed' }),
    seedInput
  ]);
}

function modeCard(app, m) {
  const target = m.endless || m.handsPerRound
    ? targetFor(m, 1, m.startChips) : null;
  const noise = PROFILES[m.noise];

  const el = h('button.mode-card', {
    type: 'button',
    style: { '--mode-accent': m.accent },
    onpointerenter: () => SFX.hover(),
    onclick: () => {
      SFX.click();
      const raw = seedInput && seedInput.value.trim();
      app.router.push('table', { mode: m.key, seed: raw ? seedFrom(raw) : undefined });
    }
  }, [
    h('h3', { text: m.name }),
    h('div.tagline', { text: m.tagline }),
    h('div.blurb', { text: m.blurb }),
    h('div.mode-meta', [
      h('span.badge', { text: `${m.bots || 3} opponents` }),
      h('span.badge', { text: `${m.handSize || 3} cards` }),
      target ? h('span.badge', { text: `keep ${target}` }) : null,
      noise && noise.active ? h('span.badge.warn', { text: noise.label }) : h('span.badge.good', { text: 'no noise' }),
      m.endless ? h('span.badge', { style: { '--tone': 'var(--legendary)' }, text: 'bosses' }) : null,
      m.chaos ? h('span.badge', { style: { '--tone': 'var(--epic)' }, text: 'chaos events' }) : null
    ])
  ]);
  return el;
}

export function key(e, app) {
  if (e.key === 'Escape') { app.router.back(); return true; }
  return false;
}
