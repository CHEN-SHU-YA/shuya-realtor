"use server";

/**
 * 部落格後台的五支 Server Action（B 計畫第二段）。
 *
 * ⚠️ 檢查不通過一律 **return 訊息，不 throw**（admin/content/actions.ts 的既有總則）。
 * throw 出去畫面只會顯示「Application error」加一串亂碼 digest，
 * 使用者看不到自己哪裡出問題——擋下來卻不告訴人原因，等於沒擋。
 *
 * 🔴 第二段不呼叫任何 revalidatePath：發布只寫 published_snapshot，
 *    前台還在讀 src/content/posts/*.tsx，revalidate 沒有對象。
 *    第三段接上發布流程時才加（文章頁＋列表＋分類頁＋sitemap，方案書第六節）。
 *    ——看到這裡覺得「漏了 revalidate」的人：沒有漏，是刻意的。
 *
 * 🔴 資料同步規矩（INTERFACE-stage2.md 第九節，兩處同文意）：
 *    1. 匯入五篇（--execute）在第二段做——前台還在讀 .tsx，匯入零影響。
 *    2. 凍稿窗口生效中：.tsx 不會再改，匯入後**資料庫是唯一會動的版本**；
 *       書亞試用期在後台改的東西**是真的、要保留**，不是丟棄式試玩。
 *    3. 第三段切換前不重匯。唯一例外：公告欄說有人動了 .tsx——那時重匯會蓋掉
 *       後台的編輯（雖有 history 留底），必須先警告、由書亞決定。
 *       importIfEmptyAction 從結構上執行這條：非空庫一律拒絕。
 *
 * 🔴 內容層的檢查（字數、格式、法條比對）**永遠只是提示**，不影響存檔成功與否
 *    ——文章內容零鎖零阻擋（書亞 2026-08-16 拍板）。護欄審 AI，不審書亞。
 */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import type { JSONContent } from "@tiptap/core";
import type { BlogDocJson, BlogLawQuoteNode } from "@/content/blocks/types";
import {
  countPosts,
  getHistoryEntry,
  getLawRef,
  getPost,
  importPost,
  savePostDraft,
  publishPost,
  upsertLawRef,
  type BlogLawRef,
  type BlogPostData
} from "@/lib/blog-db";
import { hasDatabase } from "@/lib/db";
import { formatTaipei, formatTaipeiTime } from "./lib/format";
import { collectLawQuotes, compareQuoteToRefs } from "./lib/law-check";
import { BLOCK_TYPES, normalizeEditorDoc } from "./lib/normalize";
import { runPublishChecks } from "./lib/publish-checks";
import type {
  ImportState,
  LawCheckItem,
  PublishState,
  RestoreState,
  SaveDraftState
} from "./lib/types";

/** 連線層錯誤的統一人話（照 content/actions.ts 的口吻）。 */
const DB_HUMAN_ERROR =
  "可能是 Neon 剛從休眠醒來，等幾秒再按一次；一直失敗就跟我說。";

/** 樂觀鎖衝突的統一人話（01 文件點名的互蓋風險，不覆蓋、明白講）。 */
const CONFLICT_HUMAN_ERROR =
  "這篇在別的視窗被改過——重新整理看最新版，或先把你這版複製出來。這裡沒有把你的版本存進去。";

/**
 * 一篇正文的 lawQuote 逐塊跟參照庫比對（存檔背景跑；只標示不擋）。
 * ⚠️ blog-db 的 getLawRef 連線失敗會吞掉錯誤回 null（後台讀取的既有設計），
 *    所以這裡分不出「查無此條」與「連不上」——沒接資料庫時明確回報，
 *    其餘一律當 missing 標示（info 級，假警報成本低）。
 */
async function buildLawChecks(doc: BlogDocJson): Promise<readonly LawCheckItem[]> {
  const checks: LawCheckItem[] = [];
  for (const quote of collectLawQuotes(doc)) {
    const mojSources = quote.attrs.sources.filter(
      (source): source is Extract<BlogLawQuoteNode["attrs"]["sources"][number], { kind: "moj" }> =>
        source.kind === "moj"
    );
    if (mojSources.length === 0) {
      // url 型出處不做逐字比對（比對基準只有全國法規資料庫的條文）
      continue;
    }
    const refs = await Promise.all(
      mojSources.map(async (source) => ({
        source,
        ref: await getLawRef(source.pcode, source.flno)
      }))
    );
    const foundTexts = refs.filter((r) => r.ref !== null).map((r) => r.ref!.articleText);
    for (const { source, ref } of refs) {
      if (ref === null) {
        checks.push({
          pcode: source.pcode,
          flno: source.flno,
          lawName: null,
          state: "missing",
          refText: null,
          verifiedDate: null,
          diffParagraphs: []
        });
        continue;
      }
      // 比對規則：多個 moj 出處取聯集（同一塊引文可能引兩條，各段落只要在任一條找得到就算中）
      const result = compareQuoteToRefs(quote, foundTexts);
      checks.push({
        pcode: source.pcode,
        flno: source.flno,
        lawName: ref.lawName,
        state: result.state,
        refText: ref.articleText,
        verifiedDate: ref.verifiedDate,
        diffParagraphs: result.diffParagraphs
      });
    }
  }
  return checks;
}

