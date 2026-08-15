import { AGENCY } from "@/lib/blog";
import { PROFILE } from "@/lib/profile";

/**
 * 頂部資訊條（`.bl-util`）。
 *
 * 法遵分層揭露的**第一層**：只放經紀業名稱 + 地址 + 電話，快速識別用。
 * 🔴 這裡**刻意不放證號**——完整揭露（證號、免責聲明）統一在頁尾 `BlFooter`，
 *    12.5px 的兩端對齊資訊條硬塞證號，手機一定擠成兩行。
 *
 * 不 sticky，會隨捲動消失（sticky 的是下面的導覽列）。
 */

/** 無 props。所有字串都從 `@/lib/blog` 與 `@/lib/profile` 取，不接受外部覆寫。 */
export type BlUtilProps = Record<string, never>;

export default function BlUtil() {
  return (
    <div className="bl-util">
      <div className="bl-wrap">
        {/* 公司名與地址：一律取常數，不重打。「有巢氏房屋」與「屏東崇大華盛加盟店」中間是全形空格 U+3000，
            分隔符是全形直線「｜」U+FF5C。`.bl-addr-city` 在 ≤480px 會被 CSS 藏起來（手機省空間）。 */}
        <span>
          <b>{AGENCY.name}</b>
          <span className="bl-util-sep">｜</span>
          <span className="bl-addr-city">{AGENCY.address.addressLocality}</span>
          {AGENCY.address.streetAddress}
        </span>
        {/* 🔴 `tel:` 內用 phoneRaw（無連字號），顯示文字才用 phone（有連字號）。 */}
        <span>
          <a className="bl-mono" href={`tel:${PROFILE.phoneRaw}`}>{PROFILE.phone}</a>
        </span>
      </div>
    </div>
  );
}
