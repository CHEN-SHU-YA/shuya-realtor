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
 *    「過到另一半名下」。原因：高雄同業 2026-08-14 那篇同題文章的 h1 就叫
 *    「房子過戶給另一半，貸款還是你在背……」，照抄會在封面上撞出連續 8 個字的雷同。
 *    封面是 og:image，撞名比內文更顯眼。改字前請先確認那邊的標題換了沒有。
 */
function cover1003() {
  const W = 1200;
  const H = 630;
  fit("1003 封面主標 1", "屏東的房子過到另一半名下", 72, 1056);
  fit("1003 封面主標 2", "省下的稅沒你想的多", 72, 1056);

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
      T("屏東的房子過到另一半名下", { x: 72, y: 196, size: 72, weight: 900, fill: P.ink }),
      T("省下的稅沒你想的多", { x: 72, y: 286, size: 72, weight: 900, fill: P.ink }),
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
  { file: "1003-spouse-gift-pingtung/fig-05.png", w: 1200, h: 675, svg: fig1003_05 }
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
