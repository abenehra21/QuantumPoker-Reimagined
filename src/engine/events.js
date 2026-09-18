/**
 * engine/events.js — a small event bus.
 *
 * The game emits; screens, audio and effects listen. Nothing in gameplay/
 * ever holds a reference to anything in ui/, which is what keeps the whole
 * engine runnable in Node for the self-checks.
 */
export class Bus {
  constructor() { this.map = new Map(); }

  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type).add(fn);
    return () => this.off(type, fn);
  }

  once(type, fn) {
    const off = this.on(type, (d) => { off(); fn(d); });
    return off;
  }

  off(type, fn) {
    const s = this.map.get(type);
    if (s) s.delete(fn);
  }

  emit(type, data) {
    const s = this.map.get(type);
    if (s) for (const fn of Array.from(s)) {
      try { fn(data, type); } catch (e) { console.error(`bus handler for "${type}" threw`, e); }
    }
    const all = this.map.get('*');
    if (all) for (const fn of Array.from(all)) {
      try { fn(data, type); } catch (e) { console.error('bus wildcard handler threw', e); }
    }
  }

  clear(type) { if (type) this.map.delete(type); else this.map.clear(); }
}

export const bus = new Bus();
