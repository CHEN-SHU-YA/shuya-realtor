import Link from "next/link";
import Topbar from "@/app/_components/Topbar";
import { listAppointments } from "@/lib/appointment-store";
import { listPosts } from "@/lib/blog-db";
import { hasDatabase } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 後台首頁。
 *
 * 之前 /admin 這個網址是 404 —— 只有 /admin/appointments 存在。
 * 人記得住的是「後台」，不是「後台底下第三層的那個網址」，
 * 打了 /admin 卻看到 404，第一個念頭會是「後台壞了」。
 */
export default async function AdminHome() {
  let pending = 0;
  let failed = false;
  try {
    const rows = await listAppointments("confirmed");
    pending = rows.length;
  } catch {
    failed = true;
  }

  /** 文章統計（listPosts 失敗回 []，這張卡不會弄炸後台首頁）。 */
  const blogPosts = await listPosts();
  const blogDirty = blogPosts.filter((post) => post.hasUnpublishedChanges).length;
  const blogStat = !hasDatabase
    ? "—"
    : blogPosts.length === 0
      ? "還沒匯入文章（點進去可一鍵匯入五篇）"
      : `${blogPosts.length} 篇文章${blogDirty ? `／${blogDirty} 篇改了還沒發布` : ""}`;

  return (
    <div className="admin-page">
      <Topbar admin />
      <div className="admin-shell">
        <div className="admin-heading">
          <div>
            <h1>後台</h1>
            <p>客戶送進來的預約、還有網站上的文字，都在這裡改。</p>
          </div>
        </div>

        {!hasDatabase && (
          <p className="form-error">
            ⚠️ 還沒接資料庫：預約單存不進去、網站內容也改不了。
            要到 Vercel 專案的 Storage 建一個 Postgres。
          </p>
        )}
        {failed && hasDatabase && (
          <p className="form-error">
            ⚠️ 連不上資料庫。Neon 免費方案沒人用會休眠，重新整理一次通常就好了。
          </p>
        )}

        <div className="admin-entries">
          <Link className="appointment admin-entry" href="/admin/appointments">
            <h2 className="content-h">📋 預約管理</h2>
            <p className="content-desc">
              看客戶送進來的預約、聯絡方式與需求，並標記已完成或已取消。
            </p>
            <p className="admin-entry-stat">
              {failed ? "—" : `目前有 ${pending} 筆待處理`}
            </p>
          </Link>

          <Link className="appointment admin-entry" href="/admin/content">
            <h2 className="content-h">✏️ 網站內容</h2>
            <p className="content-desc">
              改首頁的標題、自我介紹、得獎紀錄與 Google 搜尋結果的文字。
              存檔後前台重新整理就會變，不用重新部署。
            </p>
            <p className="admin-entry-stat">姓名、證號、電話不在這裡改</p>
          </Link>

          <Link className="appointment admin-entry" href="/admin/blog">
            <h2 className="content-h">📝 文章管理</h2>
            <p className="content-desc">
              部落格文章的編輯、版本與發布。存檔是存草稿，按「發布」才會更新線上版本；
              每次存檔都留完整快照，隨時可以還原。
            </p>
            <p className="admin-entry-stat">{blogStat}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
