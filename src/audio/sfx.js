/**
 * audio/sfx.js — the sound of the table.
 *
 * Short, dry and low in the mix. A card game wants the click of a chip and
 * the ring of a coin, not a soundtrack fighting the music.
 *
 * Each sound is named for the thing that makes it, not for how it is built,
 * so `SFX.collapse()` stays correct when the synthesis is rewritten.
 */
import { init, unlock, tone, noise, metal, buses, now, running } from './synth.js';

let muted = false;
let lastAt = 0;

export function setMuted(v) { muted = !!v; }
export function isMuted() { return muted; }

/** Guard: never fire the same-frame stack of forty identical sounds. */
function gate(minGap = 0.012) {
  if (muted) return false;
  if (!running()) { unlock(); if (!running()) return false; }
  const t = now();
  if (t - lastAt < minGap) return false;
  lastAt = t;
  return true;
}

const SC = [0, 2, 3, 5, 7, 8, 10];        // natural minor, for anything melodic
function note(root, degree) {
  return root * Math.pow(2, SC[((degree % 7) + 7) % 7] / 12 + Math.floor(degree / 7));
}

export const SFX = {
  setMuted, isMuted,

  /* --- interface --- */
  hover() {
    if (!gate(0.03)) return;
    tone({ freq: 2400, dur: 0.05, peak: 0.035, type: 'sine' });
  },
  click() {
    if (!gate()) return;
    noise({ freq: 2600, q: 2, dur: 0.045, peak: 0.12 });
    tone({ freq: 880, to: 440, dur: 0.06, peak: 0.07, type: 'triangle' });
  },
  back() {
    if (!gate()) return;
    tone({ freq: 440, to: 220, dur: 0.12, peak: 0.1, type: 'triangle' });
  },
  error() {
    if (!gate()) return;
    tone({ freq: 180, to: 120, dur: 0.22, peak: 0.16, type: 'sawtooth', filter: { freq: 900, to: 300 } });
  },
  toggle(on) {
    if (!gate()) return;
    tone({ freq: on ? 700 : 500, to: on ? 1050 : 340, dur: 0.09, peak: 0.09, type: 'square', filter: { freq: 2200, q: 2 } });
  },

  /* --- cards and chips --- */
  deal(i = 0) {
    if (!gate(0)) return;
    const t = now() + i * 0.07;
    noise({ at: t, freq: 3200, to: 900, q: 0.8, dur: 0.11, peak: 0.17 });
    tone({ at: t, freq: 320, to: 180, dur: 0.07, peak: 0.05, type: 'sine' });
  },
  cardHover() {
    if (!gate(0.04)) return;
    noise({ freq: 5200, q: 3, dur: 0.035, peak: 0.05 });
  },
  cardPick() {
    if (!gate()) return;
    noise({ freq: 4000, to: 1600, q: 1.5, dur: 0.08, peak: 0.14 });
    tone({ freq: 660, dur: 0.07, peak: 0.06, type: 'sine' });
  },
  chip(n = 1) {
    if (!gate(0)) return;
    for (let i = 0; i < Math.min(5, n); i++) {
      metal({ at: now() + i * 0.035 + Math.random() * 0.01, freq: 1500 + Math.random() * 500, dur: 0.16, peak: 0.07 });
    }
  },
  chipSlide() {
    if (!gate()) return;
    noise({ freq: 900, to: 2800, q: 0.7, dur: 0.3, peak: 0.1 });
  },
  potWin() {
    if (!gate()) return;
    for (let i = 0; i < 9; i++) {
      metal({ at: now() + i * 0.045, freq: 1300 + Math.random() * 900, dur: 0.3, peak: 0.075 });
    }
  },

  /* --- gates --- */
  gate(kind) {
    if (!gate(0)) return;
    const t = now();
    switch (kind) {
      case 'X': case 'Y':
        tone({ at: t, freq: 220, to: 660, dur: 0.16, peak: 0.2, type: 'square', filter: { freq: 3000, to: 700, q: 3 } });
        noise({ at: t, freq: 1800, to: 400, q: 1, dur: 0.12, peak: 0.13 });
        break;
      case 'H': case 'SX':
        tone({ at: t, freq: 520, to: 1040, dur: 0.34, peak: 0.13, type: 'sine' });
        tone({ at: t + 0.02, freq: 1040, to: 520, dur: 0.34, peak: 0.09, type: 'sine' });
        break;
      case 'Z': case 'S': case 'SDG': case 'T': case 'RZ':
        tone({ at: t, freq: 900, dur: 0.3, peak: 0.1, type: 'triangle', detune: 12 });
        tone({ at: t + 0.01, freq: 906, dur: 0.3, peak: 0.1, type: 'triangle', detune: -12 });
        break;
      case 'CX': case 'CZ': case 'CPHASE': case 'BELL': case 'CHAIN': case 'ISWAP':
        tone({ at: t, freq: 140, to: 900, dur: 0.22, peak: 0.16, type: 'sawtooth', filter: { freq: 600, to: 4200, q: 6 } });
        noise({ at: t + 0.04, freq: 4200, q: 5, dur: 0.2, peak: 0.1 });
        break;
      case 'CCX': case 'SUPERDENSE': case 'ENTBOMB':
        tone({ at: t, freq: 90, to: 500, dur: 0.4, peak: 0.22, type: 'sawtooth', filter: { freq: 400, to: 3000, q: 8 } });
        metal({ at: t + 0.12, freq: 420, dur: 0.6, peak: 0.1 });
        break;
      case 'RX': case 'RY':
        tone({ at: t, freq: 400, to: 620, dur: 0.26, peak: 0.12, type: 'sine' });
        break;
      default:
        tone({ at: t, freq: 660, to: 990, dur: 0.18, peak: 0.12, type: 'triangle' });
    }
  },

  /** A measurement: a rush inward, then one clean tone. */
  collapse(bit) {
    if (!gate(0)) return;
    const t = now();
    noise({ at: t, freq: 300, to: 6000, q: 1.2, dur: 0.3, peak: 0.16 });
    metal({ at: t + 0.28, freq: bit ? 1320 : 440, dur: 0.7, peak: 0.16, partials: [1, 2.4, 4.1] });
  },

  entangle() {
    if (!gate()) return;
    const t = now();
    tone({ at: t, freq: 330, dur: 0.6, peak: 0.1, type: 'sine', detune: 8 });
    tone({ at: t, freq: 330, dur: 0.6, peak: 0.1, type: 'sine', detune: -8 });
    tone({ at: t + 0.06, freq: 495, dur: 0.5, peak: 0.07, type: 'sine' });
  },

  breakLink() {
    if (!gate()) return;
    noise({ freq: 5000, to: 700, q: 2, dur: 0.24, peak: 0.16 });
    tone({ freq: 400, to: 90, dur: 0.22, peak: 0.12, type: 'sawtooth' });
  },

  noiseHit() {
    if (!gate()) return;
    noise({ freq: 220, q: 0.6, dur: 0.18, peak: 0.2, type: 'lowpass' });
    tone({ freq: 70, to: 40, dur: 0.24, peak: 0.16, type: 'square' });
  },

  freeze() {
    if (!gate()) return;
    const t = now();
    for (let i = 0; i < 4; i++) tone({ at: t + i * 0.03, freq: 2200 + i * 700, dur: 0.5, peak: 0.05, type: 'sine' });
    noise({ at: t, freq: 7000, q: 4, dur: 0.4, peak: 0.06 });
  },

  legendary() {
    if (!gate()) return;
    const t = now(), root = 220;
    [0, 2, 4, 7].forEach((d, i) => tone({ at: t + i * 0.05, freq: note(root, d) * 2, dur: 0.9, peak: 0.1, type: 'triangle' }));
    metal({ at: t, freq: 1760, dur: 1.2, peak: 0.08 });
  },

  /* --- table --- */
  street(round) {
    if (!gate()) return;
    const t = now();
    metal({ at: t, freq: 330 * (1 + round * 0.12), dur: 0.9, peak: 0.09 });
    noise({ at: t, freq: 600, to: 2400, q: 0.7, dur: 0.4, peak: 0.07 });
  },
  fold() {
    if (!gate()) return;
    noise({ freq: 1400, to: 300, q: 0.8, dur: 0.24, peak: 0.12 });
  },
  allin() {
    if (!gate()) return;
    const t = now();
    tone({ at: t, freq: 110, to: 55, dur: 0.8, peak: 0.24, type: 'sawtooth', filter: { freq: 1600, to: 200, q: 4 } });
    for (let i = 0; i < 7; i++) metal({ at: t + i * 0.04, freq: 1400 + Math.random() * 700, dur: 0.25, peak: 0.08 });
  },
  win(big) {
    if (!gate()) return;
    const t = now(), root = 261.63;
    const chord = big ? [0, 2, 4, 6, 7] : [0, 2, 4];
    chord.forEach((d, i) => tone({ at: t + i * 0.055, freq: note(root, d), dur: 1.4, peak: 0.11, type: 'triangle' }));
    if (big) chord.forEach((d, i) => tone({ at: t + 0.3 + i * 0.055, freq: note(root, d) * 2, dur: 1.2, peak: 0.07, type: 'sine' }));
  },
  lose() {
    if (!gate()) return;
    const t = now();
    [0, -1, -3].forEach((d, i) => tone({ at: t + i * 0.12, freq: 220 * Math.pow(2, d / 12), dur: 0.8, peak: 0.1, type: 'sine' }));
  },
  coherence() {
    if (!gate()) return;
    const t = now(), root = 261.63;
    for (let i = 0; i < 8; i++) {
      tone({ at: t + i * 0.06, freq: note(root, i) * 2, dur: 1.1 - i * 0.05, peak: 0.1, type: 'triangle' });
    }
    metal({ at: t + 0.1, freq: 2093, dur: 2, peak: 0.1 });
  },
  boss() {
    if (!gate()) return;
    const t = now();
    tone({ at: t, freq: 55, dur: 2.2, peak: 0.24, type: 'sawtooth', filter: { freq: 300, to: 90, q: 3 } });
    tone({ at: t + 0.1, freq: 82.4, dur: 2, peak: 0.16, type: 'square', filter: { freq: 420, q: 5 } });
    noise({ at: t, freq: 120, q: 0.5, dur: 1.6, peak: 0.12, type: 'lowpass' });
  },
  unlock() {
    if (!gate()) return;
    const t = now();
    [0, 4, 7, 11].forEach((s, i) => tone({ at: t + i * 0.07, freq: 523.25 * Math.pow(2, s / 12), dur: 0.7, peak: 0.09, type: 'sine' }));
  },
  shop() {
    if (!gate()) return;
    metal({ freq: 1046, dur: 0.5, peak: 0.1, partials: [1, 2.2, 3.6] });
  },
  buy() {
    if (!gate()) return;
    const t = now();
    for (let i = 0; i < 4; i++) metal({ at: t + i * 0.04, freq: 1600 + i * 240, dur: 0.3, peak: 0.08 });
  }
};

export { init, unlock };
