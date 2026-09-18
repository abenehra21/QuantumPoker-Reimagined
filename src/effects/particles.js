/**
 * effects/particles.js — the dust.
 *
 * A flat-array particle system on one shared 2D canvas. Everything lives in
 * typed arrays rather than objects, because ten thousand little objects a
 * second is how a browser game finds the garbage collector.
 *
 * The budget is a single number the loop turns down when frames get long, so
 * a slow machine loses sparkle instead of frame rate.
 */
import { loop, fitCanvas } from '../engine/loop.js';
import { clamp01 } from '../engine/tween.js';

const MAX = 2400;

export const KIND = {
  dust: 0, spark: 1, photon: 2, shard: 3, arc: 4, ring: 5, rain: 6, smoke: 7
};

export class Particles {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.n = 0;
    this.budget = 1;
    this.enabled = true;

    this.x = new Float32Array(MAX); this.y = new Float32Array(MAX);
    this.vx = new Float32Array(MAX); this.vy = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.size = new Float32Array(MAX); this.rot = new Float32Array(MAX);
    this.spin = new Float32Array(MAX); this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX); this.kind = new Uint8Array(MAX);
    this.r = new Uint8Array(MAX); this.g = new Uint8Array(MAX); this.b = new Uint8Array(MAX);
    this.alpha = new Float32Array(MAX);

    this.stop = loop.add((dt) => this.tick(dt), 'particles');
    loop.onQuality = (q) => { this.budget = q; };
  }

  destroy() { if (this.stop) this.stop(); }

  get count() { return this.n; }

  /** Add one particle. Silently drops when full — never grows the arrays. */
  spawn(o) {
    if (!this.enabled || this.n >= MAX * this.budget) return;
    const i = this.n++;
    this.x[i] = o.x; this.y[i] = o.y;
    this.vx[i] = o.vx || 0; this.vy[i] = o.vy || 0;
    this.max[i] = this.life[i] = o.life || 1;
    this.size[i] = o.size || 2;
    this.rot[i] = o.rot || 0;
    this.spin[i] = o.spin || 0;
    this.drag[i] = o.drag === undefined ? 0.92 : o.drag;
    this.grav[i] = o.grav || 0;
    this.kind[i] = o.kind === undefined ? KIND.dust : o.kind;
    const c = o.color || [110, 231, 255];
    this.r[i] = c[0]; this.g[i] = c[1]; this.b[i] = c[2];
    this.alpha[i] = o.alpha === undefined ? 1 : o.alpha;
  }

  /** Remove particle i by swapping the last one into its slot. */
  kill(i) {
    const last = --this.n;
    if (i === last) return;
    for (const a of ['x', 'y', 'vx', 'vy', 'life', 'max', 'size', 'rot', 'spin', 'drag', 'grav', 'kind', 'r', 'g', 'b', 'alpha']) {
      this[a][i] = this[a][last];
    }
  }

  clear() { this.n = 0; }

  tick(dt) {
    const d = Math.min(dt, 1 / 30);
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= d;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      this.vy[i] += this.grav[i] * d;
      const k = Math.pow(this.drag[i], d * 60);
      this.vx[i] *= k; this.vy[i] *= k;
      this.x[i] += this.vx[i] * d;
      this.y[i] += this.vy[i] * d;
      this.rot[i] += this.spin[i] * d;
    }
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    fitCanvas(this.canvas);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);
    if (!this.n) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.n; i++) {
      const t = clamp01(this.life[i] / this.max[i]);
      const a = this.alpha[i] * (t > 0.85 ? (1 - t) / 0.15 : t);
      if (a <= 0.01) continue;
      const col = `rgba(${this.r[i]},${this.g[i]},${this.b[i]},`;
      const s = this.size[i];
      const x = this.x[i], y = this.y[i];
      switch (this.kind[i]) {
        case KIND.spark: {
          ctx.strokeStyle = col + a + ')';
          ctx.lineWidth = Math.max(0.6, s * 0.4);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - this.vx[i] * 0.02, y - this.vy[i] * 0.02);
          ctx.stroke();
          break;
        }
        case KIND.photon: {
          const grd = ctx.createRadialGradient(x, y, 0, x, y, s * 3);
          grd.addColorStop(0, col + a + ')');
          grd.addColorStop(1, col + '0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(x, y, s * 3, 0, 6.2832); ctx.fill();
          break;
        }
        case KIND.shard: {
          ctx.save();
          ctx.translate(x, y); ctx.rotate(this.rot[i]);
          ctx.fillStyle = col + a + ')';
          ctx.beginPath();
          ctx.moveTo(0, -s); ctx.lineTo(s * 0.5, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.5, 0);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          break;
        }
        case KIND.ring: {
          ctx.strokeStyle = col + a + ')';
          ctx.lineWidth = Math.max(0.5, s * 0.15 * t);
          ctx.beginPath();
          ctx.arc(x, y, s * (1 - t) * 4 + 2, 0, 6.2832);
          ctx.stroke();
          break;
        }
        case KIND.smoke: {
          ctx.globalCompositeOperation = 'source-over';
          const grd = ctx.createRadialGradient(x, y, 0, x, y, s * 4);
          grd.addColorStop(0, col + (a * 0.25) + ')');
          grd.addColorStop(1, col + '0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.arc(x, y, s * 4, 0, 6.2832); ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          break;
        }
        default: {
          ctx.fillStyle = col + a + ')';
          ctx.beginPath(); ctx.arc(x, y, s, 0, 6.2832); ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---------------------------------------------------------------- *
   * Named effects. Everything the game fires goes through one of these,
   * so the whole visual vocabulary is reviewable in one screenful.
   * ---------------------------------------------------------------- */

  /** Ambient quantum dust, drifting upward. Called every frame by the table. */
  ambient(w, h, rate, color) {
    if (Math.random() > rate) return;
    this.spawn({
      x: Math.random() * w, y: h + 10,
      vx: (Math.random() - 0.5) * 12, vy: -8 - Math.random() * 18,
      life: 4 + Math.random() * 5, size: 0.6 + Math.random() * 1.4,
      drag: 0.999, alpha: 0.35, kind: KIND.dust, color: color || [110, 231, 255]
    });
  }

  /** A soft puff, for a card landing or a chip settling. */
  puff(x, y, color, n = 10) {
    for (let i = 0; i < n * this.budget; i++) {
      const a = Math.random() * 6.2832, v = 20 + Math.random() * 70;
      this.spawn({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 15,
        life: 0.4 + Math.random() * 0.5, size: 1 + Math.random() * 2,
        drag: 0.9, kind: KIND.dust, color, alpha: 0.9
      });
    }
  }

  /** A hard burst, for a gate firing. */
  burst(x, y, color, n = 26, speed = 220) {
    for (let i = 0; i < n * this.budget; i++) {
      const a = Math.random() * 6.2832, v = speed * (0.3 + Math.random());
      this.spawn({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.3 + Math.random() * 0.45, size: 1.2 + Math.random() * 2.4,
        drag: 0.87, kind: Math.random() < 0.55 ? KIND.spark : KIND.photon, color
      });
    }
    this.spawn({ x, y, life: 0.45, size: 18, kind: KIND.ring, color, alpha: 0.85, drag: 1 });
  }

  /** The collapse: everything rushes in, then one bright point. */
  collapse(x, y, color) {
    const n = Math.round(34 * this.budget);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.2832, r = 60 + Math.random() * 60;
      this.spawn({
        x: x + Math.cos(a) * r, y: y + Math.sin(a) * r,
        vx: -Math.cos(a) * r * 3.2, vy: -Math.sin(a) * r * 3.2,
        life: 0.32, size: 1.5 + Math.random() * 2, drag: 0.98,
        kind: KIND.photon, color
      });
    }
    setTimeout(() => this.burst(x, y, color, 20, 300), 300);
  }

  /** Shards flying off, for a link breaking. */
  shatter(x, y, color, n = 16) {
    for (let i = 0; i < n * this.budget; i++) {
      const a = Math.random() * 6.2832, v = 60 + Math.random() * 180;
      this.spawn({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        life: 0.6 + Math.random() * 0.6, size: 2 + Math.random() * 3,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 12,
        grav: 420, drag: 0.97, kind: KIND.shard, color
      });
    }
  }

  /** A beam of photons from a to b. Used by Link, Teleport and the dealer. */
  beam(x1, y1, x2, y2, color, density = 1) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const n = Math.round(Math.min(48, len / 6) * density * this.budget);
    for (let i = 0; i < n; i++) {
      const t = i / Math.max(1, n - 1);
      const jitter = (Math.random() - 0.5) * 10;
      const nx = -dy / len, ny = dx / len;
      this.spawn({
        x: x1 + dx * t + nx * jitter, y: y1 + dy * t + ny * jitter,
        vx: nx * (Math.random() - 0.5) * 40, vy: ny * (Math.random() - 0.5) * 40,
        life: 0.25 + Math.random() * 0.4, size: 1 + Math.random() * 1.8,
        drag: 0.9, kind: KIND.photon, color, alpha: 0.9
      });
    }
  }

  /** Probability rain, for the showdown. */
  rain(w, h, color, n = 60) {
    for (let i = 0; i < n * this.budget; i++) {
      this.spawn({
        x: Math.random() * w, y: -20 - Math.random() * h * 0.5,
        vx: (Math.random() - 0.5) * 20, vy: 200 + Math.random() * 260,
        life: 1.6, size: 1 + Math.random() * 1.6, drag: 1, grav: 120,
        kind: KIND.spark, color, alpha: 0.7
      });
    }
  }

  /** A win: gold from the bottom, slowly. */
  confetti(w, h, colors) {
    const n = Math.round(90 * this.budget);
    for (let i = 0; i < n; i++) {
      const c = colors[i % colors.length];
      this.spawn({
        x: w * 0.5 + (Math.random() - 0.5) * w * 0.6, y: h + 10,
        vx: (Math.random() - 0.5) * 300, vy: -320 - Math.random() * 420,
        life: 1.8 + Math.random(), size: 2 + Math.random() * 3.5,
        rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 14,
        grav: 620, drag: 0.99, kind: KIND.shard, color: c
      });
    }
  }
}
