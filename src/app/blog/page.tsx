/**
 * 部落格列表頁 `/blog`。
 *
 * 版型與分類頁完全共用（規格書 §4.2）：hero → 卡片格線 → JSON-LD，只差四處資料來源。
 *
 * 🔴 這一頁要記住的三件事：
 *   ① `robots` 一定要自己帶 `index:true`。根 layout 是 `index:false`，
 *      而 Next 的 metadata 是「逐層合併、寫了該鍵就整鍵覆蓋」——
 *      這裡漏寫不會有任何畫面異常，但 Google 一篇都不會收。
 *   ② `<title>` 用 `title: { absolute: … }`。根 layout 的 template 是
 *      「%s｜書亞・屏東房產」（中點），不用 absolute 就會吃到它，與規格的全形直線版對不起來。
 *   ③ canonical / og:url / JSON-LD `@id` / sitemap / 卡片 href 五處網址必須相同且無結尾斜線，
 *      所以五處都只准用 `@/lib/blog` 的 `BLOG_URL_ABS` 與 `postUrl()`，不要自己拼字串。
 */
import type { Metadata } from "next";
import BlBlogHero from "./_components/BlBlogHero";
import BlJsonLd from "./_components/BlJsonLd";
import BlPostCard from "./_components/BlPostCard";
import {
  BLOG_DESCRIPTION,
  BLOG_EYEBROW,
  BLOG_LEAD,
  BLOG_META,
  BLOG_OG_IMAGE,
  BLOG_OG_IMAGE_ABS,
  BLOG_URL_ABS,
  buildBlogGraph,
  buildPageTitle,
  getAllPosts
} from "@/lib/blog";

/** 還沒有任何文章時顯示的一句話。空白頁比「準備中」更像壞掉。 */
const EMPTY_TEXT = "文章正在準備中，第一篇很快會放上來。";

export const metadata: Metadata = {
  title: { absolute: buildPageTitle(BLOG_META.name) },
  description: BLOG_DESCRIPTION,
  alternates: { canonical: BLOG_URL_ABS },
  // 🔴 帶 index:true——不是多此一舉，是覆寫根 layout 的 noindex
  robots: { index: true, follow: true, "max-image-preview": "large" },
  openGraph: {
    // 🔴 列表頁是 website 不是 article（原站誤寫成 article，不要跟著錯）
    type: "website",
    locale: "zh_TW",
    siteName: BLOG_META.brand,
    title: buildPageTitle(BLOG_META.name),
    description: BLOG_DESCRIPTION,
    url: BLOG_URL_ABS,
    // 🔴 尺寸跟著圖走，不要在這裡硬寫數字（換圖時一定有人忘了改）
    images: [BLOG_OG_IMAGE]
  },
  twitter: {
    card: "summary_large_image",
    title: buildPageTitle(BLOG_META.name),
    description: BLOG_DESCRIPTION,
    images: [BLOG_OG_IMAGE_ABS]
  }
};

export default function BlogIndexPage() {
  // 已濾掉草稿、依發布日新到舊。卡片與 JSON-LD 的 blogPost[] 都吃這一份，
  // 從結構上消滅「畫面有、結構化資料沒有」的不同步。
  const list = getAllPosts();

  return (
    <>
      <BlBlogHero eyebrow={BLOG_EYEBROW} title={BLOG_META.name} lead={BLOG_LEAD} />

      <div className="bl-wrap">
        {list.length > 0 ? (
          <div className="bl-grid">
            {/* 🔴 第一張卡的封面是這一頁的 LCP，要 eager ＋ fetchpriority=high；
                   其餘維持 lazy（見 BlPostCard 的 `priority`）。 */}
            {list.map((post, index) => (
              <BlPostCard key={post.id} post={post} priority={index === 0} />
            ))}
          </div>
        ) : (
          <p className="bl-lead">{EMPTY_TEXT}</p>
        )}
      </div>

      {/* Blog + RealEstateAgent（2 筆 @graph）。
          🔴 一定要把門市節點一起貼進來：`Blog.publisher` 指向 `…/#agency`，
             這一頁如果沒有那個節點，就是一個指到空氣的懸空引用。 */}
      <BlJsonLd data={buildBlogGraph(list)} />
    </>
  );
}
