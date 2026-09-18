/**
 * engine/tween.js — easing and time.
 *
 * Every motion in the game goes through here, which is what makes the
 * Reduced Motion setting a one-line change rather than an audit: scale()
 * returns 0 durations and the whole game snaps instead of slides.
 */

export const EASE = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outQuint: (t) => 1 - Math.pow(1 - t, 5),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t) => t === 0 ? 0 : t === 1 ? 1 : t < 0.5
    ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  /** A real spring, critically under-damped. Overshoots once and settles. */
  outElastic: (t) => t === 0 ? 0 : t === 1 ? 1
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  }
};

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, lo = 0, hi = 1) { return v < lo ? lo : v > hi ? hi : v; }
export function clamp01(v) { return clamp(v, 0, 1); }
export function smoothstep(a, b, x) { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); }

/** Move `from` toward `to` at a rate independent of frame time. */
export function damp(from, to, lambda, dt) {
  return lerp(to, from, Math.exp(-lambda * dt));
}

/**
 * Global motion scale. 1 is full, 0 means every animation completes instantly.
 * Screens read durations through scale() so nothing has to know the setting.
 */
let motionScale = 1;
export function setMotion(mode) {
  motionScale = mode === 'none' ? 0 : mode === 'reduced' ? 0.45 : 1;
}
export function motion() { return motionScale; }
export function scale(ms) { return ms * motionScale; }
export function reduced() { return motionScale < 1; }

/** A single running animation. */
class Tween {
  /** Durations are given in milliseconds; the loop ticks in seconds. */
  constructor(opts) {
    this.from = opts.from === undefined ? 0 : opts.from;
    this.to = opts.to === undefined ? 1 : opts.to;
    this.duration = Math.max(0, scale(opts.duration === undefined ? 300 : opts.duration)) / 1000;
    this.delay = Math.max(0, scale(opts.delay || 0)) / 1000;
    this.ease = typeof opts.ease === 'function' ? opts.ease : (EASE[opts.ease] || EASE.outCubic);
    this.onUpdate = opts.onUpdate || null;
    this.onDone = opts.onDone || null;
    this.elapsed = 0;
    this.done = false;
    this.value = this.from;
    if (this.duration === 0 && this.delay === 0) {
      this.value = this.to;
      if (this.onUpdate) this.onUpdate(this.to, 1);
    }
  }

  tick(dt) {
    if (this.done) return true;
    this.elapsed += dt;
    if (this.elapsed < this.delay) return false;
    const t = this.duration === 0 ? 1 : clamp01((this.elapsed - this.delay) / this.duration);
    this.value = lerp(this.from, this.to, this.ease(t));
    if (this.onUpdate) this.onUpdate(this.value, t);
    if (t >= 1) {
      this.done = true;
      if (this.onDone) this.onDone();
      return true;
    }
    return false;
  }

  finish() {
    if (this.done) return;
    this.value = this.to;
    if (this.onUpdate) this.onUpdate(this.to, 1);
    this.done = true;
    if (this.onDone) this.onDone();
  }
}

/** A pool of running tweens, ticked by the loop. */
export class Tweens {
  constructor() { this.list = []; }

  add(opts) {
    const t = new Tween(opts);
    if (!t.done) this.list.push(t);
    return t;
  }

  /** Promise-friendly: `await tweens.to({from, to, duration, onUpdate})`. */
  to(opts) {
    return new Promise((resolve) => {
      this.add(Object.assign({}, opts, {
        onDone: () => { if (opts.onDone) opts.onDone(); resolve(); }
      }));
    });
  }

  /** Run a list of {duration, onUpdate} one after another. */
  async sequence(steps) {
    for (const s of steps) await this.to(s);
  }

  tick(dt) {
    if (!this.list.length) return;
    this.list = this.list.filter((t) => !t.tick(dt));
  }

  /** Jump every running animation to its end. Used when a player skips ahead. */
  finishAll() {
    const l = this.list.slice();
    this.list = [];
    for (const t of l) t.finish();
  }

  get busy() { return this.list.length > 0; }
  clear() { this.list = []; }
}

/** Wait, respecting the motion setting. */
export function wait(ms) {
  const d = scale(ms);
  return d <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, d));
}
