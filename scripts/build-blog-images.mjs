/**
 * 部落格圖片產生器（SVG → PNG，用 sharp）
 * =====================================================================
 * 跑法：`node scripts/build-blog-images.mjs`（要在專案根目錄跑，不然找不到 sharp）
 * 產物：全部寫進 `public/blog/`，一次覆蓋，**不會刪掉不在清單裡的舊檔**。
 *
 * ── 為什麼是「腳本產圖」不是「丟一張圖進去」 ──
 * 圖上有經紀業名稱、分類名、社區戶數這些會變的字。用手繪圖，改一個字要重畫；
 * 用腳本，改一行字重跑就好，而且每張圖的色票、字型、留白天生一致。
 *
 * 🔴 三條規矩
 *   1. **不可有亂數、不可讀當下時間**。同樣的原始碼要能產出位元組相同的 PNG，
 *      不然每次重跑 git 都會看到一堆假異動。
 *   2. **色票只准用 `PALETTE`**（＝ `src/app/blog/blog.css` 的代幣）。不要臨時調色。
 *   3. **不畫人物、不畫房子照片、不模仿手繪漫畫**。走排版型／示意圖型：
 *      大字標題 ＋ 幾何色塊 ＋ 極簡線條。畫不出同等品質的東西，硬做只會廉價。
 *
 * ── 中文字型（這一段是踩過才知道的）──
 * sharp 內建 libvips 帶了 pango / fontconfig / freetype，**吃得下 SVG 裡的中文**，
 * 但字型是從**作業系統**找的，不是從專案找的。本機（Windows）實測：
 * `Noto Sans TC` 沒裝 → fallback 到 `Microsoft JhengHei`，中文正常、粗體正常、
 * 全形空格（U+3000）正常。所以 `<style>` 裡一定要寫完整 fallback 鏈。
 * 🔴 換一台機器（尤其 Linux CI）重跑之前，**先開一張圖看中文有沒有變成豆腐方塊**，
 *    不要只看到「檔案產出來了」就當作成功。要救的話裝一套 Noto Sans TC 就好。
 *
 * ── 尺寸為什麼是這幾個 ──
 *   cover / og   1200 × 630 ：社群分享規格，Facebook 與 LINE 照這個比例裁。
 *   fig-XX       1200 × 675 ：16:9。這個高度**必須**等於文章 `<img>` 的 `height={675}`，
 *                             對不上就會有版面跳動（CLS）。見 `docs/blog-images.md`。
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

/* ═══════════════════════════════════════════════════════════════
   0. 共用設定
   ═══════════════════════════════════════════════════════════════ */

/** 產出根目錄：`public/blog/`。本腳本只寫這底下的東西。 */
const OUT_ROOT = path.resolve(import.meta.dirname, "..", "public", "blog");

/**
 * 色票 ＝ `src/app/blog/blog.css` 的 `--bl-*` 代幣。
 * 🔴 只准用這裡面的顏色。要加新色請先去改 blog.css，再同步過來。
 */
const P = {
  deep: "#005335", // 有巢氏綠（主）：深底、頁首、實心方塊
  deep2: "#0A6D48", // 次深綠：內層底、說明線條
  green: "#4FAF38", // 輔綠：只用在深底上的小字與線（白底上對比不足）
  accent: "#D9660A", // 橘：重點、強調框、書字方塊
  accent2: "#B85305", // 深橘：白底上的橘字（純橘在白底偏亮）
  band: "#CDE3D5", // 淺綠帶：深底上的次要文字、示意色塊
  line: "#D8E7DD", // 邊框
  paper: "#F2F7F3", // 淺底
  ink: "#173D30", // 內文字色
  white: "#FFFFFF"
};

/**
 * 字型堆疊。⚠️ 見檔頭「中文字型」那一段——這串是寫給**作業系統**看的，
 * 專案裡沒有這些字型檔，找不到就會 fallback，最後一關永遠是 sans-serif。
 */
const FONT_STACK = `"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;

/* ═══════════════════════════════════════════════════════════════
   1. SVG 小工具
   ═══════════════════════════════════════════════════════════════ */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 粗估一段文字的寬度（px）。
 * SVG 沒有自動斷行，每一行都是手排的，所以需要一把尺來擋「字比框長」。
 * 中日韓字寬 ≈ 1 em、拉丁字母與數字 ≈ 0.56 em、半形空白 ≈ 0.28 em。
 * 這是估算不是量測，只拿來在 build 時印警告，不參與排版計算。
 */
function measure(str, size) {
  let units = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (ch === "　") units += 1; // 全形空格
    else if (code < 0x2e80) units += /[A-Za-z0-9]/.test(ch) ? 0.56 : ch === " " ? 0.28 : 0.42;
    else units += 1;
  }
  return units * size;
}

/** 排版檢查：文字超出可用寬度就印警告（不 throw，讓你先看到圖再決定怎麼改）。 */
const overflows = [];
function fit(where, str, size, maxWidth) {
  const width = measure(str, size);
  if (width > maxWidth) {
    overflows.push(`${where}：「${str}」估寬 ${Math.round(width)}px > 可用 ${maxWidth}px`);
  }
  return str;
}

/** `<text>`。`anchor` 用 middle/end 做置中與靠右，不用自己算寬度。 */
function T(str, { x = 0, y = 0, size = 28, weight = 400, fill = P.ink, anchor, ls } = {}) {
  const attrs = [`x="${x}"`, `y="${y}"`, `font-size="${size}"`, `font-weight="${weight}"`, `fill="${fill}"`];
  if (anchor) attrs.push(`text-anchor="${anchor}"`);
  if (ls) attrs.push(`letter-spacing="${ls}"`);
  return `<text ${attrs.join(" ")}>${esc(str)}</text>`;
}

/** `<rect>`。`dash` 給虛線框；`sw` 是 stroke-width。 */
function R(x, y, w, h, { fill = "none", stroke, sw = 0, rx = 0, dash, opacity } = {}) {
  const attrs = [`x="${x}"`, `y="${y}"`, `width="${w}"`, `height="${h}"`, `fill="${fill}"`];
  if (rx) attrs.push(`rx="${rx}"`);
  if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${sw || 2}"`);
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  if (opacity !== undefined) attrs.push(`fill-opacity="${opacity}"`);
  return `<rect ${attrs.join(" ")}/>`;
}

/**
 * 直線／折線／多邊形。`d` 直接給 path 指令。
 * `fillRule:"evenodd"` ＋ 兩段子路徑 ＝ 只填「兩塊圖形不重疊的部分」，
 * 這正是 fig-03 要的「圍牆與界址的落差」（見那一張的註解）。
 */
function PATH(d, { fill = "none", stroke, sw = 3, dash, cap = "round", join = "round", opacity, fillRule } = {}) {
  const attrs = [`d="${d}"`, `fill="${fill}"`];
  if (fillRule) attrs.push(`fill-rule="${fillRule}"`);
  if (stroke) attrs.push(`stroke="${stroke}"`, `stroke-width="${sw}"`, `stroke-linecap="${cap}"`, `stroke-linejoin="${join}"`);
  if (dash) attrs.push(`stroke-dasharray="${dash}"`);
  if (opacity !== undefined) attrs.push(`fill-opacity="${opacity}"`);
  return `<path ${attrs.join(" ")}/>`;
}

/** 往右的箭頭（線 ＋ 實心三角）。 */
function arrowRight(x1, y, x2, { color = P.deep, sw = 5, head = 16 } = {}) {
  return (
    PATH(`M${x1} ${y} L${x2 - head} ${y}`, { stroke: color, sw }) +
    PATH(`M${x2 - head} ${y - head * 0.62} L${x2} ${y} L${x2 - head} ${y + head * 0.62} Z`, { fill: color })
  );
}

/** 往下的箭頭（線 ＋ 實心三角）。用在「上面是錯的講法、下面是正確順序」這種上下結構。 */
function arrowDown(x, y1, y2, { color = P.deep, sw = 5, head = 16 } = {}) {
  return (
    PATH(`M${x} ${y1} L${x} ${y2 - head}`, { stroke: color, sw }) +
    PATH(`M${x - head * 0.62} ${y2 - head} L${x} ${y2} L${x + head * 0.62} ${y2 - head} Z`, { fill: color })
  );
}

/** 圓形 ＋ 置中的字（序號徽章、時間軸節點）。`label` 留空就只有圓點。 */
function badge(cx, cy, r, { fill = P.deep, label = "", size = 30, color = P.white } = {}) {
  const dot = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>`;
  if (!label) return dot;
  // 0.34r 是視覺置中的位移：`<text>` 的基線在字的下緣，不加位移會看起來偏上。
  return dot + T(label, { x: cx, y: cy + size * 0.34, size, weight: 900, fill: color, anchor: "middle" });
}

/**
 * 打叉記號（兩條交叉的線）。
 * ⚠️ 不要改用文字的「✕」：那個字符在 fallback 字型裡不一定有，缺字會變成豆腐方塊，
 *    而豆腐方塊出現在「這句話是錯的」旁邊，讀者會以為是圖壞了。線是畫出來的，不會缺字。
 */
function crossMark(cx, cy, size, { color = P.accent2, sw = 6 } = {}) {
  const d = size / 2;
  return (
    PATH(`M${cx - d} ${cy - d} L${cx + d} ${cy + d}`, { stroke: color, sw }) +
    PATH(`M${cx + d} ${cy - d} L${cx - d} ${cy + d}`, { stroke: color, sw })
  );
}

/** 只有上面兩角是圓角的矩形（面板的標題帶）。 */
function topRoundRect(x, y, w, h, r, fill) {
  return PATH(
    `M${x + r} ${y} L${x + w - r} ${y} A${r} ${r} 0 0 1 ${x + w} ${y + r} L${x + w} ${y + h} L${x} ${y + h} L${x} ${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`,
    { fill }
  );
}

/** 只有下面兩角是圓角的矩形（面板的說明帶）。 */
function bottomRoundRect(x, y, w, h, r, fill) {
  return PATH(
    `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h - r} A${r} ${r} 0 0 1 ${x + w - r} ${y + h} L${x + r} ${y + h} A${r} ${r} 0 0 1 ${x} ${y + h - r} Z`,
    { fill }
  );
}

/**
 * 兩欄對照面板（fig-01、fig-04 共用）。
 * 結構：圓角外框 → 彩色標題帶 → 中間留給圖 → 底部淺色說明帶。
 */
function comparePanel({ x, y, w, h, headFill, headText, caption, inner }) {
  const HEAD_H = 54;
  const CAP_H = 74;
  const capY = y + h - CAP_H;
  fit(`面板標題「${headText}」`, headText, 28, w - 40);
  fit(`面板說明「${caption}」`, caption, 23, w - 40);
  return [
    R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
    topRoundRect(x + 1, y + 1, w - 2, HEAD_H, 15, headFill),
    T(headText, { x: x + w / 2, y: y + 36, size: 28, weight: 700, fill: P.white, anchor: "middle" }),
    inner,
    bottomRoundRect(x + 1, capY, w - 2, CAP_H - 1, 15, P.paper),
    T(caption, { x: x + w / 2, y: capY + 45, size: 23, weight: 500, fill: P.ink, anchor: "middle" })
  ].join("");
}

/** 文章插圖／封面共用的標題區（大標 ＋ 副標）。 */
function figHeading(title, subtitle, { size = 46 } = {}) {
  fit(`插圖大標「${title}」`, title, size, 1080);
  fit(`插圖副標「${subtitle}」`, subtitle, 24, 1080);
  return (
    T(title, { x: 60, y: 84, size, weight: 900, fill: P.ink }) +
    T(subtitle, { x: 60, y: 128, size: 24, weight: 500, fill: P.deep2 })
  );
}

/**
 * 直立卡片（1003 的 fig-01、fig-05 共用）。
 * 結構：圓角外框 → 頭（彩色標題帶**或**圓形序號徽章）→ 兩行小字的依據條號 → 條列 → 底部說明帶。
 *
 * `head` 給 `{ text }` 就是彩色標題帶（適合放「詞」）；給 `{ label }` 就是序號徽章（適合放步驟）。
 * `pill` 是兩行的依據（條號寫兩行，因為「遺產及贈與稅法／第 20 條第 1 項第 6 款」一行放不下）。
 */
function stackCard({ x, y, w, h, tone, head, title, pill, bullets, caption }) {
  const CAP_H = 58;
  const capY = y + h - CAP_H;
  const parts = [R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 16 })];

  let cursor = y;
  if (head.text) {
    fit(`卡片標題「${head.text}」`, head.text, 28, w - 40);
    parts.push(topRoundRect(x + 1, y + 1, w - 2, 54, 15, tone));
    parts.push(T(head.text, { x: x + w / 2, y: y + 37, size: 28, weight: 700, fill: P.white, anchor: "middle" }));
    cursor = y + 55;
  } else {
    parts.push(badge(x + w / 2, y + 60, 32, { fill: tone, label: head.label, size: 30 }));
    cursor = y + 92;
  }

  if (title) {
    fit(`卡片小標「${title}」`, title, 27, w - 40);
    parts.push(T(title, { x: x + w / 2, y: cursor + 40, size: 27, weight: 700, fill: P.ink, anchor: "middle" }));
    cursor += 58;
  }

  if (pill) {
    parts.push(R(x + 20, cursor + 16, w - 40, 82, { fill: P.paper, rx: 10 }));
    fit(`卡片依據上行「${pill[0]}」`, pill[0], 20, w - 72);
    fit(`卡片依據下行「${pill[1]}」`, pill[1], 20, w - 72);
    parts.push(T(pill[0], { x: x + 36, y: cursor + 48, size: 20, weight: 700, fill: P.deep2 }));
    parts.push(T(pill[1], { x: x + 36, y: cursor + 82, size: 20, weight: 500, fill: P.deep2 }));
    cursor += 118;
  }

  bullets.forEach((line, i) => {
    const by = cursor + 30 + i * 40;
    fit(`卡片條列「${line}」`, line, 21, w - 64);
    parts.push(R(x + 24, by - 13, 10, 10, { fill: tone, rx: 2 }));
    parts.push(T(line, { x: x + 44, y: by, size: 21, weight: 400, fill: P.ink }));
  });

  fit(`卡片說明「${caption}」`, caption, 22, w - 32);
  parts.push(bottomRoundRect(x + 1, capY, w - 2, CAP_H - 1, 15, P.paper));
  parts.push(T(caption, { x: x + w / 2, y: capY + 37, size: 22, weight: 500, fill: P.ink, anchor: "middle" }));
  return parts.join("");
}

/**
 * 一列「名稱 ─── 值」（1003 的 fig-02 用）。名稱靠左、值靠右，中間留白。
 * 值靠右是刻意的：四筆稅費的名稱長短不一，靠右對齊才看得出這是同一組東西。
 */
function feeRow(x, y, w, name, value, { h = 56, nameSize = 25, valueSize = 21 } = {}) {
  fit(`費用列「${name} ${value}」`, `${name}　${value}`, valueSize, w - 48);
  return [
    R(x, y, w, h, { fill: P.paper, rx: 10 }),
    T(name, { x: x + 24, y: y + h / 2 + 9, size: nameSize, weight: 700, fill: P.deep }),
    T(value, { x: x + w - 24, y: y + h / 2 + 8, size: valueSize, weight: 400, fill: P.ink, anchor: "end" })
  ].join("");
}

/** 包成完整 SVG 檔。字型堆疊只寫在這裡一份。 */
function svgDoc(w, h, body) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<style>text{font-family:${FONT_STACK}}</style>`,
    body,
    `</svg>`
  ].join("");
}

