/**
 * 法規參照庫（blog_law_refs）的種子腳本（B 計畫第一段）。
 *
 * 跑法（從 shuya-realtor 根目錄）：
 *   node scripts/blog-law-seed.mjs                                            ← dry-run（預設，不需要資料庫）
 *   node --env-file-if-exists=.env.local scripts/blog-law-seed.mjs --execute  ← 真正匯入 blog_law_refs
 *
 * 吃什麼：docs/部落格/事實庫/法規稅務條文庫.md（書亞的條文白名單，
 * 每條都有查證紀錄）。這支只收「**逐字原文**＋全國法規資料庫單條出處」的條目：
 *
 *   · 逐字的判準＝內文整段用「」包起來（條文庫的慣例：逐字引用加引號、
 *     摘要改寫不加）。「」外還掛著其他敘述的（逐字＋摘要混寫）一律不收——
 *     參照庫是 lawQuote 存檔時的比對基準，混進改寫文字比沒有更糟。
 *   · 出處必須是 law.moj.gov.tw 的 LawSingle 網址（拆得出 pcode／flno，
 *     跟 blog_law_refs 的主鍵對得上）。財政部、稅務入口網那些組不出來的
 *     來源不屬於這張表（它們在文章裡是 `url` 型出處，不做逐字比對）。
 *   · 【待查】條目照條文庫自己的規矩跳過。
 *
 * 解析不動（不符合上面判準）的條目**逐條列出來＋原因**，給人看過就好，
 * 不硬塞。同一條條文的多個「項」會併成一筆（article_text 逐項換行），
 * note 記清楚收錄了哪幾項——條文庫是節錄，未必是全條全文。
 *
 * dry-run 印「將匯入清單」並落地 .blog-migration/law-seed-preview.json
 * 供人工覆核；--execute 逐筆 upsertLawRef（同 (pcode,flno) 存在就整筆更新）。
 * 不印任何連線字串。
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTE = process.argv.includes("--execute");
const DOC_PATH = path.resolve(ROOT, "..", "docs", "部落格", "事實庫", "法規稅務條文庫.md");
const PREVIEW_PATH = path.join(ROOT, ".blog-migration", "law-seed-preview.json");

/** 全國法規資料庫單條條文頁（同 src/content/blocks/types.ts 的 mojLawUrl 公式）。 */
const MOJ_RE = /^https:\/\/law\.moj\.gov\.tw\/LawClass\/LawSingle\.aspx\?pcode=([A-Za-z0-9]+)&flno=([0-9-]+)$/;

if (!fs.existsSync(DOC_PATH)) {
  console.error(`找不到條文庫：${DOC_PATH}`);
  process.exit(1);
}

const lines = fs.readFileSync(DOC_PATH, "utf8").split(/\r?\n/);

/* ───────────────────────────────────────────────
   1. 逐行解析
   ─────────────────────────────────────────────── */

/** 文件層級的預設查證日（檔頭「**查證日期：YYYY-MM-DD…」）。 */
const headerDate = lines
  .map((l) => l.match(/^\*\*查證日期：(\d{4}-\d{2}-\d{2})/))
  .find(Boolean)?.[1];
if (!headerDate) {
  console.error("條文庫檔頭找不到「**查證日期：YYYY-MM-DD」——文件格式變了，先人工確認再跑。");
  process.exit(1);
}

/** @type {{pcode:string,flno:string,lawName:string,sub:string|null,text:string,url:string,lineNo:number,annotation:string,date:string}[]} */
const accepted = [];
/** @type {{lineNo:number,excerpt:string,reason:string}[]} */
const skipped = [];

const skip = (lineNo, entry, reason) => {
  skipped.push({ lineNo, excerpt: entry.length > 42 ? entry.slice(0, 42) + "…" : entry, reason });
};

/** 條號顯示用：787 → 第787條；28-2 → 第28條之2。 */
const flnoLabel = (flno) => {
  const [main, sub] = flno.split("-");
  return sub ? `第${main}條之${sub}` : `第${main}條`;
};

