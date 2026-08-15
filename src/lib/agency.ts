/**
 * 經紀業法遵字串（唯一真相來源）。
 *
 * ── 為什麼要獨立成一支檔案 ──
 *
 * 這些字串本來住在 `@/lib/blog`。但 `blog.ts` 會 `import { posts } from "@/content/posts"`，
 * 所以文章檔（`src/content/posts/*.tsx`）**不能**反過來 import `blog.ts`——
 * 那會形成 `blog.ts → posts/index.ts → 文章檔 → blog.ts` 的循環相依，
 * 後果是 `posts` 在模組初始化時變成空陣列：**文章全部消失，而且沒有任何錯誤訊息**。
 *
 * 結果是寫文章的人只能自己重打一份「有巢氏房屋　屏東崇大華盛加盟店」，
 * 而「每頁揭露經紀業名稱」這條法遵要求就從「型別保證」退化成「寫稿的人要記得」。
 * 打錯一個字＝把加盟店寫成直營店＝不實廣告。
 *
 * 🔴 **這支檔案只准 import `@/lib/profile`**（一支沒有任何相依的純資料檔）。
 *    任何時候都不要在這裡 import `@/lib/blog`、`@/content/*` 或元件——
 *    只要它有辦法回頭 import 文章檔，上面那個「文章無聲消失」的坑就會重新打開。
 *
 * 誰可以用它：`@/lib/blog`（re-export 給既有呼叫端）、部落格元件、
 * **以及 `src/content/posts/*.tsx` 文章檔**（這正是拆出來的目的）。
 *
 * ── 循環相依實查（2026-08-14，文章檔改成 import 本檔時逐檔核對）──
 *
 *   agency.ts    → 只有一行 import：`@/lib/profile`
 *   profile.ts   → **零 import**（純資料檔，相依圖的葉節點）
 *   1001-*.tsx   → `@/lib/agency` ＋ `./types`（type-only，編譯後整行消失）
 *   posts/index.ts → `./types`（type-only）＋ 各文章檔
 *   blog.ts      → agency.ts、profile.ts、site.ts、content/posts
 *
 * 完整鏈是 `blog.ts → posts/index.ts → 文章檔 → agency.ts → profile.ts`，
 * 終點是沒有出邊的 profile.ts，**沒有任何一條邊指回 blog.ts 或 content/posts**，
 * 所以不成環。已用 `npm run check` 與 `npm run build` 實測通過（三條部落格路由照常生成）。
 *
 * 🔴 維持不成環的唯一條件就是本檔開頭那一條：這裡只准 import `@/lib/profile`。
 *    要加第二個 import 之前，先確認那支模組（含它的相依）碰不到 `@/content/*`。
 */
import { PROFILE } from "@/lib/profile";

/**
 * 門市地址的結構化拆解（給 JSON-LD `PostalAddress` 用）。
 * 顯示用的完整地址一律用 `PROFILE.address`，不要用下面兩段自己拼。
 */
const AGENCY_ADDRESS = {
  streetAddress: "華盛街 5-5 號",
  addressLocality: "屏東市",
  addressRegion: "屏東縣",
  postalCode: "900",
  addressCountry: "TW"
} as const;

/**
 * 編譯期守門：`addressLocality + streetAddress` 必須剛好等於 `PROFILE.address`。
 * 有人改了其中一邊卻忘了另一邊，`npm run check` 就會紅，而不是等到 Google 收錄了才發現地址兩套。
 */
type AddressGuard =
  `${typeof AGENCY_ADDRESS.addressLocality}${typeof AGENCY_ADDRESS.streetAddress}` extends typeof PROFILE.address
    ? true
    : "AGENCY_ADDRESS 與 PROFILE.address 對不起來，請以 src/lib/profile.ts 為準修正";
const ADDRESS_GUARD: AddressGuard = true;
void ADDRESS_GUARD;

/** 國際格式電話（JSON-LD 用）。由 `PROFILE.phoneRaw` 推出來，不重打。 */
const TEL_INTL = `+886-${PROFILE.phoneRaw.slice(1, 4)}-${PROFILE.phoneRaw.slice(4, 7)}-${PROFILE.phoneRaw.slice(7)}`;

/**
 * 經紀業（門市）的公開揭露資訊。
 *
 * 🔴 `name` 的「有巢氏房屋」與「屏東崇大華盛加盟店」之間是**全形空格 U+3000**，
 *    而且「**加盟**」二字不可漏——漏了就是把加盟店寫成直營店。
 * 🔴 為什麼不從 `PROFILE.title` 切字串出來：那一串是「名稱 · 職稱」的顯示文案，
 *    用的是半形空格，而且任何人改文案都會默默改掉這裡的法定名稱。
 */
