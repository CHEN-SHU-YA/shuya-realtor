import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "書亞｜屏東房產　陳書亞 房產顧問",
    template: "%s｜書亞・屏東房產"
  },
  description: "陳書亞（有巢氏房屋 屏東崇大華盛加盟店）－屏東房產顧問，專營屏東市，服務屏東與高雄。",
  // 首頁在 app/page.tsx 覆寫成 index/follow；其餘頁面（名片、預約、後台）預設不索引
  robots: { index: false, follow: false },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23005335'/%3E%3Ctext x='32' y='44' font-size='34' font-family='sans-serif' font-weight='700' fill='%23fff' text-anchor='middle'%3E書%3C/text%3E%3C/svg%3E"
  }
};

export const viewport = {
  themeColor: "#005335"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant-TW">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
