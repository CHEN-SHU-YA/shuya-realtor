"use client";

/**
 * 空庫補位鈕：「匯入五篇」（B 計畫第二段）。
 *
 * 只在 blog_posts 零筆時動作、**永不覆蓋**（importIfEmptyAction 的結構保證）；
 * 三規矩照 ContentForm：結果印按鈕旁、pending 鎖按鈕、提示寫人話。
 */
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { importIfEmptyAction } from "./actions";
import type { ImportState } from "./lib/types";

export default function ImportButton() {
  const router = useRouter();
  const [state, action, pending] = useActionState<ImportState | null, FormData>(
    async () => {
      const result = await importIfEmptyAction();
      if (result.ok) router.refresh();
      return result;
    },
    null
  );

  return (
    <form action={action}>
      {state && !state.ok && <p className="form-error">⚠️ {state.error}</p>}
      {state?.ok && (
        <p className="form-success">
          ✅ 已匯入 {state.imported.length} 篇（編號 {state.imported.join("、")}）。
          清單沒出現的話重新整理一次。
        </p>
      )}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "匯入中…" : "匯入五篇（只在空庫時動作）"}
      </button>
    </form>
  );
}
