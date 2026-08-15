/**
 * 列表頁文章卡 `.bl-pcard`（規格書 §3.17、INTERFACE §3.10）。
 *
 * 用在列表頁與分類頁的 `.bl-grid` 裡。整張卡是一個連結。
 *
 * 細節：
 *   · **整張卡是 `<a>`**；裡面的分類標**不是**連結（一張卡只能有一個可點目標）。
 *   · 封面 `alt` **直接等於完整標題**，一字不差（與 h1、JSON-LD `headline` 同源）。
 *   · `excerpt` 已經自帶結尾的全形「…」（`auditPosts()` 會擋沒帶的），**元件不要再加**。
 *   · 日期就是 `YYYY-MM-DD`，**沒有「發布於」之類的前綴**。
 *   · 網址一律 `postUrl(post)`、封面一律 `postCoverUrl(post)`——
 *     canonical／og:url／JSON-LD @id／sitemap／卡片 href 五處要完全相同，
 *     所以五處都只准呼叫同一組函式，不准自己組字串。
 *   · 圖用原生 `<img>` 不用 `next/image`：規格要求 DOM 100% 照抄，
 *     `next/image` 會自己包一層、加自己的 class 與 srcset，CSS 對不上。
 *   · `width/height` 補 1200×630 是為了消 CLS（原站沒給）；版型仍由 CSS 的
 *     16:9 ＋ `object-fit:cover` 決定。
 *   · `priority`：格線第一張卡的封面就是列表頁的 LCP 元素，**它不可以 lazy**。
 *     以前 `loading="lazy"` 是寫死在這裡的、沒有出口，於是瀏覽器要等版面算完
 *     才知道那張圖在首屏，才開始下載——LCP 白白多等一個來回。
 *     文章頁的封面早就處理對了（`eager` ＋ `fetchPriority="high"`），列表頁補上同一套。
 *     🔴 只給 `index === 0` 那一張。全部都 high 等於全部都不 high，
 *        後面幾張反而會跟第一張搶頻寬，比原本更慢。
 */
import { getCategory, postCoverUrl, postUrl, type Post } from "@/lib/blog";

export type BlPostCardProps = {
  post: Post;
  /** 這張卡是不是首屏第一張（LCP）。只有列表頁／分類頁格線的 `index === 0` 該傳 `true`。 */
  priority?: boolean;
};

export default function BlPostCard({ post, priority = false }: BlPostCardProps) {
  const category = getCategory(post.category);

  return (
    <a className="bl-pcard" href={postUrl(post)}>
      <img
        src={postCoverUrl(post)}
        alt={post.title}
        width={1200}
        height={630}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
      />
      <div className="bl-b">
        {/* 草稿標記：只有開發模式撈得到草稿（`getAllPosts()`），正式站永遠印不出這四個字。
            用文字前綴而不是新開一個 class，是因為 blog.css 的 class 清單是四路共用的對帳表，
            這裡自己發明一個 `.bl-draft` 會變成表外的孤兒樣式。 */}
        <div className="bl-c bl-mono">
          {post.draft ? "草稿 · " : ""}
          {category.name}
        </div>
        <h2>{post.title}</h2>
        <p className="bl-x">{post.excerpt}</p>
        <div className="bl-d bl-mono">{post.publishedAt}</div>
      </div>
    </a>
  );
}
