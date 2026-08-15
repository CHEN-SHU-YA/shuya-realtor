/**
 * 官網文案：預設值在程式碼裡，改過的存資料庫。
 *
 * ── 兩層疊起來的設計，理由只有一個 ──
 *
 * 官網是對客戶的門面。**資料庫連不上、還沒接、或這張表是空的時候，
 * 網站必須長得跟現在一模一樣**，不能變成一片空白或一堆「undefined」。
 *
 * 所以下面的 DEFAULTS 就是目前線上那份文案，一字不差。
 * 資料庫裡有值就蓋上去，沒有就用預設 —— 最壞情況是「改的東西沒生效」，
 * 而不是「客戶看到壞掉的網站」。這兩種壞法的代價差很多。
 *
 * ── 什麼不放進來 ──
 *
 * 🔴 姓名、證號、公司名稱、電話、地址**刻意不做成可線上編輯**，它們留在 lib/profile.ts。
 * 那是不動產廣告的法定揭露資訊，後台一個手滑改錯就是不實廣告，
 * 而且畫面上看起來完全正常，沒有任何地方會提醒你。
 * 要改那幾格，值得多花兩分鐘找人改程式、順便留下紀錄。
 */
import { ensureSchema, getSql, hasDatabase } from "@/lib/db";

export type HeroPoint = { title: string; body: string };
export type Award = { year: string; name: string };

/**
 * ── 可開關的區塊 ──
 *
 * 這幾區是「先把版位做好、內容之後慢慢補」的東西。
 * 沒做完就關著，前台完全不出現；填完打開，網站才長出那一塊。
 *
 * 🔴 開關為真**還不夠**，還要真的有內容才會顯示（見下面的 visibleSections）。
 * 不然打開一個空的區塊，客戶看到的是一片空白加一個孤零零的標題 ——
 * 那比沒有這一區更糟。
 */
export type SectionKey = "why" | "reviews" | "media" | "articles" | "tools";

export const SECTION_KEYS: SectionKey[] = ["why", "reviews", "media", "articles", "tools"];

/** 後台那排開關的中文名稱，前後台共用同一份，不要各寫各的 */
export const SECTION_LABELS: Record<SectionKey, string> = {
  why: "為什麼找我",
  reviews: "客戶評價",
  media: "媒體報導",
  articles: "房產知識",
  tools: "免費工具／查詢"
};

/**
 * 每一區最多幾筆。
 *
 * 放在這裡而不是放在 actions.ts —— `"use server"` 的檔案**只能匯出 async function**，
 * 匯出一個常數會讓整個模組編譯失敗（而且 tsc 檢查不出來，只有跑起來才會炸）。
 */
export const MAX_REVIEWS = 6;
export const MAX_MEDIA = 6;
export const MAX_ARTICLES = 6;
export const MAX_TOOLS = 6;

export type Review = { name: string; source: string; text: string };
export type MediaItem = { outlet: string; title: string; url: string; date: string };
export type Article = { category: string; title: string; excerpt: string; url: string };
export type ToolItem = { tag: string; title: string; desc: string; url: string };

export type SiteContent = {
  /** 搜尋結果上那一行藍色標題 */
  seoTitle: string;
  /** 搜尋結果標題底下那兩行灰字 */
  seoDescription: string;

  heroEyebrow: string;
  /** 換行用 Enter，要變綠色重點的字用 **兩個星號** 包起來 */
  heroHeading: string;
  heroTagline: string;
  heroLead: string;
  heroPoints: HeroPoint[];
  heroNote: string;

  recordSub: string;
  /** 得獎紀錄。上面那三個數字方塊會照這份自動算，不用另外改 */
  awards: Award[];
  recordLead: string;

  footerSlogan: string;

  /** 每一區要不要出現在前台。少掉的 key 一律當成「關」 */
  sections: Record<SectionKey, boolean>;

  /** 客戶評價。星等與則數請照 Google 商家後台的實際數字填，不要自己估 */
  reviewsRating: string;
  reviewsCount: string;
  reviewsUrl: string;
  reviews: Review[];

  /** 媒體報導。每一則都要有可以點開驗證的原文連結 */
  mediaQuote: string;
  mediaItems: MediaItem[];

  articles: Article[];
  toolItems: ToolItem[];
};

