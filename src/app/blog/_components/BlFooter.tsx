import { AGENCY, BLOG_FOOTER_NAV, BLOG_META, LEGAL } from "@/lib/blog";
import { PROFILE } from "@/lib/profile";

/**
 * 頁尾（`.bl-footer`）——法遵分層揭露的**第二層：完整揭露**。
 *
 * 🔴 **每一頁都要有，不能只放首頁**。依《不動產經紀業管理條例》，公開廣告須揭露經紀業名稱；
 *    部落格的列表頁、分類頁、文章頁一樣都是公開廣告頁面，所以掛在 `blog/layout.tsx` 全域輸出。
 *
 * ✅ **2026-08-15 補齊**：先前刻意留白的兩行（經紀業公司登記全名、該店專任不動產經紀人）
 *    資料已取得並印出，頁尾現在是完整揭露。
 *
 * 🔴 **這裡有兩個人，不要弄混**：
 *      · **陳書亞**是**不動產營業員**，證號 `PROFILE.licenseNo`
 *      · **陳映璿**是該店**專任不動產經紀人**，證號 `AGENCY.broker.licenseNo`
 *    兩人的姓名、職稱、證號**任何一項互換都是不實廣告**。職稱一律取常數，不要手打。
 * 🔴 姓名、證號、電話、地址一律 import 常數，**不准重打字串**——重打一次就多一個
 *    「畫面看起來完全正常、但寫錯了」的機會，而錯的代價是不實廣告。
 *
 * `<address>` 是語意標籤，瀏覽器預設斜體由 CSS 的 `font-style:normal` 覆寫。
 */

/** 無 props。全部文字來自 `@/lib/blog` 與 `@/lib/profile`。 */
export type BlFooterProps = Record<string, never>;

/** 頁尾導覽的一項（`BLOG_FOOTER_NAV` 是 `as const` 異質陣列，先收斂型別才讀得到 `external`）。 */
type BlFooterNavItem = { href: string; label: string; external?: boolean };

const FOOTER_NAV_ITEMS: readonly BlFooterNavItem[] = BLOG_FOOTER_NAV;

export default function BlFooter() {
  // 版權年份跟著系統時間走，不要寫死——寫死的年份放到明年就是一眼可見的失修。
  const year = new Date().getFullYear();

  return (
    <footer className="bl-footer">
      <div className="bl-wrap">
        <address className="bl-legal">
          {/* 經紀業名稱：中間是全形空格 U+3000，且必須帶「（加盟店）」以與直營店區別。 */}
          <p><b>經紀業名稱：</b>{LEGAL.agencyLine}</p>
          {/* 公司登記全名。招牌名是客戶認得的，登記名是法定揭露要的，兩者都印。 */}
          <p><b>經紀業登記名稱：</b>{LEGAL.legalNameLine}</p>
          {/* 🔴 這一行是**該店專任經紀人陳映璿**，不是書亞。下一行才是書亞。 */}
          <p><b>不動產經紀人：</b>{LEGAL.brokerLine}</p>
          {/* 姓名與「證號」之間是全形空格 U+3000、「證號」與號碼之間是半形空格。
              用樣板字串組，是為了讓這兩個空白不會被格式化工具或換行吃掉。 */}
          <p><b>{AGENCY.jobTitle}：</b>{`${PROFILE.name}　證號 ${PROFILE.licenseNo}`}</p>
          <p><b>服務據點：</b>{PROFILE.address}｜<a className="bl-mono" href={`tel:${PROFILE.phoneRaw}`}>{PROFILE.phone}</a>（同 LINE）</p>
          <p><b>營業時間：</b>{LEGAL.hoursLine}</p>
          <p><b>服務區域：</b>{AGENCY.serviceArea}</p>
          <p className="bl-disclaimer">{LEGAL.disclaimer}</p>
        </address>
        <div className="bl-fnav">
          {FOOTER_NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              rel={item.external ? "noopener" : undefined}
              target={item.external ? "_blank" : undefined}
            >
              {item.label}
            </a>
          ))}
        </div>
        <p className="bl-copy">{`© ${year} ${BLOG_META.brand}．保留一切權利`}</p>
      </div>
    </footer>
  );
}
