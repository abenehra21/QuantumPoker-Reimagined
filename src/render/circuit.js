/**
 * render/circuit.js — the circuit diagram.
 *
 * Draws exactly what a physicist draws: wires left to right, boxed single
 * gates, filled dots joined to targets for controlled gates, crosses for a
 * swap and a meter for a measurement. Under each wire runs a live trace of
 * P(1), so the picture shows both the program and what it is doing.
 *
 * Newly added gates flash in, which is what makes the Circuit View worth
 * switching to mid-hand rather than only at the end.
 */
import { loop, fitCanvas } from '../engine/loop.js';
import { OPS } from '../quantum/circuit.js';
import { clamp01, EASE } from '../engine/tween.js';

const COL_W = 46;
const PAD_L = 74;
const PAD_R = 24;

export class CircuitView {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.circuit = null;
    this.trace = null;
    this.ages = new Map();
    this.showTrace = opts.trace !== false;
    this.accent = opts.accent || '#6ee7ff';
    this.scroll = 0;
    this.time = 0;
    this.stop = loop.add((dt) => { this.time += dt; this.draw(); }, 'circuit');
  }

  destroy() { if (this.stop) this.stop(); }

  set(circuit) {
    if (circuit !== this.circuit) { this.circuit = circuit; this.ages.clear(); }
    if (!circuit) return;
    // Anything we have not seen before is new, and gets a moment of glow.
    circuit.ops.forEach((o, i) => { if (!this.ages.has(i)) this.ages.set(i, this.time); });
    this.trace = this.showTrace ? circuit.trace() : null;
  }

  /** Scroll so the newest column is visible. */
  followEnd(width) {
    if (!this.circuit) return;
    const need = PAD_L + this.circuit.depth * COL_W + PAD_R;
    this.scroll = Math.max(0, need - width);
  }

  draw() {
    const ctx = this.ctx;
    if (!ctx) return;
    fitCanvas(this.canvas);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const c = this.circuit;
    if (!c) return;

    const n = c.n;
    const top = 26;
    const usable = h - top - 34;
    const rowH = usable / n;
    const y = (q) => top + rowH * (q + 0.5);
    const x = (col) => PAD_L + col * COL_W + COL_W / 2 - this.scroll;

    this.followEnd(w);

    // Wires and their labels.
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textBaseline = 'middle';
    for (let q = 0; q < n; q++) {
      ctx.strokeStyle = 'rgba(148,163,184,0.32)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(PAD_L - 10, y(q)); ctx.lineTo(w - 8, y(q)); ctx.stroke();
      ctx.fillStyle = 'rgba(226,232,240,0.8)';
      ctx.textAlign = 'right';
      ctx.fillText(`coin ${q + 1}`, PAD_L - 18, y(q));
    }

    // The live probability trace, drawn under the wires.
    if (this.trace && this.trace.length > 1) {
      for (let q = 0; q < n; q++) {
        ctx.beginPath();
        ctx.strokeStyle = this.accent;
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 1.4;
        let started = false, lastY = null;
        for (let i = 0; i < this.trace.length; i++) {
          const op = c.ops[i - 1];
          const col = i === 0 ? -1 : (op ? op.column : i - 1);
          const px = x(col) + COL_W / 2;
          const py = y(q) + rowH * 0.34 - this.trace[i][q] * rowH * 0.3;
          if (!started) { ctx.moveTo(px, py); started = true; } else ctx.lineTo(px, py);
          lastY = py;
        }
        // Carry the last value out to the end of the wire, so the trace reads
        // as "and it stays there" rather than stopping in mid-air.
        if (started && lastY !== null) ctx.lineTo(w - 8, lastY);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // The instructions.
    c.ops.forEach((o, i) => {
      const spec = OPS[o.op];
      if (!spec) return;
      const px = x(o.column);
      const age = this.time - (this.ages.get(i) || this.time);
      const fresh = clamp01(1 - age / 0.7);
      const glow = EASE.outCubic(fresh);

      ctx.save();
      if (glow > 0.01) { ctx.shadowColor = this.accent; ctx.shadowBlur = 20 * glow; }

      if (spec.barrier) {
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = 'rgba(148,163,184,0.45)';
        ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px, top + usable); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        return;
      }

      if (spec.noiseMark) {
        const q = o.targets[0];
        ctx.fillStyle = '#fb7185';
        ctx.beginPath(); ctx.arc(px, y(q), 4.5, 0, 6.2832); ctx.fill();
        ctx.font = '700 9px ui-monospace, monospace';
        ctx.fillStyle = 'rgba(251,113,133,0.85)';
        ctx.textAlign = 'center';
        ctx.fillText('✳', px, y(q) - 12);
        ctx.restore();
        return;
      }

      const colour = o.foreign ? '#fb7185' : o.boss ? '#fbbf24' : o.chaos ? '#c084fc' : this.accent;

      // The vertical spine of a multi-qubit gate.
      if (o.targets.length > 1) {
        const ys = o.targets.map(y);
        ctx.strokeStyle = colour;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(px, Math.min(...ys)); ctx.lineTo(px, Math.max(...ys)); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (spec.cross) {
        for (const q of o.targets) {
          ctx.strokeStyle = colour; ctx.lineWidth = 2;
          const s = 5;
          ctx.beginPath();
          ctx.moveTo(px - s, y(q) - s); ctx.lineTo(px + s, y(q) + s);
          ctx.moveTo(px + s, y(q) - s); ctx.lineTo(px - s, y(q) + s);
          ctx.stroke();
        }
      } else if (spec.control) {
        const controls = o.targets.slice(0, spec.control);
        for (const q of controls) {
          ctx.fillStyle = colour;
          ctx.beginPath(); ctx.arc(px, y(q), 4.5, 0, 6.2832); ctx.fill();
        }
        const rest = o.targets.slice(spec.control);
        for (const q of rest) {
          if (spec.target === 'plus') {
            ctx.strokeStyle = colour; ctx.lineWidth = 1.8;
            ctx.beginPath(); ctx.arc(px, y(q), 8, 0, 6.2832); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px - 8, y(q)); ctx.lineTo(px + 8, y(q));
            ctx.moveTo(px, y(q) - 8); ctx.lineTo(px, y(q) + 8);
            ctx.stroke();
          } else {
            ctx.fillStyle = colour;
            ctx.beginPath(); ctx.arc(px, y(q), 4.5, 0, 6.2832); ctx.fill();
          }
        }
        if (!rest.length && spec.control === 2) { /* CZ: two dots, already drawn */ }
      } else if (spec.meter) {
        const q = o.targets[0];
        box(ctx, px, y(q), colour, glow);
        ctx.strokeStyle = colour; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(px, y(q) + 4, 6, Math.PI, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px, y(q) + 4); ctx.lineTo(px + 5, y(q) - 3); ctx.stroke();
        if (o.bit === 0 || o.bit === 1) {
          ctx.fillStyle = o.bit ? '#4ade80' : 'rgba(148,163,184,0.9)';
          ctx.font = '700 10px ui-monospace, monospace';
          ctx.textAlign = 'center';
          ctx.fillText(String(o.bit), px + 15, y(q) - 8);
        }
      } else {
        const q = o.targets[0];
        box(ctx, px, y(q), colour, glow);
        ctx.fillStyle = '#e2f7ff';
        ctx.font = '700 11px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(spec.label, px, y(q) + 0.5);
        if (spec.param && o.param !== null && o.param !== undefined) {
          ctx.font = '600 8px ui-monospace, monospace';
          ctx.fillStyle = 'rgba(226,232,240,0.7)';
          ctx.fillText((o.param / Math.PI).toFixed(2) + 'π', px, y(q) + 15);
        }
      }
      ctx.restore();
    });

    // Measurement bus at the end.
    ctx.strokeStyle = 'rgba(148,163,184,0.22)';
    ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(PAD_L - 10, h - 16); ctx.lineTo(w - 8, h - 16); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`depth ${c.depth} · ${c.gateCount} gate${c.gateCount === 1 ? '' : 's'}` +
      (c.entanglingCount ? ` · ${c.entanglingCount} entangling` : ''), PAD_L - 10, h - 6);
  }
}

function box(ctx, x, y, colour, glow) {
  const s = 13;
  ctx.fillStyle = 'rgba(10,16,32,0.92)';
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5 + glow;
  roundRect(ctx, x - s, y - s, s * 2, s * 2, 4);
  ctx.fill(); ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
