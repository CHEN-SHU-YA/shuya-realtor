/**
 * 部落格的資料層與唯一真相來源。
 *
 * 頁面、元件、sitemap、結構化資料**全部從這一支取值**，任何一段字串都不要在別處重打。
 * 理由跟 `lib/content.ts` 檔頭寫的一樣：公司名稱、證號、電話、地址是不動產廣告的法定揭露資訊，
 * 抄一遍就多一個「畫面看起來完全正常、但寫錯了」的機會，而錯的代價是不實廣告。
 *
 * ── 這支檔案分成六段 ──
 *   1. 品牌與命名（BLOG_META）
 *   2. 法遵字串（AGENCY／LEGAL）——🔴 實體住在 `@/lib/agency`，這裡只是轉出口
 *   3. 分類（CATEGORIES）
 *   4. 網址與文字組裝（postUrl／postByline…）
 *   5. 取文章（getAllPosts／getPostBySlug…）
 *   6. 結構化資料產生器（buildXxxLd）
 *   7. 建置期守門（auditPosts）——🔴 缺封面圖／正文漏揭露經紀業名稱時直接讓 build 紅掉
 *
 * 🔴 這支檔案**不可以**被 `src/content/posts/*.tsx` 反過來 import，會變成循環相依。
 *    文章檔要的法遵字串請 `import … from "@/lib/agency"`（那一支沒有這個問題）。
 *
 * 🔴 這支檔案是 **server-only**：第 7 段會 `import "node:fs"` 檢查封面圖在不在。
 *    部落格全部是 Server Component、零客戶端 JavaScript，所以現在沒問題；
 *    但如果哪天有人從 `"use client"` 的元件 import 這一支，打包會直接失敗。
 *    真的需要在客戶端用這裡的字串時，請改從 `@/lib/agency` 或 `@/lib/profile` 取。
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { isValidElement, type ReactNode } from "react";
import { AGENCY } from "@/lib/agency";
import { PROFILE } from "@/lib/profile";
import { SITE_URL } from "@/lib/site";
import { posts as REGISTRY } from "@/content/posts";
import type { CategorySlug, Post } from "@/content/posts/types";

export type { CategorySlug, FaqItem, IsoDate, Post, PostVerdict, TocItem } from "@/content/posts/types";

/* ═══════════════════════════════════════════════════════════
   1. 品牌與命名
   ═══════════════════════════════════════════════════════════ */

/**
 * 部落格的名字與定位。
 *
 * ⚠️ 這三個中文名稱是**暫定值**，書亞隨時可能改；全站只從這裡取，要改就改這裡一處。
 * 已經上線之後再改，只會影響顯示文字，**不會動到網址**（網址走 `/blog` 與文章編號，與名稱無關）。
 */
export const BLOG_META = {
  /** 部落格名稱。用在：導覽列、麵包屑第二層、列表頁 h1、頁尾、JSON-LD `Blog.name`。 */
  name: "屏東房產研究室",

  /**
   * 專欄署名。用在文章頁眉標的後半段：`[分類]　[專欄名]`。
   *
   * 🔴 不要用「手記」二字——被參考的那個高雄同業專欄叫「亞灣賞哥手記」，
   *    同樣挑「手記」收尾等於把他的命名法一起抄過來。「第一手」貼書亞的定位：
   *    在地、自己帶看過、講的是現場而不是網路資料。
   */
  column: "書亞的第一手筆記",

  /** 定位副標。用在列表頁 `.bl-lead` 的破折號之後。 */
  tagline: "屏東市在地、眷村長大的孩子，把買賣屏東房子會踩的坑一條一條講清楚",

  /**
   * 一頁最多列幾篇。
   * 規格是「不分頁、不置頂、不精選」，這個值目前只當上限用；
   * 文章破 50 篇再考慮「載入更多」（純前端，不產生新網址）。
   */
  postsPerPage: 24,

  /** 列表頁眉標的地區代碼。PTZ ＝ Pingtung。🔴 不是 KHH。 */
  areaCode: "PTZ",

  /** 個人品牌名。`<title>` 後綴、`og:site_name`、署名列都用它。 */
  brand: "書亞｜屏東房產",

  /**
   * 列表頁／分類頁共用的 OG 圖。
   *
   * 曾經暫代成首頁的直式形象照（1044×1568），因為那時 `public/blog/` 底下一張圖都沒有，
   * 分享 `/blog` 或分類頁到 LINE／FB 會抓到 404、預覽一片白。
   * 2026-08-15 專用橫式 OG 圖產出後改回來（`scripts/build-blog-images.mjs` 產，實測 1200×630）。
   *
   * 🔴 換圖時**兩處要一起改**：這一行的路徑，與下面 `BLOG_OG_IMAGE` 的 `width`／`height`。
   *    只改一處＝對外宣告一個假的尺寸，社群預覽會被裁，而且不會有任何錯誤訊息。
   *    路徑改錯不會安靜地壞：`auditSharedAssets()` 在 build 時會擋下不存在的 OG 圖。
   */
  ogImage: "/blog/og-blog.png"
} as const;

/**
 * 圖片根路徑。文章圖片實體放在 `public/blog/{id}-{slug}/`。
 * 日後若 `/blog/xxx`（路由）與 `/blog/xxx/cover.png`（靜態檔）真的打架，
 * 把 `public/blog` 整包改名，然後只改這一行。
 */
