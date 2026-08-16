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
  /**
   * 圖示。三個檔都由 `npm run icons`（`scripts/build-icons.mjs`）產生，放在 `public/`。
   *
   * 🔴 **原本這裡只有一個 data-URI 的 SVG。** 分頁小圖是有的，但兩種「不解析 HTML、
   *    直接照固定路徑要檔案」的用戶端拿不到東西：
   *      ① 部分爬蟲／RSS 閱讀器／舊瀏覽器直接打 `/favicon.ico` —— 2026-08-16 實測線上 404
   *      ② iOS「加入主畫面」不吃 SVG 也不吃 data-URI，找不到就**拿整頁截圖當圖示**
   *
   * 🔴 放 `public/` 而不是用 Next 的 `src/app/icon.png` file convention：
   *    convention 會產生帶雜湊的網址（`/icon.png?abc123`），那樣 `/favicon.ico`
   *    這個**固定路徑**還是 404。放 public 才會原樣掛在網址上。
   *
   * ⚠️ 圖案（綠底圓角＋白色「書」）跟 `scripts/build-icons.mjs` 是同一份設計，改要一起改。
   */
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon.png", type: "image/png", sizes: "512x512" }
    ],
    apple: { url: "/apple-icon.png", sizes: "180x180" }
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
