/**
 * Postgres 連線（Vercel 內建的 Neon）
 *
 * ── 為什麼一定要換掉「寫檔案」 ──
 *
 * 官網跑在 Vercel 上，那裡的檔案系統是**唯讀**的。
 * 原本的預約單寫進 `data/appointments.json`，在本機好好的，上線卻一筆都存不進去 ——
 * 客戶按了送出、看到「請直接打電話給我」，然後就走了。這是實際在漏客戶的洞。
 *
 * ── 為什麼用 @neondatabase/serverless 而不是一般的 pg ──
 *
 * Vercel 每個請求可能是一個全新的執行環境。用傳統 TCP 連線的 `pg`，
 * 每次都要重新握手，尖峰時還會把資料庫的連線數吃光。
 * Neon 這支走 HTTP，天生適合這種「開一下就關」的環境。
 *
 * ── 沒設資料庫也不會壞 ──
 *
 * `DATABASE_URL` 沒設時 `hasDatabase` 是 false，預約單會退回原本的寫檔案模式，
 * 本機開發完全不受影響。**刻意不在這裡丟錯誤** —— 只是想改個首頁文字的人，
 * 不應該先被逼著去申請一個資料庫。
 */
import { neon } from "@neondatabase/serverless";

/**
 * Vercel 建 Postgres 時會注入好幾個名字（DATABASE_URL、POSTGRES_URL、
 * 還有帶連線池的 _POOLED 版本）。這裡照優先順序找，任何一個有值就能跑，
 * 免得因為「名字不一樣」白卡半小時。
 */
const CONNECTION =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  "";

export const hasDatabase = Boolean(CONNECTION);

const client = hasDatabase ? neon(CONNECTION) : null;

export function getSql() {
  if (!client) {
    throw new Error("沒有設定 DATABASE_URL，這個功能需要資料庫。");
  }
  return client;
}

/**
 * 建表。每個執行環境跑一次就好，所以用一個 Promise 記住結果。
 *
 * ⚠️ 這裡用模組層級的變數是**安全的**，跟「用模組層級 Map 追蹤背景工作」那個坑不一樣：
 * 那個坑的問題是「另一份模組看不到這一份開的工作」→ 誤判成中斷。
 * 這裡最壞的情況只是同一段 `create table if not exists` 多跑一次 —— 完全冪等，沒有副作用。
 */
let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) schemaReady = createSchema();
  return schemaReady;
}

async function createSchema() {
  const sql = getSql();

  /**
   * slot_iso 刻意存 **text** 不是 timestamptz。
   *
   * 時段字串是 lib/booking.ts 產生的，前端拿它比對「這個時段被訂走了沒」。
   * 存成 timestamptz 會被資料庫正規化（時區改寫、精度調整），
   * 撈回來的字串就跟前端手上那串不一樣了 —— 於是已經被訂走的時段
   * 在畫面上看起來還是可選，兩個客戶訂到同一個時段才會發現。
   */
  await sql`
    create table if not exists appointments (
      id             uuid        primary key,
      name           text        not null,
      phone          text        not null,
      email          text        not null,
      meet_type      text        not null,
      intent         text[]      not null default '{}',
      urgency        text,
      note           text        not null default '',
      slot_iso       text        not null,
      status         text        not null default 'confirmed',
      ai_heat        text        not null default 'low',
      ai_suggestion  text        not null default '',
      ai_summary     text        not null default '',
      ai_next_action text        not null default '',
      preview_file   text,
      created_at     timestamptz not null default now()
    )
  `;

  /**
   * 🔴 **同一個時段只能有一筆 confirmed** —— 這條要由資料庫來擋，不能只靠程式判斷。
   *
   * 原本的作法是「先查有沒有人訂，沒有才寫入」，在單機跑沒問題；
   * 但 Vercel 同時可能有好幾個執行環境，兩個人同一秒送出，
   * 兩邊都查到「還沒人訂」，然後兩邊都寫進去 —— 你會在後台看到同一個時段兩組客戶，
   * 而且是等到要出門見面前一天才發現。
   *
   * 交給資料庫的唯一索引，慢的那一筆一定會失敗，前端就會收到「這個時段剛剛被預約」。
   * 已取消／已完成的不佔位，所以是 partial index。
   */
  await sql`
    create unique index if not exists appointments_confirmed_slot
      on appointments (slot_iso)
      where status = 'confirmed'
  `;

  await sql`
    create index if not exists appointments_created_at
      on appointments (created_at desc)
  `;
}

/** Postgres 的「違反唯一限制」錯誤碼。用它判斷「時段撞了」而不是解析錯誤訊息文字 */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}
