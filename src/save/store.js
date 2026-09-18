/**
 * save/store.js — the profile.
 *
 * One JSON blob in localStorage, versioned, written through a debounce so a
 * busy hand does not hit the disk forty times. Everything degrades: a browser
 * with storage disabled gets a perfectly playable in-memory profile and one
 * quiet note in the console, never a crash.
 */
import { ACHIEVEMENTS, check as checkAchievements } from './achievements.js';
import { today } from '../utils/rng.js';

const KEY = 'qpr.profile.v1';
const VERSION = 1;

export function blankProfile() {
  return {
    version: VERSION,
    created: Date.now(),
    name: 'You',
    totals: {
      hands: 0, handsWon: 0, folds: 0, raises: 0, calls: 0, checks: 0,
      gates: 0, collapses: 0, links: 0, coherences: 0, chipsWon: 0, chipsLost: 0,
      runs: 0, rounds: 0, sandboxSeconds: 0, playSeconds: 0
    },
    best: { round: 0, chips: 0, score: 0, pot: 0, streak: 0, relics: 0, entropy: 0 },
    gateCounts: {},
    beaten: {},
    bosses: [],
    flags: {},
    cosmetics: [],
    equipped: { table: null, orb: null, chips: null, cardback: null, music: null, bloch: null },
    achievements: [],
    codexRead: [],
    tutorialDone: false,
    daily: { lastDay: 0, streak: 0, bestStreak: 0, played: 0, results: {} },
    settings: defaultSettings(),
    run: null,
    history: []
  };
}

export function defaultSettings() {
  return {
    master: 0.8, music: 0.5, sfx: 0.8,
    motion: 'full',            // full | reduced | none
    particles: 'high',         // high | low | off
    bloom: true, shake: true, chroma: true,
    colorblind: 'off',         // off | protan | deutan | tritan | mono
    fontScale: 1,
    showProbabilities: true,
    showKets: false,
    autoHint: false,
    fastAnimations: false,
    developer: false,
    fullscreen: false
  };
}

let memory = null;
let timer = null;
let warned = false;

function raw() {
  try { return localStorage.getItem(KEY); } catch (e) { return null; }
}

export function load() {
  if (memory) return memory;
  const text = raw();
  if (!text) { memory = blankProfile(); return memory; }
  try {
    const data = JSON.parse(text);
    memory = migrate(data);
  } catch (e) {
    console.warn('Quantum Poker: save file unreadable, starting fresh.', e);
    memory = blankProfile();
  }
  return memory;
}

/** Fill in anything a newer version added, without touching what is there. */
function migrate(data) {
  const fresh = blankProfile();
  const out = Object.assign({}, fresh, data);
  out.totals = Object.assign({}, fresh.totals, data.totals || {});
  out.best = Object.assign({}, fresh.best, data.best || {});
  out.daily = Object.assign({}, fresh.daily, data.daily || {});
  out.settings = Object.assign({}, fresh.settings, data.settings || {});
  out.equipped = Object.assign({}, fresh.equipped, data.equipped || {});
  out.version = VERSION;
  return out;
}

export function save(immediate = false) {
  if (!memory) return;
  if (timer) { clearTimeout(timer); timer = null; }
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(memory)); }
    catch (e) {
      if (!warned) { console.warn('Quantum Poker: cannot write save (private browsing?). Progress is this session only.'); warned = true; }
    }
  };
  if (immediate) write(); else timer = setTimeout(write, 400);
}

export function update(fn) {
  const p = load();
  fn(p);
  save();
  return p;
}

/** Bump a counter in totals. */
export function bump(path, by = 1) {
  return update((p) => {
    const parts = path.split('.');
    let o = p;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    o[parts[parts.length - 1]] = (o[parts[parts.length - 1]] || 0) + by;
  });
}

export function raise(path, value) {
  return update((p) => {
    const parts = path.split('.');
    let o = p;
    for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] || {}; o = o[parts[i]]; }
    const k = parts[parts.length - 1];
    if ((o[k] || 0) < value) o[k] = value;
  });
}

export function flag(name, by = 1) { return bump('flags.' + name, by); }

/** Run the achievement check and return the fresh unlocks. */
export function checkAchievementsNow() {
  const p = load();
  const fresh = checkAchievements(p);
  if (fresh.length) save(true);
  return fresh;
}

/* ---- daily ---- */

export function dailyState() {
  const p = load();
  const day = today();
  return {
    day,
    playedToday: p.daily.lastDay === day,
    streak: p.daily.streak,
    bestStreak: p.daily.bestStreak,
    result: p.daily.results[day] || null
  };
}

export function recordDaily(result) {
  return update((p) => {
    const day = today();
    if (p.daily.lastDay === day) return;
    p.daily.streak = p.daily.lastDay === day - 1 ? p.daily.streak + 1 : 1;
    p.daily.bestStreak = Math.max(p.daily.bestStreak, p.daily.streak);
    p.daily.lastDay = day;
    p.daily.played++;
    p.daily.results[day] = result;
    // Keep a fortnight; the emoji grid only ever shows the last seven.
    const keep = Object.keys(p.daily.results).map(Number).sort((a, b) => b - a).slice(0, 14);
    const trimmed = {};
    keep.forEach((d) => { trimmed[d] = p.daily.results[d]; });
    p.daily.results = trimmed;
  });
}

/* ---- settings ---- */

export function settings() { return load().settings; }

export function setSetting(key, value) {
  return update((p) => { p.settings[key] = value; });
}

/* ---- run persistence ---- */

export function saveRun(snapshot) { return update((p) => { p.run = snapshot; }); }
export function clearRun() { return update((p) => { p.run = null; }); }
export function savedRun() { return load().run; }

/* ---- export / import / reset ---- */

export function exportProfile() { return JSON.stringify(load(), null, 2); }

export function importProfile(text) {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object') throw new Error('not a profile');
  memory = migrate(data);
  save(true);
  return memory;
}

export function reset() {
  memory = blankProfile();
  save(true);
  return memory;
}

/** For tests: swap in a fake storage-free profile. */
export function useMemoryProfile(p) { memory = p || blankProfile(); return memory; }
