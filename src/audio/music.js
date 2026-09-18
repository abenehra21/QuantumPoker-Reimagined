/**
 * audio/music.js — a soundtrack that is generated, not played back.
 *
 * Layered ambient: a drone, a slow pad, an arpeggio and a pulse. Each layer
 * fades in and out independently, so "menu" and "boss" are the same piece of
 * music at different intensities rather than separate tracks that have to be
 * crossfaded. That is why the transition from betting to showdown never has
 * a seam in it.
 *
 * Everything is scheduled a bar ahead on the WebAudio clock, so it stays in
 * time even when the main thread is busy dealing cards.
 */
import { init, unlock, tone, noise, buses, context, running } from './synth.js';

const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11]
};

/** The moods. A mood is a target for each layer plus a tempo and a scale. */
export const MOODS = {
  silence: { drone: 0, pad: 0, arp: 0, pulse: 0, bpm: 60, scale: 'minor', root: 55 },
  menu:    { drone: 0.5, pad: 0.4, arp: 0.25, pulse: 0, bpm: 64, scale: 'dorian', root: 55 },
  table:   { drone: 0.4, pad: 0.3, arp: 0.12, pulse: 0.1, bpm: 72, scale: 'minor', root: 55 },
  tension: { drone: 0.55, pad: 0.2, arp: 0.3, pulse: 0.45, bpm: 92, scale: 'phrygian', root: 55 },
  cards:   { drone: 0.35, pad: 0.45, arp: 0.35, pulse: 0.2, bpm: 80, scale: 'dorian', root: 55 },
  boss:    { drone: 0.7, pad: 0.25, arp: 0.4, pulse: 0.6, bpm: 104, scale: 'phrygian', root: 41.2 },
  victory: { drone: 0.3, pad: 0.6, arp: 0.5, pulse: 0.15, bpm: 76, scale: 'lydian', root: 65.4 },
  defeat:  { drone: 0.5, pad: 0.35, arp: 0, pulse: 0, bpm: 52, scale: 'minor', root: 49 },
  shop:    { drone: 0.3, pad: 0.45, arp: 0.3, pulse: 0.05, bpm: 68, scale: 'lydian', root: 61.7 },
  sandbox: { drone: 0.25, pad: 0.3, arp: 0.1, pulse: 0, bpm: 58, scale: 'lydian', root: 55 }
};

/** Cosmetic music packs retune the whole thing without new code. */
export const PACKS = {
  default: { name: 'Quantum Casino', tone: 'triangle', padType: 'sine', bright: 1 },
  music_lab: { name: 'Lab Ambient', tone: 'sine', padType: 'sine', bright: 0.7, droneOnly: 0.5 },
  music_pulse: { name: 'Pulse Sequence', tone: 'square', padType: 'sawtooth', bright: 1.4 }
};

class Layer {
  constructor(name) { this.name = name; this.level = 0; this.target = 0; }
  approach(dt, rate = 1.2) { this.level += (this.target - this.level) * Math.min(1, dt * rate); }
}

export class Music {
  constructor() {
    this.mood = MOODS.silence;
    this.pack = PACKS.default;
    this.layers = {
      drone: new Layer('drone'), pad: new Layer('pad'),
      arp: new Layer('arp'), pulse: new Layer('pulse')
    };
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.enabled = true;
    this.drone = null;
    this.lastTick = 0;
  }

  start() {
    if (!init()) return false;
    unlock();
    if (this.timer) return true;
    this.nextTime = context().currentTime + 0.1;
    this.lastTick = Date.now();
    // A 90ms poll scheduling 400ms ahead: the audio clock keeps the timing,
    // the main thread only has to be roughly on time.
    this.timer = setInterval(() => this.schedule(), 90);
    this.startDrone();
    return true;
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.drone) {
      try { this.drone.osc.stop(context().currentTime + 0.4); this.drone.osc2.stop(context().currentTime + 0.4); } catch (e) { /* already stopped */ }
      this.drone = null;
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.stop(); else this.start();
  }

  setPack(id) { this.pack = PACKS[id] || PACKS.default; }

  /** Move to a mood. Layers slide there over a second or two. */
  set(moodName) {
    const m = MOODS[moodName] || MOODS.table;
    if (this.mood === m) return;
    this.mood = m;
    for (const k of Object.keys(this.layers)) this.layers[k].target = m[k] || 0;
    if (this.drone) {
      const ctx = context();
      this.drone.osc.frequency.setTargetAtTime(m.root, ctx.currentTime, 1.2);
      this.drone.osc2.frequency.setTargetAtTime(m.root * 1.5, ctx.currentTime, 1.4);
    }
  }

