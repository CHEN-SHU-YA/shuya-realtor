/**
 * 部落格文章的資料型別（唯一定義處）。
 *
 * ── 為什麼文章用「TSX 檔案 + 型別」而不是資料庫或 Markdown ──
 *
 * ① 不進資料庫：文章是公開內容，不需要即時編輯，也不該讓後台一個手滑改到；
 *    而且 `.env.local` 的資料庫連線只服務預約系統，部落格接進去只是多一個壞掉的理由。
 * ② 不用 Markdown：正文要出現 `<blockquote>`、`<ol><li><strong>…`、
 *    帶 `width/height` 的 `<img>`、社區規格表 `<dl>` 這些結構，
 *    Markdown 一定要外掛套件或 `dangerouslySetInnerHTML` 才做得到，
 *    前者多一包相依、後者是資安破口（貼進一段 <script> 就中）。
 * ③ 用 TSX：型別會在 `npm run check` 就擋下漏欄位、打錯分類 slug 這種錯，
 *    而不是等到上線後被客戶看到。
 *
 * 🔴 所有欄位的字串都是「會被主管機關與客戶看到的公開廣告內容」，
 *    不捏造價格、行情、坪數、法條號、函釋字號；查不到就寫【待查：要查什麼】。
 */
import type { ReactNode } from "react";

/**
 * 五個分類的 slug。**一旦上線就凍結**，改了要做 301。
 * 中文顯示名、排序、說明統一放在 `@/lib/blog` 的 `CATEGORIES`，這裡只管 slug 的型別安全。
 */
export type CategorySlug =
  | "market-trend" //  屏東行情
  | "community-review" //  社區實勘
  | "tax-case" //  稅怎麼算
  | "legal-case" //  產權爭議
  | "deal-practice"; //  買賣實務（🔴 原本是 market-watch，那是被參考站分類「市場觀察」的英文直譯，
//                            跟顯示名「買賣實務」語意也對不上，趁未上線改掉）

/**
 * 日期字串，格式固定 `YYYY-MM-DD`（例：`2026-08-14`）。
 *
 * 沒有用樣板字面型別去卡格式，是因為 `${number}-${number}-${number}` 這種寫法
 * 對 `08` 這類補零的月份判定會隨 TS 版本飄移，卡錯了會讓四個人的建置一起紅。
 * 格式檢查改由 `@/lib/blog` 的 `auditPosts()` 在開發模式提醒。
 */
export type IsoDate = string;

/** 目錄的一項。`id` 是正文裡 `<h2 id="…">` 的錨點，`text` 是目錄上顯示的字（可以和 h2 標題不同）。 */
export type TocItem = {
  /** 英文短 kebab，語意化（deed / bank / tax-now / checklist…）。FAQ 那項固定 `faq`。 */
  id: string;
  /** 目錄顯示文字，10–24 字，講白話；h2 才帶「一、二、三」中文編號。 */
  text: string;
};

/**
 * 一組問答。
 * 🔴 這一份資料同時餵給畫面上的 `<details class="bl-qa">` 與 `FAQPage` 結構化資料，
 * 兩邊都從這裡 render，從結構上消滅「改了內文忘了同步 JSON-LD」這個破口。
 */
export type FaqItem = {
  /** 問題。＝ `<summary>` 的字 ＝ JSON-LD `Question.name`，一個標點都不能差。 */
  q: string;
  /** 答案。＝ `<p>` 的字 ＝ JSON-LD `Answer.text`。純文字，不放 HTML 標籤。 */
  a: string;
};

/**
 * 一句話結論框（`.bl-verdict`）的內容。
 *
 * 🔴 `aBold` 與 `aRest` 是**刻意拆成兩個欄位**的：
 *    畫面上要輸出 `<span><strong>{aBold}</strong>{aRest}</span>`，
 *    整段答案必須包在同一個 `<span>` 裡（`.bl-va` 是 flex 容器，
 *    不包的話 `<strong>` 和後面的文字會各自變成 flex item，整塊框當場破版）。
 *    拆成兩個欄位，寫文章的人就不可能忘記包。
 */
export type PostVerdict = {
  /** 問句，20–25 字。畫面上是 `.bl-vq` 的裸文字節點（🔴 不要再包 span）。 */
  q: string;
  /** 答案開頭的結論句，100–110 字，會整段變粗體。全篇唯一允許粗體超過 50 字的地方。 */
  aBold: string;
  /** 結論句之後的補充說明，280–300 字，不加粗。 */
  aRest: string;
  /** 免責小字，約 120 字。元件會自動補上開頭的「※ 」，這裡不要自己打。 */
  note: string;
};

/**
 * 一篇文章。
 *
 * 欄位順序 ≒ 畫面由上而下的順序，寫文章時照著填就不會漏。
 */
