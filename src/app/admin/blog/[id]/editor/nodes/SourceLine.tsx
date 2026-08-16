"use client";

/**
 * sourceLine 的 React NodeView（INTERFACE-stage2 §4.4）。
 *
 * 一張單列卡：「🔗 出處列（前台顯示為小字）｜{label}{各 source，可點}｜〔編輯〕」。
 * atom 節點——整體不可直接打字；〔編輯〕開與 lawQuote 同一個出處面板，
 * 多一格 label 欄（型別是必填字串，預設「原文連結：」）。
 * 可選取、可整塊刪（零鎖）。
 */
import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { BlogLawSourceRef } from "@/content/blocks/types";
import SourceRefLinks from "../SourceRefLinks";
import SourcesPanel from "../SourcesPanel";

export default function SourceLineView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
  const label = String(node.attrs.label ?? "");
  const sources = (node.attrs.sources ?? []) as BlogLawSourceRef[];
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <NodeViewWrapper className="bae-srcline">
      <div className="bae-bar" contentEditable={false}>
        <span className="bae-bar-tag">🔗 出處列（前台顯示為小字）</span>
        <span className="bae-bar-sep">｜</span>
        <span>
          {label}
          <SourceRefLinks sources={sources} />
        </span>
        <span className="bae-bar-sep">｜</span>
        <button type="button" className="bae-linkbtn" onClick={() => setPanelOpen((open) => !open)}>
          〔編輯〕
        </button>
        <button type="button" className="bae-linkbtn bae-danger" onClick={deleteNode} title="刪掉整條出處列（版本快照隨時還原得回來）">
          刪除
        </button>
      </div>
      {panelOpen ? (
        <SourcesPanel
          label={label}
          sources={sources}
          labelRequired
          labelHint="出處列的開頭字（前台小字那一行的開頭；1005 的實例是「原文連結：」）。"
          onApply={(value) => updateAttributes({ label: value.label ?? "", sources: value.sources })}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
