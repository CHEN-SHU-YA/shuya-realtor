/**
 * 部落格後台的資料表定義與存取層（B 計畫第一段：資料層）。
 *
 * ── 模式（照 src/lib/db.ts 與 01-現有後台模式.md）──
 *
 * · 驅動走 `@neondatabase/serverless`（HTTP，適合 Vercel 每請求新環境）。
 * · 建表用 runtime `create table if not exists`（冪等），不引 migration 系統；
 *   模組層級 Promise 記住結果，每個執行環境只跑一次。
 * · jsonb 參數照 content.ts 的寫法：`${JSON.stringify(x)}::jsonb`。
 * · 錯誤處理分兩種（content.ts 的精神）：
 *   - 「寫入」一律往上丟錯誤——存檔失敗一定要讓人知道，不能安靜吞掉；
 *     可預期的失敗（樂觀鎖衝突）用回傳值表達，不用 throw。
 *   - 「讀取」分後台與前台：後台讀取失敗回 null／[]（頁面照開，顯示人話提示）；
 *     🔴 前台建置用的 `getPublishedPosts()` **刻意會丟錯誤**——
 *     方案書第五節的硬規矩：build 讀資料庫失敗（例如 Neon 休眠）要明確失敗，
 *     上一版網站還在線上，失敗比安靜端出一個零文章的部落格安全。
 *
 * ── 🔴 不照抄的東西（01 文件的教訓）──
 *
 * · **不用「預設＋覆寫」（merge）模式**：文章沒有「程式裡的預設值」可退，
 *   空陣列整包蓋掉的行為對文章是災難。文章一律「每篇一筆 row、整筆為準」。
 * · **不用無樂觀鎖的 upsert**：文章一改半小時，兩個分頁互蓋損失大。
 *   存檔一律帶 `expectedUpdatedAt` 比對，不符就回衝突、不寫入。
 * · `resetSiteContent` 那種「回原廠」不存在——安全網是 blog_post_history
 *   的整包快照＋還原（還原本身也是新的一版，歷史只往前長、不刪不改）。
 *
 * ── 四張表 ──
 *
 * blog_posts         每篇一筆。草稿內容攤在欄位上；線上版本整包存在
 *                    published_snapshot（前台只讀它，編輯中內容天然不外洩）。
 * blog_post_history  每次存檔一筆整包快照（append-only，不刪不改）。
 * blog_redirects     slug 改動的 301 表（發布時自動記，配套不是鎖）。
 * blog_law_refs      法規參照庫（lawQuote 存檔背景比對用；種子資料日後從
 *                    docs/部落格/事實庫/法規稅務條文庫.md 匯入，本段先建空表）。
 */
import type { BlogDocJson } from "@/content/blocks/types";
import type { CategorySlug, FaqItem, IsoDate, PostVerdict, TocItem } from "@/content/posts/types";
import { getSql, hasDatabase } from "./db";

/* ───────────────────────────────────────────────
   型別
   ─────────────────────────────────────────────── */

/** 文章狀態。draft＝只在後台看得到；published＝published_snapshot 掛在線上。 */
export type BlogPostStatus = "draft" | "published";

/**
 * 一篇文章的完整內容（可編輯的全部欄位）。
 * ＝ 現有 `Post` 型別去掉 `body`（改成 `blocks`）與 `draft`（改成資料表的 status 欄）。
 * 各欄位的字數規則、格式慣例照 `src/content/posts/types.ts` 的註解，
 * 後台把那些規則做成表單提示（提示不擋存檔——帶標示不帶鎖）。
 */
export type BlogPostData = {
  /** 文章編號（1001 起流水）。發布後永久凍結，它是網址的一部分。 */
  id: number;
  /** 英文 slug。發布後改動要走 301（publishPost 會自動記 blog_redirects）。 */
  slug: string;
  title: string;
  description: string;
  category: CategorySlug;
  keywords: readonly string[];
  /** 發布日 YYYY-MM-DD。🔴 上線後永不修改（改了 Google 當新文章）。 */
  publishedAt: IsoDate;
  /** 最後更新日 YYYY-MM-DD（顯示用；沒改過就 null，前台退回 publishedAt）。 */
  updatedAt: IsoDate | null;
  /** 封面圖檔名（例：cover.png）。null＝還沒有封面，發布檢查會列出來。 */
  cover: string | null;
  excerpt: string;
  verdict: PostVerdict;
  tldr: string;
  toc: readonly TocItem[];
  faq: readonly FaqItem[];
  /** 正文（結構化區塊，Tiptap doc JSON 子集）。 */
  blocks: BlogDocJson;
  ctaLead: string;
};

