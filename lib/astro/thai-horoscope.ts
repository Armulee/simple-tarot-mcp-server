/**
 * get_thai_horoscope — structured Thai birth-day astrology data.
 * Returns raw tables (day planet, elements, colours, Thaksa positions) so the
 * calling model can do the interpretation; no fortune text is generated here.
 */

import { EN_WEEKDAYS, formatThaiDate, ParsedDate, ParsedTime, THAI_WEEKDAYS } from "../dates";
import {
  computeTaksa,
  DayKey,
  dayPlanet,
  DayPlanet,
  TaksaPosition,
  WEEKDAY_TO_DAY_KEY,
} from "./thai-days";
import { THAI_SIDEREAL_SIGNS, thaiSiderealSignIndex } from "./zodiac";

export type HoroscopeCategory = "love" | "career" | "money" | "health" | "overall";

export const CATEGORY_INFO: Record<HoroscopeCategory, { th: string; focusKeys: string[] }> = {
  love: { th: "ความรัก", focusKeys: ["si", "montri"] },
  career: { th: "การงาน", focusKeys: ["det", "utsaha", "montri"] },
  money: { th: "การเงิน", focusKeys: ["mula", "si"] },
  health: { th: "สุขภาพ", focusKeys: ["ayu"] },
  overall: { th: "ภาพรวม", focusKeys: ["boriwan", "ayu", "det", "si", "mula", "utsaha", "montri"] },
};

interface AstrologicalDay {
  key: DayKey;
  planet: DayPlanet;
  note_th: string;
}

/**
 * Resolve the astrological birth day. In Thai astrology the day begins at dawn
 * (~06:00), and a birth on Wednesday night (18:00–06:00) belongs to Rahu.
 */
export function resolveAstrologicalDay(date: ParsedDate, time?: ParsedTime): AstrologicalDay {
  if (!time) {
    const key = WEEKDAY_TO_DAY_KEY[date.weekday];
    return {
      key,
      planet: dayPlanet(key),
      note_th:
        "ไม่ได้ระบุเวลาเกิด จึงใช้วันตามปฏิทิน — ตามหลักโหราศาสตร์ไทย ผู้ที่เกิดเวลา 00:00–05:59 นับเป็นวันก่อนหน้า และผู้ที่เกิดคืนวันพุธ (18:00 เป็นต้นไป) นับเป็นวันราหู หากทราบเวลาเกิดให้ระบุ birth_time เพื่อความแม่นยำ",
    };
  }

  // Before dawn: the astrological day is still "yesterday".
  let weekday = date.weekday;
  const beforeDawn = time.hour < 6;
  if (beforeDawn) weekday = (weekday + 6) % 7;
  const isNight = beforeDawn || time.hour >= 18;

  if (weekday === 3 && isNight) {
    return {
      key: "wednesday_night",
      planet: dayPlanet("wednesday_night"),
      note_th: "เกิดคืนวันพุธ (หลัง 18:00 หรือก่อนรุ่งเช้าวันพฤหัสบดี) จึงนับเป็นวันราหูตามหลักทักษา",
    };
  }
  const key = WEEKDAY_TO_DAY_KEY[weekday];
  return {
    key,
    planet: dayPlanet(key),
    note_th: beforeDawn
      ? `เกิดก่อนรุ่งเช้า (06:00) จึงนับเป็น${THAI_WEEKDAYS[weekday]}ตามหลักโหราศาสตร์ไทยที่เปลี่ยนวันตอนรุ่งเช้า`
      : `วันทางโหราศาสตร์ตรงกับวันตามปฏิทิน (${THAI_WEEKDAYS[weekday]})`,
  };
}

interface LagnaInfo {
  method: string;
  sign_th: string;
  sign_en: string;
  note_th: string;
}

/**
 * Approximate the ascendant (ลัคนา) using the classical whole-sign shortcut:
 * at dawn the ascendant matches the Sun's sidereal sign and advances one sign
 * roughly every two hours. This is an approximation, not an ephemeris computation.
 */
export function approximateLagna(date: ParsedDate, time: ParsedTime): LagnaInfo {
  const sunSign = thaiSiderealSignIndex(date.month, date.day);
  const minutesSinceDawn = (((time.hour * 60 + time.minute) - 6 * 60) + 24 * 60) % (24 * 60);
  const signIndex = (sunSign + Math.floor(minutesSinceDawn / 120)) % 12;
  const sign = THAI_SIDEREAL_SIGNS[signIndex];
  return {
    method: "approximate_whole_sign_from_dawn",
    sign_th: sign.name_th,
    sign_en: sign.name_en,
    note_th:
      "ลัคนานี้คำนวณแบบประมาณจากราศีอาทิตย์ ณ รุ่งเช้า (ลัคนาเคลื่อน 1 ราศีทุก ~2 ชั่วโมง) ไม่ใช่การผูกดวงด้วยปฏิทินดาราศาสตร์ อาจคลาดเคลื่อนได้ 1 ราศีในช่วงรอยต่อ",
  };
}

