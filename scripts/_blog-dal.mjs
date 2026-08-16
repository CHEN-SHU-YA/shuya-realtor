/**
 * 部落格資料層（src/lib/blog-db.ts）的腳本端載入器。
 *
 * ── 為什麼要編譯一手 ──
 * blog-db.ts 是 TypeScript，Node 腳本吃不了；但四張表的 DDL
 * （create table if not exists）與 DAL 的唯一定義處就在那支檔——
 * 腳本如果自己抄一份 SQL，就會出現兩個真相來源，改了一邊忘了另一邊
 * 是遲早的事。所以照 `.blog-migration/_schema-check/` 已驗證可行的做法：
 * 用 repo 自帶的 tsc 把 db.ts＋blog-db.ts 編成 CommonJS，require 進來用。
 *
 * （能這樣做的前提：blog-db.ts 對 `@/` 別名的 import 全部是 type-only，
 * 編譯後會被抹掉，產出的 CJS 只 require 相對路徑的 ./db，Node 直接跑得動。
 * 哪天 blog-db.ts 加了「執行期」的 `@/` import，這裡會在編譯或 require 時
 * 明確炸掉，不會安靜地拿舊版。）
 *
 * 產物落在 .blog-migration/_dal/（整個 .blog-migration/ 已 gitignore，
 * repo 是公開的，中間產物不進版控）。每次呼叫都重編，保證腳本用的
 * 永遠是當下的 blog-db.ts。
 *
 * 用法：
 *   import { ROOT, loadBlogDal } from "./_blog-dal.mjs";
 *   const { db, blogDb } = loadBlogDal();
 *   if (db.hasDatabase) await blogDb.ensureBlogSchema();
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

/** repo 根目錄（用腳本自身位置推算，跑的時候 cwd 在哪都行）。 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DAL_DIR = path.join(ROOT, ".blog-migration", "_dal");

/**
 * 編譯設定：extends 根 tsconfig（拿 `@/` paths 與 strict 設定），
 * 只改「要輸出、輸出成 CJS」兩件事。include 四支檔就夠——
 * tsc 會自動把它們 import 到的檔案一起拉進來。
 */
const TSCONFIG = {
  extends: "../../tsconfig.json",
  compilerOptions: {
    noEmit: false,
    declaration: false,
    incremental: false,
    module: "commonjs",
    moduleResolution: "node",
    outDir: "./out",
    rootDir: "../.."
  },
  include: [
    "../../src/lib/blog-db.ts",
    "../../src/lib/db.ts",
    "../../src/content/blocks/types.ts",
    "../../src/content/posts/types.ts"
  ]
};

/**
 * 編譯並載入資料層。回傳 { db, blogDb }：
 * · db     ＝ src/lib/db.ts（hasDatabase／getSql）
 * · blogDb ＝ src/lib/blog-db.ts（ensureBlogSchema 與全部 DAL 函式）
 *
 * 編譯失敗直接 throw（附 tsc 輸出）——寧可停下來，不要拿舊產物繼續跑。
 */
export function loadBlogDal() {
  fs.mkdirSync(DAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(DAL_DIR, "tsconfig.json"), JSON.stringify(TSCONFIG, null, 2) + "\n");

  /** 直接用 node 跑 typescript 套件裡的 tsc 入口，避開 Windows 上 npx 的殼層問題。 */
  const tscBin = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const result = spawnSync(process.execPath, [tscBin, "-p", DAL_DIR], {
    cwd: ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(
      "blog-db.ts 編譯失敗（腳本不會拿舊產物硬跑）：\n" +
        (result.stdout || "") +
        (result.stderr || "")
    );
  }

  const out = path.join(DAL_DIR, "out", "src", "lib");
  return {
    db: require(path.join(out, "db.js")),
    blogDb: require(path.join(out, "blog-db.js"))
  };
}
