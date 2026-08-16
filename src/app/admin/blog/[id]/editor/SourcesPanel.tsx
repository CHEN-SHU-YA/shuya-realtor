"use client";

/**
 * 出處面板（lawQuote／sourceLine 共用，INTERFACE-stage2 §4.4 尾段）。
 *
 * 每列先選型：
 * · 法規條文（moj）＝ pcode（常用法規建議＋自由輸入）＋ flno（字串！有 28-2 這種條號）
 *   ＋顯示文字；欄下常駐回顯「目前指向：{法規} 第 {flno} 條」＋「開新視窗核對」
 *   （網址永遠用 mojLawUrl 現組，不可手打——護欄第 4 條）。
 * · 其他官方來源（url）＝顯示文字＋網址（限 https）。
 *
 * 整串網址貼進 pcode 欄或網址欄都會嘗試 parseMojUrl 自動拆回 moj 型；
 * 拆不出→掛「無法辨識這個連結指向哪一條」標示（🔴 不擋套用，03 文件第三節）。
 */
import { useState } from "react";
import { mojLawUrl, type BlogLawSourceRef } from "@/content/blocks/types";
import { COMMON_LAWS, commonLawName, parseMojUrl } from "../../lib/law";

/** 面板內部的可編輯列（moj 與 url 的欄位攤平，切型別時不掉字）。 */
type EditRow = {
  kind: "moj" | "url";
  text: string;
  pcode: string;
  flno: string;
  href: string;
};

function toEditRows(sources: readonly BlogLawSourceRef[]): EditRow[] {
  return sources.map((source) =>
    source.kind === "moj"
      ? { kind: "moj", text: source.text, pcode: source.pcode, flno: source.flno, href: "" }
      : { kind: "url", text: source.text, pcode: "", flno: "", href: source.href }
  );
}

function toSources(rows: readonly EditRow[]): BlogLawSourceRef[] {
  return rows
    .filter((row) => (row.kind === "moj" ? row.pcode.trim() || row.flno.trim() || row.text.trim() : row.href.trim() || row.text.trim()))
    .map((row) =>
      row.kind === "moj"
        ? { kind: "moj", text: row.text, pcode: row.pcode.trim(), flno: row.flno.trim() }
        : { kind: "url", text: row.text, href: row.href.trim() }
    );
}

