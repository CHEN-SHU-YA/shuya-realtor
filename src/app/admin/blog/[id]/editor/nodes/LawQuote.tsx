"use client";

/**
 * lawQuote 的 React NodeView（INTERFACE-stage2 §4.4／§4.7）。
 *
 * 上緣一條**常駐標示列**（contentEditable={false}，淺色底）：
 * 「⚖ 這一段是法條逐字｜出處：{各 source，可點、開新視窗核對}｜〔編輯出處〕」。
 * 標示列下面是 <NodeViewContent>（blockquote 樣式）——
 * 🔴 內容照樣是一般段落編輯，零鎖、零警告、零唯讀（書亞 2026-08-16 拍板）。
 * IME 走 ProseMirror 原生 contentDOM 路徑，本檔不攔任何鍵盤事件。
 *
 * 存檔後與參照庫比對有差異時，標示列尾端掛「⚠ 與參照庫不同」徽章；
 * 點開差異小窗：對不上的段落標色＋參照庫全文，下面兩顆鈕（方案書第七節 #4 拍板）：
 * 「還原成參照庫版本」＝把 refText 逐行寫回區塊段落（純編輯器命令，改完是
 * 未存檔狀態，存不存書亞自己決定）；「以這版更新參照庫」＝條文可能真的修法了
 * ——只給還原鈕會養出狼來了效應。
 */
import { useState } from "react";
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { mojLawUrl, type BlogLawSourceRef } from "@/content/blocks/types";
import type { BlogLawRef } from "@/lib/blog-db";
import { taipeiTodayIso } from "../../../lib/format";
import { commonLawName } from "../../../lib/law";
import { stripItemPrefix } from "../../../lib/law-check";
import { findLawCheck, useLawChecks, type EditorLawCheckItem } from "../law-check-context";
import SourceRefLinks from "../SourceRefLinks";
import SourcesPanel from "../SourcesPanel";

type MojSource = Extract<BlogLawSourceRef, { kind: "moj" }>;

