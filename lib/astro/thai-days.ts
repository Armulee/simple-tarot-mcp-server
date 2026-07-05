/**
 * Traditional Thai birth-day astrology tables (the Thaksa system).
 *
 * The eight "day planets" follow the classical Thaksa circle:
 * Sun → Moon → Mars → Mercury (Wednesday day) → Saturn → Jupiter →
 * Rahu (Wednesday night) → Venus.
 * Elements follow the classical grouping fire:1,7 / earth:2,5 / wind:3,8 / water:4,6.
 */

export type DayKey =
  | "sunday"
  | "monday"
  | "tuesday"
  | "wednesday_day"
  | "saturday"
  | "thursday"
  | "wednesday_night"
  | "friday";

export interface DayPlanet {
  key: DayKey;
  day: string;
  planet: string;
  /** Traditional planet number (Sun=1 … Rahu=8). */
  number: number;
  element: "fire" | "earth" | "wind" | "water";
  /** Traditional colour of the day. */
  color: string;
  /** Classical personality keywords for people born on this day, per the traditional birth-chart texts. */
  traits: ReadonlyArray<string>;
}

/** Ordered per the Thaksa circle — order matters for computing the eight positions. */
export const TAKSA_CIRCLE: ReadonlyArray<DayPlanet> = [
  {
    key: "sunday",
    day: "Sunday",
    planet: "Sun",
    number: 1,
    element: "fire",
    color: "red",
    traits: ["brave-hearted", "honour-loving", "a born leader", "serious-minded", "ambitious"],
  },
  {
    key: "monday",
    day: "Monday",
    planet: "Moon",
    number: 2,
    element: "earth",
    color: "pale yellow / cream",
    traits: ["gentle", "sensitive", "dreamy", "orderly", "charming"],
  },
  {
    key: "tuesday",
    day: "Tuesday",
    planet: "Mars",
    number: 3,
    element: "wind",
    color: "pink",
    traits: ["courageous", "hot-tempered", "hard-working", "determined", "unyielding"],
  },
  {
    key: "wednesday_day",
    day: "Wednesday (daytime)",
    planet: "Mercury",
    number: 4,
    element: "water",
    color: "green",
    traits: ["a gifted talker", "adaptable", "sharp-witted", "business-minded", "open-handed"],
  },
  {
    key: "saturday",
    day: "Saturday",
    planet: "Saturn",
    number: 7,
    element: "fire",
    color: "purple",
    traits: ["patient", "steadfast", "reserved with feelings", "serious about life", "self-reliant"],
  },
  {
    key: "thursday",
    day: "Thursday",
    planet: "Jupiter",
    number: 5,
    element: "earth",
    color: "orange",
    traits: ["knowledge-seeking", "principled", "a pillar for others", "progress-driven", "charitable"],
  },
  {
    key: "wednesday_night",
    day: "Wednesday (night) — Rahu",
    planet: "Rahu",
    number: 8,
    element: "wind",
    color: "dark grey / smoky",
    traits: ["resolute", "enigmatic", "quick-witted", "a life of dramatic turns", "unafraid of change"],
  },
  {
    key: "friday",
    day: "Friday",
    planet: "Venus",
    number: 6,
    element: "water",
    color: "blue",
    traits: ["beauty-loving", "artistic at heart", "fun-loving", "romantic", "sociable"],
  },
];

/** Map JS weekday (0=Sunday) to the daytime planet of that day. */
export const WEEKDAY_TO_DAY_KEY: ReadonlyArray<DayKey> = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday_day",
  "thursday",
  "friday",
  "saturday",
];

export function dayPlanet(key: DayKey): DayPlanet {
  const found = TAKSA_CIRCLE.find((d) => d.key === key);
  if (!found) throw new Error(`unknown day key: ${key}`);
  return found;
}

export interface TaksaPositionDef {
  key: string;
  name: string;
  meaning: string;
}

/** The eight Thaksa positions, in order starting from the birth day itself. */
export const TAKSA_POSITIONS: ReadonlyArray<TaksaPositionDef> = [
  { key: "boriwan", name: "Boriwan", meaning: "family, children, subordinates and followers" },
  { key: "ayu", name: "Ayu", meaning: "health, longevity and wellbeing" },
  { key: "det", name: "Det", meaning: "power, honour and career authority" },
  { key: "si", name: "Si", meaning: "fortune, charm, love and auspiciousness" },
  { key: "mula", name: "Mula", meaning: "wealth, money, inheritance and material standing" },
  { key: "utsaha", name: "Utsaha", meaning: "diligence and success earned through effort" },
  { key: "montri", name: "Montri", meaning: "patrons and support from seniors" },
  { key: "kalakini", name: "Kalakini", meaning: "misfortune and things to avoid" },
];

export interface TaksaPosition extends TaksaPositionDef {
  planet: DayPlanet;
}

/** Compute the eight Thaksa positions for a birth day, walking the circle from that day. */
export function computeTaksa(birthDay: DayKey): TaksaPosition[] {
  const start = TAKSA_CIRCLE.findIndex((d) => d.key === birthDay);
  return TAKSA_POSITIONS.map((pos, offset) => ({
    ...pos,
    planet: TAKSA_CIRCLE[(start + offset) % TAKSA_CIRCLE.length],
  }));
}
