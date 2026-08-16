/**
 * 部落格正文「結構化區塊」的資料格式（唯一定義處）。
 *
 * ── 🔴 定案：這個格式是「Tiptap doc JSON 的具型別子集」，不是自訂 JSON ──
 *
 * 查證（2026-08-16，實讀 node_modules/@tiptap/core@3.30.1 的 dist/index.d.ts）：
 * Tiptap 文件的 JSON 形狀就是 ProseMirror 的序列化格式——
 *
 * ```
 * type JSONContent = {
 *   type?: string;                                  // 節點名（doc / paragraph / text / 自訂名）
 *   attrs?: Record<string, any>;                    // 節點屬性（任意可 JSON 序列化的值）
 *   content?: JSONContent[];                        // 子節點
 *   marks?: { type: string; attrs?: Record<string, any> }[];  // 行內標記（粗體、連結…）
 *   text?: string;                                  // 只有 type:"text" 的節點有
 * }
 * ```
 *
 * 本檔定義的每一個型別都是上面這個形狀的**收窄版**：欄位名完全照 Tiptap 慣例
 * （type／attrs／content／marks／text），節點名照 Tiptap 內建擴充的命名
 * （paragraph／heading／bulletList／orderedList／listItem／horizontalRule／text），
 * 自訂節點（lawQuote／specTable／tocList／signature／editorNote／image）照
 * Tiptap 自訂節點的 attrs 慣例長。收窄的目的是讓 tsc 擋住「打錯節點名」
 * 「漏掉必填 attr」這類錯；放寬回 `JSONContent` 永遠合法（見檔尾的
 * `assertTiptapCompatible`），所以：
 *
 *   · 第二段的 Tiptap 編輯器直接吃這份 JSON，不用轉一手；
 *   · 第三段的前台用 `@tiptap/static-renderer` 的 `renderJSONContentToReactElement`
 *     （子路徑 `@tiptap/static-renderer/json/react`，不需要 ProseMirror schema、
 *     不需要瀏覽器）配 nodeMapping 直接畫成現有的 Bl 系列元件，前台維持零 JS。
 *
 * ── 為什麼不用自訂 JSON ──
 * 自訂格式要在「編輯器 ↔ 儲存格式」「儲存格式 ↔ 渲染器」各轉一手，
 * 兩個轉換層都是 bug 的家；直接用 Tiptap 格式，兩層都消失。
 * 04-編輯器選型.md 已查證 Tiptap 3.30.1 官方明列支援 React 19（MIT 授權）。
 *
 * ── 使用規則（轉檔、渲染、編輯三方共同遵守）──
 *
 * 1. 一篇文章的正文 ＝ 一個 `BlogDocJson`（`{ type:"doc", content:[…區塊…] }`）。
 *    它存進 blog_posts.blocks（jsonb），也是版本快照的一部分。
 * 2. 行內格式**只有粗體與連結兩種 mark**——五篇實測的結論（02-文章結構.md 第二節：
 *    `<em>`／`<h3>`／`<table>` 一次都沒用過）。要加新 mark 是改契約，不是改資料。
 * 3. 前台渲染函式簽章與各節點的輸出 DOM，見
 *    docs/部落格/後台設計/INTERFACE-stage1.md（第一段的契約文件）。
 * 4. 🔴 法遵：`signature` 節點**不存署名文字**，渲染時從 `@/lib/agency` 取
 *    `ARTICLE_SIGNATURE`——法遵字串唯一來源不變。第三段前台切換時，署名列改由
 *    文章頁版型固定輸出，屆時這個節點退場（轉檔期間先保留位置，讓渲染結果
 *    與現況逐字一致）。
 */

import type { JSONContent } from "@tiptap/core";

/* ───────────────────────────────────────────────
   行內層：文字節點與 mark
   ─────────────────────────────────────────────── */

/** 粗體。對應現況正文裡的 `<strong>`（五篇合計 500+ 個，高頻）。 */
export type BlogBoldMark = { type: "bold" };

/**
 * 連結。對應正文段落裡的行內 `<a>`（現況只有 1004 的三個民法條文連結）。
 *
 * 🔴 外部連結固定 `target="_blank" rel="noopener"`（沿用五篇的鐵律）；
 *    日後站內連結兩者填 null，渲染端就不輸出這兩個屬性。
 * 🔴 網址守門（不可手打 flno）由編輯器層負責：貼上整串網址時解析 pcode/flno
 *    回顯「目前指向哪一條」（03-護欄怎麼保.md 第三節）。資料層存的是最終 href。
 */
