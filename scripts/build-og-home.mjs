/**
 * 首頁社群分享圖產生器（SVG ＋ 形象照 → PNG，用 sharp）
 * =====================================================================
 * 跑法：`node scripts/build-og-home.mjs`（要在專案根目錄跑，不然找不到 sharp）
 * 產物：`public/img/og-home.png`，1200 × 630。
 *
 * ── 為什麼需要這張圖 ──
 * 在此之前首頁的 og:image 直接指向形象照 `public/img/shuya-profile.jpg`，
 * 那是 **1044 × 1568 的直式照**。但 LINE 與 Facebook 的預覽卡是 **1.91:1 的橫式**，
 * 直式圖塞進去會被置中裁切 —— 實測那張照片的臉在畫面上方約 40%，
 * 裁完之後臉會落在框外，客戶看到的是一塊只有西裝的灰色方塊。
 * 而「把首頁網址貼進 LINE 傳給客戶」正是書亞最常做的推廣動作。
 *
 * 部落格那條線本來就做對了（cover 與 og-blog 全部 1200×630 並標了 width/height），
 * 所以在補這張之前是「文章分享很漂亮、首頁分享破圖」。
 *
 * ── 🔴 三條規矩（沿用 build-blog-images.mjs）──
 *   1. **不可有亂數、不可讀當下時間**。同樣的原始碼要產出位元組相同的 PNG，
 *      不然每次重跑 git 都會看到假異動。
 *   2. **圖上的姓名、職稱、證號、電話、加盟店名一律從原始碼抽出來，不在這裡重打。**
 *      抽不到就直接 throw 讓建置失敗 —— 這是對外廣告，印錯一個字就是不實廣告，
 *      而且圖產出來「看起來完全正常」，沒有任何地方會提醒你。
 *   3. 色票沿用 `site.css` 的有巢氏 CIS，不要臨時調色。
 *
 * ── 中文字型 ──
 * sharp 內建的 libvips 帶 pango/fontconfig，吃得下 SVG 裡的中文，但字型是跟
 * **作業系統**要的。本機 Windows 實測 fallback 到 Microsoft JhengHei，中文與
 * 全形空格（U+3000）都正常。換機器重跑前先開圖看有沒有變成豆腐方塊。
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "public", "img", "og-home.png");
const PHOTO = path.join(ROOT, "public", "img", "shuya-profile.jpg");

const W = 1200;
const H = 630;
/** 左邊放形象照的寬度，右邊 730px 給品牌資訊 */
const PHOTO_W = 470;

/** 有巢氏 CIS（與 src/app/site.css 的 :root 同一組） */
const C = {
  deep: "#005335",
  deepest: "#00301F",
  green: "#4FAF38",
  band: "#CDE3D5",
  accent: "#D9660A",
  white: "#FFFFFF"
};

const FONT_STACK = `"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;

/* ═══════════════════════════════════════════════════════════════
   1. 從原始碼抽字串（規矩 2）
   ═══════════════════════════════════════════════════════════════ */

/**
 * 從某支檔案抽出 `key: "值"` 的值。
 * 抽不到就 throw —— 寧可建置失敗，也不要默默印出上一版的舊電話或舊證號。
 */
function pick(source, file, key) {
  const m = source.match(new RegExp(`${key}\\s*:\\s*"([^"]+)"`));
  if (!m) {
    throw new Error(
      `在 ${file} 找不到 ${key}。這張圖上的字一律從原始碼抽，不可以在腳本裡重打；` +
        `請確認欄位名稱是不是被改過，改對了再跑一次。`
    );
  }
  return m[1];
}

const profileSrc = await readFile(path.join(ROOT, "src", "lib", "profile.ts"), "utf8");
const agencySrc = await readFile(path.join(ROOT, "src", "lib", "agency.ts"), "utf8");
const pageSrc = await readFile(path.join(ROOT, "src", "app", "page.tsx"), "utf8");
const contentSrc = await readFile(path.join(ROOT, "src", "lib", "content.ts"), "utf8");

const TXT = {
  name: pick(profileSrc, "profile.ts", "name"),
  phone: pick(profileSrc, "profile.ts", "phone"),
  licenseNo: pick(profileSrc, "profile.ts", "licenseNo"),
  agency: pick(agencySrc, "agency.ts", "name"),
  jobTitle: pick(agencySrc, "agency.ts", "jobTitle"),
  brand: pick(pageSrc, "page.tsx", "siteName"),
  slogan: pick(contentSrc, "content.ts", "footerSlogan"),
  // heroTagline 原文帶了「」，圖上另外排版所以把引號去掉
  tagline: pick(contentSrc, "content.ts", "heroTagline").replace(/^「|」$/g, "")
};

/**
 * 抽出來的東西還是要驗一次形狀。
 * 正則有可能抓到「另一個剛好也叫 name 的欄位」—— 例如 agency.ts 裡的
 * `broker.name`（那是**另一個人**陳映璿，印上去就是把經紀人寫成營業員）。
 */
if (!TXT.agency.includes("加盟店")) {
  throw new Error(`agency.ts 抽到的名稱是「${TXT.agency}」，少了「加盟店」——抓錯欄位了`);
}
if (TXT.name !== "陳書亞") {
  throw new Error(`profile.ts 抽到的姓名是「${TXT.name}」，不是陳書亞——抓錯欄位了`);
}
if (!/^09\d{2}-\d{3}-\d{3}$/.test(TXT.phone)) {
  throw new Error(`profile.ts 抽到的電話是「${TXT.phone}」，格式不對——抓錯欄位了`);
}

