import Link from "next/link";

/**
 * 名片頁與預約頁的頁首。
 *
 * 🔴 **公開版（`admin` 為 false）不可以出現「後台」連結。**
 * 這兩頁是客戶掃名片 QR 直接落地的地方，導覽只有三項，「後台」就佔掉三分之一；
 * 客戶點下去會跳出瀏覽器原生的帳號密碼視窗，取消之後是一片只有「需要登入。」的白畫面，
 * 連個返回的連結都沒有 —— 對長輩型客戶還很像被釣魚。
 *
 * 這**不是**資安問題：`/admin` 整個子路徑都被 `src/proxy.ts` 的 Basic 驗證擋著
 * （正式站實測 401），拿掉連結只是不要讓客戶走進死路。
 * 自己要進後台就直接打網址；本機開發時下面還是會顯示，方便自己點。
 */
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
        {admin ? (
          <>
            <Link href="/admin/appointments">預約管理</Link>
            <Link href="/admin/content">網站內容</Link>
          </>
        ) : process.env.NODE_ENV === "development" ? (
          <Link href="/admin">後台</Link>
        ) : null}
      </nav>
    </header>
  );
}
