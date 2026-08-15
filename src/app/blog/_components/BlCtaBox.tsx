/**
 * ★ 文末 CTA 卡 `.bl-cta-box`（規格書 §3.14、INTERFACE §3.9）。
 *
 * 靈魂元件之四：深綠底、圓角 14px、置中；白色大標、淺色說明段、一顆橘色按鈕、
 * 一行極小的原創宣告。**全篇唯一的硬 CTA**，而且在全文讀完之後才出現。
 *
 * 位置：在 `.bl-prose` 與 `.bl-faq` **外面**，但仍在 `.bl-wrap-narrow` 內，全篇最後一塊。
 *
 * 結構細節：
 *   · `<h3>` 是**全篇唯一一個 h3**（`.bl-prose` 裡一個 h3 都沒有），字串固定寫在元件裡。
 *   · 說明段每篇要換 → 由 `post.ctaLead` 傳進來，收尾那一段（`LEAD_TAIL`）由元件補，
 *     所以 `ctaLead` 不要自己帶句號。
 *   · 最後一行小字掛**兩個 class**：`bl-src bl-mono`。
 *   · 按鈕 `target="_blank" rel="noopener"`。
 *
 * 🔴 **禁用詞**（`ctaLead` 與這裡的固定字串都適用，寫文章的人請一起遵守）：
 *    立即／馬上／限時／免費估價中／名額有限／錯過不再／專業團隊為您服務／保證／穩賺／
 *    包在我身上。
 *    理由有兩層：① 不動產廣告不得有保證獲利、催促成交的不實或誇大表示；
 *    ② 書亞的定位是「能分析、敢說實話」的顧問，不是推銷話術。
 *    （按鈕上也不寫「免費」：諮詢不收費雖然是事實，但放在按鈕上會滑成招攬語氣，
 *      而「免費估價中」這種製造急迫感的寫法本來就不可以。）
 *
 * 🔴 本檔四個固定字串（`HEADING` / `LEAD_TAIL` / `BUTTON_LABEL` / 原創宣告）**每篇文章都會印**，
 *    所以它們必須是書亞自己的話。改動時請重寫整句，不要只換地名或稱呼——
 *    把別人的句子換掉名詞不叫改寫，那還是別人的句子。
 */
import { BLOG_META } from "@/lib/blog";
import { PROFILE } from "@/lib/profile";

export type BlCtaBoxProps = {
  /** ＝ `post.ctaLead`。只列這篇主題的 2–4 個延伸服務，45–55 字，不要貼全業務清單。 */
  lead: string;
};

/**
 * 標題。用書亞既有的品牌核心句，不要另外造一句招攬語。
 * 重點在「幫你處理」而不是「找我買賣」——他的定位是顧問，不是接單窗口。
 */
const HEADING = "屏東房產大小事，書亞幫你處理";

/**
 * 說明段的固定收尾，接在 `lead` 之後。
 * 語氣要求：把門打開，但不催。所以寫「看完還有卡住的地方」而不是「歡迎來電洽詢」，
 * 也不承諾回覆速度（做不到的事不要寫在每一篇文章的結尾）。
 */
const LEAD_TAIL = "，都是我平常在處理的事。看完還有卡住的地方，用 LINE 傳給我，把狀況講清楚，我再回你。";

/** 按鈕文字。動詞開頭、講清楚按下去會發生什麼事；不放「免費」「立即」。 */
const BUTTON_LABEL = "傳 LINE 問書亞";

export default function BlCtaBox({ lead }: BlCtaBoxProps) {
  return (
    <aside className="bl-cta-box">
      <h3>{HEADING}</h3>
      <p>{`${lead}${LEAD_TAIL}`}</p>
      <a className="bl-cta" href={PROFILE.social.line} rel="noopener" target="_blank">
        {BUTTON_LABEL}
      </a>
      <p className="bl-src bl-mono">{`這篇是${BLOG_META.brand}自己寫的，要引用請附上出處。`}</p>
    </aside>
  );
}
