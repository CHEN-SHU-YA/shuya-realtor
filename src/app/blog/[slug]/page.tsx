/**
 * 文章頁 `/blog/{編號}-{slug}`（例：`/blog/1001-chongda-xincheng-guide`）。
 *
 * 🔴 路由參數是「編號 + 連字號 + slug」的**合併形式**，不是兩段。
 *    要拆出編號的人請用 `@/lib/blog` 的 `postSegment()` 反查，不要自己 split。
 *
 * 🔴 `.bl-wrap-narrow` 內的順序是固定的（規格書 §4.1、INTERFACE §4），不可調換：
 *      麵包屑 → 眉標 → h1 → 署名 → 封面 → 一句話結論 → 重點摘要 → 正文 → 常見問題 → CTA 卡
 *
 * 🔴 目錄（`post.toc`）**寫在文章自己的 `body` 裡**，不由這一頁插入——
 *    規格的目錄位置在導言之後、第一節之前（`.bl-prose` 中段），
 *    這一頁只負責包一層 `<div className="bl-prose">`，插不到正確位置。
 */
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import BlCrumb from "../_components/BlCrumb";
import BlCtaBox from "../_components/BlCtaBox";
import BlFaq from "../_components/BlFaq";
import BlJsonLd from "../_components/BlJsonLd";
import BlTldr from "../_components/BlTldr";
import BlVerdict from "../_components/BlVerdict";
import {
  buildArticleGraph,
  buildPageTitle,
  getCategory,
  getPostBySlug,
  postByline,
  postCoverUrl,
  postCoverUrlAbs,
  postEyebrow,
  postSegment,
  postUpdatedAt,
  postUrl,
  postUrlAbs,
  posts,
  toTaipeiIso,
  BLOG_META
} from "@/lib/blog";
import type { Post } from "@/lib/blog";
import { PROFILE } from "@/lib/profile";

type PageProps = {
  /** 🔴 Next 16 的 params 是 Promise，一定要 await。 */
  params: Promise<{ slug: string }>;
};

/**
 * 草稿的處理方式：**本機看得到、正式站 404**。
 *
 * 書亞要在本機審半成品，所以開發模式把草稿一起撈出來；
 * 正式站則完全找不到（連 404 頁都不會透露有這篇），避免半成品被 Google 收錄後刪不掉。
 * 萬一預覽環境仍撈得到（非 production build），`generateMetadata` 會補上 noindex 保險。
 */
function findPost(segment: string): Post | undefined {
  return getPostBySlug(segment, process.env.NODE_ENV !== "production");
}

/** 產生所有**非草稿**文章的靜態頁。草稿不預先產生，也不會被列出來。 */
export function generateStaticParams() {
  return posts.map((post) => ({ slug: postSegment(post) }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = findPost(slug);

  // 找不到就是要 404 的頁，給 noindex，別讓 Next 用父層的預設值去猜
  if (!post) {
    return {
      title: { absolute: buildPageTitle("找不到這篇文章") },
      robots: { index: false, follow: false }
    };
  }

  const url = postUrlAbs(post);
  const cover = postCoverUrlAbs(post);
  const title = buildPageTitle(post.title);
  const isDraft = post.draft === true;

  return {
    title: { absolute: title },
    description: post.description,
    // `<meta name="author">`：填人不填公司，與 JSON-LD 的 Person 對齊
    authors: [{ name: PROFILE.name }],
    alternates: { canonical: url },
    // 🔴 草稿一律 noindex；正式文章一律帶 index:true 覆寫根 layout 的 noindex
    robots: isDraft
      ? { index: false, follow: false }
      : { index: true, follow: true, "max-image-preview": "large" },
    openGraph: {
      type: "article",
      locale: "zh_TW",
      siteName: BLOG_META.brand,
      title,
      description: post.description,
      url,
      images: [{ url: cover, width: 1200, height: 630, alt: post.title }],
      // 日期一律帶台灣時區；`modifiedTime` 沒改過文就等於發布日
      publishedTime: toTaipeiIso(post.publishedAt),
      modifiedTime: toTaipeiIso(postUpdatedAt(post))
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: post.description,
      images: [cover]
    }
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = findPost(slug);
  if (!post) notFound();

  // 少了編號的純 slug（`/blog/example-slug`）資料層也找得到，那是刻意的寬容；
  // 但同一篇文章多一個能開得起來的網址，就多一個重複內容。308 導回正規網址，
  // 確保「一篇文章只有一個網址」這條鐵律在網址列上也成立，不是只寫在 canonical 裡。
  if (slug !== postSegment(post)) permanentRedirect(postUrl(post));

  const category = getCategory(post.category);

  return (
    <>
      <article className="bl-post">
        <div className="bl-wrap-narrow">
          <BlCrumb category={category} title={post.title} />

          <div className="bl-eyebrow">{postEyebrow(post)}</div>

          <h1>{post.title}</h1>

          <p className="bl-byline bl-mono">{postByline(post)}</p>

          {/* 首屏封面：eager + fetchpriority high，並給 width/height 避免 CLS。
              🔴 用原生 <img>（不是 next/image）——規格要求 DOM 與 CSS 100% 對齊。 */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="bl-cover"
            src={postCoverUrl(post)}
            alt={post.title}
            width={1200}
            height={630}
            loading="eager"
            fetchPriority="high"
          />

          <BlVerdict verdict={post.verdict} />

          <BlTldr text={post.tldr} />

          {/* 只包一層容器，內容原封不動來自文章檔 */}
          <div className="bl-prose">{post.body}</div>

          {/* 🔴 FAQ 與 CTA 卡在 .bl-prose **外面**（.bl-faq h2 自己有上邊線樣式） */}
          <BlFaq items={post.faq} />

          <BlCtaBox lead={post.ctaLead} />
        </div>
      </article>

      {/* BlogPosting + BreadcrumbList + FAQPage + RealEstateAgent + WebSite（5 筆 @graph）。
          FAQ 的問答與畫面上的 <details> 同一份 post.faq，逐字必然相同。 */}
      <BlJsonLd data={buildArticleGraph(post)} />
    </>
  );
}
