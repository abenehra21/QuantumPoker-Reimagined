/**
 * audio/synth.js — every sound in the game, made from scratch.
 *
 * No audio files. Nothing to download, nothing to license, and the whole
 * soundtrack is a few kilobytes of arithmetic. WebAudio is built lazily on
 * the first gesture because browsers refuse to start it any earlier.
 */

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let reverb = null;
let started = false;

export function context() { return ctx; }
export function running() { return !!ctx && ctx.state === 'running'; }

/** Build the graph. Safe to call repeatedly. */
export function init() {
  if (ctx) return ctx;
  const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return null;
  try { ctx = new AC(); } catch (e) { return null; }

  master = ctx.createGain();
  master.gain.value = 0.8;

  // A gentle limiter so a burst of simultaneous effects never clips.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.18;

  master.connect(comp);
  comp.connect(ctx.destination);

  musicBus = ctx.createGain(); musicBus.gain.value = 0.5;
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8;

  reverb = ctx.createConvolver();
  reverb.buffer = impulse(1.9, 2.6);
  const wet = ctx.createGain(); wet.gain.value = 0.22;
  reverb.connect(wet); wet.connect(master);

  musicBus.connect(master); musicBus.connect(reverb);
  sfxBus.connect(master); sfxBus.connect(reverb);
  return ctx;
}

/** Resume after a gesture. Returns true when audio is actually live. */
export function unlock() {
  if (!ctx) init();
  if (!ctx) return false;
  if (ctx.state === 'suspended') ctx.resume();
  started = true;
  return ctx.state !== 'suspended';
}

export function setVolumes(v) {
  if (!ctx) return;
  master.gain.setTargetAtTime(v.master === undefined ? 0.8 : v.master, ctx.currentTime, 0.02);
  musicBus.gain.setTargetAtTime(v.music === undefined ? 0.5 : v.music, ctx.currentTime, 0.05);
  sfxBus.gain.setTargetAtTime(v.sfx === undefined ? 0.8 : v.sfx, ctx.currentTime, 0.02);
}

export function buses() { return { music: musicBus, sfx: sfxBus, master }; }

/** A decaying-noise impulse response. Cheap, and it sounds like a big room. */
function impulse(seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** Shared noise buffer: one second, reused by every noise-based sound. */
let noiseBuffer = null;
export function noiseBuf() {
  if (noiseBuffer) return noiseBuffer;
  const len = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/* ---------------------------------------------------------------- *
 * Primitives
 * ---------------------------------------------------------------- */

/** One oscillator with an envelope. The building block of almost everything. */
export function tone(o) {
  if (!ctx) return;
  const bus = o.bus || sfxBus;
  const t = o.at === undefined ? ctx.currentTime : o.at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + (o.dur || 0.2));
  if (o.detune) osc.detune.setValueAtTime(o.detune, t);

  const peak = o.peak === undefined ? 0.25 : o.peak;
  const dur = o.dur === undefined ? 0.2 : o.dur;
  const attack = o.attack === undefined ? 0.006 : o.attack;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  let node = osc;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type || 'lowpass';
    f.frequency.setValueAtTime(o.filter.freq || 2000, t);
    if (o.filter.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.filter.to), t + dur);
    f.Q.value = o.filter.q || 1;
    node.connect(f); node = f;
  }
  node.connect(gain);
  gain.connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.05);
  return { osc, gain };
}

/** Filtered noise: every paper, fabric and impact sound in the game. */
export function noise(o) {
  if (!ctx) return;
  const bus = o.bus || sfxBus;
  const t = o.at === undefined ? ctx.currentTime : o.at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf();
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'bandpass';
  f.frequency.setValueAtTime(o.freq || 1200, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + (o.dur || 0.15));
  f.Q.value = o.q === undefined ? 1 : o.q;
  const g = ctx.createGain();
  const dur = o.dur === undefined ? 0.15 : o.dur;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.peak === undefined ? 0.2 : o.peak), t + (o.attack || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(bus);
  src.start(t);
  src.stop(t + dur + 0.05);
  return { src, gain: g };
}

/** A struck metal partial stack. Chips, bells, the showdown chime. */
export function metal(o) {
  if (!ctx) return;
  const t = o.at === undefined ? ctx.currentTime : o.at;
  const partials = o.partials || [1, 2.76, 5.4, 8.9];
  partials.forEach((p, i) => {
    tone({
      bus: o.bus, at: t, freq: o.freq * p, type: 'sine',
      dur: (o.dur || 0.5) / (1 + i * 0.6),
      peak: (o.peak === undefined ? 0.12 : o.peak) / (1 + i * 1.4),
      attack: 0.002
    });
  });
}

export const now = () => (ctx ? ctx.currentTime : 0);