/* ═══════════════════════════════════════════════════════════════
   2. SVG 小工具
   ═══════════════════════════════════════════════════════════════ */

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 粗估文字寬度（沿用 build-blog-images.mjs 的尺，只拿來擋爆框） */
function measure(str, size) {
  let units = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (ch === "　") units += 1;
    else if (code < 0x2e80) units += /[A-Za-z0-9]/.test(ch) ? 0.56 : ch === " " ? 0.28 : 0.42;
    else units += 1;
  }
  return units * size;
}

const overflows = [];
function fit(where, str, size, maxWidth) {
  const w = measure(str, size);
  if (w > maxWidth) overflows.push(`${where}：「${str}」估寬 ${Math.round(w)}px > 可用 ${maxWidth}px`);
  return str;
}

function T(str, { x = 0, y = 0, size = 28, weight = 400, fill = C.white, ls } = {}) {
  const a = [`x="${x}"`, `y="${y}"`, `font-size="${size}"`, `font-weight="${weight}"`, `fill="${fill}"`];
  if (ls) a.push(`letter-spacing="${ls}"`);
  return `<text ${a.join(" ")}>${esc(str)}</text>`;
}

/* ═══════════════════════════════════════════════════════════════
   3. 版面
   ═══════════════════════════════════════════════════════════════ */

const PAD = 56;
const TX = PHOTO_W + PAD; // 文字左緣
const TW = W - TX - PAD; // 文字可用寬度

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${C.deep}"/>
    <stop offset="1" stop-color="${C.deepest}"/>
  </linearGradient>
</defs>
<style>text{font-family:${FONT_STACK}}</style>

<!-- 🔴 底色只畫右半邊（x 從 ${PHOTO_W} 開始）。畫成滿版的話，
     這層 SVG 疊上去會把左邊的形象照整個蓋掉，最後只剩一塊綠色。 -->
<rect x="${PHOTO_W}" y="0" width="${W - PHOTO_W}" height="${H}" fill="url(#bg)"/>

<!-- 照片與品牌區之間的橘色分隔條，兼作 CTA 色的呼應 -->
<rect x="${PHOTO_W}" y="0" width="8" height="${H}" fill="${C.accent}"/>

<!-- 右上角淡綠圓形裝飾，避免右側整片死板 -->
<circle cx="${W - 90}" cy="-40" r="200" fill="${C.green}" opacity="0.10"/>

${T(fit("標語", TXT.tagline, 27, TW), { x: TX, y: 150, size: 27, fill: C.band, ls: 1 })}

${T(fit("品牌", TXT.brand, 64, TW), { x: TX, y: 236, size: 64, weight: 900, fill: C.white, ls: 2 })}

<rect x="${TX}" y="266" width="86" height="6" rx="3" fill="${C.green}"/>

${T(fit("標語二", TXT.slogan, 29, TW), { x: TX, y: 330, size: 29, weight: 700, fill: C.green })}

${T(fit("職稱證號", `${TXT.name}・${TXT.jobTitle}　證號 ${TXT.licenseNo}`, 23, TW), {
  x: TX,
  y: 396,
  size: 23,
  fill: "#BFD8C8"
})}
${T(fit("加盟店", TXT.agency, 23, TW), { x: TX, y: 432, size: 23, fill: "#BFD8C8" })}

<!-- 電話膠囊：整張圖唯一的橘色實心塊，視線最後停在這裡 -->
<rect x="${TX}" y="474" width="${Math.round(measure(`${TXT.phone}（同 LINE）`, 33) + 56)}" height="66" rx="33" fill="${C.accent}"/>
${T(fit("電話", `${TXT.phone}（同 LINE）`, 33, TW - 56), {
  x: TX + 28,
  y: 518,
  size: 33,
  weight: 900,
  fill: C.white
})}
</svg>`;

/* ═══════════════════════════════════════════════════════════════
   4. 合成
   ═══════════════════════════════════════════════════════════════ */

/**
 * 形象照裁成 470 × 630。
 * 🔴 `position: "top"` 不是隨手填的：原圖 1044×1568，等比縮到寬 470 之後高是 706，
 * 要裁掉 76px。臉在原圖上方約 40%（縮完約 y=282），從**上緣**裁的話臉會落在
 * 可視範圍的中間偏上，構圖正常；從中間或下緣裁就會切到下巴。
 * 也**不要**用 sharp 的 attention 策略 —— 那會隨演算法版本改變結果，違反「可重現」那條規矩。
 */
const photo = await sharp(PHOTO).resize(PHOTO_W, H, { fit: "cover", position: "top" }).toBuffer();

/**
 * 疊圖順序：底色 → 形象照（左）→ SVG（右半底色＋分隔條＋文字）。
 *
 * ⚠️ `.composite()` **只能呼叫一次**，呼叫第二次是整組取代掉第一次，不是疊上去。
 * 順序也不能反：SVG 那層要壓在照片之上（分隔條剛好蓋在照片右緣），
 * 而 SVG 的底色只畫右半邊，所以不會蓋到照片。
 */
const png = await sharp({
  create: { width: W, height: H, channels: 4, background: { r: 0, g: 83, b: 53, alpha: 1 } }
})
  .composite([
    { input: photo, top: 0, left: 0 },
    { input: Buffer.from(svg), top: 0, left: 0 }
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(OUT, png);

const meta = await sharp(png).metadata();
console.log(`✅ 產出 ${path.relative(ROOT, OUT)}　${meta.width}×${meta.height}　${(png.length / 1024).toFixed(0)} KB`);
console.log("   圖上的字（全部抽自原始碼，非手打）：");
Object.entries(TXT).forEach(([k, v]) => console.log(`   · ${k.padEnd(10)} ${v}`));
if (overflows.length) {
  console.log("\n⚠️ 有文字超出可用寬度，請調整字級或縮短文案：");
  overflows.forEach((o) => console.log("   " + o));
  process.exitCode = 1;
}