export type BlogLinkMark = {
  type: "link";
  attrs: {
    href: string;
    target: "_blank" | null;
    rel: "noopener" | null;
  };
};

export type BlogMark = BlogBoldMark | BlogLinkMark;

/**
 * 文字節點。ProseMirror 慣例：`text` 不可為空字串；沒有 mark 時省略 `marks` 欄位。
 * 一段「含行內粗體與連結」的文字 ＝ 一串 BlogTextNode（這就是 runs 模型，
 * 只是 runs 的形狀直接用 Tiptap 的 text 節點，不另創格式）。
 */
export type BlogTextNode = {
  type: "text";
  text: string;
  marks?: BlogMark[];
};

/** 行內內容 ＝ 文字節點串。 */
export type BlogInline = BlogTextNode;

/* ───────────────────────────────────────────────
   區塊層：8 種區塊型別＋2 個過渡節點
   （蓋住五篇全部元素；統計依據見 02-文章結構.md 第二節）
   ─────────────────────────────────────────────── */

/** 段落。對應 `<p>`。空段落（編輯器打 Enter 的瞬間）沒有 content 欄位。 */
export type BlogParagraphNode = {
  type: "paragraph";
  content?: BlogInline[];
};

/**
 * 章節標題。對應 `<h2 id="…">`。
 * `level` 鎖死 2：五篇沒有用過 h3，要開放是改契約。
 * `id` 是目錄錨點（英文短 kebab，例：two-lines／faq）——後台可改，
 * 對不到目錄項時掛狀態標記、不擋存檔（00-方案書.md 第三節①）。
 */
export type BlogHeadingNode = {
  type: "heading";
  attrs: {
    level: 2;
    id: string;
  };
  content: BlogInline[];
};

/**
 * 條文（逐字引用）區塊的出處。
 *
 * 🔴 兩種形狀，轉檔與編輯器都要分辨：
 *
 * · `moj`：全國法規資料庫的單條條文頁。**網址不存**，渲染時由 `mojLawUrl()`
 *   公式現組——這就是「出處連結不可手打」護欄在資料層的實作
 *   （flno 打錯不會報錯、只會安靜連到別條，所以網址永遠是組出來的）。
 *   `flno` 是字串：有 `28-2`、`1020-1`、`4-5` 這種帶連字號的條號（1003 實例）。
 *
 * · `url`：其他官方來源。五篇實況：財政部主管法規共用系統（law-out.mof.gov.tw）、
 *   稅務入口網節稅手冊（etax.nat.gov.tw）、司法院解釋（ExContent.aspx）、
 *   整部法規頁（LawAll.aspx）、屏東縣法規系統、衛福部公告——這些**組不出來**，
 *   只能存原始網址。限 https。
 *
 * `text` 是連結顯示文字，照原文保留（例：「民法第 787 條」「第 221 條」）——
 * 它是防抄襲與可讀性的一部分，不由程式生成。
 */
export type BlogLawSourceRef =
  | {
      kind: "moj";
      /** 連結顯示文字，逐字保留。 */
      text: string;
      /** 全國法規資料庫法規代碼（例：B0000001 ＝ 民法）。 */
      pcode: string;
      /** 條號，字串（例：787、28-2、1020-1）。 */
      flno: string;
    }
  | {
      kind: "url";
      /** 連結顯示文字，逐字保留。 */
      text: string;
      /** 完整網址（https）。 */
      href: string;
    };

/**
 * 條文（逐字引用）區塊。對應現況的 `<blockquote>` ＋ 緊接其後的
 * `<Src>`／`<LawSource>` 出處列（兩個 JSX 元素併成一個區塊）。
 *
 * · `content`：引文段落（逐字內容——條文原文或官方文件原文）。
 * · `attrs.label`：出處列的開頭字。五篇刻意不同（防抄襲設計），逐字保留：
 *   1001「條文出處：全國法規資料庫－」／1003「原文出處：」／1004、1005「原文連結：」。
 * · `attrs.sources`：出處連結陣列，依引文內出現順序排。
 * · 1002 的 blockquote 沒有出處列 → `label: null`、`sources: []`，
 *   渲染時只輸出 blockquote、不輸出出處列。
 *
 * 🔴 編輯器行為（第二段實作，這裡先定約）：此節點常駐標示
 *   「這一段是法條逐字｜出處：○○」，內容照樣可編輯——帶標示不帶鎖
 *   （書亞 2026-08-16 拍板）。存檔時與 blog_law_refs 參照庫背景比對，
 *   不同只掛差異標記，不擋存檔。
 */
