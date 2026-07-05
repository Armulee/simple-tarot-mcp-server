/** Tarot spread layouts supported by the draw_tarot_spread tool. */

export type SpreadType = "single" | "three_card" | "celtic_cross";

export interface SpreadPosition {
  /** 1-based position number within the spread. */
  index: number;
  key: string;
  label_th: string;
  label_en: string;
  /** What this position represents, for interpretation. */
  meaning: string;
}

export interface SpreadDefinition {
  type: SpreadType;
  name_th: string;
  name_en: string;
  positions: ReadonlyArray<SpreadPosition>;
}

export const SPREADS: Record<SpreadType, SpreadDefinition> = {
  single: {
    type: "single",
    name_th: "ไพ่ใบเดียว",
    name_en: "Single Card",
    positions: [
      {
        index: 1,
        key: "answer",
        label_th: "คำตอบ",
        label_en: "The Answer",
        meaning: "Direct guidance on the question asked",
      },
    ],
  },
  three_card: {
    type: "three_card",
    name_th: "ไพ่สามใบ (อดีต–ปัจจุบัน–อนาคต)",
    name_en: "Three Cards (Past–Present–Future)",
    positions: [
      {
        index: 1,
        key: "past",
        label_th: "อดีต",
        label_en: "Past",
        meaning: "Influences from the past that shaped the situation",
      },
      {
        index: 2,
        key: "present",
        label_th: "ปัจจุบัน",
        label_en: "Present",
        meaning: "The current state of the situation",
      },
      {
        index: 3,
        key: "future",
        label_th: "อนาคต",
        label_en: "Future",
        meaning: "The likely direction if things continue on this path",
      },
    ],
  },
  celtic_cross: {
    type: "celtic_cross",
    name_th: "เซลติกครอส (10 ใบ)",
    name_en: "Celtic Cross (10 cards)",
    positions: [
      { index: 1, key: "present", label_th: "สถานการณ์ปัจจุบัน", label_en: "Present", meaning: "The heart of the matter right now" },
      { index: 2, key: "challenge", label_th: "อุปสรรค", label_en: "Challenge", meaning: "The immediate obstacle crossing the querent" },
      { index: 3, key: "foundation", label_th: "รากฐาน", label_en: "Foundation", meaning: "The root cause beneath the situation" },
      { index: 4, key: "recent_past", label_th: "อดีตที่ผ่านมา", label_en: "Recent Past", meaning: "What is passing out of influence" },
      { index: 5, key: "crown", label_th: "เป้าหมาย/สิ่งที่อาจเกิด", label_en: "Crown", meaning: "The best outcome that can be aimed for" },
      { index: 6, key: "near_future", label_th: "อนาคตอันใกล้", label_en: "Near Future", meaning: "What is coming into influence soon" },
      { index: 7, key: "self", label_th: "ตัวตน/ท่าทีของผู้ถาม", label_en: "Self", meaning: "The querent's own attitude and stance" },
      { index: 8, key: "environment", label_th: "คนรอบข้าง/สิ่งแวดล้อม", label_en: "Environment", meaning: "External influences and people around" },
      { index: 9, key: "hopes_fears", label_th: "ความหวังและความกลัว", label_en: "Hopes & Fears", meaning: "The querent's inner hopes and anxieties" },
      { index: 10, key: "outcome", label_th: "บทสรุป", label_en: "Outcome", meaning: "The synthesis — where it all leads" },
    ],
  },
};