const MEDIA_BASE = "/blog";

/** 沒有指定 `cover` 時的預設封面檔名。 */
const DEFAULT_COVER = "cover.png";

/* ═══════════════════════════════════════════════════════════
   2. 法遵字串（轉出口）
   🔴 實體已經搬到 `@/lib/agency`。
      理由：文章檔（`src/content/posts/*.tsx`）不能 import 這一支（循環相依，
      後果是 posts 變空陣列、文章無聲全部消失），所以以前只能自己重打一份
      「有巢氏房屋　屏東崇大華盛加盟店」，法遵揭露變成靠寫稿的人自律。
      拆到 `agency.ts`（只 import profile.ts）之後，文章檔可以直接 import，不會成環。

      這裡保留 re-export 是為了不動到既有呼叫端
      （BlUtil／BlFooter／sitemap 等都還在寫 `from "@/lib/blog"`），
      **新的程式碼請直接 import `@/lib/agency`**。
   ═══════════════════════════════════════════════════════════ */

export { AGENCY, ARTICLE_SIGNATURE, LEGAL } from "@/lib/agency";

/**
 * 導覽列項目（`.bl-nav`）。
 *
 * 🔴 站內錨點一律帶**前導斜線**（`/#services` 不是 `#services`）——
 *    少了那一撇，在 `/blog/1001-xxx` 上點下去會變成 `/blog/1001-xxx#services`，什麼都不會發生。
 * 🔴 最後一項 LINE 是整列唯一的彩色項（inline style 橘字），那是刻意的視覺 CTA，不要「順手清乾淨」。
 */
export const BLOG_NAV = [
  { href: "/#services", label: "屏東買賣" },
  /* 🔴 導覽列刻意用短標籤「房產知識」而不是完整的 BLOG_META.name（屏東房產研究室）。
     375px 實測：用全名時導覽列會撐成 5 行、212px 高，佔掉四分之一個手機螢幕
     （被參考的那個站不會這麼高，是因為它的選單字都只有 3–4 字）。
     「房產知識」也對得上首頁 /admin/content 那個同名的區塊開關。
     頁面標題、麵包屑、頁尾仍用全名，不受影響。 */
  { href: "/blog", label: "房產知識" },
  { href: "/#areas", label: "服務區域" },
  { href: "/#record", label: "我的戰績" },
  { href: "/card/booking", label: "免費房產健檢" },
  { href: PROFILE.social.line, label: "LINE 諮詢", external: true, accent: true }
] as const;

/**
 * 頁尾導覽（`.bl-fnav`）。
 *
 * 🔴 這裡刻意**不放進上面的 `BLOG_NAV`**（頂部導覽）：那一排在 375px 已經很擠，
 *    多一項會再撐高一行，而頁尾同樣每頁都有、一樣被爬蟲讀到。
 *
 * 學區地圖的錨點文字就叫「屏東學區地圖」——那是家長真的會搜的字，
 * 不要為了排版好看改成「學區查詢」之類搜尋量低的詞。
 * 網址用相對路徑，不可寫成 vercel.app（見 `content.ts` 的說明）。
 */
export const BLOG_FOOTER_NAV = [
  { href: "/", label: "首頁" },
  { href: "/blog", label: BLOG_META.name },
  { href: "/tools/school-map", label: "屏東學區地圖" },
  { href: "/card", label: "電子名片" },
  { href: "/card/booking", label: "線上預約" },
  { href: PROFILE.social.line, label: "LINE", external: true }
] as const;

/* ═══════════════════════════════════════════════════════════
   3. 分類
   ═══════════════════════════════════════════════════════════ */

export type CategoryMeta = {
  /** 網址用的 slug，🔴 上線後凍結，改了要 301。 */
  slug: CategorySlug;
  /** 中文顯示名。眉標、麵包屑第三層、卡片分類標、JSON-LD `articleSection` 四處都是這個字串。 */
  name: string;
  /** 一句話定位，30–45 字。用在分類頁 `.bl-lead` 與 meta description。 */
  desc: string;
};

/**
 * 五個分類。
 *
 * 🔴 **順序是主題性排列**（在地趨勢 → 物件 → 稅 → 法 → 市場），與文章數量、熱門度無關。
 *    不要誤以為是熱門度排序而重排——膠囊列的順序全站要一致。
 */
export const CATEGORIES: readonly CategoryMeta[] = [
  {
    slug: "market-trend",
    name: "屏東行情",
    desc: "屏東市與屏東縣的區域、學區、生活圈，以及政策與重大建設對在地房價的影響。"
  },
  {
    slug: "community-review",
    name: "社區實勘",
    desc: "一個社區一篇，把屋齡、戶數、公設比、管理費、車位這些真的會影響價格的規格攤開來看。"
  },
  {
    slug: "tax-case",
    name: "稅怎麼算",
    desc: "賣屋要繳哪些稅、繼承和贈與過戶怎麼算、重購退稅退不退得到——用屏東實際會遇到的情況走一次。"
  },
  {
    slug: "legal-case",
    name: "產權爭議",
    desc: "產權、共有、增建、瑕疵擔保，從法院實際判過的爭議回頭看，買賣前該先查什麼。"
  },
  {
    slug: "deal-practice",
    name: "買賣實務",
    desc: "委託、斡旋、貸款到交屋，每一關會卡在哪裡、卡住的時候可以怎麼處理。"
  }
] as const;

