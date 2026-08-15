/**
 * ★ 常見問題 `.bl-faq` / `details.bl-qa`（規格書 §3.13、INTERFACE §3.8）。
 *
 * 靈魂元件之三。書亞版採**摺疊版**：原生 `<details>`，**零 JavaScript**。
 * （設計來源站的常見問題是寫在 `.prose` 裡的純段落，但那套 blog.css 完整支援摺疊版，
 *   那組 ＋／－ 是整套 CSS 唯一沒用到的資產，書亞版把它用起來。）
 *
 * 🔴 **位置必須在 `.bl-prose` 外面**。`.bl-faq h2` 自己有一條上邊線樣式，
 *    放進 prose 會同時吃到 `.bl-prose h2` 與 `.bl-faq h2` 兩套，h2 上面會出現兩條線。
 *    正確順序：`.bl-prose` → `<BlFaq>` → `<BlCtaBox>`，三塊都在 `.bl-wrap-narrow` 內。
 *
 * 🔴 `<h2>` 一定要 `id="faq"`（目錄最後一項會連過來，`Post.toc` 也強制最後一項是 `faq`）。
 *
 * 資料同源：`items` 就是 `post.faq`，畫面上的 `<summary>`／`<p>` 與 `buildFaqLd()` 產出的
 * `FAQPage` 用同一份資料 render，從結構上消滅「改了內文忘了同步 JSON-LD」這個破口——
 * 所以**不要在這裡對文字做任何加工**（不要補 `Q：`、不要 trim、不要換標點）。
 *
 * 展開符號 ＋（U+FF0B）／－（U+FF0D）是**全形**，由 CSS 的 `::before` 產生，不在這支檔案裡；
 * 抄成半形會對不齊、展開時寬度跳動。
 *
 * 摺起來的內容 Google 仍然讀得到，不影響收錄。
 */
import type { FaqItem } from "@/lib/blog";

export type BlFaqProps = { items: readonly FaqItem[] };

export default function BlFaq({ items }: BlFaqProps) {
  return (
    <section className="bl-faq">
      <h2 id="faq">常見問題</h2>
      {items.map((item, index) => (
        <details className="bl-qa" key={`${index}-${item.q}`}>
          <summary>{item.q}</summary>
          <p>{item.a}</p>
        </details>
      ))}
    </section>
  );
}
