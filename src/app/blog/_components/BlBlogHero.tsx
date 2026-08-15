/**
 * 列表頁／分類頁的 hero（`.bl-bloghero`，規格書 §3.15、INTERFACE §3.12）。
 *
 * 兩頁共用同一份版型，只換傳進來的三行文字與 `current`：
 *   · 列表頁：`BLOG_EYEBROW` / `BLOG_META.name` / `BLOG_LEAD`，不傳 `current`
 *   · 分類頁：`categoryEyebrow(cat)` / `cat.name` / `cat.desc`，`current` 傳該分類 slug
 *
 * 🔴 DOM 順序固定：眉標 → h1 → 副標 → 膠囊列，四層都在 `.bl-wrap` 內。
 *    外層 `<section class="bl-bloghero">` 不可省——上下留白（`padding:40px 0 8px`）掛在它身上，
 *    省了 hero 會整塊貼著導覽列。
 *
 * 文字一律由呼叫端從 `@/lib/blog` 取好再傳進來，這支不自己組字串（同一句話只能有一個來源）。
 * 零 JavaScript，Server Component，不要加 "use client"。
 */
import BlCatBar from "./BlCatBar";
import type { CategorySlug } from "@/lib/blog";

export type BlBlogHeroProps = {
  /** 眉標：`屏東買賣現場　書亞的第一手筆記` 或分類版（一律用 `BLOG_EYEBROW`／`categoryEyebrow()`，不要手打）。 */
  eyebrow: string;
  /** h1：部落格名稱或分類中文名。 */
  title: string;
  /** 副標（`.bl-lead`）：定位一句話或分類定位。 */
  lead: string;
  /** 目前所在分類；不給就是列表頁（膠囊停在「全部」）。 */
  current?: CategorySlug;
};

export default function BlBlogHero({ eyebrow, title, lead, current }: BlBlogHeroProps) {
  return (
    <section className="bl-bloghero">
      <div className="bl-wrap">
        <div className="bl-eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p className="bl-lead">{lead}</p>
        <BlCatBar current={current} />
      </div>
    </section>
  );
}
