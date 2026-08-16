/**
 * 五篇舊文轉檔：src/content/posts/*.tsx（JSX）→ 結構化區塊 JSON（BlogPostData）。
 *
 * ```
 * node scripts/migrate-posts.mjs
 * ```
 *
 * ── 契約 ──
 * 區塊格式、對映規則、輸出位置全部照 docs/部落格/後台設計/INTERFACE-stage1.md
 * 與 src/content/blocks/types.ts。改格式＝改契約，先跟主控端說。
 *
 * ── 做法（為什麼不用正則啃 JSX）──
 * 內容走「編譯後的 ReactNode 樹」：用 repo 自帶的 tsc 把五篇（連同 import 鏈
 * @/lib/agency → @/lib/profile、BlSpec）編成 CommonJS，require 進來 walk
 * `post.body` 的 React element 樹。JSX 的空白規則（行首行尾修剪、文中換行縮成
 * 一個空白）由編譯器處理最準——自己實作這套規則是最容易產生逐字差異的地方。
 * 註解 render 不出來，另外用 TypeScript compiler API parse 原始碼抽
 * `const body = (…)` fragment 頂層的 JSX 註解容器（大括號包住的星號註解），
 * 依頂層序位跟元素對位合併，轉成 editorNote 區塊
 * （含「書亞：」開頭的位置備註，一條都不遺失）。
 *
 * ── 鐵則 ──
 * · 可重複執行、結果確定性：無亂數、不讀時間、輸出不含時間戳。
 * · 契約外的任何形狀（沒見過的元素、多出來的 prop、對不上的結構）一律**中止報錯**，
 *   不猜——契約外的東西出現，代表現況變了，要人看過。
 * · 不碰資料庫、不讀 .env：匯入 DB 是另一步（importPost），不在本腳本。
 * · 現網零影響：只寫 .blog-migration/（已在 .gitignore）底下的檔案。
 *
 * ── 輸出 ──
 * .blog-migration/posts/{id}.json        ← 正式產物（契約 §4.3 的位置，驗收與匯入讀這份）
 * .blog-migration/{id}-{slug}.json       ← 同內容的別名（主控端任務單寫的 {segment}.json）
 * .blog-migration/report/migrate-stats.md ← 統計與 02 文件實測數字的對照
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
const BUILD_DIR = path.join(MIGRATION_DIR, "_migrate-build");
const OUT_DIR = path.join(BUILD_DIR, "out");
const POSTS_OUT_DIR = path.join(MIGRATION_DIR, "posts");
const REPORT_DIR = path.join(MIGRATION_DIR, "report");

/** 出處列的行內樣式。四篇檔內同值（契約 §5.2 的 SRC_STYLE），轉檔時逐 key 驗證。 */
const SRC_STYLE = {
  fontSize: "13px",
  lineHeight: 1.7,
  color: "var(--bl-mut)",
  margin: "-8px 0 18px"
};

/** 全國法規資料庫單條頁（與 src/content/blocks/types.ts 的 mojLawUrl 同一條公式）。 */
const MOJ_SINGLE_RE = /^https:\/\/law\.moj\.gov\.tw\/LawClass\/LawSingle\.aspx\?pcode=([^&]+)&flno=([^&]+)$/;
const mojLawUrl = (pcode, flno) =>
  `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=${pcode}&flno=${flno}`;

/** 02-文章結構.md 第二節的實測數字（原始碼元素計數，逐篇對照用）。 */
const EXPECTED_02 = {
  1001: { srcComponents: 5, img: 5 },
  1002: { img: 0, blSpec: 1 },
  1003: { p: 168, h2: 14, strong: 115, img: 5, srcComponents: 13, blockquote: 13, ul: 8, ol: 10, li: 63, hr: 1, comments: 18 },
  1004: { img: 5, inlineA: 3 },
  1005: { p: 254, h2: 15, strong: 203, img: 5, srcComponents: 15, blockquote: 14, ul: 28, ol: 7, li: 120, hr: 1, comments: 19 }
};

const CATEGORY_SLUGS = new Set(["market-trend", "community-review", "tax-case", "legal-case", "deal-practice"]);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 中止報錯（帶上下文）。契約外的形狀不猜。 */
function fail(context, message) {
  throw new Error(`[${context}] ${message}`);
}

/* ───────────────────────────────────────────────
   第 1 步：把五篇（含 import 鏈）用 tsc 編成 CJS
   （照 .blog-migration/_schema-check 已驗證可行的模式）
   ─────────────────────────────────────────────── */

