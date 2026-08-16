/**
 * 五篇舊文的轉檔 JSON → blog_posts 匯入腳本（B 計畫第一段）。
 *
 * 跑法（從 shuya-realtor 根目錄）：
 *   node --env-file-if-exists=.env.local scripts/blog-import.mjs             ← dry-run（預設）
 *   node --env-file-if-exists=.env.local scripts/blog-import.mjs --execute   ← 真正匯入
 *
 * 🔴 第一段只跑 dry-run：印出「將寫入什麼」的摘要就停，不動資料庫。
 *    真正匯入（--execute）是第三段前台切換時的動作——但旗標現在就做好，
 *    到時不用回來改腳本。
 *
 * 吃什麼：.blog-migration/posts/{id}.json（轉檔腳本的輸出，BlogPostData 形狀，
 * 契約見 docs/部落格/後台設計/INTERFACE-stage1.md 第四節 4.3／4.4）。
 *
 * 寫什麼（--execute 時）：
 *   · 逐篇 importPost(data, { publish: true, note: "轉檔匯入" })——
 *     五篇舊文在線上是 live 的，所以 status＝published、
 *     published_snapshot＝當下這包 blocks（匯入即發布；前台第三段切換前
 *     不會讀到，零風險）。importPost 本身每次都會記一筆 history。
 *   · 同 id（＝同 segment 來源）已存在 → 覆蓋前先把「資料庫現況」多寫一筆
 *     history 快照——資料庫裡那一版可能有人在後台改過，蓋掉前留底，
 *     歷史不丟任何一版。
 *   · 匯入後立刻讀回來 deep-equal 驗證（契約第七節第 4 項的 round-trip：
 *     驗 jsonb 存取沒有動到內容）。
 *
 * 連不上資料庫：dry-run 照跑（只是無法確認「新增還是更新」）；
 * --execute 直接明說連不上、exit 2。不印任何連線字串。
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadBlogDal } from "./_blog-dal.mjs";

const EXECUTE = process.argv.includes("--execute");
const POSTS_DIR = path.join(ROOT, ".blog-migration", "posts");

/** 正文頂層允許的節點名（src/content/blocks/types.ts 的 BlogBlockNode，契約唯一定義處）。 */
const KNOWN_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "lawQuote",
  "sourceLine", // 獨立出處列（契約 2026-08-16 追加；1005 第二節唯一一例）
  "bulletList",
  "orderedList",
  "image",
  "horizontalRule",
  "specTable",
  "tocList",
  "signature",
  "editorNote"
]);

/* ───────────────────────────────────────────────
   1. 讀轉檔輸出
   ─────────────────────────────────────────────── */

if (!fs.existsSync(POSTS_DIR)) {
  console.log(`還沒有轉檔輸出（${path.relative(ROOT, POSTS_DIR)}\\ 不存在）。`);
  console.log("先跑轉檔腳本產出 .blog-migration/posts/{id}.json，再回來跑這支。");
  process.exit(2);
}

const files = fs
  .readdirSync(POSTS_DIR)
  .filter((f) => /^\d+\.json$/.test(f))
  .sort();

if (!files.length) {
  console.log(`轉檔輸出目錄是空的（${path.relative(ROOT, POSTS_DIR)}\\ 沒有 {id}.json）。`);
  process.exit(2);
}

/* ───────────────────────────────────────────────
   2. 逐篇 sanity 檢查（輕量——逐字驗收是轉檔那一路的 diff 報告在把關，
      這裡只擋「檔案形狀根本不對」的東西，不重做驗收）
   ─────────────────────────────────────────────── */