export const AGENCY = {
  /** 經紀業名稱（招牌名）。 */
  name: "有巢氏房屋　屏東崇大華盛加盟店",
  /** 頁尾用：名稱後面明確標示加盟店，以與直營店區別。 */
  nameWithFranchise: "有巢氏房屋　屏東崇大華盛加盟店（加盟店）",

  /**
   * 經紀業**公司登記全名**（營業執照上的名字），2026-08-15 取得。
   * 🔴 招牌名 ≠ 登記名。頁尾兩者都要印：客戶認得的是招牌名，法定揭露要的是登記名。
   */
  legalName: "大有興開發有限公司",

  /**
   * 該店**專任不動產經紀人**，2026-08-15 取得。
   * 🔴 這是**另一個人**，不是書亞。證號絕對不可與書亞的 `PROFILE.licenseNo` 混用。
   *    （書亞是營業員 (109)登字第368962號；經紀人是陳映璿 (104)中市字第01554號。）
   * ⚠️ 2026-08-11 曾誤記為「陳映璋」，正確是「陳映**璿**」。
   */
  broker: {
    name: "陳映璿",
    licenseNo: "(104)中市字第01554號"
  },

  /** 🔴 書亞是**不動產營業員**，不是經紀人。寫成經紀人就是不實廣告。 */
  jobTitle: "不動產營業員",
  /** 服務區域（與首頁一致）。 */
  serviceArea: "屏東市（專營）、屏東縣、高雄",
  /** 結構化地址。 */
  address: AGENCY_ADDRESS,
  /** 郵遞區號（`PostalAddress.postalCode` 用）。 */
  postalCode: "900",
  /** 國際格式電話。 */
  telInternational: TEL_INTL,

  /**
   * 門市座標，2026-08-15 取得。JSON-LD `geo` 用。
   *
   * 🔴 **取值有坑**：Google 地圖短網址展開後有兩組數字——
   *    `@22.6629557,120.4760794` 是**地圖視窗中心**，`!3d…!4d…` 才是**圖釘**，
   *    兩者差約 **265 公尺**，抄錯那組會把門市標到別條街上。這裡用的是圖釘那一組。
   */
  geo: {
    latitude: 22.6629508,
    longitude: 120.4786543
  },

  /**
   * 營業時間，2026-08-15 取得：每天 09:00–21:00（週一到週日無公休）。
   * JSON-LD `openingHoursSpecification` 用。
   */
  openingHours: {
    days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
    opens: "09:00",
    closes: "21:00",
    /** 給人看的版本（頁尾／資訊條）。 */
    text: "每天 09:00–21:00"
  },

  /**
   * 專業領域（JSON-LD `knowsAbout`）。
   * 「崇大新城社區」是書亞本人明講的專營社區，屬事實陳述，保留。
   * （⚠️ 與門市座落位置無關——店名叫「崇大華盛」不等於門市位在崇大新城社區範圍內。）
   */
  knowsAbout: [
    "屏東市中古屋買賣",
    "崇大新城社區",
    "屏東透天",
    "眷村改建住宅",
    "房地合一稅",
    "重購退稅",
    "實價登錄行情分析",
    "屏東學區"
  ]
} as const;

/**
 * 頁尾法遵區塊的固定文字。
 *
 * ✅ **2026-08-15 補齊**：先前刻意缺的兩項（經紀業公司登記全名、該店專任不動產經紀人）
 *    都已取得並填入，頁尾現在是完整揭露。
 *
 * 🔴 **經紀人那一行的兩個地雷**：
 *    ① 陳映璿是**另一個人**，不是書亞。兩人的證號絕對不可互換或混寫。
 *    ② 書亞的職稱是**營業員**，經紀人是**經紀人**，兩行的職稱不可互抄。
 */
export const LEGAL = {
  /** 頁尾第一行：經紀業名稱（含加盟店標示）。 */
  agencyLine: AGENCY.nameWithFranchise,
  /** 頁尾第二行：公司登記全名。招牌名 ≠ 登記名，兩者都要揭露。 */
  legalNameLine: AGENCY.legalName,
  /** 頁尾第三行：該店專任不動產經紀人。🔴 不是書亞。 */
  brokerLine: `${AGENCY.broker.name}　證號 ${AGENCY.broker.licenseNo}`,
  /** 頁尾：營業時間（給人看的版本）。 */
  hoursLine: AGENCY.openingHours.text,
  /** 頁尾免責聲明（頁尾版）。 */
  disclaimer:
    "本網站為不動產經紀營業員個人服務介紹，屬仲介服務性質。所載行情、稅務與貸款說明僅供參考，實際條件應以各金融機構、稅捐機關及主管機關最新規定與個案審核結果為準。"
} as const;

/**
 * 正文結尾的署名列（`<hr>` 之後那一行）。
 * 分隔符是全形直線「｜」；「陳書亞」與「證號」之間是全形空格 U+3000。
 *
 * 文章檔請直接 `import { ARTICLE_SIGNATURE } from "@/lib/agency"` 用這一份，
 * **不要自己重打**——`auditPosts()` 會在建置時檢查每篇非草稿文章的正文裡有沒有經紀業名稱，
 * 但它擋不住「有寫、可是寫錯字」。
 */
export const ARTICLE_SIGNATURE = `${AGENCY.name}｜${AGENCY.jobTitle} ${PROFILE.name}　證號 ${PROFILE.licenseNo}｜${PROFILE.phone}（同 LINE）`;
