/**
 * 台北時間的顯示工具（B 計畫第二段共用）。
 *
 * 🔴 照 ContentForm.tsx 的 formatTaipei 抄：**不要用 `toLocaleString`。**
 * 就算指定了 `timeZone: "Asia/Taipei"`，伺服器（Node）與瀏覽器（Chrome）的
 * ICU 版本不同，「下午7:48」中間吐出來的空白有時是一般空格、有時是 U+202F
 * 窄不斷行空格——肉眼一模一樣，但字串不相等，React 會判定 hydration 失敗。
 *
 * 台北固定 UTC+8、沒有日光節約，所以直接位移 8 小時再讀 UTC 欄位，
 * 不管伺服器在哪個時區都算得出同一組數字。
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO 時間字串 → 位移到 UTC+8 的 Date（讀它的 getUTC* 欄位就是台北時間）。 */
function toTaipei(iso: string): Date | null {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms + 8 * 60 * 60 * 1000);
}

/** `2026/08/17 16:42`（版本頁、上次存檔時間用）。 */
export function formatTaipei(iso: string): string {
  const d = toTaipei(iso);
  if (!d) return "";
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** `16:42`（存檔按鈕旁的「已儲存 16:42」用）。 */
export function formatTaipeiTime(iso: string): string {
  const d = toTaipei(iso);
  if (!d) return "";
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * 今天（台北時區）的 `YYYY-MM-DD`。
 * 「以這版更新參照庫」的 verifiedDate 由前端帶今天，用這支組（契約 §3.6）。
 */
export function taipeiTodayIso(): string {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
