/**
 * 分類膠囊列（`.bl-catbar`，規格書 §3.16、INTERFACE §3.11）。
 *
 * 列表頁與分類頁**共用同一顆元件**，差別只在傳不傳 `current`。
 *
 * 🔴 三件不能動的事：
 *   ① 「全部」永遠是第一顆，指向 `/blog`。
 *   ② 其餘五顆的順序直接來自 `CATEGORIES`，那是**主題性排列**
 *      （在地趨勢 → 物件 → 稅 → 法 → 市場），不是熱門度，不要重排。
 *   ③ `aria-current="page"` **整列只能有一顆有**：分類頁在該分類那顆，
 *      列表頁（沒傳 `current`）才落在「全部」。CSS 的深綠底就是靠這個屬性選擇器上色，
 *      多掛一顆會同時亮兩顆。
 *
 * 網址一律走 `BLOG_URL` 與 `categoryUrl()`，不自己拼字串（要與 canonical／sitemap 同一個來源）。
 * 零 JavaScript，Server Component，不要加 "use client"。
 */
import { BLOG_URL, CATEGORIES, categoryUrl, type CategorySlug } from "@/lib/blog";

/** 不傳 `current` ＝ 停在「全部」（列表頁）。 */
export type BlCatBarProps = { current?: CategorySlug };

/** 第一顆膠囊的文字。它不是分類，所以不在 `CATEGORIES` 裡。 */
const ALL_LABEL = "全部";

export default function BlCatBar({ current }: BlCatBarProps) {
  return (
    <div className="bl-catbar">
      <a href={BLOG_URL} aria-current={current ? undefined : "page"}>
        {ALL_LABEL}
      </a>
      {CATEGORIES.map((category) => (
        <a
          key={category.slug}
          href={categoryUrl(category)}
          aria-current={current === category.slug ? "page" : undefined}
        >
          {category.name}
        </a>
      ))}
    </div>
  );
}
