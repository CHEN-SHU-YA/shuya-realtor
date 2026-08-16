import Link from "next/link";
import Topbar from "@/app/_components/Topbar";
import { CATEGORIES } from "@/lib/blog";
import { getPost } from "@/lib/blog-db";
import { hasDatabase } from "@/lib/db";
import BlogEditForm from "./BlogEditForm";
import "../blog-admin.css";

export const dynamic = "force-dynamic";

/**
 * 編輯頁 `/admin/blog/[id]` 的 Server 殼（B 計畫第二段）。
 *
 * 職責只有三件：getPost 撈整包（含樂觀鎖 token）、把分類清單縮成可序列化的
 * 小陣列（🔴 不讓 Client 端 import `@/lib/blog`——那會把五篇文章的 JSX 全拖進
 * admin bundle）、查無或解析失敗給人話頁（不炸）。
 * 其餘全部在 <BlogEditForm>（Client）。
 */
export default async function BlogEditPage({
  params
}: {
  /** 🔴 Next 16 的 params 是 Promise，一定要 await。 */
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = Number.parseInt(rawId, 10);
  const row = Number.isInteger(id) && hasDatabase ? await getPost(id) : null;

  if (!row) {
    return (
      <div className="admin-page">
        <Topbar admin />
        <div className="admin-shell">
          <div className="admin-heading">
            <div>
              <h1>找不到這篇文章</h1>
              <p>
                {hasDatabase
                  ? "可能還沒匯入，或 Neon 剛從休眠醒來——回列表再點一次通常就好。"
                  : "還沒接資料庫，文章讀不到也存不了。"}
              </p>
            </div>
            <Link className="button-secondary" href="/admin/blog">
              回文章列表
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <Topbar admin />
      <div className="admin-shell">
        <div className="admin-heading">
          <div>
            <h1>編輯：{row.data.title}</h1>
            <p>
              存檔＝存草稿（正式站不動）；預覽看的是最後一次存檔的版本；按「發布」才寫進線上版本。
              第二段期間前台還在讀舊系統，發布也不會動到正式站。
            </p>
          </div>
          <Link className="button-secondary" href="/admin/blog">
            回文章列表
          </Link>
        </div>
        <BlogEditForm
          row={row}
          categories={CATEGORIES.map((category) => ({ slug: category.slug, name: category.name }))}
        />
      </div>
    </div>
  );
}
