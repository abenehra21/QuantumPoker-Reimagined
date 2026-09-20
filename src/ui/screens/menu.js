/**
 * ui/screens/menu.js — the front door.
 *
 * An animated logo over the living background, the Daily Deal state, and
 * everything else one keystroke away.
 */
import { h, num } from '../dom.js';
import { SFX } from '../../audio/sfx.js';
import { dailyState } from '../../save/store.js';
import { progress } from '../../save/achievements.js';
import { loop } from '../../engine/loop.js';

const GLYPHS = ['H', 'X', 'Z', '∞', 'CX', 'Ψ', 'T', '⊕', 'M', 'S'];

export const title = 'Menu';
export const mood = 'menu';

export function build(app) {
  const root = h('div.menu.grow.center.col');

  const orbit = h('div.logo-orbit', GLYPHS.map((g, i) => h('span', {
    text: g,
    style: {
      '--rad': (190 + (i % 3) * 58) + 'px',
      '--dur': (16 + (i % 4) * 7) + 's',
      '--delay': (-i * 2.2) + 's'
    }
  })));

  root.appendChild(h('div.logo', [
    orbit,
    h('h1.logo-mark', { text: 'QUANTUM POKER' }),
    h('div.logo-sub', { text: 'reimagined' })
  ]));

  const daily = dailyState();
  const strip = h('div.daily-strip', [
    h('span', { text: daily.playedToday ? 'Daily Deal played' : 'Daily Deal ready' }),
    h('div.streak-dots', Array.from({ length: 7 }, (_, i) =>
      h('i', { class: i < Math.min(7, daily.streak) ? 'on' : '' }))),
    h('span.dim.small', { text: daily.streak ? `${daily.streak} day streak` : 'no streak yet' })
  ]);
  root.appendChild(strip);

  const item = (label, key, go, opts) => h('button.btn' + (opts && opts.primary ? '.btn-primary' : ''), {
    type: 'button',
    class: opts && opts.spooky ? 'menu-spooky' : '',
    onclick: () => { SFX.click(); go(); },
    onpointerenter: () => SFX.hover()
  }, [h('span', { text: label }), h('span.key', { text: key })]);

  root.appendChild(h('div.menu-actions', [
    item('Play', 'P', () => app.router.push('modes'), { primary: true }),
    item('\u{1F383} Trick or Treat', 'H', () => app.router.push('spooky-intro'), { spooky: true }),
    item(daily.playedToday ? 'Daily Deal · done' : 'Daily Deal', 'D',
      () => app.router.push('table', { mode: 'daily' })),
    item('Tutorial', 'T', () => app.router.push('tutorial')),
    item('Sandbox', 'B', () => app.router.push('sandbox')),
    item('Encyclopedia', 'E', () => app.router.push('codex')),
    item('Statistics', 'S', () => app.router.push('stats')),
    item('Settings', ',', () => app.router.push('settings')),
    item('Credits', 'C', () => app.router.push('credits'))
  ]));

  const prog = progress(app.profile);
  root.appendChild(h('div.menu-foot', [
    h('span', { text: `${prog.got} / ${prog.total} achievements` }),
    h('span', { text: `${num(app.profile.totals.hands)} hands played` }),
    h('span', { text: `best round ${app.profile.best.round || 0}` }),
    h('button.btn.btn-sm.btn-ghost', {
      text: 'after Fuchs, Falch & Johnsen (SINTEF)',
      style: { padding: '0', border: '0', background: 'none', color: 'var(--ink-faint)', fontSize: 'inherit' },
      onclick: () => app.router.push('credits')
    })
  ]));

  return root;
}

export function enter(app) {
  app.accent();
  app.background.setAccent([110, 231, 255], [192, 132, 252]);
  // A slow drift of dust, only while the menu is up.
  if (menuDust) menuDust();
  menuDust = loop.add(() => {
    app.particles.ambient(innerWidth, innerHeight, 0.35, [110, 231, 255]);
  }, 'menu-dust');
}

let menuDust = null;

export function leave() {
  if (menuDust) { menuDust(); menuDust = null; }
}

export function key(e, app) {
  const k = e.key.toLowerCase();
  const map = {
    p: () => app.router.push('modes'),
    d: () => app.router.push('table', { mode: 'daily' }),
    h: () => app.router.push('spooky-intro'),
    t: () => app.router.push('tutorial'),
    b: () => app.router.push('sandbox'),
    e: () => app.router.push('codex'),
    s: () => app.router.push('stats'),
    c: () => app.router.push('credits'),
    ',': () => app.router.push('settings')
  };
  if (map[k]) { SFX.click(); map[k](); return true; }
  return false;
}
