/**
 * 規格表編輯面板的「**粗體**」迷你標記轉換（純函式，INTERFACE-stage2 §4.4）。
 *
 * admin 既有慣例（src/app/admin/content/ContentForm.tsx 的首頁文案表單就在用）：
 * 用 `**兩個星號**` 包住要變粗體的字。打開面板時 runs 轉成 `**…**` 字串，
 * 按套用時再轉回 runs——存進文件的永遠是契約形狀
 * （src/content/blocks/types.ts 的 specTable attrs，一個欄位都不掉）。
 *
 * 🔴 迷你標記表不出連結（link mark）。value／tag 裡若出現連結（五篇實況為零），
 *    該格不經過字串轉換、原樣保留（§4.4 明定）——lockedValue／lockedTag 就是
 *    「原樣保留」的通道，套用時照舊塞回去，連結資料不會弄丟。
 * 🔴 星號沒成對時只掛提示、不擋套用（markupUnpaired 給提示用；
 *    落單那段照 split 的結果存，預覽表立刻看得到效果，要改隨時改得回來）。
 */
import type { BlogInline, BlogSpecRow, BlogSpecTableNode } from "@/content/blocks/types";

/** specTable 的 attrs 形狀（唯一定義處是 types.ts，這裡只取別名）。 */
export type SpecTableAttrs = BlogSpecTableNode["attrs"];

/** 面板裡一列的草稿：label 照打、value 用迷你標記字串（帶連結的列走 lockedValue）。 */
export type SpecDraftRow = {
  label: string;
  /** 迷你標記字串（沒帶連結的列用這格編輯）。 */
  valueText: string;
  /** 帶連結 mark 的列：原樣保留的 runs（不經字串轉換，套用時照舊塞回）。 */
  lockedValue: BlogInline[] | null;
};

/** 整張規格表的面板草稿（attrs ⇄ 草稿互轉，round-trip 不掉欄位）。 */
export type SpecTableDraft = {
  title: string;
  /** badge 可空：空字串＝null（不顯示徽章）。 */
  badge: string;
  rows: SpecDraftRow[];
  /** tag 可空：空字串＝null（不顯示評語）。 */
  tagText: string;
  /** tag 帶連結 mark 時原樣保留（同 lockedValue 的規則）。 */
  lockedTag: BlogInline[] | null;
  source: string;
};

/** runs → 迷你標記字串：帶粗體 mark 的字包成 `**…**`。 */
export function runsToMarkup(runs: readonly BlogInline[] | null): string {
  if (!runs) return "";
  return runs
    .map((run) => (run.marks?.some((mark) => mark.type === "bold") ? `**${run.text}**` : run.text))
    .join("");
}

/** runs 裡有沒有連結 mark（有的話該格不走字串轉換，原樣保留）。 */
export function runsHaveLink(runs: readonly BlogInline[] | null): boolean {
  return Boolean(runs?.some((run) => run.marks?.some((mark) => mark.type === "link")));
}

/**
 * 迷你標記字串 → runs：`**` 之間的字掛粗體 mark。
 * 空字串回空陣列（ProseMirror 慣例：文字節點不可為空字串）。
 */
export function markupToRuns(text: string): BlogInline[] {
  const runs: BlogInline[] = [];
  text.split("**").forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) {
      runs.push({ type: "text", text: part, marks: [{ type: "bold" }] });
    } else {
      runs.push({ type: "text", text: part });
    }
  });
  return runs;
}

/** `**` 有沒有落單（照 admin content actions.ts 的成對檢查；只提示、不擋套用）。 */
export function markupUnpaired(text: string): boolean {
  return (text.match(/\*\*/g) || []).length % 2 !== 0;
}

/** 一列 attrs → 面板草稿列。 */
export function rowToDraft(row: BlogSpecRow): SpecDraftRow {
  return runsHaveLink(row.value)
    ? { label: row.label, valueText: "", lockedValue: row.value }
    : { label: row.label, valueText: runsToMarkup(row.value), lockedValue: null };
}

/** 面板草稿列 → 一列 attrs。 */
export function draftToRow(draft: SpecDraftRow): BlogSpecRow {
  return { label: draft.label, value: draft.lockedValue ?? markupToRuns(draft.valueText) };
}

/** 整包 attrs → 面板草稿（打開面板時跑一次）。 */
export function attrsToDraft(attrs: SpecTableAttrs): SpecTableDraft {
  const tagLocked = runsHaveLink(attrs.tag);
  return {
    title: attrs.title,
    badge: attrs.badge ?? "",
    rows: attrs.rows.map(rowToDraft),
    tagText: tagLocked ? "" : runsToMarkup(attrs.tag),
    lockedTag: tagLocked ? attrs.tag : null,
    source: attrs.source
  };
}

/** 面板草稿 → 整包 attrs（按套用時跑一次；五個欄位一個都不掉）。 */
export function draftToAttrs(draft: SpecTableDraft): SpecTableAttrs {
  return {
    title: draft.title,
    badge: draft.badge ? draft.badge : null,
    rows: draft.rows.map(draftToRow),
    tag: draft.lockedTag ?? (draft.tagText ? markupToRuns(draft.tagText) : null),
    source: draft.source
  };
}
