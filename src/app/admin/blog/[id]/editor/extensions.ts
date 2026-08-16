/**
 * 部落格編輯器的 Tiptap extension 組（INTERFACE-stage2 §4.1–§4.4）。
 *
 * 🔴 自訂節點的「節點名與 attrs 形狀」必須跟 `src/content/blocks/types.ts`
 *    逐字一致（資料就是介面，stage1 §8）——這裡只註冊 schema 與 NodeView，
 *    不發明任何契約外的欄位。
 * 🔴 關掉的 StarterKit 項目同時就是貼上防線：從 Word／網頁貼進來的斜體、底線、
 *    程式碼區塊在 schema 層直接被剝掉，h1／h3 降級成段落——契約外的內容
 *    從一開始就進不了文件，不用事後清。
 * 🔴 IME：全程不攔任何 keydown／composition 事件（04 文件列的注音坑多半是
 *    攔鍵盤造成的）；內容編輯一律交還 ProseMirror 原生 contentDOM 路徑。
 */
import { Node, type AnyExtension } from "@tiptap/core";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import { ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import BlogImageView from "./nodes/BlogImage";
import EditorNoteView from "./nodes/EditorNote";
import LawQuoteView from "./nodes/LawQuote";
import SignatureView from "./nodes/Signature";
import SourceLineView from "./nodes/SourceLine";
import SpecTableView from "./nodes/SpecTable";
import TocListView from "./nodes/TocList";

/* ───────────────────────────────────────────────
   兩個收窄的內建 extension（§4.3）
   ─────────────────────────────────────────────── */

/**
 * 章節標題：鎖死 h2＋擴充 `id` attr（目錄錨點）。
 * `id` 空字串＝還沒填，工具列的錨點欄與表單區給狀態標示（不擋）。
 */
export const BlogHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: { default: "" }
    };
  }
}).configure({ levels: [2] });

/**
 * 連結：編輯中點連結是要編輯它，不是要跳走（openOnClick: false）。
 * 存出來會多 `class: null` 這類無害預設 attr——由 normalizeEditorDoc（§4.6）
 * 統一剝掉，存進 DB 的永遠是契約形狀（href／target／rel 三欄）。
 */
export const BlogLink = Link.configure({
  openOnClick: false,
  defaultProtocol: "https"
});

/* ───────────────────────────────────────────────
   七個自訂節點（§4.4 總表）
   renderHTML／parseHTML 是給編輯器剪貼簿序列化用的最簡版；
   前台渲染永遠走 blocks-render，兩者無關。
   ─────────────────────────────────────────────── */

/** 條文（逐字引用）區塊。內容是一般段落（零鎖），標示列在 NodeView。 */
export const LawQuote = Node.create({
  name: "lawQuote",
  group: "block",
  content: "paragraph+",
  defining: true,
  addAttributes() {
    return {
      label: { default: null },
      sources: { default: [] }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="lawQuote"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "lawQuote" }, 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(LawQuoteView);
  }
});

/** 獨立出處列（前面沒有 blockquote 的 Src；1005 唯一一例）。 */
export const SourceLine = Node.create({
  name: "sourceLine",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      label: { default: "原文連結：" },
      sources: { default: [] }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="sourceLine"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "sourceLine" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SourceLineView);
  }
});

/** 社區規格表（1002 唯一一張）。atom 節點，NodeView 給表格預覽＋編輯面板（§4.4）。 */
export const SpecTable = Node.create({
  name: "specTable",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      title: { default: "" },
      badge: { default: null },
      rows: { default: [] },
      tag: { default: null },
      source: { default: "" }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="specTable"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "specTable" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SpecTableView);
  }
});

/** 編輯備註（黃便利貼；前台不 render）。 */
export const EditorNote = Node.create({
  name: "editorNote",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      text: { default: "" }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="editorNote"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "editorNote" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(EditorNoteView);
  }
});

/** 目錄占位（不存內容；前台照 post.toc 輸出）。 */
export const TocList = Node.create({
  name: "tocList",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: 'div[data-type="tocList"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "tocList" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TocListView);
  }
});

/** 文末署名列占位（不存文字；渲染時從 @/lib/agency 取，過渡節點）。 */
export const Signature = Node.create({
  name: "signature",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: 'div[data-type="signature"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "signature" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(SignatureView);
  }
});

export type BlogImageOptions = {
  /** 圖片預覽路徑前綴：/blog/{id}-{slug}（編輯頁載入時定死）。 */
  imageBase: string;
};

/** 內文插圖。`file` 只存檔名，完整路徑用 imageBase 現組（打錯現出破圖）。 */
export const BlogImage = Node.create<BlogImageOptions>({
  name: "image",
  group: "block",
  atom: true,
  addOptions() {
    return { imageBase: "" };
  },
  addAttributes() {
    return {
      file: { default: "" },
      alt: { default: "" },
      width: { default: 1200 },
      height: { default: 675 },
      loading: { default: "lazy" }
    };
  },
  parseHTML() {
    return [{ tag: 'div[data-type="image"]' }];
  },
  renderHTML() {
    return ["div", { "data-type": "image" }];
  },
  addNodeView() {
    return ReactNodeViewRenderer(BlogImageView);
  }
});

/* ───────────────────────────────────────────────
   組裝（§4.2 StarterKit 開關）
   ─────────────────────────────────────────────── */

/**
 * 編輯器的完整 extension 組。
 * 保留：document／paragraph／text／bold／bulletList／orderedList／listItem／
 * horizontalRule／dropcursor／gapcursor／undo-redo／listKeymap／trailingNode。
 */
export function buildBlogExtensions(options: BlogImageOptions): AnyExtension[] {
  return [
    StarterKit.configure({
      heading: false, //     換下面帶 id 的版本
      link: false, //        換下面收窄的版本
      blockquote: false, //  🔴 條文一律走 lawQuote；裸 blockquote 是契約外節點
      codeBlock: false,
      code: false,
      italic: false, //      契約 mark 只有 bold＋link（五篇實測 <em> 零使用）
      strike: false,
      underline: false,
      hardBreak: false //    五篇沒有 <br>；關掉讓 Shift+Enter 不產生契約外節點
    }),
    BlogHeading,
    BlogLink,
    LawQuote,
    SourceLine,
    SpecTable,
    EditorNote,
    TocList,
    Signature,
    BlogImage.configure({ imageBase: options.imageBase })
  ];
}