/* ───────────────────────────────────────────────
   3.2 存檔＝存草稿
   ─────────────────────────────────────────────── */

export async function saveDraftAction(input: {
  /** 完整一包：metadata 表單值＋normalizeEditorDoc 後的 blocks。 */
  data: BlogPostData;
  /** 樂觀鎖 token（getPost().updatedAt 原樣帶回，不經 new Date() 一來一回）。 */
  expectedUpdatedAt: string;
  /** 版本備註（手動存檔不填；還原與發布前自動存檔照契約 §3.7 慣例填）。 */
  note?: string;
}): Promise<SaveDraftState> {
  if (!hasDatabase) {
    return { ok: false, reason: "db", error: "還沒接資料庫，改了存不進去。線上那份不受影響。" };
  }

  // 進資料前先驗形狀（防禦性重跑；前端已跑過一次）。
  // 過不了＝程式 bug 不是書亞的錯——schema 層本該擋掉不合規的內容。
  const normalized = normalizeEditorDoc(input.data.blocks as JSONContent);
  if (!normalized.ok) {
    return {
      ok: false,
      reason: "invalid",
      error:
        "編輯器存出來的格式有問題，這是程式的錯、不是你的操作——你的內容沒有遺失，" +
        "重新整理後再試一次；持續發生就把這個畫面（含展開的技術細節）截圖給工程。",
      // 🔴 原始 problems 不拼進主訊息——UI 收進可展開的「技術細節」區塊
      details: normalized.problems
    };
  }

  // 🔴 id 是唯一的凍結欄位（方案書第八節的網址規則），DAL 的 update 清單不含它。
  //    發布日照 00 方案書第三節①「可改＋標示」：表單那格可編輯、欄下常駐標示後果，
  //    這裡把表單值明確傳進 DAL 的 publishedDate 參數（不帶就不動，舊呼叫端不受影響）。
  const data: BlogPostData = { ...input.data, blocks: normalized.doc };

  let result;
  try {
    result = await savePostDraft(data, input.expectedUpdatedAt, input.note ?? "", data.publishedAt);
  } catch (error) {
    console.error("[admin/blog] 存草稿失敗", error);
    return { ok: false, reason: "db", error: `存檔沒成功。${DB_HUMAN_ERROR}` };
  }
  if (!result.ok) {
    return result.reason === "conflict"
      ? { ok: false, reason: "conflict", error: CONFLICT_HUMAN_ERROR }
      : { ok: false, reason: "not-found", error: "找不到這篇文章——可能還沒匯入，回列表再看一次。" };
  }

  // 存檔成功後才跑法條比對；比對本身失敗不影響存檔結果。
  let lawChecks: readonly LawCheckItem[] = [];
  const hints: string[] = [];
  try {
    lawChecks = await buildLawChecks(normalized.doc);
  } catch (error) {
    console.error("[admin/blog] 法條比對失敗（存檔本身已成功）", error);
    lawChecks = [];
    hints.push("參照庫連不上，這次沒比對法條逐字——存檔本身已成功。");
  }

  return {
    ok: true,
    updatedAt: result.updatedAt,
    savedAtLabel: formatTaipeiTime(result.updatedAt),
    lawChecks,
    hints
  };
}

/* ───────────────────────────────────────────────
   3.3 發布：檢查清單＋「照樣發布」
   ─────────────────────────────────────────────── */

