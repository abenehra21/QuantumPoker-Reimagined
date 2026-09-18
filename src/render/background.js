/**
 * render/background.js — the living backdrop.
 *
 * A slow parallax field of circuit traces, drifting qubits and floating
 * chips, with a camera that never stops moving. It runs behind the menu and,
 * dimmed, behind the table.
 *
 * Everything is generated from a seed, so the background is deterministic
 * and the same machine draws the same sky every time.
 */
import { loop, fitCanvas } from '../engine/loop.js';
import { mulberry32 } from '../utils/rng.js';
import { clamp01 } from '../engine/tween.js';

export class Background {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.rng = mulberry32(opts.seed || 1312);
    this.t = 0;
    this.intensity = opts.intensity === undefined ? 1 : opts.intensity;
    this.accent = opts.accent || [110, 231, 255];
    this.accent2 = opts.accent2 || [192, 132, 252];
    this.cam = { x: 0, y: 0, tx: 0, ty: 0 };
    this.quality = 1;
    this.build();
    this.bindPointer();
    this.stop = loop.add((dt, l) => { this.quality = l.quality; this.tick(dt); }, 'background');
  }

  destroy() { if (this.stop) this.stop(); if (this._unbind) this._unbind(); }

  setIntensity(v) { this.intensity = v; }
  setAccent(a, b) { if (a) this.accent = a; if (b) this.accent2 = b; }

  build() {
    const r = this.rng;
    // Circuit traces: long horizontal runs with right-angle jogs, like a die.
    this.traces = [];
    for (let i = 0; i < 26; i++) {
      const pts = [];
      let x = -0.2 + r() * 0.2, y = r();
      pts.push({ x, y });
      const segs = 2 + Math.floor(r() * 4);
      for (let s = 0; s < segs; s++) {
        x += 0.12 + r() * 0.3;
        pts.push({ x, y });
        y += (r() - 0.5) * 0.24;
        pts.push({ x, y });
      }
      x += 0.2 + r() * 0.4;
      pts.push({ x, y });
      this.traces.push({
        pts, depth: 0.3 + r() * 0.7, speed: 0.008 + r() * 0.02,
        phase: r() * 10, width: 0.6 + r() * 1.4
      });
    }
    // Qubits: slowly orbiting spheres.
    this.qubits = [];
    for (let i = 0; i < 16; i++) {
      this.qubits.push({
        x: r(), y: r(), depth: 0.25 + r() * 0.75,
        size: 4 + r() * 16, spin: (r() - 0.5) * 0.7,
        orbit: 0.01 + r() * 0.05, phase: r() * 6.28,
        hue: r() < 0.5 ? 0 : 1
      });
    }
    // Chips: flat discs drifting with a little rotation.
    this.chips = [];
    for (let i = 0; i < 12; i++) {
      this.chips.push({
        x: r(), y: r(), depth: 0.2 + r() * 0.8,
        size: 8 + r() * 22, rot: r() * 6.28, spin: (r() - 0.5) * 0.5,
        drift: 0.01 + r() * 0.03, phase: r() * 6.28
      });
    }
  }

  bindPointer() {
    const onMove = (e) => {
      const w = window.innerWidth || 1, h = window.innerHeight || 1;
      this.cam.tx = (e.clientX / w - 0.5) * 2;
      this.cam.ty = (e.clientY / h - 0.5) * 2;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    this._unbind = () => window.removeEventListener('pointermove', onMove);
  }

  tick(dt) {
    this.t += dt;
    // The camera drifts on its own and leans toward the pointer.
    const autoX = Math.sin(this.t * 0.11) * 0.55 + Math.sin(this.t * 0.043) * 0.3;
    const autoY = Math.cos(this.t * 0.087) * 0.4;
    this.cam.x += ((this.cam.tx * 0.6 + autoX) - this.cam.x) * Math.min(1, dt * 1.6);
    this.cam.y += ((this.cam.ty * 0.4 + autoY) - this.cam.y) * Math.min(1, dt * 1.6);
    this.draw();
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    fitCanvas(this.canvas, 1.5);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const I = this.intensity * (0.5 + this.quality * 0.5);
    if (I <= 0.01) return;

    const A = this.accent, B = this.accent2;
    const par = (d) => ({ x: -this.cam.x * 34 * d, y: -this.cam.y * 24 * d });

    ctx.globalCompositeOperation = 'lighter';

    // Circuit traces.
    for (const tr of this.traces) {
      const o = par(tr.depth);
      const flow = (this.t * tr.speed + tr.phase) % 1;
      ctx.lineWidth = tr.width * tr.depth;
      ctx.strokeStyle = `rgba(${A[0]},${A[1]},${A[2]},${0.05 * I * tr.depth})`;
      ctx.beginPath();
      tr.pts.forEach((p, i) => {
        const px = (p.x % 1.6) * w + o.x, py = p.y * h + o.y;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();

      // A packet of light travelling along the trace.
      const total = tr.pts.length - 1;
      const seg = Math.floor(flow * total);
      const f = flow * total - seg;
      const a = tr.pts[Math.min(seg, total)], b = tr.pts[Math.min(seg + 1, total)];
      if (a && b) {
        const px = ((a.x + (b.x - a.x) * f) % 1.6) * w + o.x;
        const py = (a.y + (b.y - a.y) * f) * h + o.y;
        const g = ctx.createRadialGradient(px, py, 0, px, py, 26 * tr.depth);
        g.addColorStop(0, `rgba(${A[0]},${A[1]},${A[2]},${0.5 * I * tr.depth})`);
        g.addColorStop(1, `rgba(${A[0]},${A[1]},${A[2]},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, 26 * tr.depth, 0, 6.2832); ctx.fill();
      }
    }

    // Qubits.
    for (const q of this.qubits) {
      const o = par(q.depth);
      const ox = Math.cos(this.t * q.orbit + q.phase) * 40 * q.depth;
      const oy = Math.sin(this.t * q.orbit * 1.3 + q.phase) * 30 * q.depth;
      const px = q.x * w + o.x + ox, py = q.y * h + o.y + oy;
      const r = q.size * q.depth;
      const c = q.hue ? B : A;
      const g = ctx.createRadialGradient(px - r * 0.3, py - r * 0.3, 0, px, py, r * 2.2);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${0.3 * I * q.depth})`);
      g.addColorStop(0.5, `rgba(${c[0]},${c[1]},${c[2]},${0.08 * I * q.depth})`);
      g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, 6.2832); ctx.fill();

      // A little equator, so they read as spheres rather than blobs.
      ctx.strokeStyle = `rgba(${c[0]},${c[1]},${c[2]},${0.22 * I * q.depth})`;
      ctx.lineWidth = 1;
      const tilt = Math.sin(this.t * q.spin + q.phase);
      ctx.beginPath();
      ctx.ellipse(px, py, r, Math.abs(r * tilt), 0.4, 0, 6.2832);
      ctx.stroke();
    }

    // Chips.
    if (this.quality > 0.4) {
      for (const c of this.chips) {
        const o = par(c.depth);
        const py = ((c.y + this.t * c.drift) % 1.2 - 0.1) * h + o.y;
        const px = c.x * w + o.x + Math.sin(this.t * 0.3 + c.phase) * 18 * c.depth;
        const r = c.size * c.depth;
        const squash = Math.abs(Math.cos(this.t * c.spin + c.rot));
        ctx.save();
        ctx.translate(px, py);
        ctx.strokeStyle = `rgba(${B[0]},${B[1]},${B[2]},${0.16 * I * c.depth})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(0, 0, r, Math.max(1.5, r * squash * 0.4), 0.2, 0, 6.2832); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, Math.max(1, r * squash * 0.25), 0.2, 0, 6.2832); ctx.stroke();
        ctx.restore();
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
