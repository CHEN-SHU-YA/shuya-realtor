/**
 * 預約單的存放。
 *
 * ── 兩種後端，同一組函式 ──
 *
 *   有設 DATABASE_URL → 存 Postgres（正式站一定要走這條，Vercel 檔案系統唯讀）
 *   沒設              → 存 data/appointments.json（本機開發、教學用）
 *
 * 對外的七個函式簽名完全沒變，所以呼叫它的頁面與 API 一行都不用改。
 * 換後端這種事應該只有這支檔案知道 —— 讓每個呼叫端各自判斷「現在是哪種模式」，
 * 遲早會有一個地方漏判，而漏判的症狀是「上線後某個功能安靜地不動」。
 */
import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ensureSchema, getSql, hasDatabase, isUniqueViolation } from "@/lib/db";

const DATA_DIR = path.join(process.cwd(), "data");
const DATABASE_FILE = path.join(DATA_DIR, "appointments.json");
const SEED_FILE = path.join(DATA_DIR, "appointments.seed.json");

export type AppointmentStatus = "confirmed" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  name: string;
  phone: string;
  email: string;
  meetType: string;
  intent: string[];
  urgency: string | null;
  note: string;
  slotIso: string;
  status: AppointmentStatus;
  aiHeat: "high" | "mid" | "low";
  aiSuggestion: string;
  aiSummary: string;
  aiNextAction: string;
  previewFile: string | null;
  createdAt: string;
};

export class SlotConflictError extends Error {
  constructor() {
    super("這個時段剛剛被預約，請重新選擇。");
    this.name = "SlotConflictError";
  }
}

type CreateAppointmentInput = Omit<Appointment, "id" | "status" | "previewFile" | "createdAt">;

/* ════════════════════════ 檔案模式（本機） ════════════════════════ */

let writeQueue: Promise<unknown> = Promise.resolve();

/** 檔案模式才需要排隊：同一支程式裡兩個請求同時改同一個檔，後寫的會蓋掉先寫的 */
function withLock<T>(operation: () => Promise<T>) {
  const run = writeQueue.then(operation, operation);
  writeQueue = run.catch(() => undefined);
  return run;
}

async function readJson(file: string): Promise<Appointment[]> {
  let raw = await fs.readFile(file, "utf8");
  // 記事本存檔會在開頭加 BOM，JSON.parse 會直接爆掉，而錯誤訊息看不出是編碼問題
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as Appointment[]) : [];
}

