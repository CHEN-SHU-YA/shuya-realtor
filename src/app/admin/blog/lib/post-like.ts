/**
 * 草稿 → 既有 `Post` 形狀的轉接（B 計畫第二段・路三；INTERFACE-stage2.md 第七節第 2 步）。
 *
 * 預覽頁要「跟正式站一模一樣」，做法是照抄 `blog/[slug]/page.tsx` 的組版、
 * body 換成 blocks-render。組版用到的 `postEyebrow`／`postByline`／`postCoverUrl`／
 * `postImageBase`／`getCategory` 全是 `@/lib/blog` 的既有函式，吃的是 `Post` 形狀——
 * 這支把資料庫的 `BlogPostData` 轉成合法的 `Post`，讓那些公式**一條都不用重抄**
 * （重抄的那一份不會有人幫你檢查有沒有抄錯，眉標的全形空格、署名列的半形直線都是坑）。
 *
 * 轉接規則（契約定死）：
 *   · `body: null`——正文不走 `post.body`，預覽頁自己拿 blocks 餵 `renderBlogBody`；
 *     null 是合法 ReactNode，組字函式也不會碰它。
 *   · `updatedAt`／`cover`：資料庫用 null 表「沒有」，`Post` 用可缺欄位——null 轉 undefined，
 *     `postCoverUrl` 的 `cover ?? DEFAULT_COVER` 與 `postUpdatedAt` 的退回邏輯照常成立。
 *   · `draft` 不填（`Post.draft` 可缺）：預覽頁不走草稿判斷，認證靠 /admin 的 Basic Auth。
 *   · 其餘欄位同名同型別，原樣展開（多出來的 `blocks` 欄位是無害的結構多餘屬性）。
 *
 * 純型別轉接、零相依，Server／Client 兩邊都能 import（實際只有預覽頁在用）。
 */
import type { Post } from "@/content/posts/types";
import type { BlogPostData } from "@/lib/blog-db";

/** 把資料庫的一篇草稿轉成 `@/lib/blog` 各組字函式吃的 `Post` 形狀。 */
export function toPostLike(data: BlogPostData): Post {
  return {
    ...data,
    body: null,
    updatedAt: data.updatedAt ?? undefined,
    cover: data.cover ?? undefined
  };
}
