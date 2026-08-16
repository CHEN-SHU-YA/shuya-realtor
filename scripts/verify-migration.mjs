/**
 * 轉檔逐字驗收：五篇現況 body vs 區塊 JSON 的渲染結果，位元組比對（B 計畫第一段）。
 *
 * ```
 * node scripts/verify-migration.mjs
 * ```
 *
 * ── 做什麼（契約：docs/部落格/後台設計/INTERFACE-stage1.md 第七節）──
 * 逐篇做四件事：
 *   1. 正文逐字比對：
 *      A ＝ renderToStaticMarkup(<>{post.body}</>)          ← 現況側（live 的 tsx）
 *      B ＝ renderToStaticMarkup(renderBlogBody(blocks, ctx)) ← 新側（.blog-migration/posts/{id}.json）
 *      🔴 兩側同用 renderToStaticMarkup（renderToString 會插 hydration 註解，兩邊
 *      不同函式會出假差異）。任何一個 byte 差都算 FAIL，diff 落地
 *      .blog-migration/diff-{segment}.txt（第一個差異位置前後各 80 字＋兩側全文）。
 *   2. metadata 比對：Post（去掉 body/draft、照契約 4.4 正規化）與 JSON（去掉 blocks）
 *      deep-equal，逐欄列差異。
 *   3. editorNote 不遺失：原始 .tsx 的 body 區 JSX 註解（任意深度全掃）數量與逐條文字
 *      ＝ JSON 裡 editorNote 節點；且 B 的輸出裡完全沒有任何 editorNote 文字（前台不 render）。
 *   4. 總表：report/summary.md 收五篇 PASS/FAIL。
 *
 * ── 比對器的正規化 ──
 * 🔴 目前是**零正規化**：兩側字串原樣 byte 比對。若日後出現「語意相同但序列化不同」
 *    的頑固差異，只准在下方 normalizeForCompare() 逐條明確列舉（每條註解寫明理由），
 *    不准大範圍洗掉空白蒙混。
 *
 * ── 鐵則 ──
 * · 不碰資料庫、不讀 .env（DB round-trip 是 blog-import.mjs 那一步的事）。
 * · 現網零影響：只寫 .blog-migration/（已在 .gitignore）底下的檔案。
 * · 可重複執行、結果確定性：輸出不含時間戳。
 *
 * ── 編譯做法 ──
 * 與 scripts/migrate-posts.mjs 同款：tsc 把「五篇＋渲染器」（連 import 鏈）編成 CJS，
 * 攔 Module._resolveFilename 把 @/ 別名映到編譯輸出。
 * ⚠️ module/moduleResolution 要用 node16（照 .blog-migration/_render-check 驗證過的組合）：
 *    node10 解析不了 @tiptap/static-renderer 的 exports 子路徑。
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const POSTS_DIR = path.join(REPO_ROOT, "src", "content", "posts");
const MIGRATION_DIR = path.join(REPO_ROOT, ".blog-migration");
const BUILD_DIR = path.join(MIGRATION_DIR, "_verify-build");
const OUT_DIR = path.join(BUILD_DIR, "out");
const POSTS_JSON_DIR = path.join(MIGRATION_DIR, "posts");
const REPORT_DIR = path.join(MIGRATION_DIR, "report");

/** 中止報錯（帶上下文）。 */
function fail(context, message) {
  throw new Error(`[${context}] ${message}`);
}

/* ───────────────────────────────────────────────
   比對器正規化（🔴 目前零條——要加必須逐條列舉＋註明理由）
   ─────────────────────────────────────────────── */

function normalizeForCompare(html) {
  // 目前不做任何正規化：兩側同一個 React、同一個 renderToStaticMarkup，
  // 語意相同就該序列化相同；加正規化前先確認差異真的不是轉檔錯。
  return html;
}

/* ───────────────────────────────────────────────
   第 1 步：tsc 把「五篇＋渲染器」編成 CJS
   ─────────────────────────────────────────────── */