function compilePosts() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  const tsconfigPath = path.join(BUILD_DIR, "tsconfig.json");
  // 內容固定（確定性）。include 只列 posts/index.ts，import 鏈由 tsc 自己追。
  const tsconfig = {
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
    include: ["../../src/content/posts/index.ts"]
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

/* ───────────────────────────────────────────────
   第 2 步：require 編譯產物（@/ 別名 → out/src/）
   ─────────────────────────────────────────────── */

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
   React element 樹的小工具
   ─────────────────────────────────────────────── */

const React = require(path.join(REPO_ROOT, "node_modules", "react"));

function isElement(node) {
  return React.isValidElement(node);
}

/** 攤平 children：解陣列、丟掉 null／undefined／boolean（React 的不渲染值）。 */
function flattenChildren(children) {
  const out = [];
  const push = (node) => {
    if (node === null || node === undefined || typeof node === "boolean") return;
    if (Array.isArray(node)) {
      for (const item of node) push(item);
      return;
    }
    out.push(node);
  };
  push(children);
  return out;
}

/** 元素的「標籤名」：原生標籤回字串，function component 回函式名。 */
function treeTag(el) {
  if (typeof el.type === "string") return el.type;
  if (typeof el.type === "function" && el.type.name) return el.type.name;
  return "(unknown)";
}

function propKeys(el) {
  return Object.keys(el.props).filter((key) => key !== "children");
}

function assertProps(el, allowed, context) {
  for (const key of propKeys(el)) {
    if (!allowed.includes(key)) fail(context, `<${treeTag(el)}> 出現契約外的 prop「${key}」`);
  }
}

/* ───────────────────────────────────────────────
   行內層：children → runs（text 節點串）
   只有 bold 與 link 兩種 mark；巢狀（粗體裡有連結）中止。
   ─────────────────────────────────────────────── */

function runsFromChildren(children, marks, context) {
  const raw = [];
  const walk = (nodes, current) => {
    for (const node of nodes) {
      if (typeof node === "string" || typeof node === "number") {
        raw.push({ text: String(node), bold: current.bold, link: current.link });
        continue;
      }
      if (!isElement(node)) fail(context, `行內出現非元素、非文字的節點：${JSON.stringify(node)}`);
      if (node.type === React.Fragment) {
        walk(flattenChildren(node.props.children), current);
        continue;
      }
      const tag = treeTag(node);
      if (tag === "strong") {
        if (current.link) fail(context, "出現「連結裡有粗體」的巢狀 mark（契約禁止）");
        assertProps(node, [], context);
        walk(flattenChildren(node.props.children), { ...current, bold: true });
        continue;
      }
      if (tag === "a") {
        if (current.bold) fail(context, "出現「粗體裡有連結」的巢狀 mark（契約禁止）");
        assertProps(node, ["href", "rel", "target"], context);
        const { href } = node.props;
        if (typeof href !== "string" || !href) fail(context, "<a> 沒有 href");
        const target = node.props.target ?? null;
        const rel = node.props.rel ?? null;
        if (target !== null && target !== "_blank") fail(context, `<a> 的 target 是「${target}」（契約只允許 _blank 或 null）`);
        if (rel !== null && rel !== "noopener") fail(context, `<a> 的 rel 是「${rel}」（契約只允許 noopener 或 null）`);
        walk(flattenChildren(node.props.children), { ...current, link: { href, target, rel } });
        continue;
      }
      fail(context, `行內出現契約外的元素 <${tag}>`);
    }
  };
  walk(children, marks);

  /** 相鄰同格式的文字合併成一個節點（ProseMirror 規則），空字串丟掉。 */
  const merged = [];
  for (const run of raw) {
    if (run.text === "") continue;
    const prev = merged[merged.length - 1];
    const sameLink =
      prev &&
      ((prev.link === null && run.link === null) ||
        (prev.link !== null &&
          run.link !== null &&
          prev.link.href === run.link.href &&
          prev.link.target === run.link.target &&
          prev.link.rel === run.link.rel));
    if (prev && prev.bold === run.bold && sameLink) {
      prev.text += run.text;
    } else {
      merged.push({ ...run });
    }
  }

  return merged.map((run) => {
    const node = { type: "text", text: run.text };
    if (run.bold) node.marks = [{ type: "bold" }];
    else if (run.link) {
      node.marks = [{ type: "link", attrs: { href: run.link.href, target: run.link.target, rel: run.link.rel } }];
    }
    return node;
  });
}

function runsFromNode(node, context) {
  return runsFromChildren(flattenChildren(node), { bold: false, link: null }, context);
}

/* ───────────────────────────────────────────────
   區塊層：各元素 → 區塊
   ─────────────────────────────────────────────── */

function buildParagraph(el, context) {
  const runs = runsFromNode(el.props.children, context);
  if (!runs.length) fail(context, "空的 <p>（契約外）");
  return { type: "paragraph", content: runs };
}

function buildHeading(el, context) {
  assertProps(el, ["id"], context);
  const id = el.props.id;
  if (typeof id !== "string" || !id) fail(context, "<h2> 沒有 id（目錄錨點必填）");
  const runs = runsFromNode(el.props.children, context);
  if (!runs.length) fail(context, "空的 <h2>");
  return { type: "heading", attrs: { level: 2, id }, content: runs };
}

function buildImage(img, mediaBase, context) {
  assertProps(img, ["src", "alt", "width", "height", "loading"], context);
  const { src, alt, width, height, loading } = img.props;
  if (typeof src !== "string" || !src.startsWith(`${mediaBase}/`)) {
    fail(context, `<img> 的 src「${src}」沒有以「${mediaBase}/」開頭（MEDIA 常數是手寫的，錯了要人修）`);
  }
  const file = src.slice(mediaBase.length + 1);
  if (!file || file.includes("/")) fail(context, `<img> 的檔名「${file}」不合法`);
  if (typeof alt !== "string" || !alt) fail(context, "<img> 沒有 alt");
  if (typeof width !== "number" || typeof height !== "number") fail(context, "<img> 的 width/height 不是數字");
  if (loading !== "lazy" && loading !== "eager") fail(context, `<img> 的 loading 是「${loading}」`);
  return { type: "image", attrs: { file, alt, width, height, loading } };
}

function buildList(el, ordered, context) {
  /**
   * `<ol start>`：契約原本寫「五篇沒有」，實測 1004 第十三節有四個（5／10／15／19，
   * 十八個動作分四段接續編號）。schema 本來就支援 attrs.start，照存；
   * 渲染端規則不變（缺省或 1 不輸出）。
   */
  assertProps(el, ordered ? ["start"] : [], context);
  let start;
  if (ordered && el.props.start !== undefined) {
    start = el.props.start;
    if (typeof start !== "number" || !Number.isInteger(start) || start < 2) {
      fail(context, `<ol> 的 start「${start}」不是 ≥2 的整數`);
    }
  }
  const items = flattenChildren(el.props.children);
  if (!items.length) fail(context, "空的清單");
  const content = items.map((li, index) => {
    const itemContext = `${context} > li#${index + 1}`;
    if (!isElement(li) || treeTag(li) !== "li") fail(itemContext, "清單的子節點不是 <li>");
    assertProps(li, [], itemContext);
    const kids = flattenChildren(li.props.children);
    for (const kid of kids) {
      if (isElement(kid) && (treeTag(kid) === "ul" || treeTag(kid) === "ol")) {
        fail(itemContext, "出現巢狀清單（五篇實況沒有，契約要中止）");
      }
    }
    const runs = runsFromChildren(kids, { bold: false, link: null }, itemContext);
    if (!runs.length) fail(itemContext, "空的 <li>");
    /** 契約：<li> 內容包成單一 paragraph（渲染端會把 <p> 拆回去）。 */
    return { type: "listItem", content: [{ type: "paragraph", content: runs }] };
  });
  if (!ordered) return { type: "bulletList", content };
  return start === undefined
    ? { type: "orderedList", content }
    : { type: "orderedList", attrs: { start }, content };
}

/** 把 items（{text, href}）分類成 moj／url 兩型出處。 */
function classifySources(items, context) {
  return items.map((item, index) => {
    const itemContext = `${context} > 出處#${index + 1}`;
    const keys = Object.keys(item);
    if (keys.length !== 2 || typeof item.text !== "string" || typeof item.href !== "string") {
      fail(itemContext, `item 的形狀不對：${JSON.stringify(keys)}`);
    }
    if (!item.text) fail(itemContext, "出處顯示文字是空的");
    const match = MOJ_SINGLE_RE.exec(item.href);
    if (match) {
      const [, pcode, flno] = match;
      if (mojLawUrl(pcode, flno) !== item.href) fail(itemContext, `moj 網址拆組不可逆：${item.href}`);
      return { kind: "moj", text: item.text, pcode, flno };
    }
    if (!item.href.startsWith("https://")) fail(itemContext, `出處網址不是 https：${item.href}`);
    return { kind: "url", text: item.text, href: item.href };
  });
}

/**
 * 抽出 Src／LawSource 的 label 與 sources。
 * label 逐字取自元件的 render 輸出（五篇刻意不同：「條文出處：全國法規資料庫－」／
 * 「原文出處：」／「原文連結：」，防抄襲設計）；同時逐項驗證 render 出來的
 * span／「、」分隔／a 結構與 props.items 一致，SRC_STYLE 逐 key 相等——
 * 這些是渲染器（契約 §5.2）byte 級重現的前提，對不上就中止。
 */
function extractSourceParts(el, context) {
  assertProps(el, ["items"], context);
  const items = el.props.items;
  if (!Array.isArray(items) || !items.length) fail(context, "items 不是非空陣列");

  const rendered = el.type(el.props);
  if (!isElement(rendered) || treeTag(rendered) !== "p") fail(context, "出處元件 render 出來不是 <p>");
  const style = rendered.props.style;
  const styleKeys = Object.keys(SRC_STYLE);
  if (!style || Object.keys(style).length !== styleKeys.length) fail(context, "SRC_STYLE 的 key 數對不上");
  for (const key of styleKeys) {
    if (style[key] !== SRC_STYLE[key]) {
      fail(context, `SRC_STYLE.${key} 是「${style[key]}」，契約值是「${SRC_STYLE[key]}」`);
    }
  }

  const kids = flattenChildren(rendered.props.children);
  let label = "";
  let index = 0;
  while (index < kids.length && typeof kids[index] === "string") {
    label += kids[index];
    index += 1;
  }
  if (!label) fail(context, "出處列沒有開頭字（label）");
  const spans = kids.slice(index);
  if (spans.length !== items.length) fail(context, `出處 span 數（${spans.length}）≠ items 數（${items.length}）`);
  spans.forEach((span, i) => {
    const spanContext = `${context} > span#${i + 1}`;
    if (!isElement(span) || treeTag(span) !== "span") fail(spanContext, "不是 <span>");
    const inner = flattenChildren(span.props.children);
    const expectSep = i > 0 ? 1 : 0;
    if (inner.length !== 1 + expectSep) fail(spanContext, "span 的子節點數不對");
    if (expectSep && inner[0] !== "、") fail(spanContext, "分隔符不是「、」");
    const anchor = inner[inner.length - 1];
    if (!isElement(anchor) || treeTag(anchor) !== "a") fail(spanContext, "span 裡不是 <a>");
    if (anchor.props.href !== items[i].href) fail(spanContext, "a 的 href 與 items 對不上");
    if (anchor.props.rel !== "noopener" || anchor.props.target !== "_blank") {
      fail(spanContext, "a 的 rel/target 不是 noopener/_blank");
    }
    const text = flattenChildren(anchor.props.children);
    if (text.length !== 1 || text[0] !== items[i].text) fail(spanContext, "a 的連結文字與 items 對不上");
  });

  return { label, sources: classifySources(items, context) };
}

function buildLawQuote(blockquote, srcEl, context) {
  assertProps(blockquote, [], context);
  const paragraphs = flattenChildren(blockquote.props.children).map((p, index) => {
    const pContext = `${context} > 引文段#${index + 1}`;
    if (!isElement(p) || treeTag(p) !== "p") fail(pContext, "blockquote 裡出現不是 <p> 的節點");
    assertProps(p, [], pContext);
    return buildParagraph(p, pContext);
  });
  if (!paragraphs.length) fail(context, "空的 <blockquote>");
  const attrs = srcEl
    ? extractSourceParts(srcEl, `${context} > 出處列`)
    : { label: null, sources: [] };
  return { type: "lawQuote", attrs, content: paragraphs };
}

/** 獨立出處列（前面不是 blockquote 的 <Src>；1005 唯一一例，契約 2026-08-16 追加）。 */
function buildSourceLine(el, context) {
  const { label, sources } = extractSourceParts(el, context);
  return { type: "sourceLine", attrs: { label, sources } };
}

/** 驗證「目錄 ul」與 post.toc 完全一致（順序、id、文字），一致才轉成 tocList。 */
function buildTocList(el, toc, context) {
  assertProps(el, [], context);
  const items = flattenChildren(el.props.children);
  if (items.length !== toc.length) {
    fail(context, `目錄 ul 有 ${items.length} 項，post.toc 有 ${toc.length} 項`);
  }
  items.forEach((li, i) => {
    const liContext = `${context} > 目錄項#${i + 1}`;
    if (!isElement(li) || treeTag(li) !== "li") fail(liContext, "不是 <li>");
    const inner = flattenChildren(li.props.children);
    if (inner.length !== 1 || !isElement(inner[0]) || treeTag(inner[0]) !== "a") fail(liContext, "不是單一 <a>");
    const anchor = inner[0];
    if (anchor.props.href !== `#${toc[i].id}`) {
      fail(liContext, `href「${anchor.props.href}」≠「#${toc[i].id}」`);
    }
    const text = flattenChildren(anchor.props.children);
    if (text.length !== 1 || text[0] !== toc[i].text) {
      fail(liContext, `目錄文字與 post.toc 對不上：「${text.join("")}」≠「${toc[i].text}」`);
    }
  });
  return { type: "tocList" };
}

function buildSpecTable(el, context) {
  assertProps(el, ["title", "badge", "rows", "tag", "source"], context);
  const { title, badge, rows, tag, source } = el.props;
  if (typeof title !== "string" || !title) fail(context, "BlSpec 沒有 title");
  if (badge !== undefined && typeof badge !== "string") fail(context, "BlSpec 的 badge 不是字串");
  if (typeof source !== "string" || !source) fail(context, "BlSpec 沒有 source（不捏造數據的鐵律欄位）");
  if (!Array.isArray(rows) || !rows.length) fail(context, "BlSpec 的 rows 不是非空陣列");
  const rowAttrs = rows.map((row, index) => {
    const rowContext = `${context} > 規格列#${index + 1}`;
    const keys = Object.keys(row);
    if (keys.length !== 2 || typeof row.label !== "string" || !row.label) {
      fail(rowContext, `列的形狀不對：${JSON.stringify(keys)}`);
    }
    const value = runsFromNode(row.value, rowContext);
    if (!value.length) fail(rowContext, "列的 value 是空的");
    return { label: row.label, value };
  });
  const tagRuns = tag === undefined ? null : runsFromNode(tag, `${context} > tag`);
  if (tagRuns !== null && !tagRuns.length) fail(context, "BlSpec 的 tag 是空的");
  return {
    type: "specTable",
    attrs: { title, badge: badge ?? null, rows: rowAttrs, tag: tagRuns, source }
  };
}

/* ───────────────────────────────────────────────
   註解層：TypeScript AST 抽 body 頂層序列
   ─────────────────────────────────────────────── */

const ts = require(path.join(REPO_ROOT, "node_modules", "typescript"));

/** JSX 註解容器 → editorNote 文字：逐行 trim、去頭尾空行、內部換行保留。 */
function commentContainerText(containerText, context) {
  const inner = containerText.trim();
  const match = /^\/\*([\s\S]*?)\*\/$/.exec(inner);
  if (!match) fail(context, `頂層表達式容器不是註解：${inner.slice(0, 40)}…`);
  const lines = match[1].split(/\r\n|\n|\r/).map((line) => line.trim());
  while (lines.length && lines[0] === "") lines.shift();
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const text = lines.join("\n");
  if (!text) fail(context, "空的註解容器");
  return text;
}

/**
 * 讀原始檔，回傳：
 * · sequence：body fragment 頂層的有序序列（{kind:"el", tag} 或 {kind:"note", text}）
 * · bodySource：body 的原始碼片段（統計用）
 * 深層（非頂層）的 JSX 註解容器一律中止——代表現況變了，要人看過。
 */
function readBodyAst(filePath, context) {
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

  /** 深層註解掃描：fragment 底下所有 JsxExpression-無-expression 的節點必須在頂層。 */
  const deepScan = (node) => {
    if (ts.isJsxExpression(node) && node.expression === undefined && node.parent !== fragment) {
      const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      fail(context, `第 ${pos.line + 1} 行出現非頂層的 JSX 註解（契約假設全部在頂層，要人看過）`);
    }
    ts.forEachChild(node, deepScan);
  };
  deepScan(fragment);

  const sequence = [];
  for (const child of fragment.children) {
    if (ts.isJsxText(child)) {
      if (!child.containsOnlyTriviaWhiteSpaces) fail(context, "body 頂層出現裸文字（契約外）");
      continue;
    }
    if (ts.isJsxExpression(child)) {
      if (child.expression !== undefined) fail(context, "body 頂層出現表達式（契約外）");
      const text = source.slice(child.getStart(sf) + 1, child.end - 1);
      sequence.push({ kind: "note", text: commentContainerText(text, context) });
      continue;
    }
    if (ts.isJsxElement(child)) {
      sequence.push({ kind: "el", tag: child.openingElement.tagName.getText(sf) });
      continue;
    }
    if (ts.isJsxSelfClosingElement(child)) {
      sequence.push({ kind: "el", tag: child.tagName.getText(sf) });
      continue;
    }
    fail(context, `body 頂層出現沒見過的節點種類：${ts.SyntaxKind[child.kind]}`);
  }

  return { sequence, bodySource: source.slice(fragment.getStart(sf), fragment.end) };
}

/* ───────────────────────────────────────────────
   主轉換：AST 序列 × ReactNode 樹 → 區塊陣列
   ─────────────────────────────────────────────── */

const SRC_TAGS = new Set(["Src", "LawSource"]);

function convertBody(post, sequence, articleSignature, context) {
  const mediaBase = `/blog/${post.id}-${post.slug}`;
  const body = post.body;
  if (!isElement(body) || body.type !== React.Fragment) fail(context, "post.body 不是 fragment");
  const els = flattenChildren(body.props.children);
  for (const el of els) {
    if (!isElement(el)) fail(context, `body 頂層出現非元素節點：${JSON.stringify(el).slice(0, 60)}`);
  }

  /** AST 元素序列與 ReactNode 樹頂層一一對位（數量與標籤都要對得上）。 */
  const astEls = sequence.filter((item) => item.kind === "el");
  if (astEls.length !== els.length) {
    fail(context, `AST 頂層元素 ${astEls.length} 個 ≠ ReactNode 樹頂層 ${els.length} 個`);
  }
  astEls.forEach((item, i) => {
    if (item.tag !== treeTag(els[i])) {
      fail(context, `第 ${i + 1} 個頂層元素對不上：AST 是 <${item.tag}>，樹是 <${treeTag(els[i])}>`);
    }
  });

  const blocks = [];
  let k = 0; // ReactNode 樹頂層的游標
  for (let i = 0; i < sequence.length; i++) {
    const item = sequence[i];
    if (item.kind === "note") {
      blocks.push({ type: "editorNote", attrs: { text: item.text } });
      continue;
    }
    const el = els[k];
    const blockContext = `${context} > 頂層#${k + 1} <${item.tag}>`;

    if (item.tag === "blockquote") {
      /** 往後找下一個元素（跳過中間的註解）：是 Src/LawSource 就併成同一塊。 */
      let j = i + 1;
      const pendingNotes = [];
      while (j < sequence.length && sequence[j].kind === "note") {
        pendingNotes.push(sequence[j]);
        j += 1;
      }
      if (j < sequence.length && sequence[j].kind === "el" && SRC_TAGS.has(sequence[j].tag)) {
        blocks.push(buildLawQuote(el, els[k + 1], blockContext));
        /** 夾在 blockquote 與出處列中間的註解，跟在合併後的 lawQuote 後面（不遺失）。 */
        for (const note of pendingNotes) blocks.push({ type: "editorNote", attrs: { text: note.text } });
        i = j;
        k += 2;
      } else {
        blocks.push(buildLawQuote(el, null, blockContext));
        k += 1;
      }
      continue;
    }

    if (SRC_TAGS.has(item.tag)) {
      /** 前面不是 blockquote 的出處列 → 獨立 sourceLine（1005 唯一一例）。 */
      blocks.push(buildSourceLine(el, blockContext));
      k += 1;
      continue;
    }

    switch (item.tag) {
      case "p": {
        const kids = flattenChildren(el.props.children);
        if (kids.length === 1 && isElement(kids[0]) && treeTag(kids[0]) === "img") {
          assertProps(el, [], blockContext);
          blocks.push(buildImage(kids[0], mediaBase, blockContext));
        } else if (kids.length === 1 && kids[0] === articleSignature) {
          assertProps(el, [], blockContext);
          blocks.push({ type: "signature" });
        } else {
          assertProps(el, [], blockContext);
          blocks.push(buildParagraph(el, blockContext));
        }
        break;
      }
      case "h2":
        blocks.push(buildHeading(el, blockContext));
        break;
      case "ul": {
        const prev = els[k - 1];
        if (prev && isElement(prev) && treeTag(prev) === "h2" && prev.props.id === "toc") {
          blocks.push(buildTocList(el, post.toc, blockContext));
        } else {
          blocks.push(buildList(el, false, blockContext));
        }
        break;
      }
      case "ol":
        blocks.push(buildList(el, true, blockContext));
        break;
      case "hr":
        assertProps(el, [], blockContext);
        blocks.push({ type: "horizontalRule" });
        break;
      case "BlSpec":
        blocks.push(buildSpecTable(el, blockContext));
        break;
      default:
        fail(blockContext, "契約外的頂層元素（不猜，要人看過）");
    }
    k += 1;
  }
  if (k !== els.length) fail(context, `轉完後樹游標停在 ${k}，但頂層有 ${els.length} 個元素`);

  /** 每篇必須恰好一個目錄與一個署名列（結構性防呆）。 */
  const tocCount = blocks.filter((b) => b.type === "tocList").length;
  const sigCount = blocks.filter((b) => b.type === "signature").length;
  if (tocCount !== 1) fail(context, `tocList 有 ${tocCount} 個（應為 1）`);
  if (sigCount !== 1) fail(context, `signature 有 ${sigCount} 個（應為 1）`);

  return { type: "doc", content: blocks };
}

/* ───────────────────────────────────────────────
   metadata 正規化（契約 §4.4：Post → BlogPostData）
   ─────────────────────────────────────────────── */

const POST_KEYS = new Set([
  "id", "slug", "title", "description", "category", "keywords", "publishedAt",
  "updatedAt", "draft", "excerpt", "cover", "verdict", "tldr", "toc", "faq", "body", "ctaLead"
]);

function normalizeMetadata(post, blocks, context) {
  for (const key of Object.keys(post)) {
    if (!POST_KEYS.has(key)) fail(context, `Post 出現契約外的欄位「${key}」`);
  }
  if (post.draft !== false) fail(context, "draft 不是 false（契約假設五篇皆已上線）");
  if (!CATEGORY_SLUGS.has(post.category)) fail(context, `分類「${post.category}」不在五個合法值裡`);
  if (!ISO_DATE_RE.test(post.publishedAt)) fail(context, `publishedAt「${post.publishedAt}」不是 YYYY-MM-DD`);
  if (post.updatedAt !== undefined && !ISO_DATE_RE.test(post.updatedAt)) {
    fail(context, `updatedAt「${post.updatedAt}」不是 YYYY-MM-DD`);
  }
  if (post.cover !== undefined && typeof post.cover !== "string") fail(context, "cover 不是字串");
  const verdictKeys = Object.keys(post.verdict);
  if (verdictKeys.length !== 4 || ["q", "aBold", "aRest", "note"].some((key) => typeof post.verdict[key] !== "string")) {
    fail(context, `verdict 的形狀不對：${JSON.stringify(verdictKeys)}`);
  }

  /** 欄位順序照 blog-db.ts 的 BlogPostData 宣告順序（輸出 JSON 的 key 序確定性）。 */
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    description: post.description,
    category: post.category,
    keywords: post.keywords.map((keyword) => {
      if (typeof keyword !== "string" || !keyword) fail(context, "keywords 出現非字串");
      return keyword;
    }),
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt ?? null,
    cover: post.cover ?? null,
    excerpt: post.excerpt,
    verdict: { q: post.verdict.q, aBold: post.verdict.aBold, aRest: post.verdict.aRest, note: post.verdict.note },
    tldr: post.tldr,
    toc: post.toc.map((item) => {
      const keys = Object.keys(item);
      if (keys.length !== 2 || typeof item.id !== "string" || typeof item.text !== "string") {
        fail(context, `toc 項的形狀不對：${JSON.stringify(keys)}`);
      }
      return { id: item.id, text: item.text };
    }),
    faq: post.faq.map((item) => {
      const keys = Object.keys(item);
      if (keys.length !== 2 || typeof item.q !== "string" || typeof item.a !== "string") {
        fail(context, `faq 項的形狀不對：${JSON.stringify(keys)}`);
      }
      return { q: item.q, a: item.a };
    }),
    blocks,
    ctaLead: post.ctaLead
  };
}

