/**
 * engine/loop.js — the frame.
 *
 * One requestAnimationFrame for the whole game. Everything that moves
 * subscribes here, so there is exactly one place that knows about time, one
 * place that measures frame rate, and one place that decides to shed work
 * when a machine cannot keep up.
 */
import { Tweens } from './tween.js';

export class Loop {
  constructor() {
    this.subs = [];
    this.tweens = new Tweens();
    this.running = false;
    this.last = 0;
    this.frame = 0;
    this.fps = 60;
    this.slowFrames = 0;
    /** 1 = draw everything. Dropped automatically when frames get long. */
    this.quality = 1;
    this.onQuality = null;
    this._tick = this._tick.bind(this);
  }

  add(fn, name) {
    const s = { fn, name: name || 'anon', paused: false };
    this.subs.push(s);
    return () => { this.subs = this.subs.filter((x) => x !== s); };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = now();
    requestAnimationFrame(this._tick);
  }

  stop() { this.running = false; }

  _tick(t) {
    if (!this.running) return;
    requestAnimationFrame(this._tick);
    const ms = t - this.last;
    this.last = t;
    // A tab that was in the background hands back an enormous delta. Clamp it,
    // or every animation in the game completes in the first frame after return.
    const dt = Math.min(0.05, Math.max(0.0001, ms / 1000));
    this.frame++;
    this.fps += ((1000 / Math.max(1, ms)) - this.fps) * 0.08;

    this._adapt(ms);

    this.tweens.tick(dt);
    for (const s of this.subs) {
      if (s.paused) continue;
      try { s.fn(dt, this); }
      catch (e) { console.error(`loop subscriber "${s.name}" threw`, e); s.paused = true; }
    }
  }

  /**
   * Shed work rather than stutter. Three long frames in a row and the
   * particle budget halves; a run of comfortable frames earns it back. This
   * is why the game holds 60fps on a laptop with a dying battery instead of
   * looking beautiful for two seconds and then crawling.
   */
  _adapt(ms) {
    if (ms > 24) this.slowFrames++;
    else this.slowFrames = Math.max(0, this.slowFrames - 1);
    const before = this.quality;
    if (this.slowFrames > 12 && this.quality > 0.25) { this.quality = Math.max(0.25, this.quality - 0.25); this.slowFrames = 0; }
    else if (this.slowFrames === 0 && this.frame % 240 === 0 && this.quality < 1) { this.quality = Math.min(1, this.quality + 0.25); }
    if (before !== this.quality && this.onQuality) this.onQuality(this.quality);
  }
}

function now() {
  return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
}

/** The one loop. */
export const loop = new Loop();

/**
 * Canvas helper: size a canvas to its CSS box at the device pixel ratio, and
 * tell the caller when that changed. Capped at 2 because a 3x phone screen
 * costs 2.25x the fill rate for no visible gain on these effects.
 */
export function fitCanvas(canvas, maxDpr = 2) {
  const dpr = Math.min(maxDpr, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width === w && canvas.height === h) return false;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return true;
}

/** Run `fn` when the element is on screen, and pause it when it is not. */
export function whileVisible(el, fn, name) {
  let off = null;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((entries) => {
    const visible = entries.some((e) => e.isIntersecting);
    if (visible && !off) off = loop.add(fn, name);
    else if (!visible && off) { off(); off = null; }
  }, { threshold: 0.01 }) : null;
  if (io) io.observe(el); else off = loop.add(fn, name);
  return () => { if (io) io.disconnect(); if (off) off(); };
}