export async function publishAction(input: {
  id: number;
  expectedUpdatedAt: string;
  /** false＝第一次按「發布」；true＝看過清單按「照樣發布」。 */
  confirmed: boolean;
}): Promise<PublishState> {
  if (!hasDatabase) {
    return { ok: false, reason: "db", error: "還沒接資料庫，沒辦法發布。" };
  }

  const row = await getPost(input.id);
  if (!row) {
    return {
      ok: false,
      reason: "not-found",
      error: `找不到這篇文章，或資料庫暫時連不上。${DB_HUMAN_ERROR}`
    };
  }
  if (row.updatedAt !== input.expectedUpdatedAt) {
    return { ok: false, reason: "conflict", error: CONFLICT_HUMAN_ERROR };
  }

  // 檢查清單（law-check 現查現算好傳進純函式；比對失敗不擋發布流程）
  let lawChecks: readonly LawCheckItem[] = [];
  try {
    lawChecks = await buildLawChecks(row.data.blocks);
  } catch (error) {
    console.error("[admin/blog] 發布前法條比對失敗（不擋發布）", error);
  }
  const checklist = runPublishChecks(row.data, row.publishedSnapshot, lawChecks);

  if (!input.confirmed && checklist.length > 0) {
    // 清單非空：先讓他看清單（不發布）。「照樣發布」＝他的權利，下一輪 confirmed:true 進來。
    return { ok: false, reason: "needs-confirm", checklist };
  }
  // 清單空 → 直接發布（方案書原文「沒問題就直接上線」，不多按一次）

  const slugChanged =
    row.publishedSnapshot !== null && row.publishedSnapshot.slug !== row.data.slug;
  const redirectFrom = slugChanged
    ? `/blog/${row.publishedSnapshot!.id}-${row.publishedSnapshot!.slug}`
    : null;

  let result;
  try {
    result = await publishPost(input.id, input.expectedUpdatedAt);
  } catch (error) {
    console.error("[admin/blog] 發布失敗", error);
    return { ok: false, reason: "db", error: `發布沒成功。${DB_HUMAN_ERROR}` };
  }
  if (!result.ok) {
    return result.reason === "conflict"
      ? { ok: false, reason: "conflict", error: CONFLICT_HUMAN_ERROR }
      : { ok: false, reason: "not-found", error: "找不到這篇文章——可能還沒匯入，回列表再看一次。" };
  }

  return {
    ok: true,
    updatedAt: result.updatedAt,
    // published_at 與 updated_at 在同一句 UPDATE 裡同用 now()，值相同
    publishedAt: result.updatedAt,
    slugChanged,
    redirectFrom,
    checklist
  };
}

/* ───────────────────────────────────────────────
   3.4 還原：還原也是新的一版
   ─────────────────────────────────────────────── */

export async function restoreAction(input: {
  postId: number;
  /** 要還原到的快照。 */
  seq: number;
  /** 這篇目前的樂觀鎖 token（版本頁 Server 端現撈的）。 */
  expectedUpdatedAt: string;
}): Promise<RestoreState> {
  if (!hasDatabase) {
    return { ok: false, reason: "db", error: "還沒接資料庫，沒辦法還原。" };
  }

  const entry = await getHistoryEntry(input.postId, input.seq);
  if (!entry) {
    return {
      ok: false,
      reason: "not-found",
      error: `找不到這一版快照，或資料庫暫時連不上。${DB_HUMAN_ERROR}`
    };
  }

  const savedAtLabel = formatTaipei(entry.savedAt);
  let result;
  try {
    // 🔴 舊快照裡的 id 蓋不進去（DAL 的 update 清單不含它）；
    //    發布日這裡刻意不帶 publishedDate 參數——還原內容不連發布日一起倒回去，
    //    要改發布日去編輯頁那格改（可改＋標示，00 方案書第三節①）。
    result = await savePostDraft(
      entry.data,
      input.expectedUpdatedAt,
      `還原到 ${savedAtLabel} 那一版（第 ${input.seq} 號快照）`
    );
  } catch (error) {
    console.error("[admin/blog] 還原失敗", error);
    return { ok: false, reason: "db", error: `還原沒成功。${DB_HUMAN_ERROR}` };
  }
  if (!result.ok) {
    return result.reason === "conflict"
      ? {
          ok: false,
          reason: "conflict",
          error: "這篇剛剛在別的視窗被改過——重新整理這一頁拿最新狀態，再決定要不要還原。"
        }
      : { ok: false, reason: "not-found", error: "找不到這篇文章——可能還沒匯入。" };
  }

  return { ok: true, updatedAt: result.updatedAt, restoredTo: { seq: input.seq, savedAtLabel } };
}

/* ───────────────────────────────────────────────
   3.5 空庫補位鈕（永不覆蓋）
   ─────────────────────────────────────────────── */

