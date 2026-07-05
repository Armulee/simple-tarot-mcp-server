/**
 * The full 78-card Rider–Waite–Smith tarot deck with Thai and English names.
 * Kept as a static data module — no external API is needed to draw cards.
 */

export type Arcana = "major" | "minor";
export type Suit = "wands" | "cups" | "swords" | "pentacles";

export interface TarotCard {
  /** Stable card id, 0–77 (0–21 major arcana, then wands, cups, swords, pentacles). */
  id: number;
  name_en: string;
  name_th: string;
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

const MAJOR_ARCANA: ReadonlyArray<[string, string]> = [
  ["The Fool", "คนเขลา"],
  ["The Magician", "นักมายากล"],
  ["The High Priestess", "นักบวชหญิง"],
  ["The Empress", "จักรพรรดินี"],
  ["The Emperor", "จักรพรรดิ"],
  ["The Hierophant", "พระสังฆราช"],
  ["The Lovers", "คู่รัก"],
  ["The Chariot", "ราชรถ"],
  ["Strength", "พลังใจ"],
  ["The Hermit", "ฤๅษี"],
  ["Wheel of Fortune", "กงล้อโชคชะตา"],
  ["Justice", "ความยุติธรรม"],
  ["The Hanged Man", "ชายผู้ถูกแขวน"],
  ["Death", "ความตาย"],
  ["Temperance", "ความพอประมาณ"],
  ["The Devil", "ปีศาจ"],
  ["The Tower", "หอคอย"],
  ["The Star", "ดวงดาว"],
  ["The Moon", "ดวงจันทร์"],
  ["The Sun", "ดวงอาทิตย์"],
  ["Judgement", "การพิพากษา"],
  ["The World", "โลก"],
];

interface SuitInfo {
  suit: Suit;
  name_en: string;
  name_th: string;
  glyph: string;
}

/** Glyphs follow the traditional playing-card mapping: wands→clubs, cups→hearts, swords→spades, pentacles→diamonds. */
const SUITS: ReadonlyArray<SuitInfo> = [
  { suit: "wands", name_en: "Wands", name_th: "ไม้เท้า", glyph: "♣" },
  { suit: "cups", name_en: "Cups", name_th: "ถ้วย", glyph: "♥" },
  { suit: "swords", name_en: "Swords", name_th: "ดาบ", glyph: "♠" },
  { suit: "pentacles", name_en: "Pentacles", name_th: "เหรียญ", glyph: "♦" },
];

interface RankInfo {
  name_en: string;
  name_th: string;
  numeral: string;
}

const RANKS: ReadonlyArray<RankInfo> = [
  { name_en: "Ace", name_th: "เอซ", numeral: "A" },
  { name_en: "Two", name_th: "สอง", numeral: "2" },
  { name_en: "Three", name_th: "สาม", numeral: "3" },
  { name_en: "Four", name_th: "สี่", numeral: "4" },
  { name_en: "Five", name_th: "ห้า", numeral: "5" },
  { name_en: "Six", name_th: "หก", numeral: "6" },
  { name_en: "Seven", name_th: "เจ็ด", numeral: "7" },
  { name_en: "Eight", name_th: "แปด", numeral: "8" },
  { name_en: "Nine", name_th: "เก้า", numeral: "9" },
  { name_en: "Ten", name_th: "สิบ", numeral: "10" },
  { name_en: "Page", name_th: "เพจ", numeral: "P" },
  { name_en: "Knight", name_th: "อัศวิน", numeral: "N" },
  { name_en: "Queen", name_th: "ราชินี", numeral: "Q" },
  { name_en: "King", name_th: "ราชา", numeral: "K" },
];

function buildDeck(): ReadonlyArray<TarotCard> {
  const cards: TarotCard[] = MAJOR_ARCANA.map(([name_en, name_th], i) => ({
    id: i,
    name_en,
    name_th,
    arcana: "major",
    numeral: ROMAN[i],
    glyph: "✦",
  }));
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({
        id: cards.length,
        name_en: `${rank.name_en} of ${suit.name_en}`,
        name_th: `${rank.name_th}${suit.name_th}`,
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
