# Changelog

All notable changes to Quantum Poker — Reimagined.

Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [2.1.0] — 2026-09-20

### Added — 🎃 Quantum Trick or Treat

A second game mode, built for a college game night: real Texas Hold'em played
for candy, with a light quantum twist. Reachable from the main menu or with
`H`. Everything lives in `src/halloween/` and the original mode is untouched.

- **Real 52-card Texas Hold'em.** The main game has no playing cards at all —
  its board is five qubits and its hand is a set of gates — so this mode
  needed a deck, a five-from-seven hand evaluator and the ordinary streets.
- **One hole card face up.** The single rule that differs from familiar poker,
  and the one that makes the table social: everyone can see half of what you
  have, so bluffing is something the room watches happen.
- **Candy as currency.** Four denominations that visibly stack, fly across the
  table when bet, and explode when won. Entirely fictional; no money anywhere.
- **Four powers, four sentences.** Measure, Swap, Haunt and Spectral Bluff.
  Three charges a hand, unlocked one at a time over the first five hands. A
  player who ignores all of them is playing ordinary poker and can win.
- **Quantum Collapse.** Five dealer events — measure everything, haunt a
  community card, entangle two mysteries, shuffle the board, candy rain. At
  most once a hand, never in the first two, always announced.
- **Six monsters** with readable tells, driven by Monte Carlo equity and four
  personality dials. Jack folds about 75% to a big bet where the Werewolf
  folds 20%.
- **Trick or Treat refills** so nobody is eliminated from a party game.
- **Party mode**: several people on one keyboard, with a cover screen between
  turns that is skipped when the previous player has nothing left to hide.
- **Scoreboard** where everybody gets a title, plus a shareable seed link.
- **A thirty-second tutorial**, and an optional "what is this really?" layer on
  every power for anyone who becomes curious.
- 139 new self-checks, including an exhaustive sweep of the hand evaluator's
  edge cases and 1,600 Bell-pair correlation trials.

### Fixed

- **`h()` silently dropped CSS custom properties.** The shared DOM helper
  applied style objects with `Object.assign`, which ignores `--custom`
  properties. 18 call sites across 11 variables had been quietly doing nothing
  since the day they were written: every seat in the main game fell back to
  the same cyan instead of its personality colour, rarity tints never reached
  toasts, progress bars never filled, and the menu's orbiting glyphs all sat at
  one radius. It read as a design choice, which is why it survived. Both modes
  look different — better — now.
- The straight detector put the low ace on the bit belonging to a two, so
  A-3-4-5-6 evaluated as a six-high straight. Caught before shipping.
- Party mode kept displaying the previous player's hand when the turn passed
  between two humans, exposing a face-down card and deadlocking the game.
- The seats row shrank below its own content and, being a horizontal scroller,
  clipped vertically too — opponents' cards vanished on narrow screens.
- A power's tooltip stayed open over the reveal it triggered.

### Changed

- The unused-import and CSS-variable checks in `npm run check` now cover the
  new module; the headless-layering rule was extended to `src/halloween/`,
  with its `ui/` folder and sound set as documented exceptions.

---

## [2.0.0] — 2026-09-18

First release. A ground-up reimplementation of Quantum Poker as a
zero-dependency browser game.

### Added

- **Exact state-vector simulator** — X, Y, Z, H, S, T, Rx, Ry, Rz, phase, CX,
  CZ, controlled-phase, SWAP, Toffoli, multi-controlled Z, projective
  measurement, Bloch vectors from the reduced density matrix.
- **40 gate cards** across four rarities; the card art is the circuit symbol.
- **Expectimax planner** serving both the Hint button and every opponent, with
  search width as the difficulty dial.
- **Six decoherence channels** and working zero-noise extrapolation.
- Runs, relics, a shop, six bosses, 44 achievements, a ten-lesson tutorial, a
  fourteen-entry encyclopedia, a sandbox, and a live circuit view that exports
  OpenQASM 3.
- **Verified against Qiskit**: 500 random circuits and every deck card match to
  a fidelity of 1 − 10⁻⁹.
- Four colour-vision modes, two levels of reduced motion, text scaling.
- 178 self-checks plus static checks for module loading, layering, CSS
  variables and asset references.

### Credits

Rules after Fuchs, Falch and Johnsen (SINTEF), *Eur. Phys. J. Plus* **135**,
353 (2020). GPL v3.
