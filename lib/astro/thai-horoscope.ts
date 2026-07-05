/**
 * get_thai_horoscope — structured Thai birth-day astrology data.
 * Returns raw tables (day planet, elements, colours, Thaksa positions) so the
 * calling model can do the interpretation; no fortune text is generated here.
 */

import { EN_WEEKDAYS, formatLongDate, ParsedDate, ParsedTime } from "../dates";
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

export const CATEGORY_INFO: Record<HoroscopeCategory, { label: string; focusKeys: string[] }> = {
  love: { label: "love", focusKeys: ["si", "montri"] },
  career: { label: "career", focusKeys: ["det", "utsaha", "montri"] },
  money: { label: "finances", focusKeys: ["mula", "si"] },
  health: { label: "health", focusKeys: ["ayu"] },
  overall: { label: "overall", focusKeys: ["boriwan", "ayu", "det", "si", "mula", "utsaha", "montri"] },
};

interface AstrologicalDay {
  key: DayKey;
  planet: DayPlanet;
  note: string;
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
      note:
        "No birth time given, so the calendar day is used. In Thai astrology a birth between 00:00–05:59 counts as the previous day, and a birth on Wednesday night (from 18:00) counts as Rahu's day. Provide birth_time for a precise result.",
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
      note: "Born on Wednesday night (after 18:00, or before dawn on Thursday), which counts as Rahu's day under the Thaksa system.",
    };
  }
  const key = WEEKDAY_TO_DAY_KEY[weekday];
  return {
    key,
    planet: dayPlanet(key),
    note: beforeDawn
      ? `Born before dawn (06:00), so the astrological day counts as ${EN_WEEKDAYS[weekday]} — Thai astrology changes the day at dawn.`
      : `The astrological day matches the calendar day (${EN_WEEKDAYS[weekday]}).`,
  };
}

interface LagnaInfo {
  method: string;
  sign: string;
  note: string;
}

/**
 * Approximate the ascendant (lagna) using the classical whole-sign shortcut:
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
    sign: sign.name,
    note: "This ascendant is approximated from the Sun's sidereal sign at dawn (the ascendant advances one sign roughly every two hours). It is not an ephemeris computation and can be off by one sign near boundaries.",
  };
}

export interface ThaiHoroscopeData {
  birth_info: {
    birth_date: string;
    birth_date_long: string;
    birth_time?: string;
    weekday_calendar: string;
    astrological_day: string;
    astrological_day_note: string;
  };
  day_master: {
    planet: string;
    number: number;
    element: string;
    day_color: string;
    traits: ReadonlyArray<string>;
  };
  taksa: Array<{
    position: string;
    meaning: string;
    planet: string;
    color: string;
    number: number;
  }>;
  lucky: {
    colors: string[];
    avoid_color: string;
    avoid_color_reason: string;
    numbers: number[];
  };
  ascendant?: LagnaInfo;
  category: HoroscopeCategory;
  category_label: string;
  category_focus: Array<{
    position: string;
    meaning: string;
    planet: string;
    color: string;
    number: number;
  }>;
  interpretation_guide: string;
  disclaimer: string;
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
      position: p.name,
      meaning: p.meaning,
      planet: p.planet.planet,
      color: p.planet.color,
      number: p.planet.number,
    }));

  return {
    birth_info: {
      birth_date: rawDate,
      birth_date_long: formatLongDate(date),
      ...(rawTime ? { birth_time: rawTime } : {}),
      weekday_calendar: EN_WEEKDAYS[date.weekday],
      astrological_day: astroDay.planet.day,
      astrological_day_note: astroDay.note,
    },
    day_master: {
      planet: astroDay.planet.planet,
      number: astroDay.planet.number,
      element: astroDay.planet.element,
      day_color: astroDay.planet.color,
      traits: astroDay.planet.traits,
    },
    taksa: taksa.map((p) => ({
      position: p.name,
      meaning: p.meaning,
      planet: p.planet.planet,
      color: p.planet.color,
      number: p.planet.number,
    })),
    lucky: {
      colors: [
        `${astroDay.planet.color} (birth-day colour)`,
        `${det.planet.color} (Det — power and prestige)`,
        `${si.planet.color} (Si — fortune, charm and favour)`,
        `${mula.planet.color} (Mula — wealth and assets)`,
      ],
      avoid_color: kalakini.planet.color,
      avoid_color_reason: `The Kalakini (misfortune) colour for someone born on ${astroDay.planet.day} — it belongs to ${kalakini.planet.planet}.`,
      numbers: [astroDay.planet.number, det.planet.number, si.planet.number],
    },
    ...(time ? { ascendant: approximateLagna(date, time) } : {}),
    category,
    category_label: CATEGORY_INFO[category].label,
    category_focus: focus,
    interpretation_guide:
      "This is raw data from the traditional Thaksa tables. Use the positions in category_focus as the core for interpreting the asked category — read the planet ruling each position together with its element and colour, blend in the birth-day temperament from day_master.traits, and note the Kalakini colour to avoid.",
    disclaimer:
      "Computed from traditional Thai (Thaksa) astrology for reflection and entertainment — not a guaranteed prediction.",
  };
}