let currentDate = headerDate;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNo = i + 1;

  if (/^##\s/.test(line)) {
    currentDate = headerDate; // 換節就回到預設；節內有寫查證日再覆蓋
    continue;
  }
  if (!/^-\s/.test(line)) {
    const dateMatch = line.match(/查證日期[：\s]*(\d{4}-\d{2}-\d{2})/);
    if (dateMatch) currentDate = dateMatch[1];
    continue;
  }

  const entry = line.replace(/^-\s*/, "").trim();

  // 連查證標記、連法規資料庫網址都沒有的列，不是「條目」（使用規則、
  // 黑名單那類說明文字），靜靜略過——跳過清單只列真正解析不動的條目。
  if (!entry.includes("【已查證】") && !entry.includes("【待查】") && !entry.includes("law.moj.gov.tw")) {
    continue;
  }

  if (entry.includes("【待查】")) {
    skip(lineNo, entry, "【待查】——條文庫自己的規矩：還沒查證，不進參照庫");
    continue;
  }
  const srcMatch = entry.match(/——\s*【已查證】出處：(\S+)/);
  if (!srcMatch) {
    skip(lineNo, entry, "有查證標記或條文網址、但格式對不上「——【已查證】出處：」——要人工看");
    continue;
  }
  const url = srcMatch[1];
  const moj = url.match(MOJ_RE);
  if (!moj) {
    skip(lineNo, entry, "出處不是全國法規資料庫單條網址（拆不出 pcode/flno，這張表不收）");
    continue;
  }
  const [, pcode, urlFlno] = moj;

  const head = entry.slice(0, srcMatch.index).trim();
  /** 開頭要是「法規名＋第N條(之N)(第N項)(第N款)（可帶括號註記）：」 */
  const labelMatch = head.match(
    /^(.+?第[0-9]+條(?:之[0-9]+)?(?:第[0-9]+項)?(?:第[0-9]+款)?)(（[^（）]*）)?：([\s\S]+)$/
  );
  if (!labelMatch) {
    skip(lineNo, entry, "開頭不是「法規名＋條號：」（認不出是哪一條，逐字也無從歸位）");
    continue;
  }
  const [, label, labelNote = "", bodyRaw] = labelMatch;
  const body = bodyRaw.trim();

  // 內文標示的條號要跟出處網址的 flno 對得上（互相抓打錯）
  const art = label.match(/第([0-9]+)條(?:之([0-9]+))?/);
  const labelFlno = art[2] ? `${art[1]}-${art[2]}` : art[1];
  if (labelFlno !== urlFlno) {
    skip(lineNo, entry, `條號對不上：內文寫${flnoLabel(labelFlno)}、出處網址 flno=${urlFlno}——要人工看`);
    continue;
  }

  // 逐字判準：整段「」包起來（後面只准跟一個括號註記）
  const bodyMatch = body.match(/^「([\s\S]+)」(（[^（）]*）)?$/);
  if (!bodyMatch) {
    skip(lineNo, entry, "內文不是整段「」包起來的逐字原文（摘要／改寫／逐字加摘要混寫都不收）");
    continue;
  }
  const text = bodyMatch[1].replace(/\*\*/g, ""); // ** 是條文庫自己加的重點標記，不是條文文字
  const bodyNote = bodyMatch[2] ?? "";

  const sub = label.match(/條(?:之[0-9]+)?(第[0-9]+項(?:第[0-9]+款)?)$/)?.[1] ?? null;
  const lawName = label.match(/^(.+?)第[0-9]+條/)[1];

  accepted.push({
    pcode,
    flno: urlFlno,
    lawName,
    sub,
    text,
    url,
    lineNo,
    annotation: [labelNote, bodyNote].filter(Boolean).join(""),
    date: currentDate
  });
}

/* ───────────────────────────────────────────────
   2. 同一條條文的多個「項」併成一筆（blog_law_refs 主鍵是 (pcode, flno)）
   ─────────────────────────────────────────────── */

/** @type {Map<string, typeof accepted>} */
const groups = new Map();
for (const item of accepted) {
  const key = `${item.pcode}|${item.flno}`;
  if (!groups.has(key)) groups.set(key, []);
  const bucket = groups.get(key);
  const dupe = bucket.find((x) => x.sub === item.sub);
  if (dupe) {
    if (dupe.text === item.text) continue; // 跨節重複收錄、內容相同 → 靜靜去重
    // 同一項兩個版本文字不同 → 整條不收，列出來要人看（參照庫不能有猜的）
    bucket.conflict = `L${dupe.lineNo} 與 L${item.lineNo} 同是${item.sub ?? "全條"}但文字不同`;
  }
  bucket.push(item);
}

/** @type {{pcode:string,flno:string,lawName:string,articleText:string,verifiedDate:string,sourceUrl:string,note:string,parts:string[],lines:number[]}[]} */
const rows = [];

