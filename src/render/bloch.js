/**
 * render/bloch.js — a Bloch sphere you can actually read.
 *
 * Canvas 2D with hand-rolled projection. No WebGL, no three.js: the whole
 * thing is one sphere, three rings and an arrow, and a 4x4 matrix library
 * would be more code than the drawing.
 *
 * The arrow interpolates rather than jumping, so applying a gate looks like
 * the rotation it actually is. An entangled qubit has a short arrow, because
 * its reduced state genuinely is mixed, and that is the single clearest
 * picture of entanglement anyone has come up with.
 */
import { loop, fitCanvas } from '../engine/loop.js';
import { lerp, damp, clamp01 } from '../engine/tween.js';

export const BLOCH_THEMES = {
  default: { wire: 'rgba(125,211,252,0.28)', equator: 'rgba(192,132,252,0.45)',
             arrow: '#6ee7ff', tip: '#ffffff', label: 'rgba(226,232,240,0.75)',
             fill: 'rgba(80,140,220,0.06)', glow: '#6ee7ff' },
  bloch_retro: { wire: 'rgba(74,222,128,0.3)', equator: 'rgba(74,222,128,0.55)',
             arrow: '#4ade80', tip: '#d9f99d', label: 'rgba(187,247,208,0.8)',
             fill: 'rgba(20,80,40,0.12)', glow: '#4ade80' },
  bloch_ink: { wire: 'rgba(148,163,184,0.4)', equator: 'rgba(100,116,139,0.7)',
             arrow: '#e2e8f0', tip: '#ffffff', label: 'rgba(203,213,225,0.9)',
             fill: 'rgba(255,255,255,0.03)', glow: 'rgba(255,255,255,0.4)' }
};