/** 編譯期守門：`CATEGORIES` 必須涵蓋 `CategorySlug` 的每一個值。 */
type CategoryCoverage = Exclude<CategorySlug, (typeof CATEGORIES)[number]["slug"]> extends never
  ? true
  : "CATEGORIES 少了分類，請與 src/content/posts/types.ts 的 CategorySlug 對齊";
const CATEGORY_GUARD: CategoryCoverage = true;
void CATEGORY_GUARD;

/** 依 slug 取分類（型別已保證存在）。 */
export function getCategory(slug: CategorySlug): CategoryMeta {
  const found = CATEGORIES.find((category) => category.slug === slug);
  if (!found) {
    // 只有在有人改壞 CATEGORIES 或 CategorySlug 其中一邊時才會走到這裡
    throw new Error(`找不到分類：${slug}`);
  }
  return found;
}

/** 給 `/blog/category/[slug]` 路由用：參數是任意字串，對不到就回 undefined（頁面該 404）。 */
export function findCategory(slug: string): CategoryMeta | undefined {
  return CATEGORIES.find((category) => category.slug === slug);
}

/* ═══════════════════════════════════════════════════════════
   4. 網址與文字組裝
   🔴 canonical / og:url / JSON-LD @id / sitemap loc / 卡片 href
      五處網址必須完全相同，所以五處都只准呼叫下面這幾個函式。
   ═══════════════════════════════════════════════════════════ */

/** 把站內路徑補成絕對網址。`path` 要帶前導斜線。 */
export function absUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** 文章的網址片段：`1001-example-slug`。也是 `/blog/[slug]` 路由參數的值。 */
export function postSegment(post: Post): string {
  return `${post.id}-${post.slug}`;
}

/** 文章網址（站內相對）：`/blog/1001-example-slug`。🔴 沒有結尾斜線。 */
export function postUrl(post: Post): string {
  return `/blog/${postSegment(post)}`;
}

/** 文章網址（絕對）。canonical、og:url、JSON-LD 用。 */
export function postUrlAbs(post: Post): string {
  return absUrl(postUrl(post));
}

/** 這篇文章的圖片資料夾：`/blog/1001-example-slug`。內文插圖用 `${postImageBase(post)}/fig-01.png`。 */
export function postImageBase(post: Post): string {
  return `${MEDIA_BASE}/${postSegment(post)}`;
}

/** 封面圖（站內相對）。 */
export function postCoverUrl(post: Post): string {
  return `${postImageBase(post)}/${post.cover ?? DEFAULT_COVER}`;
}

/** 封面圖（絕對）。og:image、JSON-LD `image` 用——這兩處一定要絕對網址。 */
export function postCoverUrlAbs(post: Post): string {
  return absUrl(postCoverUrl(post));
}

/** 分類頁網址（站內相對）：`/blog/category/tax-case`。 */
export function categoryUrl(category: CategoryMeta | CategorySlug): string {
  const slug = typeof category === "string" ? category : category.slug;
  return `/blog/category/${slug}`;
}

/** 分類頁網址（絕對）。 */
export function categoryUrlAbs(category: CategoryMeta | CategorySlug): string {
  return absUrl(categoryUrl(category));
}

/** 列表頁網址（站內相對／絕對）。 */
export const BLOG_URL = "/blog";
export const BLOG_URL_ABS = absUrl(BLOG_URL);

/** 列表頁／分類頁的 OG 圖（絕對）。 */
export const BLOG_OG_IMAGE_ABS = absUrl(BLOG_META.ogImage);

/**
 * 列表頁／分類頁 OG 圖的完整宣告（含尺寸），直接餵給 Next metadata 的 `openGraph.images`。
 *
 * 🔴 尺寸要跟實體檔一致。以前六個頁面各自硬寫 `width:1200,height:630`，
 *    換圖時只會有人記得改路徑、不會有人記得改尺寸，於是對外宣告一個假的尺寸。
 *    集中在這裡＝換圖時尺寸不可能漏改。
 * ⚠️ 尺寸是**手寫**的，沒有人在建置時幫你量。改 `BLOG_META.ogImage` 一定要回來改這兩個數字。
 *    現值對應 `public/blog/og-blog.png`，2026-08-15 以 sharp 讀回 metadata 確認為 1200×630。
 */
export const BLOG_OG_IMAGE = { url: BLOG_OG_IMAGE_ABS, width: 1200, height: 630 } as const;

/**
 * `<title>` 用的完整標題。
 *
 * 🔴 根 `layout.tsx` 的 title template 是「%s｜書亞・屏東房產」（中間是**中點**），
 *    跟部落格規格的「｜書亞｜屏東房產」不一樣。
 *    所以部落格每一頁的 metadata 都要寫成
 *    `title: { absolute: buildPageTitle("…") }`，用 absolute 才不會被上層模板接管。
 */
export function buildPageTitle(title: string): string {
  return `${title}｜${BLOG_META.brand}`;
}

