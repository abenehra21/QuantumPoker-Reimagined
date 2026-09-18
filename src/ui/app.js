/**
 * ui/app.js — what every screen shares.
 *
 * The app object is the one piece of global state: the profile, the router,
 * the effects, the audio, the current run. Screens take it as an argument
 * rather than importing it, so a screen can be built and tested in isolation.
 */
import { Bus } from '../engine/events.js';
import { loop } from '../engine/loop.js';
import { setMotion } from '../engine/tween.js';
import { Particles } from '../effects/particles.js';
import { VFX } from '../effects/vfx.js';
import { Background } from '../render/background.js';
import { music } from '../audio/music.js';
import { SFX, init as audioInit, unlock as audioUnlock } from '../audio/sfx.js';
import { setVolumes } from '../audio/synth.js';
import * as store from '../save/store.js';
import { checkAchievementsNow } from '../save/store.js';
import { achievementToast } from './toast.js';

export class App {
  constructor(els) {
    this.els = els;
    this.bus = new Bus();
    this.profile = store.load();
    this.run = null;
    this.router = null;
    this.particles = new Particles(els.fx);
    this.vfx = new VFX(els.vfxRoot);
    this.background = new Background(els.bg, { seed: 2026 });
    this.store = store;
    this.startedAt = Date.now();
    this.applySettings();
    this.watchVisibility();
  }

  get settings() { return this.profile.settings; }

  /** Push every setting into the systems that care about it. */
  applySettings() {
    const s = this.settings;
    const root = document.documentElement;

    setMotion(s.motion);
    root.dataset.motion = s.motion;
    root.dataset.cb = s.colorblind === 'off' ? '' : s.colorblind;
    root.style.setProperty('--font-scale', String(s.fontScale || 1));
    root.dataset.table = this.profile.equipped.table || '';

    this.vfx.configure(s);
    this.particles.enabled = s.particles !== 'off';
    this.particles.budget = s.particles === 'low' ? 0.4 : 1;
    this.background.setIntensity(s.motion === 'none' ? 0.25 : s.particles === 'off' ? 0.4 : 1);

    setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    SFX.setMuted(s.master <= 0.001);
    music.setEnabled(s.music > 0.001 && s.master > 0.001);
    music.setPack(this.profile.equipped.music || 'default');

    this.bus.emit('settings', s);
  }

  set(key, value) {
    store.setSetting(key, value);
    this.applySettings();
  }

  /** The first gesture anywhere unlocks audio. Browsers insist. */
  armAudio() {
    if (this._audioArmed) return;
    this._audioArmed = true;
    const go = () => {
      audioInit();
      audioUnlock();
      if (this.settings.music > 0.001 && this.settings.master > 0.001) music.start();
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown', go);
    };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
  }

  /** Stop drawing when the tab is hidden. Saves a laptop's battery. */
  watchVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { loop.stop(); music.stop(); }
      else {
        loop.start();
        if (this.settings.music > 0.001 && this.settings.master > 0.001) music.start();
      }
    });
  }

  /** Run the achievement check and pop anything new. */
  checkAchievements() {
    const fresh = checkAchievementsNow();
    for (const a of fresh) achievementToast(a);
    if (fresh.length) this.bus.emit('achievements', fresh);
    return fresh;
  }

  /** Accent the whole interface to a colour, for bosses and modes. */
  accent(colour, colour2) {
    const root = document.documentElement;
    if (colour) root.style.setProperty('--accent', colour);
    else root.style.removeProperty('--accent');
    if (colour2) root.style.setProperty('--accent-2', colour2);
    else root.style.removeProperty('--accent-2');
  }

  /** Track total time played, in the profile. */
  tickPlaytime() {
    const secs = Math.round((Date.now() - this.startedAt) / 1000);
    this.startedAt = Date.now();
    if (secs > 0 && secs < 3600) store.bump('totals.playSeconds', secs);
  }
}
