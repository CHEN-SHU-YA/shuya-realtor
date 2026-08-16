"use client";

/**
 * 部落格正文編輯器（Client 元件，只給 /admin/blog 用——INTERFACE-stage2 §4）。
 *
 * 介面（給 BlogEditForm 接）：
 * · 初始值吃 blocks JSON（getPost().data.blocks，Tiptap doc JSON 的具型別子集）；
 * · onChange 丟出 Tiptap doc JSON（editor.getJSON()，**未正規化**——
 *   存檔前由 BlogEditForm 跑 normalizeEditorDoc（§4.6），action 端再防禦性重跑）；
 * · lawChecks／onUpdateLawRef 走 React Context 傳進 lawQuote 的 NodeView
 *   （定案 #8 首選案；React NodeView 走 portal、掛在同一棵樹下，context 傳得進去）。
 *
 * 🔴 IME（新注音）：本檔與整個 editor/ 目錄**不攔任何 keydown／composition 事件**
 *    ——04 文件列的注音坑多半是攔鍵盤造成的。組字一律交給 ProseMirror 原生路徑。
 * 🔴 `immediatelyRender: false`：官方 Next 指引，避免 SSR hydration 不一致；
 *    editor 建好前先畫一格載入中的殼，版面不跳動。
 * 🔴 編輯器相關 import 只出現在 /admin/blog/[id] 的 Client 檔——
 *    前台 /blog/** 各頁 bundle 不受影響（驗收項）。
 */
import "../../blog-admin.css";
import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import type { JSONContent } from "@tiptap/core";
import type { BlogDocJson } from "@/content/blocks/types";
import type { BlogLawRef } from "@/lib/blog-db";
import { buildBlogExtensions } from "./extensions";
import { LawCheckContext, type EditorLawCheckItem } from "./law-check-context";
import Toolbar from "./Toolbar";

export type BlogEditorProps = {
  /** 文章編號（「以這版更新參照庫」的操作備註要寫「文章 {id}」）。 */
  postId: number;
  /** 初始正文：blocks JSON（來自 getPost().data.blocks）。只在掛載時讀一次。 */
  initialDoc: BlogDocJson;
  /** 圖片預覽路徑前綴：/blog/{id}-{slug}（編輯頁載入時定死；slug 改了要存檔重整才跟上）。 */
  imageBase: string;
  /**
   * 每次內容變動丟出的 Tiptap doc JSON（未正規化）。
   * BlogEditForm 拿它做 dirty 追蹤＋存檔前跑 normalizeEditorDoc。
   */
  onChange: (doc: JSONContent) => void;
  /** 最近一次存檔的法條比對結果（saveDraftAction 回的 lawChecks）。沒有＝不掛徽章。 */
  lawChecks?: readonly EditorLawCheckItem[];
  /** 「以這版更新參照庫」按下時呼叫——直接把 updateLawRefAction 傳進來即可。 */
  onUpdateLawRef?: (ref: BlogLawRef) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export default function BlogEditor({
  postId,
  initialDoc,
  imageBase,
  onChange,
  lawChecks = [],
  onUpdateLawRef
}: BlogEditorProps) {
  /** onChange 走 ref：父層每次 render 換新函式也不會重建 editor。 */
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const editor = useEditor({
    extensions: buildBlogExtensions({ imageBase }),
    content: initialDoc,
    immediatelyRender: false,
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(current.getJSON());
    }
  });

  if (!editor) {
    return (
      <div className="bae-editor">
        <p className="bae-loading">正文編輯器載入中…</p>
      </div>
    );
  }

  return (
    <LawCheckContext.Provider value={{ postId, checks: lawChecks, onUpdateLawRef }}>
      <div className="bae-editor">
        <Toolbar editor={editor} />
        <EditorContent editor={editor} className="bae-content" />
      </div>
    </LawCheckContext.Provider>
  );
}
