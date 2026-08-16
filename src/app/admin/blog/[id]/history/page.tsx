import Link from "next/link";
import Topbar from "@/app/_components/Topbar";
import { getPost, listHistory } from "@/lib/blog-db";
import { hasDatabase } from "@/lib/db";
import { formatTaipei } from "../../lib/format";
import RestoreForm from "./RestoreForm";
import "../../blog-admin.css";

export const dynamic = "force-dynamic";

/**
 * 版本頁 `/admin/blog/[id]/history`（B 計畫第二段）。
 *
 * 獨立路由而不是編輯頁側欄（契約定案 #1）：Server 頁每次進來現撈 getPost，
 * 拿到新鮮的樂觀鎖 token，還原表單天然不會拿到過期 token。
 *
 * 「可讀操作紀錄」＝ blog_post_history.note 欄＋這一頁的呈現：
 * 手動存檔 note 是空字串（顯示成「存檔」）、還原是「還原到 … 那一版（第 N 號快照）」、
 * 發布前自動存檔、後台一鍵匯入…逐筆可讀（契約 §3.7 那張表）。
 *
 * 已知限制（契約記錄在案）：發布本身不寫 history，頁首只顯示「最後一次發布時間」。
 */
export default async function BlogHistoryPage({
  params,
  searchParams
}: {
  /** 🔴 Next 16 的 params／searchParams 是 Promise，一定要 await。 */
  params: Promise<{ id: string }>;
  searchParams: Promise<{ limit?: string }>;
}) {
  const { id: rawId } = await params;
  const { limit: rawLimit } = await searchParams;
  const id = Number.parseInt(rawId, 10);
  const limit = Math.max(20, Math.min(500, Number.parseInt(rawLimit ?? "20", 10) || 20));

  const row = Number.isInteger(id) ? await getPost(id) : null;
  const entries = row ? await listHistory(id, limit) : [];

  return (
    <div className="admin-page">
      <Topbar admin />
      <div className="admin-shell">
        <div className="admin-heading">
          <div>
            <h1>版本紀錄{row ? `：${row.data.title}` : ""}</h1>
            <p>
              每次存檔都留一版完整快照。「還原這一版」會把它存成新的草稿——
              歷史只往前長，還原之後後悔也還原得回來。
            </p>
          </div>
          <Link className="button-secondary" href={`/admin/blog/${rawId}`}>
            回編輯頁
          </Link>
        </div>

        {!hasDatabase && (
          <p className="form-error">⚠️ 還沒接資料庫，讀不到版本紀錄。</p>
        )}

        {hasDatabase && !row && (
          <section className="appointment content-block">
            <h2 className="content-h">找不到這篇文章</h2>
            <p className="content-desc">
              可能還沒匯入，或 Neon 剛從休眠醒來。
              <Link href="/admin/blog">回文章列表</Link>再試一次。
            </p>
          </section>
        )}

        {row && (
          <section className="appointment content-block">
            <h2 className="content-h">🕘 每一次存檔</h2>
            <p className="content-desc">
              {row.publishedAt
                ? `目前線上版本發布於 ${formatTaipei(row.publishedAt)}。`
                : "這篇從未發布過。"}
              還原只改草稿——要讓線上也換回去，回編輯頁按「發布」。
            </p>
            {entries.length === 0 && (
              <p className="content-desc">還沒有任何存檔紀錄（或這一次沒讀到，重新整理再試）。</p>
            )}
            {entries.map((entry) => (
              <div className="bab-row" key={entry.seq}>
                <span className="bab-row-meta">第 {entry.seq} 號</span>
                <strong>{formatTaipei(entry.savedAt)}</strong>
                <span className="bab-row-meta">{entry.note || "存檔"}</span>
                <span className="bab-row-links">
                  <RestoreForm postId={id} seq={entry.seq} expectedUpdatedAt={row.updatedAt} />
                </span>
              </div>
            ))}
            {entries.length >= limit && (
              <p className="content-desc">
                <Link href={`/admin/blog/${rawId}/history?limit=${limit + 20}`}>載入更多</Link>
              </p>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