export async function importIfEmptyAction(): Promise<ImportState> {
  // 1. 空庫判斷（兼連線探針，同一發查詢）：countPosts 連線失敗會 throw——
  //    讀不到＝報錯，絕不＝空庫。
  //    ⚠️ 不可以拆成「探針一發＋listPosts 一發」：探針過了、下一發剛好瞬斷時
  //    listPosts 會回 []，被誤判成空庫而重匯蓋掉後台的編輯。
  let existingCount: number;
  try {
    existingCount = await countPosts();
  } catch (error) {
    console.error("[admin/blog] 匯入前讀文章筆數失敗", error);
    return { ok: false, reason: "db", error: `連不上資料庫，先不匯。${DB_HUMAN_ERROR}` };
  }

  // 2. 非空庫一律拒絕（第九節的資料同步規矩，結構上執行）
  if (existingCount > 0) {
    return {
      ok: false,
      reason: "not-empty",
      error: "資料庫已有文章，不重匯——後台改過的內容是真的，要重匯先跟主控端說。"
    };
  }

  // 3. 讀轉檔輸出（.blog-migration/ 不進版控也不進部署包；
  //    Vercel 上走到 no-files 是正常的，訊息把人指去本機 CLI）
  const dir = join(process.cwd(), ".blog-migration", "posts");
  let files: string[];
  try {
    files = (await readdir(dir)).filter((name) => /^\d+\.json$/.test(name)).sort();
  } catch {
    files = [];
  }
  if (files.length === 0) {
    return {
      ok: false,
      reason: "no-files",
      error:
        "找不到轉檔輸出（.blog-migration/posts/）。先在本機跑 scripts/migrate-posts.mjs 產出五篇 JSON，" +
        "正式匯入則跑 node --env-file-if-exists=.env.local scripts/blog-import.mjs --execute" +
        "（INTERFACE-stage2 第九節）。"
    };
  }

  // 4. 逐檔最小驗形（id 是數字、slug 非空、blocks.type === "doc"、頂層節點名都在契約清單內）
  const posts: BlogPostData[] = [];
  for (const name of files) {
    let data: BlogPostData;
    try {
      data = JSON.parse(await readFile(join(dir, name), "utf8")) as BlogPostData;
    } catch {
      return { ok: false, reason: "invalid", error: `${name} 不是合法的 JSON，先檢查轉檔輸出。` };
    }
    const doc = data.blocks as BlogDocJson | undefined;
    const badNode = doc?.content?.find((node) => !BLOCK_TYPES.has(node.type));
    if (
      typeof data.id !== "number" ||
      typeof data.slug !== "string" ||
      data.slug === "" ||
      doc?.type !== "doc" ||
      !Array.isArray(doc.content) ||
      badNode
    ) {
      return {
        ok: false,
        reason: "invalid",
        error:
          `${name} 的形狀不符合契約` +
          (badNode ? `（出現契約外節點「${badNode.type}」）` : "") +
          "，先跑 scripts/verify-migration.mjs 檢查轉檔輸出。"
      };
    }
    posts.push(data);
  }

  // 5. 逐篇匯入。五篇在線上是 live 的，匯入即發布（publish: true）；
  //    前台第三段切換前讀不到 published_snapshot，零風險。
  const imported: number[] = [];
  try {
    for (const data of posts.sort((a, b) => a.id - b.id)) {
      await importPost(data, { publish: true, note: "後台一鍵匯入（第二段）" });
      imported.push(data.id);
    }
  } catch (error) {
    console.error("[admin/blog] 匯入失敗", error);
    return {
      ok: false,
      reason: "db",
      error:
        `匯入中斷（已完成：${imported.length ? imported.join("、") : "無"}）。${DB_HUMAN_ERROR}` +
        "重按一次會拒絕（庫已非空），請改用本機 CLI 匯入或跟主控端說。"
    };
  }

  return { ok: true, imported };
}

/* ───────────────────────────────────────────────
   3.6 「以這版更新參照庫」
   ─────────────────────────────────────────────── */

export async function updateLawRefAction(
  input: BlogLawRef
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!hasDatabase) {
    return { ok: false, error: "還沒接資料庫，參照庫存不進去。" };
  }
  if (!input.pcode || !input.flno || !input.articleText) {
    return { ok: false, error: "參照庫更新缺欄位（pcode／flno／條文內容），先檢查這一塊的出處設定。" };
  }
  try {
    await upsertLawRef(input);
  } catch (error) {
    console.error("[admin/blog] 更新參照庫失敗", error);
    return { ok: false, error: `參照庫沒更新成功。${DB_HUMAN_ERROR}` };
  }
  return { ok: true };
}
