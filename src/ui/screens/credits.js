/**
 * ui/screens/credits.js — who made what.
 *
 * The rules of Quantum Poker are somebody else's work, and the attribution
 * belongs somewhere a player will actually see it rather than only in a
 * README nobody opens.
 */
import { h } from '../dom.js';
import { icon } from '../../render/art.js';
import { CARD_IDS } from '../../gameplay/cards.js';
import { RELIC_IDS } from '../../gameplay/relics.js';
import { ACHIEVEMENTS } from '../../save/achievements.js';
import { CODEX } from '../../tutorial/codex.js';
import { LESSONS } from '../../tutorial/lessons.js';
import { BOSSES } from '../../gameplay/bosses.js';
import { PERSONA_KEYS } from '../../ai/personalities.js';

export const title = 'Credits';
export const mood = 'menu';

export function build(app) {
  const root = h('div.scroll.grow', { style: { padding: 'var(--s6) var(--s5)' } });
  const inner = h('div', { style: { width: 'min(720px, 100%)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--s5)' } });
  root.appendChild(inner);

  inner.appendChild(h('div.row', [
    h('button.btn.btn-icon.btn-ghost', { html: icon('back'), 'aria-label': 'Back', onclick: () => app.router.back() }),
    h('h2', { text: 'Credits' })
  ]));

  inner.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'The game this is built on' }),
    h('p', {
      html: 'Quantum Poker was designed by <strong>Franz G. Fuchs</strong>, <strong>Vemund Falch</strong> ' +
        'and <strong>Christian Johnsen</strong> at <a href="https://www.sintef.no/" target="_blank" rel="noopener">SINTEF</a>. ' +
        'The idea at the centre of it — community cards as qubits, hole cards as gates, and every ' +
        'player transforming their own private copy of the same board — is theirs.'
    }),
    h('p.small.dim', {
      html: 'Fuchs, Falch and Johnsen, <em>"Quantum Poker – a game for quantum computers suitable for ' +
        'benchmarking error mitigation techniques on NISQ devices"</em>, <em>The European Physical ' +
        'Journal Plus</em> <strong>135</strong>, 353 (2020).<br>' +
        '<a href="https://doi.org/10.1140/epjp/s13360-020-00360-5" target="_blank" rel="noopener">doi:10.1140/epjp/s13360-020-00360-5</a>'
    }),
    h('p.small.dim', {
      text: 'Their paper proposes the game as a benchmark for error mitigation on real hardware, ' +
        'which is why this version takes noise and mitigation seriously rather than treating them as flavour.'
    })
  ]));

  inner.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'This version' }),
    h('p', {
      text: 'A ground-up reimplementation on top of those rules. The simulator, the deck, the run ' +
        'structure, the opponents, the tutorial, the encyclopedia and every pixel of the interface ' +
        'are new work. It shares no code and no history with any earlier repository.'
    }),
    h('div.row.wrap', { style: { gap: 'var(--s3)' } }, [
      fact(CARD_IDS.length, 'cards'),
      fact(RELIC_IDS.length, 'relics'),
      fact(Object.keys(BOSSES).length, 'bosses'),
      fact(PERSONA_KEYS.length, 'opponents'),
      fact(ACHIEVEMENTS.length, 'achievements'),
      fact(LESSONS.length, 'lessons'),
      fact(CODEX.length, 'codex entries'),
      fact(0, 'dependencies')
    ])
  ]));

  inner.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'Everything you can hear and see' }),
    h('p.small', {
      html: 'There are no audio files and no image files in this project. Every sound is synthesised ' +
        'in the browser with WebAudio — oscillators, filtered noise and a convolution reverb built from ' +
        'a decaying noise buffer. The soundtrack is four layers scheduled on the audio clock, so ' +
        '"menu" and "boss" are the same piece of music at different intensities rather than two ' +
        'tracks being crossfaded. Card faces, avatars and every icon are inline SVG.'
    }),
    h('p.small.dim', {
      html: 'Type is <strong>Chakra Petch</strong>, <strong>Inter</strong> and <strong>JetBrains Mono</strong>, ' +
        'the only things loaded from anywhere else. Without them the game falls back to your system fonts and still works.'
    })
  ]));

  inner.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'Is the physics real?' }),
    h('p.small', {
      html: 'Yes, and you do not have to take that on trust. <code>tools/verify_with_qiskit.py</code> ' +
        'replays five hundred randomly generated circuits, plus every card in the deck, through ' +
        'Qiskit’s own simulator and compares the amplitudes. They agree to a fidelity of ' +
        '1 − 10⁻⁹. The check is in the repository; run it yourself.'
    })
  ]));

  inner.appendChild(h('div.panel.panel-pad', [
    h('div.panel-title', { text: 'Licence' }),
    h('p.small', {
      html: 'Released under the <strong>GNU General Public License v3</strong>, the same licence as the ' +
        'original. You may use, study, change and share it, including commercially, provided anything ' +
        'you distribute stays under the same terms.'
    })
  ]));

  inner.appendChild(h('p.tiny.dim', { style: { textAlign: 'center' },
    text: 'Made for anyone who ever wanted to understand superposition and found the textbook first.' }));

  return root;
}

function fact(n, label) {
  return h('div.stat', { style: { minWidth: '108px', flex: '1 1 108px' } }, [
    h('div.value', { text: String(n) }),
    h('div.label', { text: label })
  ]);
}

export function key(e, app) {
  if (e.key === 'Escape') { app.router.back(); return true; }
  return false;
}
