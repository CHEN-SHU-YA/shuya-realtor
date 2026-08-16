"use client";

/**
 * editorNote 的 React NodeView——**黃便利貼**。
 *
 * 淺黃底卡片、左上「📌 編輯備註（前台不會顯示）」，內容就是一個原生 textarea
 * 直接改（updateAttributes({ text })）——原生元件，注音天經地義地穩
 * （INTERFACE-stage2 §4.4）。可編輯、可整塊刪。
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export default function EditorNoteView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
  const text = String(node.attrs.text ?? "");
  const rows = Math.min(12, Math.max(3, text.split("\n").length + 1));

  return (
    <NodeViewWrapper className="bae-note" contentEditable={false}>
      <div className="bae-note-head">
        <span>📌 編輯備註（前台不會顯示）</span>
        <button type="button" className="bae-linkbtn bae-danger" onClick={deleteNode} title="刪掉這則備註（版本快照隨時還原得回來）">
          刪除
        </button>
      </div>
      <textarea
        className="bae-note-text"
        value={text}
        rows={rows}
        onChange={(event) => updateAttributes({ text: event.target.value })}
        placeholder="寫給自己（或給 AI）的備註——例：這裡可以放你自己的案例。"
      />
    </NodeViewWrapper>
  );
}