/* ═══════════════════════════════════════════════════════════════
   2. 共用字串
   🔴 經紀業名稱：「有巢氏房屋」與「屏東崇大華盛加盟店」中間是**全形空格 U+3000**，
      「加盟」二字不可漏（漏了＝把加盟店寫成直營店＝不實廣告）。
      這裡不能 import `@/lib/agency`（那是 TS ＋ 路徑別名，node 直接跑吃不到），
      所以是手抄的一份——**改字前先去比對 `src/lib/agency.ts`**。
   🔴 證號刻意不放進圖裡：圖是燒死的點陣檔，證號版本有變動時改不了。
   ═══════════════════════════════════════════════════════════════ */

const AGENCY_NAME = "有巢氏房屋　屏東崇大華盛加盟店";
const AGENT_LINE = "不動產營業員 陳書亞";
const BRAND = "書亞｜屏東房產";
const BLOG_NAME = "屏東房產研究室";

/* ═══════════════════════════════════════════════════════════════
   3. 每一張圖
   ═══════════════════════════════════════════════════════════════ */

/** 列表頁與五個分類頁共用的分享圖。 */
function ogBlog() {
  const W = 1200;
  const H = 630;
  const footer = `${AGENCY_NAME}　｜　${AGENT_LINE}`;
  // 可用寬度＝右側地號網格的左緣 810 減左邊界 88，再留 30 的安全距離。
  fit("og 主標", BLOG_NAME, 96, 692);
  fit("og 頁尾", footer, 24, 1024);

  // 右側的「地號網格 ＋ 放大鏡」：對應「研究室」——把一塊一塊地翻開來看。
  const cell = 92;
  const gap = 14;
  const gx = 810;
  const gy = 190;
  const grid = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const isCenter = row === 1 && col === 1;
      const isTopRight = row === 0 && col === 2;
      grid.push(
        R(gx + col * (cell + gap), gy + row * (cell + gap), cell, cell, {
          fill: isCenter ? P.accent : isTopRight ? P.green : P.deep2,
          rx: 12
        })
      );
    }
  }
  const lensCx = gx + cell + gap + cell / 2;
  const lensCy = gy + cell + gap + cell / 2;

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.deep }),
      R(0, 0, W, 10, { fill: P.accent }),
      grid.join(""),
      `<circle cx="${lensCx}" cy="${lensCy}" r="86" fill="none" stroke="${P.white}" stroke-width="8"/>`,
      PATH(`M${lensCx + 61} ${lensCy + 61} L${lensCx + 105} ${lensCy + 105}`, { stroke: P.white, sw: 11 }),

      // 品牌：橘底白字「書」方塊 ＋ 品牌名
      R(88, 64, 76, 76, { fill: P.accent, rx: 16 }),
      T("書", { x: 126, y: 118, size: 46, weight: 900, fill: P.white, anchor: "middle" }),
      T(BRAND, { x: 182, y: 114, size: 30, weight: 700, fill: P.band }),

      T(BLOG_NAME, { x: 88, y: 292, size: 96, weight: 900, fill: P.white }),
      R(88, 330, 132, 8, { fill: P.accent }),
      T("屏東市在地、眷村長大的孩子，", { x: 88, y: 406, size: 34, weight: 500, fill: P.band }),
      T("把買賣屏東房子會踩的坑一條一條講清楚", { x: 88, y: 458, size: 34, weight: 500, fill: P.band }),

      R(88, 524, 1024, 1, { fill: P.deep2 }),
      T(footer, { x: 88, y: 578, size: 24, weight: 500, fill: P.band })
    ].join("")
  );
}

/** 1001 封面：在屏東買透天，簽約前要自己查的事。 */
function cover1001() {
  const W = 1200;
  const H = 630;
  fit("1001 封面主標 1", "在屏東買透天", 76, 1056);
  fit("1001 封面主標 2", "簽約前要自己查的事", 76, 1056);

  const box = (x, opts) => {
    const w = 496;
    const y = 356;
    const h = 176;
    fit(`1001 封面色塊標題「${opts.title}」`, opts.title, 30, w - 64);
    fit(`1001 封面色塊內文 1「${opts.l1}」`, opts.l1, 24, w - 64);
    fit(`1001 封面色塊內文 2「${opts.l2}」`, opts.l2, 24, w - 64);
    return [
      R(x, y, w, h, opts.solid ? { fill: P.deep, rx: 16 } : { fill: P.white, stroke: P.accent, sw: 3, rx: 16 }),
      T(opts.title, { x: x + 32, y: y + 58, size: 30, weight: 700, fill: opts.solid ? P.white : P.accent2 }),
      T(opts.l1, { x: x + 32, y: y + 102, size: 24, weight: 400, fill: opts.solid ? P.band : P.ink }),
      T(opts.l2, { x: x + 32, y: y + 140, size: 24, weight: 400, fill: opts.solid ? P.band : P.ink })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.paper }),
      R(0, 0, W, 10, { fill: P.deep }),
      T("買賣實務　書亞的第一手筆記", { x: 72, y: 92, size: 26, weight: 700, fill: P.accent2, ls: 1 }),
      T("在屏東買透天", { x: 72, y: 196, size: 76, weight: 900, fill: P.ink }),
      T("簽約前要自己查的事", { x: 72, y: 286, size: 76, weight: 900, fill: P.ink }),
      R(72, 314, 96, 8, { fill: P.accent }),
      box(72, {
        solid: true,
        title: "文件查得到的",
        l1: "謄本、地籍圖、建物測量成果圖",
        l2: "使用執照要另外向建管申請"
      }),
      box(632, {
        solid: false,
        title: "只能自己走一趟的",
        l1: "路權、界址、排水、停車",
        l2: "晴天、雨天、晚上各一趟"
      }),
      R(72, 562, 1056, 1, { fill: P.line }),
      T(AGENCY_NAME, { x: 72, y: 600, size: 22, weight: 500, fill: P.deep }),
      T(BRAND, { x: 1128, y: 600, size: 22, weight: 700, fill: P.deep, anchor: "end" })
    ].join("")
  );
}

