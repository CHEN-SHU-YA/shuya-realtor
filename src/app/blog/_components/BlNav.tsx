import { BLOG_META, BLOG_NAV } from "@/lib/blog";

/**
 * 導覽列（`.bl-nav`）。sticky 黏頂，全站常駐。
 *
 * 🔴 三件不能動的事：
 *   ① **站內錨點一律帶前導斜線**（`/#services` 不是 `#services`）。少了那一撇，
 *      在 `/blog/1001-xxx` 上點下去會變成 `/blog/1001-xxx#services`，什麼都不會發生。
 *      這件事由 `BLOG_NAV` 的資料保證，這支元件只負責原封不動輸出 `item.href`。
 *   ② 最後一項 LINE 的 **inline style 是全站唯一一個**，那是刻意的視覺 CTA（整列唯一彩色項），
 *      不要「順手清乾淨」。用 `--bl-accent-ink`（小字深橘）不是 `--bl-accent`。
 *   ③ logo 方塊 `.bl-sq` 是 `<span>` 裡放一個「書」字，**不是圖片也不是 SVG**。
 *
 * 手機不變漢堡：靠 `nav ul{flex-wrap:wrap}` 換行 + ≤640px 縮字距字級。這是設計，不是 bug。
 * 全篇零 JavaScript，所以這支是 Server Component，不要加 "use client"。
 */

/** 無 props。項目來自 `BLOG_NAV`，要增減選單就改 `@/lib/blog`。 */
export type BlNavProps = Record<string, never>;

/**
 * 導覽列的一項。
 * `BLOG_NAV` 是 `as const` 的異質陣列（只有 LINE 那項有 `external` / `accent`），
 * 直接 `.map` 讀 `item.accent` 會被 TypeScript 擋下來，所以先收斂成這個型別。
 */
type BlNavItem = { href: string; label: string; external?: boolean; accent?: boolean };

const NAV_ITEMS: readonly BlNavItem[] = BLOG_NAV;

export default function BlNav() {
  return (
    <nav className="bl-nav">
      <div className="bl-wrap">
        <a className="bl-logo" href="/">
          <span className="bl-sq">書</span>{BLOG_META.brand}
        </a>
        <ul>
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                style={item.accent ? { color: "var(--bl-accent-ink)" } : undefined}
                rel={item.external ? "noopener" : undefined}
                target={item.external ? "_blank" : undefined}
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
