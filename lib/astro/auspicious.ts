/**
 * get_auspicious_dates — day-of-week auspiciousness per purpose, following
 * basic traditional Thai principles (สีประจำวัน/กำลังวัน and the classical
 * prohibition rhyme: เผาผีวันศุกร์ โกนจุกวันอังคาร แต่งงานวันพุธ ขึ้นบ้านใหม่วันเสาร์).
 *
 * This is intentionally a simplified day-of-week system, not a full ฤกษ์
 * computation from the lunar calendar — the tool result says so explicitly.
 */

import { daysInMonth, formatThaiDate, isoDate } from "../dates";

export type Purpose = "wedding" | "business" | "moving" | "car";

export type DayRating = "excellent" | "good" | "neutral" | "avoid";

interface PurposeRules {
  th: string;
  en: string;
  /** Rating and short reason per weekday, indexed 0=Sunday…6=Saturday. */
  days: ReadonlyArray<{ rating: DayRating; reason_th: string }>;
}

export const PURPOSE_RULES: Record<Purpose, PurposeRules> = {
  wedding: {
    th: "งานมงคลสมรส",
    en: "wedding",
    days: [
      { rating: "neutral", reason_th: "วันอาทิตย์เป็นวันกลาง ๆ สำหรับงานมงคลสมรส" },
      { rating: "good", reason_th: "วันจันทร์เด่นเรื่องความอ่อนโยน ร่มเย็น เหมาะแก่การเริ่มต้นชีวิตคู่" },
      { rating: "avoid", reason_th: "วันอังคารเป็นวันแรง (ดาวอังคาร) โบราณเลี่ยงสำหรับงานสมรส" },
      { rating: "avoid", reason_th: "โบราณห้ามแต่งงานวันพุธ ตามคำโบราณ \"ห้ามแต่งงานวันพุธ\"" },
      { rating: "good", reason_th: "วันพฤหัสบดีเป็นวันครู ความเจริญมั่นคง เหมาะแก่พิธีมงคล" },
      { rating: "excellent", reason_th: "วันศุกร์เป็นวันดาวศุกร์ ดาวแห่งความรักและความสุข ถือเป็นวันมงคลสมรสที่สุด" },
      { rating: "avoid", reason_th: "วันเสาร์เป็นวันแข็ง (ดาวเสาร์) โบราณเลี่ยงงานมงคลสมรส" },
    ],
  },
  business: {
    th: "เปิดกิจการ/เริ่มธุรกิจ",
    en: "opening a business",
    days: [
      { rating: "good", reason_th: "วันอาทิตย์เด่นเรื่องอำนาจ ชื่อเสียง เหมาะแก่การเปิดตัวให้เป็นที่รู้จัก" },
      { rating: "good", reason_th: "วันจันทร์เด่นเรื่องเสน่ห์เมตตามหานิยม ลูกค้าเอ็นดู" },
      { rating: "avoid", reason_th: "วันอังคารเสี่ยงความขัดแย้งและอุปสรรคตามตำราวันแรง" },
      { rating: "good", reason_th: "วันพุธเป็นวันดาวพุธ ดาวแห่งการค้าขาย การสื่อสาร และการเจรจา" },
      { rating: "excellent", reason_th: "วันพฤหัสบดีเป็นวันครู เด่นเรื่องความเจริญรุ่งเรืองและความมั่นคงของกิจการ" },
      { rating: "excellent", reason_th: "วันศุกร์เด่นเรื่องโชคลาภและการเงิน เหมาะแก่การเริ่มกิจการ" },
      { rating: "avoid", reason_th: "วันเสาร์เป็นวันแข็ง เสี่ยงอุปสรรคและความล่าช้า" },
    ],
  },
  moving: {
    th: "ขึ้นบ้านใหม่/ย้ายที่อยู่",
    en: "moving house",
    days: [
      { rating: "neutral", reason_th: "วันอาทิตย์เป็นวันกลาง ๆ สำหรับการย้ายเข้าอยู่" },
      { rating: "good", reason_th: "วันจันทร์เด่นเรื่องความร่มเย็นเป็นสุขของครัวเรือน" },
      { rating: "avoid", reason_th: "วันอังคารเป็นวันร้อนแรง โบราณเลี่ยงการเข้าอยู่บ้านใหม่" },
      { rating: "good", reason_th: "วันพุธเอื้อต่อการโยกย้ายเดินทางราบรื่น" },
      { rating: "excellent", reason_th: "วันพฤหัสบดีเป็นวันมงคลเรื่องความเจริญรุ่งเรืองของถิ่นฐาน" },
      { rating: "excellent", reason_th: "วันศุกร์เด่นเรื่องความสุขสมบูรณ์และโชคลาภในบ้าน" },
      { rating: "avoid", reason_th: "โบราณห้ามขึ้นบ้านใหม่วันเสาร์ ตามคำโบราณ \"ขึ้นบ้านใหม่วันเสาร์\" เป็นข้อห้าม" },
    ],
  },
  car: {
    th: "ออกรถ/รับรถใหม่",
    en: "taking delivery of a car",
    days: [
      { rating: "neutral", reason_th: "วันอาทิตย์เป็นวันกลาง ๆ สำหรับการออกรถ" },
      { rating: "good", reason_th: "วันจันทร์เด่นเรื่องความร่มเย็น ใช้รถอย่างสุขสบาย" },
      { rating: "avoid", reason_th: "วันอังคารเกี่ยวพันกับของมีคมและอุบัติเหตุตามความเชื่อ จึงนิยมเลี่ยง" },
      { rating: "good", reason_th: "วันพุธเป็นดาวแห่งการเดินทางและการสื่อสาร เดินทางคล่องตัว" },
      { rating: "excellent", reason_th: "วันพฤหัสบดีเด่นเรื่องความมั่นคงปลอดภัยและความเจริญ" },
      { rating: "excellent", reason_th: "วันศุกร์เด่นเรื่องโชคลาภ นิยมออกรถเพื่อเรียกทรัพย์" },
      { rating: "avoid", reason_th: "วันเสาร์เป็นวันแข็ง เสี่ยงเรื่องร้อนแรงและอุบัติเหตุตามตำรา" },
    ],
  },
};

