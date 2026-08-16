"use client";

/**
 * specTable 的 React NodeView（INTERFACE-stage2 §4.4）。
 *
 * 表格預覽（title／badge／rows／tag／source 排成表格樣，粗體照渲染）＋
 * 〔編輯規格表〕展開表單面板：title、badge（可空）、rows 重複列
 * （label＋value，可加可刪可排序）、tag（可空）、source（必填提示）。
 *
 * 🔴 文章內容零鎖、零唯讀、零阻擋式警告（書亞 2026-08-16 拍板）——
 *    每一格都是文章內容，都改得動；保護靠標示＋每次存檔的版本快照。
 * value／tag 用 `**粗體**` 迷你標記編輯（admin ContentForm 既有慣例，
 * 含成對檢查提示）；打開面板時 runs 轉成 `**…**`、套用時轉回 runs——
 * attrs 形狀與 src/content/blocks/types.ts 的 specTable 逐字一致，一個欄位都不掉。
 * value／tag 裡若出現 link mark（五篇實況為零）：迷你標記表不出連結，
 * 該格內容原樣保留、不經字串轉換（§4.4 明定），欄位名與排序照常可改。
 * 整塊照樣可選取、可刪（零鎖；刪錯了版本快照還原得回來）。
 */
import { useState, type ReactNode } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import type { BlogInline } from "@/content/blocks/types";
import {
  attrsToDraft,
  draftToAttrs,
  markupUnpaired,
  type SpecTableAttrs,
  type SpecTableDraft
} from "../spec-markup";

/** 行內 runs → ReactNode（粗體照渲染；link 在規格表實況為零，僅原樣保留時顯示）。 */
function renderRuns(runs: readonly BlogInline[] | null): ReactNode {
  if (!runs) return null;
  return runs.map((run, index) => {
    const bold = run.marks?.some((mark) => mark.type === "bold");
    return bold ? <strong key={index}>{run.text}</strong> : <span key={index}>{run.text}</span>;
  });
}

/** 迷你標記的成對提示（照 admin content actions.ts 的檢查文案；只提示、不擋套用）。 */
function UnpairedHint({ text }: { text: string }) {
  if (!markupUnpaired(text)) return null;
  return (
    <p className="bae-hint bae-warn-text">
      ⚠ ** 沒有成對。要變粗體的字前後都要加兩個星號，例如 **公設比**——照樣套用得了，落單那段會照字面存。
    </p>
  );
}