/**
 * 文章頁眉標：`稅怎麼算　書亞的第一手筆記`（中間是全形空格 U+3000）。
 *
 * 🔴 原本是 `[分類] · [專欄名]`，中點加前後半形空格——那是被參考的那個高雄同業
 *    的眉標寫法（`法律判決 · 亞灣賞哥手記`）。字不一樣但骨架一模一樣，改成全形空格單段。
 */
export function postEyebrow(post: Post): string {
  return `${getCategory(post.category).name}　${BLOG_META.column}`;
}

/**
 * 眉標的後綴。
 *
 * 🔴 原本是「房產知識庫」——那是被參考的那個高雄同業列表頁**逐字相同**的字，
 *    抄版型可以，抄招牌字不行。換成書亞自己的說法：他講的是「現場」與「踩過的坑」，
 *    不是「知識庫」那種教科書口吻。
 * 要換字只改這一個常數，列表頁與五個分類頁會一起跟上。
 */
export const BLOG_EYEBROW_SUFFIX = "屏東買賣現場";

/**
 * 列表頁眉標：`屏東買賣現場　書亞的第一手筆記`。
 *
 * 🔴 **刻意不用 `[三碼地區]·[專欄名] — [後綴]` 那個三段式。**
 *    被參考的那個高雄同業列表頁是 `KHH·判讀所 — 房產知識庫`：連中點無空格、
 *    破折號前後有空格都一樣。中文字全換掉還是同一個骨架，等於抄了命名法。
 *    改成全形空格串起來的單段式，`areaCode` 因此不再出現在畫面上（僅保留供日後備用）。
 */
export const BLOG_EYEBROW = `${BLOG_EYEBROW_SUFFIX}　${BLOG_META.column}`;

/** 分類頁眉標：`稅怎麼算　書亞的第一手筆記`。 */
export function categoryEyebrow(category: CategoryMeta): string {
  return `${category.name}　${BLOG_META.column}`;
}

/**
 * 列表頁 `.bl-lead`。
 *
 * 🔴 **不要再用「五個分類名串一串 ＋ 破折號 ＋ 標語」那個組法。**
 *    原版是 `高雄亞灣趨勢、豪宅開箱、稅務案例、法院判決、市場觀察——真實案例，講清楚再簽字。`，
 *    我們照著串等於複製同一個版型；而且分類名下面那排膠囊已經講過一次，重複沒有意義。
 *    直接寫一句話，主詞是書亞自己。
 */
export const BLOG_LEAD = "買賣屏東房子會踩的坑，我一條一條講清楚——屏東市在地，眷村長大的孩子。";

/** 列表頁的 meta description（≈110 字，四處共用：description／og／twitter／JSON-LD）。 */
export const BLOG_DESCRIPTION = `${BLOG_META.name}：${BLOG_META.tagline}。${CATEGORIES.map((category) => category.name).join("、")}五個專欄，由${AGENCY.name}${AGENCY.jobTitle}${PROFILE.name}（證號 ${PROFILE.licenseNo}）撰寫。內容僅供參考，實際條件以主管機關與個案審核為準。`;

/** 分類頁的 meta description。用組的不用手寫，五頁的口徑才會一致。 */
export function categoryDescription(category: CategoryMeta): string {
  return `${BLOG_META.name}「${category.name}」：${category.desc}由${AGENCY.name}${AGENCY.jobTitle}${PROFILE.name}（證號 ${PROFILE.licenseNo}）撰寫。內容僅供參考，實際條件以主管機關與個案審核為準。`;
}

/**
 * 署名列（`.bl-byline`）：`陳書亞 (109)登字第368962號 · 書亞｜屏東房產　|　2026-08-14`。
 * 🔴 品牌與日期之間是「全形空格 + **半形**直線 + 全形空格」，不是全形直線「｜」。
 */
export function postByline(post: Post): string {
  return `${PROFILE.name} ${PROFILE.licenseNo} · ${BLOG_META.brand}　|　${post.publishedAt}`;
}

/* ═══════════════════════════════════════════════════════════
   5. 取文章
   ═══════════════════════════════════════════════════════════ */

/** 最後更新日；沒填 `updatedAt` 就退回 `publishedAt`。 */
export function postUpdatedAt(post: Post): string {
  return post.updatedAt ?? post.publishedAt;
}

/**
 * 正式站是否要濾掉草稿。
 *
 * 🔴 `true` ＝ production（`next build` 與 `next start` 都是），草稿一律看不到。
 *    半成品被 Google 收錄之後刪不掉，這條沒有例外。
 * 開發模式（`next dev`）刻意**保留**草稿：書亞要在本機審自己還沒發的稿，
 * 以前列表頁在任何環境都濾掉，他點進 `/blog` 會找不到自己剛寫的文章，
 * 只能自己記住網址直接打進網址列——那是設計缺陷，不是安全設計。
 */
const HIDE_DRAFTS = process.env.NODE_ENV === "production";

/**
 * 全部文章，依發布日**新到舊**排序。
 *
 * production：草稿（`draft: true`）在這裡就被濾掉，所以列表頁、分類頁、sitemap、JSON-LD 都不會有草稿。
 * 開發模式：草稿一起列出來，卡片上會標「草稿」（見 `BlPostCard`），方便本機審稿。
 */
