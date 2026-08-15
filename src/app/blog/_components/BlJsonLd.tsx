/**
 * 結構化資料標籤（INTERFACE §3.13）。
 *
 * 全站所有 JSON-LD 都經過這一支輸出，理由只有一個：
 * **「把 `<` 跳脫掉」這件事只做一次**。JSON 內容裡若出現 `</script>`，
 * 沒跳脫就會把 `<script>` 標籤切斷，後半段 JSON 直接變成畫面上的亂碼文字。
 * 跳脫的實作在 `@/lib/blog` 的 `toJsonLd()`，這裡只負責掛上去。
 *
 * 資料本身一律由 `buildArticleGraph()`（文章頁）／`buildBlogGraph()`（列表頁與分類頁）產生，
 * 不要在頁面裡手寫物件——`@id` 與網址寫錯不會有任何畫面異常，但 Google 那邊會建錯實體。
 *
 * `dangerouslySetInnerHTML` 在這裡是必要的：`<script>` 的內容不能是 React 子節點
 * （React 會把它當文字節點跳脫成 `&quot;`，JSON 就壞了）。內容來源全在自家程式碼，沒有使用者輸入。
 */
import { toJsonLd, type JsonLdValue } from "@/lib/blog";

export type BlJsonLdProps = { data: JsonLdValue };

export default function BlJsonLd({ data }: BlJsonLdProps) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(data) }} />;
}