export class BlochSphere {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.theme = BLOCH_THEMES[opts.theme] || BLOCH_THEMES.default;
    this.yaw = -0.5;
    this.pitch = 0.42;
    this.spin = opts.spin === undefined ? 0.22 : opts.spin;
    this.labels = opts.labels !== false;
    this.trail = [];
    this.maxTrail = opts.trail === false ? 0 : 40;
    // Where the arrow is, and where it is heading. Two vectors, one lerp.
    this.vec = { x: 0, y: 0, z: 1 };
    this.want = { x: 0, y: 0, z: 1 };
    this.pulse = 0;
    this.dragging = false;
    this.bindDrag();
    this.stop = loop.add((dt) => this.tick(dt), 'bloch');
  }

  destroy() { if (this.stop) this.stop(); }

  setTheme(id) { this.theme = BLOCH_THEMES[id] || BLOCH_THEMES.default; }

  /** Point the arrow somewhere. It travels there rather than teleporting. */
  set(v, instant) {
    this.want = { x: v.x || 0, y: v.y || 0, z: v.z === undefined ? 1 : v.z };
    if (instant) { this.vec = Object.assign({}, this.want); this.trail.length = 0; }
    else this.pulse = 1;
  }

  bindDrag() {
    const el = this.canvas;
    let last = null;
    const down = (e) => {
      this.dragging = true;
      last = point(e);
      el.setPointerCapture && e.pointerId !== undefined && el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!this.dragging || !last) return;
      const p = point(e);
      this.yaw += (p.x - last.x) * 0.012;
      this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + (p.y - last.y) * 0.012));
      last = p;
    };
    const up = () => { this.dragging = false; last = null; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointerleave', up);
    el.style.touchAction = 'none';
  }

  tick(dt) {
    if (!this.dragging) this.yaw += this.spin * dt;
    this.vec.x = damp(this.vec.x, this.want.x, 9, dt);
    this.vec.y = damp(this.vec.y, this.want.y, 9, dt);
    this.vec.z = damp(this.vec.z, this.want.z, 9, dt);
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - dt * 2.2);
    if (this.maxTrail) {
      this.trail.push({ x: this.vec.x, y: this.vec.y, z: this.vec.z });
      if (this.trail.length > this.maxTrail) this.trail.shift();
    }
    this.draw();
  }

  /** Rotate by the current view, then project. Returns screen x, y and depth. */
  project(v, cx, cy, r) {
    const cy1 = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const x1 = v.x * cy1 - v.y * sy;
    const y1 = v.x * sy + v.y * cy1;
    const z1 = v.z;
    const y2 = y1 * cp - z1 * sp;
    const z2 = y1 * sp + z1 * cp;
    return { x: cx + x1 * r, y: cy - z2 * r, depth: y2 };
  }

  ring(ctx, cx, cy, r, axis, color, width) {
    const steps = 64;
    ctx.lineWidth = width || 1;
    for (let half = 0; half < 2; half++) {
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        const v = axis === 'z' ? { x: c, y: s, z: 0 }
          : axis === 'x' ? { x: 0, y: c, z: s }
          : { x: c, y: 0, z: s };
        const p = this.project(v, cx, cy, r);
        const front = p.depth <= 0;
        if ((half === 0) !== front) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; }
        else ctx.lineTo(p.x, p.y);
      }
      ctx.globalAlpha = half === 0 ? 1 : 0.32;
      ctx.strokeStyle = color;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    fitCanvas(this.canvas);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.36;
    const t = this.theme;
    ctx.clearRect(0, 0, w, h);

    // The body of the sphere, lit from upper left.
    const grd = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.05, cx, cy, r);
    grd.addColorStop(0, t.fill);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.fill();

    ctx.strokeStyle = t.wire;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.2832); ctx.stroke();

    this.ring(ctx, cx, cy, r, 'x', t.wire, 1);
    this.ring(ctx, cx, cy, r, 'y', t.wire, 1);
    this.ring(ctx, cx, cy, r, 'z', t.equator, 1.4);

    if (this.labels) {
      ctx.fillStyle = t.label;
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const marks = [
        { v: { x: 0, y: 0, z: 1 }, s: '|0⟩' },
        { v: { x: 0, y: 0, z: -1 }, s: '|1⟩' },
        { v: { x: 1, y: 0, z: 0 }, s: '|+⟩' },
        { v: { x: -1, y: 0, z: 0 }, s: '|−⟩' }
      ];
      for (const m of marks) {
        const p = this.project(m.v, cx, cy, r * 1.19);
        ctx.globalAlpha = p.depth <= 0 ? 1 : 0.35;
        ctx.fillText(m.s, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }

    // The path the state has taken.
    if (this.trail.length > 2) {
      ctx.strokeStyle = t.arrow;
      ctx.lineWidth = 1.4;
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.project(this.trail[i - 1], cx, cy, r);
        const b = this.project(this.trail[i], cx, cy, r);
        ctx.globalAlpha = (i / this.trail.length) * 0.35;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // The state arrow. Its length is the purity: short means entangled.
    const len = Math.hypot(this.vec.x, this.vec.y, this.vec.z);
    const tip = this.project(this.vec, cx, cy, r);
    const origin = this.project({ x: 0, y: 0, z: 0 }, cx, cy, r);
    const glowing = 0.6 + this.pulse * 0.4;

    ctx.save();
    ctx.shadowColor = t.glow;
    ctx.shadowBlur = 14 * glowing;
    ctx.strokeStyle = t.arrow;
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
    ctx.fillStyle = t.tip;
    ctx.beginPath(); ctx.arc(tip.x, tip.y, 4 + this.pulse * 3, 0, 6.2832); ctx.fill();
    ctx.restore();

    // When the arrow is short, say why in one word.
    if (len < 0.96) {
      ctx.fillStyle = t.label;
      ctx.font = '600 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(len < 0.05 ? 'fully entangled' : `mixed · r=${len.toFixed(2)}`, cx, h - 8);
      ctx.strokeStyle = t.arrow;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r * len, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

function point(e) {
  return { x: e.clientX, y: e.clientY };
}

/** Bloch vector straight from a state, for convenience. */
export function vectorFor(state, q) {
  const v = state.bloch(q);
  return { x: v.x, y: v.y, z: v.z, r: v.r };
}
