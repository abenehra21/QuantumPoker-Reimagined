/**
 * ui/screens/spooky-intro.js — the front door of Quantum Trick or Treat.
 *
 * Three lines of pitch, one big Play button, and a tutorial that takes
 * thirty seconds if anybody wants it. The design constraint for this whole
 * mode was that ten people with ten minutes should be playing inside two,
 * so this screen has to be skippable in one click and has to not look like
 * homework.
 */
import { h, clear } from '../dom.js';
import { icon } from '../../render/art.js';
import { SFX } from '../../audio/sfx.js';
import { SPOOK } from '../../halloween/sounds.js';
import { LENGTHS } from '../../halloween/match.js';
import { POWERS, POWER_IDS } from '../../halloween/powers.js';
import { MONSTERS, MONSTER_KEYS } from '../../halloween/monsters.js';
import { load, update } from '../../save/store.js';

export const title = 'Quantum Trick or Treat';
export const mood = 'menu';
export const rebuild = true;

let view = null;

export function build(app, opts) {
  view = new Intro(app, opts || {});
  return view.root;
}

export function enter(app) {
  document.documentElement.dataset.theme = 'spooky';
  app.accent('var(--pumpkin)', 'var(--witch)');
  app.background.setAccent([255, 139, 44], [168, 85, 247]);
  decorate(app);
  SPOOK.creak();
}

export function leave(app) {
  document.documentElement.dataset.theme = '';
  app.accent();
  app.background.setAccent([110, 231, 255], [192, 132, 252]);
  undecorate();
}

export function key(e, app) {
  if (!view) return false;
  if (e.key === 'Escape') { app.router.back(); return true; }
  if (e.key === 'Enter' || e.key === ' ') { view.play(); return true; }
  return false;
}

/* ---- fog, bats and candlelight, shared by every spooky screen ---- */

let decor = [];

export function decorate(app) {
  if (decor.length) return;
  const reduced = app.settings.motion === 'none';
  const fog = h('div.fog', Array.from({ length: 4 }, (_, i) => h('i', {
    style: { '--dur': (34 + i * 9) + 's', '--delay': (-i * 11) + 's', left: (i * 26 - 20) + '%' }
  })));
  const candle = h('div.candlelight');
  decor.push(fog, candle);
  document.body.appendChild(fog);
  document.body.appendChild(candle);
  if (!reduced && app.settings.particles !== 'off') {
    for (let i = 0; i < 3; i++) {
      const bat = h('div.bat', {
        text: '\u{1F987}',
        style: { '--dur': (16 + i * 7) + 's', '--delay': (-i * 9) + 's', top: (12 + i * 18) + '%' }
      });
      decor.push(bat);
      document.body.appendChild(bat);
    }
  }
}

export function undecorate() {
  for (const d of decor) d.remove();
  decor = [];
}

class Intro {
  constructor(app, opts) {
    this.app = app;
    this.opts = opts;
    this.profile = load();
    const saved = this.profile.spooky || {};
    this.settings = {
      length: opts.length || saved.length || 'normal',
      opponents: opts.opponents === undefined ? (saved.opponents === undefined ? 3 : saved.opponents) : opts.opponents,
      humans: saved.humans || ['You'],
      chaos: saved.chaos === undefined ? 0.28 : saved.chaos,
      seed: opts.seed
    };
    this.root = h('div.spooky-intro.grow.col');
    this.render();
  }

  render() {
    clear(this.root);
    const r = this.root;

    r.appendChild(h('h1.spooky-title', [
      h('span.pumpkin-emoji', { text: '\u{1F383}' }),
      h('span', { text: ' QUANTUM TRICK OR TREAT ' }),
      h('span.pumpkin-emoji', { text: '\u{1F383}' })
    ]));

    r.appendChild(h('p.spooky-pitch', {
      html: '<b>Poker you already know.</b><br>Quantum chaos you don’t.<br>' +
        'Bet candy. Bluff your friends. Collapse reality.'
    }));

    r.appendChild(h('div.col', { style: { gap: 'var(--s3)', width: 'min(340px, 88vw)' } }, [
      h('button.btn.btn-primary.btn-lg.btn-block', {
        text: '\u{1F36C}  Play',
        onclick: () => this.play()
      }),
      h('div.row', { style: { gap: 'var(--s2)' } }, [
        h('button.btn.grow', { text: 'How to play', onclick: () => this.howTo() }),
        h('button.btn.grow', { text: 'Table settings', onclick: () => this.setup() })
      ]),
      h('button.btn.btn-ghost.btn-block', {
        text: 'Back to the quantum game', onclick: () => { SFX.back(); this.app.router.go('menu'); }
      })
    ]));

    const best = (this.profile.spooky && this.profile.spooky.best) || 0;
    const nights = (this.profile.spooky && this.profile.spooky.nights) || 0;
    r.appendChild(h('div.row.wrap.center', { style: { gap: 'var(--s4)', fontSize: 'var(--fs-xs)', color: 'var(--ink-faint)' } }, [
      h('span', { text: `${LENGTHS[this.settings.length].name} · ${this.settings.opponents} monsters` }),
      nights ? h('span', { text: `${nights} night${nights === 1 ? '' : 's'} played` }) : null,
      best ? h('span', { text: `best haul ${best} candy` }) : null
    ]));
  }