export type Post = {
  /**
   * 文章編號，從 **1001** 起流水遞增。
   * 🔴 一經發布**永久凍結**（它是網址的一部分）；缺號不補、不重複使用。
   * 網址＝`/blog/{id}-{slug}`，圖片＝`/blog/{id}-{slug}/cover.png`。
   */
  id: number;

  /**
   * 英文 slug：全小寫 + 連字號，2–5 個單字，**無底線、無中文**（例：`mortgage-easing-2026`）。
   * 🔴 一經發布**永久凍結**，要改網址得做 301。全站必須唯一。
   */
  slug: string;

  /**
   * 文章標題。＝ 畫面上的 `<h1>` ＝ JSON-LD `headline` ＝ 封面圖 `alt`，三處逐字相同。
   * 🔴 **不含**站名後綴；`<title>` / `og:title` 的「｜書亞｜屏東房產」由 `buildPageTitle()` 加。
   */
  title: string;

  /**
   * 摘要說明，130–150 字。
   * SEO：`<meta name="description">`、`og:description`、`twitter:description`、
   * JSON-LD `BlogPosting.description` **四處共用這一份**，逐字相同。
   */
  description: string;

  /** 分類。一篇只掛一個，沒有未分類、沒有多重分類。 */
  category: CategorySlug;

  /**
   * 關鍵字，20–26 個，最後一個固定 `屏東房地產`。
   * SEO：JSON-LD `keywords` 會以「半形逗號、無空格」串成一長串。
   * （現代搜尋引擎不吃 `<meta name="keywords">`，所以只出現在結構化資料裡。）
   */
  keywords: readonly string[];

  /**
   * 發布日 `YYYY-MM-DD`。
   * 🔴 **永遠不准修改**——它同時是 `article:published_time` 與 JSON-LD `datePublished`，
   * 改了等於告訴 Google 這是新文章，累積的排名會重來。
   */
  publishedAt: IsoDate;

  /**
   * 最後更新日 `YYYY-MM-DD`。沒改過文章就不用填（會自動退回 `publishedAt`）。
   * 改文只動這一格，`dateModified`、`article:modified_time`、sitemap `lastmod` 三處會自己跟上。
   */
  updatedAt?: IsoDate;

  /**
   * 草稿。`true` 時：不出現在列表頁／分類頁／sitemap／JSON-LD `blogPost[]`，
   * 文章頁直接 404（避免半成品被 Google 收錄後刪不掉）。
   * 沒寫就是已發布。
   */
  draft?: boolean;

  /**
   * 卡片摘要，100–160 字，🔴 **一律以全形刪節號「…」結尾**（全站卡片統一的慣例）。
   * 只出現在列表頁／分類頁的 `.bl-x`，和 `description` 是兩份不同的文字：
   * `description` 寫給搜尋結果看，`excerpt` 寫給滑到卡片的人看。
   */
  excerpt: string;

  /**
   * 封面圖檔名（不含路徑），預設 `cover.png`。
   * 實體檔案放 `public/blog/{id}-{slug}/`，尺寸 1200×630。
   * 🔴 副檔名一律 `.png`；`alt` 由程式帶入 `title` 全文，不另外填。
   */
  cover?: string;

  /** 一句話結論框（`.bl-verdict`）。全篇 480–600 字的靈魂區塊，每篇都要有。 */
  verdict: PostVerdict;

  /**
   * 重點摘要（`.bl-tldr`），750–900 字。
   * 🔴 **單一長字串、一整段、不換行、不加粗體、不用清單**——這是刻意設計，
   *    為的是餵給 AI 摘要引擎；改成條列會失去這個功能。
   *    型別是 `string` 而不是 `string[]`，就是為了讓人不可能寫成多段。
   */
  tldr: string;

  /** 目錄。項數 ＝ 內容節數 + 1（最後一項固定是常見問題，`id: "faq"`）。 */
  toc: readonly TocItem[];

  /** 常見問題，精簡版 8 題、旗艦版 12 題。畫面與 `FAQPage` 結構化資料的唯一來源。 */
  faq: readonly FaqItem[];

  /**
   * 正文（`.bl-prose` 的內容）。
   *
   * 🔴 型別是 `ReactNode`（JSX），不是字串陣列，理由三條：
   *   ① 正文有 `<blockquote>` 引條文、`<ol><li><strong>` 總表、帶 `width/height` 的 `<img>`、
   *      社區規格表 `<BlSpec>`，字串陣列表達不了，最後一定會走上 `dangerouslySetInnerHTML`；
   *   ② React 會把文字當文字處理，沒有 XSS 破口；
   *   ③ 錨點 `<h2 id="deed">` 打錯字時，型別擋不住，但至少 JSX 讓它一眼看得到，
   *      而字串陣列會把 HTML 藏進引號裡，審稿時沒人看得出來。
   *
   * 只放 `.bl-prose` **裡面**的內容：外層 `<div className="bl-prose">` 由文章頁包，
   * FAQ 與 CTA 卡在 `.bl-prose` 外面，不要寫進來。
   */
  body: ReactNode;

  /**
   * 文末 CTA 卡的說明段，45–55 字。
   * 🔴 **每篇要換**，只列這篇主題的 2–4 個延伸服務，不要貼全業務清單。
   * 禁用詞：立即／馬上／限時／免費估價中／名額有限／錯過不再／專業團隊為您服務／保證／穩賺／包在我身上。
   */
  ctaLead: string;
};
