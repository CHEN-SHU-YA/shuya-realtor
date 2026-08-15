/**
 * ★ 一句話結論框 `.bl-verdict`（規格書 §3.9、INTERFACE §3.5）。
 *
 * 全篇四個靈魂元件之一：白底、1.5px 橘框、圓角 12px；頂部淺橘標題帶寫「📌 先講結論」；
 * 內容是一問一答（「問」深綠小方塊、「答」橘色小方塊），最後用虛線分隔一行免責小字。
 *
 * 🔴 兩條照抄不可改的結構（改了當場破版，這是這個元件最容易寫錯的地方）：
 *
 *   ① `.bl-va` 的答案**必須整段包在一個 `<span>` 裡**。
 *      `.bl-va` 是 flex 容器，`<span class="bl-t">答</span>` 之後**只能有一個子節點**。
 *      答案含 `<strong>` ＋後續文字，不包的話這兩塊會各自變成獨立 flex item
 *      被排成同一列，整個框當場炸開。
 *      （`PostVerdict` 把答案拆成 `aBold` / `aRest` 兩個欄位，就是為了讓人不可能忘記包。）
 *
 *   ② `.bl-vq` 的問句**反而不能包**。
 *      它是裸文字節點，剛好成為唯一的匿名 flex item；包了 span 是多餘的。
 *
 * 其他規則：標籤字固定單一漢字「問」「答」，不要換成 Q/A；
 * 免責小字開頭的「※ 」由元件自己加，`verdict.note` 不要自己打。
 */
import type { PostVerdict } from "@/lib/blog";

export type BlVerdictProps = { verdict: PostVerdict };

/**
 * 標題帶文字，全站固定。
 *
 * 🔴 原本是「⚖️ 一句話結論」——那與被參考的那個高雄同業**逐位元組相同**（連天秤 emoji 都一樣），
 *    而且每一篇文章都會印，是全篇最顯眼的固定字串。字與 emoji 一起換掉。
 *    「先講結論」正好是書亞自己的原則（先講結論，再說明原因），比抄來的更貼他。
 */
const HEADING = "📌 先講結論";

export default function BlVerdict({ verdict }: BlVerdictProps) {
  return (
    <aside className="bl-verdict">
      <div className="bl-verdict-h">{HEADING}</div>
      <div className="bl-verdict-b">
        {/* 🔴 問句是裸文字節點，不要包 span */}
        <p className="bl-vq">
          <span className="bl-t">問</span>
          {verdict.q}
        </p>
        {/* 🔴 答案整段包在同一個 span 裡，`.bl-t` 之後只能有這一個子節點 */}
        <p className="bl-va">
          <span className="bl-t">答</span>
          <span>
            <strong>{verdict.aBold}</strong>
            {verdict.aRest}
          </span>
        </p>
        <div className="bl-vnote">{`※ ${verdict.note}`}</div>
      </div>
    </aside>
  );
}