/** 編輯面板（掛載即依 attrs 初始化草稿；套用時整包轉回 attrs，五個欄位一個都不掉）。 */
function SpecTablePanel({
  attrs,
  onApply,
  onClose
}: {
  attrs: SpecTableAttrs;
  onApply: (next: SpecTableAttrs) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SpecTableDraft>(() => attrsToDraft(attrs));

  const patch = (part: Partial<SpecTableDraft>) => setDraft((prev) => ({ ...prev, ...part }));
  const patchRow = (index: number, part: Partial<SpecTableDraft["rows"][number]>) =>
    setDraft((prev) => ({
      ...prev,
      rows: prev.rows.map((row, i) => (i === index ? { ...row, ...part } : row))
    }));
  const moveRow = (index: number, delta: -1 | 1) =>
    setDraft((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.rows.length) return prev;
      const rows = [...prev.rows];
      const [picked] = rows.splice(index, 1);
      rows.splice(target, 0, picked);
      return { ...prev, rows };
    });

  return (
    <div className="bae-panel" contentEditable={false}>
      <div className="bae-field">
        <label>表格標題</label>
        <input
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          placeholder="例：崇大新城　規格速覽"
        />
        <p className="bae-hint">表格最上面那一行粗體標題。</p>
      </div>

      <div className="bae-field">
        <label>右上徽章（可空）</label>
        <input
          value={draft.badge}
          onChange={(event) => patch({ badge: event.target.value })}
          placeholder="例：查證日 2026-08-15"
        />
        <p className="bae-hint">標題右邊的小徽章。清空＝不顯示。</p>
      </div>

      {draft.rows.map((row, index) => (
        <div className="bae-srcrow" key={index}>
          <div className="bae-field">
            <label>第 {index + 1} 列・欄位名</label>
            <input
              value={row.label}
              onChange={(event) => patchRow(index, { label: event.target.value })}
              placeholder="例：屋齡"
            />
            <p className="bae-hint">前台這一格不換行，建議 5 個字以內（例：屋齡、戶數、公設比）。</p>
          </div>
          {row.lockedValue ? (
            <div className="bae-field">
              <label>第 {index + 1} 列・內容（原樣保留）</label>
              <p className="bae-spec-lockedvalue">{renderRuns(row.lockedValue)}</p>
              <p className="bae-hint">
                這一列的內容帶連結，星號標記表不出連結——為了不弄丟連結資料，內容先原樣保留（要改這一格的字跟我說）；欄位名、排序、刪除照常。
              </p>
            </div>
          ) : (
            <div className="bae-field">
              <label>第 {index + 1} 列・內容</label>
              <textarea
                rows={2}
                value={row.valueText}
                onChange={(event) => patchRow(index, { valueText: event.target.value })}
                placeholder="例：22 棟 14 層樓建築，共計 1,212 戶"
              />
              <p className="bae-hint">**星號**包住的字會變粗體，例如：依條例改建的**眷村改建住宅**。</p>
              <UnpairedHint text={row.valueText} />
            </div>
          )}
          <div className="bae-row-actions">
            <button
              type="button"
              className="bae-btn-secondary"
              disabled={index === 0}
              onClick={() => moveRow(index, -1)}
              title="把這一列往上移一格"
            >
              ↑ 上移
            </button>
            <button
              type="button"
              className="bae-btn-secondary"
              disabled={index === draft.rows.length - 1}
              onClick={() => moveRow(index, 1)}
              title="把這一列往下移一格"
            >
              ↓ 下移
            </button>
            <button
              type="button"
              className="bae-btn-secondary"
              onClick={() => setDraft((prev) => ({ ...prev, rows: prev.rows.filter((_, i) => i !== index) }))}
            >
              刪除這一列
            </button>
          </div>
        </div>
      ))}

      <div className="bae-row-actions">
        <button
          type="button"
          className="bae-btn-secondary"
          onClick={() =>
            setDraft((prev) => ({
              ...prev,
              rows: [...prev.rows, { label: "", valueText: "", lockedValue: null }]
            }))
          }
        >
          ＋ 加一列
        </button>
      </div>

      {draft.lockedTag ? (
        <div className="bae-field">
          <label>一句話評語（原樣保留）</label>
          <p className="bae-spec-lockedvalue">{renderRuns(draft.lockedTag)}</p>
          <p className="bae-hint">這句評語帶連結，星號標記表不出連結——內容先原樣保留（要改跟我說）。</p>
        </div>
      ) : (
        <div className="bae-field">
          <label>一句話評語（可空）</label>
          <textarea
            rows={2}
            value={draft.tagText}
            onChange={(event) => patch({ tagText: event.target.value })}
            placeholder="例：查得到的都在上面。查不到的沒有填：**管理費、公設比一律待實地確認**"
          />
          <p className="bae-hint">表格下面那一句。**星號**包住的字會變粗體。清空＝不顯示。</p>
          <UnpairedHint text={draft.tagText} />
        </div>
      )}

      <div className="bae-field">
        <label>資料來源（必填）</label>
        <textarea
          rows={2}
          value={draft.source}
          onChange={(event) => patch({ source: event.target.value })}
          placeholder="例：資料來源：內政部不動產交易實價查詢服務網，查詢日 2026-08-14"
        />
        <p className="bae-hint">不捏造數據：查不到的欄整列拿掉。來源與查詢日期寫在這裡，前台顯示在表格最下面。</p>
        {draft.source.trim() ? null : (
          <p className="bae-hint bae-warn-text">
            ⚠ 資料來源空著——規格表每一格都是事實斷言，沒有來源的表發布出去就是沒憑據的數字。
          </p>
        )}
      </div>

      <div className="bae-row-actions bae-panel-actions">
        <button
          type="button"
          className="bae-btn"
          onClick={() => {
            onApply(draftToAttrs(draft));
            onClose();
          }}
        >
          套用
        </button>
        <button type="button" className="bae-btn-secondary" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}

export default function SpecTableView(props: NodeViewProps) {
  const { node, updateAttributes, deleteNode } = props;
  const attrs: SpecTableAttrs = {
    title: String(node.attrs.title ?? ""),
    badge: (node.attrs.badge ?? null) as string | null,
    rows: (node.attrs.rows ?? []) as SpecTableAttrs["rows"],
    tag: (node.attrs.tag ?? null) as BlogInline[] | null,
    source: String(node.attrs.source ?? "")
  };
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <NodeViewWrapper className="bae-spec" contentEditable={false}>
      <div className="bae-bar">
        <span className="bae-bar-tag">📋 社區規格表</span>
        <span className="bae-bar-sep">｜</span>
        <button type="button" className="bae-linkbtn" onClick={() => setPanelOpen((open) => !open)}>
          〔編輯規格表〕
        </button>
        <button
          type="button"
          className="bae-linkbtn bae-danger"
          onClick={deleteNode}
          title="刪掉整張規格表（版本快照隨時還原得回來）"
        >
          刪除
        </button>
      </div>
      <div className="bae-spec-body">
        <p className="bae-spec-title">
          {attrs.title || <span className="bae-muted">（尚未填表格標題——按〔編輯規格表〕填）</span>}
          {attrs.badge ? <span className="bae-badge bae-badge-info">{attrs.badge}</span> : null}
        </p>
        <table className="bae-spec-table">
          <tbody>
            {attrs.rows.map((row, index) => (
              <tr key={index}>
                <th>{row.label}</th>
                <td>{renderRuns(row.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {attrs.tag ? <p className="bae-spec-tag">{renderRuns(attrs.tag)}</p> : null}
        <p className="bae-hint">
          {attrs.source || "（尚未填資料來源——規格表每一格都是事實斷言，查不到的欄整列拿掉，不推估）"}
        </p>
      </div>
      {panelOpen ? (
        <SpecTablePanel
          attrs={attrs}
          onApply={(next) => updateAttributes(next)}
          onClose={() => setPanelOpen(false)}
        />
      ) : null}
    </NodeViewWrapper>
  );
}
