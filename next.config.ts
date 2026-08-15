import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // 課堂上常直接開 127.0.0.1；允許本機開發資源，不放寬外部網域。
  allowedDevOrigins: ["127.0.0.1"],

  /**
   * 學區地圖掛在主站底下：https://www.shuyahouse.com/tools/school-map
   *
   * 它是獨立的 Vercel 專案（`shuya-school-map`，因為帶了 5.5MB 的村里界圖資，
   * 不想塞進主站 repo），這裡只把路徑轉過去。
   *
   * 🔴 走 rewrite 不走 redirect：redirect 會把使用者的網址列換成 vercel.app，
   *    SEO 權重就留不在主站了 —— 那樣等於白做。
   *
   * 🔴 後端那個專案自己也設了同樣的 basePath（`/tools/school-map`），
   *    所以這裡的 destination 要**帶著路徑**轉過去，不可以轉到它的根目錄。
   *    兩邊的 basePath 必須一致，改一邊就要改另一邊。
   *
   * 重複內容由後端的 canonical 處理（指死 www.shuyahouse.com）。
   */
  async rewrites() {
    return [
      {
        source: "/tools/school-map",
        destination: "https://shuya-school-map.vercel.app/tools/school-map",
      },
      {
        source: "/tools/school-map/:path*",
        destination: "https://shuya-school-map.vercel.app/tools/school-map/:path*",
      },
    ];
  },
};

export default nextConfig;