  play() {
    SFX.click();
    update((p) => { p.spooky = Object.assign({}, p.spooky, this.settings, { seed: undefined }); });
    this.app.router.go('spooky', Object.assign({}, this.settings, { force: true }));
  }

  /* ---- the thirty second tutorial ---- */

  howTo() {
    SFX.click();
    const steps = [
      ['Get two cards.', 'One face up so everyone can see it. One only you can see.'],
      ['Bet candy.', 'Same as any poker night. Check, call, raise, or fold.'],
      ['Make the best poker hand.', 'Your two cards plus the five in the middle. Pairs, straights, flushes — the usual.'],
      ['Use a spooky power if you fancy.', 'You never have to. They just make it weirder.'],
      ['Take everyone’s candy.', 'That is the whole game.']
    ];

    const body = h('div.col', { style: { gap: 'var(--s4)' } }, [
      h('div.quick-steps', steps.map(([what, why], i) =>
        h('div.quick-step', { style: { '--i': i } }, [
          h('div.num', { text: String(i + 1) }),
          h('div', [h('div.what', { text: what }), h('div.why', { text: why })])
        ])
      )),
      h('p.dim.small.center', { text: 'That is it. Really.' })
    ]);

    const overlay = this.overlay('How to play', body, [
      h('button.btn.btn-ghost', {
        text: 'What IS the quantum stuff?',
        onclick: () => { overlay.remove(); this.explainQuantum(); }
      }),
      h('button.btn.btn-primary', { text: 'Let’s play', onclick: () => { overlay.remove(); this.play(); } })
    ]);
  }

  explainQuantum() {
    SFX.click();
    const body = h('div.col', { style: { gap: 'var(--s3)' } }, [
      h('p', { text: 'Four powers. One sentence each. You can ignore all of them and still win.' }),
      ...POWER_IDS.map((id) => {
        const p = POWERS[id];
        const learnEl = h('p.small.dim.hidden', { text: p.learn, style: { marginTop: 'var(--s2)' } });
        return h('div.panel.panel-pad', { style: { borderColor: `color-mix(in srgb, ${p.tint} 40%, transparent)` } }, [
          h('div.row', [
            h('span', { text: p.icon, style: { fontSize: '22px' } }),
            h('strong', { text: p.name, style: { color: p.tint } }),
            h('div.grow'),
            h('span.tiny.dim', { text: `unlocks on hand ${p.unlockRound}` })
          ]),
          h('p', { text: p.blurb, style: { margin: 'var(--s2) 0 0' } }),
          h('p.small.dim', { text: p.detail, style: { margin: '2px 0 0' } }),
          h('button.btn.btn-sm.btn-ghost', {
            text: 'What is this really?',
            style: { marginTop: 'var(--s2)' },
            onclick: (e) => {
              learnEl.classList.toggle('hidden');
              e.target.textContent = learnEl.classList.contains('hidden') ? 'What is this really?' : 'Right, got it';
            }
          }),
          learnEl
        ]);
      }),
      h('div.panel.panel-pad', [
        h('strong', { text: '⚡ Quantum Collapse' }),
        h('p.small', { text: 'Every so often the dealer interferes and something on the table changes. ' +
          'It is announced, it happens to everybody, and it is usually funny.' })
      ]),
      h('p.small.dim', {
        text: 'Underneath all of this is a real quantum simulator — the same one the main game uses. ' +
          'A mystery card is a genuine qubit, and two linked cards are a genuine entangled pair. ' +
          'You do not need to know that. It is just true.'
      })
    ]);
    const overlay = this.overlay('The quantum bit', body, [
      h('button.btn.btn-primary', { text: 'Play', onclick: () => { overlay.remove(); this.play(); } })
    ]);
  }

  /* ---- table settings ---- */