/** 目前線上那份文案，逐字搬過來 */
export const DEFAULT_CONTENT: SiteContent = {
  seoTitle: "屏東房仲推薦｜陳書亞 房產顧問・專營屏東市｜資產配置規劃・不動產諮詢",
  seoDescription:
    "屏東房仲推薦－陳書亞（書亞），連續兩年百萬戰將，專營屏東市，服務屏東與高雄。提供不動產買賣仲介、資產配置規劃、節稅諮詢與售前簡易裝潢。不只幫你買賣房子，先把行情、鑑價、貸款與稅費算清楚再談成交。免費房產健檢諮詢 0925-069-812（同 LINE）。",

  heroEyebrow: "114・115 連續兩年百萬戰將　│　有巢氏房屋 屏東崇大華盛加盟店",
  heroHeading: "深耕屏東，\n為你**精準佈局**每一份資產",
  heroTagline: "「屏東房產大小事，書亞幫你處理」",
  heroLead:
    "我是**陳書亞**，專營屏東市的房產顧問，服務範圍涵蓋屏東與高雄。房子是多數人一生最大的一筆資產，決定它的價格、貸款方式與持有時間，往往比「找到買方」更影響你最後真正拿到多少。所以在談成交之前，我會先把數字算清楚，讓你知道自己在做什麼決定。",
  heroPoints: [
    { title: "連續兩年百萬戰將", body: "業績肯定來自持續成交，不是單次好運" },
    { title: "全方位房產顧問", body: "買賣、資產配置、節稅、售前整理一個窗口" },
    { title: "數字先講清楚", body: "行情、鑑價、貸款、稅費攤開再談價格" }
  ],
  heroNote: "電話同 LINE，訊息我看到都會回。諮詢不收費，也不會一直打電話催你。",

  recordSub: "連續兩年百萬戰將，代表的不只是業績數字。",
  awards: [
    { year: "114", name: "年度百萬戰將" },
    { year: "115", name: "年度百萬戰將" }
  ],
  recordLead:
    "百萬戰將是年度業績門檻。能**連續兩年**達成，靠的不是某一件特別大的案子，而是每一次定價前都把行情、鑑價與貸款成數重新算過一遍——以及一組又一組客戶，願意把手上最大的一筆資產，交到我手上。",

  footerSlogan: "深耕屏東，為你精準佈局每一份資產",

  /**
   * 🔴 新的四區預設全關 —— 因為它們現在沒有內容。
   * 「為什麼找我」是唯一預設開的，那一區的四張卡全部來自
   * 得獎紀錄、營業員證號、加盟店名與服務區域，資料本來就在，不用等他填。
   */
  sections: { why: true, reviews: false, media: false, articles: false, tools: false },

  reviewsRating: "",
  reviewsCount: "",
  reviewsUrl: "",
  reviews: [],

  mediaQuote: "",
  mediaItems: [],

  articles: [],
  toolItems: []
};

/**
 * 哪幾區真的要畫出來：**開關打開 ＋ 真的有內容**，兩個條件都要成立。
 * 只看開關的話，他在後台勾了「顯示」卻還沒填東西，前台就會多一塊空白。
 */
export function visibleSections(content: SiteContent): Record<SectionKey, boolean> {
  const on = (key: SectionKey) => content.sections?.[key] === true;
  return {
    why: on("why"),
    // 評價區只要有星等或有評價其中一樣就成立 —— 只放分數不放評論也是合理的做法
    reviews: on("reviews") && Boolean(content.reviewsRating || content.reviews.length),
    media: on("media") && content.mediaItems.length > 0,
    articles: on("articles") && content.articles.length > 0,
    tools: on("tools") && content.toolItems.length > 0
  };
}

const ROW_ID = "home";

function isPoint(value: unknown): value is HeroPoint {
  const v = value as HeroPoint;
  return Boolean(v) && typeof v.title === "string" && typeof v.body === "string";
}

function isAward(value: unknown): value is Award {
  const v = value as Award;
  return Boolean(v) && typeof v.year === "string" && typeof v.name === "string";
}