function compileSources() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const tsconfigPath = path.join(BUILD_DIR, "tsconfig.json");
  const tsconfig = {
    extends: "../../tsconfig.json",
    compilerOptions: {
      noEmit: false,
      declaration: false,
      incremental: false,
      module: "node16",
      moduleResolution: "node16",
      outDir: "./out",
      rootDir: "../.."
    },
    include: ["../../src/content/posts/index.ts", "../../src/lib/blocks-render.tsx"]
  };
  fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");

  const tscJs = path.join(REPO_ROOT, "node_modules", "typescript", "lib", "tsc.js");
  const result = spawnSync(process.execPath, [tscJs, "-p", tsconfigPath, "--pretty", "false"], {
    cwd: REPO_ROOT,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail("tsc", `編譯失敗（exit ${result.status}）：\n${result.stdout || ""}${result.stderr || ""}`);
  }
}

/** @/ 別名 → 編譯輸出（tsc 不改寫 paths，照 _render-check/driver.cjs 的做法攔下來）。 */
function installAliasHook() {
  const Module = require("node:module");
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (typeof request === "string" && request.startsWith("@/")) {
      return original.call(this, path.join(OUT_DIR, "src", request.slice(2)), ...rest);
    }
    return original.call(this, request, ...rest);
  };
}

/* ───────────────────────────────────────────────
   AST：原始 .tsx 的 body 區 JSX 註解（任意深度全掃，驗「一條都不遺失」）
   ─────────────────────────────────────────────── */

const ts = require(path.join(REPO_ROOT, "node_modules", "typescript"));

/** JSX 註解容器 → 文字：逐行 trim、去頭尾空行、內部換行保留（與轉檔腳本同一條規則）。 */
function commentContainerText(containerText, context) {
  const inner = containerText.trim();
  const match = /^\/\*([\s\S]*?)\*\/$/.exec(inner);
  if (!match) fail(context, `表達式容器不是註解：${inner.slice(0, 40)}…`);
  const lines = match[1].split(/\r\n|\n|\r/).map((line) => line.trim());
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const text = lines.join("\n");
  if (!text) fail(context, "空的註解容器");
  return text;
}

/** 收集 body fragment 底下**所有深度**的 JSX 註解文字（依原始碼出現順序）。 */
function collectBodyComments(filePath, context) {
  const source = fs.readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(path.basename(filePath), source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  let fragment = null;
  const findBody = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(sf) === "body" && node.initializer) {
      let init = node.initializer;
      while (ts.isParenthesizedExpression(init)) init = init.expression;
      if (ts.isJsxFragment(init)) fragment = init;
    }
    ts.forEachChild(node, findBody);
  };
  findBody(sf);
  if (!fragment) fail(context, "找不到 const body = (<>…</>) 的 JSX fragment");

  const comments = [];
  const walk = (node) => {
    if (ts.isJsxExpression(node) && node.expression === undefined) {
      const text = source.slice(node.getStart(sf) + 1, node.end - 1);
      comments.push(commentContainerText(text, context));
    }
    ts.forEachChild(node, walk);
  };
  walk(fragment);
  return comments;
}

/* ───────────────────────────────────────────────
   metadata deep-equal（契約 §7.2；回傳差異路徑清單）
   ─────────────────────────────────────────────── */

