/**
 * ui/screens/settings.js — graphics, audio, gameplay, accessibility.
 *
 * Every control writes through app.set(), which reapplies everything, so a
 * change is visible the instant it is made. No Apply button.
 */
import { h, clear, copy } from '../dom.js';
import { icon } from '../../render/art.js';
import { toast, errorToast } from '../toast.js';
import { SFX } from '../../audio/sfx.js';
import { COSMETICS } from '../../gameplay/shop.js';
import { exportProfile, importProfile, reset as resetProfile, defaultSettings } from '../../save/store.js';

export const title = 'Settings';
export const mood = 'menu';
export const rebuild = true;

export function build(app) {
  const inner = h('div.settings-inner');
  const root = h('div.settings.grow', [inner]);

  inner.appendChild(h('div.row', [
    h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back', onclick: () => app.router.back() }),
    h('h2', { text: 'Settings' })
  ]));

  const s = () => app.settings;

  section(inner, 'Audio', [
    slider(app, 'master', 'Master volume', 'Everything. Press M anywhere to mute.'),
    slider(app, 'music', 'Music', 'A generated soundtrack; there are no audio files in this game.'),
    slider(app, 'sfx', 'Sound effects', 'Chips, cards, gates and measurements.')
  ]);

  section(inner, 'Graphics', [
    choice(app, 'motion', 'Motion', 'How much the interface moves. Reduced keeps the information and drops the flourish.',
      [['full', 'Full'], ['reduced', 'Reduced'], ['none', 'None']]),
    choice(app, 'particles', 'Particles', 'Dust, sparks and beams. Turn down on a slow machine.',
      [['high', 'High'], ['low', 'Low'], ['off', 'Off']]),
    toggle(app, 'bloom', 'Glow', 'The bloom on cards, orbs and text.'),
    toggle(app, 'shake', 'Screen shake', 'The camera kick on a raise, a big card or a noise event.'),
    toggle(app, 'chroma', 'Chromatic aberration', 'A brief colour split on dramatic moments. Subtle, and some people dislike it.')
  ]);

  section(inner, 'Gameplay', [
    toggle(app, 'showProbabilities', 'Show probabilities', 'The percentage under each coin.'),
    toggle(app, 'showKets', 'Show kets', 'Also show each coin’s state in bra-ket notation. Press P at the table.'),
    toggle(app, 'fastAnimations', 'Fast animations', 'Shorter pauses between bot actions.'),
    toggle(app, 'developer', 'Developer overlay', 'FPS, circuit depth, the live state vector and the seed.')
  ]);

  section(inner, 'Accessibility', [
    choice(app, 'colorblind', 'Colour vision', 'Retunes the six coin colours and the four rarities so every pair differs in lightness as well as hue.',
      [['off', 'Off'], ['protan', 'Protanopia'], ['deutan', 'Deuteranopia'], ['tritan', 'Tritanopia'], ['mono', 'Monochrome']]),
    range(app, 'fontScale', 'Text size', 'Scales every piece of text in the game.', 0.85, 1.6, 0.05)
  ]);

  const cosmetics = h('div.col');
  section(inner, 'Cosmetics', [cosmetics]);
  renderCosmetics(app, cosmetics);

  section(inner, 'Your data', [
    h('p.small.dim', { text: 'Everything is stored in this browser and nowhere else. Nothing is uploaded, and there is no account.' }),
    h('div.row.wrap', [
      h('button.btn.btn-sm', {
        text: 'Export profile',
        onclick: async () => {
          const ok = await copy(exportProfile());
          toast({ icon: ok ? '✓' : '!', body: ok ? 'Profile copied to the clipboard.' : 'Could not copy.' });
        }
      }),
      h('button.btn.btn-sm', {
        text: 'Import profile',
        onclick: () => {
          const text = prompt('Paste a profile export:');
          if (!text) return;
          try { importProfile(text); app.applySettings(); toast({ icon: '✓', body: 'Profile imported. Reloading.' }); setTimeout(() => location.reload(), 700); }
          catch (e) { errorToast('That is not a valid profile.'); }
        }
      }),
      h('button.btn.btn-sm.btn-ghost', {
        text: 'Reset settings',
        onclick: () => {
          Object.entries(defaultSettings()).forEach(([k, v]) => app.set(k, v));
          app.router.invalidate('settings');
          app.router.go('settings');
          toast({ icon: '↺', body: 'Settings back to default.' });
        }
      }),
      h('button.btn.btn-sm.btn-danger', {
        text: 'Erase everything',
        onclick: () => {
          if (!confirm('This deletes your stats, achievements, cosmetics and saved run. It cannot be undone.')) return;
          resetProfile();
          toast({ icon: '✗', body: 'Profile erased. Reloading.' });
          setTimeout(() => location.reload(), 700);
        }
      })
    ])
  ]);

  inner.appendChild(h('p.tiny.dim', {
    html: 'Quantum Poker — Reimagined. Rules after Fuchs, Falch and Johnsen (SINTEF), <em>Eur. Phys. J. Plus</em> <strong>135</strong>, 353 (2020). GPL v3.'
  }));

  return root;
}