for (const bucket of groups.values()) {
  if (bucket.conflict) {
    skip(bucket[0].lineNo, `${bucket[0].lawName}${flnoLabel(bucket[0].flno)}（整組）`, `同一項有兩個不同版本：${bucket.conflict}`);
    continue;
  }
  // 依項次排序（全條在前；第N項照 N）
  bucket.sort((a, b) => {
    const numberOf = (x) => (x.sub ? Number(x.sub.match(/第([0-9]+)項/)?.[1] ?? 999) : 0);
    return numberOf(a) - numberOf(b);
  });

  const articleText = bucket
    .map((p) => (p.sub ? `${p.sub}：${p.text}` : p.text))
    .join("\n");
  const noteParts = [`種子來源：docs/部落格/事實庫/法規稅務條文庫.md`];
  if (bucket.some((p) => p.sub)) {
    noteParts.push(`收錄：${bucket.map((p) => p.sub ?? "全條").join("、")}（條文庫為節錄，未必含全條全部項次）`);
  }
  const annotations = bucket.map((p) => p.annotation).filter(Boolean);
  if (annotations.length) noteParts.push(`條文庫註記：${annotations.join("")}`);

  rows.push({
    pcode: bucket[0].pcode,
    flno: bucket[0].flno,
    lawName: bucket[0].lawName,
    articleText,
    verifiedDate: bucket.map((p) => p.date).sort().at(-1), // 多項取最近的查證日
    sourceUrl: bucket[0].url,
    note: noteParts.join("；"),
    parts: bucket.map((p) => p.sub ?? "全條"),
    lines: bucket.map((p) => p.lineNo)
  });
}

/** 顯示排序：pcode → flno（條號含「之」的自然排序）。 */
rows.sort((a, b) => {
  if (a.pcode !== b.pcode) return a.pcode < b.pcode ? -1 : 1;
  const [aa, ab = 0] = a.flno.split("-").map(Number);
  const [ba, bb = 0] = b.flno.split("-").map(Number);
  return aa - ba || ab - bb;
});
skipped.sort((a, b) => a.lineNo - b.lineNo);

/* ───────────────────────────────────────────────
   3. 印清單＋落地 preview（dry-run 到此為止）
   ─────────────────────────────────────────────── */

console.log(`=== 將匯入 blog_law_refs 的條目（${rows.length} 條條文）===`);
console.log("");
for (const row of rows) {
  console.log(
    `  ${row.pcode.padEnd(9)} ${flnoLabel(row.flno)}`.padEnd(30) +
      `${row.lawName}｜收錄 ${row.parts.join("、")}｜${row.articleText.length} 字｜查證日 ${row.verifiedDate}｜L${row.lines.join(",L")}`
  );
}
console.log("");
console.log(`=== 解析不動／刻意跳過的條目（${skipped.length} 條，列出來給人看，不硬塞）===`);
console.log("");
for (const s of skipped) {
  console.log(`  [L${String(s.lineNo).padStart(3)}] ${s.excerpt}`);
  console.log(`         → ${s.reason}`);
}
console.log("");

fs.mkdirSync(path.dirname(PREVIEW_PATH), { recursive: true });
fs.writeFileSync(
  PREVIEW_PATH,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      source: "docs/部落格/事實庫/法規稅務條文庫.md",
      rows: rows.map(({ parts, lines, ...ref }) => ref),
      skipped
    },
    null,
    2
  ) + "\n"
);
console.log(`覆核用清單已落地：${path.relative(ROOT, PREVIEW_PATH)}`);

if (!EXECUTE) {
  console.log("dry-run 結束，沒有寫入資料庫。確認清單沒問題後加 --execute 匯入。");
  process.exit(0);
}

/* ───────────────────────────────────────────────
   4. --execute：逐筆 upsert
   ─────────────────────────────────────────────── */

const { loadBlogDal } = await import("./_blog-dal.mjs");
const { db, blogDb } = loadBlogDal();

if (!db.hasDatabase) {
  console.error("沒有 DATABASE_URL（.env.local 沒載到或沒設）——連不上，無法 --execute 匯入。");
  process.exit(2);
}

try {
  for (const row of rows) {
    await blogDb.upsertLawRef({
      pcode: row.pcode,
      flno: row.flno,
      lawName: row.lawName,
      articleText: row.articleText,
      verifiedDate: row.verifiedDate,
      sourceUrl: row.sourceUrl,
      note: row.note
    });
  }
  const sql = db.getSql();
  const [{ n }] = await sql`select count(*)::int as n from blog_law_refs`;
  console.log(`✅ upsert ${rows.length} 條完成，blog_law_refs 現有 ${n} 筆。`);
} catch (error) {
  console.error("❌ 匯入失敗：", error?.message || error);
  process.exit(1);
}