export function getAllPosts(): readonly Post[] {
  return REGISTRY.filter((post) => !(HIDE_DRAFTS && post.draft)).sort((a, b) => {
    // 日期字串是 YYYY-MM-DD，直接比字串就是比日期，不用轉 Date
    if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
    // 同一天發兩篇時，編號大的（後開稿的）排前面
    return b.id - a.id;
  });
}

/**
 * 文章清單的快取版本（模組載入時算一次）。
 * `sitemap.ts` 這種只要一份清單的地方直接用它就好。
 * production 不含草稿；開發模式含草稿（見 `getAllPosts()`）。
 */
export const posts: readonly Post[] = getAllPosts();

/**
 * 依網址片段取文章。
 * `segment` 傳 `/blog/[slug]` 的路由參數（`1001-example-slug`）；只給純 slug 也找得到。
 *
 * 草稿預設找不到（文章頁應該 404）；要在本機預覽草稿才傳 `includeDrafts`。
 */
export function getPostBySlug(segment: string, includeDrafts = false): Post | undefined {
  const pool = includeDrafts ? REGISTRY : posts;
  return pool.find((post) => postSegment(post) === segment) ?? pool.find((post) => post.slug === segment);
}

/** 某一分類的文章，同樣是新到舊、與 `posts` 同一份（production 已濾掉草稿）。 */
export function getPostsByCategory(slug: CategorySlug): readonly Post[] {
  return posts.filter((post) => post.category === slug);
}

/**
 * 部落格開站日。**零篇文章時，sitemap 的 `lastmod` 一律退回這個固定日期。**
 *
 * 🔴 以前零篇時退回 `new Date()`，於是 `/blog` 與五個分類頁的 `lastmod`
 *    每被抓一次都是不同的毫秒級時間戳。Google 會拿 `lastmod` 對照實際內容有沒有變，
 *    連續幾次「說改了、其實一個字都沒動」之後，會開始不信這份 sitemap 的 `lastmod`——
 *    連真的發新文的那一次也不會優先來抓。壞掉的方式是安靜的，所以更要防。
 * 這個常數只在「還沒有任何文章」時用得到，第一篇上線後就再也走不到。
 */
export const BLOG_LAUNCH_DATE = "2026-08-14";

/** 整個部落格的最後更新日（sitemap 的 `/blog` 那一列用）。還沒有文章就回開站日。 */
export function blogLastModified(): Date {
  return latestDate(posts);
}

/** 某分類的最後更新日（sitemap 的分類列用）。該分類還沒有文章就退回全站的。 */
export function categoryLastModified(slug: CategorySlug): Date {
  const scoped = getPostsByCategory(slug);
  return scoped.length > 0 ? latestDate(scoped) : blogLastModified();
}

function latestDate(list: readonly Post[]): Date {
  const newest = list.length > 0 ? list.map(postUpdatedAt).sort().at(-1) : undefined;
  return new Date(toTaipeiIso(newest ?? BLOG_LAUNCH_DATE));
}

/* ═══════════════════════════════════════════════════════════
   6. 結構化資料（JSON-LD）
   🔴 @id 一旦上線就永遠不改——改了等於重新建立實體，
      Google 那邊累積的信任會斷掉，等於重新養站。
   ═══════════════════════════════════════════════════════════ */

export type JsonLdNode = { [key: string]: JsonLdValue };
export type JsonLdValue = string | number | boolean | null | JsonLdValue[] | JsonLdNode;

/**
 * 全站固定的實體識別碼。
 *
 * 🔴 **必須與首頁 `src/app/page.tsx` 用的那四個 `@id` 逐字相同。**
 *    同一個實體（陳書亞／門市／網站）全站只能有一個 `@id`——兩個 `@id` 等於告訴 Google
 *    有兩個不同的陳書亞，首頁累積的作者信任（E-E-A-T）不會傳到部落格文章上，
 *    等於同一個人養兩個新帳號。
 *    `person` 原本寫成 `#person-shuya`，與首頁的 `#shuya` 對不起來，已在收錄前改齊。
 *    首頁那份是先上線的，所以**由部落格讓步**；日後兩邊要改也只能一起改。
 */
export const LD_ID = {
  website: `${SITE_URL}/#website`,
  agency: `${SITE_URL}/#agency`,
  person: `${SITE_URL}/#shuya`,
  blog: `${BLOG_URL_ABS}#blog`
} as const;

/** 日期補成帶台灣時區的 ISO 字串：`2026-08-14` → `2026-08-14T00:00:00+08:00`。 */
export function toTaipeiIso(date: string): string {
  return `${date}T00:00:00+08:00`;
}

/**
 * 陳書亞本人（`Person`）。
 * 內嵌在 `BlogPosting.author` 裡，用固定 `@id` 與 `RealEstateAgent.employee` 對接。
 *
 * 🔴 `jobTitle` 是「不動產營業員」；`identifier` 是半形括號的 `(109)登字第368962號`，
 *    兩者都直接取自 `PROFILE`，不重打。
 */
export function buildPersonLd(): JsonLdNode {
  return {
    "@type": "Person",
    "@id": LD_ID.person,
    name: PROFILE.name,
    alternateName: BLOG_META.brand,
    jobTitle: AGENCY.jobTitle,
    identifier: PROFILE.licenseNo,
    worksFor: { "@id": LD_ID.agency }
  };
}

