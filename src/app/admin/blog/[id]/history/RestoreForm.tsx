"use client";

/**
 * 「還原這一版」小件（B 計畫第二段）。
 *
 * 還原＝把舊快照再存成新的一版草稿（restoreAction → savePostDraft），
 * 歷史只往前長。成功訊息要講清楚：線上要換回去還得回編輯頁按「發布」。
 * 同一頁還原成功後，其他列手上的 token 已過期——訊息提醒重新整理。
 */
import { useActionState } from "react";
import { restoreAction } from "../../actions";
import type { RestoreState } from "../../lib/types";

export default function RestoreForm({
  postId,
  seq,
  expectedUpdatedAt
}: {
  postId: number;
  seq: number;
  /** 這篇目前的樂觀鎖 token（Server 頁現撈的）。 */
  expectedUpdatedAt: string;
}) {
  const [state, action, pending] = useActionState<RestoreState | null, FormData>(
    async () => restoreAction({ postId, seq, expectedUpdatedAt }),
    null
  );

  return (
    <form action={action} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {state && !state.ok && <span className="bab-result err">⚠️ {state.error}</span>}
      {state?.ok && (
        <span className="bab-result okk">
          ✅ 已還原成草稿。要讓線上也換回去，回編輯頁按發布；要繼續還原別版，先重新整理這一頁。
        </span>
      )}
      <button className="button-secondary" type="submit" disabled={pending || state?.ok === true}>
        {pending ? "還原中…" : "還原這一版"}
      </button>
    </form>
  );
}