/** fig-01：登記（紙上）vs 現況（現場）。 */
function fig01() {
  const W = 1200;
  const H = 675;

  // 左：謄本 ＋ 方正的地界
  const docLines = [];
  for (let i = 0; i < 5; i += 1) {
    docLines.push(R(120, 292 + i * 30, i === 4 ? 80 : 130, 8, { fill: P.band, rx: 4 }));
  }
  const corners = [
    [320, 280],
    [500, 280],
    [500, 450],
    [320, 450]
  ]
    .map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="7" fill="${P.deep2}"/>`)
    .join("");

  const leftInner = [
    R(100, 262, 170, 200, { fill: P.paper, stroke: P.line, sw: 2, rx: 10 }),
    docLines.join(""),
    R(320, 280, 180, 170, { fill: "none", stroke: P.deep2, sw: 5 }),
    corners,
    T("謄本", { x: 185, y: 496, size: 20, weight: 500, fill: P.deep2, anchor: "middle" }),
    T("地籍圖", { x: 410, y: 496, size: 20, weight: 500, fill: P.deep2, anchor: "middle" })
  ].join("");

  // 右：同一條界址（虛線）＋ 現場的圍牆（實線，錯開）
  const rightInner = [
    PATH("M678 250 L918 268 L932 448 L692 428 Z", { fill: P.band, opacity: 0.55, stroke: P.accent, sw: 6 }),
    R(706, 262, 200, 170, { fill: "none", stroke: P.deep2, sw: 4, dash: "12 9" }),
    PATH("M678 486 L714 486", { stroke: P.deep2, sw: 4, dash: "12 9" }),
    T("地籍圖上的界址", { x: 726, y: 493, size: 20, weight: 500, fill: P.ink }),
    PATH("M678 518 L714 518", { stroke: P.accent, sw: 6 }),
    T("現場的圍牆", { x: 726, y: 525, size: 20, weight: 500, fill: P.ink })
  ].join("");

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("紙上的地界，跟現場的圍牆", "同一塊地兩套資料，只有換手那天會被放在一起比對"),
      comparePanel({
        x: 60,
        y: 170,
        w: 520,
        h: 440,
        headFill: P.deep,
        headText: "登記　謄本與地籍圖",
        caption: "界址是量出來的：方正、有點位",
        inner: leftInner
      }),
      comparePanel({
        x: 620,
        y: 170,
        w: 520,
        h: 440,
        headFill: P.accent,
        headText: "現況　你走進去看到的",
        caption: "圍牆是人蓋的：不一定在那條線上",
        inner: rightInner
      })
    ].join("")
  );
}

/** fig-02：巷道的地號歸屬。 */
function fig02() {
  const W = 1200;
  const H = 675;

  const block = (x, y, w, h, label, highlight) =>
    [
      R(x, y, w, h, highlight ? { fill: P.band, stroke: P.deep, sw: 3, rx: 10 } : { fill: P.paper, stroke: P.line, sw: 2, rx: 10 }),
      T(label, { x: x + w / 2, y: y + h / 2 + 8, size: 22, weight: highlight ? 700 : 400, fill: P.ink, anchor: "middle" })
    ].join("");

  const segment = (x, w, id, owner, hot) => {
    fit(`fig-02 地號標籤「${owner}」`, owner, 20, w - 24);
    return [
      R(x, 320, w, 120, { fill: hot ? P.accent : P.band }),
      T(id, { x: x + w / 2, y: 400, size: 24, weight: 700, fill: hot ? P.white : P.ink, anchor: "middle" }),
      T(owner, { x: x + w / 2, y: 428, size: 20, weight: 400, fill: hot ? P.white : P.ink, anchor: "middle" })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("路面是路，地號不一定是公家的", "出入必經的每一筆地號，都要各自查所有權人"),

      block(100, 190, 280, 110, "鄰地"),
      block(400, 190, 280, 110, "鄰地"),
      block(700, 190, 280, 110, "鄰地"),

      segment(100, 320, "地號 ①", "登記為公有", false),
      segment(420, 320, "地號 ②", "登記為公有", false),
      segment(740, 320, "地號 ③", "登記在私人名下", true),
      PATH("M420 320 L420 440", { stroke: P.white, sw: 3, dash: "10 8" }),
      PATH("M740 320 L740 440", { stroke: P.white, sw: 3, dash: "10 8" }),

      block(100, 460, 280, 110, "鄰地"),
      block(400, 460, 280, 110, "你要買的房子", true),
      block(700, 460, 280, 110, "鄰地"),

      // 🔴 這條路線的垂直段刻意走 x=460（房子色塊的左三分之一），不走色塊正中央的 540：
      //    540 會從「地號 ②」那兩行字正中間穿過去，線壓字。改一次就好，不要「順手」挪回中間。
      PATH("M460 458 L460 356 L1112 356", { stroke: P.deep, sw: 5 }),
      PATH("M1112 345 L1136 356 L1112 367 Z", { fill: P.deep }),
      T("往大馬路", { x: 1100, y: 334, size: 20, weight: 500, fill: P.deep, anchor: "middle" }),
      T("出入必經", { x: 476, y: 344, size: 20, weight: 700, fill: P.deep }),

      T("示意圖，地號與歸屬僅為舉例；實際要向地政事務所申請地籍圖謄本逐筆核對", {
        x: 60,
        y: 630,
        size: 22,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/** fig-03：圍牆與界址的落差。 */
function fig03() {
  const W = 1200;
  const H = 675;

  const legend = (x, swatch, label) =>
    [swatch(x), T(label, { x: x + 62, y: 631, size: 22, weight: 500, fill: P.ink })].join("");

  // 兩個圖形：現場的圍牆（歪的四邊形）與地籍圖上的界址（方正的矩形）。
  // 左邊牆蓋到界址外面、右邊牆縮進界址裡面，一張圖同時講兩個方向。
  const WALL = "M302 190 L824 176 L836 556 L312 566 Z";
  const BOUNDARY = "M340 200 L860 200 L860 540 L340 540 Z";

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("圍牆是人蓋的，界址是測出來的", "牆的位置只證明「怎麼用」，證明不了「地在哪」"),

      // 🔴 這裡用 evenodd 把兩個形狀「相減」，只填**沒有重疊**的那幾條，
      //    因為底下圖例寫的是「兩者的落差」。
      //    如果整塊都塗滿（把兩段路徑拆成兩個 <path> 各自填色就會這樣），
      //    圖例就變成在指一塊根本不是落差的區域——那是看圖的人會被騙的那種錯。
      PATH(`${WALL} ${BOUNDARY}`, { fill: P.band, fillRule: "evenodd" }),
      PATH(WALL, { stroke: P.accent, sw: 7 }),
      R(340, 200, 520, 340, { fill: "none", stroke: P.deep2, sw: 5, dash: "14 10" }),

      T("牆蓋出去了", { x: 64, y: 300, size: 24, weight: 700, fill: P.accent2 }),
      PATH("M190 308 L296 322", { stroke: P.accent2, sw: 2.5, dash: "6 5" }),
      T("牆往內縮了", { x: 1136, y: 300, size: 24, weight: 700, fill: P.accent2, anchor: "end" }),
      PATH("M1012 308 L860 330", { stroke: P.accent2, sw: 2.5, dash: "6 5" }),

      legend(60, (x) => PATH(`M${x} 624 L${x + 48} 624`, { stroke: P.deep2, sw: 5, dash: "14 10" }), "地籍圖上的界址"),
      legend(320, (x) => PATH(`M${x} 624 L${x + 48} 624`, { stroke: P.accent, sw: 7 }), "現場的圍牆"),
      legend(560, (x) => R(x + 12, 612, 24, 24, { fill: P.band, rx: 4 }), "兩者的落差"),
      T("界址以地政事務所鑑界的結果為準", { x: 1140, y: 631, size: 22, weight: 500, fill: P.deep2, anchor: "end" })
    ].join("")
  );
}

/** fig-04：晴天 vs 雨天，同一個門口。 */
function fig04() {
  const W = 1200;
  const H = 675;

  /**
   * 一組「路面 ＋ 建物量體 ＋ 門」的剖面示意。`dx` 是右邊面板的位移（+560）。
   * 建物只用一個矩形量體帶過——這裡要講的是水的走向，不是房子長什麼樣。
   */
  const section = (dx) =>
    [
      R(90 + dx, 470, 210, 10, { fill: P.line, rx: 2 }),
      PATH(`M${90 + dx} 480 L${300 + dx} 480`, { stroke: P.ink, sw: 3 }),
      R(300 + dx, 290, 230, 180, { fill: P.paper, stroke: P.ink, sw: 3 }),
      R(348 + dx, 392, 70, 78, { fill: P.white, stroke: P.ink, sw: 2 }),
      T("路面", { x: 195 + dx, y: 512, size: 20, weight: 500, fill: P.ink, anchor: "middle" }),
      T("門口", { x: 383 + dx, y: 380, size: 20, weight: 500, fill: P.ink, anchor: "middle" })
    ].join("");

  // ⚠️ 這行字的基線要壓在建物量體上緣（y=290）之上，不然「高低差」三個字會疊到牆上。
  const sunny = [section(0), T("地面全乾，看不出高低差", { x: 100, y: 272, size: 22, weight: 500, fill: P.deep2 })].join("");

  const rainy = [
    section(560),
    // 積水：畫在建物之後，才會蓋到門口那一段，讀起來是「水淹到門檻」
    R(650, 436, 260, 44, { fill: P.band }),
    PATH("M650 436 L910 436", { stroke: P.deep2, sw: 3 }),
    T("積水", { x: 700, y: 468, size: 20, weight: 700, fill: P.deep2 }),
    arrowRight(676, 402, 826, { color: P.deep2, sw: 5 }),
    T("水往房子流", { x: 676, y: 386, size: 20, weight: 500, fill: P.deep2 }),
    PATH("M866 418 L1086 418", { stroke: P.accent, sw: 4, dash: "12 8" }),
    T("牆角水痕", { x: 1078, y: 406, size: 20, weight: 700, fill: P.accent2, anchor: "end" })
  ].join("");

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("晴天看不到的，雨天兩小時就看到了", "同一個門口，兩種天氣看到的不是同一件事", { size: 44 }),
      comparePanel({
        x: 60,
        y: 170,
        w: 520,
        h: 440,
        headFill: P.deep,
        headText: "晴天",
        caption: "地面是乾的，看不出水往哪裡走",
        inner: sunny
      }),
      comparePanel({
        x: 620,
        y: 170,
        w: 520,
        h: 440,
        headFill: P.accent,
        headText: "雨天",
        caption: "積水位置與牆角水痕都會現形",
        inner: rainy
      })
    ].join("")
  );
}

/** fig-05：「現況交屋」四個字擋得住什麼。 */
function fig05() {
  const W = 1200;
  const H = 675;

  const chip = (y, title, desc) => {
    fit(`fig-05 卡片標題「${title}」`, title, 28, 460);
    fit(`fig-05 卡片說明「${desc}」`, desc, 22, 460);
    return [
      R(620, y, 520, 100, { fill: P.white, stroke: P.accent, sw: 3, rx: 14 }),
      T(title, { x: 656, y: y + 44, size: 28, weight: 700, fill: P.accent2 }),
      T(desc, { x: 656, y: y + 78, size: 22, weight: 400, fill: P.ink })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("「現況交屋」擋得住什麼", "它不是法律名詞，是契約用語；能免掉多少要看契約怎麼寫"),

      // 盾牌：幾何形狀，不是插畫
      PATH("M330 190 L520 250 L520 420 C520 500 430 552 330 578 C230 552 140 500 140 420 L140 250 Z", {
        fill: P.deep
      }),
      // ⚠️ 裂縫一律畫在副標基線（y=366）之下的空白帶。
      //    畫在上半部會從「現況交屋」四個字中間穿過去，變成刪除線。
      //    左右兩道刻意不對稱（起點高度、長度、折角都不同）：對稱會被看成裝飾用的雙箭頭，
      //    不對稱才讀得出是裂痕。
      PATH("M228 396 L266 434 L232 476 L260 522", { stroke: P.band, sw: 4 }),
      PATH("M412 384 L378 426 L410 460 L384 508", { stroke: P.band, sw: 4 }),
      PATH("M322 462 L348 494 L320 524", { stroke: P.band, sw: 4 }),
      T("現況交屋", { x: 330, y: 320, size: 56, weight: 900, fill: P.white, anchor: "middle" }),
      T("契約用語，不是法律名詞", { x: 330, y: 366, size: 22, weight: 500, fill: P.band, anchor: "middle" }),

      arrowRight(548, 254, 606, { color: P.accent2, sw: 4, head: 13 }),
      arrowRight(548, 384, 606, { color: P.accent2, sw: 4, head: 13 }),
      arrowRight(548, 514, 606, { color: P.accent2, sw: 4, head: 13 }),

      chip(204, "漏水責任", "交屋後第一個被找的是新屋主"),
      chip(334, "界址與圍牆", "牆蓋在哪，換過屋主才會被翻出來"),
      chip(464, "增建那一層", "拆除、鑑價、責任要分開問"),

      T("把檢查過的項目與對方的答覆寫進契約，「現況」才有具體內容", {
        x: 60,
        y: 638,
        size: 22,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1002 封面：崇大新城。
 * 🔴 圖上只准出現事實庫已查證、而且**多份來源互相對得起來**的項目：
 *    · 原址為大武新村與崇武新村兩座眷村、依《國軍老舊眷村改建條例》改建
 *      （國家文化記憶庫 ＋ 榮民文化網，兩邊一致）
 *    · 22 棟 14 層樓（國家文化記憶庫寫「22 棟 14 層樓建築」；榮民文化網寫「二十餘棟」，
 *      不衝突。台灣房屋社區頁另記「地上 14 層／地下 1 層」，樓層數同樣對得上）
 *    · 1,212 戶（國家文化記憶庫 ＋ 2012 自由時報一致；房仲平台另有 1,213／1,227，
 *      屬平台自建資料。文章第四節已逐字交代這件事，圖上採政府與新聞一致的版本）
 *    · 位置在永大路、華盛街口
 *    出處：`docs/部落格/事實庫/崇大新城社區.md`、`docs/部落格/事實庫/屏東眷村歷史與現況.md`
 *
 * 🔴 **封面不寫完工年份。** 兩份公部門資料打架且差到四年：
 *    國家文化記憶庫寫民國 93 年（2004 年）9 月，榮民文化網寫民國 89 年 9 月 7 日。
 *    文章內文有整整一節（`#age`）＋規格表把兩個版本並列、註明「以建物登記謄本的
 *    建築完成日期為準」；**封面沒有地方放這種但書**，而封面正是 og:image、
 *    是分享到 LINE／FB 第一眼看到的東西。只寫「2004 年完工」＝把有爭議的一方當定論。
 *    要救的話是把年份拿掉，不是在封面補小字——封面塞不下但書。
 *    ⚠️ 之後若查到建物登記謄本的建築完成日期（事實庫第八節第 11 項），
 *      才可以考慮把年份放回來，屆時請一併更新文章第四節。
 *
 * 🔴 **不要**在圖上寫「崇大＝崇武＋大武」：事實庫標記為【待查】，沒有任何官方或
 *    文獻明文說明命名原則，寫上去就是把推論當定論。這裡只寫「原址是哪兩座眷村」。
 */
function cover1002() {
  const W = 1200;
  const H = 630;

  const villageBox = (y, label) =>
    [
      R(72, y, 280, 72, { fill: "none", stroke: P.green, sw: 3, rx: 12 }),
      T(label, { x: 212, y: y + 46, size: 28, weight: 500, fill: P.white, anchor: "middle" })
    ].join("");

  const pill = (y, label) => {
    fit(`1002 封面資訊「${label}」`, label, 26, 288);
    return [
      R(800, y, 328, 72, { fill: P.deep2, rx: 12 }),
      T(label, { x: 964, y: y + 46, size: 26, weight: 700, fill: P.white, anchor: "middle" })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.deep }),
      R(0, 0, W, 10, { fill: P.accent }),
      T("社區實勘　書亞的第一手筆記", { x: 72, y: 92, size: 26, weight: 700, fill: P.green, ls: 1 }),
      T("崇大新城", { x: 72, y: 204, size: 88, weight: 900, fill: P.white }),
      R(456, 150, 208, 56, { fill: P.accent, rx: 28 }),
      T("眷村改建住宅", { x: 560, y: 187, size: 26, weight: 700, fill: P.white, anchor: "middle" }),
      T("原址是大武新村與崇武新村", { x: 72, y: 258, size: 32, weight: 500, fill: P.band }),

      villageBox(296, "大武新村"),
      T("＋", { x: 212, y: 392, size: 26, weight: 700, fill: P.green, anchor: "middle" }),
      villageBox(396, "崇武新村"),
      arrowRight(370, 382, 440, { color: P.green, sw: 5 }),

      R(456, 296, 300, 172, { fill: P.deep2, stroke: P.green, sw: 3, rx: 16 }),
      T("崇大新城", { x: 606, y: 372, size: 42, weight: 900, fill: P.white, anchor: "middle" }),
      // 這一行原本是「2004 年完工」——見上方註解，年份有兩份公部門資料在打架，已換成
      // 兩邊都對得起來的規模數字。改回年份之前請先讀那段註解。
      T(fit("1002 封面規模", "22 棟、14 層樓", 26, 260), {
        x: 606,
        y: 424,
        size: 26,
        weight: 500,
        fill: P.band,
        anchor: "middle"
      }),

      pill(296, "1,212 戶"),
      pill(396, "屏東市永大路、華盛街口"),

      R(72, 520, 1056, 1, { fill: P.deep2 }),
      T(AGENCY_NAME, { x: 72, y: 566, size: 22, weight: 500, fill: P.band }),
      T(BRAND, { x: 1128, y: 566, size: 22, weight: 700, fill: P.green, anchor: "end" })
    ].join("")
  );
}

/* ───────────────────────────────────────────────────────────────
   1003｜屏東的房子過戶給另一半（分類：稅怎麼算）

   🔴 這一組圖上的每一個數字，都取自
      `docs/部落格/事實庫/00-夫妻贈與素材表.md` 標【已查證】的條文原文，
      而且與文章正文寫的一致。對照表（改字前請逐項核對）：
        · 契稅　契價百分之六　　　　契稅條例 §3 ④（素材表 ⑯）
        · 印花稅　按金額千分之一　　印花稅法 §7 ④（素材表 ⑱）
        · 登記費　千分之一　　　　　土地法 §76（素材表 ⑲）
        · 書狀費　每張八十元　　　　規費收費標準 §2（素材表 ⑲）
        · 自用住宅　百分之十　　　　土地稅法 §34 I（素材表 ④）
        · 20%／30%／40% 三級累進　　土地稅法 §33（素材表 ③）
        · 漲價總數額的算式　　　　　土地稅法 §31、§32（素材表 §1-7、⑦）
      「2 筆／4 筆／2 筆」是**筆數**不是金額，對應文章第三節與第十二節。

   🔴 圖上**不出現任何金額、行情、省稅金額或比例**。
      「屏東的土地漲價總數額比較小」沒有官方統計支持（素材表 §4-2 紅線），
      所以 fig-05 走的是「教你自己查」，不是「幫你算」。
   🔴 圖上**不出現新聞當事人的姓名**，也不畫任何人物。
   ─────────────────────────────────────────────────────────────── */

/**
 * 1003 封面：過戶那一天的三個數字（不用繳 2 筆／照樣付 4 筆／搬到將來 2 筆）。
 * 這三格就是全篇的骨架，也是標題「省下的稅沒你想的多」的具體內容。
 *
 * 🔴 主標第一行**刻意不照抄文章 h1 的「屏東的房子過戶給另一半」**，改用導言那句
 *    「過到配偶名下」。原因：高雄同業 2026-08-14 那篇同題文章的 h1 就叫
 *    「房子過戶給另一半，貸款還是你在背……」，照抄會在封面上撞出連續 8 個字的雷同。
 *    封面是 og:image，撞名比內文更顯眼。改字前請先確認那邊的標題換了沒有。
 *
 * ✅ 2026-08-15 更新：書亞從三個選項挑定新標題（選 C），文章 h1 已改成
 *    「過到配偶名下就能省稅？順序搞錯，一毛都省不到——屏東屋主最常算錯這一筆」，
 *    封面主標同步改成前兩句，與 h1 一致。
 */
function cover1003() {
  const W = 1200;
  const H = 630;
  fit("1003 封面主標 1", "過到配偶名下就能省稅？", 72, 1056);
  fit("1003 封面主標 2", "順序搞錯，一毛都省不到", 72, 1056);

  const box = (x, opts) => {
    const w = 336;
    const y = 356;
    const h = 176;
    const solid = opts.tone === "solid";
    const key = solid ? P.white : opts.tone === "accent" ? P.accent2 : P.deep;
    fit(`1003 封面色塊標題「${opts.title}」`, opts.title, 25, w - 64);
    fit(`1003 封面色塊內文 1「${opts.l1}」`, opts.l1, 20, w - 64);
    fit(`1003 封面色塊內文 2「${opts.l2}」`, opts.l2, 20, w - 64);
    return [
      R(x, y, w, h, solid ? { fill: P.deep, rx: 16 } : { fill: P.white, stroke: key, sw: 3, rx: 16 }),
      T(opts.title, { x: x + 30, y: y + 42, size: 25, weight: 700, fill: solid ? P.band : key }),
      T(opts.count, { x: x + 30, y: y + 94, size: 38, weight: 900, fill: key }),
      T(opts.l1, { x: x + 30, y: y + 130, size: 20, weight: 400, fill: solid ? P.band : P.ink }),
      T(opts.l2, { x: x + 30, y: y + 158, size: 20, weight: 400, fill: solid ? P.band : P.ink })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.paper }),
      R(0, 0, W, 10, { fill: P.accent }),
      T("稅怎麼算　條號與原文都附上", { x: 72, y: 92, size: 26, weight: 700, fill: P.accent2, ls: 1 }),
      T("過到配偶名下就能省稅？", { x: 72, y: 196, size: 72, weight: 900, fill: P.ink }),
      T("順序搞錯，一毛都省不到", { x: 72, y: 286, size: 72, weight: 900, fill: P.ink }),
      R(72, 314, 96, 8, { fill: P.accent }),
      box(72, {
        tone: "solid",
        title: "當天不用繳",
        count: "2 筆",
        l1: "贈與稅：不進贈與總額",
        l2: "土地增值稅：得申請不課徵"
      }),
      box(432, {
        tone: "accent",
        title: "當天照樣付",
        count: "4 筆",
        l1: "契稅、印花稅",
        l2: "登記費、書狀費"
      }),
      box(792, {
        tone: "deep",
        title: "搬到將來",
        count: "2 筆",
        l1: "土增稅：原地價回推",
        l2: "房地合一：取得日回推"
      }),
      R(72, 562, 1056, 1, { fill: P.line }),
      T(AGENCY_NAME, { x: 72, y: 600, size: 22, weight: 500, fill: P.deep }),
      T(BRAND, { x: 1128, y: 600, size: 22, weight: 700, fill: P.deep, anchor: "end" })
    ].join("")
  );
}

