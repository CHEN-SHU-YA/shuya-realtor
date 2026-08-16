"use client";

/**
 * tocList 的 React NodeView——不可拆的灰色占位卡。
 *
 * 節點不存內容：前台照 post.toc 輸出（「改了章節卻忘了改目錄」由結構消滅）。
 * 要改目錄文字去 metadata 表單的「目錄」那一區。
 * 可選取、可整塊刪（零鎖；刪了發布檢查會列「文章中段不會出現目錄」，只列不擋）。
 */
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";

export default function TocListView(props: NodeViewProps) {
  return (
    <NodeViewWrapper className="bae-placeholder" contentEditable={false}>
      <div className="bae-placeholder-head">
        <span>📑 目錄（自動生成）</span>
        <button
          type="button"
          className="bae-linkbtn bae-danger"
          onClick={props.deleteNode}
          title="刪掉目錄區塊（刪了文章中段就不會出現目錄；發布檢查會提醒，不會擋）"
        >
          刪除
        </button>
      </div>
      <p className="bae-placeholder-text">
        內容從下面的「目錄」表單來，前台照 post.toc 輸出；要改目錄文字去表單那一區。
      </p>
    </NodeViewWrapper>
  );
}
