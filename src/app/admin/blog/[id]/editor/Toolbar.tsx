"use client";

/**
 * 編輯器工具列（固定式，INTERFACE-stage2 §4.4 尾段）。
 *
 * 粗體｜連結｜章節標題（游標在標題內時多顯示「錨點」輸入欄，直接改 id attr）｜
 * 項目清單｜編號清單（含起始編號欄）｜分隔線｜插入區塊▾｜復原｜重做。
 *
 * 🔴 不裝 BubbleMenu／FloatingMenu（v3 的選單件另要 floating-ui peer，
 *    固定工具列就夠）。所有按鈕帶繁中 title tooltip。
 * 插入選單五項照 §4.4：法條區塊／出處列／規格表／圖片／編輯備註。
 * 規格表插入時給空骨架（title 空、兩列空白），插完按〔編輯規格表〕填內容。
 * 連結網址走 badUrl 白名單（資安檢查不是內容鎖）；貼全國法規資料庫單條頁
 * 網址會回顯「目前指向哪一條」＋開新視窗核對。
 */
import { useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { mojLawUrl } from "@/content/blocks/types";
import { badUrl, commonLawName, parseMojUrl } from "../../lib/law";

export default function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor.isActive("bold"),
      link: ctx.editor.isActive("link"),
      linkHref: String(ctx.editor.getAttributes("link").href ?? ""),
      heading: ctx.editor.isActive("heading"),
      headingId: String(ctx.editor.getAttributes("heading").id ?? ""),
      bulletList: ctx.editor.isActive("bulletList"),
      orderedList: ctx.editor.isActive("orderedList"),
      orderedListStart: Number(ctx.editor.getAttributes("orderedList").start ?? 1),
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo()
    })
  });

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openLinkPanel = () => {
    setLinkDraft(state.linkHref);
    setLinkError(null);
    setLinkOpen((open) => !open);
    setMenuOpen(false);
  };

  const applyLink = () => {
    const url = linkDraft.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (badUrl(url)) {
      // 資安白名單（照 admin actions.ts 的 badUrl）：擋 javascript: 與 // 開頭
      setLinkError("連結只收 https://（或站內 / 開頭）的網址——這是資安限制，不是內容檢查。");
      return;
    }
    const internal = url.startsWith("/");
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({
        href: url,
        // 外部連結固定 target="_blank" rel="noopener"（五篇鐵律）；站內連結兩者 null
        target: internal ? null : "_blank",
        rel: internal ? null : "noopener"
      })
      .run();
    setLinkOpen(false);
  };

  const insert = (content: object) => {
    editor.chain().focus().insertContent(content).run();
    setMenuOpen(false);
  };

  const moj = parseMojUrl(linkDraft.trim());

  return (
    <div className="bae-toolbar" contentEditable={false}>
      <button
        type="button"
        className={`bae-tbtn${state.bold ? " on" : ""}`}
        title="粗體（選字後按）"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <strong>B</strong> 粗體
      </button>

      <button
        type="button"
        className={`bae-tbtn${state.link ? " on" : ""}`}
        title="加上或編輯連結（選字後按；貼全國法規資料庫的條文網址會顯示指向哪一條）"
        onClick={openLinkPanel}
      >
        🔗 連結
      </button>

      <span className="bae-tsep" />

      <button
        type="button"
        className={`bae-tbtn${state.heading ? " on" : ""}`}
        title="章節標題（h2；游標在標題內時右邊會出現錨點欄）"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        H2 章節標題
      </button>

      {state.heading ? (
        <label className="bae-tfield" title="目錄錨點 id（英文短 kebab，例：two-lines）。對不到目錄項時表單那區會掛標示，不擋存檔">
          錨點：
          <input
            value={state.headingId}
            onChange={(event) => editor.commands.updateAttributes("heading", { id: event.target.value.trim() })}
            placeholder="例：deed"
          />
        </label>
      ) : null}

      <button
        type="button"
        className={`bae-tbtn${state.bulletList ? " on" : ""}`}
        title="項目清單（圓點）"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        • 項目清單
      </button>

      <button
        type="button"
        className={`bae-tbtn${state.orderedList ? " on" : ""}`}
        title="編號清單（1. 2. 3.）"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        1. 編號清單
      </button>

      {state.orderedList ? (
        <label className="bae-tfield" title="這個清單從幾號開始編（分段接續編號用，例：上一段列到 4，這段從 5 開始）">
          從幾號開始：
          <input
            type="number"
            min={1}
            className="bae-tfield-num"
            value={state.orderedListStart}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value) && value >= 1) {
                editor.commands.updateAttributes("orderedList", { start: value });
              }
            }}
          />
        </label>
      ) : null}

      <button
        type="button"
        className="bae-tbtn"
        title="插入分隔線（每篇文末免責前那一條）"
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
      >
        — 分隔線
      </button>

      <span className="bae-tsep" />

      <div className="bae-menu">
        <button
          type="button"
          className={`bae-tbtn${menuOpen ? " on" : ""}`}
          title="在游標位置插入區塊"
          onClick={() => {
            setMenuOpen((open) => !open);
            setLinkOpen(false);
          }}
        >
          ＋ 插入區塊 ▾
        </button>
        {menuOpen ? (
          <div className="bae-menu-list">
            <button
              type="button"
              title="法條逐字引用區塊（帶常駐出處標示列；內容照樣自由編輯）"
              onClick={() =>
                insert({
                  type: "lawQuote",
                  attrs: { label: null, sources: [] },
                  content: [{ type: "paragraph" }]
                })
              }
            >
              ⚖ 法條區塊
            </button>
            <button
              type="button"
              title="獨立出處列（不接在條文區塊後面的小字出處，前台顯示為一行小字）"
              onClick={() => insert({ type: "sourceLine", attrs: { label: "原文連結：", sources: [] } })}
            >
              🔗 出處列
            </button>
            <button
              type="button"
              title="社區規格表（標題＋逐列欄位＋資料來源；插入後按〔編輯規格表〕填內容）"
              onClick={() =>
                insert({
                  type: "specTable",
                  attrs: {
                    title: "",
                    badge: null,
                    rows: [
                      { label: "", value: [] },
                      { label: "", value: [] }
                    ],
                    tag: null,
                    source: ""
                  }
                })
              }
            >
              📋 規格表
            </button>
            <button
              type="button"
              title="內文插圖（先填 public/blog/ 裡既有的檔名；上傳功能是第四段）"
              onClick={() =>
                insert({
                  type: "image",
                  attrs: { file: "", alt: "", width: 1200, height: 675, loading: "lazy" }
                })
              }
            >
              🖼 圖片
            </button>
            <button
              type="button"
              title="編輯備註（黃便利貼；只有後台看得到，前台不會顯示）"
              onClick={() => insert({ type: "editorNote", attrs: { text: "" } })}
            >
              📌 段落註記
            </button>
          </div>
        ) : null}
      </div>

      <span className="bae-tsep" />

      <button
        type="button"
        className="bae-tbtn"
        title="復原上一步（Ctrl+Z）"
        disabled={!state.canUndo}
        onClick={() => editor.chain().focus().undo().run()}
      >
        ↩ 復原
      </button>
      <button
        type="button"
        className="bae-tbtn"
        title="重做（Ctrl+Y）"
        disabled={!state.canRedo}
        onClick={() => editor.chain().focus().redo().run()}
      >
        ↪ 重做
      </button>

      {linkOpen ? (
        <div className="bae-linkpanel">
          <div className="bae-field">
            <label>連結網址</label>
            <input
              value={linkDraft}
              onChange={(event) => {
                setLinkDraft(event.target.value);
                setLinkError(null);
              }}
              placeholder="https://…（站內頁面可填 /blog/… 開頭）"
              autoFocus
            />
            {moj ? (
              <p className="bae-hint">
                目前指向：全國法規資料庫－{commonLawName(moj.pcode) ?? `代碼 ${moj.pcode}`} 第 {moj.flno} 條｜{" "}
                <a href={mojLawUrl(moj.pcode, moj.flno)} target="_blank" rel="noopener">
                  開新視窗核對
                </a>
              </p>
            ) : linkDraft.trim() ? (
              <p className="bae-hint">將連到：{linkDraft.trim()}</p>
            ) : (
              <p className="bae-hint">清空按「套用」＝移除這個連結。</p>
            )}
            {linkError ? <p className="bae-hint bae-warn-text">⚠ {linkError}</p> : null}
          </div>
          <div className="bae-row-actions">
            <button type="button" className="bae-btn" onClick={applyLink}>
              套用
            </button>
            <button
              type="button"
              className="bae-btn-secondary"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setLinkOpen(false);
              }}
            >
              移除連結
            </button>
            <button type="button" className="bae-btn-secondary" onClick={() => setLinkOpen(false)}>
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
