/** Tarot spread layouts supported by the draw_tarot_spread tool. */

export type SpreadType = "single" | "three_card" | "celtic_cross";

export interface SpreadPosition {
  /** 1-based position number within the spread. */
  index: number;
  key: string;
  label: string;
  /** What this position represents, for interpretation. */
  meaning: string;
}

export interface SpreadDefinition {
  type: SpreadType;
  name: string;
  positions: ReadonlyArray<SpreadPosition>;
}

export const SPREADS: Record<SpreadType, SpreadDefinition> = {
  single: {
    type: "single",
    name: "Single Card",
    positions: [
      {
        index: 1,
        key: "answer",
        label: "The Answer",
        meaning: "Direct guidance on the question asked",
      },
    ],
  },
  three_card: {
    type: "three_card",
    name: "Three Cards (Past–Present–Future)",
    positions: [
      {
        index: 1,
        key: "past",
        label: "Past",
        meaning: "Influences from the past that shaped the situation",
      },
      {
        index: 2,
        key: "present",
        label: "Present",
        meaning: "The current state of the situation",
      },
      {
        index: 3,
        key: "future",
        label: "Future",
        meaning: "The likely direction if things continue on this path",
      },
    ],
  },
  celtic_cross: {
    type: "celtic_cross",
    name: "Celtic Cross (10 cards)",
    positions: [
      { index: 1, key: "present", label: "Present", meaning: "The heart of the matter right now" },
      { index: 2, key: "challenge", label: "Challenge", meaning: "The immediate obstacle crossing the querent" },
      { index: 3, key: "foundation", label: "Foundation", meaning: "The root cause beneath the situation" },
      { index: 4, key: "recent_past", label: "Recent Past", meaning: "What is passing out of influence" },
      { index: 5, key: "crown", label: "Crown", meaning: "The best outcome that can be aimed for" },
      { index: 6, key: "near_future", label: "Near Future", meaning: "What is coming into influence soon" },
      { index: 7, key: "self", label: "Self", meaning: "The querent's own attitude and stance" },
      { index: 8, key: "environment", label: "Environment", meaning: "External influences and people around" },
      { index: 9, key: "hopes_fears", label: "Hopes & Fears", meaning: "The querent's inner hopes and anxieties" },
      { index: 10, key: "outcome", label: "Outcome", meaning: "The synthesis — where it all leads" },
    ],
  },
};