  startDrone() {
    const ctx = context();
    if (!ctx || this.drone) return;
    const bus = buses().music;
    const g = ctx.createGain();
    g.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.2;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth'; osc.frequency.value = this.mood.root;
    const osc2 = ctx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = this.mood.root * 1.5; osc2.detune.value = 6;
    osc.connect(f); osc2.connect(f); f.connect(g); g.connect(bus);
    osc.start(); osc2.start();
    this.drone = { osc, osc2, gain: g, filter: f };
  }

  /** Schedule any beats that fall in the next 400ms. */
  schedule() {
    const ctx = context();
    if (!ctx || !this.enabled) return;
    const dt = Math.min(0.5, (Date.now() - this.lastTick) / 1000);
    this.lastTick = Date.now();
    for (const k of Object.keys(this.layers)) this.layers[k].approach(dt);
    if (this.drone) {
      this.drone.gain.gain.setTargetAtTime(this.layers.drone.level * 0.09, ctx.currentTime, 0.4);
      this.drone.filter.frequency.setTargetAtTime(260 + this.layers.pulse.level * 900, ctx.currentTime, 0.6);
    }

    const beat = 60 / this.mood.bpm / 2;      // eighth notes
    const horizon = ctx.currentTime + 0.4;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 32) {
      this.emit(this.nextTime, this.step);
      this.step++;
      this.nextTime += beat;
    }
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + beat;
  }

  emit(t, step) {
    const bus = buses().music;
    const scale = SCALES[this.mood.scale] || SCALES.minor;
    const root = this.mood.root * 4;
    const deg = (i) => root * Math.pow(2, scale[((i % 7) + 7) % 7] / 12 + Math.floor(i / 7));
    const bright = this.pack.bright || 1;

    // Pad: one long chord every two bars.
    const pad = this.layers.pad.level;
    if (pad > 0.02 && step % 16 === 0) {
      const base = [0, 4, 8][(step / 16) % 3];
      [0, 2, 4].forEach((d, i) => tone({
        bus, at: t + i * 0.04, freq: deg(base + d) / 2, dur: 5.2,
        peak: pad * 0.045, type: this.pack.padType, attack: 1.4
      }));
    }

    // Arpeggio: a wandering line, not a loop.
    const arp = this.layers.arp.level;
    if (arp > 0.02 && step % 2 === 0) {
      const pattern = [0, 2, 4, 6, 4, 2, 7, 4];
      const d = pattern[(step / 2) % pattern.length] + (Math.floor(step / 32) % 3);
      tone({
        bus, at: t, freq: deg(d) * bright, dur: 0.5,
        peak: arp * 0.05, type: this.pack.tone,
        filter: { freq: 2600 * bright, q: 1.5 }
      });
    }

    // Pulse: the heartbeat that arrives with tension.
    const pulse = this.layers.pulse.level;
    if (pulse > 0.02 && step % 4 === 0) {
      tone({ bus, at: t, freq: this.mood.root, to: this.mood.root * 0.6, dur: 0.24, peak: pulse * 0.16, type: 'sine' });
      noise({ bus, at: t, freq: 140, q: 0.6, dur: 0.16, peak: pulse * 0.05, type: 'lowpass' });
    }
    if (pulse > 0.3 && step % 8 === 4) {
      noise({ bus, at: t, freq: 6500, q: 2, dur: 0.06, peak: pulse * 0.035 });
    }
  }

  /** A short sting over the top of whatever is playing. */
  sting(kind) {
    const ctx = context();
    if (!ctx || !this.enabled) return;
    const bus = buses().music;
    const t = ctx.currentTime;
    const root = this.mood.root * 4;
    if (kind === 'boss') {
      [0, -1, -2].forEach((d, i) => tone({ bus, at: t + i * 0.16, freq: root * Math.pow(2, d / 12) / 2, dur: 1.6, peak: 0.12, type: 'sawtooth', filter: { freq: 700, to: 200, q: 4 } }));
    } else if (kind === 'victory') {
      [0, 4, 7, 12].forEach((d, i) => tone({ bus, at: t + i * 0.08, freq: root * Math.pow(2, d / 12), dur: 1.6, peak: 0.09, type: 'triangle' }));
    } else if (kind === 'defeat') {
      [0, -2, -5].forEach((d, i) => tone({ bus, at: t + i * 0.2, freq: root * Math.pow(2, d / 12) / 2, dur: 2, peak: 0.1, type: 'sine' }));
    }
  }
}

export const music = new Music();