export default function SourcesPanel({
  label,
  sources,
  labelRequired,
  labelHint,
  onApply,
  onClose
}: {
  /** 出處列開頭字。lawQuote 可空（null＝不輸出出處列）；sourceLine 必填。 */
  label: string | null;
  sources: readonly BlogLawSourceRef[];
  /** sourceLine 傳 true：label 是必填字串（空了掛提示，照樣可套用）。 */
  labelRequired: boolean;
  labelHint: string;
  onApply: (value: { label: string | null; sources: BlogLawSourceRef[] }) => void;
  onClose: () => void;
}) {
  const [labelDraft, setLabelDraft] = useState(label ?? "");
  const [rows, setRows] = useState<EditRow[]>(() => toEditRows(sources));

  const patchRow = (index: number, patch: Partial<EditRow>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  /** 貼整串網址進 pcode 欄或網址欄：是單條頁就自動拆回 moj 型。 */
  const tryAutoParse = (index: number, raw: string): boolean => {
    const parsed = parseMojUrl(raw);
    if (!parsed) return false;
    patchRow(index, { kind: "moj", pcode: parsed.pcode, flno: parsed.flno, href: "" });
    return true;
  };

  const apply = () => {
    const trimmed = labelDraft.trim();
    onApply({
      // lawQuote：清空＝null＝前台不輸出出處列；sourceLine：label 型別是必填字串，照打的存
      label: labelRequired ? labelDraft : trimmed ? labelDraft : null,
      sources: toSources(rows)
    });
    onClose();
  };

  return (
    <div className="bae-panel" contentEditable={false}>
      <div className="bae-field">
        <label>出處列開頭字</label>
        <input
          value={labelDraft}
          onChange={(event) => setLabelDraft(event.target.value)}
          placeholder={labelRequired ? "原文連結：" : "例：條文出處：全國法規資料庫－（清空＝不顯示出處列）"}
        />
        <p className="bae-hint">{labelHint}</p>
        {labelRequired && !labelDraft.trim() ? (
          <p className="bae-hint bae-warn-text">⚠ 出處列的開頭字空著——前台這一列會直接以連結開頭。</p>
        ) : null}
      </div>

      {rows.map((row, index) => {
        const mojParsedFromHref = row.kind === "url" && row.href ? parseMojUrl(row.href) : null;
        const lawName = row.kind === "moj" ? commonLawName(row.pcode) : null;
        return (
          <div className="bae-srcrow" key={index}>
            <div className="bae-field">
              <label>第 {index + 1} 條出處・型別</label>
              <select
                value={row.kind}
                onChange={(event) => patchRow(index, { kind: event.target.value as "moj" | "url" })}
              >
                <option value="moj">法規條文（全國法規資料庫，網址由系統組）</option>
                <option value="url">其他官方來源（自填網址，限 https）</option>
              </select>
            </div>

            <div className="bae-field">
              <label>顯示文字</label>
              <input
                value={row.text}
                onChange={(event) => patchRow(index, { text: event.target.value })}
                placeholder={row.kind === "moj" ? "例：民法第 787 條" : "例：財政部《地方稅節稅手冊》（稅務入口網）"}
              />
              <p className="bae-hint">出處列上讀者看到的字，照原文保留——它是防抄襲與可讀性的一部分，不由程式生成。</p>
            </div>

            {row.kind === "moj" ? (
              <>
                <div className="bae-field-pair">
                  <div className="bae-field">
                    <label>法規代碼 pcode</label>
                    <input
                      list="bae-common-laws"
                      value={row.pcode}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (tryAutoParse(index, raw)) return;
                        patchRow(index, { pcode: raw.trim() });
                      }}
                      placeholder="例：B0000001（民法）——也可以直接貼整串條文網址"
                    />
                  </div>
                  <div className="bae-field">
                    <label>條號 flno</label>
                    <input
                      value={row.flno}
                      onChange={(event) => patchRow(index, { flno: event.target.value.trim() })}
                      placeholder="例：787 或 28-2"
                    />
                  </div>
                </div>
                {row.pcode && row.flno ? (
                  <p className="bae-hint">
                    目前指向：全國法規資料庫－{lawName ?? `代碼 ${row.pcode}`} 第 {row.flno} 條｜{" "}
                    <a href={mojLawUrl(row.pcode, row.flno)} target="_blank" rel="noopener">
                      開新視窗核對
                    </a>
                  </p>
                ) : (
                  <p className="bae-hint bae-warn-text">⚠ pcode 與條號都填了，才能組出條文連結。</p>
                )}
              </>
            ) : (
              <div className="bae-field">
                <label>網址（https:// 開頭）</label>
                <input
                  value={row.href}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (tryAutoParse(index, raw)) return;
                    patchRow(index, { href: raw.trim() });
                  }}
                  placeholder="https://…"
                />
                {mojParsedFromHref ? null : row.href && !row.href.startsWith("https://") ? (
                  <p className="bae-hint bae-warn-text">⚠ 出處網址限 https:// 開頭（官方來源都有 https）。</p>
                ) : row.href && row.href.includes("law.moj.gov.tw") ? (
                  <p className="bae-hint bae-warn-text">
                    ⚠ 無法辨識這個連結指向哪一條——單條條文頁請貼 LawSingle.aspx 的網址，會自動拆成「選法規＋填條號」。
                  </p>
                ) : null}
              </div>
            )}

            <div className="bae-row-actions">
              <button
                type="button"
                className="bae-btn-secondary"
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
              >
                刪除這條出處
              </button>
            </div>
          </div>
        );
      })}

      {/* 常用法規建議清單（自由輸入＋下拉建議，datalist 兩者兼得） */}
      <datalist id="bae-common-laws">
        {COMMON_LAWS.map((law) => (
          <option key={law.pcode} value={law.pcode}>
            {law.name}
          </option>
        ))}
      </datalist>

      <div className="bae-row-actions">
        <button
          type="button"
          className="bae-btn-secondary"
          onClick={() => setRows((prev) => [...prev, { kind: "moj", text: "", pcode: "", flno: "", href: "" }])}
        >
          ＋ 加一條出處
        </button>
      </div>

      <div className="bae-row-actions bae-panel-actions">
        <button type="button" className="bae-btn" onClick={apply}>
          套用
        </button>
        <button type="button" className="bae-btn-secondary" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}
