/**
 * effects/vfx.js — screen-level effects.
 *
 * Shake, flash, chromatic split and time dilation. All of them are applied
 * to one wrapper element and all of them are individually switchable, because
 * screen shake and chromatic aberration are exactly the two effects that
 * make some people feel ill.
 */
import { loop } from '../engine/loop.js';
import { clamp01, EASE } from '../engine/tween.js';

export class VFX {
  constructor(root) {
    this.root = root;
    this.shakeAmount = 0;
    this.shakeDecay = 4;
    this.chromaAmount = 0;
    this.enabled = { shake: true, chroma: true, bloom: true, flash: true };
    this.flashLayer = null;
    this.stop = loop.add((dt) => this.tick(dt), 'vfx');
  }

  destroy() { if (this.stop) this.stop(); }

  configure(settings) {
    this.enabled.shake = settings.shake !== false && settings.motion !== 'none';
    this.enabled.chroma = settings.chroma !== false && settings.motion !== 'none';
    this.enabled.bloom = settings.bloom !== false;
    this.enabled.flash = settings.motion !== 'none';
    if (this.root) this.root.classList.toggle('no-bloom', !this.enabled.bloom);
  }

  /** Kick the camera. `amount` is in pixels at full strength. */
  shake(amount = 8, decay = 4) {
    if (!this.enabled.shake) return;
    this.shakeAmount = Math.min(28, this.shakeAmount + amount);
    this.shakeDecay = decay;
  }

  /** Split the colour channels briefly. Subtle by design. */
  chroma(amount = 2) {
    if (!this.enabled.chroma) return;
    this.chromaAmount = Math.min(6, this.chromaAmount + amount);
  }

  /** A full-screen colour wash. */
  flash(color = 'rgba(110,231,255,0.35)', ms = 260) {
    if (!this.enabled.flash || !this.root) return;
    if (!this.flashLayer) {
      this.flashLayer = document.createElement('div');
      this.flashLayer.className = 'vfx-flash';
      this.root.appendChild(this.flashLayer);
    }
    const el = this.flashLayer;
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = '1';
    // Force a reflow so the transition actually runs from 1.
    void el.offsetWidth;
    el.style.transition = `opacity ${ms}ms cubic-bezier(.2,.7,.3,1)`;
    el.style.opacity = '0';
  }

  /** A ring expanding from a point, in DOM so it can sit above the canvas. */
  ripple(x, y, color = 'var(--cyan)', size = 320) {
    if (!this.root || !this.enabled.flash) return;
    const el = document.createElement('div');
    el.className = 'vfx-ripple';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.setProperty('--ripple-color', color);
    el.style.setProperty('--ripple-size', size + 'px');
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  /** A word thrown across the middle of the screen. */
  shout(text, tone = 'cyan') {
    if (!this.root) return;
    const el = document.createElement('div');
    el.className = 'vfx-shout tone-' + tone;
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }

  tick(dt) {
    if (!this.root) return;
    let transform = '';
    if (this.shakeAmount > 0.05) {
      this.shakeAmount *= Math.exp(-this.shakeDecay * dt);
      const a = this.shakeAmount;
      transform = `translate3d(${(Math.random() - 0.5) * a}px, ${(Math.random() - 0.5) * a}px, 0)`;
    } else if (this.shakeAmount !== 0) {
      this.shakeAmount = 0;
      transform = '';
    }
    if (transform !== this._lastTransform) {
      this.root.style.transform = transform;
      this._lastTransform = transform;
    }

    if (this.chromaAmount > 0.02) {
      this.chromaAmount *= Math.exp(-6 * dt);
      this.root.style.setProperty('--chroma', this.chromaAmount.toFixed(2) + 'px');
      this.root.classList.add('chroma-on');
    } else if (this.chromaAmount !== 0) {
      this.chromaAmount = 0;
      this.root.classList.remove('chroma-on');
    }
  }
}