/** 後台編輯頁讀到的一筆 row。 */
export type BlogPostRow = {
  data: BlogPostData;
  status: BlogPostStatus;
  /** 線上那一版（整包）。null＝從未發布過。 */
  publishedSnapshot: BlogPostData | null;
  /** 🔴 樂觀鎖 token（timestamptz 的 ISO 字串）。存檔時原樣帶回來比對。 */
  updatedAt: string;
  /** 最後一次發布時間（ISO 字串）。null＝從未發布過。 */
  publishedAt: string | null;
  createdAt: string;
};

/** 後台文章列表的一列（不含大欄位）。 */
export type BlogPostSummary = {
  id: number;
  slug: string;
  /** `{id}-{slug}`，即公開網址 /blog/{segment}。 */
  segment: string;
  title: string;
  category: CategorySlug;
  status: BlogPostStatus;
  publishedDate: IsoDate;
  /** 最後存檔時間（ISO 字串）。 */
  savedAt: string;
  /** 「改了還沒發布」：最後存檔晚於最後發布。從未發布的草稿也算 true。 */
  hasUnpublishedChanges: boolean;
};

/** 版本清單的一列（不含整包內容，列表要輕）。 */
export type BlogHistoryEntry = {
  seq: number;
  savedAt: string;
  note: string;
};

/** 存檔／發布的結果。可預期的失敗用回傳值，不用 throw。 */
export type BlogWriteResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: "conflict" | "not-found" };

/** 法規參照庫的一筆（逐字條文，lawQuote 背景比對的基準）。 */
export type BlogLawRef = {
  /** 全國法規資料庫法規代碼（例：B0000001）。 */
  pcode: string;
  /** 條號字串（例：787、28-2）。 */
  flno: string;
  /** 法規名（例：民法）。 */
  lawName: string;
  /** 條文逐字原文。 */
  articleText: string;
  /** 逐字核對日 YYYY-MM-DD。 */
  verifiedDate: IsoDate;
  /** 核對時用的來源網址（通常＝mojLawUrl(pcode, flno)，存下來是給人回查用）。 */
  sourceUrl: string;
  /** 備註（例：沿革頁核對紀錄）。 */
  note: string;
};

/* ───────────────────────────────────────────────
   建表
   ─────────────────────────────────────────────── */

let blogSchemaReady: Promise<void> | null = null;

/** 建表。冪等，每個執行環境只跑一次（同 db.ts 的 ensureSchema 模式）。 */
export function ensureBlogSchema(): Promise<void> {
  if (!blogSchemaReady) blogSchemaReady = createBlogSchema();
  return blogSchemaReady;
}

