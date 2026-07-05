import { TAROT_DECK } from "./cards";

export interface ShuffledCard {
  /** Position in the shuffled deck, 0–77. The picking UI maps taps to this index. */
  i: number;
  name: string;
  numeral: string;
  glyph: string;
  reversed: boolean;
}

/** Cryptographically uniform integer in [0, maxExclusive) using rejection sampling. */
function secureRandomInt(maxExclusive: number): number {
  const buf = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  let x: number;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % maxExclusive;
}

/**
 * Shuffle the full 78-card deck (Fisher–Yates, crypto-random) with each card
 * independently assigned an upright/reversed orientation. No card repeats.
 */
export function shuffleDeck(): ShuffledCard[] {
  const order = TAROT_DECK.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = secureRandomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order.map((cardId, i) => {
    const card = TAROT_DECK[cardId];
    return {
      i,
      name: card.name,
      numeral: card.numeral,
      glyph: card.glyph,
      reversed: secureRandomInt(2) === 1,
    };
  });
}
