/**
 * Traditional Thai birth-day astrology tables (โหราศาสตร์ไทย ตำราทักษา).
 *
 * The eight "day planets" (พระเคราะห์) follow the classical Thaksa circle:
 * อาทิตย์ → จันทร์ → อังคาร → พุธ(กลางวัน) → เสาร์ → พฤหัสบดี → ราหู(พุธกลางคืน) → ศุกร์.
 * Elements follow the classical grouping ไฟ:๑,๗ / ดิน:๒,๕ / ลม:๓,๘ / น้ำ:๔,๖.
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
  day_th: string;
  day_en: string;
  planet_th: string;
  planet_en: string;
  /** Traditional planet number (ดาวอาทิตย์=๑ … ราหู=๘). */
  number: number;
  element_th: "ไฟ" | "ดิน" | "ลม" | "น้ำ";
  element_en: "fire" | "earth" | "wind" | "water";
  /** Traditional colour of the day (สีประจำวัน). */
  color_th: string;
  color_en: string;
  /** Classical personality keywords for people born on this day (ตามตำราพื้นดวงโบราณ). */
  traits_th: ReadonlyArray<string>;
}

/** Ordered per the Thaksa circle — order matters for computing the eight positions. */
export const TAKSA_CIRCLE: ReadonlyArray<DayPlanet> = [
  {
    key: "sunday",
    day_th: "วันอาทิตย์",
    day_en: "Sunday",
    planet_th: "พระอาทิตย์",
    planet_en: "Sun",
    number: 1,
    element_th: "ไฟ",
    element_en: "fire",
    color_th: "สีแดง",
    color_en: "red",
    traits_th: ["ใจกล้า", "รักเกียรติ", "เป็นผู้นำ", "จริงจัง", "ทะเยอทะยาน"],
  },
  {
    key: "monday",
    day_th: "วันจันทร์",
    day_en: "Monday",
    planet_th: "พระจันทร์",
    planet_en: "Moon",
    number: 2,
    element_th: "ดิน",
    element_en: "earth",
    color_th: "สีเหลืองนวล",
    color_en: "pale yellow / cream",
    traits_th: ["อ่อนโยน", "ละเอียดอ่อน", "ช่างฝัน", "เจ้าระเบียบ", "มีเสน่ห์"],
  },
  {
    key: "tuesday",
    day_th: "วันอังคาร",
    day_en: "Tuesday",
    planet_th: "พระอังคาร",
    planet_en: "Mars",
    number: 3,
    element_th: "ลม",
    element_en: "wind",
    color_th: "สีชมพู",
    color_en: "pink",
    traits_th: ["กล้าหาญ", "ใจร้อน", "ขยันขันแข็ง", "มุ่งมั่น", "ไม่ยอมคน"],
  },
  {
    key: "wednesday_day",
    day_th: "วันพุธ (กลางวัน)",
    day_en: "Wednesday (daytime)",
    planet_th: "พระพุธ",
    planet_en: "Mercury",
    number: 4,
    element_th: "น้ำ",
    element_en: "water",
    color_th: "สีเขียว",
    color_en: "green",
    traits_th: ["ช่างเจรจา", "ปรับตัวเก่ง", "ฉลาดหลักแหลม", "รักการค้าขาย", "ใจกว้าง"],
  },
  {
    key: "saturday",
    day_th: "วันเสาร์",
    day_en: "Saturday",
    planet_th: "พระเสาร์",
    planet_en: "Saturn",
    number: 7,
    element_th: "ไฟ",
    element_en: "fire",
    color_th: "สีม่วง",
    color_en: "purple",
    traits_th: ["อดทน", "หนักแน่น", "เก็บความรู้สึกเก่ง", "จริงจังกับชีวิต", "พึ่งพาตนเอง"],
  },
  {
    key: "thursday",
    day_th: "วันพฤหัสบดี",
    day_en: "Thursday",
    planet_th: "พระพฤหัสบดี",
    planet_en: "Jupiter",
    number: 5,
    element_th: "ดิน",
    element_en: "earth",
    color_th: "สีส้ม/แสด",
    color_en: "orange",
    traits_th: ["ใฝ่รู้", "มีคุณธรรม", "เป็นที่พึ่งของผู้อื่น", "รักความก้าวหน้า", "ใจบุญ"],
  },
  {
    key: "wednesday_night",
    day_th: "วันพุธ (กลางคืน) — วันราหู",
    day_en: "Wednesday (night) — Rahu",
    planet_th: "พระราหู",
    planet_en: "Rahu",
    number: 8,
    element_th: "ลม",
    element_en: "wind",
    color_th: "สีเทาเข้ม/สีเมฆหมอก",
    color_en: "dark grey / smoky",
    traits_th: ["เด็ดเดี่ยว", "ลึกลับ", "ไหวพริบดี", "ชีวิตพลิกผันได้มาก", "ไม่กลัวการเปลี่ยนแปลง"],
  },
  {
    key: "friday",
    day_th: "วันศุกร์",
    day_en: "Friday",
    planet_th: "พระศุกร์",
    planet_en: "Venus",
    number: 6,
    element_th: "น้ำ",
    element_en: "water",
    color_th: "สีฟ้า/น้ำเงิน",
    color_en: "blue",
    traits_th: ["รักสวยรักงาม", "มีศิลปะในหัวใจ", "รักสนุก", "โรแมนติก", "เข้ากับคนง่าย"],
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
  name_th: string;
  name_en: string;
  meaning_th: string;
  meaning_en: string;
}

/** The eight Thaksa positions, in order starting from the birth day itself. */
export const TAKSA_POSITIONS: ReadonlyArray<TaksaPositionDef> = [
  { key: "boriwan", name_th: "บริวาร", name_en: "Boriwan", meaning_th: "ครอบครัว บุตร บริวาร ผู้ใต้บังคับบัญชา", meaning_en: "family, children, subordinates and followers" },
  { key: "ayu", name_th: "อายุ", name_en: "Ayu", meaning_th: "สุขภาพ อายุ ความเป็นอยู่", meaning_en: "health, longevity and wellbeing" },
  { key: "det", name_th: "เดช", name_en: "Det", meaning_th: "อำนาจ เกียรติยศ ตำแหน่งหน้าที่การงาน", meaning_en: "power, honour and career authority" },
  { key: "si", name_th: "ศรี", name_en: "Si", meaning_th: "โชคลาภ เสน่ห์ ความรัก สิริมงคล", meaning_en: "fortune, charm, love and auspiciousness" },
  { key: "mula", name_th: "มูละ", name_en: "Mula", meaning_th: "ทรัพย์สิน เงินทอง มรดก ฐานะ", meaning_en: "wealth, money, inheritance and material standing" },
  { key: "utsaha", name_th: "อุตสาหะ", name_en: "Utsaha", meaning_th: "ความขยันหมั่นเพียร ความสำเร็จจากความพยายาม", meaning_en: "diligence and success earned through effort" },
  { key: "montri", name_th: "มนตรี", name_en: "Montri", meaning_th: "ผู้อุปถัมภ์ ผู้ใหญ่ให้การสนับสนุน", meaning_en: "patrons and support from seniors" },
  { key: "kalakini", name_th: "กาลกิณี", name_en: "Kalakini", meaning_th: "อัปมงคล อุปสรรค สิ่งที่ควรหลีกเลี่ยง", meaning_en: "misfortune and things to avoid" },
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