/** 每一個欄位都要是字串才算數。少一格就整筆丟掉，不要讓 undefined 印到畫面上 */
function hasStringKeys<T>(keys: readonly string[]) {
  return (value: unknown): value is T => {
    if (!value || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return keys.every((k) => typeof v[k] === "string");
  };
}

const isReview = hasStringKeys<Review>(["name", "source", "text"]);
const isMediaItem = hasStringKeys<MediaItem>(["outlet", "title", "url", "date"]);
const isArticle = hasStringKeys<Article>(["category", "title", "excerpt", "url"]);
const isToolItem = hasStringKeys<ToolItem>(["tag", "title", "desc", "url"]);

/**
 * 把資料庫撈到的東西疊到預設值上面。
 *
 * ⚠️ 逐欄檢查型別，不是直接 `{...DEFAULT, ...data}`。
 * 資料庫裡那包 JSON 是可以被人手動改壞的（或者是舊版留下來的格式），
 * 直接展開的話，一個型別不對的欄位會讓整個頁面在渲染時炸掉 ——
 * 而且是**線上炸掉**。逐欄檢查的話，壞掉的那一欄自動退回預設值，其他照常。
 */
function merge(data: unknown): SiteContent {
  const out: SiteContent = { ...DEFAULT_CONTENT };
  if (!data || typeof data !== "object") return out;
  const raw = data as Record<string, unknown>;

  const text = (key: keyof SiteContent) => {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      (out[key] as string) = value;
    }
  };

  (
    [
      "seoTitle", "seoDescription", "heroEyebrow", "heroHeading", "heroTagline",
      "heroLead", "heroNote", "recordSub", "recordLead", "footerSlogan",
      "reviewsRating", "reviewsCount", "reviewsUrl", "mediaQuote"
    ] as const
  ).forEach(text);

  if (Array.isArray(raw.heroPoints) && raw.heroPoints.every(isPoint) && raw.heroPoints.length) {
    out.heroPoints = raw.heroPoints;
  }
  if (Array.isArray(raw.awards) && raw.awards.every(isAward)) {
    out.awards = raw.awards;
  }

  /**
   * 開關一個一個看，不是整包蓋掉。
   * 之後再多開一區的時候，資料庫裡那筆舊資料不會有新 key ——
   * 整包蓋掉的話那一區會變成 undefined，這裡則是安全地退回「關」。
   */
  if (raw.sections && typeof raw.sections === "object") {
    const stored = raw.sections as Record<string, unknown>;
    const merged = { ...DEFAULT_CONTENT.sections };
    SECTION_KEYS.forEach((key) => {
      if (typeof stored[key] === "boolean") merged[key] = stored[key] as boolean;
    });
    out.sections = merged;
  }

  if (Array.isArray(raw.reviews) && raw.reviews.every(isReview)) out.reviews = raw.reviews;
  if (Array.isArray(raw.mediaItems) && raw.mediaItems.every(isMediaItem)) out.mediaItems = raw.mediaItems;
  if (Array.isArray(raw.articles) && raw.articles.every(isArticle)) out.articles = raw.articles;
  if (Array.isArray(raw.toolItems) && raw.toolItems.every(isToolItem)) out.toolItems = raw.toolItems;

  return out;
}

/**
 * 讀文案。
 *
 * 🔴 **任何失敗都回預設值，絕不往上丟錯誤。**
 * 這個函式是首頁渲染的一部分：它丟錯 = 官網掛掉。
 * 資料庫沒設、連線逾時、Neon 免費方案在睡覺 —— 都只是「看到的是預設文案」，
 * 不該讓客戶看到錯誤頁。
 */
export async function getContent(): Promise<SiteContent> {
  if (!hasDatabase) return { ...DEFAULT_CONTENT };
  try {
    await ensureSchema();
    const rows = await getSql()`select data from site_content where id = ${ROW_ID}`;
    if (!rows.length) return { ...DEFAULT_CONTENT };
    return merge((rows[0] as { data: unknown }).data);
  } catch (error) {
    console.error("[content] 讀取失敗，改用預設文案", error);
    return { ...DEFAULT_CONTENT };
  }
}

/** 存文案。這個會往上丟錯誤 —— 後台存檔失敗一定要讓人知道，不能安靜吞掉 */
export async function saveContent(content: SiteContent): Promise<void> {
  await ensureSchema();
  await getSql()`
    insert into site_content (id, data, updated_at)
    values (${ROW_ID}, ${JSON.stringify(content)}::jsonb, now())
    on conflict (id) do update set data = excluded.data, updated_at = now()
  `;
}

/** 後台顯示「上次改是什麼時候」 */
export async function getContentUpdatedAt(): Promise<string | null> {
  if (!hasDatabase) return null;
  try {
    await ensureSchema();
    const rows = await getSql()`select updated_at from site_content where id = ${ROW_ID}`;
    if (!rows.length) return null;
    const value = (rows[0] as { updated_at: unknown }).updated_at;
    return value instanceof Date ? value.toISOString() : String(value);
  } catch {
    return null;
  }
}
