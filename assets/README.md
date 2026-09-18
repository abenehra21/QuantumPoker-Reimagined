# assets/

The game ships with no binary assets, and that is deliberate.

| Folder | What would live here | What happens today |
|---|---|---|
| `audio/` | music and sound files | Nothing. Every sound is synthesised at runtime in [`src/audio/synth.js`](../src/audio/synth.js) — oscillators, filtered noise and a convolution reverb built from a decaying noise buffer. The soundtrack in [`music.js`](../src/audio/music.js) is four layers scheduled on the WebAudio clock. |
| `images/` | sprites, card art, portraits | Nothing. Card faces and avatars are inline SVG in [`src/render/art.js`](../src/render/art.js), so they are sharp at any zoom and tint themselves from `currentColor`. |
| `fonts/` | webfonts | Nothing. Three Google Fonts are linked from `index.html`; the CSS falls back to system fonts if they do not load. |
| `particles/` | sprite sheets | Nothing. Particles are drawn as primitives in [`src/effects/particles.js`](../src/effects/particles.js). |
| `shaders/` | GLSL | Nothing. All effects are Canvas 2D; there is no WebGL. |
| `animations/` | timeline data | Nothing. Motion is CSS transitions plus the tween layer in [`src/engine/tween.js`](../src/engine/tween.js). |

## Replacing any of it with real artwork

Every one of these is a swap, not a rewrite:

- **Card art** — add a `<svg>` body to `GATE_ART` in `art.js`, or change `gateArt(id)`
  to return an `<img>`. The card component reads whatever it returns.
- **Avatars** — same, via `AVATARS`.
- **Music** — replace `Music.emit()` with playback of a buffer loaded from
  `assets/audio/`. The mood system (`MOODS`) stays as the mixing interface.
- **Sound effects** — every effect is a named method on `SFX`. Replace the
  body of one and nothing else has to know.
- **Table felt and chips** — CSS custom properties (`--felt-a`, `--felt-b`)
  and `chipArt()`. The cosmetics in the shop already switch between them.

Keeping this folder empty is why the whole game is a few hundred kilobytes
and loads instantly from a static host.