async function createBlogSchema(): Promise<void> {
  const sql = getSql();

  /**
   * 文章表。每篇一筆、整筆為準。
   *
   * · 日期欄（published_date／updated_date）刻意存 **text** 不是 date——
   *   跟 appointments.slot_iso 同一個理由：這些字串要跟前端與 JSON-LD 逐字對得上，
   *   存成 date 會被資料庫正規化，撈回來就不是原來那串了。
   * · updated_at（timestamptz）是**樂觀鎖 token 兼「上次存檔」**，
   *   跟 updated_date（顯示用的文章更新日）是兩件事，不要混。
   *   🔴 每次寫入一律 `date_trunc('milliseconds', now())`：Postgres 的 now() 帶微秒，
   *   JS 的 Date 只有毫秒——token 經過 JS 一來一回會掉微秒，比對永遠不中
   *   （實測踩到的坑，2026-08-16）。截到毫秒，round-trip 才會相等。
   * · published_snapshot 是線上那一版的**整包** BlogPostData——
   *   前台只讀它，所以草稿改到一半的內容永遠不會被訪客看到
   *   （草稿不上正式站的護欄在資料庫世界的等價物）。
   */
  await sql`
    create table if not exists blog_posts (
      id                 integer     primary key,
      slug               text        not null,
      segment            text        generated always as ((id)::text || '-' || slug) stored,
      title              text        not null,
      description        text        not null,
      category           text        not null,
      keywords           jsonb       not null default '[]'::jsonb,
      published_date     text        not null,
      updated_date       text,
      cover              text,
      excerpt            text        not null,
      verdict            jsonb       not null,
      tldr               text        not null,
      toc                jsonb       not null default '[]'::jsonb,
      faq                jsonb       not null default '[]'::jsonb,
      blocks             jsonb       not null,
      cta_lead           text        not null,
      status             text        not null default 'draft',
      published_snapshot jsonb,
      published_at       timestamptz,
      created_at         timestamptz not null default now(),
      updated_at         timestamptz not null default now()
    )
  `;

  /** slug 全站唯一（撞名時 isUniqueViolation 判斷，同預約時段的作法）。 */
  await sql`
    create unique index if not exists blog_posts_slug on blog_posts (slug)
  `;

  /**
   * 版本快照表。每次存檔 insert 一筆**整包** BlogPostData（append-only）。
   * 不做 diff 壓縮：五篇合計不到 0.3 MB，一篇改 100 次也才十幾 MB（02 文件實測），
   * 不值得為省空間把還原邏輯弄複雜。還原＝把舊快照的 data 再存一次（又是新的一版），
   * 歷史永遠只往前長——「還原之後後悔」也還原得回來。
   */
  await sql`
    create table if not exists blog_post_history (
      seq      bigserial   primary key,
      post_id  integer     not null,
      data     jsonb       not null,
      note     text        not null default '',
      saved_at timestamptz not null default now()
    )
  `;

  await sql`
    create index if not exists blog_post_history_lookup
      on blog_post_history (post_id, seq desc)
  `;

  /**
   * 301 轉址表。發布時偵測到 slug 改了，自動把舊網址記進來（配套，不是鎖）。
   * old_path 是完整路徑（例：/blog/1003-old-slug），主鍵＝一條舊路徑只指一個新去處；
   * 同一條舊路徑再改，upsert 蓋成最新的（A→B→C 時 A 直接指 C，不串連跳）。
   */
  await sql`
    create table if not exists blog_redirects (
      old_path   text        primary key,
      new_path   text        not null,
      created_at timestamptz not null default now()
    )
  `;

  /**
   * 法規參照庫。lawQuote 區塊存檔時的背景比對基準（比對只標示、不擋、不自動改）。
   * 主鍵 (pcode, flno) ＝ 一條條文一筆；種子資料日後從事實庫文件匯入。
   */
  await sql`
    create table if not exists blog_law_refs (
      pcode         text        not null,
      flno          text        not null,
      law_name      text        not null,
      article_text  text        not null,
      verified_date text        not null,
      source_url    text        not null,
      note          text        not null default '',
      updated_at    timestamptz not null default now(),
      primary key (pcode, flno)
    )
  `;
}

/* ───────────────────────────────────────────────
   內部工具
   ─────────────────────────────────────────────── */

/** timestamptz → ISO 字串（樂觀鎖 token 的統一格式）。 */
function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function isoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return iso(value);
}

/** row（snake_case 欄位）→ BlogPostData。撈回來的 jsonb 已是物件。 */
function rowToData(row: Record<string, unknown>): BlogPostData {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description),
    category: String(row.category) as CategorySlug,
    keywords: row.keywords as readonly string[],
    publishedAt: String(row.published_date),
    updatedAt: row.updated_date === null ? null : String(row.updated_date),
    cover: row.cover === null ? null : String(row.cover),
    excerpt: String(row.excerpt),
    verdict: row.verdict as PostVerdict,
    tldr: String(row.tldr),
    toc: row.toc as readonly TocItem[],
    faq: row.faq as readonly FaqItem[],
    blocks: row.blocks as BlogDocJson,
    ctaLead: String(row.cta_lead)
  };
}

/* ───────────────────────────────────────────────
   寫入（一律往上丟連線層錯誤；可預期的失敗用回傳值）
   ─────────────────────────────────────────────── */

/**
 * 轉檔匯入（第一段的一次性動作，也給日後 AI 產稿入庫用）。
 * 整筆 upsert；`publish: true` 時同步把這一版設成線上版本（五篇舊文是 live 的，
 * 匯入即發布，前台切換那天才會真的讀到）。每次匯入照樣記一筆 history。
 */
