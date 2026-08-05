/**
 * 網站對外網址。
 *
 * 部署到 Vercel 之後，到專案的 Settings → Environment Variables 加一組：
 *   NEXT_PUBLIC_SITE_URL = https://你的正式網域
 *
 * 沒設定時會退回 Vercel 自動給的網址，再退回本機位址。
 * canonical、Open Graph 與結構化資料都吃這個值。
 */
function clean(value?: string) {
  const trimmed = value?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : undefined;
}

function resolveSiteUrl() {
  // 1) 自訂網域，優先權最高
  const explicit = clean(process.env.NEXT_PUBLIC_SITE_URL);
  if (explicit) return explicit;

  // 2) Vercel 的「正式環境固定網域」（例：shuya-realtor.vercel.app）
  //    這個值每次部署都一樣，canonical 與 sitemap 一定要用它。
  const production =
    clean(process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL) ??
    clean(process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (production) return `https://${production}`;

  // 3) 最後才退回單次部署的網址。這個網址每次部署都會變，
  //    只適合預覽環境，不能拿來當 canonical。
  const deployment = clean(process.env.NEXT_PUBLIC_VERCEL_URL) ?? clean(process.env.VERCEL_URL);
  if (deployment) return `https://${deployment}`;

  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
