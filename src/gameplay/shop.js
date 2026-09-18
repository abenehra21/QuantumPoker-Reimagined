/**
 * gameplay/shop.js — what you buy between rounds.
 *
 * The shop is deterministic from the run seed and the round number, so a
 * shared seed gives two players the same offers. Rerolls are part of the
 * stream, so a reroll is a real decision rather than a slot machine.
 */
import { CARDS, CARD_IDS, RARITY } from './cards.js';
import { RELICS, RELIC_IDS } from './relics.js';
import { mulberry32, mix, sampleWeighted } from '../utils/rng.js';

/** Cosmetics are pure vanity and always affordable eventually. */
export const COSMETICS = {
  table_felt: { id: 'table_felt', kind: 'table', name: 'Deep Field', price: 120, blurb: 'A table the colour of an empty sky.' },
  table_grid: { id: 'table_grid', kind: 'table', name: 'Wafer', price: 150, blurb: 'The table becomes a chip die, traces and all.' },
  table_void: { id: 'table_void', kind: 'table', name: 'Event Horizon', price: 220, blurb: 'Light goes in. The pot does not come out.' },
  orb_glass: { id: 'orb_glass', kind: 'orb', name: 'Blown Glass', price: 110, blurb: 'Coins as hand-blown glass spheres.' },
  orb_wire: { id: 'orb_wire', kind: 'orb', name: 'Wireframe', price: 110, blurb: 'Coins as bare Bloch spheres. For purists.' },
  orb_plasma: { id: 'orb_plasma', kind: 'orb', name: 'Plasma', price: 180, blurb: 'Coins that look genuinely dangerous.' },
  chips_neon: { id: 'chips_neon', kind: 'chips', name: 'Neon Stack', price: 90, blurb: 'Chips that glow from the inside.' },
  chips_bone: { id: 'chips_bone', kind: 'chips', name: 'Bone China', price: 90, blurb: 'Quiet, expensive-looking chips.' },
  back_circuit: { id: 'back_circuit', kind: 'cardback', name: 'Circuit Back', price: 100, blurb: 'Card backs printed with a real circuit.' },
  back_aurora: { id: 'back_aurora', kind: 'cardback', name: 'Aurora', price: 140, blurb: 'Card backs that shift as you move.' },
  music_lab: { id: 'music_lab', kind: 'music', name: 'Lab Ambient', price: 130, blurb: 'The hum of a dilution fridge, tuned to a key.' },
  music_pulse: { id: 'music_pulse', kind: 'music', name: 'Pulse Sequence', price: 130, blurb: 'A soundtrack built from gate pulses.' },
  bloch_retro: { id: 'bloch_retro', kind: 'bloch', name: 'Oscilloscope', price: 100, blurb: 'The Bloch sphere in phosphor green.' },
  bloch_ink: { id: 'bloch_ink', kind: 'bloch', name: 'Ink and Paper', price: 100, blurb: 'The Bloch sphere as a textbook figure.' }
};

export const COSMETIC_IDS = Object.keys(COSMETICS);

/** One shop stock list. */
export function stock(runSeed, round, rerolls, owned = {}) {
  const rng = mulberry32(mix(mix(runSeed, round * 977), rerolls));
  const items = [];

  // Three cards, weighted by rarity, biased richer as the run goes on.
  const tilt = Math.min(3, 1 + round * 0.18);
  const cardPool = CARD_IDS.filter((id) => id !== 'I');
  const cards = sampleWeighted(cardPool, (id) => {
    const r = RARITY[CARDS[id].rarity];
    return r.weight * (r.key === 'common' ? 1 : Math.pow(tilt, ['common', 'rare', 'epic', 'legendary'].indexOf(r.key)));
  }, 3, rng);
  for (const id of cards) {
    items.push({
      kind: 'card', id, name: CARDS[id].name, rarity: CARDS[id].rarity,
      price: Math.round(RARITY[CARDS[id].rarity].price * (0.85 + rng() * 0.3)),
      blurb: CARDS[id].blurb
    });
  }

  // Two relics you do not already own.
  const relicPool = RELIC_IDS.filter((id) => !(owned.relics || []).includes(id));
  const relics = sampleWeighted(relicPool, (id) => RARITY[RELICS[id].rarity].weight, 2, rng);
  for (const id of relics) {
    items.push({
      kind: 'relic', id, name: RELICS[id].name, rarity: RELICS[id].rarity,
      price: RELICS[id].price, blurb: RELICS[id].blurb, flavour: RELICS[id].flavour
    });
  }

  // One cosmetic you do not own.
  const cosPool = COSMETIC_IDS.filter((id) => !(owned.cosmetics || []).includes(id));
  if (cosPool.length) {
    const id = cosPool[Math.floor(rng() * cosPool.length) % cosPool.length];
    items.push({
      kind: 'cosmetic', id, name: COSMETICS[id].name, rarity: 'rare',
      price: COSMETICS[id].price, blurb: COSMETICS[id].blurb, cosmeticKind: COSMETICS[id].kind
    });
  }

  // One service: remove a card from your deck, or a free upgrade.
  items.push(rng() < 0.5
    ? { kind: 'service', id: 'burn', name: 'Incinerate', rarity: 'common', price: 45,
        blurb: 'Remove one card from your deck permanently. A smaller deck draws its best cards more often.' }
    : { kind: 'service', id: 'duplicate', name: 'Duplicate', rarity: 'rare', price: 130,
        blurb: 'Copy any card already in your deck.' });

  return items;
}

/** Price after every discount hook the player owns. */
export function priceFor(item, relics) {
  return Math.max(5, relics ? relics.chain('shopDiscount', item.price, item) : item.price);
}

export function freeRerolls(relics) {
  return 1 + (relics ? relics.sum('rerollsPerShop') : 0);
}

export function rerollCost(used, relics) {
  const free = freeRerolls(relics);
  return used < free ? 0 : 25 * Math.pow(2, used - free);
}