export default function LawQuoteView(props: NodeViewProps) {
  const { node, editor, getPos, updateAttributes } = props;
  const label = node.attrs.label as string | null;
  const sources = (node.attrs.sources ?? []) as BlogLawSourceRef[];
  const { postId, checks, onUpdateLawRef } = useLawChecks();

  const [panelOpen, setPanelOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [refMessage, setRefMessage] = useState<string | null>(null);

  /** 這一塊的 moj 型出處，各自對到最近一次存檔的比對結果。 */
  const mojSources = sources.filter((source): source is MojSource => source.kind === "moj");
  const matched = mojSources
    .map((source) => ({ source, check: findLawCheck(checks, source.pcode, source.flno) }))
    .filter((entry): entry is { source: MojSource; check: EditorLawCheckItem } => entry.check !== null);
  const diffs = matched.filter((entry) => entry.check.state === "diff");
  const missings = matched.filter((entry) => entry.check.state === "missing");

  /** 「還原成參照庫版本」：refText 逐行寫回段落（未存檔狀態，他自己決定存不存）。 */
  const restoreFromRef = (check: EditorLawCheckItem) => {
    if (!check.refText) return;
    const pos = getPos();
    if (typeof pos !== "number") return;
    const lines = check.refText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!lines.length) return;
    editor
      .chain()
      .focus()
      .insertContentAt(
        { from: pos + 1, to: pos + 1 + node.content.size },
        lines.map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] }))
      )
      .run();
    setDiffOpen(false);
  };

  /** 「以這版更新參照庫」：把這一塊目前的逐字內容組成 BlogLawRef 送出。 */
  const updateRef = async (source: MojSource, check: EditorLawCheckItem | null) => {
    if (!onUpdateLawRef) return;
    const paragraphs: string[] = [];
    node.content.forEach((child) => {
      const text = stripItemPrefix(child.textContent);
      if (text) paragraphs.push(text);
    });
    const ref: BlogLawRef = {
      pcode: source.pcode,
      flno: source.flno,
      lawName: check?.lawName ?? commonLawName(source.pcode) ?? source.text,
      articleText: paragraphs.join("\n"),
      verifiedDate: taipeiTodayIso(),
      sourceUrl: mojLawUrl(source.pcode, source.flno),
      note: `後台「以這版更新參照庫」（文章 ${postId}）`
    };
    const result = await onUpdateLawRef(ref);
    setRefMessage(
      result.ok
        ? `✅ 參照庫已更新成這一版（${source.text || `${source.pcode} 第 ${source.flno} 條`}）。下次存檔會用新基準比對。`
        : `⚠️ ${result.error ?? "參照庫更新失敗，等幾秒再按一次。"}`
    );
  };

  return (
    <NodeViewWrapper className="bae-lawquote">
      {/* 常駐標示列——標示不是鎖，只讓他知道自己在動什麼 */}
      <div className="bae-bar" contentEditable={false}>
        <span className="bae-bar-tag">⚖ 這一段是法條逐字</span>
        <span className="bae-bar-sep">｜</span>
        <span>
          出處：<SourceRefLinks sources={sources} />
        </span>
        <span className="bae-bar-sep">｜</span>
        <button type="button" className="bae-linkbtn" onClick={() => setPanelOpen((open) => !open)}>
          〔編輯出處〕
        </button>
        {diffs.length > 0 ? (
          <button
            type="button"
            className="bae-badge bae-badge-warn"
            onClick={() => setDiffOpen((open) => !open)}
            title="最近一次存檔時，這段引文與參照庫收錄的逐字不同——點開看差在哪"
          >
            ⚠ 與參照庫不同
          </button>
        ) : null}
        {missings.length > 0 ? (
          <span className="bae-badge bae-badge-info" title="參照庫沒有收錄這條，引文沒有逐字比對基準">
            參照庫沒有這條
          </span>
        ) : null}
      </div>

      {panelOpen ? (
        <SourcesPanel
          label={label}
          sources={sources}
          labelRequired={false}
          labelHint="出處列的開頭字（例：「條文出處：全國法規資料庫－」）。清空＝這一塊不輸出出處列（1002 的作法）。"
          onApply={(value) => updateAttributes(value)}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}

      {diffOpen && diffs.length > 0 ? (
        <div className="bae-diff" contentEditable={false}>
          {diffs.map(({ source, check }) => (
            <div key={`${check.pcode}-${check.flno}`} className="bae-diff-item">
              <p className="bae-diff-title">
                「{check.lawName ?? commonLawName(check.pcode) ?? check.pcode} 第 {check.flno} 條」
                的引文與參照庫不同——可能是你改過，也可能是修法了、參照庫舊了（逐字核對日：
                {check.verifiedDate ?? "未記錄"}）。系統不會自動改。
              </p>
              {check.diffParagraphs.length > 0 ? (
                <>
                  <p className="bae-hint">引文裡對不上參照庫的段落：</p>
                  {check.diffParagraphs.map((paragraph, index) => (
                    <p key={index} className="bae-diff-p">
                      {paragraph}
                    </p>
                  ))}
                </>
              ) : null}
              {check.refText ? (
                <>
                  <p className="bae-hint">參照庫收錄的逐字全文：</p>
                  <pre className="bae-diff-ref">{check.refText}</pre>
                </>
              ) : null}
              <div className="bae-row-actions">
                {check.refText ? (
                  <button type="button" className="bae-btn-secondary" onClick={() => restoreFromRef(check)}>
                    還原成參照庫版本
                  </button>
                ) : null}
                {onUpdateLawRef ? (
                  <button type="button" className="bae-btn-secondary" onClick={() => void updateRef(source, check)}>
                    以這版更新參照庫
                  </button>
                ) : null}
              </div>
              {check.refText ? (
                <p className="bae-hint">
                  「第 N 項：」這類前綴是文章自己的格式，參照庫存的是條文逐字——按「還原成參照庫版本」之後，前綴要自己補回去。
                </p>
              ) : null}
            </div>
          ))}
          {refMessage ? <p className="bae-hint">{refMessage}</p> : null}
        </div>
      ) : null}

      {/* 🔴 引文內容：一般段落編輯，交還 ProseMirror 管——零鎖零警告 */}
      <NodeViewContent className="bae-lawquote-content" />
    </NodeViewWrapper>
  );
}