/**
 * 門市（`RealEstateAgent`）。首頁與每一篇文章都完整貼一次。
 *
 * 🔴 刻意**沒有**的欄位，都是「沒拿到就不寫」，不要填概略值補齊：
 *    · `geo`／`hasMap`：門市精確經緯度與 Google 商家 CID 尚未取得。
 *      填屏東市中心的概略座標＝告訴 Google 一個錯的門市位置，比沒有更糟。
 *    · `openingHoursSpecification`：營業時間尚未向店裡確認。
 *    · `contactPoint`：門市市話尚未取得；不要把手機填兩次充數。
 *    · `legalName`：經紀業公司登記全名尚未取得（招牌名 ≠ 登記名）。
 *    · `founder`：書亞是加盟店的營業員，不是負責人，寫了是不實陳述。只留 `employee`。
 * 🔴 `sameAs` 只放**確定屬於書亞本人**的網址。目前只有 LINE 官方帳號一條。
 */
export function buildAgentLd(): JsonLdNode {
  return {
    "@type": "RealEstateAgent",
    "@id": LD_ID.agency,
    name: AGENCY.name,
    // 公司登記全名。招牌名放 name、登記名放 legalName，Google 兩者都吃。
    legalName: AGENCY.legalName,
    alternateName: BLOG_META.brand,
    image: absUrl(PROFILE.photoUrl),
    url: `${SITE_URL}/`,
    telephone: AGENCY.telInternational,
    email: PROFILE.email,
    priceRange: "$$",
    address: {
      "@type": "PostalAddress",
      streetAddress: AGENCY.address.streetAddress,
      addressLocality: AGENCY.address.addressLocality,
      addressRegion: AGENCY.address.addressRegion,
      postalCode: AGENCY.address.postalCode,
      addressCountry: AGENCY.address.addressCountry
    },

    /**
     * 門市座標，2026-08-15 取得後補上（先前因為沒有精確值而**刻意整段不輸出**——
     * 填概略值等於告訴 Google 一個錯的門市位置，比不填更糟）。
     *
     * 🔴 這一組是 Google 地圖的**圖釘**座標（`!3d…!4d…`），不是地圖視窗中心（`@…`）。
     *    兩者差約 265 公尺，抄錯會把門市標到別條街上。
     */
    geo: {
      "@type": "GeoCoordinates",
      latitude: AGENCY.geo.latitude,
      longitude: AGENCY.geo.longitude
    },

    /** 營業時間，2026-08-15 取得後補上：每天 09:00–21:00，無公休。 */
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: [...AGENCY.openingHours.days],
        opens: AGENCY.openingHours.opens,
        closes: AGENCY.openingHours.closes
      }
    ],
    areaServed: [
      { "@type": "City", name: "屏東市" },
      { "@type": "AdministrativeArea", name: "屏東縣" },
      { "@type": "City", name: "高雄市" }
    ],
    knowsAbout: [...AGENCY.knowsAbout],
    employee: { "@id": LD_ID.person },
    sameAs: [PROFILE.social.line]
  };
}

/** 網站本身（`WebSite`）。文章頁的 `isPartOf` 指過來，一定要有這個節點，不然指向空的。 */
export function buildWebsiteLd(): JsonLdNode {
  return {
    "@type": "WebSite",
    "@id": LD_ID.website,
    url: `${SITE_URL}/`,
    name: BLOG_META.brand,
    alternateName: AGENCY.name,
    inLanguage: "zh-Hant-TW",
    publisher: { "@id": LD_ID.agency }
  };
}

/**
 * 文章本體（`BlogPosting`）。
 * `headline` ＝ `<h1>` 逐字相同且**不含**站名後綴；`description` 與 meta 四處共用同一份。
 */
export function buildArticleLd(post: Post): JsonLdNode {
  const url = postUrlAbs(post);
  return {
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    mainEntityOfPage: url,
    headline: post.title,
    description: post.description,
    image: postCoverUrlAbs(post),
    datePublished: toTaipeiIso(post.publishedAt),
    dateModified: toTaipeiIso(postUpdatedAt(post)),
    inLanguage: "zh-Hant-TW",
    keywords: post.keywords.join(","),
    articleSection: getCategory(post.category).name,
    author: buildPersonLd(),
    publisher: { "@id": LD_ID.agency },
    isPartOf: { "@id": LD_ID.website }
  };
}

/**
 * 麵包屑（`BreadcrumbList`）。**四層**，且四層的文字要與畫面上的 `.bl-crumb` 逐字對齊。
 * 最後一層是當前頁，只有 `name`、沒有 `item`。
 */
export function buildBreadcrumbLd(post: Post): JsonLdNode {
  const category = getCategory(post.category);
  return {
    "@type": "BreadcrumbList",
    "@id": `${postUrlAbs(post)}#breadcrumb`,
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "首頁", item: `${SITE_URL}/` },
      { "@type": "ListItem", position: 2, name: BLOG_META.name, item: BLOG_URL_ABS },
      { "@type": "ListItem", position: 3, name: category.name, item: categoryUrlAbs(category) },
      { "@type": "ListItem", position: 4, name: post.title }
    ]
  };
}