export type BlogLawQuoteNode = {
  type: "lawQuote";
  attrs: {
    label: string | null;
    sources: BlogLawSourceRef[];
  };
  content: BlogParagraphNode[];
};

/**
 * 獨立出處列。對應「沒有接在 `<blockquote>` 後面的 `<Src>`」。
 *
 * 🔴 2026-08-16 轉檔實測後新增（待主控端追認）：契約原本假設 `<Src>`／`<LawSource>`
 *    一律緊跟在 blockquote 後面（併進 lawQuote），但 1005 第二節有一個例外——
 *    「衛福部醫院評鑑合格名單」那兩條出處直接接在一般段落後面，前面沒有 blockquote。
 *    現況 DOM 是一個獨立的 `<p style={SRC_STYLE}>`，硬塞進 lawQuote 會多出一個
 *    空的 `<blockquote>`，逐字驗收必炸，所以獨立成一種 atom 節點。
 *
 * 渲染輸出與 lawQuote 的出處列**完全同一條規格**：
 * `<p style={SRC_STYLE}>{label}{items}</p>`（細節見 INTERFACE-stage1.md §5.2）。
 * 編輯器（第二段）把它當「出處列」區塊表單編輯，moj 型出處一樣走
 * 「選法規＋填條號」、網址由 `mojLawUrl()` 現組。
 */
export type BlogSourceLineNode = {
  type: "sourceLine";
  attrs: {
    /** 出處列開頭字，逐字保留（1005 的實例是「原文連結：」）。 */
    label: string;
    sources: BlogLawSourceRef[];
  };
};

/**
 * 清單項。對應 `<li>`。
 * 照 Tiptap 慣例，內容是「段落（＋巢狀清單）」；五篇實況全部是
 * 單一段落、無巢狀，**渲染端遇到「恰好一個段落」要把 `<p>` 拆掉**、
 * 直接輸出 `<li>行內內容</li>`——現況的 DOM 就是這樣，逐字一致靠這條規則。
 */
export type BlogListItemNode = {
  type: "listItem";
  content: (BlogParagraphNode | BlogBulletListNode | BlogOrderedListNode)[];
};

/** 無序清單。對應 `<ul>`。 */
export type BlogBulletListNode = {
  type: "bulletList";
  content: BlogListItemNode[];
};

/**
 * 有序清單。對應 `<ol>`。
 * `attrs.start` 為 1 或省略時，渲染端不輸出 start 屬性。
 * ⚠️ 2026-08-16 轉檔實測：1004 第十三節有四個帶 start 的 `<ol>`（5／10／15／19）、
 *    1005 也有兩個（5／8）——行動清單分段接續編號。契約原本寫「五篇沒有」是錯的，
 *    轉檔照存 start。
 */
export type BlogOrderedListNode = {
  type: "orderedList";
  attrs?: {
    start?: number;
  };
  content: BlogListItemNode[];
};

/**
 * 內文插圖。對應現況的 `<p><img src={`${MEDIA}/fig-01.png`} … /></p>`。
 *
 * 🔴 `file` 只存檔名（例：fig-01.png），**不存路徑**——完整路徑由渲染端以
 *   `postImageBase(post)`（＝ `/blog/{id}-{slug}`）現組。人不再手打路徑，
 *   「打錯不報錯、只變破圖」的坑從結構上消滅（types.ts 檔頭自己承認過這個坑）。
 * 🔴 渲染端要把 `<img>` 包在 `<p>` 裡輸出（現況 DOM 如此，CSS 靠它排版）。
 * `width`/`height` 防 CLS，五篇全部 1200×675；`loading` 五篇全部 "lazy"。
 */
export type BlogImageNode = {
  type: "image";
  attrs: {
    file: string;
    alt: string;
    width: number;
    height: number;
    loading: "lazy" | "eager";
  };
};

/** 分隔線。對應 `<hr>`（每篇文末免責前一條）。Tiptap 內建名：horizontalRule。 */
export type BlogHorizontalRuleNode = {
  type: "horizontalRule";
};

/** 規格表的一列。`value` 用行內 runs（實況含 `<strong>`，1002）。 */
export type BlogSpecRow = {
  /** 欄位名。`white-space:nowrap`，建議 ≤5 字（BlSpec 的既有規則）。 */
  label: string;
  value: BlogInline[];
};

