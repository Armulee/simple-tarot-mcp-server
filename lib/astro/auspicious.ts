/**
 * get_auspicious_dates — day-of-week auspiciousness per purpose, following
 * basic traditional Thai principles (each day's ruling planet and the
 * classical prohibition rhyme: no cremation on Friday, no topknot-cutting on
 * Tuesday, no weddings on Wednesday, no housewarming on Saturday).
 *
 * This is intentionally a simplified day-of-week system, not a full
 * auspicious-time computation from the lunar calendar — the tool result says
 * so explicitly.
 */

import { daysInMonth, EN_WEEKDAYS, formatLongDate, isoDate } from "../dates";

export type Purpose = "wedding" | "business" | "moving" | "car";

export type DayRating = "excellent" | "good" | "neutral" | "avoid";

interface PurposeRules {
  label: string;
  /** Rating and short reason per weekday, indexed 0=Sunday…6=Saturday. */
  days: ReadonlyArray<{ rating: DayRating; reason: string }>;
}

export const PURPOSE_RULES: Record<Purpose, PurposeRules> = {
  wedding: {
    label: "wedding",
    days: [
      { rating: "neutral", reason: "Sunday is a neutral day for weddings" },
      { rating: "good", reason: "Monday favours gentleness and serenity — a kind start to married life" },
      { rating: "avoid", reason: "Tuesday is a harsh day (Mars); tradition avoids it for weddings" },
      { rating: "avoid", reason: "Tradition forbids marrying on Wednesday, per the classical prohibition" },
      { rating: "good", reason: "Thursday is the day of teachers, bringing growth and stability — well suited to auspicious ceremonies" },
      { rating: "excellent", reason: "Friday belongs to Venus, the planet of love and happiness — traditionally the most auspicious wedding day" },
      { rating: "avoid", reason: "Saturday is a hard day (Saturn); tradition avoids it for weddings" },
    ],
  },
  business: {
    label: "opening a business",
    days: [
      { rating: "good", reason: "Sunday favours power and renown — good for launching something meant to be noticed" },
      { rating: "good", reason: "Monday favours charm and popularity — customers take a liking" },
      { rating: "avoid", reason: "Tuesday risks conflict and obstacles, per the harsh-day tradition" },
      { rating: "good", reason: "Wednesday belongs to Mercury, the planet of trade, communication and negotiation" },
      { rating: "excellent", reason: "Thursday is the day of teachers — prosperity and stability for the venture" },
      { rating: "excellent", reason: "Friday favours fortune and finances — a good day to start a business" },
      { rating: "avoid", reason: "Saturday is a hard day — risk of obstacles and delays" },
    ],
  },
  moving: {
    label: "moving house",
    days: [
      { rating: "neutral", reason: "Sunday is a neutral day for moving in" },
      { rating: "good", reason: "Monday favours a calm and happy household" },
      { rating: "avoid", reason: "Tuesday is a fiery day; tradition avoids moving into a new home" },
      { rating: "good", reason: "Wednesday favours smooth relocation and travel" },
      { rating: "excellent", reason: "Thursday is auspicious for the prosperity of the new home" },
      { rating: "excellent", reason: "Friday favours contentment and good fortune in the home" },
      { rating: "avoid", reason: "Tradition forbids housewarming on Saturday, per the classical prohibition" },
    ],
  },
  car: {
    label: "taking delivery of a car",
    days: [
      { rating: "neutral", reason: "Sunday is a neutral day for taking delivery of a car" },
      { rating: "good", reason: "Monday favours serenity — comfortable, easy driving" },
      { rating: "avoid", reason: "Tuesday is associated with sharp objects and accidents in folk belief, so it is usually avoided" },
      { rating: "good", reason: "Wednesday rules travel and communication — journeys flow smoothly" },
      { rating: "excellent", reason: "Thursday favours safety, stability and prosperity" },
      { rating: "excellent", reason: "Friday favours fortune — a popular day to take a car home to draw in wealth" },
      { rating: "avoid", reason: "Saturday is a hard day — risk of mishaps and accidents per the old texts" },
    ],
  },
};

export interface AuspiciousDatesData {
  month: string;
  purpose: Purpose;
  purpose_label: string;
  auspicious_dates: Array<{
    date: string;
    weekday_date: string;
    rating: "excellent" | "good";
    reason: string;
  }>;
  days_to_avoid: Array<{ weekday: string; reason: string }>;
  method_note: string;
  disclaimer: string;
}

export type MonthParse = { ok: true; year: number; month: number } | { ok: false; error: string };

export function parseMonth(value: string): MonthParse {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) {
    return {
      ok: false,
      error: `Invalid month: "${value}". Use YYYY-MM format, e.g. "2026-08" for August 2026.`,
    };
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) {
    return {
      ok: false,
      error: `Invalid month: "${m[2]}" is out of range. Use a month between 01 and 12, e.g. "2026-08".`,
    };
  }
  if (year < 1900 || year > 2100) {
    return {
      ok: false,
      error: `Invalid month: year ${year} is out of the supported range 1900–2100. Pass a month within that range.`,
    };
  }
  return { ok: true, year, month };
}

export function buildAuspiciousDates(year: number, month: number, purpose: Purpose): AuspiciousDatesData {
  const rules = PURPOSE_RULES[purpose];
  const total = daysInMonth(year, month);
  const good: AuspiciousDatesData["auspicious_dates"] = [];

  for (let day = 1; day <= total; day++) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const rule = rules.days[weekday];
    if (rule.rating === "excellent" || rule.rating === "good") {
      good.push({
        date: isoDate(year, month, day),
        weekday_date: formatLongDate({ year, month, day, weekday }),
        rating: rule.rating,
        reason: rule.reason,
      });
    }
  }

  const avoid = rules.days
    .map((rule, weekday) => ({ rule, weekday }))
    .filter(({ rule }) => rule.rating === "avoid")
    .map(({ rule, weekday }) => ({
      weekday: EN_WEEKDAYS[weekday],
      reason: rule.reason,
    }));

  return {
    month: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
    purpose,
    purpose_label: rules.label,
    auspicious_dates: good,
    days_to_avoid: avoid,
    method_note:
      "Ranked by day-of-week principles from Thai astrology (each day's ruling planet and the classical prohibitions), not a personalised auspicious-time computation from the lunar calendar. For an important event, consider having an astrologer cast a specific auspicious time as well.",
    disclaimer:
      "Based on basic Thai astrological principles, as planning guidance — not a guarantee of outcomes.",
  };
}