export async function importPost(
  data: BlogPostData,
  options: { publish: boolean; note?: string }
): Promise<void> {
  await ensureBlogSchema();
  const sql = getSql();
  const json = JSON.stringify(data);
  const note = options.note ?? "轉檔匯入";

  await sql`
    insert into blog_posts (
      id, slug, title, description, category, keywords,
      published_date, updated_date, cover, excerpt, verdict, tldr,
      toc, faq, blocks, cta_lead, status, published_snapshot, published_at, updated_at
    ) values (
      ${data.id}, ${data.slug}, ${data.title}, ${data.description}, ${data.category},
      ${JSON.stringify(data.keywords)}::jsonb,
      ${data.publishedAt}, ${data.updatedAt}, ${data.cover}, ${data.excerpt},
      ${JSON.stringify(data.verdict)}::jsonb, ${data.tldr},
      ${JSON.stringify(data.toc)}::jsonb, ${JSON.stringify(data.faq)}::jsonb,
      ${JSON.stringify(data.blocks)}::jsonb, ${data.ctaLead},
      ${options.publish ? "published" : "draft"},
      ${options.publish ? json : null}::jsonb,
      case when ${options.publish} then date_trunc('milliseconds', now()) end,
      date_trunc('milliseconds', now())
    )
    on conflict (id) do update set
      slug = excluded.slug,
      title = excluded.title,
      description = excluded.description,
      category = excluded.category,
      keywords = excluded.keywords,
      published_date = excluded.published_date,
      updated_date = excluded.updated_date,
      cover = excluded.cover,
      excerpt = excluded.excerpt,
      verdict = excluded.verdict,
      tldr = excluded.tldr,
      toc = excluded.toc,
      faq = excluded.faq,
      blocks = excluded.blocks,
      cta_lead = excluded.cta_lead,
      status = excluded.status,
      published_snapshot = excluded.published_snapshot,
      published_at = excluded.published_at,
      updated_at = date_trunc('milliseconds', now())
  `;
  await sql`
    insert into blog_post_history (post_id, data, note)
    values (${data.id}, ${json}::jsonb, ${note})
  `;
}

/**
 * 存草稿。🔴 樂觀鎖：`expectedUpdatedAt` 不等於資料庫現值就回 conflict、不寫入
 * （「這篇在別的視窗被改過」——01 文件點名的互蓋風險）。
 * 成功後 insert 一筆 history（整包快照），並回傳新的鎖 token。
 * `id`、`publishedAt` 兩個凍結欄位不在 update 清單裡——表單顯示但不落盤。
 */
export async function savePostDraft(
  data: BlogPostData,
  expectedUpdatedAt: string,
  note = ""
): Promise<BlogWriteResult> {
  await ensureBlogSchema();
  const sql = getSql();

  const rows = await sql`
    update blog_posts set
      slug = ${data.slug},
      title = ${data.title},
      description = ${data.description},
      category = ${data.category},
      keywords = ${JSON.stringify(data.keywords)}::jsonb,
      updated_date = ${data.updatedAt},
      cover = ${data.cover},
      excerpt = ${data.excerpt},
      verdict = ${JSON.stringify(data.verdict)}::jsonb,
      tldr = ${data.tldr},
      toc = ${JSON.stringify(data.toc)}::jsonb,
      faq = ${JSON.stringify(data.faq)}::jsonb,
      blocks = ${JSON.stringify(data.blocks)}::jsonb,
      cta_lead = ${data.ctaLead},
      updated_at = date_trunc('milliseconds', now())
    where id = ${data.id} and updated_at = ${expectedUpdatedAt}
    returning updated_at
  `;

  if (!rows.length) {
    const exists = await sql`select 1 from blog_posts where id = ${data.id}`;
    return { ok: false, reason: exists.length ? "conflict" : "not-found" };
  }

  await sql`
    insert into blog_post_history (post_id, data, note)
    values (${data.id}, ${JSON.stringify(data)}::jsonb, ${note})
  `;
  return { ok: true, updatedAt: iso(rows[0].updated_at) };
}

/**
 * 發布：把「現在存的這一版」整包複製成 published_snapshot（線上版本）。
 * 🔴 slug 跟上一次發布的版本不同時，自動把舊網址 upsert 進 blog_redirects
 *    （00 方案書第三節①的配套：不鎖 slug，用自動 301 吃掉風險）。
 * 同樣帶樂觀鎖：發布的一定是書亞在畫面上看到的那一版。
 */