/**
 * 常見問題（`FAQPage`）。
 * 🔴 與畫面上的 `<details class="bl-qa">` 同一份 `post.faq`，所以不可能不同步。
 */
export function buildFaqLd(post: Post): JsonLdNode {
  return {
    "@type": "FAQPage",
    "@id": `${postUrlAbs(post)}#faq`,
    mainEntity: post.faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a }
    }))
  };
}

/** 文章頁的完整 `@graph`（5 筆）。文章頁只要呼叫這一個。 */
export function buildArticleGraph(post: Post): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [buildArticleLd(post), buildBreadcrumbLd(post), buildFaqLd(post), buildAgentLd(), buildWebsiteLd()]
  };
}

/**
 * 列表頁／分類頁的 `Blog` 節點。
 *
 * 🔴 **沒有 `@context`**：這個節點是要塞進 `buildBlogGraph()` 的 `@graph` 裡的，
 *    `@graph` 外層已經有 `@context` 了。頁面請呼叫 `buildBlogGraph()`，不要單獨用這一個。
 *
 * `blogPost[]` 每筆只有三個欄位，`datePublished` 這裡用**純日期不帶時間**（與文章頁不同，是刻意的）；
 * 🔴 清單是空的時候**整個 `blogPost` 鍵不輸出**——輸出 `blogPost: []` 等於明確宣告
 *    「這個部落格一篇文章都沒有」，比不講還糟。
 * 傳 `category` 就變成分類頁版本。
 */
export function buildBlogLd(list: readonly Post[], category?: CategoryMeta): JsonLdNode {
  const url = category ? categoryUrlAbs(category) : BLOG_URL_ABS;
  const node: JsonLdNode = {
    "@type": "Blog",
    "@id": category ? `${url}#blog` : LD_ID.blog,
    name: category ? `${category.name}｜${BLOG_META.name}` : BLOG_META.name,
    url,
    inLanguage: "zh-Hant-TW",
    publisher: { "@id": LD_ID.agency }
  };

  if (list.length > 0) {
    node.blogPost = list.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: postUrlAbs(post),
      datePublished: post.publishedAt
    }));
  }

  return node;
}

/**
 * 列表頁／分類頁的完整 `@graph`（2 筆）。**這兩種頁面只要呼叫這一個。**
 *
 * 🔴 為什麼要包 graph：`Blog.publisher` 指向 `…/#agency`，但列表頁與分類頁的 HTML 裡
 *    以前**沒有任何 `RealEstateAgent` 節點**，那個 `@id` 指到空氣（文章頁有補、這兩頁漏了）。
 *    懸空引用不會讓驗證器報錯，只是 Google 讀到 publisher 之後發現沒有這個實體，
 *    等於這六個頁面白白少了一次「這個部落格是誰發的」的宣告。
 *    照 `buildArticleGraph()` 的做法，把門市節點一起貼進來就解決了。
 */
export function buildBlogGraph(list: readonly Post[], category?: CategoryMeta): JsonLdNode {
  return {
    "@context": "https://schema.org",
    "@graph": [buildBlogLd(list, category), buildAgentLd()]
  };
}

/**
 * 轉成可以塞進 `<script type="application/ld+json">` 的字串。
 * 把 `<` 跳脫掉，內容裡萬一出現 `</script>` 也不會把標籤切斷。
 *
 * 用法：`<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(graph) }} />`
 */
export function toJsonLd(value: JsonLdValue): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/* ═══════════════════════════════════════════════════════════
   7. 自我檢查與建置期守門

   型別擋得住「欄位有沒有填」，擋不住「格式對不對」「圖檔在不在」「該揭露的字有沒有寫」。
   這一段補上後兩者，並且在 `npm run build` 時**直接 throw**：
   有問題就沒有 build 產物，也就不可能上線。

   🔴 分兩級是刻意的：
      · 開發模式（`next dev`）→ `console.warn`。寫到一半的草稿本來就會缺東缺西，
        每存一次檔就炸掉開發伺服器只會讓人把檢查關掉。
      · 建置（`next build`，NODE_ENV=production 且看得到 `public/`）→ `throw`。
        這是上線前最後一道，而且是機器把關，不是「記得檢查」。
   ═══════════════════════════════════════════════════════════ */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `public/` 的絕對路徑；看不到就是 `null`。
 *
 * 建置與 `next dev` 都是在專案根目錄跑，所以看得到；
 * 部署後的 serverless 執行環境不一定有這個資料夾，那時候一律**略過檔案檢查**
 * （檢查在 build 就做過了，正式站不需要、也不該因為讀不到檔案而 500）。
 */
const PUBLIC_DIR: string | null = (() => {
  try {
    const dir = path.join(process.cwd(), "public");
    return existsSync(dir) ? dir : null;
  } catch {
    // Edge／瀏覽器環境沒有 process.cwd()
    return null;
  }
})();

/** 站內路徑（`/blog/1001-x/cover.png`）對應的實體檔在不在。 */
function publicFileExists(urlPath: string): boolean {
  if (!PUBLIC_DIR) return true; // 檢查不了就不要誤判成「缺檔」
  return existsSync(path.join(PUBLIC_DIR, ...urlPath.split("/").filter(Boolean)));
}

