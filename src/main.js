/**
 * main.js — start here.
 *
 * Builds the app, registers the screens, wires the global keys and starts
 * the frame loop. Nothing else in the game touches the window object.
 */
import { App } from './ui/app.js';
import { Router } from './ui/router.js';
import { loop } from './engine/loop.js';
import { $, h } from './ui/dom.js';
import { toast } from './ui/toast.js';
import { hide as hideTooltip } from './ui/tooltip.js';
import { SFX } from './audio/sfx.js';

import * as menu from './ui/screens/menu.js';
import * as modes from './ui/screens/modes.js';
import * as table from './ui/screens/table.js';
import * as shop from './ui/screens/shop.js';
import * as tutorial from './ui/screens/tutorial.js';
import * as sandbox from './ui/screens/sandbox.js';
import * as codex from './ui/screens/codex.js';
import * as stats from './ui/screens/stats.js';
import * as settings from './ui/screens/settings.js';

const app = new App({
  bg: $('#bg-canvas'),
  fx: $('#fx-canvas'),
  vfxRoot: $('#vfx-root'),
  screens: $('#screens')
});

app.router = new Router($('#screens'), app);
app.router
  .register('menu', menu)
  .register('modes', modes)
  .register('table', table)
  .register('shop', shop)
  .register('tutorial', tutorial)
  .register('sandbox', sandbox)
  .register('codex', codex)
  .register('stats', stats)
  .register('settings', settings);

/* ---- global keys ---------------------------------------------------- */

window.addEventListener('keydown', (e) => {
  // Never steal a key from a text field.
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

  if (app.router.handleKey(e)) { e.preventDefault(); return; }

  if (e.key === 'Escape') {
    const openPanel = document.querySelector('.side-panel.open, .overlay.open');
    if (openPanel) { openPanel.classList.remove('open'); return; }
    if (app.router.current && app.router.current.name !== 'menu') { app.router.back(); e.preventDefault(); }
    return;
  }
  if (e.key === 'F11' || (e.key === 'f' && (e.metaKey || e.ctrlKey))) return;
  if (e.key === 'm' && !e.metaKey && !e.ctrlKey) {
    const on = app.settings.master > 0.001;
    app.set('master', on ? 0 : 0.8);
    toast({ icon: on ? '⊘' : '♪', body: on ? 'Sound off' : 'Sound on' });
    e.preventDefault();
  }
});

window.addEventListener('scroll', hideTooltip, { passive: true });
window.addEventListener('resize', hideTooltip);
window.addEventListener('beforeunload', () => { app.tickPlaytime(); app.store.save(true); });
setInterval(() => app.tickPlaytime(), 30000);

/* ---- developer overlay ---------------------------------------------- */

let devEl = null;
loop.add(() => {
  if (!app.settings.developer) {
    if (devEl) { devEl.remove(); devEl = null; }
    return;
  }
  if (!devEl) { devEl = h('div.dev-overlay'); document.body.appendChild(devEl); }
  const g = app.game;
  const lines = [
    `fps    ${loop.fps.toFixed(0).padStart(3)}   quality ${loop.quality.toFixed(2)}`,
    `parts  ${String(app.particles.count).padStart(4)} / budget ${app.particles.budget.toFixed(2)}`,
    `screen ${app.router.current ? app.router.current.name : '-'}`
  ];
  if (g) {
    const hero = g.hero();
    lines.push(
      `seed   ${g.seed}  hand ${g.handNo}  phase ${g.phase}`,
      `depth  ${hero.circuit ? hero.circuit.depth : 0}  gates ${hero.circuit ? hero.circuit.gateCount : 0}`,
      `board  ${hero.board ? hero.board.toKet(3) : '-'}`,
      `norm   ${hero.board ? hero.board.norm().toFixed(9) : '-'}`
    );
  }
  devEl.textContent = lines.join('\n');
}, 'dev-overlay');

/* ---- go -------------------------------------------------------------- */

app.armAudio();
loop.start();

// A shared link goes straight to the table it names.
const params = new URLSearchParams(location.search);
if (params.has('test')) {
  import('../tests/run.js').then((m) => {
    console.log(m.report());
    toast({
      icon: m.summary.failed ? '✗' : '✓',
      title: m.summary.failed ? `${m.summary.failed} checks failed` : 'All checks passed',
      body: `${m.summary.total - m.summary.failed} / ${m.summary.total}. Full report in the console.`,
      tone: m.summary.failed ? 'var(--bad)' : 'var(--good)',
      duration: 9000
    });
  });
}
if (params.has('seed') || params.has('mode')) {
  app.router.go('table', {
    mode: params.get('mode') || 'student',
    seed: params.get('seed') ? Number(params.get('seed')) >>> 0 : undefined
  });
} else {
  app.router.go('menu');
}

window.addEventListener('error', (e) => {
  console.error(e.error || e.message);
  toast({ icon: '!', title: 'Something broke', body: String(e.message || e.error).slice(0, 140), tone: 'var(--bad)', duration: 8000 });
});

// Handy in the console, and used by nothing.
window.QP = app;
