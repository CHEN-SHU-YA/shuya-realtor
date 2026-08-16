/**
 * lawQuote 與法規參照庫的比對規則（B 計畫第二段，純函式）。
 *
 * ── 比對基準與規則（INTERFACE-stage2.md §4.7）──
 *
 * 基準是 `blog_law_refs.article_text`（種子腳本存的是「」內逐字、多項換行，
 * 行首有「第1項：」這種不帶空格的前綴）。文章引文有自己的格式
 *（「第 1 項：」帶空格前綴、可能節錄），所以**不做整包位元組比對**：
 *
 * 1. 只比 moj 型出處；lawQuote 沒有 moj 出處 → skipped。
 * 2. 參照庫查無該條 → missing（取數在 actions 端，這裡只做純比對）。
 * 3. 每個引文段落去掉開頭的「第 N 項：」前綴、trim 後，必須**逐字出現在**
 *    ref 的行集合裡（多個 moj 出處時取聯集）——全部找得到 → match；
 *    有找不到的 → diff，找不到的段落列進 diffParagraphs。
 *
 * 🔴 任何結果都不影響存檔——護欄審 AI，不審書亞。
 */
import type {
  BlogDocJson,
  BlogInline,
  BlogLawQuoteNode,
  BlogParagraphNode
} from "@/content/blocks/types";

/** 去掉段落開頭的「第 N 項：」前綴（文章自己的格式，容許有無空格兩種寫法）。 */
export function stripItemPrefix(text: string): string {
  return text.replace(/^第\s*[0-9０-９]+\s*項\s*[:：]\s*/, "").trim();
}

/** 行內 runs 併回純文字（比對用；粗體、連結都只看字）。 */
export function inlineText(runs: readonly BlogInline[] | undefined): string {
  return (runs ?? []).map((run) => run.text).join("");
}

/** 引文段落陣列 → 純文字陣列（空段落略過）。 */
export function quoteParagraphTexts(paragraphs: readonly BlogParagraphNode[]): string[] {
  return paragraphs.map((p) => inlineText(p.content)).filter((text) => text.trim() !== "");
}

/**
 * 參照庫 article_text → 正規化後的行集合。
 * 每行同樣剝掉「第N項：」前綴再 trim，讓兩邊在同一個座標系比。
 */
export function refLineSet(articleTexts: readonly string[]): string[] {
  const lines: string[] = [];
  for (const text of articleTexts) {
    for (const raw of text.split("\n")) {
      const line = stripItemPrefix(raw);
      if (line !== "") lines.push(line);
    }
  }
  return lines;
}

/**
 * 單一段落有沒有「逐字出現」在行集合裡。
 * 引文可能是節錄（段尾的「…」是文章自己的格式），所以除了整行相等，
 * 也接受「段落是某一行的逐字子字串」；節錄符號「…」先剝掉再比。
 */
function paragraphFoundInLines(paragraph: string, lines: readonly string[]): boolean {
  const needle = stripItemPrefix(paragraph).replace(/…+$/, "").trim();
  if (needle === "") return true;
  return lines.some((line) => line === needle || line.includes(needle));
}

/**
 * 一個 lawQuote 對一組參照條文的比對（不碰 DB；取數由 actions 端做完傳進來）。
 * `articleTexts` 是該區塊所有 moj 出處查到的 article_text（查無的不放進來）。
 */
export function compareQuoteToRefs(
  quote: BlogLawQuoteNode,
  articleTexts: readonly string[]
): { state: "match" | "diff"; diffParagraphs: string[] } {
  const lines = refLineSet(articleTexts);
  const diffParagraphs = quoteParagraphTexts(quote.content).filter(
    (paragraph) => !paragraphFoundInLines(paragraph, lines)
  );
  return diffParagraphs.length === 0
    ? { state: "match", diffParagraphs: [] }
    : { state: "diff", diffParagraphs };
}

/** 從正文撈出全部 lawQuote 節點（頂層即可——契約裡 lawQuote 只出現在頂層）。 */
export function collectLawQuotes(doc: BlogDocJson): BlogLawQuoteNode[] {
  return doc.content.filter((node): node is BlogLawQuoteNode => node.type === "lawQuote");
}
