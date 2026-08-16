/**
 * 網站圖示產生器（SVG → PNG → ICO，用 sharp）
 * ================================================================
 *
 * 跑法：`npm run icons`（要在專案根目錄跑，不然找不到 sharp）
 *
 * ── 為什麼需要這支 ──
 *
 * 根 `layout.tsx` 本來就宣告了一個 data-URI 的 SVG 圖示，**瀏覽器分頁的小圖是有的**。
 * 缺的是兩個「不看 HTML、直接照固定路徑要檔案」的情境：
 *
 *   ① `/favicon.ico` —— 部分爬蟲、RSS 閱讀器、舊瀏覽器、以及一些預覽卡服務
 *      不解析 HTML，直接打這個路徑。2026-08-16 實測線上回 **404**。
 *   ② `apple-touch-icon` —— iOS「加入主畫面」不吃 SVG 也不吃 data-URI，
 *      找不到就**拿整頁截圖當圖示**（書亞的待辦裡記的就是這個）。
 *
 * ── 為什麼放 `public/` 不放 `src/app/` ──
 *
 * Next 的 file convention（`src/app/icon.png`）會產生帶雜湊的網址
 * （`/icon.png?abc123`），那樣 `/favicon.ico` 這個**固定路徑**還是 404。
 * 放 `public/` 才會原樣掛在網址上，而 `layout.tsx` 的 `metadata.icons`
 * 明確指過去 —— 路徑是什麼一眼看得到，不用去記 convention 的優先順序。
 *
 * 🔴 **圖案要跟 `layout.tsx` 那個 data-URI SVG 長一樣**（綠底圓角＋白色「書」）。
 *    兩邊不一致的話，分頁小圖跟主畫面圖示會是兩種東西，而且沒有任何地方會提醒。
 *    改了這裡就要一起改那一段。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

/** 有巢氏綠。跟 `layout.tsx` 的 `themeColor` 與 data-URI SVG 同一個值 */
const BRAND = "#005335";

/**
 * 字型堆疊。⚠️ 專案裡沒有這些字型檔，這串是寫給**作業系統**看的；
 * 找不到就 fallback，最後一關永遠是 sans-serif。與 `build-blog-images.mjs` 同一份。
 */
const FONT_STACK = `"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif`;

const PUBLIC = path.join(process.cwd(), "public");

/**
 * 產生圖示的 SVG。
 *
 * @param size   邊長（像素）
 * @param radius 圓角半徑。**iOS 要傳 0** —— 它會自己套圓角遮罩，
 *               來源圖再帶一次圓角就會出現「圓角裡面還有一圈綠色直角」的雙重邊。
 */
function iconSvg(size, radius) {
  // 字級與基線都用比例算，換 size 不用回來調
  const fontSize = Math.round(size * 0.53);
  const baseline = Math.round(size * 0.69);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND}"/>`,
    `<text x="${size / 2}" y="${baseline}" font-size="${fontSize}" font-family='${FONT_STACK}'`,
    ` font-weight="700" fill="#ffffff" text-anchor="middle">書</text>`,
    `</svg>`
  ].join("");
}

const png = (size, radius) =>
  sharp(Buffer.from(iconSvg(size, radius)))
    .png({ compressionLevel: 9 })
    .toBuffer();

/**
 * 把一張 PNG 包成 `.ico`。
 *
 * ICO 從 Windows Vista 起就允許**直接內嵌 PNG**（不必轉成 BMP + AND mask），
 * 所有現代瀏覽器都吃。格式就三段，手寫比裝一個編碼套件划算：
 *   ICONDIR      6 bytes：保留(2)=0、型別(2)=1(icon)、張數(2)
 *   ICONDIRENTRY 16 bytes：寬(1)、高(1)、色數(1)=0、保留(1)=0、平面(2)=1、位元(2)=32、資料長度(4)、位移(4)
 *   PNG 原始位元組
 * 🔴 寬高欄位各只有 1 byte，**256 要寫成 0**。這裡固定 32，不會踩到，但改大小前要記得。
 */
function pngToIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 保留
  header.writeUInt16LE(1, 2); // 型別：1 = icon
  header.writeUInt16LE(1, 4); // 張數

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // 寬
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // 高
  entry.writeUInt8(0, 2); // 調色盤色數：0 = 不使用
  entry.writeUInt8(0, 3); // 保留
  entry.writeUInt16LE(1, 4); // 色彩平面
  entry.writeUInt16LE(32, 6); // 每像素位元
  entry.writeUInt32LE(pngBuffer.length, 8); // 資料長度
  entry.writeUInt32LE(header.length + entry.length, 12); // 資料位移 = 6 + 16

  return Buffer.concat([header, entry, pngBuffer]);
}

mkdirSync(PUBLIC, { recursive: true });

// ① /favicon.ico —— 直接打這個路徑的用戶端要的就是它
const ico32 = await png(32, 5);
writeFileSync(path.join(PUBLIC, "favicon.ico"), pngToIco(ico32, 32));

// ② /icon.png —— 現代瀏覽器與 PWA 用的高解析度版
writeFileSync(path.join(PUBLIC, "icon.png"), await png(512, 112));

// ③ /apple-icon.png —— iOS 加入主畫面。🔴 圓角傳 0，iOS 自己會套遮罩
writeFileSync(path.join(PUBLIC, "apple-icon.png"), await png(180, 0));

console.log("已產生：");
console.log("  public/favicon.ico    32×32（PNG-in-ICO）");
console.log("  public/icon.png       512×512");
console.log("  public/apple-icon.png 180×180（無圓角，iOS 自己套遮罩）");
console.log("");
console.log("🔴 圖案要跟 layout.tsx 那個 data-URI SVG 一致（綠底圓角＋白色「書」）——改一邊就要改另一邊。");
