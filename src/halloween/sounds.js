/**
 * halloween/sounds.js — the spooky half of the sound design.
 *
 * Built on the same WebAudio synth as the rest of the project, so there are
 * still no audio files anywhere. Everything here leans warm and silly
 * rather than frightening: a party, not a horror film.
 */
import { tone, noise, metal, now, running, unlock } from '../audio/synth.js';

let muted = false;
export function setMuted(v) { muted = !!v; }

function ready() {
  if (muted) return false;
  if (!running()) { unlock(); if (!running()) return false; }
  return true;
}

export const SPOOK = {
  /** A card sliding off the deck. */
  deal(i = 0) {
    if (!ready()) return;
    const t = now() + i * 0.07;
    noise({ at: t, freq: 3000, to: 800, q: 0.8, dur: 0.1, peak: 0.16 });
    tone({ at: t, freq: 260, to: 150, dur: 0.06, peak: 0.04, type: 'sine' });
  },

  /** Candy: small, plasticky, plural. */
  candy(n = 1) {
    if (!ready()) return;
    for (let i = 0; i < Math.min(6, n); i++) {
      const t = now() + i * 0.035 + Math.random() * 0.012;
      tone({ at: t, freq: 900 + Math.random() * 700, dur: 0.07, peak: 0.07, type: 'triangle' });
      noise({ at: t, freq: 5200, q: 3, dur: 0.04, peak: 0.05 });
    }
  },

  /** A pile of it landing at once. */
  candyPile() {
    if (!ready()) return;
    const t = now();
    for (let i = 0; i < 12; i++) {
      tone({ at: t + i * 0.028, freq: 700 + Math.random() * 900, dur: 0.1, peak: 0.06, type: 'triangle' });
    }
    noise({ at: t, freq: 1800, to: 500, q: 0.7, dur: 0.4, peak: 0.1 });
  },

  /** The measurement: a rising rush, then one clean bell. */
  measure() {
    if (!ready()) return;
    const t = now();
    noise({ at: t, freq: 240, to: 6400, q: 1.1, dur: 0.34, peak: 0.16 });
    tone({ at: t, freq: 180, to: 900, dur: 0.34, peak: 0.1, type: 'sawtooth', filter: { freq: 500, to: 3200, q: 5 } });
    metal({ at: t + 0.33, freq: 1180, dur: 0.8, peak: 0.16, partials: [1, 2.3, 3.9] });
  },

  /** A card going into superposition: two detuned voices, wandering. */
  haunt() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 320, dur: 0.9, peak: 0.08, type: 'sine', detune: 14 });
    tone({ at: t, freq: 320, dur: 0.9, peak: 0.08, type: 'sine', detune: -14 });
    tone({ at: t + 0.1, freq: 480, to: 420, dur: 0.7, peak: 0.05, type: 'triangle' });
    noise({ at: t, freq: 6000, q: 4, dur: 0.6, peak: 0.04 });
  },

  /** A swap: a whoosh with a flick at the end. */
  swap() {
    if (!ready()) return;
    const t = now();
    noise({ at: t, freq: 600, to: 4200, q: 0.8, dur: 0.24, peak: 0.14 });
    tone({ at: t + 0.16, freq: 780, to: 1400, dur: 0.14, peak: 0.1, type: 'triangle' });
  },

  /** Entanglement: two notes that refuse to be separate. */
  entangle() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 392, dur: 1.1, peak: 0.09, type: 'sine', detune: 9 });
    tone({ at: t, freq: 392, dur: 1.1, peak: 0.09, type: 'sine', detune: -9 });
    tone({ at: t + 0.14, freq: 588, dur: 0.9, peak: 0.06, type: 'sine' });
  },

  /** The bluff: something goes quiet that should not be quiet. */
  bluff() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 420, to: 90, dur: 0.5, peak: 0.13, type: 'sawtooth', filter: { freq: 2200, to: 200, q: 3 } });
    noise({ at: t, freq: 300, q: 0.6, dur: 0.4, peak: 0.07, type: 'lowpass' });
  },

  /** A bluff falling apart in public. */
  bluffFail() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 300, to: 620, dur: 0.22, peak: 0.14, type: 'square', filter: { freq: 2400, q: 2 } });
    noise({ at: t + 0.1, freq: 3200, to: 700, q: 1.4, dur: 0.3, peak: 0.12 });
  },

  /** Quantum collapse. The biggest noise in the mode. */
  collapse() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 70, dur: 1.9, peak: 0.24, type: 'sawtooth', filter: { freq: 420, to: 110, q: 4 } });
    tone({ at: t + 0.06, freq: 104, dur: 1.6, peak: 0.13, type: 'square', filter: { freq: 500, q: 6 } });
    noise({ at: t, freq: 160, q: 0.5, dur: 1.4, peak: 0.13, type: 'lowpass' });
    for (let i = 0; i < 6; i++) {
      metal({ at: t + 0.2 + i * 0.09, freq: 700 + i * 260, dur: 0.7, peak: 0.06 });
    }
  },

  /** An all-in. Should make somebody across the room look up. */
  allIn() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 120, to: 58, dur: 0.9, peak: 0.26, type: 'sawtooth', filter: { freq: 1700, to: 180, q: 4 } });
    for (let i = 0; i < 14; i++) {
      tone({ at: t + i * 0.03, freq: 600 + Math.random() * 1100, dur: 0.12, peak: 0.07, type: 'triangle' });
    }
    noise({ at: t, freq: 900, to: 180, q: 0.6, dur: 0.7, peak: 0.12 });
  },

  /** Winning. Warm, major, slightly ridiculous. */
  win(big) {
    if (!ready()) return;
    const t = now(), root = 261.63;
    const chord = big ? [0, 4, 7, 11, 14] : [0, 4, 7];
    chord.forEach((s, i) => tone({
      at: t + i * 0.06, freq: root * Math.pow(2, s / 12),
      dur: 1.4, peak: 0.11, type: 'triangle'
    }));
    if (big) {
      for (let i = 0; i < 10; i++) {
        metal({ at: t + 0.3 + i * 0.05, freq: 1200 + Math.random() * 900, dur: 0.4, peak: 0.07 });
      }
    }
  },

  /** Losing. A little sad trombone, not a death knell. */
  lose() {
    if (!ready()) return;
    const t = now();
    [0, -2, -4, -6].forEach((s, i) => tone({
      at: t + i * 0.13, freq: 220 * Math.pow(2, s / 12),
      dur: 0.5, peak: 0.1, type: 'sawtooth', filter: { freq: 900, to: 400, q: 2 }
    }));
  },

  /** A ghost, for the theatre of it. */
  ghost() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 300, to: 620, dur: 0.7, peak: 0.07, type: 'sine' });
    tone({ at: t + 0.2, freq: 620, to: 280, dur: 0.8, peak: 0.05, type: 'sine' });
  },

  /** A door creaking. Used once, when the mode opens. */
  creak() {
    if (!ready()) return;
    const t = now();
    tone({ at: t, freq: 90, to: 300, dur: 1.2, peak: 0.08, type: 'sawtooth', filter: { freq: 700, to: 1600, q: 8 } });
    noise({ at: t + 0.3, freq: 1200, q: 6, dur: 0.7, peak: 0.04 });
  },

  /** A cackle, for the Witch. Three descending blips, not a sound effect. */
  cackle() {
    if (!ready()) return;
    const t = now();
    [0, 1, 2, 3].forEach((i) => tone({
      at: t + i * 0.09, freq: 700 - i * 70, dur: 0.1, peak: 0.07, type: 'square',
      filter: { freq: 2400, q: 3 }
    }));
  },

  /** Trick or treat: a doorbell. */
  refill() {
    if (!ready()) return;
    const t = now();
    metal({ at: t, freq: 660, dur: 0.7, peak: 0.12, partials: [1, 2.4] });
    metal({ at: t + 0.22, freq: 523, dur: 0.9, peak: 0.12, partials: [1, 2.4] });
  },

  /** A new power arriving. */
  unlockPower() {
    if (!ready()) return;
    const t = now();
    [0, 5, 9, 12].forEach((s, i) => tone({
      at: t + i * 0.08, freq: 330 * Math.pow(2, s / 12), dur: 0.8, peak: 0.09, type: 'triangle'
    }));
  }
};
