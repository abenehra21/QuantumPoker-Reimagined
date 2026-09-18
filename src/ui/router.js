/**
 * ui/router.js — screens.
 *
 * A screen is a module with `build(app)` returning an element, and optional
 * `enter`, `leave` and `key` handlers. The router keeps one element per
 * screen alive so returning to the menu does not rebuild the world, and
 * cross-fades between them.
 */
import { h, clear } from './dom.js';
import { wireTerms, hide as hideTooltip } from './tooltip.js';
import { SFX } from '../audio/sfx.js';
import { music } from '../audio/music.js';

/** Dismiss anything floating above the screens. */
export function closeTransients() {
  for (const el of document.querySelectorAll('.overlay.open, .side-panel.open')) {
    el.classList.remove('open');
  }
  hideTooltip();
}

export class Router {
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.screens = new Map();
    this.built = new Map();
    this.current = null;
    this.stack = [];
  }

  register(name, mod) { this.screens.set(name, mod); return this; }

  /** Go to a screen. `opts` is handed to its enter(). */
  go(name, opts = {}) {
    const mod = this.screens.get(name);
    if (!mod) { console.warn('no screen', name); return; }
    if (this.current && this.current.name === name && !opts.force) {
      if (mod.enter) mod.enter(this.app, opts);
      return;
    }

    // Overlays and drawers belong to the screen that opened them. Leaving
    // without dismissing them leaves a results panel floating over the shop.
    closeTransients();

    const prev = this.current;
    if (prev) {
      if (prev.mod.leave) prev.mod.leave(this.app);
      prev.el.classList.remove('active');
      prev.el.classList.add('leaving');
      setTimeout(() => prev.el.classList.remove('leaving'), 500);
    }

    let el = this.built.get(name);
    if (!el || mod.rebuild) {
      if (el) el.remove();
      el = h('div.screen', [h('div.screen-inner')]);
      el.dataset.screen = name;
      const inner = el.firstChild;
      const content = mod.build(this.app, opts);
      if (content) inner.appendChild(content);
      this.host.appendChild(el);
      this.built.set(name, el);
      wireTerms(el);
    }

    this.current = { name, mod, el, opts };
    // Force a reflow so the browser has a starting state to transition from,
    // then activate synchronously.
    //
    // The obvious version of this is requestAnimationFrame, and it is wrong:
    // a frame can be delayed arbitrarily (a hidden tab does not paint at all),
    // so a callback scheduled by a previous navigation can fire *after* the
    // next one and re-activate the screen you just left. That leaves two
    // screens stacked on top of each other with no error anywhere.
    void el.offsetWidth;
    el.classList.add('active');
    if (mod.enter) mod.enter(this.app, opts);
    if (mod.mood) music.set(mod.mood);
    document.title = mod.title ? `${mod.title} — Quantum Poker` : 'Quantum Poker';
    this.app.bus.emit('screen', { name, opts });
  }

  /** Go somewhere, remembering where we were. */
  push(name, opts) {
    if (this.current) this.stack.push({ name: this.current.name, opts: this.current.opts });
    this.go(name, opts);
  }

  /** Return to where we came from, or the menu. */
  back() {
    SFX.back();
    const prev = this.stack.pop();
    if (prev) this.go(prev.name, prev.opts);
    else this.go('menu');
  }

  /** Force a screen to be rebuilt next time it is shown. */
  invalidate(name) {
    const el = this.built.get(name);
    if (el) { el.remove(); this.built.delete(name); }
    if (this.current && this.current.name === name) this.current = null;
  }

  handleKey(e) {
    if (this.current && this.current.mod.key) {
      if (this.current.mod.key(e, this.app) === true) return true;
    }
    return false;
  }
}