function section(host, title, rows) {
  const panel = h('div.panel.panel-pad', [h('div.panel-title', { text: title })]);
  for (const r of rows) panel.appendChild(r);
  host.appendChild(panel);
  return panel;
}

function row(label, desc, control) {
  return h('div.setting-row', [
    h('div', [h('div', { text: label }), desc ? h('div.desc', { text: desc }) : null]),
    h('div.control', control)
  ]);
}

function slider(app, key, label, desc) {
  const val = h('span.mono.small', { text: Math.round(app.settings[key] * 100) + '%' });
  const input = h('input.slider', {
    type: 'range', min: 0, max: 1, step: 0.05, value: app.settings[key],
    'aria-label': label,
    oninput: (e) => {
      const v = Number(e.target.value);
      val.textContent = Math.round(v * 100) + '%';
      e.target.style.setProperty('--pct', (v * 100) + '%');
      app.set(key, v);
    },
    onchange: () => SFX.click()
  });
  input.style.setProperty('--pct', (app.settings[key] * 100) + '%');
  return row(label, desc, [input, val]);
}

function range(app, key, label, desc, min, max, step) {
  const val = h('span.mono.small', { text: Number(app.settings[key]).toFixed(2) + '×' });
  const input = h('input.slider', {
    type: 'range', min, max, step, value: app.settings[key], 'aria-label': label,
    oninput: (e) => {
      const v = Number(e.target.value);
      val.textContent = v.toFixed(2) + '×';
      e.target.style.setProperty('--pct', ((v - min) / (max - min) * 100) + '%');
      app.set(key, v);
    }
  });
  input.style.setProperty('--pct', ((app.settings[key] - min) / (max - min) * 100) + '%');
  return row(label, desc, [input, val]);
}

function toggle(app, key, label, desc) {
  const sw = h('div.switch', {
    role: 'switch', tabindex: 0,
    'aria-checked': String(!!app.settings[key]),
    'aria-label': label
  });
  const flip = () => {
    const v = !app.settings[key];
    sw.setAttribute('aria-checked', String(v));
    app.set(key, v);
    SFX.toggle(v);
  };
  sw.addEventListener('click', flip);
  sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
  return row(label, desc, [sw]);
}

function choice(app, key, label, desc, options) {
  const seg = h('div.segmented', { role: 'group', 'aria-label': label });
  for (const [value, text] of options) {
    seg.appendChild(h('button', {
      text, 'aria-pressed': String(app.settings[key] === value),
      onclick: () => {
        app.set(key, value);
        SFX.click();
        for (const b of seg.children) b.setAttribute('aria-pressed', String(b.textContent === text));
      }
    }));
  }
  return row(label, desc, [seg]);
}

function renderCosmetics(app, host) {
  clear(host);
  const owned = app.profile.cosmetics || [];
  if (!owned.length) {
    host.appendChild(h('p.small.dim', { text: 'Nothing unlocked yet. Cosmetics appear in the shop between rounds.' }));
    return;
  }
  const kinds = {};
  for (const id of owned) {
    const c = COSMETICS[id];
    if (!c) continue;
    (kinds[c.kind] || (kinds[c.kind] = [])).push(c);
  }
  for (const kind of Object.keys(kinds)) {
    const seg = h('div.segmented');
    const pick = (id) => {
      app.profile.equipped[kind] = id;
      app.store.save(true);
      app.applySettings();
      for (const b of seg.children) b.setAttribute('aria-pressed', String(b.dataset.id === String(id)));
      SFX.click();
    };
    seg.appendChild(h('button', {
      text: 'Default', dataset: { id: 'null' },
      'aria-pressed': String(!app.profile.equipped[kind]),
      onclick: () => pick(null)
    }));
    for (const c of kinds[kind]) {
      seg.appendChild(h('button', {
        text: c.name, dataset: { id: c.id },
        'aria-pressed': String(app.profile.equipped[kind] === c.id),
        onclick: () => pick(c.id)
      }));
    }
    host.appendChild(row(kind[0].toUpperCase() + kind.slice(1), null, [seg]));
  }
}

export function key(e, app) {
  if (e.key === 'Escape') { app.router.back(); return true; }
  return false;
}
