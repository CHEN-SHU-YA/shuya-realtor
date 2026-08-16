/**
 * 部落格後台共用型別（B 計畫第二段）。
 *
 * 🔴 為什麼不放 actions.ts："use server" 檔案只能匯出 async function
 *（01-現有後台模式.md 踩過的坑，tsc 擋不住、跑起來才炸），
 * 所以型別與純函式一律放這個 lib 目錄。
 * 各型別形狀照 INTERFACE-stage2.md 第三節，改這裡＝改契約，要先跟主控端說。
 */

/**
 * ctaLead 禁用詞（照 src/content/posts/types.ts 的 ctaLead 註解清單）。
 * 放這裡（不放 publish-checks.ts）是因為 publish-checks 用了 node:fs、
 * 只能 Server 端 import；表單的即時標示（Client）也要用這份清單。
 */
export const CTA_BANNED_WORDS: readonly string[] = [
  "立即",
  "馬上",
  "限時",
  "免費估價中",
  "名額有限",
  "錯過不再",
  "專業團隊為您服務",
  "保證",
  "穩賺",
  "包在我身上"
];

/** 發布檢查清單的一項（只列出、不阻擋）。 */
export type BlogChecklistItem = {
  /** 穩定識別（"no-cover"…），UI 與測試用。 */
  key: string;
  /** 顯示強度（兩種都不擋發布）。 */
  level: "warn" | "info";
  /** 是什麼（人話）。 */
  message: string;
  /** 🔴 具體後果：發布後會發生什麼（每項必填，文案照契約第六節逐字）。 */
  consequence: string;
};

/** lawQuote 與參照庫的比對結果（存檔時背景跑，只標示）。 */
export type LawCheckItem = {
  pcode: string;
  flno: string;
  /** 參照庫的法規名；查無此條時 null。 */
  lawName: string | null;
  /**
   * match＝一致／diff＝不同／missing＝參照庫沒有／
   * skipped＝沒有 moj 型出處（url 型不做逐字比對）。
   */
  state: "match" | "diff" | "missing" | "skipped";
  /** 參照庫逐字全文（「還原成參照庫版本」按鈕用）；missing/skipped 時 null。 */
  refText: string | null;
  /** 參照庫的逐字核對日。 */
  verifiedDate: string | null;
  /** 比對不中的段落原文（顯示差異用；match 時空陣列）。 */
  diffParagraphs: readonly string[];
};

/** saveDraftAction 的回傳。 */
export type SaveDraftState =
  | {
      ok: true;
      /** 🔴 新的樂觀鎖 token，前端立刻換掉手上那顆。 */
      updatedAt: string;
      /** 「已儲存 16:42」用（formatTaipei 系列）。 */
      savedAtLabel: string;
      /** lawQuote 背景比對結果。 */
      lawChecks: readonly LawCheckItem[];
      /** 軟提示（存成功但順帶提醒）。 */
      hints: readonly string[];
    }
  | {
      ok: false;
      reason: "conflict" | "not-found" | "invalid" | "db";
      error: string;
      /**
       * invalid 時的技術細節（normalizeEditorDoc 的原始 problems）。
       * 🔴 不拼進 error 主訊息——error 只講人話，這串收進 UI 可展開的
       * 「技術細節」區塊（主控端 2026-08-17 裁決的錯誤文案去黑話）。
       */
      details?: readonly string[];
    };

/** publishAction 的回傳。 */
export type PublishState =
  | {
      ok: true;
      updatedAt: string;
      publishedAt: string;
      /** 這次發布有沒有觸發自動 301。 */
      slugChanged: boolean;
      /** 有的話：舊路徑（顯示「舊網址已自動轉到新網址」）。 */
      redirectFrom: string | null;
      /** 照樣回清單，畫面留紀錄。 */
      checklist: readonly BlogChecklistItem[];
    }
  | { ok: false; reason: "needs-confirm"; checklist: readonly BlogChecklistItem[] }
  | { ok: false; reason: "conflict" | "not-found" | "db"; error: string };

/** restoreAction 的回傳。 */
export type RestoreState =
  | { ok: true; updatedAt: string; restoredTo: { seq: number; savedAtLabel: string } }
  | { ok: false; reason: "conflict" | "not-found" | "db"; error: string };

/** importIfEmptyAction 的回傳。 */
export type ImportState =
  | { ok: true; imported: readonly number[] }
  | { ok: false; reason: "not-empty" | "no-files" | "db" | "invalid"; error: string };