  setup() {
    SFX.click();
    const s = this.settings;

    const lengthSeg = h('div.segmented', Object.values(LENGTHS).map((l) =>
      h('button', {
        text: l.name, 'aria-pressed': String(s.length === l.key),
        onclick: (e) => {
          s.length = l.key; SFX.click();
          for (const b of e.target.parentElement.children) b.setAttribute('aria-pressed', String(b === e.target));
          lengthNote.textContent = `${l.hands} hands · ${l.blurb}`;
        }
      })));
    const lengthNote = h('div.small.dim', { text: `${LENGTHS[s.length].hands} hands · ${LENGTHS[s.length].blurb}` });

    const oppSeg = h('div.segmented', [1, 2, 3, 4, 5].map((n) =>
      h('button', {
        text: String(n), 'aria-pressed': String(s.opponents === n),
        onclick: (e) => {
          s.opponents = n; SFX.click();
          for (const b of e.target.parentElement.children) b.setAttribute('aria-pressed', String(b === e.target));
          renderMonsters();
        }
      })));

    const chaosSeg = h('div.segmented', [
      ['Calm', 0.12], ['Spooky', 0.28], ['Cursed', 0.5]
    ].map(([label, v]) =>
      h('button', {
        text: label, 'aria-pressed': String(Math.abs(s.chaos - v) < 0.01),
        onclick: (e) => {
          s.chaos = v; SFX.click();
          for (const b of e.target.parentElement.children) b.setAttribute('aria-pressed', String(b === e.target));
        }
      })));

    const monsterRow = h('div.row.wrap', { style: { gap: 'var(--s2)' } });
    const renderMonsters = () => {
      clear(monsterRow);
      monsterRow.appendChild(h('span.small.dim', { text: 'Tonight you might meet:' }));
      for (const k of MONSTER_KEYS) {
        const m = MONSTERS[k];
        monsterRow.appendChild(h('span.pill', {
          style: { borderColor: `color-mix(in srgb, ${m.accent} 45%, transparent)` },
          title: m.tell
        }, [h('span', { text: faceOf(m) }), h('span.small', { text: m.name })]));
      }
    };
    renderMonsters();

    // Party mode: several people on one keyboard.
    const namesInput = h('input.input', {
      value: s.humans.join(', '),
      placeholder: 'You',
      'aria-label': 'Player names, separated by commas',
      style: { width: '100%' },
      oninput: (e) => {
        const names = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
        s.humans = names.length ? names.slice(0, 5) : ['You'];
        partyNote.textContent = s.humans.length > 1
          ? `Party mode: ${s.humans.length} people, passing the keyboard.`
          : 'Solo against the monsters.';
      }
    });
    const partyNote = h('div.small.dim', {
      text: s.humans.length > 1
        ? `Party mode: ${s.humans.length} people, passing the keyboard.`
        : 'Solo against the monsters.'
    });

    const body = h('div.col', { style: { gap: 'var(--s4)' } }, [
      field('How long?', lengthSeg, lengthNote),
      field('How many monsters?', oppSeg, monsterRow),
      field('How weird?', chaosSeg,
        h('div.small.dim', { text: 'How often the dealer interferes with reality.' })),
      field('Who is playing?', namesInput, partyNote),
      h('p.tiny.dim', {
        text: 'Candy is pretend. There is no money in this game and no way to put any in.'
      })
    ]);

    const overlay = this.overlay('Table settings', body, [
      h('button.btn.btn-primary', {
        text: 'Deal me in',
        onclick: () => { overlay.remove(); this.render(); this.play(); }
      })
    ]);
  }

  overlay(heading, body, actions) {
    const el = h('div.overlay.open', { role: 'dialog', 'aria-modal': 'true', 'aria-label': heading });
    const close = () => el.remove();
    el.appendChild(h('div.overlay-card.panel.panel-hi', [
      h('div.overlay-head', [
        h('h3', { text: heading }),
        h('div.grow'),
        h('button.btn.btn-icon.btn-ghost', { html: icon('close'), 'aria-label': 'Close', onclick: close })
      ]),
      h('div.overlay-body', [body]),
      h('div.overlay-foot', actions)
    ]));
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    document.body.appendChild(el);
    return el;
  }
}

function field(label, ...controls) {
  return h('div.col', { style: { gap: 'var(--s2)' } }, [
    h('div.caps.dim', { text: label }),
    ...controls
  ]);
}

/** The emoji face for a monster. Kept here so the data file stays plain. */
export function faceOf(monster) {
  return {
    vampire: '\u{1F9DB}', witch: '\u{1F9D9}', ghost: '\u{1F47B}',
    werewolf: '\u{1F43A}', cat: '\u{1F408}', pumpkin: '\u{1F383}'
  }[monster.key] || '\u{1F480}';
}
