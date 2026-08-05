/**
 * 網站對外網址。
 *
 * 部署到 Vercel 之後，到專案的 Settings → Environment Variables 加一組：
 *   NEXT_PUBLIC_SITE_URL = https://你的正式網域
 *
 * 沒設定時會退回 Vercel 自動給的網址，再退回本機位址。
 * canonical、Open Graph 與結構化資料都吃這個值。
 */
function resolveSiteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
