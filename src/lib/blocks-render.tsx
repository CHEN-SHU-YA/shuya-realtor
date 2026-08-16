/**
 * 區塊渲染器：blocks JSON → 現有文章 body 的 ReactNode（B 計畫第一段）。
 *
 * ── 這支檔在做什麼 ──
 *
 * 輸入一篇文章的正文區塊（`BlogDocJson`，Tiptap doc JSON 的具型別子集，
 * 唯一定義處 `@/content/blocks/types`），輸出與現有五篇文章 `post.body`
 * **位元組級一致**的 ReactNode——驗收方式是兩邊各跑一次
 * `renderToStaticMarkup`，任何一個 byte 差都算 FAIL
 * （docs/部落格/後台設計/INTERFACE-stage1.md 第七節）。
 *
 * 每個節點輸出什麼 DOM，以 INTERFACE-stage1.md 第 5.2 節那張表為準；
 * 本檔的實作順序、prop 順序、樣式鍵順序都照表寫，**不要「順手整理」**——
 * 這裡的每一個順序都是位元組級一致的一部分：
 *
 *   · `SRC_STYLE` 的鍵順序 fontSize → lineHeight → color → margin
 *     （React 照物件鍵序序列化 style 字串；四篇檔內同值，收斂成這一個常數）。
 *   · `<a>` 的 props 依序 href、rel、target（1004 行內連結與四篇出處列的現況順序）。
 *   · `<img>` 的 props 依序 src、alt、width、height、loading（五篇現況順序）。
 *   · `listItem` 內容恰好一個段落時要把 `<p>` 拆掉（現況 DOM 是 `<li>文字</li>`）。
 *
 * ── 選了哪條路：@tiptap/static-renderer（契約首選），沒有另寫遞迴器 ──
 *
 * 用 `@tiptap/static-renderer/json/react` 的 `renderJSONContentToReactElement`。
 * 2026-08-16 實讀 3.30.1 的 dist 原始碼確認兩件事，所以自訂節點沒有問題：
 *   ① nodeMapping 是以「節點名字串」查表，自訂名（lawQuote／specTable／…）
 *      與內建名待遇完全相同；
 *   ② mark 是照陣列順序由內往外 reduce 包裹——本契約 mark 不巢狀
 *      （一個 text 節點最多一個 mark，轉檔器遇到巢狀會中止），順序議題不存在。
 * 它把 children 以陣列傳進各 mapping 元件；`renderToStaticMarkup` 對
 * 「陣列子節點」與「並列子節點」輸出相同（hydration 註解是 renderToString
 * 才有的東西），所以包裝層不影響位元組比對。
 *
 * ── 界線 ──
 *
 * · Server 端專用，**不加 "use client"**——前台維持零客戶端 JS。
 * · 🔴 不動任何現有元件；`BlSpec` 只 import 來餵 props，DOM 由它自己保證。
 * · 🔴 `signature` 不存文字，渲染時從 `@/lib/agency` 取 `ARTICLE_SIGNATURE`
 *   （法遵字串唯一來源）；第三段署名列搬進版型後，這個 mapping 與節點一起退場。
 * · `editorNote` 前台永不輸出（回 null）。
 * · 遇到契約外的節點或 mark 一律 throw——明確失敗，不安靜吞掉半個版面。
 *
 * ── 檔名備註（給第三段接手的人）──
 *
 * INTERFACE-stage1.md 第 5.1 節寫的新檔名是 `src/lib/blog-render.tsx`（第三段）；
 * 本檔是第一段主控端指定的落點 `blocks-render.tsx`，簽章與第五節契約完全一致
 * （`renderBlogBody(doc, ctx)`／`BlogRenderContext`）。第三段接手時擇一：
 * 直接沿用本檔，或改名後同步更新契約文件——不要兩個檔並存。
 */