/* ───────────────────────────────────────────────
   統計：區塊計數＋原始碼元素計數（對照 02 文件）
   ─────────────────────────────────────────────── */

const BLOCK_TYPES = [
  "paragraph", "heading", "lawQuote", "sourceLine", "bulletList", "orderedList",
  "image", "horizontalRule", "specTable", "tocList", "signature", "editorNote"
];

function countMatches(text, re) {
  let count = 0;
  const global = new RegExp(re.source, "g");
  while (global.exec(text) !== null) count += 1;
  return count;
}

function collectStats(doc, bodySource, sequence) {
  const blockCounts = {};
  for (const type of BLOCK_TYPES) blockCounts[type] = 0;
  for (const block of doc.content) blockCounts[block.type] += 1;

  const shuyaNotes = doc.content
    .filter((block) => block.type === "editorNote" && block.attrs.text.startsWith("書亞"))
    .map((block) => block.attrs.text.split("\n")[0]);

  /** 行內連結 mark 計數（tocList 是 atom、出處列在 attrs，都不算行內連結）。 */
  let inlineLinks = 0;
  const walkRuns = (runs) => {
    for (const run of runs) if (run.marks && run.marks[0].type === "link") inlineLinks += 1;
  };
  for (const block of doc.content) {
    if (block.type === "paragraph" || block.type === "heading") walkRuns(block.content);
    if (block.type === "lawQuote") for (const p of block.content) walkRuns(p.content);
    if (block.type === "bulletList" || block.type === "orderedList") {
      for (const li of block.content) for (const p of li.content) walkRuns(p.content);
    }
  }

  /** 原始碼元素計數——跟 02 文件同一種量法（掃 body 區段的原始碼）。 */
  const sourceCounts = {
    p: countMatches(bodySource, /<p>/),
    h2: countMatches(bodySource, /<h2 /),
    strong: countMatches(bodySource, /<strong>/),
    img: countMatches(bodySource, /<img/),
    srcComponents: countMatches(bodySource, /<(?:Src|LawSource)[\s/>]/),
    blockquote: countMatches(bodySource, /<blockquote>/),
    ul: countMatches(bodySource, /<ul>/),
    ol: countMatches(bodySource, /<ol[\s>]/),
    li: countMatches(bodySource, /<li[\s>]/),
    hr: countMatches(bodySource, /<hr/),
    blSpec: countMatches(bodySource, /<BlSpec/),
    inlineA: countMatches(bodySource, /<a href=\{(?!`#)/),
    comments: sequence.filter((item) => item.kind === "note").length
  };

  return { blockCounts, total: doc.content.length, shuyaNotes, inlineLinks, sourceCounts };
}

function compareWith02(id, stats) {
  const expected = EXPECTED_02[id] || {};
  const lines = [];
  let mismatch = 0;
  for (const [key, want] of Object.entries(expected)) {
    const got = stats.sourceCounts[key];
    const ok = got === want;
    if (!ok) mismatch += 1;
    lines.push(`${key}: 實測 ${got}／02 文件 ${want} ${ok ? "✓" : "✗ 對不上"}`);
  }
  return { lines, mismatch };
}

/* ───────────────────────────────────────────────
   主程式
   ─────────────────────────────────────────────── */

function main() {
  console.log("① tsc 編譯五篇（含 import 鏈）→ .blog-migration/_migrate-build/out/");
  compilePosts();
  installAliasHook();

  const registry = require(path.join(OUT_DIR, "src", "content", "posts", "index.js"));
  const { ARTICLE_SIGNATURE } = require(path.join(OUT_DIR, "src", "lib", "agency.js"));
  const posts = registry.POSTS;
  if (!Array.isArray(posts) || posts.length !== 5) {
    fail("registry", `POSTS 有 ${posts && posts.length} 篇（預期 5）`);
  }

  fs.mkdirSync(POSTS_OUT_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const sourceFiles = fs.readdirSync(POSTS_DIR).filter((name) => /^\d{4}-.+\.tsx$/.test(name));
  const reportSections = [];
  const summaryRows = [];
  let totalMismatch = 0;

  for (const post of posts) {
    const context = `post ${post.id}`;
    const segment = `${post.id}-${post.slug}`;
    const fileName = sourceFiles.find((name) => name.startsWith(`${post.id}-`));
    if (!fileName) fail(context, "找不到原始 .tsx 檔");
    if (fileName !== `${segment}.tsx`) fail(context, `檔名「${fileName}」與 segment「${segment}」對不上`);

    console.log(`② ${segment}：AST 抽註解 → 走訪 ReactNode 樹 → 區塊 JSON`);
    const { sequence, bodySource } = readBodyAst(path.join(POSTS_DIR, fileName), context);
    const doc = convertBody(post, sequence, ARTICLE_SIGNATURE, context);
    const data = normalizeMetadata(post, doc, context);

    const json = JSON.stringify(data, null, 2) + "\n";
    fs.writeFileSync(path.join(POSTS_OUT_DIR, `${post.id}.json`), json);
    /** 同內容別名（主控端任務單的 {segment}.json；正式產物是 posts/{id}.json）。 */
    fs.writeFileSync(path.join(MIGRATION_DIR, `${segment}.json`), json);

    const stats = collectStats(doc, bodySource, sequence);
    const cmp = compareWith02(post.id, stats);
    totalMismatch += cmp.mismatch;

    const blockLines = BLOCK_TYPES.filter((type) => stats.blockCounts[type] > 0)
      .map((type) => `${type} ${stats.blockCounts[type]}`)
      .join("／");
    summaryRows.push(
      `| ${segment} | ${stats.total} | ${stats.blockCounts.editorNote} | ${stats.blockCounts.lawQuote} | ${stats.inlineLinks} | ${cmp.mismatch === 0 ? "全對" : `${cmp.mismatch} 項對不上`} |`
    );
    reportSections.push(
      [
        `## ${segment}`,
        "",
        `- 區塊總數：${stats.total}`,
        `- 各型別：${blockLines}`,
        `- editorNote：${stats.blockCounts.editorNote} 條（其中「書亞：」開頭 ${stats.shuyaNotes.length} 條，逐條列於下）`,
        ...stats.shuyaNotes.map((note) => `  - ${note}`),
        `- 行內連結 mark：${stats.inlineLinks} 個`,
        `- 出處分類：lawQuote ${stats.blockCounts.lawQuote} 塊（其中無出處列 ${doc.content.filter((b) => b.type === "lawQuote" && b.attrs.label === null).length} 塊）、sourceLine ${stats.blockCounts.sourceLine} 塊`,
        "",
        "與 02 文件實測數字對照（原始碼元素計數，同量法）：",
        "",
        ...(cmp.lines.length ? cmp.lines.map((line) => `- ${line}`) : ["-（02 文件對這篇沒有列出逐項數字）"]),
        "",
        `原始碼計數全表：p ${stats.sourceCounts.p}、h2 ${stats.sourceCounts.h2}、strong ${stats.sourceCounts.strong}、img ${stats.sourceCounts.img}、` +
          `Src/LawSource ${stats.sourceCounts.srcComponents}、blockquote ${stats.sourceCounts.blockquote}、ul ${stats.sourceCounts.ul}、ol ${stats.sourceCounts.ol}、` +
          `li ${stats.sourceCounts.li}、hr ${stats.sourceCounts.hr}、BlSpec ${stats.sourceCounts.blSpec}、行內 a ${stats.sourceCounts.inlineA}、JSX 註解 ${stats.sourceCounts.comments}`,
        ""
      ].join("\n")
    );

    console.log(
      `   → 區塊 ${stats.total}｜editorNote ${stats.blockCounts.editorNote}｜lawQuote ${stats.blockCounts.lawQuote}` +
        `｜sourceLine ${stats.blockCounts.sourceLine}｜02 對照 ${cmp.mismatch === 0 ? "全對" : `${cmp.mismatch} 項對不上`}`
    );
  }

  const report = [
    "# 轉檔統計（scripts/migrate-posts.mjs 產出）",
    "",
    "> 本檔由腳本重跑覆寫，不含時間戳。對照基準：docs/部落格/後台設計/02-文章結構.md 第二節的實測數字",
    "> （同一種量法：掃 `const body = (…)` 區段的原始碼）。正式產物是 `posts/{id}.json`，",
    "> `{id}-{slug}.json` 是同內容別名。渲染逐字驗收（diff 報告）由驗收腳本另出，不在本檔。",
    "",
    "| 篇 | 區塊數 | editorNote | lawQuote | 行內連結 | 02 對照 |",
    "|---|---:|---:|---:|---:|---|",
    ...summaryRows,
    "",
    ...reportSections
  ].join("\n");
  fs.writeFileSync(path.join(REPORT_DIR, "migrate-stats.md"), report);

  console.log(`③ 已寫出 ${posts.length} 篇 JSON 與 report/migrate-stats.md`);
  if (totalMismatch > 0) {
    console.log(`⚠️ 與 02 文件的對照有 ${totalMismatch} 項對不上（量法差異或現況已變），詳見 report/migrate-stats.md`);
  } else {
    console.log("✅ 與 02 文件的實測數字逐項全對");
  }
}

main();