async function readFileRows(): Promise<Appointment[]> {
  try {
    return await readJson(DATABASE_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return readJson(SEED_FILE);
  }
}

async function writeFileRows(rows: Appointment[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporary = `${DATABASE_FILE}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  await fs.rename(temporary, DATABASE_FILE);
}

/* ════════════════════════ 資料庫模式（正式站） ════════════════════════ */

/** 資料庫欄位是 snake_case、程式裡是 camelCase，轉換只在這裡做一次 */
function toAppointment(row: Record<string, unknown>): Appointment {
  const text = (value: unknown, fallback = "") =>
    value === null || value === undefined ? fallback : String(value);
  return {
    id: text(row.id),
    name: text(row.name),
    phone: text(row.phone),
    email: text(row.email),
    meetType: text(row.meet_type),
    intent: Array.isArray(row.intent) ? row.intent.map((item) => String(item)) : [],
    urgency: row.urgency === null || row.urgency === undefined ? null : String(row.urgency),
    note: text(row.note),
    slotIso: text(row.slot_iso),
    status: text(row.status, "confirmed") as AppointmentStatus,
    aiHeat: text(row.ai_heat, "low") as Appointment["aiHeat"],
    aiSuggestion: text(row.ai_suggestion),
    aiSummary: text(row.ai_summary),
    aiNextAction: text(row.ai_next_action),
    previewFile: row.preview_file === null || row.preview_file === undefined ? null : String(row.preview_file),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : text(row.created_at)
  };
}

/* ════════════════════════ 對外的七個函式 ════════════════════════ */

export async function readAppointments(): Promise<Appointment[]> {
  if (!hasDatabase) return readFileRows();
  await ensureSchema();
  const rows = await getSql()`select * from appointments order by created_at desc`;
  return rows.map((row) => toAppointment(row as Record<string, unknown>));
}

export async function bookedSlots() {
  if (!hasDatabase) {
    const rows = await readFileRows();
    return new Set(rows.filter((row) => row.status === "confirmed").map((row) => row.slotIso));
  }
  await ensureSchema();
  const rows = await getSql()`select slot_iso from appointments where status = 'confirmed'`;
  return new Set(rows.map((row) => String((row as { slot_iso: unknown }).slot_iso)));
}

export async function listAppointments(status = "all") {
  if (!hasDatabase) {
    const rows = await readFileRows();
    const filtered = status === "all" ? rows : rows.filter((row) => row.status === status);
    return filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  await ensureSchema();
  const sql = getSql();
  const rows =
    status === "all"
      ? await sql`select * from appointments order by created_at desc`
      : await sql`select * from appointments where status = ${status} order by created_at desc`;
  return rows.map((row) => toAppointment(row as Record<string, unknown>));
}

export async function createAppointment(input: CreateAppointmentInput) {
  if (!hasDatabase) {
    return withLock(async () => {
      const rows = await readFileRows();
      if (rows.some((row) => row.status === "confirmed" && row.slotIso === input.slotIso)) {
        throw new SlotConflictError();
      }
      const appointment: Appointment = {
        ...input,
        id: crypto.randomUUID(),
        status: "confirmed",
        previewFile: null,
        createdAt: new Date().toISOString()
      };
      rows.push(appointment);
      await writeFileRows(rows);
      return appointment;
    });
  }

  await ensureSchema();
  /**
   * 🔴 這裡**不先查再寫**，直接寫、撞到唯一索引才判定衝突。
   *
   * 「先查有沒有人訂，沒有才寫」在 Vercel 上是錯的：
   * 兩個客戶同一秒送出會落在兩個不同的執行環境，兩邊都查到空的、兩邊都寫成功。
   * 讓資料庫當唯一的裁判，才不會出現同一個時段兩組客戶。
   */
  try {
    const rows = await getSql()`
      insert into appointments
        (id, name, phone, email, meet_type, intent, urgency, note, slot_iso,
         status, ai_heat, ai_suggestion, ai_summary, ai_next_action)
      values
        (${crypto.randomUUID()}, ${input.name}, ${input.phone}, ${input.email}, ${input.meetType},
         ${input.intent}::text[], ${input.urgency}, ${input.note}, ${input.slotIso},
         'confirmed', ${input.aiHeat}, ${input.aiSuggestion}, ${input.aiSummary}, ${input.aiNextAction})
      returning *
    `;
    return toAppointment(rows[0] as Record<string, unknown>);
  } catch (error) {
    if (isUniqueViolation(error)) throw new SlotConflictError();
    throw error;
  }
}

export async function attachPreview(id: string, previewFile: string) {
  if (!hasDatabase) {
    return withLock(async () => {
      const rows = await readFileRows();
      const appointment = rows.find((row) => row.id === id);
      if (!appointment) return;
      appointment.previewFile = previewFile;
      await writeFileRows(rows);
    });
  }
  await ensureSchema();
  await getSql()`update appointments set preview_file = ${previewFile} where id = ${id}`;
}

export async function updateAppointmentStatus(id: string, status: AppointmentStatus) {
  if (!hasDatabase) {
    return withLock(async () => {
      const rows = await readFileRows();
      const appointment = rows.find((row) => row.id === id);
      if (!appointment) return null;
      appointment.status = status;
      await writeFileRows(rows);
      return appointment;
    });
  }
  await ensureSchema();
  try {
    const rows = await getSql()`
      update appointments set status = ${status} where id = ${id} returning *
    `;
    return rows.length ? toAppointment(rows[0] as Record<string, unknown>) : null;
  } catch (error) {
    /**
     * 把「已取消」改回「已確認」時，那個時段可能已經被別人訂走了。
     * 這時要明確告訴後台的人「訂不回去」，而不是丟一個看不懂的資料庫錯誤 ——
     * 不然他會以為改成功了，然後真的去赴約。
     */
    if (isUniqueViolation(error)) throw new SlotConflictError();
    throw error;
  }
}

export async function resetDemoAppointments() {
  if (!hasDatabase) {
    return withLock(async () => {
      try {
        await fs.unlink(DATABASE_FILE);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    });
  }
  await ensureSchema();
  await getSql()`delete from appointments`;
}