export async function publishPost(
  id: number,
  expectedUpdatedAt: string
): Promise<BlogWriteResult> {
  await ensureBlogSchema();
  const sql = getSql();

  const current = await sql`select * from blog_posts where id = ${id}`;
  if (!current.length) return { ok: false, reason: "not-found" };
  const row = current[0] as Record<string, unknown>;
  if (iso(row.updated_at) !== expectedUpdatedAt) return { ok: false, reason: "conflict" };

  const data = rowToData(row);
  const previous = row.published_snapshot as BlogPostData | null;

  const rows = await sql`
    update blog_posts set
      status = 'published',
      published_snapshot = ${JSON.stringify(data)}::jsonb,
      published_at = date_trunc('milliseconds', now()),
      updated_at = date_trunc('milliseconds', now())
    where id = ${id} and updated_at = ${expectedUpdatedAt}
    returning updated_at
  `;
  if (!rows.length) return { ok: false, reason: "conflict" };

  if (previous && previous.slug !== data.slug) {
    await recordRedirect(`/blog/${previous.id}-${previous.slug}`, `/blog/${data.id}-${data.slug}`);
  }
  return { ok: true, updatedAt: iso(rows[0].updated_at) };
}

/** 記一條 301（upsert：同一條舊路徑以最新目的地為準，不串連跳）。 */
export async function recordRedirect(oldPath: string, newPath: string): Promise<void> {
  await ensureBlogSchema();
  await getSql()`
    insert into blog_redirects (old_path, new_path)
    values (${oldPath}, ${newPath})
    on conflict (old_path) do update set new_path = excluded.new_path, created_at = now()
  `;
}

/** 法規參照庫 upsert（種子匯入與「以這版更新參照庫」共用）。 */
export async function upsertLawRef(ref: BlogLawRef): Promise<void> {
  await ensureBlogSchema();
  await getSql()`
    insert into blog_law_refs (pcode, flno, law_name, article_text, verified_date, source_url, note)
    values (${ref.pcode}, ${ref.flno}, ${ref.lawName}, ${ref.articleText},
            ${ref.verifiedDate}, ${ref.sourceUrl}, ${ref.note})
    on conflict (pcode, flno) do update set
      law_name = excluded.law_name,
      article_text = excluded.article_text,
      verified_date = excluded.verified_date,
      source_url = excluded.source_url,
      note = excluded.note,
      updated_at = now()
  `;
}

/* ───────────────────────────────────────────────
   讀取——後台（失敗回 null／[]，頁面照開）
   ─────────────────────────────────────────────── */