function diffPaths(a, b, trail, out) {
  if (a === b) return;
  if (a === null || b === null || typeof a !== typeof b) {
    out.push(`${trail || "(root)"}：${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      out.push(`${trail || "(root)"}：陣列形狀不同（${Array.isArray(a) ? a.length : "非陣列"} vs ${Array.isArray(b) ? b.length : "非陣列"}）`);
      return;
    }
    a.forEach((item, i) => diffPaths(item, b[i], `${trail}[${i}]`, out));
    return;
  }
  if (typeof a === "object") {
    const keysA = Object.keys(a).filter((k) => a[k] !== undefined).sort();
    const keysB = Object.keys(b).filter((k) => b[k] !== undefined).sort();
    if (keysA.join(" ") !== keysB.join(" ")) {
      out.push(`${trail || "(root)"}：key 集合不同（${keysA.join(",")}）vs（${keysB.join(",")}）`);
      return;
    }
    for (const key of keysA) diffPaths(a[key], b[key], trail ? `${trail}.${key}` : key, out);
    return;
  }
  out.push(`${trail || "(root)"}：${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
}

/** Post → 契約 4.4 正規化後的 metadata（去 body/draft；updatedAt/cover 缺 → null）。 */
function normalizedPostMetadata(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.description,
    category: post.category,
    keywords: [...post.keywords],
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt ?? null,
    cover: post.cover ?? null,
    excerpt: post.excerpt,
    verdict: { q: post.verdict.q, aBold: post.verdict.aBold, aRest: post.verdict.aRest, note: post.verdict.note },
    tldr: post.tldr,
    toc: post.toc.map((item) => ({ id: item.id, text: item.text })),
    faq: post.faq.map((item) => ({ q: item.q, a: item.a })),
    ctaLead: post.ctaLead
  };
}

/* ───────────────────────────────────────────────
   主程式
   ─────────────────────────────────────────────── */

function main() {
  console.log("① tsc 編譯「五篇＋渲染器」→ .blog-migration/_verify-build/out/");
  compileSources();
  installAliasHook();

  const React = require(path.join(REPO_ROOT, "node_modules", "react"));
  const { renderToStaticMarkup } = require(path.join(REPO_ROOT, "node_modules", "react-dom", "server"));
  const registry = require(path.join(OUT_DIR, "src", "content", "posts", "index.js"));
  const { renderBlogBody } = require(path.join(OUT_DIR, "src", "lib", "blocks-render.js"));

  const posts = registry.POSTS;
  if (!Array.isArray(posts) || posts.length !== 5) {
    fail("registry", `POSTS 有 ${posts && posts.length} 篇（預期 5）`);
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const sourceFiles = fs.readdirSync(POSTS_DIR).filter((name) => /^\d{4}-.+\.tsx$/.test(name));

  const summaryRows = [];
  let allPass = true;

  for (const post of posts) {
    const segment = `${post.id}-${post.slug}`;
    const context = `post ${post.id}`;
    const diffPath = path.join(MIGRATION_DIR, `diff-${segment}.txt`);
    const problems = [];

    /* 讀轉檔 JSON */
    const jsonPath = path.join(POSTS_JSON_DIR, `${post.id}.json`);
    if (!fs.existsSync(jsonPath)) fail(context, `找不到轉檔輸出 ${jsonPath}——先跑 scripts/migrate-posts.mjs`);
    const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

    /* 1. 正文逐字比對（兩側同用 renderToStaticMarkup，🔴 契約第七節） */
    const htmlOld = normalizeForCompare(
      renderToStaticMarkup(React.createElement(React.Fragment, null, post.body))
    );
    const htmlNew = normalizeForCompare(
      renderToStaticMarkup(
        React.createElement(
          React.Fragment,
          null,
          renderBlogBody(data.blocks, { toc: data.toc, imageBase: `/blog/${data.id}-${data.slug}` })
        )
      )
    );

    const oldBytes = Buffer.from(htmlOld, "utf8");
    const newBytes = Buffer.from(htmlNew, "utf8");
    const bytesEqual = oldBytes.equals(newBytes);

    if (bytesEqual) {
      /* 過了就清掉上一輪可能留下的 diff 檔（避免舊報告誤導）。 */
      if (fs.existsSync(diffPath)) fs.unlinkSync(diffPath);
    } else {
      allPass = false;
      let at = 0;
      const n = Math.min(htmlOld.length, htmlNew.length);
      while (at < n && htmlOld[at] === htmlNew[at]) at += 1;
      const before = Math.max(0, at - 80);
      const report = [
        `# diff-${segment}（轉檔逐字驗收 FAIL）`,
        "",
        `舊側（現況 tsx）長度：${htmlOld.length} 字（${oldBytes.length} bytes）`,
        `新側（區塊 JSON）長度：${htmlNew.length} 字（${newBytes.length} bytes）`,
        `第一個差異在第 ${at} 字元（前後文各 80 字）：`,
        "",
        `── 舊側 ──`,
        `…${htmlOld.slice(before, at + 80)}…`,
        "",
        `── 新側 ──`,
        `…${htmlNew.slice(before, at + 80)}…`,
        "",
        "── 舊側全文 ──",
        htmlOld,
        "",
        "── 新側全文 ──",
        htmlNew,
        ""
      ].join("\n");
      fs.writeFileSync(diffPath, report);
      problems.push(`正文位元組不一致（第 ${at} 字元起），diff 已落地 ${path.relative(REPO_ROOT, diffPath)}`);
    }

    /* 2. metadata deep-equal（契約 4.4 正規化後逐欄比） */
    const { blocks: _blocks, ...jsonMeta } = data;
    const metaDiffs = [];
    diffPaths(normalizedPostMetadata(post), jsonMeta, "", metaDiffs);
    if (metaDiffs.length) {
      allPass = false;
      problems.push(`metadata 有 ${metaDiffs.length} 處差異：${metaDiffs.slice(0, 5).join("；")}`);
    }

    /* 3. editorNote 不遺失（.tsx 任意深度全掃 vs JSON；比數量＋逐條文字） */
    const fileName = sourceFiles.find((name) => name.startsWith(`${post.id}-`));
    if (!fileName) fail(context, "找不到原始 .tsx 檔");
    const comments = collectBodyComments(path.join(POSTS_DIR, fileName), context);
    const notes = data.blocks.content
      .filter((block) => block.type === "editorNote")
      .map((block) => block.attrs.text);

    let notesOk = comments.length === notes.length;
    if (notesOk) {
      /** 逐條文字比對。blockquote 與出處列中間夾註解時轉檔會把它排到 lawQuote 後面
       *（文字不變、順序可能移一格），所以排序後逐條比，不吃順序。 */
      const a = [...comments].sort();
      const b = [...notes].sort();
      notesOk = a.every((text, i) => text === b[i]);
    }
    if (!notesOk) {
      allPass = false;
      problems.push(`editorNote 對不上：.tsx 註解 ${comments.length} 條 vs JSON ${notes.length} 條（或文字不符）`);
    }
    /** 前台不 render：新側輸出不得含任何備註文字（取每條第一行當指紋即可）。 */
    const leaked = notes.filter((text) => htmlNew.includes(text.split("\n")[0]));
    if (leaked.length) {
      allPass = false;
      problems.push(`editorNote 文字外洩到前台輸出：${leaked.length} 條`);
    }

    const status = problems.length ? "FAIL" : "PASS";
    summaryRows.push(
      `| ${segment} | ${status} | ${bytesEqual ? `一致（${oldBytes.length} bytes）` : "不一致"} | ${metaDiffs.length === 0 ? "一致" : `${metaDiffs.length} 處`} | ${comments.length}／${notes.length}${notesOk ? "" : "（✗）"} |`
    );
    console.log(
      `② ${segment}：${status}｜正文 ${bytesEqual ? `byte 相等（${oldBytes.length} bytes）` : "有差異"}` +
        `｜metadata ${metaDiffs.length === 0 ? "一致" : `${metaDiffs.length} 處差異`}｜editorNote ${comments.length}→${notes.length}`
    );
    for (const problem of problems) console.log(`   ✗ ${problem}`);
  }

  const summary = [
    "# 轉檔逐字驗收總表（scripts/verify-migration.mjs 產出）",
    "",
    "> 比對方法：契約 INTERFACE-stage1.md 第七節——兩側同用 renderToStaticMarkup，",
    "> 正文任何一個 byte 差都算 FAIL；metadata 照契約 4.4 正規化後 deep-equal；",
    "> editorNote 掃原始 .tsx 的 body 區 JSX 註解（任意深度）逐條對 JSON。",
    "> 比對器正規化：目前零條（原樣 byte 比對）。本檔由腳本重跑覆寫，不含時間戳。",
    "",
    "| 篇 | 結果 | 正文位元組 | metadata | editorNote（tsx／JSON） |",
    "|---|---|---|---|---|",
    ...summaryRows,
    ""
  ].join("\n");
  fs.writeFileSync(path.join(REPORT_DIR, "summary.md"), summary);

  console.log(`③ 總表已寫出 report/summary.md`);
  console.log(allPass ? "✅ 五篇全 PASS（零差異）" : "❌ 有 FAIL，diff 落在 .blog-migration/diff-{segment}.txt");
  process.exitCode = allPass ? 0 : 1;
}

main();
