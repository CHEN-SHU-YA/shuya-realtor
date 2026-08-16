"use client";

/**
 * 出處連結的顯示（lawQuote 標示列與 sourceLine 卡片共用）。
 * moj 型的網址用 mojLawUrl(pcode, flno) 現組（網址不存、不可手打——護欄第 4 條）；
 * url 型直接用存的 href。
 *
 * 「開新視窗核對」是**看得見的字**，不是只藏在 tooltip——方案書情境一的文案
 * 是三段式「這一段是法條逐字｜出處：民法 第 787 條｜開新視窗核對」，第三段要顯示出來。
 * 只有一條出處時照方案書排成「{出處}｜開新視窗核對」；多條時每條後面各掛一個
 * 「（開新視窗核對）」，才分得清核對的是哪一條。
 */
import { mojLawUrl, type BlogLawSourceRef } from "@/content/blocks/types";

function sourceHref(source: BlogLawSourceRef): string {
  return source.kind === "moj" ? mojLawUrl(source.pcode, source.flno) : source.href;
}

export default function SourceRefLinks({ sources }: { sources: readonly BlogLawSourceRef[] }) {
  if (!sources.length) return <span className="bae-muted">尚未填出處</span>;

  if (sources.length === 1) {
    const source = sources[0];
    const href = sourceHref(source);
    return (
      <>
        <a href={href} target="_blank" rel="noopener">
          {source.text || href}
        </a>
        <span className="bae-bar-sep">｜</span>
        <a href={href} target="_blank" rel="noopener">
          開新視窗核對
        </a>
      </>
    );
  }

  return (
    <>
      {sources.map((source, index) => {
        const href = sourceHref(source);
        return (
          <span key={`${href}-${index}`}>
            {index > 0 ? "、" : null}
            <a href={href} target="_blank" rel="noopener">
              {source.text || href}
            </a>
            <a href={href} target="_blank" rel="noopener" className="bae-checklink">
              （開新視窗核對）
            </a>
          </span>
        );
      })}
    </>
  );
}