/** @returns {string[]} 問題清單（空陣列＝過） */
function validate(data, filename) {
  const problems = [];
  const str = (v) => typeof v === "string" && v.length > 0;

  if (!Number.isInteger(data.id)) problems.push("id 不是整數");
  else if (`${data.id}.json` !== filename) problems.push(`檔名 ${filename} 與 id ${data.id} 對不上`);
  if (!str(data.slug) || !/^[a-z0-9-]+$/.test(data.slug)) problems.push("slug 缺少或格式不對");
  for (const key of ["title", "description", "excerpt", "tldr", "ctaLead", "category"]) {
    if (!str(data[key])) problems.push(`${key} 缺少或是空字串`);
  }
  if (!str(data.publishedAt) || !/^\d{4}-\d{2}-\d{2}$/.test(data.publishedAt)) {
    problems.push("publishedAt 缺少或不是 YYYY-MM-DD");
  }
  if (!(data.updatedAt === null || /^\d{4}-\d{2}-\d{2}$/.test(data.updatedAt ?? ""))) {
    problems.push("updatedAt 要是 null 或 YYYY-MM-DD（缺欄位也不行，正規化規則見契約 4.4）");
  }
  if (!(data.cover === null || str(data.cover))) problems.push("cover 要是 null 或檔名字串");
  if (!Array.isArray(data.keywords) || !data.keywords.every(str)) problems.push("keywords 不是字串陣列");
  if (!Array.isArray(data.toc)) problems.push("toc 不是陣列");
  if (!Array.isArray(data.faq)) problems.push("faq 不是陣列");
  const v = data.verdict;
  if (!v || !str(v.q) || !str(v.aBold) || !str(v.aRest) || !str(v.note)) {
    problems.push("verdict 缺欄（要 q／aBold／aRest／note 四欄都有值）");
  }
  const blocks = data.blocks;
  if (!blocks || blocks.type !== "doc" || !Array.isArray(blocks.content)) {
    problems.push('blocks 不是 { type:"doc", content:[…] }');
  } else {
    for (const node of blocks.content) {
      if (!node || !KNOWN_BLOCK_TYPES.has(node.type)) {
        problems.push(`blocks 出現契約外的頂層節點：${node?.type ?? "(無 type)"}`);
        break; // 一個就夠說明問題，不洗版
      }
    }
  }
  return problems;
}

const posts = [];
let hasInvalid = false;

for (const filename of files) {
  const fullPath = path.join(POSTS_DIR, filename);
  let data;
  try {
    data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    console.error(`❌ ${filename}：JSON 解析失敗——${error?.message || error}`);
    hasInvalid = true;
    continue;
  }
  const problems = validate(data, filename);
  if (problems.length) {
    console.error(`❌ ${filename}：形狀不對，這篇不匯`);
    for (const p of problems) console.error(`   · ${p}`);
    hasInvalid = true;
    continue;
  }
  posts.push(data);
}

/* ───────────────────────────────────────────────
   3. 對資料庫盤點：每篇是「新增」還是「更新」
   ─────────────────────────────────────────────── */

const { db, blogDb } = loadBlogDal();

if (EXECUTE && !db.hasDatabase) {
  console.error("沒有 DATABASE_URL（.env.local 沒載到或沒設）——連不上，無法 --execute 匯入。");
  process.exit(2);
}

/** @type {Map<number, {slug:string, status:string}|null>} 現況；null＝不存在 */
const existing = new Map();
if (db.hasDatabase) {
  try {
    const sql = db.getSql();
    await blogDb.ensureBlogSchema();
    for (const post of posts) {
      const rows = await sql`select slug, status from blog_posts where id = ${post.id}`;
      existing.set(post.id, rows.length ? { slug: String(rows[0].slug), status: String(rows[0].status) } : null);
    }
  } catch (error) {
    console.error("查資料庫現況失敗：", error?.message || error);
    if (EXECUTE) process.exit(1);
    existing.clear(); // dry-run 照走，只是不知道新增還是更新
  }
}

/* ───────────────────────────────────────────────
   4. 印摘要（dry-run 到這裡為止）
   ─────────────────────────────────────────────── */

console.log(EXECUTE ? "=== 匯入 blog_posts（--execute）===" : "=== 匯入 blog_posts（dry-run，不寫入）===");
console.log("");

