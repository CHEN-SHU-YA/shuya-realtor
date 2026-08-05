import { intentLabel, urgencyLabel } from "@/lib/booking";

export type LeadGrade = {
  heat: "high" | "mid" | "low";
  suggestion: string;
  summary: string;
  nextAction: string;
};

// 由具體到概括排序：find() 會回傳第一個命中，先比對到細區才不會被「屏東」蓋過去
const AREA_KEYWORDS = [
  "屏東市",
  "崇蘭",
  "公館",
  "九如",
  "長治",
  "內埔",
  "潮州",
  "高樹",
  "鹽埔",
  "屏東",
  "鳳山",
  "高雄"
];

export function gradeLead(intent: string[], urgency: string | null, note: string): LeadGrade {
  let score = 0;
  if (intent.includes("buy")) score += 3;
  if (intent.includes("sell")) score += 3;
  if (intent.includes("asset")) score += 2;
  if (intent.includes("tax")) score += 1;
  if (intent.includes("reno")) score += 1;
  if (urgency === "asap") score += 2;
  if (urgency === "soon") score += 1;
  if (/急|盡快|這個月|現金|週轉|出售|想賣|換屋|實拿|節稅/.test(note)) score += 1;

  const heat: LeadGrade["heat"] = score >= 4 ? "high" : score >= 2 ? "mid" : "low";
  const area = AREA_KEYWORDS.find((keyword) => note.includes(keyword));
  const intentText = intent.length ? intent.map(intentLabel).join("、") : "一般諮詢";
  const urgencyText = urgencyLabel(urgency);

  return {
    heat,
    suggestion:
      heat === "high"
        ? `${intentText}且時程明確，建議優先聯絡並準備行情。`
        : heat === "mid"
          ? `${intentText}需求已成形，先補齊預算、區域與決策時間。`
          : `${intentText}仍在前期，先提供精簡資訊並設定追蹤日。`,
    summary: `${area ? `${area}，` : ""}${intentText}，${urgencyText}。${note.slice(0, 90)}`,
    nextAction:
      heat === "high"
        ? "24 小時內聯絡，先確認底線、時間壓力與決策者。"
        : heat === "mid"
          ? "預約前整理三個選項，通話時確認優先順序。"
          : "提供一頁式資料，七天後安排一次簡短追蹤。"
  };
}
