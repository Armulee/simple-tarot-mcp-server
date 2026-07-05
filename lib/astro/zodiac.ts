/**
 * Zodiac tables: Western (tropical) signs, Thai sidereal signs, and the
 * Thai/Chinese 12-year animal cycle.
 */

import { ParsedDate } from "../dates";

export interface ZodiacSign {
  name: string;
  symbol: string;
  element: "fire" | "earth" | "air" | "water";
  quality: "cardinal" | "fixed" | "mutable";
  ruling_planet: string;
  date_range: string;
}

/** Tropical zodiac; index 0 = Aries. Start dates used for lookup are inclusive. */
export const WESTERN_SIGNS: ReadonlyArray<ZodiacSign & { start: [number, number] }> = [
  { name: "Aries", symbol: "♈", element: "fire", quality: "cardinal", ruling_planet: "Mars", date_range: "Mar 21 – Apr 19", start: [3, 21] },
  { name: "Taurus", symbol: "♉", element: "earth", quality: "fixed", ruling_planet: "Venus", date_range: "Apr 20 – May 20", start: [4, 20] },
  { name: "Gemini", symbol: "♊", element: "air", quality: "mutable", ruling_planet: "Mercury", date_range: "May 21 – Jun 20", start: [5, 21] },
  { name: "Cancer", symbol: "♋", element: "water", quality: "cardinal", ruling_planet: "Moon", date_range: "Jun 21 – Jul 22", start: [6, 21] },
  { name: "Leo", symbol: "♌", element: "fire", quality: "fixed", ruling_planet: "Sun", date_range: "Jul 23 – Aug 22", start: [7, 23] },
  { name: "Virgo", symbol: "♍", element: "earth", quality: "mutable", ruling_planet: "Mercury", date_range: "Aug 23 – Sep 22", start: [8, 23] },
  { name: "Libra", symbol: "♎", element: "air", quality: "cardinal", ruling_planet: "Venus", date_range: "Sep 23 – Oct 22", start: [9, 23] },
  { name: "Scorpio", symbol: "♏", element: "water", quality: "fixed", ruling_planet: "Mars", date_range: "Oct 23 – Nov 21", start: [10, 23] },
  { name: "Sagittarius", symbol: "♐", element: "fire", quality: "mutable", ruling_planet: "Jupiter", date_range: "Nov 22 – Dec 21", start: [11, 22] },
  { name: "Capricorn", symbol: "♑", element: "earth", quality: "cardinal", ruling_planet: "Saturn", date_range: "Dec 22 – Jan 19", start: [12, 22] },
  { name: "Aquarius", symbol: "♒", element: "air", quality: "fixed", ruling_planet: "Saturn", date_range: "Jan 20 – Feb 18", start: [1, 20] },
  { name: "Pisces", symbol: "♓", element: "water", quality: "mutable", ruling_planet: "Jupiter", date_range: "Feb 19 – Mar 20", start: [2, 19] },
];

export function westernSign(month: number, day: number): ZodiacSign {
  // Pick the sign with the latest start date that is on or before the birth date.
  const md = month * 100 + day;
  let match = WESTERN_SIGNS[9]; // Capricorn covers the year boundary (Dec 22 → Jan 19)
  let bestStart = -1;
  for (const sign of WESTERN_SIGNS) {
    const [m, d] = sign.start;
    const start = m * 100 + d;
    if (md >= start && start > bestStart) {
      match = sign;
      bestStart = start;
    }
  }
  return match;
}

export interface ThaiSiderealSign {
  name: string;
  /** Approximate start date in the Thai solar (sidereal) calendar. */
  start: [number, number];
}

/** Thai sidereal signs run ~23 days behind the tropical zodiac; boundaries are approximate. */
export const THAI_SIDEREAL_SIGNS: ReadonlyArray<ThaiSiderealSign> = [
  { name: "Aries (sidereal)", start: [4, 13] },
  { name: "Taurus (sidereal)", start: [5, 14] },
  { name: "Gemini (sidereal)", start: [6, 14] },
  { name: "Cancer (sidereal)", start: [7, 15] },
  { name: "Leo (sidereal)", start: [8, 17] },
  { name: "Virgo (sidereal)", start: [9, 17] },
  { name: "Libra (sidereal)", start: [10, 17] },
  { name: "Scorpio (sidereal)", start: [11, 16] },
  { name: "Sagittarius (sidereal)", start: [12, 16] },
  { name: "Capricorn (sidereal)", start: [1, 14] },
  { name: "Aquarius (sidereal)", start: [2, 13] },
  { name: "Pisces (sidereal)", start: [3, 14] },
];

