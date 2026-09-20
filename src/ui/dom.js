/**
 * ui/dom.js — the twenty lines of DOM helper this game needs instead of a
 * framework. `h` builds elements, `on` binds with automatic cleanup, and
 * everything else is a one-liner.
 */

/** h('div.card', {onclick}, [children]) — tag, optional #id and .classes. */
export function h(spec, props, children) {
  const m = /^([a-z0-9]+)?(#[\w-]+)?((?:\.[\w-]+)*)$/i.exec(spec) || [];
  const el = document.createElement(m[1] || 'div');
  if (m[2]) el.id = m[2].slice(1);
  if (m[3]) el.className = m[3].slice(1).split('.').join(' ');

  if (Array.isArray(props) || typeof props === 'string' || props instanceof Node) {
    children = props; props = null;
  }
  if (props) {
    for (const k of Object.keys(props)) {
      const v = props[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'style' && typeof v === 'object') setStyle(el, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'class') el.className = (el.className + ' ' + v).trim();
      else if (k in el && k !== 'list' && typeof v !== 'object') { try { el[k] = v; } catch (e) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

/**
 * Apply a style object.
 *
 * Custom properties have to go through setProperty: assigning them as
 * `el.style['--tone'] = x` is silently ignored, which is exactly the kind
 * of bug that leaves every seat the same colour and looks like a design
 * decision rather than a failure.
 */
function setStyle(el, styles) {
  for (const k of Object.keys(styles)) {
    const v = styles[k];
    if (v === null || v === undefined) continue;
    if (k.startsWith('--')) el.style.setProperty(k, String(v));
    else el.style[k] = v;
  }
}

export function append(el, children) {
  if (children === null || children === undefined || children === false) return el;
  if (Array.isArray(children)) { for (const c of children) append(el, c); return el; }
  el.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  return el;
}

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); return el; }

export function on(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

/** Run `fn` on the next frame, after layout. */
export function nextFrame(fn) {
  return requestAnimationFrame(() => requestAnimationFrame(fn));
}

/** Where an element is, in viewport coordinates. */
export function centreOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, rect: r };
}

/** Add a class, then take it off once its animation finishes. */
export function pulse(el, cls, ms = 700) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

/** Copy to the clipboard, with a fallback for browsers that refuse. */
export async function copy(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: '0', top: '-100px' } });
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/** Format a chip count: 1200 -> 1,200. */
export function num(n) {
  return Math.round(n).toLocaleString('en-US');
}

/** Format a probability as a percentage with no decimal noise. */
export function pct(p) {
  const v = p * 100;
  if (v > 0 && v < 1) return '<1%';
  if (v < 100 && v > 99) return '>99%';
  return Math.round(v) + '%';
}

/** Trap Tab inside an element while it is open. Returns a release function. */
export function trapFocus(el) {
  const sel = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const items = $$(sel, el).filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  el.addEventListener('keydown', handler);
  return () => el.removeEventListener('keydown', handler);
}
