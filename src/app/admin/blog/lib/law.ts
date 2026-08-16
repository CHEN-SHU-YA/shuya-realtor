/**
 * 法規網址工具與常用法規對照表（B 計畫第二段共用）。
 *
 * 🔴 「出處連結不可手打」護欄：moj 型出處只存 pcode＋flno，網址一律用
 *    `mojLawUrl()`（@/content/blocks/types）現組；這支檔負責反方向——
 *    把貼進來的整串網址解析回 pcode／flno，解析不出就掛標示（不擋）。
 */

/**
 * 解析全國法規資料庫的單條條文頁網址。
 * regex 與轉檔器同一條（INTERFACE-stage1.md §4.2）：
 * `^https://law\.moj\.gov\.tw/LawClass/LawSingle\.aspx\?pcode=(…)&flno=(…)$`。
 * 解析不出回 null（呼叫端顯示「無法辨識這個連結指向哪一條」標示，不擋存檔）。
 */
export function parseMojUrl(url: string): { pcode: string; flno: string } | null {
  const match = /^https:\/\/law\.moj\.gov\.tw\/LawClass\/LawSingle\.aspx\?pcode=([A-Za-z0-9]+)&flno=([0-9]+(?:-[0-9]+)?)$/.exec(
    url.trim()
  );
  if (!match) return null;
  return { pcode: match[1], flno: match[2] };
}

/**
 * 連結白名單（照 admin/content/actions.ts 的 badUrl 抄）：
 * 只收 `https?://` 開頭的外部網址，或 `/` 開頭的站內路徑。
 * 🔴 擋 `javascript:` 開頭；站內路徑要明確擋 `//` 開頭
 *（`//example.com` 會被瀏覽器當外部網址連出去）。
 * 這是資安檢查不是內容鎖。
 */
export function badUrl(url: string): boolean {
  if (!url) return false;
  if (/^https?:\/\//i.test(url)) return false;
  if (/^\/(?!\/)/.test(url)) return false;
  return true;
}

/**
 * 常用法規 pcode 對照表（出處面板的下拉選單用，也可自由輸入別的 pcode）。
 *
 * 🔴 來源：前七筆是 `docs/部落格/事實庫/法規稅務條文庫.md` 種子資料的
 *    (pcode, lawName)；其餘是五篇文章 moj 型出處實際用過的 pcode，
 *    名稱照文章內的連結顯示文字。**不出現在這兩處的法規不憑記憶加**——
 *    pcode 打錯不會報錯、只會安靜連到別部法規。
 */
export const COMMON_LAWS: readonly { pcode: string; name: string }[] = [
  { pcode: "B0000001", name: "民法" },
  { pcode: "D0060053", name: "地籍測量實施規則" },
  { pcode: "D0060066", name: "不動產經紀業管理條例" },
  { pcode: "D0070109", name: "建築法" },
  { pcode: "D0070124", name: "違章建築處理辦法" },
  { pcode: "G0340072", name: "遺產及贈與稅法" },
  { pcode: "G0340096", name: "土地稅法" },
  { pcode: "G0340105", name: "契稅條例" },
  { pcode: "G0340091", name: "印花稅法" },
  { pcode: "D0060001", name: "土地法" },
  { pcode: "F0140013", name: "國軍老舊眷村改建條例" },
  { pcode: "M0020001", name: "農業發展條例" },
  { pcode: "D0070115", name: "建築技術規則建築設計施工編" },
  { pcode: "K0040012", name: "道路交通管理處罰條例" },
  { pcode: "K0040014", name: "道路交通標誌標線號誌設置規則" },
  { pcode: "D0080029", name: "違反道路交通管理事件統一裁罰基準及處理細則" },
  { pcode: "O0030001", name: "噪音管制法" }
];

/** 用 pcode 查常用法規名；查不到回 null（畫面就顯示 pcode 本身）。 */
export function commonLawName(pcode: string): string | null {
  return COMMON_LAWS.find((law) => law.pcode === pcode)?.name ?? null;
}
