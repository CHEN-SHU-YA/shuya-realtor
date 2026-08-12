import Link from "next/link";
import Topbar from "@/app/_components/Topbar";
import { getContent, getContentUpdatedAt } from "@/lib/content";
import { hasDatabase } from "@/lib/db";
import ContentForm from "./ContentForm";

export const dynamic = "force-dynamic";

export default async function ContentPage() {
  const [content, updatedAt] = await Promise.all([getContent(), getContentUpdatedAt()]);

  return (
    <div className="admin-page">
      <Topbar admin />
      <div className="admin-shell">
        <div className="admin-heading">
          <div>
            <h1>網站內容</h1>
            <p>改完按儲存，前台重新整理就會變。不用重新部署。</p>
          </div>
          <Link className="button-secondary" href="/" target="_blank" rel="noreferrer">
            開新分頁看首頁
          </Link>
        </div>
        <ContentForm content={content} updatedAt={updatedAt} hasDatabase={hasDatabase} />
      </div>
    </div>
  );
}
