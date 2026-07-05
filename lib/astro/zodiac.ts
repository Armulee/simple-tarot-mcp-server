/**
 * Zodiac tables: Western (tropical) signs, Thai sidereal signs, and the
 * Thai/Chinese 12-year animal cycle (นักษัตร).
 */

import { ParsedDate } from "../dates";

export interface ZodiacSign {
  name_en: string;
  name_th: string;
  symbol: string;
  element_en: "fire" | "earth" | "air" | "water";
  element_th: string;
  quality_en: "cardinal" | "fixed" | "mutable";
  quality_th: string;
  ruling_planet_en: string;
  ruling_planet_th: string;
  date_range: string;
}

/** Tropical zodiac; index 0 = Aries. Start dates used for lookup are inclusive. */
export const WESTERN_SIGNS: ReadonlyArray<ZodiacSign & { start: [number, number] }> = [
  { name_en: "Aries", name_th: "ราศีเมษ", symbol: "♈", element_en: "fire", element_th: "ธาตุไฟ", quality_en: "cardinal", quality_th: "จรราศี", ruling_planet_en: "Mars", ruling_planet_th: "ดาวอังคาร", date_range: "Mar 21 – Apr 19", start: [3, 21] },
  { name_en: "Taurus", name_th: "ราศีพฤษภ", symbol: "♉", element_en: "earth", element_th: "ธาตุดิน", quality_en: "fixed", quality_th: "สถิรราศี", ruling_planet_en: "Venus", ruling_planet_th: "ดาวศุกร์", date_range: "Apr 20 – May 20", start: [4, 20] },
  { name_en: "Gemini", name_th: "ราศีเมถุน", symbol: "♊", element_en: "air", element_th: "ธาตุลม", quality_en: "mutable", quality_th: "อุภยราศี", ruling_planet_en: "Mercury", ruling_planet_th: "ดาวพุธ", date_range: "May 21 – Jun 20", start: [5, 21] },
  { name_en: "Cancer", name_th: "ราศีกรกฎ", symbol: "♋", element_en: "water", element_th: "ธาตุน้ำ", quality_en: "cardinal", quality_th: "จรราศี", ruling_planet_en: "Moon", ruling_planet_th: "ดาวจันทร์", date_range: "Jun 21 – Jul 22", start: [6, 21] },
  { name_en: "Leo", name_th: "ราศีสิงห์", symbol: "♌", element_en: "fire", element_th: "ธาตุไฟ", quality_en: "fixed", quality_th: "สถิรราศี", ruling_planet_en: "Sun", ruling_planet_th: "ดาวอาทิตย์", date_range: "Jul 23 – Aug 22", start: [7, 23] },
  { name_en: "Virgo", name_th: "ราศีกันย์", symbol: "♍", element_en: "earth", element_th: "ธาตุดิน", quality_en: "mutable", quality_th: "อุภยราศี", ruling_planet_en: "Mercury", ruling_planet_th: "ดาวพุธ", date_range: "Aug 23 – Sep 22", start: [8, 23] },
  { name_en: "Libra", name_th: "ราศีตุลย์", symbol: "♎", element_en: "air", element_th: "ธาตุลม", quality_en: "cardinal", quality_th: "จรราศี", ruling_planet_en: "Venus", ruling_planet_th: "ดาวศุกร์", date_range: "Sep 23 – Oct 22", start: [9, 23] },
  { name_en: "Scorpio", name_th: "ราศีพิจิก", symbol: "♏", element_en: "water", element_th: "ธาตุน้ำ", quality_en: "fixed", quality_th: "สถิรราศี", ruling_planet_en: "Mars", ruling_planet_th: "ดาวอังคาร", date_range: "Oct 23 – Nov 21", start: [10, 23] },
  { name_en: "Sagittarius", name_th: "ราศีธนู", symbol: "♐", element_en: "fire", element_th: "ธาตุไฟ", quality_en: "mutable", quality_th: "อุภยราศี", ruling_planet_en: "Jupiter", ruling_planet_th: "ดาวพฤหัสบดี", date_range: "Nov 22 – Dec 21", start: [11, 22] },
  { name_en: "Capricorn", name_th: "ราศีมังกร", symbol: "♑", element_en: "earth", element_th: "ธาตุดิน", quality_en: "cardinal", quality_th: "จรราศี", ruling_planet_en: "Saturn", ruling_planet_th: "ดาวเสาร์", date_range: "Dec 22 – Jan 19", start: [12, 22] },
  { name_en: "Aquarius", name_th: "ราศีกุมภ์", symbol: "♒", element_en: "air", element_th: "ธาตุลม", quality_en: "fixed", quality_th: "สถิรราศี", ruling_planet_en: "Saturn", ruling_planet_th: "ดาวเสาร์", date_range: "Jan 20 – Feb 18", start: [1, 20] },
  { name_en: "Pisces", name_th: "ราศีมีน", symbol: "♓", element_en: "water", element_th: "ธาตุน้ำ", quality_en: "mutable", quality_th: "อุภยราศี", ruling_planet_en: "Jupiter", ruling_planet_th: "ดาวพฤหัสบดี", date_range: "Feb 19 – Mar 20", start: [2, 19] },
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
  name_th: string;
  name_en: string;
  /** Approximate start date in the Thai solar (sidereal) calendar. */
  start: [number, number];
}

