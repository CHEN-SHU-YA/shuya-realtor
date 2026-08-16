/**
 * 部落格四張表的建表＋結構驗證（B 計畫第一段：資料層）。
 *
 * 跑法（從 shuya-realtor 根目錄；--env-file-if-exists 是 cwd 相對路徑，別換目錄跑）：
 *   node --env-file-if-exists=.env.local scripts/blog-db-setup.mjs
 *
 * 做什麼：
 *   1. 把 src/lib/blog-db.ts 編成 CJS 載入——DDL 唯一定義處在那支檔，
 *      這裡不抄第二份 SQL（見 scripts/_blog-dal.mjs 檔頭）。
 *   2. 跑 ensureBlogSchema()：內容全是 create table if not exists，冪等，
 *      重跑幾次都安全。正式站零影響——第一段前台完全不讀這些表。
 *   3. 從 information_schema／pg_indexes 印出四張表的欄位、索引、筆數，
 *      給人對照 docs/部落格/後台設計/INTERFACE-stage1.md 第六節逐欄核對。
 *
 * 連不上（沒有 DATABASE_URL）：明說連不上、exit code 2、不裝死也不猜。
 * SQL 語法的本機保證是 tsc 編譯（npm run check 蓋得到 blog-db.ts）；
 * 真正的語法與行為驗證只有實連 Neon 跑這支才算數。
 *
 * 🔴 只印表結構與筆數，不印任何連線字串（同 scripts/check-content-source.mjs 的紀律）。
 */
import { loadBlogDal } from "./_blog-dal.mjs";

/** 契約（INTERFACE-stage1.md 第六節）定義的四張表，一張都不能少。 */
const TABLES = ["blog_posts", "blog_post_history", "blog_redirects", "blog_law_refs"];

const { db, blogDb } = loadBlogDal();

if (!db.hasDatabase) {
  console.log("沒有 DATABASE_URL（.env.local 沒載到或沒設）——連不上，跳過建表實測。");
  console.log("DDL 定義在 src/lib/blog-db.ts（已過 tsc）；要實測請在有連線字串的環境重跑這支。");
  process.exit(2);
}

const sql = db.getSql();

try {
  await blogDb.ensureBlogSchema();

  /** 先確認四張表都真的在，缺一張就是建表失敗，直接紅。 */
  const found = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_name = any(${TABLES})
    order by table_name
  `;
  const foundNames = found.map((r) => r.table_name);
  const missing = TABLES.filter((t) => !foundNames.includes(t));
  if (missing.length) {
    console.error("❌ 建表後仍缺表：", missing.join(", "));
    process.exit(1);
  }
  console.log("✅ ensureBlogSchema() 跑完，四張表都在：", foundNames.join(", "));
  console.log("");

  for (const table of TABLES) {
    const count = await countRows(table);
    console.log(`── ${table}（${count} 筆）─────────────────────`);

    const cols = await sql`
      select column_name, data_type, is_nullable, column_default, is_generated, generation_expression
      from information_schema.columns
      where table_schema = 'public' and table_name = ${table}
      order by ordinal_position
    `;
    for (const c of cols) {
      const gen =
        c.is_generated === "ALWAYS" ? `  ←自動生成：${c.generation_expression}` : "";
      const def = c.column_default ? `  default ${c.column_default}` : "";
      console.log(
        `  ${String(c.column_name).padEnd(20)} ${String(c.data_type).padEnd(26)} null=${c.is_nullable}${def}${gen}`
      );
    }

    const indexes = await sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and tablename = ${table}
      order by indexname
    `;
    for (const idx of indexes) {
      console.log(`  [索引] ${idx.indexdef}`);
    }
    console.log("");
  }

  console.log("結構印完。逐欄對照表在 docs/部落格/後台設計/INTERFACE-stage1.md 第六節。");
} catch (error) {
  console.error("❌ 建表或查詢失敗（連線或 SQL 錯誤）：", error?.message || error);
  process.exit(1);
}

/** 表名沒辦法用參數帶進 SQL，逐表寫死（就四張，寫死最不容易錯）。 */
async function countRows(table) {
  switch (table) {
    case "blog_posts": {
      const [r] = await sql`select count(*)::int as n from blog_posts`;
      return r.n;
    }
    case "blog_post_history": {
      const [r] = await sql`select count(*)::int as n from blog_post_history`;
      return r.n;
    }
    case "blog_redirects": {
      const [r] = await sql`select count(*)::int as n from blog_redirects`;
      return r.n;
    }
    case "blog_law_refs": {
      const [r] = await sql`select count(*)::int as n from blog_law_refs`;
      return r.n;
    }
    default:
      return -1;
  }
}