/**
 * 社區規格表。對應 `<BlSpec>`（共用元件，只有 1002 用過一次）。
 * props 本來就是結構化資料，原樣搬進 attrs；渲染端把 attrs 餵回現有的
 * `BlSpec` 元件（`@/app/blog/_components/BlSpec`），DOM 一個字都不變。
 *
 * 🔴 `source` 必填——「不捏造數據」的程式化實作（BlSpec 既有鐵律）：
 *    規格表每一格都是事實斷言，查不到的欄位整列拿掉，不推估。
 * 這是 atom 節點（內容全在 attrs），編輯器用表單面板編，不進富文字。
 */
export type BlogSpecTableNode = {
  type: "specTable";
  attrs: {
    title: string;
    badge: string | null;
    rows: BlogSpecRow[];
    tag: BlogInline[] | null;
    source: string;
  };
};

/**
 * 目錄清單。對應現況的 `<ul>{TOC.map(…)}</ul>`（執行期組字之一）。
 *
 * 🔴 不存任何內容：渲染端從 `post.toc`（資料庫 toc 欄位）生成
 *   `<ul><li><a href="#id">text</a></li>…</ul>`——「改了章節卻忘了改目錄」
 *   這個破口由結構消滅。目錄節的 `<h2 id="toc">`（各篇標題文字不同，
 *   防抄襲設計）是它前面的一般 heading 節點，照常編輯。
 */
export type BlogTocListNode = {
  type: "tocList";
};

/**
 * 文末署名列。對應現況的 `<p>{ARTICLE_SIGNATURE}</p>`（執行期組字之一）。
 *
 * 🔴 不存文字：渲染時從 `@/lib/agency` 取 `ARTICLE_SIGNATURE`，
 *   法遵字串唯一來源不變（重打的那一份不會有人幫你檢查有沒有打錯字）。
 * 🔴 過渡節點：第三段前台切換時，署名列改由文章頁版型固定輸出
 *   （護欄第 7 條「畢業」——從「每篇檢查」變「程式保證」），屆時轉檔資料裡的
 *   這個節點移除、編輯器也不再提供它。第一段保留它，是為了讓轉檔後的渲染
 *   結果與現況逐字一致（驗收標準）。
 */
export type BlogSignatureNode = {
  type: "signature";
};

/**
 * 編輯備註。JSX 註解的家（含「書亞：這裡可以放你自己的案例」這種位置標記，
 * 每篇 15–19 個，轉檔**不遺失**——第一段驗收點）。
 *
 * 🔴 前台不 render（渲染端對此節點輸出 null）；後台顯示成明顯的備註便利貼。
 */
export type BlogEditorNoteNode = {
  type: "editorNote";
  attrs: {
    text: string;
  };
};

/* ───────────────────────────────────────────────
   文件層
   ─────────────────────────────────────────────── */

/** 正文的頂層區塊（doc 的直接子節點只能是這些）。 */
export type BlogBlockNode =
  | BlogParagraphNode
  | BlogHeadingNode
  | BlogLawQuoteNode
  | BlogSourceLineNode
  | BlogBulletListNode
  | BlogOrderedListNode
  | BlogImageNode
  | BlogHorizontalRuleNode
  | BlogSpecTableNode
  | BlogTocListNode
  | BlogSignatureNode
  | BlogEditorNoteNode;

/** 一篇文章的正文。存進 blog_posts.blocks（jsonb）。 */
export type BlogDocJson = {
  type: "doc";
  content: BlogBlockNode[];
};

/* ───────────────────────────────────────────────
   工具
   ─────────────────────────────────────────────── */

/**
 * 全國法規資料庫的單條條文頁網址。與五篇文章檔內的 `lawUrl()`／`moj()` 同一條公式。
 * 🔴 `moj` 型出處的網址一律用這支現組，渲染端、編輯器回顯、轉檔驗證共用，
 *    不要在任何地方手打這串網址。
 */
export function mojLawUrl(pcode: string, flno: string): string {
  return `https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=${pcode}&flno=${flno}`;
}

/**
 * 編譯期證明：`BlogDocJson` 是合法的 Tiptap `JSONContent`。
 * 這個函式沒有執行期成本（恆等函式），轉檔腳本與渲染端可以直接拿它
 * 把收窄型別交給 Tiptap 的 API。改壞子集相容性時，tsc 會在這裡紅。
 */
export function assertTiptapCompatible(doc: BlogDocJson): JSONContent {
  return doc;
}
