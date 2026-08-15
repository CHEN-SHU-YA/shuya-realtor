/**
 * ★ 重點摘要框 `.bl-tldr`（規格書 §3.10、INTERFACE §3.6）。
 *
 * 靈魂元件之二：白底、細灰框、左側 4px 深綠粗邊、圓角 10px；
 * 上面一行等寬小字「重點摘要」，下面一整段不分段的長文（750–900 字）。
 * 位置固定在 `.bl-verdict` **之後**，不可互換。
 *
 * 🔴 **只准兩個子元素**：`div.bl-tldr-h.bl-mono` ＋ **單一 `<p>`**。
 *    多寫一個 `<p>` 會讓段落全部黏在一起（CSS 是 `.bl-tldr p{margin:0}`），視覺當場壞掉。
 *
 * 🔴 一整段、不換行、不加粗體、不用清單，是**刻意設計不是排版失誤**——
 *    這一段是餵給 AI 摘要引擎與趕時間的讀者看的，拆成條列就失去這個功能。
 *    所以 props 型別是 `string` 不是 `ReactNode`：讓人在型別上就不可能傳多段進來。
 *
 * 標題字固定「重點摘要」四字，且 `.bl-tldr-h` 必須同時掛 `.bl-mono`。
 */
export type BlTldrProps = {
  /** 摘要全文。單一長字串，750–900 字，不含任何標籤與換行。 */
  text: string;
};

/** 標題固定四個字。 */
const HEADING = "重點摘要";

export default function BlTldr({ text }: BlTldrProps) {
  return (
    <aside className="bl-tldr">
      <div className="bl-tldr-h bl-mono">{HEADING}</div>
      <p>{text}</p>
    </aside>
  );
}
