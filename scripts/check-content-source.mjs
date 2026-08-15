/**
 * 查「首頁文案現在到底吃程式預設還是資料庫」。
 *
 * ```
 * node --env-file-if-exists=.env.local scripts/check-content-source.mjs
 * ```
 *
 * 🔴 為什麼需要這支：`lib/content.ts` 的 `merge()` 對陣列與物件欄位是
 *    「資料庫有值就整包蓋掉」，**空陣列 `[]` 也算數**。
 *    所以只要後台那一欄存過，改程式裡的 `DEFAULT_CONTENT` 就完全不會反映到線上，
 *    而且是**安靜地沒反應**：沒有錯誤、沒有警告，畫面看起來一切正常。
 *
 *    改 `DEFAULT_CONTENT` 之前先跑這支，確認那個欄位在資料庫裡沒有值，
 *    不然會白改一輪還找不到原因。
 *
 * 只印欄位結構，不印任何連線字串。
 */
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("沒有 DATABASE_URL —— 用 `node --env-file-if-exists=.env.local` 跑");
  process.exit(1);
}

const rows = await neon(url)`select data, updated_at from site_content where id = 'home'`;

if (!rows.length) {
  console.log("資料庫沒有 site_content('home')");
  console.log("→ 首頁完全吃程式裡的 DEFAULT_CONTENT，改預設會生效 ✅");
  process.exit(0);
}

const data = rows[0].data ?? {};
const stored = Object.keys(data);
console.log("資料庫有這一列，最後更新：", rows[0].updated_at);
console.log("");
console.log("🔴 這些欄位以資料庫為準，改 DEFAULT_CONTENT 不生效：");
console.log("   " + (stored.length ? stored.join(", ") : "（無）"));
console.log("");
console.log("✅ 其餘欄位吃程式預設。逐項確認：");
for (const key of ["sections", "toolItems", "articles", "reviews", "mediaItems"]) {
  const v = data[key];
  const how = v === undefined || v === null ? "退回程式預設 ✅" : "以資料庫為準 🔴";
  const detail = Array.isArray(v) ? `陣列 ${v.length} 筆` : v === null ? "null" : typeof v;
  console.log(`   ${key.padEnd(11)} ${how}  (${detail})`);
}