/** 後台文章列表。沒接資料庫或讀取失敗回 []（後台頁自己顯示人話提示）。 */
export async function listPosts(): Promise<readonly BlogPostSummary[]> {
  if (!hasDatabase) return [];
  try {
    await ensureBlogSchema();
    /** 「改了還沒發布」在 SQL 裡算（同一台時鐘、同一種精度），不在 JS 比字串。 */
    const rows = await getSql()`
      select id, slug, segment, title, category, status, published_date, updated_at,
             (published_at is null or updated_at > published_at) as dirty
      from blog_posts
      order by id desc
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      slug: String(row.slug),
      segment: String(row.segment),
      title: String(row.title),
      category: String(row.category) as CategorySlug,
      status: String(row.status) as BlogPostStatus,
      publishedDate: String(row.published_date),
      savedAt: iso(row.updated_at),
      hasUnpublishedChanges: Boolean(row.dirty)
    }));
  } catch (error) {
    console.error("[blog-db] 讀文章列表失敗", error);
    return [];
  }
}

/** 後台編輯頁讀一篇（草稿內容＋線上版本＋樂觀鎖 token）。失敗回 null。 */
export async function getPost(id: number): Promise<BlogPostRow | null> {
  if (!hasDatabase) return null;
  try {
    await ensureBlogSchema();
    const rows = await getSql()`select * from blog_posts where id = ${id}`;
    if (!rows.length) return null;
    const row = rows[0] as Record<string, unknown>;
    return {
      data: rowToData(row),
      status: String(row.status) as BlogPostStatus,
      publishedSnapshot: row.published_snapshot as BlogPostData | null,
      updatedAt: iso(row.updated_at),
      publishedAt: isoOrNull(row.published_at),
      createdAt: iso(row.created_at)
    };
  } catch (error) {
    console.error("[blog-db] 讀文章失敗", error);
    return null;
  }
}

/** 版本清單（新到舊，不含整包內容）。失敗回 []。 */
export async function listHistory(postId: number, limit = 20): Promise<readonly BlogHistoryEntry[]> {
  if (!hasDatabase) return [];
  try {
    await ensureBlogSchema();
    const rows = await getSql()`
      select seq, saved_at, note from blog_post_history
      where post_id = ${postId}
      order by seq desc
      limit ${limit}
    `;
    return rows.map((row) => ({
      seq: Number(row.seq),
      savedAt: iso(row.saved_at),
      note: String(row.note)
    }));
  } catch (error) {
    console.error("[blog-db] 讀版本清單失敗", error);
    return [];
  }
}

/**
 * 讀某一版的整包內容（還原流程用：拿到 data 之後走 savePostDraft 存回去，
 * 還原本身就是新的一版）。失敗或不存在回 null。
 */
export async function getHistoryEntry(
  postId: number,
  seq: number
): Promise<{ data: BlogPostData; savedAt: string; note: string } | null> {
  if (!hasDatabase) return null;
  try {
    await ensureBlogSchema();
    const rows = await getSql()`
      select data, saved_at, note from blog_post_history
      where post_id = ${postId} and seq = ${seq}
    `;
    if (!rows.length) return null;
    return {
      data: rows[0].data as BlogPostData,
      savedAt: iso(rows[0].saved_at),
      note: String(rows[0].note)
    };
  } catch (error) {
    console.error("[blog-db] 讀版本快照失敗", error);
    return null;
  }
}

/** 查一條條文的參照庫版本（lawQuote 比對用）。失敗或沒有回 null。 */
export async function getLawRef(pcode: string, flno: string): Promise<BlogLawRef | null> {
  if (!hasDatabase) return null;
  try {
    await ensureBlogSchema();
    const rows = await getSql()`
      select * from blog_law_refs where pcode = ${pcode} and flno = ${flno}
    `;
    if (!rows.length) return null;
    const row = rows[0] as Record<string, unknown>;
    return {
      pcode: String(row.pcode),
      flno: String(row.flno),
      lawName: String(row.law_name),
      articleText: String(row.article_text),
      verifiedDate: String(row.verified_date),
      sourceUrl: String(row.source_url),
      note: String(row.note)
    };
  } catch (error) {
    console.error("[blog-db] 讀法規參照失敗", error);
    return null;
  }
}

/* ───────────────────────────────────────────────
   讀取——前台（第三段接手；🔴 失敗刻意 throw）
   ─────────────────────────────────────────────── */

/**
 * 線上文章（published_snapshot）。給第三段的前台／sitemap／generateStaticParams 用。
 *
 * 🔴 跟後台讀取相反：沒接資料庫或查詢失敗**直接 throw**——
 *    這是 build 的資料來源，明確失敗（保住線上的上一版）比安靜端出
 *    零文章的部落格安全（方案書第五節）。排序交給呼叫端
 *    （lib/blog.ts 既有的排序邏輯是行為契約，第三段照舊實作）。
 */
export async function getPublishedPosts(): Promise<readonly BlogPostData[]> {
  await ensureBlogSchema();
  const rows = await getSql()`
    select published_snapshot from blog_posts
    where status = 'published' and published_snapshot is not null
    order by id
  `;
  return rows.map((row) => row.published_snapshot as BlogPostData);
}

/** 用網址 segment（{id}-{slug}）取線上那一版。查不到回 null；連線失敗照樣 throw。 */
export async function getPublishedPostBySegment(segment: string): Promise<BlogPostData | null> {
  await ensureBlogSchema();
  const rows = await getSql()`
    select published_snapshot from blog_posts
    where segment = ${segment} and status = 'published' and published_snapshot is not null
  `;
  if (!rows.length) return null;
  return rows[0].published_snapshot as BlogPostData;
}

/** 查 301：舊路徑有登記就回新路徑，沒有回 null。連線失敗回 null（轉址壞了退成 404，不炸站）。 */
export async function resolveRedirect(oldPath: string): Promise<string | null> {
  if (!hasDatabase) return null;
  try {
    await ensureBlogSchema();
    const rows = await getSql()`
      select new_path from blog_redirects where old_path = ${oldPath}
    `;
    return rows.length ? String(rows[0].new_path) : null;
  } catch (error) {
    console.error("[blog-db] 讀轉址表失敗", error);
    return null;
  }
}