import type { CSSProperties, ReactNode } from "react";
import {
  renderJSONContentToReactElement,
  type JSONMarkType,
  type JSONNodeType,
  type MarkProps,
  type NodeProps
} from "@tiptap/static-renderer/json/react";
import BlSpec from "@/app/blog/_components/BlSpec";
import { ARTICLE_SIGNATURE } from "@/lib/agency";
import { assertTiptapCompatible, mojLawUrl } from "@/content/blocks/types";
import type {
  BlogDocJson,
  BlogHeadingNode,
  BlogImageNode,
  BlogInline,
  BlogLawQuoteNode,
  BlogLawSourceRef,
  BlogLinkMark,
  BlogListItemNode,
  BlogOrderedListNode,
  BlogSourceLineNode,
  BlogSpecTableNode
} from "@/content/blocks/types";
import type { TocItem } from "@/content/posts/types";

/* ───────────────────────────────────────────────
   對外契約（簽章照 INTERFACE-stage1.md §5.1，先定死）
   ─────────────────────────────────────────────── */

export type BlogRenderContext = {
  /** tocList 用：post.toc（資料庫 toc 欄位）。 */
  toc: readonly TocItem[];
  /** image 用：/blog/{id}-{slug}（與 postImageBase 同一條公式）。 */
  imageBase: string;
};

/* ───────────────────────────────────────────────
   常數與小工具
   ─────────────────────────────────────────────── */

/**
 * 條文出處列的行內樣式。四篇檔內（1001 `LAW_SRC_STYLE`、1003／1004／1005
 * `SRC_STYLE`）同值，渲染器收斂成一個常數。
 * 🔴 鍵順序不可動：React 照物件鍵序輸出 style 字串，順序變了就不是逐字節一致。
 */
const SRC_STYLE: CSSProperties = {
  fontSize: "13px",
  lineHeight: 1.7,
  color: "var(--bl-mut)",
  margin: "-8px 0 18px"
};

/**
 * 出處列 `<p style={SRC_STYLE}>{label}{items}</p>`——lawQuote 的出處列與獨立的
 * sourceLine 節點**同一條規格**（INTERFACE-stage1.md §5.2），共用這一支：
 * 每項一個 span、第二項起前面加「、」、`<a>` 的 props 依序 href、rel、target；
 * `moj` 型出處不存網址，這裡用 `mojLawUrl(pcode, flno)` 現組
 * （「出處連結不可手打」護欄的渲染端實作）。
 */
function renderSourceLine(label: string | null, sources: BlogLawSourceRef[]): ReactNode {
  return (
    <p style={SRC_STYLE}>
      {label}
      {sources.map((source, index) => {
        const href = source.kind === "moj" ? mojLawUrl(source.pcode, source.flno) : source.href;
        return (
          <span key={href}>
            {index > 0 ? "、" : null}
            <a href={href} rel="noopener" target="_blank">
              {source.text}
            </a>
          </span>
        );
      })}
    </p>
  );
}

/** 錯誤訊息用：把節點／mark 的 type 欄位轉成可讀名字。 */
function typeName(type: unknown): string {
  if (typeof type === "string") return type;
  if (type && typeof type === "object" && "name" in type) return String((type as { name: unknown }).name);
  return "(無型別)";
}

/** mapping 元件的簽章（沿用 static-renderer 的預設泛型，回傳 ReactNode）。 */
type RenderNodeFn = (props: NodeProps<JSONNodeType, ReactNode | ReactNode[]>) => ReactNode;
type RenderMarkFn = (props: MarkProps<JSONMarkType, ReactNode | ReactNode[], JSONNodeType>) => ReactNode;

/* ───────────────────────────────────────────────
   mark 對映（不吃 ctx，模組層建一次）
   ─────────────────────────────────────────────── */

const MARK_MAPPING: Record<string, RenderMarkFn> = {
  /** 粗體 → `<strong>`。 */
  bold: ({ children }) => <strong>{children}</strong>,

  /**
   * 行內連結 → `<a href rel target>`。
   * 🔴 props 依序 href、rel、target（1004 現況的 JSX 順序；React 照插入順序輸出屬性）。
   * `rel`／`target` 為 null（日後的站內連結）時不給 prop，兩個屬性都不輸出。
   */
  link: ({ mark, children }) => {
    const attrs = mark.attrs as BlogLinkMark["attrs"];
    const props: { href: string; rel?: "noopener"; target?: "_blank" } = { href: attrs.href };
    if (attrs.rel !== null) props.rel = attrs.rel;
    if (attrs.target !== null) props.target = attrs.target;
    return <a {...props}>{children}</a>;
  }
};

