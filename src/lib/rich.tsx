/**
 * 後台文案裡的簡易標記。
 *
 * 只做兩件事，刻意不做更多：
 *   **兩個星號包起來** → 重點（標題會變綠色、內文會變粗體）
 *   換行（Enter）      → 真的換行
 *
 * ── 為什麼不給他一個所見即所得編輯器 ──
 *
 * 那種編輯器會讓人貼進一堆 Word 帶來的樣式，把整個版面弄壞，
 * 而且壞掉的是**對客戶的門面**，通常要等別人講才發現。
 * 兩個星號學一次就會，能做到的破壞上限也只有「這幾個字變粗」。
 *
 * ⚠️ 這裡回傳的是 React 元素，不是 HTML 字串 ——
 * 用 dangerouslySetInnerHTML 的話，後台被亂貼一段 <script> 就變成資安問題。
 * React 會自動把文字當文字處理，貼什麼進去都只是字。
 */
import { Fragment, type ReactNode } from "react";

/** 把 `**重點**` 切出來，奇數段就是被星號包住的部分 */
function splitMarks(text: string): { text: string; strong: boolean }[] {
  return text.split("**").map((part, index) => ({ text: part, strong: index % 2 === 1 }));
}

/** 內文用：重點變 <strong>，換行變 <br /> */
export function rich(text: string): ReactNode {
  return text.split("\n").map((line, lineIndex, lines) => (
    <Fragment key={lineIndex}>
      {splitMarks(line).map((part, index) =>
        part.strong ? <strong key={index}>{part.text}</strong> : <Fragment key={index}>{part.text}</Fragment>
      )}
      {lineIndex < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

/** 大標題用：重點套 .hl（首頁那個綠色底線效果），換行變 <br /> */
export function richHeading(text: string): ReactNode {
  return text.split("\n").map((line, lineIndex, lines) => (
    <Fragment key={lineIndex}>
      {splitMarks(line).map((part, index) =>
        part.strong ? (
          <span className="hl" key={index}>{part.text}</span>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        )
      )}
      {lineIndex < lines.length - 1 ? <br /> : null}
    </Fragment>
  ));
}

/** 純文字用（SEO 描述、圖片說明這種不能有標記的地方）：把星號拿掉、換行換成空格 */
export function plain(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\s*\n\s*/g, " ").trim();
}