/** Thai sidereal signs run ~23 days behind the tropical zodiac; boundaries are approximate. */
export const THAI_SIDEREAL_SIGNS: ReadonlyArray<ThaiSiderealSign> = [
  { name_th: "ราศีเมษ", name_en: "Aries (sidereal)", start: [4, 13] },
  { name_th: "ราศีพฤษภ", name_en: "Taurus (sidereal)", start: [5, 14] },
  { name_th: "ราศีเมถุน", name_en: "Gemini (sidereal)", start: [6, 14] },
  { name_th: "ราศีกรกฎ", name_en: "Cancer (sidereal)", start: [7, 15] },
  { name_th: "ราศีสิงห์", name_en: "Leo (sidereal)", start: [8, 17] },
  { name_th: "ราศีกันย์", name_en: "Virgo (sidereal)", start: [9, 17] },
  { name_th: "ราศีตุลย์", name_en: "Libra (sidereal)", start: [10, 17] },
  { name_th: "ราศีพิจิก", name_en: "Scorpio (sidereal)", start: [11, 16] },
  { name_th: "ราศีธนู", name_en: "Sagittarius (sidereal)", start: [12, 16] },
  { name_th: "ราศีมังกร", name_en: "Capricorn (sidereal)", start: [1, 14] },
  { name_th: "ราศีกุมภ์", name_en: "Aquarius (sidereal)", start: [2, 13] },
  { name_th: "ราศีมีน", name_en: "Pisces (sidereal)", start: [3, 14] },
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
  name_th: string;
  animal_th: string;
  animal_en: string;
}

/** Index 0 = Rat (ปีชวด); year 2020 was a Rat year. */
export const CHINESE_ZODIAC: ReadonlyArray<ChineseZodiacAnimal> = [
  { name_th: "ปีชวด", animal_th: "หนู", animal_en: "Rat" },
  { name_th: "ปีฉลู", animal_th: "วัว", animal_en: "Ox" },
  { name_th: "ปีขาล", animal_th: "เสือ", animal_en: "Tiger" },
  { name_th: "ปีเถาะ", animal_th: "กระต่าย", animal_en: "Rabbit" },
  { name_th: "ปีมะโรง", animal_th: "งูใหญ่ (มังกร)", animal_en: "Dragon" },
  { name_th: "ปีมะเส็ง", animal_th: "งูเล็ก", animal_en: "Snake" },
  { name_th: "ปีมะเมีย", animal_th: "ม้า", animal_en: "Horse" },
  { name_th: "ปีมะแม", animal_th: "แพะ", animal_en: "Goat" },
  { name_th: "ปีวอก", animal_th: "ลิง", animal_en: "Monkey" },
  { name_th: "ปีระกา", animal_th: "ไก่", animal_en: "Rooster" },
  { name_th: "ปีจอ", animal_th: "หมา", animal_en: "Dog" },
  { name_th: "ปีกุน", animal_th: "หมู", animal_en: "Pig" },
];

