export const BOOKING_RULES = {
  startHour: 10,
  endHour: 18,
  slotMinutes: 60,
  workDays: [1, 2, 3, 4, 5],
  leadHours: 2,
  daysAhead: 14
} as const;

export const INTENTS = [
  { key: "buy", label: "買房", hint: "預算、區域、房型" },
  { key: "sell", label: "賣房", hint: "屋況、期望售價、時間" },
  { key: "asset", label: "資產配置規劃", hint: "自住、置產或收租" },
  { key: "tax", label: "稅務／節稅諮詢", hint: "房地合一、土增稅、實拿試算" },
  { key: "reno", label: "簡易裝潢", hint: "售前修繕與屋況整理" },
  { key: "other", label: "其他", hint: "簡單描述需求" }
] as const;

export const URGENCIES = [
  { key: "asap", label: "這個月內" },
  { key: "soon", label: "1 至 3 個月" },
  { key: "explore", label: "先了解" }
] as const;

export const MEET_TYPES = [
  { key: "office", label: "門市面談", description: "屏東市華盛街 5-5 號" },
  { key: "phone", label: "電話聯繫", description: "由書亞主動致電" },
  { key: "video", label: "線上視訊", description: "Google Meet 或 LINE 視訊" }
] as const;

export const INTENT_KEYS = INTENTS.map((item) => item.key) as readonly string[];
export const URGENCY_KEYS = URGENCIES.map((item) => item.key) as readonly string[];
export const MEET_TYPE_KEYS = MEET_TYPES.map((item) => item.key) as readonly string[];

export function intentLabel(key: string) {
  return INTENTS.find((item) => item.key === key)?.label ?? key;
}

export function urgencyLabel(key: string | null) {
  return URGENCIES.find((item) => item.key === key)?.label ?? "未填";
}

export function meetTypeLabel(key: string) {
  return MEET_TYPES.find((item) => item.key === key)?.label ?? key;
}

const TAIPEI_OFFSET = 8 * 60 * 60 * 1000;

export function formatSlotTaipei(value: string | Date) {
  const source = value instanceof Date ? value : new Date(value);
  const local = new Date(source.getTime() + TAIPEI_OFFSET);
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const year = local.getUTCFullYear();
  const month = String(local.getUTCMonth() + 1).padStart(2, "0");
  const date = String(local.getUTCDate()).padStart(2, "0");
  const hour = local.getUTCHours();
  const minute = String(local.getUTCMinutes()).padStart(2, "0");
  const end = new Date(local.getTime() + BOOKING_RULES.slotMinutes * 60_000);
  return `${year}/${month}/${date}（週${weekdays[local.getUTCDay()]}）${String(hour).padStart(2, "0")}:${minute}–${String(end.getUTCHours()).padStart(2, "0")}:${String(end.getUTCMinutes()).padStart(2, "0")}`;
}

export type OpenSlot = { iso: string; label: string };
export type OpenDay = { date: string; label: string; slots: OpenSlot[] };

export function generateOpenSlots(now: Date, booked: Set<string>): OpenDay[] {
  const result: OpenDay[] = [];
  const earliest = now.getTime() + BOOKING_RULES.leadHours * 60 * 60 * 1000;
  const taipeiNow = new Date(now.getTime() + TAIPEI_OFFSET);
  const year = taipeiNow.getUTCFullYear();
  const month = taipeiNow.getUTCMonth();
  const date = taipeiNow.getUTCDate();
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];

  for (let offset = 0; offset <= BOOKING_RULES.daysAhead; offset += 1) {
    const localDay = new Date(Date.UTC(year, month, date + offset));
    const weekday = localDay.getUTCDay();
    if (!(BOOKING_RULES.workDays as readonly number[]).includes(weekday)) continue;

    const slots: OpenSlot[] = [];
    for (let hour = BOOKING_RULES.startHour; hour < BOOKING_RULES.endHour; hour += 1) {
      const utc = new Date(Date.UTC(
        localDay.getUTCFullYear(),
        localDay.getUTCMonth(),
        localDay.getUTCDate(),
        hour - 8
      ));
      if (utc.getTime() < earliest || booked.has(utc.toISOString())) continue;
      slots.push({
        iso: utc.toISOString(),
        label: `${String(hour).padStart(2, "0")}:00–${String(hour + 1).padStart(2, "0")}:00`
      });
    }

    if (slots.length) {
      result.push({
        date: `${localDay.getUTCFullYear()}-${String(localDay.getUTCMonth() + 1).padStart(2, "0")}-${String(localDay.getUTCDate()).padStart(2, "0")}`,
        label: `${localDay.getUTCMonth() + 1}/${localDay.getUTCDate()} 週${weekdays[weekday]}`,
        slots
      });
    }
  }

  return result;
}

export function isValidSlot(slotIso: string) {
  const slot = new Date(slotIso);
  if (Number.isNaN(slot.getTime())) return false;
  if (slot.getTime() < Date.now() + BOOKING_RULES.leadHours * 60 * 60 * 1000) return false;
  if (slot.getTime() > Date.now() + (BOOKING_RULES.daysAhead + 1) * 86_400_000) return false;
  if (slot.getUTCMinutes() !== 0 || slot.getUTCSeconds() !== 0) return false;

  const taipei = new Date(slot.getTime() + TAIPEI_OFFSET);
  const hour = taipei.getUTCHours();
  const weekday = taipei.getUTCDay();
  return (
    hour >= BOOKING_RULES.startHour &&
    hour < BOOKING_RULES.endHour &&
    (BOOKING_RULES.workDays as readonly number[]).includes(weekday)
  );
}