/**
 * 把一段 JSX 裡的純文字全部撈出來，用來檢查正文有沒有寫到某個字串。
 *
 * 只走 `props.children`：正文的揭露句是寫在 `<p>` / `<strong>` 這種原生標籤裡的，
 * 撈得到就夠。`<BlSpec rows={…}>` 這種把內容放在別的 prop 的元件撈不到，
 * 但那些地方本來就不放法遵揭露。
 */
function collectText(node: ReactNode, out: string[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) collectText(child as ReactNode, out);
    return;
  }
  if (isValidElement(node)) {
    const { children } = node.props as { children?: ReactNode };
    collectText(children, out);
  }
}

/**
 * 文章資料自我檢查。回傳所有問題；沒問題就是空陣列。
 *
 * 檢查分兩類：
 *   ① **格式類**（每篇都查）：編號、slug、日期、摘要結尾、關鍵字、目錄、FAQ。
 *   ② **上線類**（只查非草稿）：封面圖實體檔在不在、正文有沒有揭露經紀業名稱。
 *      為什麼只查非草稿：草稿寫到一半本來就沒圖、沒署名，那是正常狀態；
 *      但 `draft` 一拿掉就會同時踩三個坑——首屏 `loading="eager"` 的封面破圖
 *      （那正好是 LCP）、`og:image` 404（分享出去一片白）、
 *      `BlogPosting.image` 指向不存在的檔（結構化資料無效）。
 *      這三個都不會有錯誤訊息，只會安靜地爛在正式站上。
 *
 * @param list 要檢查的文章，預設是整份註冊表（含草稿）。
 */
export function auditPosts(list: readonly Post[] = REGISTRY): string[] {
  const problems: string[] = [];
  const seenIds = new Set<number>();
  const seenSlugs = new Set<string>();

  for (const post of list) {
    const tag = `#${post.id} ${post.slug}`;
    if (post.id < 1001) problems.push(`${tag}：編號要從 1001 起`);
    if (seenIds.has(post.id)) problems.push(`${tag}：編號重複`);
    if (seenSlugs.has(post.slug)) problems.push(`${tag}：slug 重複`);
    seenIds.add(post.id);
    seenSlugs.add(post.slug);

    if (!SLUG_PATTERN.test(post.slug)) problems.push(`${tag}：slug 只能用小寫英數與連字號`);
    if (!DATE_PATTERN.test(post.publishedAt)) problems.push(`${tag}：publishedAt 要寫 YYYY-MM-DD`);
    if (post.updatedAt && !DATE_PATTERN.test(post.updatedAt)) problems.push(`${tag}：updatedAt 要寫 YYYY-MM-DD`);
    if (post.updatedAt && post.updatedAt < post.publishedAt) problems.push(`${tag}：updatedAt 早於 publishedAt`);
    if (!post.excerpt.endsWith("…")) problems.push(`${tag}：卡片摘要要用全形「…」結尾`);
    if (post.keywords.at(-1) !== "屏東房地產") problems.push(`${tag}：keywords 最後一個固定是「屏東房地產」`);
    if (post.toc.at(-1)?.id !== "faq") problems.push(`${tag}：目錄最後一項要是常見問題（id: "faq"）`);
    if (post.faq.length === 0) problems.push(`${tag}：至少要有一題常見問題`);
    if (post.cover && !post.cover.endsWith(".png")) problems.push(`${tag}：封面副檔名一律 .png`);

    // ── 以下只查「要上線的文章」──
    if (post.draft) continue;

    const cover = postCoverUrl(post);
    if (!publicFileExists(cover)) {
      problems.push(
        `${tag}：封面圖不存在（找不到 public${cover}）。` +
          `非草稿文章一定要有封面——它同時是首屏大圖、og:image 與 JSON-LD 的 image，缺了三處一起壞。`
      );
    }

    const bodyText: string[] = [];
    collectText(post.body, bodyText);
    if (!bodyText.join("").includes(AGENCY.name)) {
      problems.push(
        `${tag}：正文沒有出現經紀業名稱「${AGENCY.name}」。` +
          `不動產廣告每一頁都要揭露經紀業，請在正文結尾放署名列（import { ARTICLE_SIGNATURE } from "@/lib/agency"）。`
      );
    }
  }

  return problems;
}

/** 全站共用素材（目前只有列表頁／分類頁的 OG 圖）的檢查。 */
export function auditSharedAssets(): string[] {
  if (publicFileExists(BLOG_META.ogImage)) return [];
  return [
    `列表頁／分類頁的 OG 圖不存在（找不到 public${BLOG_META.ogImage}）。` +
      `/blog 與五個分類頁分享到 LINE／FB 會是一片白，請放圖或改 BLOG_META.ogImage。`
  ];
}

/* ── 守門本體 ────────────────────────────────────────────── */

{
  const problems = [...auditPosts(), ...auditSharedAssets()];
  if (problems.length > 0) {
    const report = `[部落格] 文章資料有 ${problems.length} 個問題：\n- ${problems.join("\n- ")}`;
    // 🔴 production 且看得到 public/ ＝ 正在 build。這時候 throw，`npm run build` 直接紅，
    //    不會產出任何可以部署的東西。「圖忘了放就不可能上線」從此是機器保證，不是自律。
    if (process.env.NODE_ENV === "production" && PUBLIC_DIR) throw new Error(report);
    console.warn(report);
  }
}
