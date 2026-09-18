/**
 * ui/toast.js — corner notifications.
 *
 * Also the achievement popper, which is the same thing with a fanfare.
 */
import { h } from './dom.js';
import { SFX } from '../audio/sfx.js';

let host = null;

function mount() {
  if (host) return host;
  host = h('div.toasts', { role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(host);
  return host;
}

export function toast(opts) {
  const o = typeof opts === 'string' ? { body: opts } : opts;
  const el = h('div.toast', {
    style: o.tone ? { '--tone': o.tone } : null
  }, [
    o.icon ? h('div.toast-icon', { text: o.icon }) : null,
    h('div.grow', [
      o.title ? h('div.toast-title', { text: o.title }) : null,
      o.body ? h('div.toast-body', { text: o.body }) : null
    ])
  ]);
  mount().appendChild(el);
  const life = o.duration || (o.body && o.body.length > 60 ? 5200 : 3400);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 320);
  }, life);
  return el;
}

export function achievementToast(ach) {
  SFX.unlock();
  const tint = ['var(--common)', 'var(--rare)', 'var(--epic)', 'var(--legendary)'][ach.tier - 1] || 'var(--accent)';
  return toast({
    icon: ach.icon,
    title: 'Achievement — ' + ach.name,
    body: ach.blurb,
    tone: tint,
    duration: 5200
  });
}

export function errorToast(text) {
  SFX.error();
  return toast({ icon: '!', title: 'Not allowed', body: text, tone: 'var(--bad)' });
}
