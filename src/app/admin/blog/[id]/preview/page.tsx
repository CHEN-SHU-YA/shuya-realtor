/**
 * 草稿預覽頁 `/admin/blog/[id]/preview`（B 計畫第二段・路三；INTERFACE-stage2.md 第七節）。
 *
 * ── 這一頁在做什麼 ──
 * 讀資料庫**草稿最新版**（`getPost(id).data`，🔴 不是 publishedSnapshot），
 * 用 `renderBlogBody`（blocks JSON → ReactNode，已通過五篇逐字驗收）＋現有 blog 元件
 * ＋blog.css，組出與正式站文章頁**一模一樣**的版面。改一句、存檔、重整這一頁就看到；
 * 正式站（第二段仍讀 .tsx）完全不受影響——方案書第六節的零風險中繼點。
 *
 * ── 組版來源 ──
 * 外殼照 `src/app/blog/layout.tsx`、文章區照 `src/app/blog/[slug]/page.tsx`，
 * DOM 順序一字不差（契約§7.4）。🔴 那兩個檔與所有 Bl 元件**只 import 來用、絕不修改**
 * （前台不動是本段紅線）；blocks-render 也一樣——它已通過逐字驗收，缺什麼
 * （例如眉標組字）就在這裡自己組，不回頭改它。
 *
 * ── 刻意不做的兩件事（契約§7.5 定案，不要「順手補上」）──
 * · 不放 <BlJsonLd/>：結構化資料不可見、不影響視覺一致，草稿資料不往 admin 頁塞。
 * · 不放預覽橫幅：方案書拍板文字是「一模一樣的頁面」，網址列的 /admin/ 與
 *   Basic Auth 視窗就是「這是預覽」的識別。
 *
 * ── CSS 界線 ──
 * 🔴 只 import blog.css，絕不 import site.css——blog.css 類名全 `bl-` 前綴且掛在
 * `.bl-shell` 底下不外溢；本頁從列表／編輯頁一律 target="_blank" 開新分頁，
 * 客戶端導覽的 CSS 累積面最小（blog/layout.tsx 檔頭記過那個坑）。
 *
 * ── 認證（任務驗收點）──
 * 本頁路徑在 `/admin/blog/` 底下，`src/proxy.ts` 的 matcher `"/admin/:path*"`
 * 自動套 HTTP Basic（2026-08-17 實讀 proxy.ts L71–75 核對），零設定；
 * 從後台開新分頁是同一個瀏覽器工作階段，會帶同一組認證，不會再跳登入視窗。
 * 未登入的人直接打網址只會看到 401——草稿不外洩。
 */
import "@/app/blog/blog.css";
import type { Metadata } from "next";
import Link from "next/link";
import { cache, type ReactNode } from "react";
import BlCrumb from "@/app/blog/_components/BlCrumb";
import BlCtaBox from "@/app/blog/_components/BlCtaBox";
import BlFaq from "@/app/blog/_components/BlFaq";
import BlFooter from "@/app/blog/_components/BlFooter";
import BlNav from "@/app/blog/_components/BlNav";
import BlTldr from "@/app/blog/_components/BlTldr";
import BlUtil from "@/app/blog/_components/BlUtil";
import BlVerdict from "@/app/blog/_components/BlVerdict";
import Topbar from "@/app/_components/Topbar";
import { getCategory, postByline, postCoverUrl, postEyebrow, postImageBase } from "@/lib/blog";
import { getPost } from "@/lib/blog-db";
import { renderBlogBody } from "@/lib/blocks-render";
import { toPostLike } from "../../lib/post-like";

type PageProps = {
  /** 🔴 Next 16 的 params 是 Promise，一定要 await（照 blog/[slug]/page.tsx 的既有寫法）。 */
  params: Promise<{ id: string }>;
};

/** 後台不吃快取：每次重整都撈最新草稿（改一句→存檔→F5 立刻看到）。 */
export const dynamic = "force-dynamic";

/** 同一個請求裡 generateMetadata 與頁面各要一次 getPost，用 React cache 併成一次查詢。 */
const loadPost = cache(async (id: number) => getPost(id));

