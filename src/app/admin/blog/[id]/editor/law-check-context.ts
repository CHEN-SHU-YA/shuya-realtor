"use client";

/**
 * ⚠️ 整合備註（給主控端）：這個 `.ts` 檔與同目錄的 `law-check-context.tsx` 內容相同。
 * 路一誤入路二地界先建了 `.ts`，路二隨後落地 `.tsx`；TypeScript 解析
 * `./law-check-context` 時 `.ts` 優先，所以兩檔以同一份實作互為鏡射，
 * 保證不管哪一支被解析到，行為都一樣（runtime 只會有一支進 bundle，
 * 不會出現兩個 context 實例）。**收整時請刪掉其中一個檔**（建議留 `.tsx`、
 * 刪這支 `.ts`——兩個視窗刪檔都被權限擋下，只能先鏡射）。
 *
 * ── 以下內容與 law-check-context.tsx 逐字相同 ──
 *
 * lawQuote 與參照庫比對結果的傳遞管道（INTERFACE-stage2 定案 #8 的首選案）。
 *
 * BlogEditForm 把 saveDraftAction 回傳的 lawChecks 放 state，用這個 Context 包住
 * 編輯器；lawQuote 的 React NodeView（走 portal，掛在同一棵 React 樹下）從
 * context 讀自己 (pcode, flno) 的比對狀態，掛「⚠ 與參照庫不同」徽章。
 *
 * 🔴 比對狀態不寫進節點 attrs（會弄髒文件、產生假的未存檔狀態）；
 * 🔴 任何比對結果都不阻擋任何編輯——標示不是鎖。
 *
 * 型別以路一的 `lib/types.ts` 為唯一定義處（契約 §3.1），這裡只取別名——
 * BlogEditForm 拿 saveDraftAction 回的 `LawCheckItem[]` 直接塞進來就對。
 */
import { createContext, useContext } from "react";
import type { BlogLawRef } from "@/lib/blog-db";
import type { LawCheckItem } from "../../lib/types";

/** lawQuote 與參照庫的比對結果（＝契約 §3.1 的 LawCheckItem，別名方便編輯器內引用）。 */
export type EditorLawCheckItem = LawCheckItem;

export type LawCheckContextValue = {
  /** 文章編號（「以這版更新參照庫」的 note 要寫「文章 {id}」）。 */
  postId: number;
  /** 最近一次存檔的比對結果（還沒存過檔＝空陣列＝不掛任何徽章）。 */
  checks: readonly EditorLawCheckItem[];
  /**
   * 「以這版更新參照庫」按下時呼叫——BlogEditForm 直接把 updateLawRefAction
   * 傳進來（回傳形狀照 actions.ts 的實際簽章）。沒接（undefined）時不顯示這顆鈕。
   */
  onUpdateLawRef?: (ref: BlogLawRef) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export const LawCheckContext = createContext<LawCheckContextValue>({
  postId: 0,
  checks: []
});

/** NodeView 端取用：拿整包 context。 */
export function useLawChecks(): LawCheckContextValue {
  return useContext(LawCheckContext);
}

/** 找一條 (pcode, flno) 的比對結果；沒有＝這條還沒比對過（不掛徽章）。 */
export function findLawCheck(
  checks: readonly EditorLawCheckItem[],
  pcode: string,
  flno: string
): EditorLawCheckItem | null {
  return checks.find((check) => check.pcode === pcode && check.flno === flno) ?? null;
}
