/**
 * 文章註冊表。
 *
 * 發一篇文只要動兩個地方：
 *   ① 新建 `src/content/posts/{id}-{slug}.tsx`，`export const post: Post = { … }`
 *   ② 回到這裡：上面加一行 `import`，下面陣列加一筆
 * 列表頁卡片、分類頁、sitemap、JSON-LD 全部從這一份跑出來，不用再各改一次。
 *
 * 陣列順序**不重要**，`@/lib/blog` 會依 `publishedAt` 由新到舊排序（同日則編號大的在前）。
 * 草稿（`draft: true`）也照樣註冊進來——過濾是 `@/lib/blog` 的 `getAllPosts()` 在做的，
 * 註冊表只負責「這個站有哪些文章檔」這一件事。
 *
 * 🔴 文章檔（`{id}-{slug}.tsx`）**不可以** `import … from "@/lib/blog"`。
 *    那會形成 blog.ts → index.ts → 文章檔 → blog.ts 的循環相依，
 *    後果是 `posts` 在模組初始化時變成空陣列——畫面上是「文章全部消失」，
 *    而且不會有任何錯誤訊息。文章需要的法遵字串（經紀業名稱、職稱、署名列）
 *    一律從 `@/lib/agency` 取——那一支只 import `@/lib/profile`，兩支都不 import 文章，
 *    所以不會成環。其他字串由元件的 props 傳入。
 *
 * 🔴 命名慣例：import 進來的變數一律叫 `postXXXX`（XXXX ＝ 文章編號），
 *    這樣陣列一眼看得出少了誰、重複了誰。
 */
import type { Post } from "./types";

import { post as post1001 } from "./1001-pingtung-townhouse-site-visit";
import { post as post1002 } from "./1002-chongda-xincheng-military-village";
import { post as post1003 } from "./1003-spouse-gift-pingtung";
import { post as post1004 } from "./1004-alley-townhouse-parking";
import { post as post1005 } from "./1005-ptvgh-area";

/**
 * ✅ **1002（崇大新城眷改宅）已於 2026-08-15 收回註冊。**
 *
 * 它先前刻意沒註冊、也沒進版控，原因不是草稿（1001、1003 也是草稿也都在版控裡），
 * 而是：**這個 repo 是 PUBLIC 的**（`CHEN-SHU-YA/shuya-realtor`），
 * 當時公告欄留著一條「1002 另有 4 處抄襲待修」，那篇檔頭卻沒提抄襲，無法確認修了沒。
 * `draft: true` 只擋得住網站上的呈現，**擋不住 GitHub 上任何人都讀得到原始碼，
 * 而且 git 歷史刪不掉**。
 *
 * 收回來的條件（註解原本列的第 ① 步）已經實跑驗過：
 * 剝掉標籤、註解、標點、空白與英數只留漢字，連續 **8 字**比對——
 *   · 對參考站 article.html／bloglist.html／home.html：**各 0 命中**
 *   · 對 1001、1004：**各 0 命中**
 *   · 對 1003：19 命中，逐一檢視後確認**全部是法條原文本身**
 *     （1002 引《國軍老舊眷村改建條例》第 24 條、1003 引同條例第 25 條，
 *      兩條的開頭都是「由主管機關配售之住宅」——那是法律自己的用字，逐字引用不可能不同）
 */
/**
 * 全部文章（含草稿）。新增文章就在這裡加一筆。
 * 型別標成 `readonly Post[]`，避免有人在別處 push 或排序這一份原始資料。
 */
export const POSTS: readonly Post[] = [post1001, post1002, post1003, post1004, post1005];

/**
 * `@/lib/blog` 讀的是這個名字（`import { posts as REGISTRY } from "@/content/posts"`）。
 * 兩個名字指向同一個陣列，改 `POSTS` 就好，不要各維護一份。
 */
export const posts: readonly Post[] = POSTS;
