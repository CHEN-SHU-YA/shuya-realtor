import Link from "next/link";
import Topbar from "@/app/_components/Topbar";
import { getCategory } from "@/lib/blog";
import { listPosts } from "@/lib/blog-db";
import { hasDatabase } from "@/lib/db";
import ImportButton from "./ImportButton";
import { formatTaipei } from "./lib/format";
import "./blog-admin.css";

export const dynamic = "force-dynamic";

/**
 * 文章列表 `/admin/blog`（B 計畫第二段）。
 *
 * · 每列：標題、分類、已發布／草稿、上次存檔時間、「改了還沒發布」徽章，
 *   加三顆連結：編輯／預覽（新分頁）／版本。
 * · 空庫時顯示說明卡＋「匯入五篇」鈕（importIfEmptyAction，永不覆蓋）。
 * · 沒接 DB／讀取失敗照開，顯示人話提示（listPosts 失敗回 []，頁面自己判斷）。
 *
 * ⚠️ 第二段前台還在讀 .tsx——這裡改什麼、發布什麼，正式站都不會動，
 *    這是方案書說的零風險中繼點。
 */
export default async function BlogAdminPage() {
  const posts = await listPosts();

  return (
    <div className="admin-page">
      <Topbar admin />
      <div className="admin-shell">
        <div className="admin-heading">
          <div>
            <h1>文章管理</h1>
            <p>存檔是存草稿，按「發布」才會寫進線上版本。第二段期間正式站照舊，怎麼改都安全。</p>
          </div>
          <Link className="button-secondary" href="/blog" target="_blank" rel="noreferrer">
            開新分頁看部落格
          </Link>
        </div>

        {!hasDatabase && (
          <p className="form-error">
            ⚠️ 還沒接資料庫：文章清單讀不到、也存不了。要到 Vercel 專案的 Storage 建一個 Postgres。
          </p>
        )}

        {hasDatabase && posts.length === 0 && (
          <section className="appointment content-block">
            <h2 className="content-h">📝 還沒有文章</h2>
            <p className="content-desc">
              資料庫目前是空的（或 Neon 剛從休眠醒來、這一次沒讀到——重新整理一次可以確認）。
              五篇舊文的轉檔輸出在 <code>.blog-migration/posts/</code>，
              按下面的按鈕可以一鍵匯入；資料庫已有文章時這顆按鈕會拒絕動作，不會蓋掉任何東西。
            </p>
            <ImportButton />
          </section>
        )}

        {posts.length > 0 && (
          <section className="appointment content-block">
            <h2 className="content-h">📝 文章列表</h2>
            <p className="content-desc">
              「改了還沒發布」＝最後存檔比最後發布新：草稿內容只有你看得到，線上還是舊的那一版。
            </p>
            {posts.map((post) => (
              <div className="bab-row" key={post.id}>
                <Link className="bab-row-title" href={`/admin/blog/${post.id}`}>
                  {post.title}
                </Link>
                <span className="bab-row-meta">{getCategory(post.category).name}</span>
                <span
                  className={
                    post.status === "published" ? "bab-badge bab-badge-published" : "bab-badge"
                  }
                >
                  {post.status === "published" ? "已發布" : "草稿"}
                </span>
                {post.hasUnpublishedChanges && (
                  <span className="bab-badge bab-badge-dirty">改了還沒發布</span>
                )}
                <span className="bab-row-meta">上次存檔 {formatTaipei(post.savedAt)}</span>
                <span className="bab-row-links">
                  <Link href={`/admin/blog/${post.id}`}>編輯</Link>
                  <Link href={`/admin/blog/${post.id}/preview`} target="_blank" rel="noreferrer">
                    預覽
                  </Link>
                  <Link href={`/admin/blog/${post.id}/history`}>版本</Link>
                </span>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