export interface ThaiHoroscopeData {
  birth_info: {
    birth_date: string;
    birth_date_thai: string;
    birth_time?: string;
    weekday_calendar_th: string;
    weekday_calendar_en: string;
    astrological_day_th: string;
    astrological_day_en: string;
    astrological_day_note_th: string;
  };
  day_master: {
    planet_th: string;
    planet_en: string;
    number: number;
    element_th: string;
    element_en: string;
    day_color_th: string;
    day_color_en: string;
    traits_th: ReadonlyArray<string>;
  };
  taksa: Array<{
    position_th: string;
    position_en: string;
    meaning_th: string;
    meaning_en: string;
    planet_th: string;
    planet_en: string;
    color_th: string;
    number: number;
  }>;
  lucky: {
    colors_th: string[];
    avoid_color_th: string;
    avoid_color_reason_th: string;
    numbers: number[];
  };
  ascendant?: LagnaInfo;
  category: HoroscopeCategory;
  category_th: string;
  category_focus: Array<{
    position_th: string;
    meaning_th: string;
    planet_th: string;
    color_th: string;
    number: number;
  }>;
  interpretation_guide_th: string;
  disclaimer_th: string;
}

export function buildThaiHoroscope(
  date: ParsedDate,
  rawDate: string,
  category: HoroscopeCategory,
  time?: ParsedTime,
  rawTime?: string,
): ThaiHoroscopeData {
  const astroDay = resolveAstrologicalDay(date, time);
  const taksa = computeTaksa(astroDay.key);
  const byKey = new Map<string, TaksaPosition>(taksa.map((p) => [p.key, p]));

  const si = byKey.get("si")!;
  const det = byKey.get("det")!;
  const mula = byKey.get("mula")!;
  const kalakini = byKey.get("kalakini")!;

  const focus = CATEGORY_INFO[category].focusKeys
    .map((k) => byKey.get(k)!)
    .map((p) => ({
      position_th: p.name_th,
      meaning_th: p.meaning_th,
      planet_th: p.planet.planet_th,
      color_th: p.planet.color_th,
      number: p.planet.number,
    }));

  return {
    birth_info: {
      birth_date: rawDate,
      birth_date_thai: formatThaiDate(date),
      ...(rawTime ? { birth_time: rawTime } : {}),
      weekday_calendar_th: THAI_WEEKDAYS[date.weekday],
      weekday_calendar_en: EN_WEEKDAYS[date.weekday],
      astrological_day_th: astroDay.planet.day_th,
      astrological_day_en: astroDay.planet.day_en,
      astrological_day_note_th: astroDay.note_th,
    },
    day_master: {
      planet_th: astroDay.planet.planet_th,
      planet_en: astroDay.planet.planet_en,
      number: astroDay.planet.number,
      element_th: astroDay.planet.element_th,
      element_en: astroDay.planet.element_en,
      day_color_th: astroDay.planet.color_th,
      day_color_en: astroDay.planet.color_en,
      traits_th: astroDay.planet.traits_th,
    },
    taksa: taksa.map((p) => ({
      position_th: p.name_th,
      position_en: p.name_en,
      meaning_th: p.meaning_th,
      meaning_en: p.meaning_en,
      planet_th: p.planet.planet_th,
      planet_en: p.planet.planet_en,
      color_th: p.planet.color_th,
      number: p.planet.number,
    })),
    lucky: {
      colors_th: [
        `${astroDay.planet.color_th} (สีประจำวันเกิด)`,
        `${det.planet.color_th} (สีเดช — อำนาจ บารมี)`,
        `${si.planet.color_th} (สีศรี — โชคลาภ เมตตามหานิยม)`,
        `${mula.planet.color_th} (สีมูละ — ทรัพย์สินเงินทอง)`,
      ],
      avoid_color_th: kalakini.planet.color_th,
      avoid_color_reason_th: `เป็นสีกาลกิณีของผู้เกิด${astroDay.planet.day_th} (ตรงกับ${kalakini.planet.planet_th})`,
      numbers: [astroDay.planet.number, det.planet.number, si.planet.number],
    },
    ...(time ? { ascendant: approximateLagna(date, time) } : {}),
    category,
    category_th: CATEGORY_INFO[category].th,
    category_focus: focus,
    interpretation_guide_th:
      "ข้อมูลนี้เป็นข้อมูลดิบตามตำราทักษามหาโชค: ใช้ภูมิทักษาใน category_focus เป็นแกนตีความหมวดที่ถาม โดยดูดาวที่ครองภูมินั้น ธาตุ และสีประกอบ เสริมด้วยอุปนิสัยพื้นดวง (day_master.traits_th) และหลีกเลี่ยงสีกาลกิณี",
    disclaimer_th:
      "คำนวณตามหลักโหราศาสตร์ไทย (ทักษา) เพื่อความบันเทิงและการไตร่ตรอง ไม่ใช่คำพยากรณ์ที่รับประกันผล",
  };
}
