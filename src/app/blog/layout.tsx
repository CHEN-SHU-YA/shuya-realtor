import "./blog.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import BlFooter from "./_components/BlFooter";
import BlNav from "./_components/BlNav";
import BlUtil from "./_components/BlUtil";

/**
 * 部落格外殼（`/blog` 底下每一頁都套這一層）。
 *
 * 🔴 三件最容易漏、漏了畫面上完全看不出來的事：
 *
 *   ① **必須覆寫 robots**。根 `src/app/layout.tsx` 是 `robots:{index:false,follow:false}`
 *      （全站預設不索引，只有首頁自己覆寫回來）。這裡不覆寫的話，整個部落格 Google 一篇都不收，
 *      而且畫面、版面、連結全都正常，只有原始碼裡多一行 noindex。
 *      上線後第一件事：確認 `/blog` 的 `<meta name="robots">` 是 `index, follow`。
 *      ⚠️ Next 的 metadata 是**逐層合併、整鍵覆蓋**：子層 `generateMetadata` 只要回傳了 `robots`，
 *         就會整個蓋掉這裡，所以子頁若要寫 `robots`，一定要自己帶 `index:true`。
 *
 *   ② **只 import `./blog.css`**。🔴 絕對不要 `import "../site.css"`——
 *      `site.css` 有全域的 `.wrap` / `.lead` / `.eyebrow`，Next 的客戶端導覽會讓 CSS 累積，
 *      從首頁點進部落格時版面會被首頁那份蓋掉。部落格的類名全部是 `bl-` 前綴，兩邊井水不犯河水。
 *      載入順序是 `globals.css`（根 layout）先、`blog.css` 後。
 *
 *   ③ **最外層的 `div.bl-shell` 不可拿掉，也不可改名**。
 *      部落格的白底、行高 1.8、字色、`min-height:100vh` 全部掛在這個 class 上（`blog.css`）。
 *      早期版本是把它們寫在裸 `body{}` 上，實測會**外溢到 `/`、`/card`**——
 *      App Router 客戶端導覽會讓 CSS 累積且不移除，`blog.css` 排在最後、平手時它贏，
 *      首頁底色被洗白、深色頁尾的白字連結變深綠。詳細實測數據記在 `blog.css` 檔頭。
 *      這一層是 Fragment 換成 div 的唯一理由，不是多餘的包裝。
 *
 *   ④ **DOM 順序固定，不可調換**：
 *      `div.bl-shell` >（`a.bl-skip` → `div.bl-util` → `nav.bl-nav` → `main#main` → `footer.bl-footer`）。
 *      跳過連結必須是 `.bl-shell` 的第一個子元素，也就是整份文件**第一個可聚焦的元素**
 *      （根 layout 的 `<body>` 只有 `{children}`，所以 `.bl-shell` 就是 body 唯一的子元素）。
 *      另外 `<main>` 一定要 `id="main"`，否則跳過連結失效。
 *
 * 這一層與底下所有元件都是 Server Component，**整個部落格零 JavaScript**
 * （FAQ 用原生 `<details>`，導覽列不做漢堡），所以任何一支都不要加 "use client"。
 */
export const metadata: Metadata = {
  // 🔴 覆寫根 layout 的 noindex。`max-image-preview:large` 讓 Google 用大圖縮圖，不要刪。
  robots: { index: true, follow: true, "max-image-preview": "large" },
  other: {
    // geo 不是 Next 內建欄位，用 other 直接輸出 <meta name="…">。
    // 🔴 屏東縣是 TW-PIF；高雄才是 TW-KHH，抄錯會把書亞的店定位到高雄。
    "geo.region": "TW-PIF",
    // 🔴 只寫到「屏東市」為止，**不要**再接「・崇大新城」。
    //    已查證的是：門市登記地址是華盛街 5-5 號，華盛街屬崇武里；
    //    崇大新城位在永大路與華盛街口。**店名叫「崇大華盛」不等於門市座落在崇大新城社區範圍內**，
    //    寫上去就是一句沒查證過的事實斷言，而 geo meta 是對搜尋引擎宣告門市位置的地方。
    //    （書亞「專營崇大新城社區」是他本人講的、是真的，那句留在 JSON-LD 的 knowsAbout，
    //      那是「他懂什麼」，與「店開在哪」是兩件事。）
    "geo.placename": "屏東縣屏東市"
    // 🔴 `geo.position` 與 `ICBM` 兩行**故意不輸出**：門市精確經緯度尚未取得，
    //    填概略座標等於對 Google 宣告一個錯的門市位置，比沒有更糟。拿到再補。
    // theme-color 也不寫：根 layout 的 `viewport.themeColor` 已經輸出過，這裡再寫會重複一個 meta。
  }
};

export default function BlogLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="bl-shell">
      {/* 無障礙跳轉：視覺隱藏，鍵盤 Tab 才出現。必須是整份文件第一個可聚焦的元素。 */}
      <a className="bl-skip" href="#main">跳到主要內容</a>
      <BlUtil />
      <BlNav />
      <main id="main">{children}</main>
      <BlFooter />
    </div>
  );
}