export interface AuspiciousDatesData {
  month: string;
  purpose: Purpose;
  purpose_th: string;
  auspicious_dates: Array<{
    date: string;
    thai_date: string;
    rating: "excellent" | "good";
    reason_th: string;
  }>;
  days_to_avoid: Array<{ weekday_th: string; reason_th: string }>;
  method_note_th: string;
  disclaimer_th: string;
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

const THAI_WEEKDAY_NAMES = [
  "วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์",
] as const;

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
        thai_date: formatThaiDate({ year, month, day, weekday }),
        rating: rule.rating,
        reason_th: rule.reason_th,
      });
    }
  }

  const avoid = rules.days
    .map((rule, weekday) => ({ rule, weekday }))
    .filter(({ rule }) => rule.rating === "avoid")
    .map(({ rule, weekday }) => ({
      weekday_th: THAI_WEEKDAY_NAMES[weekday],
      reason_th: rule.reason_th,
    }));

  return {
    month: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`,
    purpose,
    purpose_th: rules.th,
    auspicious_dates: good,
    days_to_avoid: avoid,
    method_note_th:
      "จัดอันดับตามหลักวันประจำสัปดาห์ในโหราศาสตร์ไทย (กำลังดาวประจำวันและข้อห้ามตามคำโบราณ) ไม่ใช่การผูกฤกษ์รายบุคคลจากปฏิทินจันทรคติ หากเป็นงานสำคัญควรให้โหรผูกฤกษ์เฉพาะเจาะจงอีกครั้ง",
    disclaimer_th:
      "ข้อมูลตามหลักโหราศาสตร์ไทยเบื้องต้น เพื่อประกอบการวางแผน ไม่ใช่คำรับรองผลลัพธ์",
  };
}
