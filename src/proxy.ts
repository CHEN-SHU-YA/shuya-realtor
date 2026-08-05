import { NextResponse, type NextRequest } from "next/server";

/**
 * 後台存取控制
 * ---------------------------------------------------------
 * /admin 與客戶資料的修改 API 會顯示或變更客戶姓名、電話、Email 與需求內容，
 * 屬於個人資料，絕對不能公開。
 *
 * 規則：
 *   1. 有設定 ADMIN_USER + ADMIN_PASS → 走 HTTP Basic 驗證。
 *   2. 沒設定，但在本機開發 → 直接放行，方便自己用。
 *   3. 沒設定，且是正式環境 → 一律擋掉（預設安全，不會裸奔）。
 *
 * 部署到 Vercel 後，到 Settings → Environment Variables 新增：
 *   ADMIN_USER = 你想用的帳號
 *   ADMIN_PASS = 夠長的密碼
 * 設定完要重新部署一次才會生效。
 */

const REALM = 'Basic realm="shuya-admin", charset="UTF-8"';

function unauthorized(message: string) {
  return new NextResponse(message, {
    status: 401,
    headers: { "WWW-Authenticate": REALM, "Content-Type": "text/plain; charset=utf-8" }
  });
}

/** 逐字元比對，長度不同也走完全程，避免用回應時間猜密碼 */
function safeEqual(a: string, b: string) {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export default function proxy(request: NextRequest) {
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (!user || !pass) {
    if (process.env.NODE_ENV === "development") return NextResponse.next();
    return new NextResponse(
      "後台尚未設定管理密碼，已停用。\n請在部署平台設定 ADMIN_USER 與 ADMIN_PASS 環境變數後重新部署。",
      { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
    );
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return unauthorized("需要登入。");

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return unauthorized("認證格式不正確。");
  }

  const separator = decoded.indexOf(":");
  if (separator < 0) return unauthorized("認證格式不正確。");

  const okUser = safeEqual(decoded.slice(0, separator), user);
  const okPass = safeEqual(decoded.slice(separator + 1), pass);
  if (!okUser || !okPass) return unauthorized("帳號或密碼錯誤。");

  return NextResponse.next();
}

export const config = {
  // 只保護後台頁面與「讀取／修改既有預約」的 API。
  // 客戶端要用的 /api/appointment/slots 與 /api/appointment/create 不在此列，維持公開。
  matcher: ["/admin/:path*", "/api/appointments/:path*"]
};