/** 1003 fig-01：免徵／不課徵／不計入贈與總額，三個詞三個條號。 */
function fig1003_01() {
  const W = 1200;
  const H = 675;
  const y = 176;
  const h = 396;
  const w = 340;

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("一句「夫妻贈與免稅」，其實混了三個詞", "三個詞分屬三部法律，拿到手的證明書也不同名"),
      stackCard({
        x: 60,
        y,
        w,
        h,
        tone: P.deep,
        head: { text: "免徵" },
        pill: ["土地稅法", "第 28 條但書"],
        bullets: ["稅捐本身不發生", "名單：繼承、公有土地", "夫妻贈與不在名單裡"],
        caption: "夫妻贈與不走這條"
      }),
      stackCard({
        x: 430,
        y,
        w,
        h,
        tone: P.accent,
        head: { text: "不課徵" },
        pill: ["土地稅法", "第 28 條之 2"],
        bullets: ["動詞是「得申請」", "這一次先不課", "核發不課徵證明書"],
        caption: "延後，不是消失"
      }),
      stackCard({
        x: 800,
        y,
        w,
        h,
        tone: P.deep2,
        head: { text: "不計入贈與總額" },
        pill: ["遺產及贈與稅法", "第 20 條第 1 項第 6 款"],
        bullets: ["不進入計算的基礎", "不是先算再免掉", "地政要看這張紙"],
        caption: "沒有紙就辦不成"
      }),
      T("混著用的結果，是把「延後繳」當成「不用繳」", { x: 60, y: 632, size: 22, weight: 500, fill: P.deep2 })
    ].join("")
  );
}

/** 1003 fig-02：過戶那一天，兩筆不用繳、四筆照樣付。 */
function fig1003_02() {
  const W = 1200;
  const H = 675;

  /** 左欄：稅名 ＋ 條文用語 ＋ 條號，三行一組。 */
  const waived = (ry, name, wording, law) => {
    fit(`fig-02 條文用語「${wording}」`, wording, 21, 408);
    fit(`fig-02 條號「${law}」`, law, 18, 408);
    return [
      R(90, ry, 460, 118, { fill: P.paper, rx: 12 }),
      T(name, { x: 116, y: ry + 42, size: 27, weight: 700, fill: P.deep }),
      T(wording, { x: 116, y: ry + 78, size: 21, weight: 500, fill: P.ink }),
      T(law, { x: 116, y: ry + 106, size: 18, weight: 400, fill: P.deep2 })
    ].join("");
  };

  const leftInner = [waived(248, "贈與稅", "條文寫「不計入贈與總額」", "遺產及贈與稅法第 20 條第 1 項第 6 款"), waived(376, "土地增值稅", "條文寫「得申請不課徵」", "土地稅法第 28 條之 2")].join("");

  const rightInner = [
    feeRow(650, 246, 460, "契稅", "契價的百分之六"),
    feeRow(650, 308, 460, "印花稅", "按金額千分之一"),
    feeRow(650, 370, 460, "登記費", "申報地價或權利價值千分之一"),
    feeRow(650, 432, 460, "書狀費", "每張新臺幣八十元")
  ].join("");

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("過戶那一天：兩筆不用繳，四筆照樣付", "契稅只課在房屋上，稅基走的是評定現值，不是市價"),
      comparePanel({
        x: 60,
        y: 168,
        w: 520,
        h: 404,
        headFill: P.deep,
        headText: "當天不用繳的　2 筆",
        caption: "兩筆用的都不是「免徵」",
        inner: leftInner
      }),
      comparePanel({
        x: 620,
        y: 168,
        w: 520,
        h: 404,
        headFill: P.accent,
        headText: "當天照樣付的　4 筆",
        caption: "金額不大，但當天要拿得出來",
        inner: rightInner
      }),
      R(60, 588, 1080, 66, { fill: P.paper, stroke: P.line, sw: 2, rx: 14 }),
      T("還缺一張紙：國稅局的證明書沒到手，地政事務所不會受理", { x: 88, y: 628, size: 23, weight: 500, fill: P.ink }),
      T("遺產及贈與稅法第 42 條", { x: 1112, y: 628, size: 20, weight: 500, fill: P.deep2, anchor: "end" })
    ].join("")
  );
}

/**
 * 1003 fig-03：順序更正（全篇最重要的一張）。
 * 上面是媒體常見的壓縮講法，下面是條文寫的兩個獨立步驟。
 * ⚠️ 上半部那句話**是被否定的講法**，所以一定要同時有「常見的講法」標籤與打叉記號；
 *    只留文字會被當成本站的主張。
 */
function fig1003_03() {
  const W = 1200;
  const H = 675;

  const step = (x, label, title, line, law, note) => {
    const w = 500;
    const y = 340;
    const h = 228;
    fit(`fig-03 步驟內容「${line}」`, line, 23, w - 80);
    fit(`fig-03 步驟條號「${law}」`, law, 20, w - 80);
    fit(`fig-03 步驟註記「${note}」`, note, 20, w - 100);
    return [
      R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      badge(x + 46, y + 46, 26, { fill: P.deep, label, size: 26 }),
      T(title, { x: x + 88, y: y + 56, size: 30, weight: 700, fill: P.deep }),
      T(line, { x: x + 40, y: y + 112, size: 23, weight: 500, fill: P.ink }),
      T(law, { x: x + 40, y: y + 150, size: 20, weight: 400, fill: P.deep2 }),
      R(x + 30, y + 170, w - 60, 42, { fill: P.paper, rx: 10 }),
      T(note, { x: x + 50, y: y + 198, size: 20, weight: 400, fill: P.ink })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("順序做反了，那個一成就用不到", "贈與不是出售；優惠稅率跟著「出售」那一次走"),

      R(60, 168, 1080, 116, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      R(88, 192, 150, 40, { fill: P.accent, rx: 20 }),
      T("常見的講法", { x: 163, y: 220, size: 21, weight: 700, fill: P.white, anchor: "middle" }),
      T(fit("fig-03 被否定的講法", "過戶給配偶那一天，就用掉了自用住宅一生一次的百分之十", 25, 730), {
        x: 264,
        y: 234,
        size: 25,
        weight: 500,
        fill: P.ink
      }),
      crossMark(1062, 226, 38),

      arrowDown(600, 292, 328, { color: P.deep2, sw: 5 }),

      step(60, "1", "過戶那一次", "向地方稅稽徵機關申請不課徵", "土地稅法第 28 條之 2", "這一步和自用住宅稅率無關"),
      arrowRight(586, 454, 634, { color: P.accent2, sw: 4, head: 13 }),
      step(640, "2", "日後配偶出售", "這時才輪到自用住宅稅率百分之十", "土地稅法第 34 條第 1 項、第 4 項", "用的是配偶自己的那一次"),

      T("兩個各自獨立的步驟，不是同一個動作；依據見財政部《地方稅節稅手冊》問答", {
        x: 60,
        y: 626,
        size: 22,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1003 fig-04：不課徵是遞延——時間軸 ＋ 稅基回推 ＋ 三級累進。
 * ⚠️ 右下的階梯只標稅率級距（20／30／40），**不標任何金額**：
 *    級距是條文寫的，金額是個案的，圖上混在一起會被讀成「大概要繳這麼多」。
 */
function fig1003_04() {
  const W = 1200;
  const H = 675;

  const node = (cx, fill, title, l1, l2) => {
    fit(`fig-04 節點「${title}」`, title, 26, 360);
    fit(`fig-04 節點說明「${l1}」`, l1, 20, 360);
    fit(`fig-04 節點說明「${l2}」`, l2, 20, 360);
    return [
      badge(cx, 306, 18, { fill }),
      T(title, { x: cx, y: 268, size: 26, weight: 700, fill: P.ink, anchor: "middle" }),
      T(l1, { x: cx, y: 356, size: 20, weight: 500, fill: P.ink, anchor: "middle" }),
      T(l2, { x: cx, y: 386, size: 20, weight: 400, fill: P.deep2, anchor: "middle" })
    ].join("");
  };

  /** 三級累進的階梯：高度只表示「往上跳」，不是任何比例尺。 */
  const stair = ["20%", "30%", "40%"]
    .map((label, i) => {
      const bw = 90;
      const bx = 790 + i * 110;
      const bh = 40 + i * 24;
      const top = 630 - bh;
      return (
        R(bx, top, bw, bh, { fill: [P.band, P.deep2, P.deep][i], rx: 6 }) +
        T(label, { x: bx + bw / 2, y: top - 12, size: 20, weight: 700, fill: P.ink, anchor: "middle" })
      );
    })
    .join("");

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("不課徵是延後：稅基會被推回更早以前", "原地價與物價指數的基期年月，都退回第一次贈與之前"),

      // 時間軸整條壓在版面中段，上方會空一大塊；這一行小標既填空，也先講清楚三個點是什麼。
      R(60, 178, 8, 26, { fill: P.accent }),
      T("同一筆土地的三個時點", { x: 84, y: 200, size: 22, weight: 700, fill: P.deep2 }),

      PATH("M120 306 L1090 306", { stroke: P.line, sw: 6 }),
      node(210, P.deep, "前次移轉那一年", "原地價與基期年月", "定在這個時點"),
      node(600, P.accent, "夫妻贈與", "申請不課徵", "這一次先不課"),
      node(990, P.deep, "配偶將來出售", "兩人期間合併計算", "在這一天一次算清"),

      // 從「將來出售」往回指到「前次移轉」的虛線：回推的是稅基，不是時間，所以走在時間軸下方。
      PATH("M990 424 L990 452 L210 452 L210 436", { stroke: P.deep2, sw: 4, dash: "12 8" }),
      PATH("M199 436 L210 416 L221 436 Z", { fill: P.deep2 }),
      T("稅基回推：退到第一次不課徵以前", { x: 600, y: 482, size: 22, weight: 700, fill: P.deep2, anchor: "middle" }),

      R(60, 506, 1080, 140, { fill: P.paper, rx: 14 }),
      T("兩個人持有期間的漲價合併計算", { x: 96, y: 550, size: 25, weight: 700, fill: P.ink }),
      T("漲價倍數變大，超過的部分會往上跳", { x: 96, y: 586, size: 21, weight: 400, fill: P.ink }),
      T("土地稅法第 33 條、財政部 88 年台財稅第 881932091 號函第 7 點", {
        x: 96,
        y: 620,
        size: 19,
        weight: 400,
        fill: P.deep2
      }),
      stair
    ].join("")
  );
}

/** 1003 fig-05：省多少只有自己算得出來——兩個數字自己查，第三步交給機關試算。 */
function fig1003_05() {
  const W = 1200;
  const H = 675;
  const y = 176;
  const h = 390;
  const w = 340;

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("省多少，只有你自己算得出來", "前兩個數字你查得到，第三步交給稅捐稽徵機關試算"),
      stackCard({
        x: 60,
        y,
        w,
        h,
        tone: P.deep,
        head: { label: "1" },
        title: "查公告土地現值",
        bullets: ["屏東縣政府線上查詢", "選行政區、段小段名", "再輸入地號", "只知道門牌也查得到"],
        caption: "先有地號，才查得到"
      }),
      stackCard({
        x: 430,
        y,
        w,
        h,
        tone: P.accent,
        head: { label: "2" },
        title: "查前次移轉現值",
        bullets: ["同一個縣府系統", "還要輸入權利人統一編號", "只有所有權人查得到", "路人查不到你的地"],
        caption: "這是算漲價的另一半"
      }),
      stackCard({
        x: 800,
        y,
        w,
        h,
        tone: P.deep2,
        head: { label: "3" },
        title: "請稅捐機關試算",
        bullets: ["把兩個數字帶著去", "線上資料僅供參考", "以稽徵機關核定為準", "試算出來的才算數"],
        caption: "這個數字才是代價"
      }),
      R(60, 584, 1080, 74, { fill: P.paper, stroke: P.line, sw: 2, rx: 14 }),
      T("漲價總數額＝申報移轉現值－原地價（依物價指數調整）－改良土地已支付的費用", {
        x: 88,
        y: 618,
        size: 22,
        weight: 500,
        fill: P.ink
      }),
      T("土地稅法第 31 條、第 32 條", { x: 88, y: 646, size: 19, weight: 400, fill: P.deep2 })
    ].join("")
  );
}

/* ───────────────────────────────────────────────────────────────
   1004｜白天巷子是空的，晚上兩邊停滿（分類：買賣實務）

   🔴 這一組圖上的每一個數字與條號，都取自
      `docs/部落格/事實庫/00-巷弄停車素材表.md` 標【已查證】的條文原文，
      而且與文章 `src/content/posts/1004-alley-townhouse-parking.tsx` 寫的一致。
      對照表（改字前請逐項核對）：
        · 「道路」四套定義　　建築技術規則設計施工編 §1（A-8）／屏東縣道路管理自治條例 §2（A-22）
        　　　　　　　　　　　／道交條例 §3 第 1 款（A-16）／屏東縣建築管理自治條例 §4（A-4）
        · 釋字第 400 號用語　「年代久遠而未曾中斷」「一般人無復記憶其確實之起始」（A-2）
        · 二十年的兩個出處　 屏東縣政府既成道路認定標準作業程序（A-23）／自治條例 §4 第 4 款（A-4）
        · 民法 §787～§789　　條文給的動作只有「通行」與「開設道路」（A-11～A-13）
        · 五百／一百五十／三百平方公尺　建築技術規則設計施工編 §59 表第二類（C 組）
        · 151.25 坪　　　　　單位換算，圖上已標明「單位換算」四個字
        · 上午七時至晚間八時　標線設置規則 §168（B-9）；全日廿四小時＝同規則 §169（B-10）
        · 第 56 條第 1 項第 5 款、屏東縣處理妨害交通車輛自治條例 §3 第 2 款（B-3、D-1）

   🔴 圖上**刻意不寫**這幾件事（素材表列為查無或待查，寫上去就是把推論當定論）：
      · 不寫「法院判過通行權不含停車」——查不到可引用的判決，只能寫條文裡沒有這兩個字。
      · 不寫任何巷寬或消防車救災空間的公尺數——屏東老巷弄無官方圖資，指導原則未逐字核對。
      · 不寫「移置五小時內領車不計收保管費、最高四十五日」——兩份來源不一致，屬待查。
      · 不寫罰單金額——條文給的是罰鍰區間，統一裁罰基準表本次未取得。
   🔴 fig-05 的色塊代表的是**禁止的時段**，不是線本身的顏色（`PALETTE` 沒有黃、紅代幣），
      圖上已用一行小字講明。不要為了「畫得像」去加不在 `PALETTE` 裡的顏色。
   ─────────────────────────────────────────────────────────────── */

/**
 * 1004 封面：同一條巷子，白天與晚上兩個時段。
 * 主標逐字取自文章 h1 的前半段（書亞 2026-08-15 挑定的標題，不可改字），
 * 右側那一行是 h1 的後半段。
 */
function cover1004() {
  const W = 1200;
  const H = 630;
  fit("1004 封面主標 1", "白天巷子是空的", 76, 1056);
  fit("1004 封面主標 2", "晚上兩邊停滿", 76, 1056);
  fit("1004 封面副標", "屏東巷弄透天，一定要挑晚上再去一次", 30, 510);

  /**
   * 巷子俯視示意：一條路，上下各一排停車格。
   * 兩個面板的幾何**完全一樣**，只有格子裡有沒有東西不同——這張圖的全部訊息就是那個差別。
   * 🔴 圖上不標任何公尺數：屏東市老巷弄的實際寬度沒有可查的官方數據，
   *    標了就等於自己編一個「巷子有多寬」出來。
   */
  const panel = (x, night) => {
    const y = 344;
    const w = 496;
    const h = 196;
    const bx = x + 24;
    const bw = 448;

    // 6 格 × 兩排。格寬 68、間距 8（節距 76），6 × 76 − 8 ＝ 448 ＝ 路面寬度。
    const slots = [];
    for (let i = 0; i < 6; i += 1) {
      const sx = bx + i * 76;
      const cell = (sy) =>
        night
          ? R(sx, sy, 68, 24, { fill: P.band, rx: 4 })
          : R(sx, sy, 68, 24, { fill: "none", stroke: P.deep2, sw: 2, dash: "7 6" });
      slots.push(cell(y + 76) + cell(y + 130));
    }

    const caption = night ? "兩側停滿，中間剩下的才是實況" : "兩側都空著，整條都過得去";
    fit(`1004 封面面板說明「${caption}」`, caption, 22, bw);

    return [
      night
        ? R(x, y, w, h, { fill: P.deep, rx: 16 })
        : R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      R(bx, y + 18, 88, 38, { fill: night ? P.accent : P.deep, rx: 19 }),
      T(night ? "晚上" : "白天", { x: bx + 44, y: y + 44, size: 24, weight: 700, fill: P.white, anchor: "middle" }),
      // 白天那格的路面是淺色的，跟白底幾乎同色，所以一定要有邊框，不然讀不出「這是一條路」。
      night
        ? R(bx, y + 74, bw, 80, { fill: P.deep2, rx: 6 })
        : R(bx, y + 74, bw, 80, { fill: P.paper, stroke: P.line, sw: 2, rx: 6 }),
      slots.join(""),
      // 箭頭走在兩排格子中間那一條帶（y+100～y+130）的中線上，不會壓到格子。
      arrowRight(bx + 36, y + 116, bx + 412, { color: night ? P.accent : P.deep, sw: 5, head: 14 }),
      T(caption, { x: bx, y: y + 184, size: 22, weight: 500, fill: night ? P.band : P.ink })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.paper }),
      R(0, 0, W, 10, { fill: P.deep }),
      T("買賣實務　同一條巷子，兩個時段", { x: 72, y: 92, size: 26, weight: 700, fill: P.accent2, ls: 1 }),
      T("白天巷子是空的", { x: 72, y: 196, size: 76, weight: 900, fill: P.ink }),
      T("晚上兩邊停滿", { x: 72, y: 286, size: 76, weight: 900, fill: P.ink }),
      T("屏東巷弄透天，一定要挑晚上再去一次", { x: 1128, y: 286, size: 30, weight: 500, fill: P.deep2, anchor: "end" }),
      R(72, 314, 96, 8, { fill: P.accent }),
      panel(72, false),
      panel(632, true),
      R(72, 562, 1056, 1, { fill: P.line }),
      T(AGENCY_NAME, { x: 72, y: 600, size: 22, weight: 500, fill: P.deep }),
      T(BRAND, { x: 1128, y: 600, size: 22, weight: 700, fill: P.deep, anchor: "end" })
    ].join("")
  );
}

