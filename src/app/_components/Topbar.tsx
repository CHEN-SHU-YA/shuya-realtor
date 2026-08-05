import Link from "next/link";

export default function Topbar({ admin = false }: { admin?: boolean }) {
  return (
    <header className="topbar">
      <Link className="brand" href="/">
        <span className="brand-mark">書</span>
        <span>{admin ? "預約管理" : "書亞｜屏東房產"}</span>
      </Link>
      <nav className="topnav" aria-label="主要導覽">
        <Link href="/card">名片</Link>
        <Link href="/card/booking">預約</Link>
        <Link href="/admin/appointments">後台</Link>
      </nav>
    </header>
  );
}
