/**
 * The full 78-card Rider–Waite–Smith tarot deck.
 * Kept as a static data module — no external API is needed to draw cards.
 */

export type Arcana = "major" | "minor";
export type Suit = "wands" | "cups" | "swords" | "pentacles";

export interface TarotCard {
  /** Stable card id, 0–77 (0–21 major arcana, then wands, cups, swords, pentacles). */
  id: number;
  name: string;
  arcana: Arcana;
  suit?: Suit;
  /** Short display numeral: Roman numeral for major arcana, rank for minor (A, 2–10, P, N, Q, K). */
  numeral: string;
  /** Single display glyph used by the card-picking UI. */
  glyph: string;
}

const ROMAN = [
  "0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X",
  "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI",
] as const;

const MAJOR_ARCANA: ReadonlyArray<string> = [
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Devil",
  "The Tower",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World",
];

interface SuitInfo {
  suit: Suit;
  name: string;
  glyph: string;
}

/** Glyphs follow the traditional playing-card mapping: wands→clubs, cups→hearts, swords→spades, pentacles→diamonds. */
const SUITS: ReadonlyArray<SuitInfo> = [
  { suit: "wands", name: "Wands", glyph: "♣" },
  { suit: "cups", name: "Cups", glyph: "♥" },
  { suit: "swords", name: "Swords", glyph: "♠" },
  { suit: "pentacles", name: "Pentacles", glyph: "♦" },
];

interface RankInfo {
  name: string;
  numeral: string;
}

const RANKS: ReadonlyArray<RankInfo> = [
  { name: "Ace", numeral: "A" },
  { name: "Two", numeral: "2" },
  { name: "Three", numeral: "3" },
  { name: "Four", numeral: "4" },
  { name: "Five", numeral: "5" },
  { name: "Six", numeral: "6" },
  { name: "Seven", numeral: "7" },
  { name: "Eight", numeral: "8" },
  { name: "Nine", numeral: "9" },
  { name: "Ten", numeral: "10" },
  { name: "Page", numeral: "P" },
  { name: "Knight", numeral: "N" },
  { name: "Queen", numeral: "Q" },
  { name: "King", numeral: "K" },
];

function buildDeck(): ReadonlyArray<TarotCard> {
  const cards: TarotCard[] = MAJOR_ARCANA.map((name, i) => ({
    id: i,
    name,
    arcana: "major",
    numeral: ROMAN[i],
    glyph: "✦",
  }));
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: cards.length,
        name: `${rank.name} of ${suit.name}`,
        arcana: "minor",
        suit: suit.suit,
        numeral: rank.numeral,
        glyph: suit.glyph,
      });
    }
  }
  return cards;
}

/** All 78 cards, ordered: major arcana 0–21, then wands, cups, swords, pentacles (Ace→King). */
export const TAROT_DECK: ReadonlyArray<TarotCard> = buildDeck();