/* ───────────────────────────────────────────────
   節點對映（tocList／image 吃 ctx，逐次呼叫建）
   ─────────────────────────────────────────────── */

function buildNodeMapping(ctx: BlogRenderContext): Record<string, RenderNodeFn> {
  return {
    /** 文件根節點：不輸出包裝，只輸出子區塊（現況 body 就是一個 fragment）。 */
    doc: ({ children }) => <>{children}</>,

    /** 文字節點：輸出字串本身；mark 由 MARK_MAPPING 包在外面。 */
    text: ({ node }) => {
      if (typeof node.text !== "string") {
        throw new Error("blocks-render：text 節點缺 text 欄位——資料壞了，拒絕渲染");
      }
      return node.text;
    },

    /** 段落 → `<p>`。空段落（無 content）輸出 `<p></p>`。 */
    paragraph: ({ children }) => <p>{children}</p>,

    /** 章節標題 → `<h2 id>`。level 契約鎖死 2，別的值代表資料壞了。 */
    heading: ({ node, children }) => {
      const attrs = node.attrs as BlogHeadingNode["attrs"];
      if (attrs.level !== 2) {
        throw new Error(`blocks-render：heading level 只能是 2（拿到 ${String(attrs.level)}）——契約鎖死，拒絕渲染`);
      }
      return <h2 id={attrs.id}>{children}</h2>;
    },

    /**
     * 條文區塊 → `<blockquote>{引文段落}</blockquote>`＋出處列。
     * 出處列只在「label 非 null 或 sources 非空」時輸出（1002 的 blockquote
     * 沒有出處列）。輸出結構與四篇檔內的 `Src`／`LawSource` 元件逐字節一致：
     * `<p style={SRC_STYLE}>{label}{每項一個 span，第二項起前面加「、」}</p>`，
     * span 內 `<a>` 的 props 依序 href、rel、target。
     * `moj` 型出處不存網址，這裡用 `mojLawUrl(pcode, flno)` 現組——
     * 「出處連結不可手打」護欄的渲染端實作。
     */
    lawQuote: ({ node, children }) => {
      const attrs = node.attrs as BlogLawQuoteNode["attrs"];
      if (attrs.label === null && attrs.sources.length === 0) {
        return <blockquote>{children}</blockquote>;
      }
      return (
        <>
          <blockquote>{children}</blockquote>
          {renderSourceLine(attrs.label, attrs.sources)}
        </>
      );
    },

    /**
     * 獨立出處列 → `<p style={SRC_STYLE}>{label}{items}</p>`。
     * 對應「前面不是 blockquote 的 `<Src>`」（1005 第二節唯一一例，
     * 契約 2026-08-16 追加的節點）；輸出與 lawQuote 的出處列同一條規格，
     * 只是前面沒有 blockquote。
     */
    sourceLine: ({ node }) => {
      const attrs = node.attrs as BlogSourceLineNode["attrs"];
      return renderSourceLine(attrs.label, attrs.sources);
    },

    /** 無序清單 → `<ul>`。 */
    bulletList: ({ children }) => <ul>{children}</ul>,

    /** 有序清單 → `<ol>`。`start` 缺省或 1 不輸出（編輯器存回 start:1 時吞掉）。 */
    orderedList: ({ node, children }) => {
      const start = (node.attrs as BlogOrderedListNode["attrs"] | undefined)?.start;
      if (typeof start === "number" && start !== 1) {
        return <ol start={start}>{children}</ol>;
      }
      return <ol>{children}</ol>;
    },

    /**
     * 清單項 → `<li>`。
     * 🔴 內容恰好一個段落時把 `<p>` 拆掉、直接輸出行內內容——
     * 現況 DOM 是 `<li>文字</li>`（JSX 直接把文字寫在 li 裡），沒有 p；
     * Tiptap 慣例的 listItem 內容是段落，不拆就多一層 `<p>`，逐字節必掛。
     * 其他情況（巢狀清單等，五篇沒有但契約型別允許）照子節點輸出。
     */
    listItem: ({ node, children, renderElement }) => {
      const content = (node.content ?? []) as BlogListItemNode["content"];
      if (content.length === 1 && content[0].type === "paragraph") {
        const inline = content[0].content ?? [];
        return <li>{inline.map((run) => renderElement({ content: run, parent: content[0] }))}</li>;
      }
      return <li>{children}</li>;
    },

    /**
     * 內文插圖 → `<p><img/></p>`。
     * 🔴 外層 `<p>` 不可省（現況 DOM 如此，CSS 靠它排版）；
     * `src` 用 ctx.imageBase 現組（`file` 只存檔名，人不再手打路徑）；
     * props 依序 src、alt、width、height、loading（五篇現況順序）。
     */
    image: ({ node }) => {
      const attrs = node.attrs as BlogImageNode["attrs"];
      return (
        <p>
          <img
            src={`${ctx.imageBase}/${attrs.file}`}
            alt={attrs.alt}
            width={attrs.width}
            height={attrs.height}
            loading={attrs.loading}
          />
        </p>
      );
    },

    /** 分隔線 → `<hr/>`。 */
    horizontalRule: () => <hr />,

    /**
     * 社區規格表 → 餵回現有 `<BlSpec>` 元件，DOM 由元件保證一致，
     * blog.css 一個字不用改。`rows[].value`／`tag` 是行內 runs，
     * 用 renderElement 走同一套 text／mark 對映轉成 ReactNode。
     * `badge`／`tag` 存 null 時轉 undefined（BlSpec 的可選 props 形狀）。
     */
    specTable: ({ node, renderElement }) => {
      const attrs = node.attrs as BlogSpecTableNode["attrs"];
      const runs = (inline: readonly BlogInline[]): ReactNode =>
        inline.map((run) => renderElement({ content: run, parent: node }));
      return (
        <BlSpec
          title={attrs.title}
          badge={attrs.badge ?? undefined}
          rows={attrs.rows.map((row) => ({ label: row.label, value: runs(row.value) }))}
          tag={attrs.tag ? runs(attrs.tag) : undefined}
          source={attrs.source}
        />
      );
    },

    /**
     * 目錄 → `<ul><li><a href="#id">text</a></li>…</ul>`，內容從 ctx.toc 生成
     * （節點不存內容；與現況 `TOC.map` 完全同構）。
     */
    tocList: () => (
      <ul>
        {ctx.toc.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`}>{item.text}</a>
          </li>
        ))}
      </ul>
    ),

    /**
     * 署名列 → `<p>{ARTICLE_SIGNATURE}</p>`。文字從 `@/lib/agency` 取，
     * 不存不重打（法遵字串唯一來源）。過渡節點：第三段搬進版型後一起退場。
     */
    signature: () => <p>{ARTICLE_SIGNATURE}</p>,

    /** 編輯備註：前台永不輸出（後台才顯示成便利貼）。 */
    editorNote: () => null
  };
}

/* ───────────────────────────────────────────────
   契約外型別：一律明確失敗
   ─────────────────────────────────────────────── */

const unhandledNode: RenderNodeFn = ({ node }) => {
  throw new Error(
    `blocks-render：遇到契約外的節點型別「${typeName(node.type)}」——` +
      "不猜、不吞，先對 INTERFACE-stage1.md 第二節的區塊總表確認是資料壞了還是契約要改"
  );
};

const unhandledMark: RenderMarkFn = ({ mark }) => {
  throw new Error(
    `blocks-render：遇到契約外的 mark 型別「${typeName(mark.type)}」——` +
      "行內格式契約只有 bold 與 link 兩種，要加新 mark 是改契約不是改資料"
  );
};

/* ───────────────────────────────────────────────
   主函式
   ─────────────────────────────────────────────── */

/**
 * 把一篇文章的正文區塊渲染成 ReactNode。
 * Server 端用（文章頁、預覽頁、轉檔驗收比對都走這一支）；
 * 驗收基準：`renderToStaticMarkup(renderBlogBody(blocks, ctx))` 與現況
 * `renderToStaticMarkup(<>{post.body}</>)` 位元組相等。
 */
export function renderBlogBody(doc: BlogDocJson, ctx: BlogRenderContext): ReactNode {
  const render = renderJSONContentToReactElement<JSONMarkType, JSONNodeType>({
    nodeMapping: buildNodeMapping(ctx),
    markMapping: MARK_MAPPING,
    unhandledNode,
    unhandledMark
  });
  return render({ content: assertTiptapCompatible(doc) });
}
