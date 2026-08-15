import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import {
  BLOG_URL_ABS,
  CATEGORIES,
  blogLastModified,
  categoryLastModified,
  categoryUrlAbs,
  getPostsByCategory,
  postUpdatedAt,
  postUrlAbs,
  posts,
  toTaipeiIso
} from "@/lib/blog";

/**
 * 首頁與電子名片的最後更新日。**固定日期，不可以寫 `new Date()`。**
 *
 * 🔴 以前這兩列是 `new Date()`，於是每 build 一次 `lastmod` 就變成新的毫秒級時間戳
 *    （實測 `2026-08-14T14:59:57.200Z`），可是頁面內容一個字都沒改。
 *    Google 會拿 `lastmod` 對照實際內容有沒有異動，連續幾次「說改了、其實沒改」之後，
 *    會開始不信這份 sitemap 的 `lastmod`——連真的改版的那一次也不會優先來抓。
 *    壞掉的方式是安靜的（沒有錯誤、沒有警告），所以只能靠這個常數擋。
 *
 * 部落格那三種頁面不用管：`/blog` 與分類頁走 `blogLastModified()` / `categoryLastModified()`，
 * 文章頁走各自的 `updatedAt`，都是真的會跟著內容動的日期。
 *
 * ⚠️ **首頁或電子名片真的改版時，手動把這個日期往前推。** 沒改內容就不要動它。
 */
const SITE_LAST_MODIFIED = new Date("2026-08-14T00:00:00+08:00");

/**
 * 學區地圖上線日。與上面同一條規則：**固定日期，不可以寫 `new Date()`。**
 *
 * ⚠️ 學區資料每學年度會換一次（目前是 115 學年度），
 *    真的換資料時把這個日期往前推；只是修版面就不要動。
 */
const SCHOOL_MAP_LAST_MODIFIED = new Date("2026-08-15T00:00:00+08:00");

/**
 * 網站地圖。
 *
 * 🔴 網址一律用 `@/lib/blog` 的 `postUrlAbs()` / `categoryUrlAbs()` / `BLOG_URL_ABS`，
 *    不要自己組字串——canonical、og:url、JSON-LD `@id`、卡片 href、這裡的 loc
 *    五處必須是同一個字串（且都沒有結尾斜線），共用同一支函式是唯一能保證的做法。
 *
 * 草稿（`draft: true`）不會出現：`posts` 在 `lib/blog.ts` 就已經濾掉了。
 * 發一篇新文只要把文章加進 `src/content/posts/index.ts`，這裡自動跟上，不用手動維護。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, lastModified: SITE_LAST_MODIFIED, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/card`, lastModified: SITE_LAST_MODIFIED, changeFrequency: "monthly", priority: 0.8 },

    /**
     * 學區地圖。頁面本身住在另一個 Vercel 專案（`shuya-school-map`），
     * 由 `next.config.ts` 的 rewrite 轉過來，但**對 Google 而言就是主站的一頁**，
     * 所以要收進主站的 sitemap。
     *
     * 🔴 沒有這一列的話，Google 幾乎找不到它 —— 主站目前沒有任何連結指向 /tools/school-map，
     *    而把它掛到主站底下的**唯一理由**就是 SEO 權重要留在主站。
     *    收不到 = 這趟搬家白做。
     */
    {
      url: `${SITE_URL}/tools/school-map`,
      lastModified: SCHOOL_MAP_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.8
    },

    // 部落格列表頁：最後更新日 = 全站最新一篇的更新日
    { url: BLOG_URL_ABS, lastModified: blogLastModified(), changeFrequency: "weekly", priority: 0.9 },

    // 分類頁：**只送有文章的**。
    //
    // 🔴 以前是五個分類無條件全送。可是分類頁沒有文章時 render 出來只有 hero 加一句
    //    「這個分類還沒有文章，可以先看看其他分類。」——等於主動請 Google 來抓五個空頁面。
    //    抓到的是內容幾乎相同、彼此又高度重複的薄頁，會拖低整站的抓取信任，
    //    而且沒有任何錯誤或警告會提醒你（sitemap 語法完全合法）。
    //
    // 這一列是自動的：某分類發出第一篇文章，它就自己回到 sitemap，不用手動維護。
    // 草稿不算數——`getPostsByCategory()` 吃的 `posts` 在 `lib/blog.ts` 就已濾掉 `draft:true`，
    // 與「分類頁畫面上看不看得到卡片」用的是同一份資料，不會出現「sitemap 有、頁面空」。
    ...CATEGORIES.filter((category) => getPostsByCategory(category.slug).length > 0).map((category) => ({
      url: categoryUrlAbs(category),
      lastModified: categoryLastModified(category.slug),
      changeFrequency: "weekly" as const,
      priority: 0.6
    })),

    // 每一篇已發布文章：改文只動 `updatedAt`，這裡的 lastmod 會自己跟上
    ...posts.map((post) => ({
      url: postUrlAbs(post),
      lastModified: new Date(toTaipeiIso(postUpdatedAt(post))),
      changeFrequency: "monthly" as const,
      priority: 0.8
    }))
  ];
}
