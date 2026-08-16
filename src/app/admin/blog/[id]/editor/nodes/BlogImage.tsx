"use client";

/**
 * image 的 React NodeView——圖卡：實圖預覽＋檔名／alt 欄位。
 *
 * `file` 只存檔名，完整路徑用 extension option 的 imageBase 現組
 * （/blog/{id}-{slug}）——檔名打錯就**現出破圖**，看得見的回饋，
 * 不是安靜壞掉（INTERFACE-stage2 §4.4）。
 * width／height／loading 保留原值不動（新插入預設 1200×675×lazy，
 * 在 extensions.ts 的 attrs default）。
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { BlogImageOptions } from "../extensions";

export default function BlogImageView(props: NodeViewProps) {
  const { node, extension, updateAttributes, deleteNode } = props;
  const { imageBase } = extension.options as BlogImageOptions;
  const file = String(node.attrs.file ?? "");
  const alt = String(node.attrs.alt ?? "");

  return (
    <NodeViewWrapper className="bae-imgcard" contentEditable={false}>
      <div className="bae-bar">
        <span className="bae-bar-tag">🖼 內文插圖</span>
        <button type="button" className="bae-linkbtn bae-danger" onClick={deleteNode} title="刪掉這張圖（版本快照隨時還原得回來）">
          刪除
        </button>
      </div>
      <div className="bae-imgpreview">
        {file ? (
          // 一般 <img>：預覽要跟前台同一條路徑邏輯，檔名錯就現出破圖（刻意的回饋）
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`${imageBase}/${file}`} alt={alt} />
        ) : (
          <p className="bae-muted">還沒填檔名——填了下面的「圖片檔名」就會在這裡看到預覽。</p>
        )}
      </div>
      <div className="bae-field">
        <label>圖片檔名</label>
        <input
          value={file}
          onChange={(event) => updateAttributes({ file: event.target.value.trim() })}
          placeholder="例：fig-01.png"
        />
        <p className="bae-hint">
          圖片上傳是第四段的事——現在先填 public{imageBase}/ 裡既有的檔名。上面預覽是破圖＝檔名對不到檔案。
          另外：改了網址 slug 之後，這裡的預覽路徑要「存檔＋重新整理」才會跟上。
        </p>
      </div>
      <div className="bae-field">
        <label>替代文字 alt</label>
        <textarea
          value={alt}
          rows={3}
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          placeholder="給看不到圖的人與搜尋引擎的文字說明"
        />
        <p className="bae-hint">會進前台 img 的 alt——描述圖在講什麼，不是塞關鍵字。</p>
      </div>
    </NodeViewWrapper>
  );
}