/** 路由參數 → 文章編號；不是純數字（有人手改網址）回 null，走人話頁。 */
function parseId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  return Number.isInteger(id) && String(id) === raw ? id : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: raw } = await params;
  const id = parseId(raw);
  const row = id === null ? null : await loadPost(id);
  return {
    // absolute：不吃根 layout 的「%s｜書亞・屏東房產」模板，分頁標籤一眼看出是預覽
    title: { absolute: row ? `預覽｜${row.data.title}` : "預覽｜找不到這篇文章" },
    // 根 layout 預設就是 noindex，明寫是雙保險（契約§7.6）——草稿頁永遠不進搜尋引擎
    robots: { index: false, follow: false }
  };
}

export default async function BlogPreviewPage({ params }: PageProps) {
  const { id: raw } = await params;
  const id = parseId(raw);
  const row = id === null ? null : await loadPost(id);

  // 查無此篇（還沒匯入、編號打錯）或資料庫讀取失敗（getPost 失敗回 null）：
  // 照 admin 慣例開人話頁，不炸 Application error。
  if (!row) {
    return (
      <div className="admin-page">
        <Topbar admin />
        <div className="admin-shell">
          <div className="admin-heading">
            <div>
              <h1>開不了這篇的預覽</h1>
              <p>
                讀不到編號「{raw}」這篇文章——可能五篇還沒匯入資料庫、編號不對，
                或 Neon 剛從休眠醒來。回列表看一眼，等幾秒再試；一直失敗就跟我說。
              </p>
            </div>
            <Link className="button-secondary" href="/admin/blog">
              回文章列表
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 🔴 草稿最新版（row.data），不是線上版（row.publishedSnapshot）——預覽的意義就是看還沒發布的。
  const data = row.data;
  const post = toPostLike(data);
  const category = getCategory(post.category);

  // imageBase 與 postImageBase 同一條公式（/blog/{id}-{slug}）；toc 從草稿資料來。
  // 注意：slug 改了但圖片資料夾還是舊名時，預覽的圖會破——那是「檔案沒搬」的真實回饋，不是 bug。
  const ctx = { toc: data.toc, imageBase: postImageBase(post) };

  // 渲染器遇到契約外節點會 throw（明確失敗是它的設計）；預覽頁把它接成人話，
  // 讓書亞知道「這是程式問題、內容還在」，而不是一整頁 Application error。
  let body: ReactNode;
  try {
    body = renderBlogBody(data.blocks, ctx);
  } catch (error) {
    console.error("[admin/blog] 預覽渲染失敗", error);
    body = (
      <p>
        ⚠️ 這篇的內容渲染不出來——是程式問題，不是你改壞了，內容都還在資料庫裡。
        先回編輯頁把文章內容複製保存，然後跟我說。
      </p>
    );
  }

  /*
   * 以下 DOM 照抄 blog/layout.tsx ＋ blog/[slug]/page.tsx，順序一字不差（契約§7.4）：
   * div.bl-shell >（a.bl-skip → BlUtil → BlNav → main#main → BlFooter）；
   * main 內 article.bl-post > div.bl-wrap-narrow >
   * 麵包屑 → 眉標 → h1 → 署名 → 封面 → 一句話結論 → 重點摘要 → 正文 → FAQ → CTA。
   * 眉標／署名／封面路徑全走 @/lib/blog 既有組字函式，不重抄公式。
   */
  return (
    <div className="bl-shell">
      <a className="bl-skip" href="#main">跳到主要內容</a>
      <BlUtil />
      <BlNav />
      <main id="main">
        <article className="bl-post">
          <div className="bl-wrap-narrow">
            <BlCrumb category={category} title={post.title} />

            <div className="bl-eyebrow">{postEyebrow(post)}</div>

            <h1>{post.title}</h1>

            <p className="bl-byline bl-mono">{postByline(post)}</p>

            {/* 原生 <img>（不是 next/image）——與正式站文章頁同一條規矩：DOM 與 CSS 100% 對齊 */}
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

            {/* 正文：blocks JSON 走 blocks-render，容器與正式站同為 .bl-prose */}
            <div className="bl-prose">{body}</div>

            {/* FAQ 與 CTA 卡在 .bl-prose 外面（.bl-faq h2 自己有上邊線樣式）——照正式站 */}
            <BlFaq items={post.faq} />

            <BlCtaBox lead={post.ctaLead} />
          </div>
        </article>
      </main>
      <BlFooter />
    </div>
  );
}