export function thaiSiderealSignIndex(month: number, day: number): number {
  const md = month * 100 + day;
  let match = 8; // Sagittarius covers the year boundary (Dec 16 → Jan 13)
  let bestStart = -1;
  THAI_SIDEREAL_SIGNS.forEach((sign, i) => {
    const [m, d] = sign.start;
    const start = m * 100 + d;
    if (md >= start && start > bestStart) {
      match = i;
      bestStart = start;
    }
  });
  if (md < 114) match = 8; // before Jan 14 → still Sagittarius
  return match;
}

export interface ChineseZodiacAnimal {
  animal: string;
}

/** Index 0 = Rat; year 2020 was a Rat year. */
export const CHINESE_ZODIAC: ReadonlyArray<ChineseZodiacAnimal> = [
  { animal: "Rat" },
  { animal: "Ox" },
  { animal: "Tiger" },
  { animal: "Rabbit" },
  { animal: "Dragon" },
  { animal: "Snake" },
  { animal: "Horse" },
  { animal: "Goat" },
  { animal: "Monkey" },
  { animal: "Rooster" },
  { animal: "Dog" },
  { animal: "Pig" },
];

const STEM_ELEMENTS: ReadonlyArray<string> = [
  "metal", // years ending 0, 1
  "water", // 2, 3
  "wood", // 4, 5
  "fire", // 6, 7
  "earth", // 8, 9
];

export function chineseZodiac(year: number): {
  animal: ChineseZodiacAnimal;
  previous_animal: ChineseZodiacAnimal;
  element: string;
  yin_yang: "yang" | "yin";
} {
  const idx = (((year - 2020) % 12) + 12) % 12;
  const prev = (idx + 11) % 12;
  const element = STEM_ELEMENTS[Math.floor((year % 10) / 2)];
  return {
    animal: CHINESE_ZODIAC[idx],
    previous_animal: CHINESE_ZODIAC[prev],
    element,
    yin_yang: year % 2 === 0 ? "yang" : "yin",
  };
}

export interface ZodiacInfoData {
  birth_date: string;
  western_zodiac: ZodiacSign;
  thai_sidereal_zodiac: {
    name: string;
    note: string;
  };
  chinese_thai_zodiac: {
    animal: string;
    element: string;
    yin_yang: "yang" | "yin";
    notes: string[];
  };
  disclaimer: string;
}

export function buildZodiacInfo(date: ParsedDate, rawDate: string): ZodiacInfoData {
  const western = westernSign(date.month, date.day);
  const sidereal = THAI_SIDEREAL_SIGNS[thaiSiderealSignIndex(date.month, date.day)];
  const chinese = chineseZodiac(date.year);

  const notes: string[] = [];
  if (date.month === 1 || (date.month === 2 && date.day <= 20)) {
    notes.push(
      `Born early in the year before Chinese New Year: under Chinese reckoning (the year changes at Chinese New Year, late January–mid February) the animal may instead be the previous year's, ${chinese.previous_animal.animal} — check the Chinese New Year date of the birth year.`,
    );
  }
  if (date.month === 1 || date.month === 2 || date.month === 3 || (date.month === 4 && date.day <= 13)) {
    notes.push(
      `Some Thai traditions change the zodiac year at Songkran (mid April); counted that way, someone born before Songkran belongs to the previous year's animal, ${chinese.previous_animal.animal}.`,
    );
  }
  notes.push(
    "Values use the international calendar year (changing on 1 January), the convention most widely used in Thailand today.",
  );

  return {
    birth_date: rawDate,
    western_zodiac: {
      name: western.name,
      symbol: western.symbol,
      element: western.element,
      quality: western.quality,
      ruling_planet: western.ruling_planet,
      date_range: western.date_range,
    },
    thai_sidereal_zodiac: {
      name: sidereal.name,
      note: "The Thai sidereal zodiac lags the tropical (Western) zodiac by roughly three weeks; boundary dates are approximations from the Thai astrological calendar.",
    },
    chinese_thai_zodiac: {
      animal: chinese.animal.animal,
      element: chinese.element,
      yin_yang: chinese.yin_yang,
      notes,
    },
    disclaimer: "Reference data from traditional astrology tables, for study and entertainment.",
  };
}