/**
 * 1004 fig-01（第三節）：「道路」四套定義並排。
 * 顏色帶有意義：深綠＝中央法規、橘＝屏東縣自治法規，右上角的標籤寫的是同一件事。
 * 引號裡是條文節錄，不是白話翻譯——改字前請回素材表 A-8／A-22／A-16／A-4 逐字對。
 */
function fig1004_01() {
  const W = 1200;
  const H = 675;

  const card = (x, y, { n, tone, tag, name, law, quote, kind }) => {
    const w = 530;
    const h = 210;
    fit(`fig-01 法規名「${name}」`, name, 25, 280);
    fit(`fig-01 標籤「${tag}」`, tag, 18, 150);
    fit(`fig-01 條號「${law}」`, law, 19, w - 104);
    quote.forEach((line) => fit(`fig-01 條文「${line}」`, line, 20, w - 88));
    fit(`fig-01 判準「${kind}」`, kind, 21, w - 48);
    return [
      R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      badge(x + 42, y + 44, 24, { fill: tone, label: n, size: 24 }),
      T(name, { x: x + 80, y: y + 38, size: 25, weight: 700, fill: P.ink }),
      T(tag, { x: x + w - 24, y: y + 36, size: 18, weight: 700, fill: tone, anchor: "end" }),
      T(law, { x: x + 80, y: y + 68, size: 19, weight: 500, fill: P.deep2 }),
      R(x + 24, y + 88, w - 48, 66, { fill: P.paper, rx: 10 }),
      quote.map((line, i) => T(line, { x: x + 44, y: y + 116 + i * 26, size: 20, weight: 500, fill: P.ink })).join(""),
      T(kind, { x: x + 24, y: y + 186, size: 21, weight: 700, fill: tone })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("「道路」不是一個定義，是四套並存", "建築管理與交通取締各有一套，屏東縣自己還有兩套"),

      card(60, 166, {
        n: "1",
        tone: P.deep,
        tag: "中央法規",
        name: "建築技術規則",
        law: "建築設計施工編第 1 條　道路",
        quote: ["「道路：除另有規定外，", "不包括私設通路及類似通路」"],
        kind: "這一套裡，私設通路不算道路"
      }),
      card(610, 166, {
        n: "2",
        tone: P.accent,
        tag: "屏東縣自治法規",
        name: "屏東縣道路管理自治條例",
        law: "第 2 條　道路",
        quote: ["「指縣轄內之縣道、鄉道、市區道路、", "農路、重劃區道路、廣場及村里聯絡道路」"],
        kind: "列舉式，沒有概括的那一句"
      }),
      card(60, 396, {
        n: "3",
        tone: P.deep,
        tag: "中央法規",
        name: "道路交通管理處罰條例",
        law: "第 3 條第 1 款　道路",
        quote: ["「指公路、街道、巷衖、廣場、騎樓、", "走廊或其他供公眾通行之地方」"],
        kind: "功能標準，看實際供不供公眾通行"
      }),
      card(610, 396, {
        n: "4",
        tone: P.accent,
        tag: "屏東縣自治法規",
        name: "屏東縣建築管理自治條例",
        law: "第 4 條第 4 款　現有巷道",
        quote: ["「現有通路旁已有編釘門牌房屋二戶以上，", "且其門牌編釘或戶籍登記已逾二十年」"],
        kind: "地方自訂，屏東的案子用屏東的"
      }),

      R(60, 626, 8, 26, { fill: P.accent }),
      T("四套並存：同一條巷子在不同法規下可能得到不同答案，對應的主管機關也不一樣", {
        x: 84,
        y: 647,
        size: 22,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1004 fig-02（第四節）：二十年這個數字的三個出處。
 * ⚠️ 上半部那句話**是被否定的講法**，一定要同時有「常見的講法」標籤與打叉記號，
 *    只留文字會被當成本站的主張。
 * 🔴 左邊那張（釋字第 400 號）的重點是「沒有寫二十年」，
 *    所以引文只能放它真正寫了什麼，不可以在那張圖上出現二十年當成要件。
 */
function fig1004_02() {
  const W = 1200;
  const H = 675;

  const source = (x, { tone, head, meta, quote, verdict, solidVerdict }) => {
    const y = 318;
    const w = 340;
    const h = 250;
    fit(`fig-02 出處標題「${head}」`, head, 22, w - 40);
    fit(`fig-02 出處日期「${meta}」`, meta, 19, w - 40);
    quote.forEach((line) => fit(`fig-02 出處引文「${line}」`, line, 18, w - 64));
    fit(`fig-02 出處結論「${verdict}」`, verdict, 20, w - 60);
    return [
      R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      topRoundRect(x + 1, y + 1, w - 2, 48, 15, tone),
      T(head, { x: x + w / 2, y: y + 33, size: 22, weight: 700, fill: P.white, anchor: "middle" }),
      T(meta, { x: x + w / 2, y: y + 80, size: 19, weight: 500, fill: P.deep2, anchor: "middle" }),
      R(x + 20, y + 96, w - 40, 88, { fill: P.paper, rx: 10 }),
      // 左內距 12（不是 18）：釋字那兩句剛好 15 個全形字，18 的內距會擠出淺色底之外。
      quote.map((line, i) => T(line, { x: x + 32, y: y + 124 + i * 26, size: 18, weight: 500, fill: P.ink })).join(""),
      R(x + 20, y + 196, w - 40, 40, solidVerdict ? { fill: P.accent2, rx: 10 } : { fill: P.paper, rx: 10 }),
      T(verdict, {
        x: x + w / 2,
        y: y + 222,
        size: 20,
        weight: 700,
        fill: solidVerdict ? P.white : P.deep,
        anchor: "middle"
      })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("二十年這個數字，不在釋字第 400 號裡", "同樣是二十年，一個是應檢附的文件，一個是另一種身分的款次"),

      R(60, 168, 1080, 96, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      R(88, 196, 150, 40, { fill: P.accent, rx: 20 }),
      T("常見的講法", { x: 163, y: 224, size: 21, weight: 700, fill: P.white, anchor: "middle" }),
      T(fit("fig-02 被否定的講法", "通行滿二十年，就算既成道路", 25, 730), {
        x: 264,
        y: 225,
        size: 25,
        weight: 500,
        fill: P.ink
      }),
      crossMark(1062, 216, 38),

      arrowDown(600, 274, 310, { color: P.deep2, sw: 5 }),

      source(60, {
        tone: P.deep,
        head: "司法院釋字第 400 號",
        meta: "民國 85 年 4 月 12 日公布",
        quote: ["「須經歷之年代久遠而未曾中斷」", "「一般人無復記憶其確實之起始」"],
        verdict: "條文沒有寫二十年",
        solidVerdict: true
      }),
      source(430, {
        tone: P.accent,
        head: "屏東縣政府作業程序",
        meta: "既成道路認定標準　106 年函頒",
        quote: ["「通行二十年以上相關證明", "（如航空測量圖等）」", "列為應檢附文件之一"],
        verdict: "二十年＝檢附文件"
      }),
      source(800, {
        tone: P.accent,
        head: "屏東縣建築管理自治條例",
        meta: "第 4 條第 4 款　現有巷道",
        quote: ["「現有通路旁已有編釘門牌", "房屋二戶以上，且其門牌編", "釘或戶籍登記已逾二十年」"],
        verdict: "二十年＝另一種身分"
      }),

      R(60, 596, 8, 26, { fill: P.accent }),
      T("位階與性質都不同：一個是司法院解釋的成立要件，兩個是地方政府的文件要求與認定款次", {
        x: 84,
        y: 617,
        size: 22,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1004 fig-03（第六節）：袋地通行權三條條文給的動作。
 * 🔴 右邊那一塊只能寫「條文裡找不到這兩個詞」，**不可以**寫成「法院判過通行權不含停車」——
 *    公開資料查不到可引用的判決（素材表第三節第 1 項）。底部第二行就是這句自我節制，
 *    不要因為版面擠就把它拿掉，那一行是這張圖能不能出街的前提。
 */
function fig1004_03() {
  const W = 1200;
  const H = 675;

  const lawCard = (y, { law, desc, verb }) => {
    const x = 60;
    const w = 640;
    const h = 110;
    fit(`fig-03 條號「${law}」`, law, 26, 420);
    fit(`fig-03 條文摘要「${desc}」`, desc, 20, w - 56);
    fit(`fig-03 動作「${verb}」`, verb, 22, 118);
    return [
      R(x, y, w, h, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      T(law, { x: x + 28, y: y + 44, size: 26, weight: 700, fill: P.deep }),
      R(x + w - 170, y + 24, 142, 42, { fill: P.deep, rx: 21 }),
      T(verb, { x: x + w - 99, y: y + 52, size: 22, weight: 700, fill: P.white, anchor: "middle" }),
      T(desc, { x: x + 28, y: y + 84, size: 20, weight: 400, fill: P.ink })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("袋地通行權三條，法律給的動作只有兩個", "民法第 787 條至第 789 條，全文沒有出現「停車」或「停放」"),

      lawCard(210, {
        law: "民法第 787 條",
        desc: "與公路無適宜之聯絡、不能為通常使用時，得通行周圍地",
        verb: "通行"
      }),
      lawCard(336, {
        law: "民法第 788 條",
        desc: "有通行權人於必要時得開設道路，但應支付償金",
        verb: "開設道路"
      }),
      lawCard(462, {
        law: "民法第 789 條",
        desc: "一部讓與或分割造成的袋地，只能通行當事人的地，無須償金",
        verb: "通行"
      }),

      // 右邊這一塊講的是「缺席」。
      // ⚠️ 叉一定要畫在字**之前**（也就是壓在字底下）：先字後叉那一版實測過，
      //    兩道 8px 的線把「停車」「停放」切成碎塊，讀者看到的是壞掉的圖，不是「找不到」。
      R(740, 210, 400, 362, { fill: P.paper, stroke: P.line, sw: 2, rx: 16 }),
      T("條文裡找不到的字", { x: 940, y: 254, size: 24, weight: 700, fill: P.accent2, anchor: "middle" }),
      crossMark(940, 386, 180, { color: P.accent2, sw: 7 }),
      T("停車", { x: 940, y: 352, size: 56, weight: 900, fill: P.ink, anchor: "middle" }),
      T("停放", { x: 940, y: 442, size: 56, weight: 900, fill: P.ink, anchor: "middle" }),
      T("三條從頭到尾都沒有這兩個詞", { x: 940, y: 512, size: 21, weight: 500, fill: P.ink, anchor: "middle" }),

      R(60, 584, 1080, 74, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      T("第 787 條第 2 項：應於通行必要之範圍內，擇其周圍地損害最少之處所及方法為之", {
        x: 88,
        y: 616,
        size: 21,
        weight: 500,
        fill: P.ink
      }),
      T("公開資料查不到判決明文表示通行權不包含停車，這張圖只呈現條文寫了什麼、沒寫什麼", {
        x: 88,
        y: 646,
        size: 19,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1004 fig-04（第八節）：住宅類的停車空間門檻。
 * 「五百平方公尺以下部分：免設」是條文原文；151.25 坪是單位換算，
 * 圖上與文章都標明「單位換算」四個字，不可以寫成條文文字。
 */
function fig1004_04() {
  const W = 1200;
  const H = 675;

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("多數透天沒有車位，不是當年沒規定", "住宅類：五百平方公尺以下部分免設，都市計畫內外都一樣"),

      // 「門檻」壓在虛線正上方，不要放到左邊界——放左邊會被讀成整塊深色區的標題。
      T("門檻", { x: 530, y: 232, size: 22, weight: 700, fill: P.accent2, anchor: "middle" }),

      // 左：門檻以下（免設）。右：超過門檻之後，都市計畫內外各一列。
      R(60, 250, 460, 150, { fill: P.deep, rx: 14 }),
      T(fit("fig-04 門檻說明", "五百平方公尺以下部分", 25, 412), {
        x: 84,
        y: 292,
        size: 25,
        weight: 500,
        fill: P.band
      }),
      T("免設", { x: 84, y: 356, size: 46, weight: 900, fill: P.white }),
      T(fit("fig-04 單位換算", "約 151.25 坪（單位換算）", 19, 280), {
        x: 200,
        y: 356,
        size: 19,
        weight: 500,
        fill: P.band
      }),

      PATH("M530 244 L530 406", { stroke: P.accent, sw: 3, dash: "10 8" }),

      feeRow(540, 250, 600, "都市計畫內區域", "超過部分每一百五十平方公尺設置一輛", { h: 71 }),
      feeRow(540, 329, 600, "都市計畫外區域", "超過部分每三百平方公尺設置一輛", { h: 71 }),

      R(60, 420, 1080, 116, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      T("表列總樓地板面積的計算，不包括這些（同條說明一）", { x: 88, y: 456, size: 23, weight: 700, fill: P.deep }),
      T(fit("fig-04 不計入 1", "室內停車空間面積、法定防空避難設備面積", 21, 1024), {
        x: 88,
        y: 492,
        size: 21,
        weight: 400,
        fill: P.ink
      }),
      T(fit("fig-04 不計入 2", "騎樓或門廊、外廊等無牆壁之面積，及機械房、變電室、蓄水池、屋頂突出物等類似用途部分", 21, 1024), {
        x: 88,
        y: 522,
        size: 21,
        weight: 400,
        fill: P.ink
      }),

      R(60, 552, 1080, 100, { fill: P.paper, rx: 14 }),
      T("條文開頭是「依都市計畫法令或都市計畫書之規定」，其未規定者才依表——都市計畫優先", {
        x: 88,
        y: 592,
        size: 21,
        weight: 500,
        fill: P.ink
      }),
      T("建築技術規則建築設計施工編第 59 條表第二類與說明一；法定停車空間應設置在同一基地內（第 59 條之 1 第 1 款）", {
        x: 88,
        y: 626,
        size: 19,
        weight: 400,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1004 fig-05（第十節）：黃線與紅線的禁止時段。
 * 🔴 色塊代表的是**禁止的時段**，不是線的顏色——`PALETTE` 沒有黃色與紅色代幣，
 *    所以圖上留了一行小字講明這件事。不要為了畫得像去加代幣以外的顏色，
 *    也不要把橘色塊誤當成「黃線就是橘的」。
 * 軸的比例：x 從 60 到 1140（1080px）＝ 0 時到 24 時，每小時 45px。
 */
function fig1004_05() {
  const W = 1200;
  const H = 675;
  const AX = 60;
  const AW = 1080;
  const hourX = (hour) => AX + (AW * hour) / 24;

  const row = (y, { name, law, fill, segX, segW, segText }) => {
    fit(`fig-05 標線名「${name}」`, name, 26, 560);
    fit(`fig-05 條號「${law}」`, law, 19, 480);
    fit(`fig-05 時段「${segText}」`, segText, 22, segW - 24);
    return [
      T(name, { x: AX, y, size: 26, weight: 700, fill: P.deep }),
      T(law, { x: AX + AW, y, size: 19, weight: 500, fill: P.deep2, anchor: "end" }),
      R(AX, y + 18, AW, 56, { fill: P.paper, rx: 8 }),
      R(segX, y + 18, segW, 56, { fill, rx: 6 }),
      T(segText, { x: segX + segW / 2, y: y + 54, size: 22, weight: 700, fill: P.white, anchor: "middle" })
    ].join("");
  };

  const tick = (hour, label, anchor) =>
    PATH(`M${hourX(hour)} 446 L${hourX(hour)} 460`, { stroke: P.line, sw: 3 }) +
    T(label, { x: hourX(hour), y: 484, size: 20, weight: 500, fill: P.deep2, anchor });

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("黃線只禁到晚間八時，紅線是全日廿四小時", "要延長或縮短，得用標字或標誌及其附牌標示；現場沒有，就是預設時段", {
        size: 44
      }),

      row(210, {
        name: "黃實線　禁止停車線",
        law: "道路交通標誌標線號誌設置規則第 168 條",
        fill: P.accent,
        segX: hourX(7),
        segW: hourX(20) - hourX(7),
        segText: "禁止停車　上午七時至晚間八時"
      }),
      // 起訖時刻的引線畫在兩排之間，兩排共用同一支時間軸。
      PATH(`M${hourX(7)} 284 L${hourX(7)} 446`, { stroke: P.accent2, sw: 2, dash: "6 6" }),
      PATH(`M${hourX(20)} 284 L${hourX(20)} 446`, { stroke: P.accent2, sw: 2, dash: "6 6" }),

      row(372, {
        name: "紅實線　禁止臨時停車線",
        law: "同規則第 169 條",
        fill: P.deep,
        segX: AX,
        segW: AW,
        segText: "禁止臨時停車　全日廿四小時"
      }),

      PATH("M60 446 L1140 446", { stroke: P.line, sw: 3 }),
      tick(0, "0 時", "start"),
      tick(7, "上午七時", "middle"),
      tick(20, "晚間八時", "middle"),
      tick(24, "24 時", "end"),

      // ⚠️ 這一行要自己佔一列。放在刻度那一列的右端會直接壓到「晚間八時」與「24 時」——
      //    實測過，兩組字疊在一起。
      T("圖上的色塊代表「禁止的時段」，不是線本身的顏色", {
        x: AX,
        y: 514,
        size: 19,
        weight: 500,
        fill: P.deep2
      }),

      R(60, 534, 1080, 124, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      T("沒有畫線的地方，也不是可以停", { x: 88, y: 572, size: 24, weight: 700, fill: P.ink }),
      R(88, 596, 10, 10, { fill: P.accent, rx: 2 }),
      T(fit("fig-05 條列 1", "在顯有妨礙其他人、車通行處所停車　道路交通管理處罰條例第 56 條第 1 項第 5 款", 20, 1000), {
        x: 110,
        y: 606,
        size: 20,
        weight: 400,
        fill: P.ink
      }),
      R(88, 630, 10, 10, { fill: P.accent, rx: 2 }),
      T(fit("fig-05 條列 2", "無標線處所違規停放致妨害交通，駕駛人不在車內　屏東縣處理妨害交通車輛自治條例第 3 條第 2 款", 20, 1000), {
        x: 110,
        y: 640,
        size: 20,
        weight: 400,
        fill: P.ink
      })
    ].join("")
  );
}

/* ───────────────────────────────────────────────────────────────
   1005｜屏東榮總開診到現在，永大這一帶到底變了什麼（分類：屏東行情）

   🔴 這一組圖上的每一個數字、日期與文號，都取自
      `docs/部落格/事實庫/00-榮總商圈素材表.md` 標【已查證】的欄位，
      而且與文章 `src/content/posts/1005-ptvgh-area.tsx` 寫的一致。
      對照表（改字前請逐項核對）：
        · 開業執照 111-10-14／開幕 111-11-18／正式營運 111-11-21　官網〈大事紀要〉（A-2）
        · 區域醫院效期 115/1/1–120/12/31　衛福部 114 年度醫院評鑑名單（A-5）
        · 地區醫院＝112 年度評鑑、效期 113/1/1–116/12/31　107-113 年名單（A-5）
        · 教學醫院＝112 年度評鑑、效期 113/1/1–118/12/31（A-5）
        · 急救責任醫院「中度級＊」效期 114/1/1–119/12/31 ＋ 註1 星號定義逐字（A-7）
        · 三階段變更與文號　97/12、101、106-02-17（10604967001）、106-05-01、
          108-04-24（10814230001）、108-05-16（10817764101）、重劃完成 112-11-08（C-3）
        · 醫療專用區 6.44 公頃　主要計畫書表 9-1（C-4）
        · 七條路寬度 23／19／19／18／15／12／8　主要計畫書表 5-1，調查年度 106 年（C-11）
        · 論文檢索 2 筆、全庫書目與摘要 1,554,988 筆　國圖論文系統（D-8）
        · 五個查證管道與各自結果（D-8 的「我查了哪裡」表）
        · 「重要環境設施」清單與不得記載事項第六點　內政部公告原文（D-1、D-2）

   🔴 圖上**刻意不放**這幾件事：
      · **不放 622 床**。那是行政院民國 107 年核定的**規劃數**（450＋172），
        不是現況；現況核定床數素材表列【待查】。圖上塞不下「規劃」兩個字的但書，
        所以整個不放（同 1002 封面拿掉完工年份的理由）。
      · **不寫「政府為醫院開闢並命名榮總東路」**——命名公告文號、日期、核定機關
        本次全部查不到。fig-03 最後一列刻意用虛線框寫「查不到」，那一列是這張圖的重點。
      · **不寫任何步行時間、車程、距離、房價、漲幅、議價百分比**（素材表 D-9 反面清單）。
        fig-04 只呈現「查了哪裡、得到什麼」，不呈現任何價格數字。
      · **不寫「開了三年」這類相對年數**——全部用民國絕對日期，圖不會自己過期。
   🔴 「區域醫院」四個字出現的地方，一定同時帶生效日或效期；
      「中度級＊」出現的地方，一定同時附註 1 的星號定義。兩者缺一就不要放。
   ─────────────────────────────────────────────────────────────── */

/**
 * 1005 封面：四個日期，四件不同的事。
 * 主標逐字取自文章 h1 的前兩段（書亞 2026-08-15 從三個變體挑定 A1，不可改字）。
 *
 * 🔴 節點的日期一律民國紀年，右上角那行小字就是在講這件事——
 *    封面是 og:image，分享出去只會被看到一眼，年份用哪一套曆法不能靠讀者猜。
 * 🔴 第四個節點（區域醫院）**必須**同時寫生效日。只寫「區域醫院」而不帶
 *    115 年 1 月 1 日，就等於把這篇最有力的更正寫成它要更正的那句話。
 */
function cover1005() {
  const W = 1200;
  const H = 630;
  fit("1005 封面主標 1", "屏東榮總開診到現在", 76, 1056);
  fit("1005 封面主標 2", "永大這一帶到底變了什麼", 76, 1056);

  const LINE_Y = 452;

  /** 一個時間點：日期（上）→ 圓點 → 事件（下）→ 註記。`hot` 給最後那一個（橘）。 */
  const stop = (cx, { date, label, note, hot }) => {
    fit(`1005 封面日期「${date}」`, date, 22, 276);
    fit(`1005 封面事件「${label}」`, label, 25, 276);
    fit(`1005 封面註記「${note}」`, note, 19, 276);
    return [
      T(date, { x: cx, y: 424, size: 22, weight: 700, fill: hot ? P.accent2 : P.deep2, anchor: "middle" }),
      badge(cx, LINE_Y, hot ? 17 : 12, { fill: hot ? P.accent : P.deep }),
      T(label, { x: cx, y: 500, size: 25, weight: 700, fill: P.ink, anchor: "middle" }),
      T(note, { x: cx, y: 528, size: 19, weight: 500, fill: P.deep2, anchor: "middle" })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.paper }),
      R(0, 0, W, 10, { fill: P.deep }),
      T("屏東行情　四個日期，四件事", { x: 72, y: 92, size: 26, weight: 700, fill: P.accent2, ls: 1 }),
      T("屏東榮總開診到現在", { x: 72, y: 190, size: 76, weight: 900, fill: P.ink }),
      T("永大這一帶到底變了什麼", { x: 72, y: 278, size: 76, weight: 900, fill: P.ink }),
      R(72, 306, 96, 8, { fill: P.accent }),
      T("先講查得到的，再講沒人講的", { x: 72, y: 356, size: 28, weight: 500, fill: P.deep2 }),
      T("日期為民國紀年", { x: 1128, y: 356, size: 20, weight: 500, fill: P.deep2, anchor: "end" }),

      PATH(`M120 ${LINE_Y} L1080 ${LINE_Y}`, { stroke: P.line, sw: 6 }),
      stop(168, { date: "111 年 10 月 14 日", label: "開業執照", note: "取得執業資格那天" }),
      stop(456, { date: "111 年 11 月 18 日", label: "開幕", note: "典禮那天" }),
      stop(744, { date: "111 年 11 月 21 日", label: "正式營運（開診）", note: "門診開始看病人" }),
      // 最後一個節點刻意不放在等距的 1032：「區域醫院資格生效」八個字置中後會壓過
      // 右邊界（頁尾那條線的右端 1128）。往左收 8px，四個節點的間距差看不出來。
      stop(1024, { date: "115 年 1 月 1 日", label: "區域醫院資格生效", note: "114 年度醫院評鑑", hot: true }),

      R(72, 562, 1056, 1, { fill: P.line }),
      T(AGENCY_NAME, { x: 72, y: 600, size: 22, weight: 500, fill: P.deep }),
      T(BRAND, { x: 1128, y: 600, size: 22, weight: 700, fill: P.deep, anchor: "end" })
    ].join("")
  );
}

/**
 * 1005 fig-01（第二節）：三個資格、三個效期。
 * ⚠️ 上半部那句話**是被否定的講法**，一定要同時有「常見的講法」標籤與打叉記號。
 * 🔴 底部三行小字缺一不可：
 *    第一、二行是「114 年 12 月 31 日以前名單上寫地區醫院」的依據（這張圖的更正本體）；
 *    第三行是註 1 的星號定義逐字——中間那根橫條寫了「中度級＊」，
 *    星號沒有解釋就會被讀成排版符號或「打了折的中度級」。塞不下就整張不要放星號。
 * 軸的比例：x 從 310（民國 113 年 1 月 1 日）起，一年 100px，到 1110（民國 121 年）。
 * ⚠️ 軸不要拉到 1140：最後一個刻度的數字是置中的，貼著 1140 會超出右邊界。
 */
function fig1005_01() {
  const W = 1200;
  const H = 675;
  const AX = 310;
  const YEAR = 100;
  /** 該民國年 1 月 1 日的 x。效期到某年 12 月 31 日 ＝ 畫到下一年的 1 月 1 日。 */
  const yearX = (roc) => AX + (roc - 113) * YEAR;

  const row = (y, { name, sub, from, to, span, tone }) => {
    fit(`fig-01 資格名「${name}」`, name, 26, 230);
    fit(`fig-01 資格註「${sub}」`, sub, 20, 230);
    const bx = yearX(from);
    const bw = yearX(to) - bx;
    fit(`fig-01 效期「${span}」`, span, 20, bw - 40);
    return [
      T(name, { x: 60, y: y + 30, size: 26, weight: 700, fill: P.deep }),
      T(sub, { x: 60, y: y + 54, size: 20, weight: 500, fill: P.deep2 }),
      R(bx, y, bw, 52, { fill: tone, rx: 8 }),
      T(span, { x: bx + 20, y: y + 33, size: 20, weight: 500, fill: P.white })
    ].join("");
  };

  const ticks = [];
  for (let roc = 113; roc <= 121; roc += 1) {
    ticks.push(
      PATH(`M${yearX(roc)} 520 L${yearX(roc)} 534`, { stroke: P.line, sw: 3 }) +
        T(String(roc), { x: yearX(roc), y: 558, size: 20, weight: 500, fill: P.deep2, anchor: "middle" })
    );
  }

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("開幕那天，它還不是區域醫院", "三個資格分屬三套評定，取得的順序跟直覺相反"),

      R(60, 152, 1080, 90, { fill: P.white, stroke: P.line, sw: 2, rx: 14 }),
      R(88, 178, 150, 40, { fill: P.accent, rx: 20 }),
      T("常見的講法", { x: 163, y: 206, size: 21, weight: 700, fill: P.white, anchor: "middle" }),
      T(fit("fig-01 被否定的講法", "開幕那天就已經是區域醫院", 25, 730), {
        x: 264,
        y: 214,
        size: 25,
        weight: 500,
        fill: P.ink
      }),
      crossMark(1062, 205, 38),

      // 115 年 1 月 1 日那條線畫在橫條**之前**（壓在底下），不然虛線會切過三根橫條的字。
      PATH(`M${yearX(115)} 274 L${yearX(115)} 520`, { stroke: P.accent, sw: 2.5, dash: "8 7" }),
      T("115 年 1 月 1 日", { x: yearX(115), y: 266, size: 19, weight: 700, fill: P.accent2, anchor: "middle" }),

      row(286, {
        name: "教學醫院",
        sub: "112 年度評鑑",
        from: 113,
        to: 119,
        span: "效期 113 年 1 月 1 日至 118 年 12 月 31 日",
        tone: P.deep2
      }),
      row(356, {
        name: "急救責任醫院",
        sub: "中度級＊",
        from: 114,
        to: 120,
        span: "效期 114 年 1 月 1 日至 119 年 12 月 31 日",
        tone: P.deep
      }),
      row(426, {
        name: "區域醫院",
        sub: "114 年度評鑑",
        from: 115,
        to: 121,
        span: "效期 115 年 1 月 1 日至 120 年 12 月 31 日",
        tone: P.accent
      }),

      PATH(`M${yearX(113)} 520 L${yearX(121)} 520`, { stroke: P.line, sw: 3 }),
      T("民國", { x: AX - 28, y: 558, size: 20, weight: 500, fill: P.deep2, anchor: "end" }),
      ticks.join(""),

      R(60, 574, 1080, 88, { fill: P.paper, rx: 14 }),
      T(fit("fig-01 底部 1", "114 年 12 月 31 日以前，衛福部名單上的健保特約類別與醫院評鑑結果都是「地區醫院」", 21, 1024), {
        x: 88,
        y: 606,
        size: 21,
        weight: 700,
        fill: P.ink
      }),
      T(fit("fig-01 底部 2", "該筆為 112 年度評鑑、效期 113 年 1 月 1 日至 116 年 12 月 31 日", 19, 1024), {
        x: 88,
        y: 632,
        size: 19,
        weight: 500,
        fill: P.deep2
      }),
      T(fit("fig-01 底部 3", "註1：中度級＊為通過中度級但「高危險妊娠孕產婦及新生兒照護」章節能力未申請評定", 19, 1024), {
        x: 88,
        y: 656,
        size: 19,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1005 fig-02（第五節）：同一塊地的三個身分。
 * 🔴 中間那張的重點是**缺席**：民國 101 年那一輪劃的是住宅區與兩個專用區，
 *    裡面**沒有**醫療專用區；醫療專用區是民國 108 年這一輪才變更過來的。
 *    底部第二行是「5 月 21 日」那個常見錯誤的更正，不要因為版面擠就拿掉。
 */
function fig1005_02() {
  const W = 1200;
  const H = 675;
  const Y = 176;
  const CW = 330;
  const CH = 372;

  const stage = (x, { tone, head, name, plan, doc, bullets, caption }) => {
    fit(`fig-02 階段「${head}」`, head, 26, CW - 40);
    fit(`fig-02 分區名「${name}」`, name, 27, CW - 40);
    fit(`fig-02 依據上行「${plan}」`, plan, 20, CW - 72);
    fit(`fig-02 依據下行「${doc}」`, doc, 18, CW - 72);
    fit(`fig-02 說明「${caption}」`, caption, 21, CW - 32);
    return [
      R(x, Y, CW, CH, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      topRoundRect(x + 1, Y + 1, CW - 2, 54, 15, tone),
      T(head, { x: x + CW / 2, y: Y + 37, size: 26, weight: 700, fill: P.white, anchor: "middle" }),
      T(name, { x: x + CW / 2, y: Y + 104, size: 27, weight: 700, fill: P.ink, anchor: "middle" }),
      R(x + 20, Y + 124, CW - 40, 76, { fill: P.paper, rx: 10 }),
      T(plan, { x: x + 36, y: Y + 154, size: 20, weight: 700, fill: P.deep2 }),
      T(doc, { x: x + 36, y: Y + 184, size: 18, weight: 500, fill: P.deep2 }),
      bullets
        .map((line, i) => {
          const by = Y + 236 + i * 34;
          fit(`fig-02 條列「${line}」`, line, 20, CW - 64);
          return R(x + 24, by - 12, 10, 10, { fill: tone, rx: 2 }) + T(line, { x: x + 44, y: by, size: 20, fill: P.ink });
        })
        .join(""),
      bottomRoundRect(x + 1, Y + CH - 54, CW - 2, 53, 15, P.paper),
      T(caption, { x: x + CW / 2, y: Y + CH - 20, size: 21, weight: 500, fill: P.ink, anchor: "middle" })
    ].join("");
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("同一塊地，三個身分", "醫療專用區是民國 108 年這一輪才出現的，不是民國 101 年那一輪"),

      stage(60, {
        tone: P.deep2,
        head: "民國 101 年之前",
        name: "機十　機關用地",
        plan: "民國 97 年 12 月",
        doc: "國防部核定營區遷建",
        bullets: ["原為陸軍空降訓練中心", "都市計畫編為機關用地", "民國 101 年啟動個案變更"],
        caption: "這時還沒有醫療專用區"
      }),
      arrowRight(394, 350, 431, { color: P.deep2, sw: 4, head: 12 }),
      stage(435, {
        tone: P.deep,
        head: "民國 106 年那一輪",
        name: "住宅區＋兩個專用區",
        plan: "主要計畫 106 年 2 月 17 日",
        doc: "屏府城都字第 10604967001 號",
        bullets: ["住宅區、公園、道路", "樂齡產業專用區", "運動休閒健康專用區"],
        caption: "這一輪裡沒有醫療專用區"
      }),
      arrowRight(769, 350, 806, { color: P.accent2, sw: 4, head: 12 }),
      stage(810, {
        tone: P.accent,
        head: "民國 108 年這一輪",
        name: "醫療專用區",
        plan: "主要計畫 108 年 4 月 24 日",
        doc: "屏府城都字第 10814230001 號",
        bullets: ["由兩個專用區與公園用地變更", "醫療專用區 6.44 公頃", "建蔽率 60%、容積率 360%"],
        caption: "細部計畫 108 年 5 月 16 日"
      }),

      R(60, 566, 1080, 94, { fill: P.paper, rx: 14 }),
      T(fit("fig-02 底部 1", "重劃完成記在民國 112 年 11 月 8 日（屏東縣政府地政處公辦市地重劃區一覽表）", 22, 1024), {
        x: 88,
        y: 604,
        size: 22,
        weight: 700,
        fill: P.ink
      }),
      T(fit("fig-02 底部 2", "新聞常寫的「5 月 21 日」，是細部計畫「自同年 5 月 21 日起公告實施」的實施日", 20, 1024), {
        x: 88,
        y: 638,
        size: 20,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1005 fig-03（第七節）：七條路的官方寬度，加一列查不到的。
 * 🔴 最後那一列是這張圖的重點：**「榮總東路」不在表 5-1 裡**，
 *    命名公告文號、日期與核定機關本次都查不到，所以畫成虛線空框。
 *    ⚠️ 不可以把它畫成一根有長度的柱子——那等於自己編一個寬度出來。
 * 🔴 也不可以寫「政府為醫院開闢並命名榮總東路」：命名公告查不到。
 * 比例尺：1 公尺 ＝ 30px，柱子從 x=300 起算（最長的和平路 23 公尺到 x=990）。
 */
function fig1005_03() {
  const W = 1200;
  const H = 675;
  const BX = 300;
  const SCALE = 30;

  const road = (y, { name, kind, meters, hot }) => {
    fit(`fig-03 路名「${name}」`, name, 25, 110);
    fit(`fig-03 分類「${kind}」`, kind, 19, 110);
    const bw = meters * SCALE;
    return [
      T(name, { x: 60, y: y + 26, size: 25, weight: 700, fill: hot ? P.accent2 : P.ink }),
      T(kind, { x: 176, y: y + 26, size: 19, weight: 500, fill: P.deep2 }),
      R(BX, y, bw, 36, { fill: hot ? P.accent : P.deep2, rx: 4 }),
      T(`${meters} 公尺`, { x: BX + bw + 14, y: y + 26, size: 21, weight: 700, fill: hot ? P.accent2 : P.ink })
    ].join("");
  };

  const rows = [
    { name: "和平路", kind: "主要道路", meters: 23 },
    { name: "建國路", kind: "主要道路", meters: 19 },
    { name: "大同路", kind: "次要道路", meters: 19 },
    { name: "華盛街", kind: "次要道路", meters: 18 },
    { name: "大武路", kind: "次要道路", meters: 15 },
    { name: "永大路", kind: "次要道路", meters: 12, hot: true },
    { name: "武昌街", kind: "次要道路", meters: 8 }
  ];

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("永大路 12 公尺，是七條裡最窄的兩條之一", "官方調查把它列為次要道路；最寬的是和平路 23 公尺", { size: 42 }),

      rows.map((item, i) => road(178 + i * 50, item)).join(""),

      // 查不到的那一列：虛線空框，框裡直接寫「查不到」。
      T("榮總東路", { x: 60, y: 554, size: 25, weight: 700, fill: P.accent2 }),
      T("不在表 5-1", { x: 176, y: 554, size: 19, weight: 500, fill: P.accent2 }),
      R(BX, 528, 690, 36, { fill: "none", stroke: P.accent2, sw: 3, rx: 4, dash: "12 9" }),
      T(fit("fig-03 查不到那一列", "命名公告文號、日期與核定機關　查不到", 21, 650), {
        x: BX + 345,
        y: 553,
        size: 21,
        weight: 700,
        fill: P.accent2,
        anchor: "middle"
      }),

      R(60, 588, 1080, 74, { fill: P.paper, rx: 14 }),
      T(fit("fig-03 底部 1", "這是民國 106 年的現況調查值，不是計畫寬度，也不是現在的實測值", 21, 1024), {
        x: 88,
        y: 620,
        size: 21,
        weight: 700,
        fill: P.ink
      }),
      T(fit("fig-03 底部 2", "主要計畫書表 5-1「變更基地周邊主次要道路幾何佈設一覽表」，原表的人行道寬度欄位全部空白", 19, 1024), {
        x: 88,
        y: 648,
        size: 19,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1005 fig-04（第十節）：「醫院旁邊比較保值」查了五個地方。
 * 🔴 這張圖上**一個房價數字都沒有**，而且不可以加。素材表 D-9 列了一份反面清單
 *    （議價幅度百分比、幾倍、高幾成），那些數字只出現在業者自製內容，
 *    連「拿來當反例」都不行——圖上出現過的數字，讀者只會記得數字本身。
 * 🔴 GRB 那一列必須寫「無法確認」而不是「沒有」：查證當日該站顯示系統升級公告。
 *    把「查不了」寫成「沒有」，是這一節唯一會毀掉可信度的錯。
 */
function fig1005_04() {
  const W = 1200;
  const H = 675;

  const channel = (i, { name, result }) => {
    const y = 176 + i * 76;
    fit(`fig-04 管道「${name}」`, name, 24, 592);
    fit(`fig-04 結果「${result}」`, result, 20, 592);
    return [
      R(60, y, 640, 68, { fill: P.paper, rx: 10 }),
      T(name, { x: 84, y: y + 30, size: 24, weight: 700, fill: P.deep }),
      T(result, { x: 84, y: y + 58, size: 20, weight: 500, fill: P.ink })
    ].join("");
  };

  const chip = (x, label) =>
    [
      R(x, 288, 130, 46, { fill: P.paper, rx: 23 }),
      T(label, { x: x + 65, y: 319, size: 24, weight: 700, fill: P.deep, anchor: "middle" })
    ].join("");

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("「醫院旁邊比較保值」：查了五個地方", "四個沒找到，一個當天系統升級查不了；查得到的只有兩篇碩士論文"),

      channel(0, { name: "臺灣博碩士論文知識加值系統", result: "論文名稱精準檢索「醫院」與「房價」：2 筆" }),
      channel(1, { name: "內政部不動產資訊平台", result: "查不到以醫院對周邊房價影響為題的官方統計" }),
      channel(2, { name: "內政部建築研究所", result: "業務統計與出版品檢索：查不到" }),
      channel(3, { name: "政府研究資訊系統 GRB", result: "查證當日顯示系統升級公告，無法確認" }),
      channel(4, { name: "一般搜尋引擎", result: "出現的都是業者自製內容，未註明資料來源" }),

      R(740, 176, 400, 372, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      topRoundRect(741, 177, 398, 54, 15, P.deep),
      T("唯一查得到的數字", { x: 940, y: 213, size: 26, weight: 700, fill: P.white, anchor: "middle" }),
      T("論文題目同時出現", { x: 940, y: 272, size: 21, weight: 500, fill: P.ink, anchor: "middle" }),
      chip(790, "醫院"),
      chip(960, "房價"),
      T("2 筆", { x: 940, y: 418, size: 64, weight: 900, fill: P.accent2, anchor: "middle" }),
      T(fit("fig-04 全庫筆數", "全庫書目與摘要 1,554,988 筆", 20, 360), {
        x: 940,
        y: 456,
        size: 20,
        weight: 500,
        fill: P.deep2,
        anchor: "middle"
      }),
      R(768, 478, 10, 10, { fill: P.accent, rx: 2 }),
      T("兩篇的結論方向不一致", { x: 790, y: 488, size: 20, weight: 500, fill: P.ink }),
      R(768, 512, 10, 10, { fill: P.accent, rx: 2 }),
      T("沒有一篇以屏東為研究範圍", { x: 790, y: 522, size: 20, weight: 500, fill: P.ink }),

      R(60, 566, 1080, 94, { fill: P.paper, rx: 14 }),
      T(fit("fig-04 底部 1", "兩篇都是碩士論文：一篇以高雄市住宅大樓為對象，一篇研究新竹地區疫情期間的變化", 22, 1024), {
        x: 88,
        y: 604,
        size: 22,
        weight: 700,
        fill: P.ink
      }),
      T(fit("fig-04 底部 2", "所以這篇不寫「研究顯示會漲」，也不寫「研究顯示會跌」", 20, 1024), {
        x: 88,
        y: 638,
        size: 20,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/**
 * 1005 fig-05（第十一節）：法規原文用的詞是「重要環境設施」。
 * 🔴 左邊那個圓圈是**示意**，不是地圖：圈裡六個點的位置沒有任何地理意義，
 *    所以底下那條說明帶一定要留著。畫成看起來像實際位置的樣子，就是自己編距離。
 * ⚠️ 「嫌惡設施」四個字上面的叉，一定畫在字**之前**（壓在字底下）；
 *    先字後叉會把四個字切成碎塊，讀起來像圖壞了，而不是「這個詞不在法規裡」。
 */
function fig1005_05() {
  const W = 1200;
  const H = 675;
  const CX = 320;
  const CY = 390;

  /** 圈裡的一個設施點：小圓 ＋ 底下的名稱。位置純示意。 */
  const spot = (x, y, label) => {
    fit(`fig-05 設施「${label}」`, label, 18, 150);
    return (
      `<circle cx="${x}" cy="${y}" r="7" fill="${P.deep}"/>` +
      T(label, { x, y: y + 26, size: 18, weight: 500, fill: P.ink, anchor: "middle" })
    );
  };

  return svgDoc(
    W,
    H,
    [
      R(0, 0, W, H, { fill: P.white }),
      figHeading("法規寫的是「重要環境設施」", "醫院跟市場、學校、警察局排在同一份清單裡，法規不做好壞評價"),

      // 左：說明書「周邊環境」那一頁的圖面示意
      R(60, 168, 520, 420, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      topRoundRect(61, 169, 518, 54, 15, P.deep),
      T("不動產說明書　周邊環境那一頁", { x: 320, y: 205, size: 28, weight: 700, fill: P.white, anchor: "middle" }),
      `<circle cx="${CX}" cy="${CY}" r="140" fill="${P.band}" fill-opacity="0.45" stroke="${P.deep2}" stroke-width="3" stroke-dasharray="12 9"/>`,
      R(CX - 8, CY - 8, 16, 16, { fill: P.deep, rx: 3 }),
      T("標的", { x: CX - 18, y: CY + 6, size: 19, weight: 700, fill: P.deep, anchor: "end" }),
      PATH(`M${CX} ${CY} L${CX + 140} ${CY}`, { stroke: P.accent, sw: 3, dash: "8 7" }),
      T("半徑三百公尺", { x: CX + 70, y: CY + 24, size: 18, weight: 700, fill: P.accent2, anchor: "middle" }),
      spot(CX, CY - 85, "醫院"),
      spot(CX + 74, CY - 42, "學校"),
      spot(CX + 74, CY + 42, "加油站"),
      spot(CX, CY + 85, "殯儀館"),
      spot(CX - 74, CY + 42, "警察局"),
      spot(CX - 74, CY - 42, "公有市場"),
      bottomRoundRect(61, 534, 518, 53, 15, P.paper),
      T("示意圖，不是實際位置或比例", { x: 320, y: 568, size: 22, weight: 500, fill: P.ink, anchor: "middle" }),

      // 右上：法規用詞 vs 業界俗稱
      // ⚠️ 這裡**不能**用 `crossMark()`：它畫的是正方形的叉，要蓋住「嫌惡設施」四個字
      //    （寬 104）就得把高度也拉到 104，上緣會直接切進上面「重要環境設施」那一行——
      //    等於把這張圖要強調的正確用詞劃掉。所以改成一組寬 120、高 40 的扁 X，
      //    畫在字**之前**（壓在字底下），只蓋住那四個字所在的帶狀範圍。
      R(620, 168, 520, 196, { fill: P.white, stroke: P.accent, sw: 3, rx: 16 }),
      T("法規原文用的詞", { x: 648, y: 202, size: 22, weight: 700, fill: P.accent2 }),
      T("重要環境設施", { x: 648, y: 258, size: 42, weight: 900, fill: P.deep }),
      PATH("M642 302 L762 342", { stroke: P.accent2, sw: 4 }),
      PATH("M762 302 L642 342", { stroke: P.accent2, sw: 4 }),
      T("嫌惡設施", { x: 648, y: 332, size: 26, weight: 700, fill: P.ink }),
      T(fit("fig-05 俗稱註", "業界俗稱，不是法律用語", 20, 330), {
        x: 790,
        y: 332,
        size: 20,
        weight: 500,
        fill: P.deep2
      }),

      // 右下：不得記載事項第六點
      R(620, 392, 520, 196, { fill: P.white, stroke: P.line, sw: 2, rx: 16 }),
      T("貳、不得記載事項　六", { x: 648, y: 428, size: 22, weight: 700, fill: P.deep2 }),
      T("不得記載房價有上漲空間", { x: 648, y: 476, size: 24, weight: 700, fill: P.ink }),
      T("或預測房價上漲之情形。", { x: 648, y: 510, size: 24, weight: 700, fill: P.ink }),
      T("這是法定的不得記載事項，不是道德勸說", { x: 648, y: 556, size: 20, weight: 500, fill: P.deep2 }),

      T(fit("fig-05 底部 1", "內政部「不動產說明書應記載及不得記載事項」（民國 115 年 1 月 13 日台內地字第 1140267470 號令修正）", 20, 1080), {
        x: 60,
        y: 628,
        size: 20,
        weight: 500,
        fill: P.deep2
      }),
      T(fit("fig-05 底部 2", "整份公告從應記載事項到不得記載事項，沒有出現「嫌惡設施」四個字", 19, 1080), {
        x: 60,
        y: 656,
        size: 19,
        weight: 500,
        fill: P.deep2
      })
    ].join("")
  );
}

/* ═══════════════════════════════════════════════════════════════
   4. 清單與產出
   要加新圖：在這個陣列加一列，跑一次 `node scripts/build-blog-images.mjs`。
   ═══════════════════════════════════════════════════════════════ */

const IMAGES = [
  { file: "og-blog.png", w: 1200, h: 630, svg: ogBlog },
  { file: "1001-pingtung-townhouse-site-visit/cover.png", w: 1200, h: 630, svg: cover1001 },
  { file: "1001-pingtung-townhouse-site-visit/fig-01.png", w: 1200, h: 675, svg: fig01 },
  { file: "1001-pingtung-townhouse-site-visit/fig-02.png", w: 1200, h: 675, svg: fig02 },
  { file: "1001-pingtung-townhouse-site-visit/fig-03.png", w: 1200, h: 675, svg: fig03 },
  { file: "1001-pingtung-townhouse-site-visit/fig-04.png", w: 1200, h: 675, svg: fig04 },
  { file: "1001-pingtung-townhouse-site-visit/fig-05.png", w: 1200, h: 675, svg: fig05 },
  { file: "1002-chongda-xincheng-military-village/cover.png", w: 1200, h: 630, svg: cover1002 },
  { file: "1003-spouse-gift-pingtung/cover.png", w: 1200, h: 630, svg: cover1003 },
  { file: "1003-spouse-gift-pingtung/fig-01.png", w: 1200, h: 675, svg: fig1003_01 },
  { file: "1003-spouse-gift-pingtung/fig-02.png", w: 1200, h: 675, svg: fig1003_02 },
  { file: "1003-spouse-gift-pingtung/fig-03.png", w: 1200, h: 675, svg: fig1003_03 },
  { file: "1003-spouse-gift-pingtung/fig-04.png", w: 1200, h: 675, svg: fig1003_04 },
  { file: "1003-spouse-gift-pingtung/fig-05.png", w: 1200, h: 675, svg: fig1003_05 },
  { file: "1004-alley-townhouse-parking/cover.png", w: 1200, h: 630, svg: cover1004 },
  { file: "1004-alley-townhouse-parking/fig-01.png", w: 1200, h: 675, svg: fig1004_01 },
  { file: "1004-alley-townhouse-parking/fig-02.png", w: 1200, h: 675, svg: fig1004_02 },
  { file: "1004-alley-townhouse-parking/fig-03.png", w: 1200, h: 675, svg: fig1004_03 },
  { file: "1004-alley-townhouse-parking/fig-04.png", w: 1200, h: 675, svg: fig1004_04 },
  { file: "1004-alley-townhouse-parking/fig-05.png", w: 1200, h: 675, svg: fig1004_05 },
  { file: "1005-ptvgh-area/cover.png", w: 1200, h: 630, svg: cover1005 },
  { file: "1005-ptvgh-area/fig-01.png", w: 1200, h: 675, svg: fig1005_01 },
  { file: "1005-ptvgh-area/fig-02.png", w: 1200, h: 675, svg: fig1005_02 },
  { file: "1005-ptvgh-area/fig-03.png", w: 1200, h: 675, svg: fig1005_03 },
  { file: "1005-ptvgh-area/fig-04.png", w: 1200, h: 675, svg: fig1005_04 },
  { file: "1005-ptvgh-area/fig-05.png", w: 1200, h: 675, svg: fig1005_05 }
];

/** 單檔大小上限（見 docs/blog-images.md：封面是 eager 載入，太大直接拖慢手機第一屏）。 */
const MAX_BYTES = 500 * 1024;

async function main() {
  await mkdir(OUT_ROOT, { recursive: true });
  await writeFile(path.join(OUT_ROOT, ".gitkeep"), "", "utf8");

  const failures = [];

  for (const item of IMAGES) {
    const outPath = path.join(OUT_ROOT, item.file);
    await mkdir(path.dirname(outPath), { recursive: true });

    const svg = item.svg();
    await sharp(Buffer.from(svg, "utf8"))
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(outPath);

    // 驗收：格式、尺寸、檔案大小，三項都自己讀回來確認，不靠「檔案有產出」當成功。
    // ⚠️ `metadata()` 讀檔案時 `size` 是 undefined（只有讀 Buffer 才有），檔案大小要問 fs。
    const meta = await sharp(outPath).metadata();
    const bytes = (await stat(outPath)).size;
    const kb = Math.round(bytes / 1024);
    const ok = meta.format === "png" && meta.width === item.w && meta.height === item.h && bytes <= MAX_BYTES;
    if (!ok) {
      failures.push(`${item.file}：${meta.format} ${meta.width}×${meta.height} ${kb}KB（期望 png ${item.w}×${item.h}、≤500KB）`);
    }
    console.log(`${ok ? "OK  " : "FAIL"} ${item.file.padEnd(52)} ${meta.format} ${meta.width}×${meta.height} ${String(kb).padStart(4)}KB`);
  }

  if (overflows.length) {
    console.log("\n⚠️ 文字可能超出框線（估算值，請開圖確認）：");
    for (const line of overflows) console.log(`   - ${line}`);
  }

  if (failures.length) {
    console.error("\n🔴 驗收未通過：");
    for (const line of failures) console.error(`   - ${line}`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n共 ${IMAGES.length} 張，全部通過尺寸與大小檢查。`);
  console.log("🔴 還沒完：請實際開圖確認中文有正確渲染（不是豆腐方塊），並逐字校對圖上的字。");
}

await main();
