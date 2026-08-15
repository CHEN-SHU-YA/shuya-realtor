/**
 * ★ 社區規格表 `.bl-spec`（規格書 §3.11、INTERFACE §3.7）。
 *
 * 「社區實勘」類文章專用（主力寫崇大新城）。放在文章 `body` 裡（`.bl-prose` 內），
 * 不是獨立區塊。
 *
 * ⚠️ **首次使用前需實測**：設計來源站的 `article.html`／`bloglist.html`／`home.html`
 *    三個頁面**都沒有用到 `.spec`**，這份 DOM 是從 blog.css L17–L26 的選擇器
 *    逆推出來的唯一合理結構。第一次真的放進文章之前，先在瀏覽器開起來看一次
 *    （重點看：兩欄有沒有對齊、最後一列的分隔線有沒有收掉、≤520px 有沒有塌成單欄）。
 *
 * 🔴 `.bl-r` 這層**不可省**：它是 `display:contents`，本身不佔格子，只把 `dt`/`dd`
 *    綁成一組。省掉會兩欄對不齊，而且 `.bl-r:last-child` 的「最後一列不畫線」也失效。
 *    `.bl-r` 必須是 `<div>`，外層必須是 `<dl>`（子元素是 dt/dd，語意最正確）。
 *
 * 🔴 `source` 設成**必填**，這是「不捏造數據」的程式化實作：
 *    規格表裡的每一格（公設比、坪數、屋齡、戶數、車位、管理費）都是**事實斷言**，
 *    一律查證後才填。查不到的欄位**整列拿掉**，不要推估、不要憑印象填、不要填佔位字。
 *
 * 版面提醒：`dt` 是 `white-space:nowrap`，欄位名不可換行，建議 ≤5 字。
 */
import type { ReactNode } from "react";

export type BlSpecRow = {
  /** 欄位名。`white-space:nowrap`，建議 ≤5 字（例：屋齡、戶數、公設比）。 */
  label: string;
  /** 欄位內容。可含 `<strong>`（會染深綠）。 */
  value: ReactNode;
};

export type BlSpecProps = {
  /** 卡片標題，例：「崇大新城　規格速覽」。 */
  title: string;
  /** 右上徽章（`margin-left:auto` 推到最右），例：「資料更新 2026-08」。 */
  badge?: string;
  /** 規格列。每一列都是事實斷言，查不到就不要放這一列。 */
  rows: readonly BlSpecRow[];
  /** 一句話評語（可含 `<strong>`，會變橘字）。 */
  tag?: ReactNode;
  /**
   * 🔴 必填：資料來源與查詢日期。
   * 例：「資料來源：內政部不動產交易實價查詢服務網，查詢日 2026-08-14」。
   */
  source: string;
};

export default function BlSpec({ title, badge, rows, tag, source }: BlSpecProps) {
  return (
    <div className="bl-spec">
      <div className="bl-spec-h">
        {title}
        {badge ? <span className="bl-badge">{badge}</span> : null}
      </div>
      <dl className="bl-spec-grid">
        {rows.map((row, index) => (
          // 🔴 這層 .bl-r 不可省（display:contents）
          <div className="bl-r" key={`${index}-${row.label}`}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      {tag ? <div className="bl-spec-tag">{tag}</div> : null}
      <div className="bl-spec-src">{source}</div>
    </div>
  );
}