for (const post of posts) {
  const blockCount = post.blocks.content.length;
  const noteCount = post.blocks.content.filter((b) => b.type === "editorNote").length;
  const was = existing.has(post.id) ? existing.get(post.id) : undefined;
  const action =
    was === undefined
      ? "（連不上資料庫，無法確認是新增還是更新）"
      : was === null
        ? "新增"
        : `更新（覆蓋前先把資料庫現況寫一筆 history）`;

  console.log(`  #${post.id}  /blog/${post.id}-${post.slug}`);
  console.log(`      標題：${post.title}`);
  console.log(
    `      區塊 ${blockCount}（editorNote ${noteCount}）｜faq ${post.faq.length} 題｜toc ${post.toc.length} 項｜keywords ${post.keywords.length} 個`
  );
  console.log(`      寫入：status=published、published_snapshot=這一包、note=轉檔匯入 → ${action}`);
  if (was && was.slug !== post.slug) {
    console.log(
      `      ⚠️ 資料庫現有 slug 是「${was.slug}」，匯入會改成「${post.slug}」——importPost 不會記 301` +
        `（那是 publishPost 的行為），舊網址 /blog/${post.id}-${was.slug} 要不要轉址請人工確認。`
    );
  }
  console.log("");
}

if (hasInvalid) {
  console.error("⚠️ 有檔案沒過形狀檢查（上面 ❌ 那些），先修轉檔再匯。");
}

if (!EXECUTE) {
  console.log(`dry-run 結束，共 ${posts.length} 篇可匯、沒有寫入任何東西。`);
  console.log("真正匯入（第三段前台切換時）加 --execute。");
  process.exit(hasInvalid ? 1 : 0);
}

/* ───────────────────────────────────────────────
   5. --execute：真正匯入＋round-trip 驗證
   ─────────────────────────────────────────────── */

if (hasInvalid) {
  console.error("❌ 有檔案沒過形狀檢查，--execute 全部中止（不做「匯一半」）。");
  process.exit(1);
}

const sql = db.getSql();
let failed = false;

for (const post of posts) {
  // 同 id 已存在 → 覆蓋前把資料庫現況留一筆 history（那一版可能被後台改過，不能蓋掉就沒了）
  const was = existing.get(post.id);
  if (was) {
    const row = await blogDb.getPost(post.id);
    if (!row) {
      console.error(`❌ #${post.id} 讀現況失敗，這篇跳過`);
      failed = true;
      continue;
    }
    await sql`
      insert into blog_post_history (post_id, data, note)
      values (${post.id}, ${JSON.stringify(row.data)}::jsonb, ${"匯入覆蓋前的自動快照"})
    `;
  }

  await blogDb.importPost(post, { publish: true, note: "轉檔匯入" });

  // round-trip：讀回來與檔案 deep-equal（驗 jsonb 沒動到內容；契約第七節第 4 項）
  const after = await blogDb.getPost(post.id);
  const dataDiff = after ? firstDiff(after.data, post) : "(讀不回來)";
  const snapDiff = after ? firstDiff(after.publishedSnapshot, post) : "(讀不回來)";
  const ok = after && after.status === "published" && dataDiff === null && snapDiff === null;
  if (ok) {
    console.log(`✅ #${post.id} 匯入＋讀回一致（status=published）`);
  } else {
    console.error(
      `❌ #${post.id} round-trip 不一致：status=${after?.status}｜data 差異=${dataDiff}｜snapshot 差異=${snapDiff}`
    );
    failed = true;
  }
}

console.log("");
console.log(failed ? "❌ 匯入有失敗項，看上面。" : `✅ ${posts.length} 篇全部匯入並通過 round-trip 驗證。`);
process.exit(failed ? 1 : 0);

/* ───────────────────────────────────────────────
   工具：結構化 deep-equal（jsonb 不保證 key 順序，不能比字串）
   ─────────────────────────────────────────────── */

/**
 * 回傳第一個不一致的路徑（例：blocks.content[3].attrs.alt），一致回 null。
 * undefined 的欄位視同不存在（JSON round-trip 後本來就不會有 undefined）。
 */
function firstDiff(a, b, trail = "") {
  if (a === b) return null;
  if (a === null || b === null || typeof a !== typeof b) return trail || "(root)";
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return trail || "(root)";
    if (a.length !== b.length) return `${trail}.length`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${trail}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined).sort();
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined).sort();
    if (keysA.join(" ") !== keysB.join(" ")) return `${trail}.(keys)`;
    for (const key of keysA) {
      const d = firstDiff(a[key], b[key], trail ? `${trail}.${key}` : key);
      if (d) return d;
    }
    return null;
  }
  return trail || "(root)";
}
