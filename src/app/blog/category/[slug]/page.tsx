/**
 * 分類頁 `/blog/category/{分類 slug}`（例：`/blog/category/tax-case`）。
 *
 * 與列表頁**同一份版型**，只換四處（規格書 §4.2）：
 *   ① metadata（title / description / canonical / og:url）
 *   ② hero 的眉標、h1、副標三行文字
 *   ③ 膠囊列的 `aria-current="page"` 移到對應那顆（「全部」那顆就不再是 current）
 *   ④ 卡片與 JSON-LD `blogPost[]` 的來源改成該分類的文章
 *
 * 🔴 路由參數是任意字串，所以用 `findCategory()`（回傳可能是 undefined）而不是 `getCategory()`
 *    （後者對不到會 throw，會變成 500 而不是 404）。
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BlBlogHero from "../../_components/BlBlogHero";
import BlJsonLd from "../../_components/BlJsonLd";
import BlPostCard from "../../_components/BlPostCard";
import {
  BLOG_META,
  BLOG_OG_IMAGE,
  BLOG_OG_IMAGE_ABS,
  CATEGORIES,
  buildBlogGraph,
  buildPageTitle,
  categoryDescription,
  categoryEyebrow,
  categoryUrlAbs,
  findCategory,
  getPostsByCategory
} from "@/lib/blog";
import type { CategoryMeta } from "@/lib/blog";

/** 這個分類還沒有文章時顯示的一句話。 */
const EMPTY_TEXT = "這個分類還沒有文章，可以先看看其他分類。";

type PageProps = {
  /** 🔴 Next 16 的 params 是 Promise，一定要 await。 */
  params: Promise<{ slug: string }>;
};

/**
 * 頁面標題：`稅怎麼算｜屏東房產研究室`，再由 `buildPageTitle()` 補站名後綴。
 * 與 JSON-LD `Blog.name`（`buildBlogLd` 的分類版）用同一個組法，兩邊自動一致。
 */
function categoryPageTitle(category: CategoryMeta): string {
  return buildPageTitle(`${category.name}｜${BLOG_META.name}`);
}

/** 五個分類都預先產生。 */
export function generateStaticParams() {
  return CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = findCategory(slug);

  // 對不到分類就是要 404 的頁，明確給 noindex
  if (!category) {
    return {
      title: { absolute: buildPageTitle("找不到這個分類") },
      robots: { index: false, follow: false }
    };
  }

  const url = categoryUrlAbs(category);
  const title = categoryPageTitle(category);
  const description = categoryDescription(category);

  /**
   * 🔴 **這個分類一篇文章都沒有時，不要讓 Google 收錄。**
   *
   * sitemap 已經只送有文章的分類，但那**擋不住爬蟲** ——
   * `/blog` hero 的膠囊列直接連到全部五個分類頁，Google 照樣爬得進來，
   * 然後收錄五個「這個分類還沒有文章」的空殼頁（thin content）。
   * 實測 2026-08-15 上線當下五頁全是空的、全都印 `index, follow`。
   *
   * 這裡回 noindex、但保留 `follow` —— 頁面上的連結（回 /blog、其他分類）
   * 仍然要讓爬蟲跟著走，只是這一頁本身不進索引。
   * 有文章之後會自動變回 index，不用記得回來改。
   */
  const isEmpty = getPostsByCategory(category.slug).length === 0;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: url },
    // 🔴 帶 index:true——覆寫根 layout 的 noindex（空分類頁除外，見上面）
    robots: { index: !isEmpty, follow: true, "max-image-preview": "large" },
    openGraph: {
      // 🔴 分類頁也是 website，不是 article
      type: "website",
      locale: "zh_TW",
      siteName: BLOG_META.brand,
      title,
      description,
      url,
      // 🔴 尺寸跟著圖走，不要在這裡硬寫數字（換圖時一定有人忘了改）
      images: [BLOG_OG_IMAGE]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [BLOG_OG_IMAGE_ABS]
    }
  };
}

export default async function BlogCategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = findCategory(slug);
  if (!category) notFound();

  const list = getPostsByCategory(category.slug);

  return (
    <>
      <BlBlogHero
        eyebrow={categoryEyebrow(category)}
        title={category.name}
        lead={category.desc}
        current={category.slug}
      />

      <div className="bl-wrap">
        {list.length > 0 ? (
          <div className="bl-grid">
            {/* 🔴 與列表頁同理：第一張卡的封面是 LCP，只有它 eager ＋ fetchpriority=high。 */}
            {list.map((post, index) => (
              <BlPostCard key={post.id} post={post} priority={index === 0} />
            ))}
          </div>
        ) : (
          <p className="bl-lead">{EMPTY_TEXT}</p>
        )}
      </div>

      {/* Blog + RealEstateAgent（2 筆 @graph）。
          🔴 與列表頁同理：`Blog.publisher` 指向 `…/#agency`，門市節點必須在同一份 JSON-LD 裡，
             否則五個分類頁的 publisher 全部是懸空引用。 */}
      <BlJsonLd data={buildBlogGraph(list, category)} />
    </>
  );
}