const STEM_ELEMENTS: ReadonlyArray<{ th: string; en: string }> = [
  { th: "ธาตุทอง", en: "metal" }, // years ending 0, 1
  { th: "ธาตุน้ำ", en: "water" }, // 2, 3
  { th: "ธาตุไม้", en: "wood" }, // 4, 5
  { th: "ธาตุไฟ", en: "fire" }, // 6, 7
  { th: "ธาตุดิน", en: "earth" }, // 8, 9
];

export function chineseZodiac(year: number): {
  animal: ChineseZodiacAnimal;
  previous_animal: ChineseZodiacAnimal;
  element_th: string;
  element_en: string;
  yin_yang: "yang" | "yin";
} {
  const idx = (((year - 2020) % 12) + 12) % 12;
  const prev = (idx + 11) % 12;
  const stem = STEM_ELEMENTS[Math.floor((year % 10) / 2)];
  return {
    animal: CHINESE_ZODIAC[idx],
    previous_animal: CHINESE_ZODIAC[prev],
    element_th: stem.th,
    element_en: stem.en,
    yin_yang: year % 2 === 0 ? "yang" : "yin",
  };
}

export interface ZodiacInfoData {
  birth_date: string;
  western_zodiac: ZodiacSign;
  thai_sidereal_zodiac: {
    name_th: string;
    name_en: string;
    note_th: string;
  };
  chinese_thai_zodiac: {
    name_th: string;
    animal_th: string;
    animal_en: string;
    element_th: string;
    element_en: string;
    yin_yang: "yang" | "yin";
    notes_th: string[];
  };
  disclaimer_th: string;
}

export function buildZodiacInfo(date: ParsedDate, rawDate: string): ZodiacInfoData {
  const western = westernSign(date.month, date.day);
  const sidereal = THAI_SIDEREAL_SIGNS[thaiSiderealSignIndex(date.month, date.day)];
  const chinese = chineseZodiac(date.year);

  const notes: string[] = [];
  if (date.month === 1 || (date.month === 2 && date.day <= 20)) {
    notes.push(
      `เกิดช่วงต้นปีก่อนตรุษจีน หากนับแบบจีน (เปลี่ยนปีที่ตรุษจีน ปลายมกราคม–กลางกุมภาพันธ์) อาจเป็น${chinese.previous_animal.name_th} (${chinese.previous_animal.animal_en}) — ควรตรวจสอบวันตรุษจีนของปีเกิด`,
    );
  }
  if (date.month === 1 || date.month === 2 || date.month === 3 || (date.month === 4 && date.day <= 13)) {
    notes.push(
      `ตำราไทยบางสำนักเปลี่ยนปีนักษัตรที่สงกรานต์ (เมษายน) หากนับแบบนั้น ผู้เกิดก่อนสงกรานต์จะเป็น${chinese.previous_animal.name_th} (${chinese.previous_animal.animal_en})`,
    );
  }
  notes.push("ค่าที่ให้เป็นการนับตามปีปฏิทินสากล (1 มกราคม) ซึ่งเป็นแบบที่ใช้แพร่หลายในไทยปัจจุบัน");

  return {
    birth_date: rawDate,
    western_zodiac: {
      name_en: western.name_en,
      name_th: western.name_th,
      symbol: western.symbol,
      element_en: western.element_en,
      element_th: western.element_th,
      quality_en: western.quality_en,
      quality_th: western.quality_th,
      ruling_planet_en: western.ruling_planet_en,
      ruling_planet_th: western.ruling_planet_th,
      date_range: western.date_range,
    },
    thai_sidereal_zodiac: {
      name_th: sidereal.name_th,
      name_en: sidereal.name_en,
      note_th:
        "ราศีแบบไทย (นิรายนะ/สุริยคติไทย) เหลื่อมจากราศีสากลราว 3 สัปดาห์ ขอบเขตวันที่เป็นค่าประมาณตามปฏิทินโหราศาสตร์ไทย",
    },
    chinese_thai_zodiac: {
      name_th: chinese.animal.name_th,
      animal_th: chinese.animal.animal_th,
      animal_en: chinese.animal.animal_en,
      element_th: chinese.element_th,
      element_en: chinese.element_en,
      yin_yang: chinese.yin_yang,
      notes_th: notes,
    },
    disclaimer_th:
      "ข้อมูลอ้างอิงตามตารางโหราศาสตร์แบบดั้งเดิม ใช้เพื่อการศึกษาและความบันเทิง",
  };
}
